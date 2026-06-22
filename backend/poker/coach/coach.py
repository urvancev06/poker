"""The coach: honest, computed advice for the hero's current spot.

Everything here is *computed* (classifier + Monte Carlo equity + exact pot odds)
and labelled by basis (computed math vs assumption about villain ranges). It
never states exact GTO frequencies — where those matter it defers to GTO Wizard
(STRATEGY.md §7 / PROJECT.md §3,§7).

Villain ranges are *modelled*, not known: each live bot is assumed to hold the
top X% of hands for its archetype (a stated assumption, X below). This is the
honest "what I'm estimating against", not a solver output.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..bots.preflop_strength import top_fraction
from ..math.cards import Combo
from ..math.classify import Draw, classify
from ..math.equity import equity
from ..math.odds import analyze_call
from ..math.ranges import parse_token

# Modelled preflop looseness per archetype (fraction of all combos). A stated
# assumption for the equity estimate, not a solver range.
ARCHETYPE_RANGE_PCT = {
    "Nit": 0.12,
    "TAG": 0.22,
    "LAG": 0.32,
    "Calling Station": 0.50,
    "Maniac": 0.62,
}
_DEFAULT_PCT = 0.30


@dataclass
class VillainModel:
    seat: int
    archetype: str
    range_pct: float
    combos: int


@dataclass
class Coaching:
    hand_label: str
    made_tier: str
    draws: list[str]
    equity_pct: float
    win_pct: float
    tie_pct: float
    lose_pct: float
    to_call: int
    pot: int
    required_equity_pct: float | None
    pot_odds: str | None
    call_ev: float | None
    villains: list[VillainModel]
    verdict: str
    rationale: str
    basis: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "hand_label": self.hand_label,
            "made_tier": self.made_tier,
            "draws": self.draws,
            "equity_pct": self.equity_pct,
            "win_pct": self.win_pct,
            "tie_pct": self.tie_pct,
            "lose_pct": self.lose_pct,
            "to_call": self.to_call,
            "pot": self.pot,
            "required_equity_pct": self.required_equity_pct,
            "pot_odds": self.pot_odds,
            "call_ev": self.call_ev,
            "villains": [v.__dict__ for v in self.villains],
            "verdict": self.verdict,
            "rationale": self.rationale,
            "basis": self.basis,
        }


def _villain_range(archetype: str, dead: set[str]) -> list[Combo]:
    pct = ARCHETYPE_RANGE_PCT.get(archetype, _DEFAULT_PCT)
    combos: set = set()
    for name in top_fraction(pct):
        combos |= parse_token(name)
    return [c for c in combos if c[0] not in dead and c[1] not in dead]


def _suggest(
    can_check: bool,
    tier_name: str,
    is_strong: bool,
    is_draw: bool,
    equity_frac: float,
    required: float | None,
    villain_desc: str,
) -> tuple[str, str]:
    """A candid verdict + rationale, derived from the computed numbers. ``is_strong``
    means a real value hand (two pair or better)."""
    pct = f"{equity_frac * 100:.0f}%"
    if can_check:
        if is_strong:
            return ("Bet for value.", f"You have {tier_name} (~{pct} equity) — bet to get value while ahead.")
        if is_draw:
            return ("Bet as a semi-bluff, or check.", "A draw with fold equity can bet; otherwise take the free card.")
        return ("Check / give up.", "No made hand and no real draw — don't bet without a reason.")

    # facing a bet
    assert required is not None
    req = f"{required * 100:.0f}%"
    margin = equity_frac - required
    if equity_frac >= 0.78:
        return ("Raise for value.", f"{tier_name}, ~{pct} equity vs {villain_desc} — you're way ahead; raise to get value, don't just call.")
    if is_strong and equity_frac > 0.62:
        return ("Raise or call for value.", f"{tier_name}, ~{pct} vs the ~{req} you need — clearly ahead; raise for value, at least call.")
    if margin >= 0.05:
        return ("Call.", f"~{pct} equity beats the ~{req} you need — a clear call.")
    if margin >= -0.02:
        return ("Marginal call.", f"~{pct} vs ~{req} needed — borderline; confirm exact frequencies in GTO Wizard.")
    return ("Fold.", f"~{pct} equity is below the ~{req} you need vs {villain_desc} — fold.")


def build_coaching(session, trials: int = 4000) -> Coaching:
    """Compute coaching for the hero's current decision. Requires the hero to act."""
    if not session.hero_to_act:
        raise RuntimeError("coaching is only available when it's the hero's turn")

    state = session.state()
    hero_seat = session.hero_seat
    hole = state.seats[hero_seat].hole_cards
    assert hole is not None
    board = list(state.board)
    legal = state.legal_actions
    assert legal is not None

    hc = classify(hole, board)
    is_strong = hc.made.value >= 3  # two pair or better — a value hand
    is_draw = Draw.FLUSH_DRAW in hc.draws or Draw.OPEN_ENDED in hc.draws

    dead = set(hole) | set(board)
    villain_seats = session.live_villain_seats()
    villain_models: list[VillainModel] = []
    ranges = []
    for s in villain_seats:
        arch = session.archetype_at_seat(s)
        combos = _villain_range(arch, dead)
        ranges.append(combos)
        villain_models.append(
            VillainModel(
                seat=s,
                archetype=arch,
                range_pct=round(ARCHETYPE_RANGE_PCT.get(arch, _DEFAULT_PCT) * 100, 1),
                combos=len(combos),
            )
        )

    if ranges:
        eq = equity(hole, board, ranges, trials=trials, seed=0)
        equity_frac = eq.equity
        win, tie, lose = eq.win, eq.tie, eq.lose
    else:  # no live villains (shouldn't happen when hero is to act) -> trivially ahead
        equity_frac, win, tie, lose = 1.0, 1.0, 0.0, 0.0

    to_call = legal.call_amount
    can_check = legal.can_check
    if to_call > 0:
        analysis = analyze_call(call=to_call, pot=state.total_pot, equity=equity_frac)
        required = analysis.required_equity
        pot_odds = f"{state.total_pot / to_call:.1f} : 1"
        call_ev = round(analysis.call_ev, 1) if analysis.call_ev is not None else None
        required_pct: float | None = round(required * 100, 1)
    else:
        required = None
        pot_odds = None
        call_ev = None
        required_pct = None

    if len(villain_models) == 1:
        villain_desc = f"{villain_models[0].archetype}'s modelled range"
    elif villain_models:
        villain_desc = f"the {len(villain_models)} modelled ranges"
    else:
        villain_desc = "the field"

    verdict, rationale = _suggest(
        can_check, hc.label or hc.made.name.lower(), is_strong, is_draw, equity_frac, required, villain_desc
    )

    return Coaching(
        hand_label=hc.label or hc.made.name.replace("_", " ").lower(),
        made_tier=hc.made.name,
        draws=[d.value for d in hc.draws],
        equity_pct=round(equity_frac * 100, 1),
        win_pct=round(win * 100, 1),
        tie_pct=round(tie * 100, 1),
        lose_pct=round(lose * 100, 1),
        to_call=to_call,
        pot=state.total_pot,
        required_equity_pct=required_pct,
        pot_odds=pot_odds,
        call_ev=call_ev,
        villains=villain_models,
        verdict=verdict,
        rationale=rationale,
        basis=[
            "Hand classification and equity are computed (Monte Carlo, treys).",
            "Pot odds and required equity are exact arithmetic.",
            "Villain ranges are modelled (top-X% per archetype), an assumption — not a solver output.",
            "For exact GTO frequencies, confirm in GTO Wizard.",
        ],
    )
