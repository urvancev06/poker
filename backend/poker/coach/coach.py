"""The coach: honest, computed advice for the hero's current spot.

Everything here is *computed* (classifier + Monte Carlo equity + exact pot odds)
and labelled by basis: computed math vs assumption about villain ranges. It never
states exact GTO frequencies; where those matter it defers to GTO Wizard
(STRATEGY.md §7).

Villain ranges are *modelled*, not known, and *action-conditioned*: each live bot
starts from the top-X% of hands for its archetype, which villain_model.py then
narrows and strengthens by the bets/calls they've actually made this hand, with
bluff frequencies measured from the bots themselves. Equity against the static
preflop range would inflate hero equity on later streets, which is the structural
cause of over-calling.

Decision model (the important part): we do NOT compare *raw* equity to pot odds.
Raw (showdown) equity is only what you collect when the hand checks down for
free, which essentially only happens facing a river bet or an all-in. With money
still behind, out of position, or multiway you realize *less* than your raw equity
(you get bet off hands, play guessing games OOP). So we compare *realized* equity
= raw × R to the price, where R is an equity-realization factor (position /
hand-type / multiway). When the action closes (river or all-in) there is no future
betting, R = 1, and raw-equity-vs-pot-odds is exactly correct.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..math.classify import Draw, MadeTier, PairStrength, classify, pair_strength
from ..math.equity import equity
from ..math.odds import analyze_call, implied_required_equity, required_equity
from .villain_model import BET_COMPOSITION, condition_range, villain_line

# As later streets carry the "they're strong" signal in the action-conditioned
# villain range, the realization discount shrinks toward 1 (don't double-count it).
_STREET_WEIGHT = {"preflop": 1.0, "flop": 0.7, "turn": 0.4, "river": 0.0}
_STREET_OF = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}

# Implied / reverse-implied price adjustment. Conservative by design: a missed thin
# call is cheap, whereas a manufactured speculative call is the losing habit this is
# meant to train out. So the implied credit errs to the tight side of the rule-of-15,
# and the reverse-implied penalty fires only on genuinely dominated hands, where it
# can't turn into over-folding.
_SET_MINE_RATE = 0.03      # set-mine implied pot ≈ this × stack-behind (flip ≈ rule-of-15, erring tight)
_DRAW_IMPLIED_MULT = 0.5   # strong-draw implied pot ≈ this × current pot
_REVERSE_MULT = 0.40       # reverse-implied penalty ≈ this × current pot (dominated WEAK pairs only)


def _implied_adjustment(
    *, street: str, is_pocket_pair: bool, is_draw: bool, made_tier: MadeTier,
    pair_str: PairStrength, pot: int, behind: int, action_closed: bool,
) -> tuple[int, str]:
    """Signed extra chips you expect to play for *beyond* the current pot, for the
    implied/reverse price adjustment, capped at the stack behind (you can't win what
    isn't there). Positive = implied odds, negative = reverse implied, 0 when the
    action closes (river/all-in), where the raw price rule is already exact."""
    if action_closed or behind <= 0:
        return 0, ""
    if street == "preflop" and is_pocket_pair:
        # A pair wins a big pot when it flops a set (~1 in 8.5), so the credit scales
        # with the stack behind. The flip point lands near 11x the call: to "close"
        # rather than to a clear call, and tighter than the rule-of-15 shorthand.
        return round(behind * _SET_MINE_RATE), f"set value, {behind} behind"
    if is_draw:
        # The only branch where the stack cap actually binds: whenever the money
        # behind is less than half the pot.
        return min(behind, round(_DRAW_IMPLIED_MULT * pot)), "draw — paid off when you complete"
    if made_tier == MadeTier.PAIR and pair_str is PairStrength.WEAK:
        # A bottom/under pair makes a 2nd-best hand and loses more, so it needs MORE
        # than the headline price. WEAK pairs only: top pair and overpairs are decent
        # enough that this must never talk you off them.
        return -round(_REVERSE_MULT * pot), "reverse implied — dominated"
    return 0, ""


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
    required_equity_pct: float | None      # implied/reverse-adjusted (the decision price)
    required_direct_pct: float | None      # raw pot-odds price, before implied adjustment
    implied_note: str                      # why the price moved (set value / draw / reverse), or ""
    pot_odds: str | None
    call_ev: float | None
    in_position: bool
    action_closed: bool           # river / all-in -> raw equity = realized, pure price spot
    players_behind: int           # live opponents yet to act behind the hero
    villains: list[VillainModel]
    verdict: str
    rationale: str
    tone: str = "neutral"          # good | neutral | close | fold (display only)
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
            "required_direct_pct": self.required_direct_pct,
            "implied_note": self.implied_note,
            "pot_odds": self.pot_odds,
            "call_ev": self.call_ev,
            "in_position": self.in_position,
            "action_closed": self.action_closed,
            "players_behind": self.players_behind,
            "villains": [v.__dict__ for v in self.villains],
            "verdict": self.verdict,
            "rationale": self.rationale,
            "tone": self.tone,
            "basis": self.basis,
        }


# The complete set of verdict strings `_suggest` can emit, mapped to a display tone.
# The frontend reads the tone from here rather than string-parsing the prose, so
# rewording a verdict can't silently render a fold as a recommendation.
# `tests/test_coach.py` asserts the mapping stays exhaustive.
VERDICT_TONE: dict[str, str] = {
    "Bet for value.": "good",
    "Raise for value.": "good",
    "Clear call.": "good",
    "Call.": "good",
    "Thin value bet, or check.": "neutral",
    "Semi-bluff or check.": "neutral",
    "Check.": "neutral",
    "Close — call or fold.": "close",
    "Fold.": "fold",
}


def verdict_tone(verdict: str) -> str:
    """Display tone for a verdict string. An unknown verdict reads as neutral, never
    as a recommendation."""
    return VERDICT_TONE.get(verdict, "neutral")


def _basis(
    *, priced: bool, implied_applied: bool, realization_applied: bool, measured_ranges: bool
) -> list[str]:
    """The honesty labels, bound to what this verdict ACTUALLY computed.

    A label must never claim an adjustment that didn't run, and most of them usually
    don't: the implied term is 0 on every river, every all-in, and every hand that is
    not a preflop pair, a draw or a weak pair, and R is 1.0 whenever the action closes.
    A label that doesn't describe the number beside it defeats the point of labelling."""
    out = ["Hand classification and equity are computed (Monte Carlo, treys)."]
    if priced:
        out.append("Pot odds and required equity are exact arithmetic.")
    if realization_applied:
        out.append(
            "Equity realization (raw → realized) is a rough position/hand-type/street "
            "estimate, not a solver output."
        )
    if implied_applied:
        out.append(
            "The implied / reverse-implied price adjustment is a conservative estimate "
            "— not a solver output."
        )
    if measured_ranges:
        out.append(
            "Villain ranges are action-conditioned: the archetype range narrowed by "
            "their bets/calls this hand (bluff rates measured from the bots)."
        )
    else:
        out.append(
            "Villain ranges use a neutral fallback composition — not measured from "
            "these opponents."
        )
    out.append("For exact GTO frequencies, confirm in GTO Wizard.")
    return out


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
    for hand types that realize poorly (bare high-card air), while strong made
    hands and real draws realize close to fully. The discount then shrinks by
    street (``_STREET_WEIGHT``): on later streets the action-conditioned range
    already encodes "they're strong", so a full R discount would double-count it.
    Deliberately rough rules of thumb, not solver outputs."""
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
    implied_note: str = "",
) -> tuple[str, str]:
    """A candid verdict + rationale derived from the computed numbers. ``is_strong``
    means a real value hand (two pair or better); ``realized`` is raw equity after
    the realization factor. ``required`` already reflects the implied/reverse price
    adjustment; ``implied_note`` explains why it moved."""
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
    imp = f" (price adjusted — {implied_note})" if implied_note else ""
    detail = f"~{raw_pct} raw → ~{real_pct} realized {pos} vs the ~{req} you need to call.{imp}"
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
    pair_str = pair_strength(hole, board) if is_pair else PairStrength.NONE

    dead = set(hole) | set(board)

    # Which opponents do we model equity against? Only those who have actually
    # committed chips to contest this pot (the aggressor + callers whose street bet
    # matches the level the hero faces). Yet-to-act players aren't in the pot yet, and
    # treating them as live ranges systematically under-rates calls. We do still count
    # how many are behind, so the verdict can flag that calling doesn't close the
    # action.
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
        role, postflop = villain_line(state.history, s)
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
        # Implied / reverse-implied odds adjust the PRICE, not the range or realized
        # equity. Capped at the stack behind, and 0 once the action closes.
        effective_behind = min(hero_stack, max((state.seats[s].stack for s in villain_seats), default=0))
        implied_adj, implied_note = _implied_adjustment(
            street=street, is_pocket_pair=(hole[0][0] == hole[1][0]), is_draw=is_draw,
            made_tier=hc.made, pair_str=pair_str, pot=state.total_pot,
            behind=effective_behind, action_closed=action_closed,
        )
        required_direct = required_equity(to_call, state.total_pot)
        required = implied_required_equity(to_call, state.total_pot, implied_adj)  # decision-relevant
        # Call EV is the immediate pot-odds EV on the CURRENT pot (exact arithmetic);
        # implied odds show up in `required`/the verdict, explained by implied_note.
        call_ev = round(analyze_call(call=to_call, pot=state.total_pot, equity=realized).call_ev, 1)
        pot_odds = f"{state.total_pot / to_call:.1f} : 1"
        required_pct: float | None = round(required * 100, 1)
        required_direct_pct: float | None = round(required_direct * 100, 1)
    else:
        required = None
        pot_odds = None
        call_ev = None
        required_pct = None
        required_direct_pct = None
        implied_note = ""

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
        implied_note=implied_note,
    )

    return Coaching(
        hand_label=hc.label or hc.made.name.replace("_", " ").lower(),
        made_tier=hc.made.name,
        draws=[d.value for d in hc.draws],
        # Whole percent only: the second decimal is noise, since equity is sampled
        # and R is a rule of thumb.
        equity_pct=round(equity_frac * 100),
        realized_equity_pct=round(realized * 100),
        realization_pct=round(r * 100),
        win_pct=round(win * 100),
        tie_pct=round(tie * 100),
        lose_pct=round(lose * 100),
        to_call=to_call,
        pot=state.total_pot,
        required_equity_pct=required_pct,
        required_direct_pct=required_direct_pct,
        implied_note=implied_note,
        pot_odds=pot_odds,
        call_ev=call_ev,
        in_position=in_position,
        action_closed=action_closed,
        players_behind=players_behind,
        villains=villain_models,
        verdict=verdict,
        rationale=rationale,
        tone=verdict_tone(verdict),
        basis=_basis(
            priced=to_call > 0,
            implied_applied=bool(implied_note),
            realization_applied=abs(r - 1.0) > 1e-9,
            measured_ranges=all(v.archetype in BET_COMPOSITION for v in villain_models),
        ),
    )
