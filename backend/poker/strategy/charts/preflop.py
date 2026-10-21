"""The v2 preflop charts (§4.6, plan D35): every list and base, and the chart
probabilities per node that the v2 bots (P3.4) and the beta coach both read.

All numbers are initial values for phase-4 calibration: a baseline, not a solver.
A "cut" is a number of combos along an order (see ``order.p_in``). The probability
functions take the persona's dial multipliers as plain floats, so the chart at
``1.0`` everywhere is the baseline chart that STRATEGY.md §2 shows and the coach
teaches.

Three disjoint sets face an open: the value 3-bets always 3-bet, a light 3-bet
order mixes in by a cut, and the flat order skips the value 3-bets, so its base is
a count of flatting combos. The BB's flat cut is its defence target minus the
value 3-bets, so value plus flats lands on the target.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from ...bots.preflop_ranges import RFI_COMBOS
from ...math.ranges import parse_range
from ...math.suits import class_of
from .order import CLASSES, COMBOS_OF, OPEN_ORDER, by_playability, chen, gap_of, kind_of, p_in, ranks_of

POSITIONS: tuple[str, ...] = ("UTG", "MP", "CO", "BTN", "SB", "BB")
EARLY = frozenset({"UTG", "MP"})
# PokerKit acts seat 0 (the SB) first postflop; later in this order is in position.
POSTFLOP_ORDER: tuple[str, ...] = ("SB", "BB", "UTG", "MP", "CO", "BTN")


def _set(text: str) -> tuple[str, ...]:
    """Classes of a range string, best first."""
    return by_playability({class_of(c) for c in parse_range(text)})


def _list(text: str) -> tuple[str, ...]:
    """An ordered list of classes, kept in the written order."""
    return tuple(t.strip() for t in text.split(",") if t.strip())


def in_position(hero: str, villain: str) -> bool:
    """Does ``hero`` act after ``villain`` postflop?"""
    return POSTFLOP_ORDER.index(hero) > POSTFLOP_ORDER.index(villain)


def heroes_after(opener: str) -> tuple[str, ...]:
    """The positions that act after ``opener`` preflop."""
    return POSITIONS[POSITIONS.index(opener) + 1 :]


# --- Facing an open --------------------------------------------------------------
_VALUE_EP = _set("QQ+, AKs, AKo")
_VALUE_LP = _set("JJ+, AQs+, AKo")
VALUE_3BET: dict[str, tuple[str, ...]] = {
    "UTG": _VALUE_EP, "MP": _VALUE_EP, "CO": _VALUE_LP, "BTN": _VALUE_LP, "SB": _VALUE_LP,
}

LIGHT_3BET_ORDER: tuple[str, ...] = _list(
    "A5s, A4s, A3s, A2s, KJs, KTs, QJs, 76s, 65s, A9s, A8s, A7s, A6s, K9s, Q9s, J9s, "
    "T8s, 98s, 87s, 54s, QTs, JTs, T9s, AJo, KQo, ATo, KJo, QJo, K8s, Q8s, J8s, 97s, "
    "86s, 75s, 64s, 53s, A9o, KTo, QTo, JTo"
)

_LIGHT_VS = {"UTG": 8, "MP": 16, "CO": 24, "BTN": 36, "SB": 40}
_LIGHT_OVERRIDE = {("SB", "CO"): 28}
LIGHT_BASE: dict[tuple[str, str], int] = {
    (hero, opener): _LIGHT_OVERRIDE.get((hero, opener), _LIGHT_VS[opener])
    for opener in POSITIONS[:-1]
    for hero in heroes_after(opener)
}

FLAT_ORDER_EARLY: tuple[str, ...] = _list(
    "JJ, TT, AQs, 99, AJs, KQs, 88, ATs, KJs, QJs, JTs, 77, KTs, QTs, T9s, 66, 98s, 55, "
    "87s, 44, 76s, 33, 22, 65s, 54s, AQo, AJo, KQo"
)
_AT_77 = FLAT_ORDER_EARLY.index("77") + 1
_LATE_OFFSUIT = ("AQo", "AJo", "KQo")
FLAT_ORDER_LATE: tuple[str, ...] = tuple(
    [c for c in FLAT_ORDER_EARLY[:_AT_77]]
    + list(_LATE_OFFSUIT)
    + [c for c in FLAT_ORDER_EARLY[_AT_77:] if c not in _LATE_OFFSUIT]
)


def flat_order(opener: str) -> tuple[str, ...]:
    return FLAT_ORDER_EARLY if opener in EARLY else FLAT_ORDER_LATE


SB_FLAT_BASE = 12
_FLAT_VS = {"UTG": 50, "MP": 60, "CO": 100, "BTN": SB_FLAT_BASE}
_FLAT_OVERRIDE = {("BTN", "CO"): 110}
FLAT_BASE: dict[tuple[str, str], int] = {
    (hero, opener): (
        SB_FLAT_BASE if hero == "SB" else _FLAT_OVERRIDE.get((hero, opener), _FLAT_VS[opener])
    )
    for opener in POSITIONS[:-2]
    for hero in heroes_after(opener)
    if hero != "BB"
}


def _bb_defend_key(cls: str) -> tuple:
    hi, lo = ranks_of(cls)
    score = chen(cls)
    if kind_of(cls) == "suited":
        score += 1.5
    if kind_of(cls) != "pair" and gap_of(cls) <= 1 and lo >= 4:
        score += 1.0
    return (-score, OPEN_ORDER.index(cls))


BB_DEFEND_ORDER: tuple[str, ...] = tuple(sorted(CLASSES, key=_bb_defend_key))
BB_DEFEND_TARGET: dict[str, float] = {"UTG": 0.25, "MP": 0.28, "CO": 0.38, "BTN": 0.50, "SB": 0.58}

# --- Limped pots ----------------------------------------------------------------
BB_ISO_VALUE = _set("TT+, AQs+, AKo")
ISO_SHRINK = 0.7
PREMIUM = _set("QQ+, AKs, AKo, JJ, AQs")  # never limped (44 combos)

# --- Facing a 3-bet, 4-bet, 5-bet -----------------------------------------------
FOURBET_VALUE = _set("QQ+, AKs, AKo")
FOURBET_VALUE_VS_EP = _set("KK+, AKs")
FOURBET_BLUFF: tuple[str, ...] = ("A5s", "A4s")
FOURBET_BLUFF_RATE = 0.15  # P(4-bet bluff) = min(cap, rate × threebet dial)
FOURBET_BLUFF_CAP = 0.6
JAM_VS_4BET = _set("KK+, AKs")
CONTINUE_VS_4BET = _set("QQ, AKo")
CONTINUE_VS_4BET_PRICE = 0.38
# The call cut is this share of the opener's own opening cut (4-bets included).
# Owner decision (c), 2026-10: out of position is 0.42, not the spec's 0.35, which
# left a TAG folding 64-65% out of position, above the §5 reg band (45-62%). At
# the TAG mean this gives 54-55% in position and 57-58% out of position.
CALL_3BET_FRAC: dict[str, float] = {"ip": 0.45, "oop": 0.42}

# --- Squeeze and cold 4-bet ------------------------------------------------------
SQUEEZE_VALUE = _set("QQ+, AKs, AKo")
SQUEEZE_BLUFF: tuple[str, ...] = ("A5s", "A4s")
SQUEEZE_BLUFF_P = 0.5  # × threebet dial, capped at 1
SQUEEZE_FLAT = 0.6     # flat cut multiplier with callers in
COLD_4BET = _set("KK+, AKs")
COLD_CALL_3BET_ORDER: tuple[str, ...] = ("QQ", "JJ", "AKo", "AQs")
COLD_CALL_3BET_BASE = 18

# --- Stacks and sizes ------------------------------------------------------------
SMALL_PAIRS = _set("66-22")
SMALL_PAIR_STACK_X = 18  # flat only when the effective stack ≥ 18 × the call
OPEN_SIZE_REF_BB = 2.5
OPEN_SIZE_EXP = 0.8
SHORT_STACK_BB = 25


def size_factor(open_size_bb: float | None) -> float:
    """``k = min(1, (2.5bb/open)^0.8)``: a bigger open shrinks the cuts facing it."""
    if not open_size_bb or open_size_bb <= OPEN_SIZE_REF_BB:
        return 1.0
    return (OPEN_SIZE_REF_BB / open_size_bb) ** OPEN_SIZE_EXP


def open_cut(pos: str, open_mult: float = 1.0, limpers: int = 0) -> float:
    """Combos along OPEN_ORDER that open (or iso-raise over ``limpers``) from ``pos``."""
    return RFI_COMBOS.get(pos, 0) * open_mult * ISO_SHRINK**limpers


def unopened_probs(pos: str, *, open_mult: float = 1.0, limpers: int = 0) -> dict[str, float]:
    """P(enter) per class when no one has raised. The BB over limpers raises
    BB_ISO_VALUE and checks the rest; folded to the BB, nothing enters."""
    if pos == "BB":
        return {c: (1.0 if limpers and c in BB_ISO_VALUE else 0.0) for c in CLASSES}
    cut = open_cut(pos, open_mult, limpers)
    return {c: p_in(c, OPEN_ORDER, cut) for c in CLASSES}


def vs_open_probs(
    hero: str,
    opener: str,
    *,
    threebet: float = 1.0,
    call: float = 1.0,
    k: float = 1.0,
    callers: int = 0,
) -> dict[str, tuple[float, float]]:
    """(P(3-bet), P(call)) per class facing one open; with ``callers`` it is a squeeze."""
    if callers:
        value = set(SQUEEZE_VALUE)
        light_p = min(1.0, SQUEEZE_BLUFF_P * threebet)
        p3 = {c: 1.0 if c in value else (light_p if c in SQUEEZE_BLUFF else 0.0) for c in CLASSES}
        flat_mult = SQUEEZE_FLAT
    else:
        value = set(VALUE_3BET[opener])
        light_cut = LIGHT_BASE[(hero, opener)] * threebet * k
        p3 = {c: 1.0 if c in value else p_in(c, LIGHT_3BET_ORDER, light_cut) for c in CLASSES}
        flat_mult = 1.0
    if hero == "BB":
        order = tuple(c for c in BB_DEFEND_ORDER if c not in value)
        cut = BB_DEFEND_TARGET[opener] * 1326 * call * k * flat_mult - sum(COMBOS_OF[c] for c in value)
    else:
        order = tuple(c for c in flat_order(opener) if c not in value)
        cut = FLAT_BASE[(hero, opener)] * call * k * flat_mult
    return {c: (p3[c], (1.0 - p3[c]) * p_in(c, order, cut)) for c in CLASSES}


def vs_3bet_probs(
    opener: str,
    threebettor: str,
    *,
    open_mult: float = 1.0,
    call: float = 1.0,
    threebet: float = 1.0,
) -> dict[str, tuple[float, float]]:
    """(P(4-bet), P(call)) per class for the opener facing a 3-bet. The call cut is
    a fraction of the opener's own opening cut, so a wide opener defends wider."""
    value = set(FOURBET_VALUE_VS_EP if threebettor in EARLY else FOURBET_VALUE)
    bluff_p = min(FOURBET_BLUFF_CAP, FOURBET_BLUFF_RATE * threebet)
    frac = CALL_3BET_FRAC["ip" if in_position(opener, threebettor) else "oop"]
    cut = frac * open_cut(opener, open_mult) * call
    out: dict[str, tuple[float, float]] = {}
    for c in CLASSES:
        p4 = 1.0 if c in value else (bluff_p if c in FOURBET_BLUFF else 0.0)
        out[c] = (p4, (1.0 - p4) * p_in(c, OPEN_ORDER, cut))
    return out


def fold_to_3bet(
    opener: str,
    threebettor: str,
    *,
    open_mult: float = 1.0,
    call: float = 1.0,
    threebet: float = 1.0,
) -> float:
    """Combo-weighted share of the opener's opening range (weighted by P(open))
    that folds to a 3-bet: the chart-level fold-to-3-bet."""
    opens = unopened_probs(opener, open_mult=open_mult)
    resp = vs_3bet_probs(opener, threebettor, open_mult=open_mult, call=call, threebet=threebet)
    total = sum(COMBOS_OF[c] * opens[c] for c in CLASSES)
    folds = sum(COMBOS_OF[c] * opens[c] * (1.0 - resp[c][0] - resp[c][1]) for c in CLASSES)
    return folds / total


def cold_vs_3bet_probs(*, call: float = 1.0) -> dict[str, tuple[float, float]]:
    """(P(cold 4-bet), P(cold call)) per class facing an open and a 3-bet."""
    cut = COLD_CALL_3BET_BASE * call
    return {
        c: (1.0, 0.0) if c in COLD_4BET else (0.0, p_in(c, COLD_CALL_3BET_ORDER, cut)) for c in CLASSES
    }


def vs_4bet_probs(price: float) -> dict[str, tuple[float, float]]:
    """(P(jam), P(call)) per class facing a 4-bet at direct price ``price``."""
    cont = price <= CONTINUE_VS_4BET_PRICE
    return {
        c: (1.0, 0.0) if c in JAM_VS_4BET else (0.0, 1.0 if cont and c in CONTINUE_VS_4BET else 0.0)
        for c in CLASSES
    }


def members(probs: Mapping[str, float], threshold: float = 0.5) -> tuple[str, ...]:
    """Classes with probability at least ``threshold``, best first."""
    return by_playability(c for c, p in probs.items() if p >= threshold)


# --- Chart advice (the beta coach and History read the same chart) ---------------
@dataclass(frozen=True)
class ChartAdvice:
    """The baseline chart's play for one class at one node (all dials 1.0).

    ``action`` is ``"raise"`` (an open or iso), ``"3bet"``, ``"4bet"``, ``"jam"``,
    ``"call"``, ``"check"`` or ``"fold"``; ``chart`` names the chart the hand is in
    (``"UTG open"``, ``"value 3-bet vs CO"``, ...) and is ``""`` for a fold;
    ``p`` is the chart probability of that action."""

    action: str
    chart: str
    p: float


def chart_advice(
    cls: str,
    hero: str,
    node: str,
    *,
    opener: str | None = None,
    threebettor: str | None = None,
    limpers: int = 0,
    callers: int = 0,
    open_size_bb: float | None = None,
    price: float | None = None,
) -> ChartAdvice:
    """The baseline chart action for ``cls`` at ``node`` (``"unopened"``,
    ``"vs_open"``, ``"vs_3bet"``, ``"cold_vs_3bet"``, ``"vs_4bet"`` or ``"vs_5bet"``).
    A hand mixing near a cut takes the likelier action."""
    if node == "unopened":
        p = unopened_probs(hero, limpers=limpers)[cls]
        if hero == "BB":
            return ChartAdvice("raise", "BB raise over limpers", 1.0) if p >= 0.5 else ChartAdvice("check", "", 1.0)
        name = f"{hero} iso-raise over {limpers} limper{'s' if limpers > 1 else ''}" if limpers else f"{hero} open"
        return ChartAdvice("raise", name, p) if p >= 0.5 else ChartAdvice("fold", "", 1.0 - p)
    if node == "vs_open":
        assert opener is not None
        p3, p_call = vs_open_probs(hero, opener, k=size_factor(open_size_bb), callers=callers)[cls]
        if callers:
            label3 = "squeeze value" if cls in SQUEEZE_VALUE else "squeeze bluff"
        else:
            label3 = f"{'value' if cls in VALUE_3BET[opener] else 'light'} 3-bet vs {opener}"
        label_call = f"BB defence vs {opener}" if hero == "BB" else f"flat vs {opener}"
        return _likeliest(("3bet", label3, p3), ("call", label_call, p_call))
    if node == "vs_3bet":
        assert opener is not None and threebettor is not None
        p4, p_call = vs_3bet_probs(opener, threebettor)[cls]
        label4 = "4-bet bluff" if cls in FOURBET_BLUFF else "value 4-bet"
        side = "in position" if in_position(opener, threebettor) else "out of position"
        return _likeliest(("4bet", label4, p4), ("call", f"call a 3-bet {side}", p_call))
    if node == "cold_vs_3bet":
        p4, p_call = cold_vs_3bet_probs()[cls]
        return _likeliest(("4bet", "cold 4-bet", p4), ("call", "cold call vs 3-bet", p_call))
    if node in ("vs_4bet", "vs_5bet"):
        p_jam, p_call = vs_4bet_probs(price if price is not None else 1.0)[cls]
        if node == "vs_5bet":
            p_call = 0.0
        return _likeliest(("jam", "jam vs 4-bet", p_jam), ("call", "continue vs 4-bet", p_call))
    raise ValueError(f"unknown preflop node {node!r}")


def _likeliest(*options: tuple[str, str, float]) -> ChartAdvice:
    fold = 1.0 - sum(p for _, _, p in options)
    action, chart, p = max(options, key=lambda o: o[2])
    if p >= fold:
        return ChartAdvice(action, chart, p)
    return ChartAdvice("fold", "", fold)


# STRATEGY.md §2 markers (D28) for the rendered block.
MD_START = "<!-- charts:v2:start -->"
MD_END = "<!-- charts:v2:end -->"
