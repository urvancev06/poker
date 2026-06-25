"""The coach: honest, computed advice for the hero's current spot.

Everything here is *computed* (classifier + Monte Carlo equity + exact pot odds)
and labelled by basis (computed math vs assumption about villain ranges). It
never states exact GTO frequencies — where those matter it defers to GTO Wizard
(STRATEGY.md §7 / PROJECT.md §3,§7).

Villain ranges are *modelled*, not known, and *action-conditioned*: each live bot
starts from the top-X% of hands for its archetype, then we narrow and strengthen
it by the bets/calls they've actually made this hand (villain_model.py), with the
bluff frequencies measured from the bots themselves. Computing equity against the
static preflop range would inflate hero equity on later streets — the structural
cause of over-calling. This is the honest "what I'm estimating against", not a
solver output.

Decision model (the important part): we do NOT compare *raw* equity to pot odds.
Raw (showdown) equity is only what you collect when the hand checks down for free
— which essentially only happens facing a river bet or an all-in. With money
still behind, out of position, or multiway, you realize *less* than your raw
equity (you get bet off hands, play guessing games OOP, etc.). So we compare
*realized* equity = raw × R to the price, where R is an equity-realization factor
(position / hand-type / multiway). When the action closes (river or all-in) there
is no future betting, R = 1, and raw-equity-vs-pot-odds is exactly correct.
This is the fix for the old "always fold" / "always call" swings: those came from
treating raw equity as if it were realized.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..math.classify import Draw, MadeTier, classify
from ..math.equity import equity
from ..math.odds import analyze_call
from .villain_model import condition_range

# As later streets carry the "they're strong" signal in the action-conditioned
# villain range, the realization discount shrinks toward 1 (don't double-count it).
_STREET_WEIGHT = {"preflop": 1.0, "flop": 0.7, "turn": 0.4, "river": 0.0}
_STREET_OF = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}
_ACTION_RANK = {"check": 0, "call": 1, "bet": 2, "raise": 3}


@dataclass
class VillainModel:
    seat: int
    archetype: str
    combos: int
    description: str          # the action-conditioned read, e.g. "TAG, barreled turn → ~top 9%"
    bluff_pct: float          # air share of this villain's range (the bluff-catch threshold)


@dataclass
class Coaching:
    hand_label: str
    made_tier: str
    draws: list[str]
    equity_pct: float
    realized_equity_pct: float
    realization_pct: float        # R × 100 (how much of raw equity we expect to realize)
    win_pct: float
    tie_pct: float
    lose_pct: float
    to_call: int
    pot: int
    required_equity_pct: float | None
    pot_odds: str | None
    call_ev: float | None
    in_position: bool
    action_closed: bool           # river / all-in -> raw equity = realized, pure price spot
    players_behind: int           # live opponents yet to act behind the hero
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
            "realized_equity_pct": self.realized_equity_pct,
            "realization_pct": self.realization_pct,
            "win_pct": self.win_pct,
            "tie_pct": self.tie_pct,
            "lose_pct": self.lose_pct,
            "to_call": self.to_call,
            "pot": self.pot,
            "required_equity_pct": self.required_equity_pct,
            "pot_odds": self.pot_odds,
            "call_ev": self.call_ev,
            "in_position": self.in_position,
            "action_closed": self.action_closed,
            "players_behind": self.players_behind,
            "villains": [v.__dict__ for v in self.villains],
            "verdict": self.verdict,
            "rationale": self.rationale,
            "basis": self.basis,
        }


def _villain_line(history, seat: int) -> tuple[str, dict[str, str]]:
    """Reconstruct a villain's line this hand from the action history: their
    preflop role ("3bet+"/"raise"/"call"/"passive") and their strongest action on
    each postflop street — the inputs the conditioned range is built from."""
    pre_raises = 0
    raised_depth = 0
    called_pre = False
    postflop: dict[str, str] = {}
    for e in history:
        is_me = e.seat == seat
        if e.street == "preflop" and e.action in ("bet", "raise"):
            pre_raises += 1
            if is_me:
                raised_depth = pre_raises
        if not is_me:
            continue
        if e.street == "preflop":
            if e.action == "call":
                called_pre = True
        else:
            cur = postflop.get(e.street)
            if cur is None or _ACTION_RANK.get(e.action, 0) > _ACTION_RANK.get(cur, -1):
                postflop[e.street] = e.action
    role = "3bet+" if raised_depth >= 2 else "raise" if raised_depth == 1 else "call" if called_pre else "passive"
    return role, postflop


def _realization_factor(
    *,
    is_strong: bool,
    is_pair: bool,
    is_draw: bool,
    in_position: bool,
    num_opponents: int,
    players_behind: int = 0,
    street: str = "flop",
    action_closed: bool,
) -> float:
    """How much of raw equity we expect to actually realize (R). 1.0 when the
    action closes (river / all-in: nothing left to lose equity to). Otherwise
    discounted for being OOP, multiway, having players still to act behind, and
    for hand types that realize poorly (bare high-card air) — while strong made
    hands and real draws realize close to fully. The discount then shrinks by
    street (``_STREET_WEIGHT``): on later streets the action-conditioned range
    already encodes "they're strong", so a full R discount would double-count it.
    Deliberately rough, honest rules of thumb — not solver outputs."""
    if action_closed:
        return 1.0
    r = 1.0
    if not in_position:
        r *= 0.90
    if num_opponents >= 2:
        r *= 0.88  # multiway: someone usually has a piece; marginal hands realize less
    if players_behind:
        r *= max(0.80, 1.0 - 0.05 * players_behind)  # yet-to-act players can still raise you off it
    if is_strong:
        r *= 1.0
    elif is_draw:
        r *= 0.98  # draws roughly hold up: implied odds + semi-bluff fold equity
    elif is_pair:
        r *= 0.90
    else:
        r *= 0.78  # bare high card / air realizes poorly with money behind
    r = max(0.5, min(r, 1.0))
    return 1.0 - (1.0 - r) * _STREET_WEIGHT.get(street, 0.6)


def _suggest(
    *,
    can_check: bool,
    tier_name: str,
    is_strong: bool,
    is_draw: bool,
    equity_frac: float,
    realized: float,
    required: float | None,
    in_position: bool,
    action_closed: bool,
    villain_desc: str,
    players_behind: int,
) -> tuple[str, str]:
    """A candid verdict + rationale derived from the computed numbers. ``is_strong``
    means a real value hand (two pair or better); ``realized`` is raw equity after
    the realization factor."""
    raw_pct = f"{equity_frac * 100:.0f}%"
    real_pct = f"{realized * 100:.0f}%"

    if can_check:  # no bet to face — a betting/checking decision, not a price one
        if is_strong:
            return ("Bet for value.", f"You have {tier_name} (~{raw_pct} equity) — bet to get value while ahead.")
        if is_draw:
            return (
                "Semi-bluff or check.",
                "A draw can bet (fold equity now + outs if called), or take a free card — both are fine.",
            )
        if equity_frac >= 0.60 and in_position:
            return ("Thin value bet, or check.", f"~{raw_pct} equity in position — a small value bet works; checking is safe.")
        return ("Check.", "No made hand and no real draw — check; don't bet without a reason.")

    # Facing a bet.
    assert required is not None
    req = f"{required * 100:.0f}%"
    behind_note = (
        f" Note: {players_behind} still to act behind you, so calling doesn't close the action."
        if players_behind
        else ""
    )

    # A genuinely strong made hand that's well ahead: raise, don't just call.
    if is_strong and equity_frac >= 0.72:
        return (
            "Raise for value.",
            f"{tier_name}, ~{raw_pct} vs {villain_desc} — well ahead; raise to get value rather than just call.",
        )

    if action_closed:
        # River / all-in: no more betting, so raw equity IS realized — compare it
        # to the price directly. This is the one spot the naive rule is correct.
        margin = equity_frac - required
        base = f"~{raw_pct} equity vs the ~{req} you need, and there's no more betting — a pure price decision."
        if margin >= 0.04:
            return ("Call.", f"{base} You're getting the price.{behind_note}")
        if margin >= -0.03:
            return (
                "Close — call or fold.",
                f"{base} It's borderline on price; it comes down to how often they're bluffing here. "
                f"Confirm exact frequencies in GTO Wizard.{behind_note}",
            )
        return ("Fold.", f"{base} You're not being priced in.{behind_note}")

    # Money still behind: judge on *realized* equity, not raw.
    pos = "in position" if in_position else "out of position"
    margin = realized - required
    detail = f"~{raw_pct} raw → ~{real_pct} realized {pos} vs the ~{req} you need to call."
    if margin >= 0.12:
        return ("Clear call.", f"{detail} Comfortably ahead of the price.{behind_note}")
    if margin >= 0.03:
        return ("Call.", f"{detail}{behind_note}")
    if margin >= -0.03:
        return (
            "Close — call or fold.",
            f"{detail} Borderline; lean on your read of how often they bluff this line. "
            f"Confirm in GTO Wizard.{behind_note}",
        )
    return ("Fold.", f"{detail} Below the price once you account for how much of it you'll actually realize.{behind_note}")


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
    is_strong = hc.made.value >= MadeTier.TWO_PAIR  # two pair or better — a value hand
    is_pair = hc.made == MadeTier.PAIR
    is_draw = Draw.FLUSH_DRAW in hc.draws or Draw.OPEN_ENDED in hc.draws

    dead = set(hole) | set(board)

    # Which opponents do we model equity against? Only those who have actually
    # committed chips to contest this pot (the aggressor + callers whose street
    # bet matches the level the hero faces) — not players sitting behind. Counting
    # yet-to-act blinds as tight live ranges systematically under-rated calls (the
    # old "always fold" bug); but we DO remember how many are still behind so the
    # verdict can flag that a call doesn't close the action.
    all_live = session.live_villain_seats()
    villain_seats = all_live
    players_behind = 0
    if legal.call_amount > 0:
        level = state.seats[hero_seat].bet + legal.call_amount
        contesting = [s for s in all_live if state.seats[s].bet >= level]
        players_behind = sum(1 for s in all_live if state.seats[s].bet < level)
        if contesting:
            villain_seats = contesting

    villain_models: list[VillainModel] = []
    ranges = []
    for s in villain_seats:
        arch = session.archetype_at_seat(s)
        role, postflop = _villain_line(state.history, s)
        cr = condition_range(arch, board, role, postflop, dead)
        ranges.append(cr.combos)
        villain_models.append(
            VillainModel(
                seat=s,
                archetype=arch,
                combos=len(cr.combos),
                description=cr.description,
                bluff_pct=round(cr.bluff_fraction * 100, 1),
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

    # Position (for the rest of the hand, i.e. postflop order: lower seat acts
    # first). Hero is in position if it acts after every modelled opponent.
    in_position = all(hero_seat > s for s in villain_seats) if villain_seats else True

    # Does calling close the action? On the river a call ends the hand, and if the
    # hero (or every contesting villain) is all-in there is no more betting — in
    # all of these, raw equity is fully realized (R = 1).
    hero_stack = state.seats[hero_seat].stack
    is_river = len(board) == 5
    all_villains_allin = bool(villain_seats) and all(state.seats[s].stack == 0 for s in villain_seats)
    action_closed = to_call > 0 and (is_river or to_call >= hero_stack or all_villains_allin)

    street = _STREET_OF.get(len(board), "flop")
    r = _realization_factor(
        is_strong=is_strong,
        is_pair=is_pair,
        is_draw=is_draw,
        in_position=in_position,
        num_opponents=len(villain_seats),
        players_behind=players_behind,
        street=street,
        action_closed=action_closed,
    )
    realized = equity_frac * r

    if to_call > 0:
        # Required equity is exact pot-odds arithmetic (independent of our hand).
        # Call EV uses *realized* equity so it agrees with the verdict — it's what
        # you actually expect to make, not the raw-equity overestimate.
        analysis = analyze_call(call=to_call, pot=state.total_pot, equity=realized)
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
        can_check=can_check,
        tier_name=hc.label or hc.made.name.lower(),
        is_strong=is_strong,
        is_draw=is_draw,
        equity_frac=equity_frac,
        realized=realized,
        required=required,
        in_position=in_position,
        action_closed=action_closed,
        villain_desc=villain_desc,
        players_behind=players_behind,
    )

    return Coaching(
        hand_label=hc.label or hc.made.name.replace("_", " ").lower(),
        made_tier=hc.made.name,
        draws=[d.value for d in hc.draws],
        # Round the Monte-Carlo / heuristic figures to whole percent — the second
        # decimal is noise (R is a rule of thumb, equity is sampled).
        equity_pct=round(equity_frac * 100),
        realized_equity_pct=round(realized * 100),
        realization_pct=round(r * 100),
        win_pct=round(win * 100),
        tie_pct=round(tie * 100),
        lose_pct=round(lose * 100),
        to_call=to_call,
        pot=state.total_pot,
        required_equity_pct=required_pct,
        pot_odds=pot_odds,
        call_ev=call_ev,
        in_position=in_position,
        action_closed=action_closed,
        players_behind=players_behind,
        villains=villain_models,
        verdict=verdict,
        rationale=rationale,
        basis=[
            "Hand classification and equity are computed (Monte Carlo, treys).",
            "Pot odds and required equity are exact arithmetic.",
            "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
            "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
            "For exact GTO frequencies, confirm in GTO Wizard.",
        ],
    )
