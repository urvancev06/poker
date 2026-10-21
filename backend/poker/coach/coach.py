"""The coach: honest, computed advice for the hero's current spot.

Everything here is *computed* (the hole-aware classifier, equity v2 and exact pot
odds) and labelled by basis: computed math vs assumption about villain ranges. Equity
is exact heads-up and two-way after the flop (every runout counted), comes from the
precomputed preflop table heads-up preflop, and is sampled (seeded by the decision,
with its standard error) otherwise; the basis names the method that ran. It never
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
from itertools import combinations

from ..math.cards import FULL_DECK
# The hole-aware labeller (P2.3), shared with the review. The v1 bots, the villain
# model and BET_COMPOSITION (scripts/measure_bet_ranges.py, via
# villain_model.bet_category) keep classify_legacy.
from ..math.classify import Draw, HandClass, MadeTier, PairStrength, classify, pair_strength
from ..math.odds import analyze_call, implied_required_equity, required_equity
from .villain_model import BET_COMPOSITION, condition_range, villain_line
from .villains import EQUITY_SAMPLES, decision_key, select_villains, villain_equity

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

# Equity against the villain's modelled range at which the hero is far enough ahead to
# build the pot rather than just call. Deliberately independent of the made tier: a big
# overpair crushes a c-betting range as thoroughly as two pair does, and gating value
# lines on tier alone talks the coach out of raising its own best hands.
_VALUE_EQUITY = 0.72

# Every two-card holding, for the fallback when no modelled combo is left open.
_ANY_TWO = tuple(combinations(FULL_DECK, 2))


def _bb(chips: int, big_blind: int) -> str:
    """Chips as big blinds for the coach's text, one decimal at most (exact for
    whole chips at 1/2 and 5/10): 975 at 10 -> "97.5 bb", 1000 -> "100 bb"."""
    return f"{chips / big_blind:,.1f}".removesuffix(".0") + " bb"


def _implied_adjustment(
    *, street: str, is_pocket_pair: bool, is_draw: bool, made_tier: MadeTier,
    pair_str: PairStrength, pot: int, behind: int, action_closed: bool, big_blind: int,
) -> tuple[int, str]:
    """Signed extra chips you expect to play for *beyond* the current pot, for the
    implied/reverse price adjustment, capped at the stack behind (you can't win what
    isn't there). Positive = implied odds, negative = reverse implied, 0 when the
    action closes (river/all-in), where the raw price rule is already exact. The
    note says why, with any amount in big blinds."""
    if action_closed or behind <= 0:
        return 0, ""
    if street == "preflop" and is_pocket_pair:
        # A pair wins a big pot when it flops a set (~1 in 8.5), so the credit scales
        # with the stack behind. The flip point lands near 11x the call: to "close"
        # rather than to a clear call, and tighter than the rule-of-15 shorthand.
        return round(behind * _SET_MINE_RATE), f"set value, {_bb(behind, big_blind)} behind"
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


@dataclass(frozen=True)
class HandFlags:
    """What the price model reads from the hero's hand, from the hole-aware class:
    a board pair or a board-made hand is not the hero's. Shared with the review."""

    is_strong: bool        # the hole makes two pair or better: a value hand
    is_pair: bool          # the hole makes exactly one pair
    is_draw: bool          # a flush draw or an open-ender that needs a hole card
    pair_str: PairStrength  # where the hero's own pair sits (NONE without one)
    tier: MadeTier         # the hole's own tier (``HandClass.hole_tier``)


def hand_flags(hc: HandClass, hole, board) -> HandFlags:
    is_pair = hc.hole_tier == MadeTier.PAIR
    return HandFlags(
        is_strong=hc.hole_tier >= MadeTier.TWO_PAIR,
        is_pair=is_pair,
        is_draw=Draw.FLUSH_DRAW in hc.draws or Draw.OPEN_ENDED in hc.draws,
        pair_str=pair_strength(hole, board) if is_pair else PairStrength.NONE,
        tier=hc.hole_tier,
    )


def equity_basis(method: str, se_pct: float | None) -> str:
    """The basis line for the equity method that ran. Sampled equity states its
    95% interval, 1.96 standard errors in percentage points."""
    if method == "exact":
        return "Equity is exact: every runout is counted."
    if method == "preflop_table":
        return "Preflop equity comes from a precomputed table (±0.4 pp)."
    return f"Equity is sampled (±{1.96 * (se_pct or 0.0):.1f} pp)."


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
    action_closed: bool           # calling ends the betting -> raw equity = realized, pure price spot
    players_behind: int           # opponents who still act after the hero calls or checks
    villains: list[VillainModel]
    verdict: str
    rationale: str
    tone: str = "neutral"          # good | neutral | close | fold (display only)
    basis: list[str] = field(default_factory=list)
    # What a call can win: the hero's chips plus each opponent's up to the hero's
    # total (side pots). None when the spot carries no engine facts.
    winnable: int | None = None
    big_blind: int = 2
    closes_on_call: bool | None = None  # nobody acts after a call (betting may go on)
    # How the equity was computed: "exact" (every runout), "sampled" (seeded joint
    # sampling, ``equity_se_pct`` its standard error in percentage points) or
    # "preflop_table" (heads-up preflop; the table's own error is about 0.4 pp).
    equity_method: str = "exact"
    equity_se_pct: float | None = None
    hole_tier: str = "HIGH_CARD"   # the hole's own part (``made_tier`` counts the board)

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
            "winnable": self.winnable,
            "big_blind": self.big_blind,
            "closes_on_call": self.closes_on_call,
            "equity_method": self.equity_method,
            "equity_se_pct": self.equity_se_pct,
            "hole_tier": self.hole_tier,
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
    *, priced: bool, implied_applied: bool, realization_applied: bool, measured_ranges: bool,
    equity_method: str = "exact", equity_se_pct: float | None = None,
) -> list[str]:
    """The honesty labels, bound to what this verdict ACTUALLY computed.

    A label must never claim an adjustment that didn't run, and most of them usually
    don't: the implied term is 0 on every river, every all-in, and every hand that is
    not a preflop pair, a draw or a weak pair, and R is 1.0 whenever the action closes.
    A label that doesn't describe the number beside it defeats the point of labelling."""
    out = ["Hand classification is computed from your cards and the board.", equity_basis(equity_method, equity_se_pct)]
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
    can_bet: bool = True,
    can_raise: bool = True,
) -> tuple[str, str]:
    """A candid verdict + rationale derived from the computed numbers. ``is_strong``
    means a real value hand by tier (two pair or better) — it opens a value bet on its
    own, but it is not required for one, since ``equity_frac`` past ``_VALUE_EQUITY``
    does too. ``realized`` is raw equity after the realization factor. ``required``
    already reflects the implied/reverse price adjustment; ``implied_note`` explains why
    it moved. ``can_bet``/``can_raise`` are the engine's legal actions, so the verdict
    can never name a line the engine would reject."""
    raw_pct = f"{equity_frac * 100:.0f}%"
    real_pct = f"{realized * 100:.0f}%"

    if can_check:  # no bet to face — a betting/checking decision, not a price one
        if not can_bet:
            return ("Check.", "Betting is closed here — there is nothing to bet into, so check.")
        if is_strong or equity_frac >= _VALUE_EQUITY:
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

    # Far enough ahead to build the pot rather than just call — whether the strength is
    # in the made tier or in the equity itself. Only when a raise is legal: facing an
    # all-in, or with every villain already all-in, calling is the most the hero can do.
    if equity_frac >= _VALUE_EQUITY and can_raise:
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


def build_coaching(session, trials: int | None = None) -> Coaching:
    """Compute coaching for the hero's current decision. Requires the hero to act.

    ``trials`` is the sample count of the sampled equity methods (default
    ``villains.EQUITY_SAMPLES``, the review's too); exact methods ignore it."""
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
    flags = hand_flags(hc, hole, board)
    is_strong, is_pair, is_draw = flags.is_strong, flags.is_pair, flags.is_draw

    dead = set(hole) | set(board)

    # Which opponents do we model equity against? Only those who have actually
    # committed chips to contest this pot (the aggressor + callers whose street bet
    # matches the level the hero faces). Yet-to-act players aren't in the pot yet, and
    # treating them as live ranges systematically under-rates calls. We do still count
    # how many act behind, so the verdict can flag that calling doesn't close the
    # action.
    #
    # The engine's decision facts (``state.facts``) say who acts after a call and
    # whether a call ends the betting, and the ledger says what a call can win
    # (side pots included). Spots built without an engine (the scripted coach
    # battery) carry no facts and fall back to deriving the same from the seats.
    #
    # The selection is shared with the review (``villains.select_villains``).
    facts = getattr(state, "facts", None)
    level = state.seats[hero_seat].bet + legal.call_amount if legal.call_amount > 0 else 0
    villain_seats, players_behind = select_villains(
        session.live_villain_seats(),
        [seat.bet for seat in state.seats],
        level,
        facts.to_act_after_call if facts is not None else None,
    )

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

    # Seeded by the decision, so the review of this decision samples the same draws.
    key = decision_key(
        getattr(session, "session_id", None) or "local", getattr(session, "hand_index", 0), len(state.history)
    )
    measured_ranges = all(v.archetype in BET_COMPOSITION for v in villain_models)
    eq = villain_equity(hole, board, ranges, key=key, samples=trials or EQUITY_SAMPLES)
    if eq is None and villain_seats:
        # No modelled combo is left open (every range blocked, or the ranges cannot
        # all be held at once): fall back to any two cards for each villain, and
        # say the ranges are not the modelled ones.
        any_two = [list(_ANY_TWO)] * len(villain_seats)
        eq = villain_equity(hole, board, any_two, key=key, samples=trials or EQUITY_SAMPLES)
        measured_ranges = False
    if eq is not None:
        equity_frac = eq.equity
        win, tie, lose = eq.win, eq.tie, eq.lose
        equity_method = eq.method
        equity_se_pct = None if eq.se is None else round(eq.se * 100, 2)
    else:  # no live villains (shouldn't happen when hero is to act) -> trivially ahead
        equity_frac, win, tie, lose = 1.0, 1.0, 0.0, 0.0
        equity_method, equity_se_pct = "exact", None

    to_call = facts.to_call if facts is not None else legal.call_amount
    can_check = legal.can_check
    # What calling can win (pot after the call, capped by side pots).
    winnable = facts.winnable_if_call if facts is not None else state.total_pot + to_call

    # Position (for the rest of the hand, i.e. postflop order: lower seat acts
    # first). Hero is in position if it acts after every modelled opponent.
    in_position = all(hero_seat > s for s in villain_seats) if villain_seats else True

    # Does calling close the action? On the river a call ends the hand, and if the
    # hero (or every contesting villain) is all-in there is no more betting — in
    # all of these, raw equity is fully realized (R = 1).
    hero_stack = state.seats[hero_seat].stack
    if facts is not None:
        # A fact, not a guess: nobody acts after the call and no later street has
        # betting (the river, or at most one player left with chips).
        action_closed = to_call > 0 and facts.betting_over_after_call
    else:
        is_river = len(board) == 5
        all_villains_allin = bool(villain_seats) and all(state.seats[s].stack == 0 for s in villain_seats)
        action_closed = to_call > 0 and (is_river or to_call >= hero_stack or all_villains_allin)
    # A call that puts the hero all-in ends the hero's betting even when others can
    # still bet a side pot: it can win or lose nothing more, so its equity counts in
    # full and no implied term moves the price. The text still follows action_closed.
    price_closed = action_closed or (to_call > 0 and to_call >= hero_stack)

    street = _STREET_OF.get(len(board), "flop")
    r = _realization_factor(
        is_strong=is_strong,
        is_pair=is_pair,
        is_draw=is_draw,
        in_position=in_position,
        num_opponents=len(villain_seats),
        players_behind=players_behind,
        street=street,
        action_closed=price_closed,
    )
    realized = equity_frac * r

    if to_call > 0:
        # Implied / reverse-implied odds adjust the PRICE, not the range or realized
        # equity. Capped at the stack behind, and 0 once the action closes.
        # The pot the call plays for: everything it can win except its own chips.
        # Equal to the pot unless a side pot caps it (a short stack can only win
        # each opponent's chips up to its own total).
        pot_for_call = winnable - to_call
        effective_behind = min(hero_stack, max((state.seats[s].stack for s in villain_seats), default=0))
        implied_adj, implied_note = _implied_adjustment(
            street=street, is_pocket_pair=(hole[0][0] == hole[1][0]), is_draw=is_draw,
            made_tier=flags.tier, pair_str=flags.pair_str, pot=pot_for_call,
            behind=effective_behind, action_closed=price_closed,
            big_blind=int(state.blinds[1]),
        )
        required_direct = required_equity(to_call, pot_for_call)
        required = implied_required_equity(to_call, pot_for_call, implied_adj)  # decision-relevant
        # Call EV is the immediate pot-odds EV on what the call can win (exact
        # arithmetic); implied odds show up in `required`/the verdict, explained by
        # implied_note.
        call_ev = round(analyze_call(call=to_call, pot=pot_for_call, equity=realized).call_ev, 1)
        pot_odds = f"{pot_for_call / to_call:.1f} : 1"
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
        can_bet=legal.can_bet,
        can_raise=legal.can_raise,
    )

    return Coaching(
        hand_label=hc.label or hc.made.name.replace("_", " ").lower(),
        made_tier=hc.made.name,
        draws=[d.value for d in hc.draws],
        # One decimal, as the review reports them: equity is exact or seeded by the
        # decision, so the review of this decision shows the same figures.
        equity_pct=round(equity_frac * 100, 1),
        realized_equity_pct=round(realized * 100, 1),
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
            measured_ranges=measured_ranges,
            equity_method=equity_method,
            equity_se_pct=equity_se_pct,
        ),
        winnable=winnable if facts is not None else None,
        big_blind=int(state.blinds[1]),
        closes_on_call=facts.closes_on_call if facts is not None else None,
        equity_method=equity_method,
        equity_se_pct=equity_se_pct,
        hole_tier=hc.hole_tier.name,
    )
