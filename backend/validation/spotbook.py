"""The spot book (P3.10, design §5 L3): hand-written spots, each with an expected
probability interval per type, evaluated on the type means (plus a row's leaks).

The bounds are initial and the owner reviews them; every illogical play the owner
reports later becomes a new row. ``evaluate_spot(row, type_key)`` deals the row
with ``scenario`` and measures the persona's exact distribution (no sampling).
Bounds compare with a tolerance of ``TOL``, so "≤ .00" means below 0.001.

Measures:
    fold, continue, call      P(fold), 1 − P(fold), P(call)
    raise                     P(raise) + P(jam) facing a bet
    raise_as_jam              the same, counted only when none of it is a non-jam raise
    bet                       P(bet) + P(jam) with no bet faced
    open, threebet            raise + jam, preflop
    enter                     1 − P(fold) − P(check)
    range_fold                over the hero's own preflop-line range (its type
                              mean's weights, dead board cards removed): the
                              weighted mean of P(fold)
    range_bet_air             the same over the range's air combos (no pair of
                              the hole's own, no draw), for P(bet) + P(jam)
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from poker.bots.personas import LeakSpec, Persona
from poker.math.cards import FULL_DECK
from poker.math.classify import MadeTier
from poker.math.vector import COMBOS
from poker.strategy.dials import type_mean
from poker.strategy.policy import policy
from poker.strategy.postflop import draw_class
from poker.strategy.preflop import preflop_range_weights
from poker.strategy.private import build_private
from poker.strategy.scenario import scenario
from poker.strategy.spot import Spot, build_spot
from poker.strategy.types import ActionDist, Kind

TOL = 0.001
TYPE_CODES = {"N": "nit", "T": "tag", "L": "lag", "S": "station", "M": "maniac"}
ALL = "NTLSM"
MEASURES = frozenset({
    "fold", "continue", "call", "raise", "raise_as_jam", "bet", "open", "threebet", "enter",
    "range_fold", "range_bet_air",
})
RANGE = "(range)"


@dataclass(frozen=True)
class SpotDef:
    id: str
    note: str
    hero: str
    board: str
    hero_pos: str
    line: tuple[str, ...]
    measure: str
    bounds: dict[str, tuple[float, float]]
    leaks: tuple[tuple[str, float], ...] = ()
    stacks_bb: float | dict[str, float] = 100
    n: int = 6
    # A bound measured from another value: (row id, or None for this row without
    # its leaks; scale; shift; "lo" or "hi"): that side = scale × value + shift.
    ref: tuple[str | None, float, float, str] | None = None


def _b(types: str, lo: float = 0.0, hi: float = 1.0) -> dict[str, tuple[float, float]]:
    return {TYPE_CODES[t]: (lo, hi) for t in types}


def ge(types: str, x: float) -> dict[str, tuple[float, float]]:
    return _b(types, lo=x)


def le(types: str, x: float) -> dict[str, tuple[float, float]]:
    return _b(types, hi=x)


def _checks(*pos: str) -> tuple[str, ...]:
    return tuple(f"{p} check" for p in pos)


def _to_river(*pos: str) -> tuple[str, ...]:
    """Checked flop and turn (after the "flop" marker), up to the river marker."""
    return (*_checks(*pos), "turn", *_checks(*pos), "river")


SRP = ("BTN raise 2.5", "BB call", "flop")
HU_RIVER = (*SRP, *_to_river("BB", "BTN"))
CO3 = ("CO raise 2.5", "BTN call", "BB call", "flop", *_to_river("BB", "CO", "BTN"))

SPOTS: tuple[SpotDef, ...] = (
    SpotDef("sb01", "underpair on a double-paired-looking A-A river vs pot", "4s4h", "AsAd9d3c6s", "BTN",
            (*CO3, "BB check", "CO bet 1.0"), "fold", ge("TN", 0.90)),
    SpotDef("sb02", "fours under a K-K board vs a river pot bet", "4s4h", "KsKh9d2c7s", "BB",
            (*HU_RIVER, "BB check", "BTN bet 1.0"), "fold", ge("T", 0.90)),
    SpotDef("sb03", "the same fours never raise", "4s4h", "KsKh9d2c7s", "BB",
            (*HU_RIVER, "BB check", "BTN bet 1.0"), "raise", le("TNL", 0.0)),
    SpotDef("sb04", "flush draw vs a half-pot c-bet", "Jh4h", "9h7h2c", "BB",
            (*SRP, "BB check", "BTN bet 0.5"), "continue", ge("TL", 0.85)),
    SpotDef("sb05", "nut flush vs a min river bet (floor)", "Ah2c", "Kh9h6h3hJs", "BB",
            (*HU_RIVER, "BB check", "BTN bet 0.02"), "fold", le(ALL, 0.0)),
    SpotDef("sb06", "top pair vs a crumb river bet", "KsJd", "Kh7c2d9s4h", "BB",
            (*HU_RIVER, "BB check", "BTN bet 0.005"), "continue", ge("T", 0.95)),
    SpotDef("sb07", "top pair vs a 3x-pot river jam", "KsJd", "Kh7c2d9s4h", "BB",
            (*HU_RIVER, "BB check", "BTN jam"), "fold", ge("T", 0.50), stacks_bb={"BTN": 19}),
    SpotDef("sb08", "AA in the BB raises a limper", "AsAh", "", "BB", ("UTG call",), "raise", ge(ALL, 0.90)),
    SpotDef("sb09", "the BTN open range folds to a BB 3-bet", RANGE, "", "BTN",
            ("BTN raise 2.5", "BB raise 10"), "range_fold", _b("T", 0.45, 0.62)),
    SpotDef("sb10", "88 flats a CO open on the BTN", "8s8d", "", "BTN", ("CO raise 2.5",), "call", ge("T", 0.50)),
    SpotDef("sb11", "KQs continues vs a CO open", "KsQs", "", "BTN", ("CO raise 2.5",), "continue", ge("T", 0.95)),
    SpotDef("sb12", "middle pair does not donk", "9s8s", "Kd9c4h", "BB", SRP, "bet", le("T", 0.10)),
    SpotDef("sb13", "BTN air c-bets a dry K-high flop heads-up", RANGE, "Kh7d2c", "BTN",
            (*SRP, "BB check"), "range_bet_air", _b("T", 0.45, 0.80)),
    SpotDef("sb14", "a station calls top pair vs a river pot bet", "Ks9d", "Kd7c4h2s8c", "BB",
            (*HU_RIVER, "BB check", "BTN bet 1.0"), "continue", ge("S", 0.90)),
    SpotDef("sb15", "a station folds seven-high to a 2x-pot jam", "7c6d", "AsKdQh9c2s", "BB",
            (*HU_RIVER, "BB check", "BTN jam"), "fold", ge("S", 0.95), stacks_bb={"BTN": 13.5}),
    SpotDef("sb16", "AA opens UTG", "AsAd", "", "UTG", (), "open", ge(ALL, 0.99)),
    SpotDef("sb17", "72o never opens UTG", "7c2d", "", "UTG", (), "open",
            {**le("NTLS", 0.02), **le("M", 0.10)}),
    SpotDef("sb18", "98s opens UTG for a TAG", "9s8s", "", "UTG", (), "open", ge("T", 0.50)),
    SpotDef("sb19", "87s does not open UTG for a nit", "8s7s", "", "UTG", (), "open", le("N", 0.05)),
    SpotDef("sb20", "K2s opens the BTN", "Ks2s", "", "BTN", (), "open", ge("T", 0.50)),
    SpotDef("sb21", "72o folds the BTN", "7c2d", "", "BTN", (), "open", le("T", 0.05)),
    SpotDef("sb22", "a maniac plays 72o on the BTN", "7c2d", "", "BTN", (), "enter", ge("M", 0.80)),
    SpotDef("sb23", "66 rarely flats the SB vs a BTN open", "6s6d", "", "SB", ("BTN raise 2.5",), "call",
            le("T", 0.20)),
    SpotDef("sb24", "QQ 3-bets a UTG open", "QsQd", "", "CO", ("UTG raise 2.5",), "threebet", ge("T", 0.95)),
    SpotDef("sb25", "JJ mostly flats a UTG open", "JsJd", "", "CO", ("UTG raise 2.5",), "threebet",
            le("T", 0.20)),
    SpotDef("sb26", "JJ continues vs a UTG open", "JsJd", "", "CO", ("UTG raise 2.5",), "continue",
            ge("T", 0.90)),
    SpotDef("sb27", "JJ 3-bets a CO open on the BTN", "JsJd", "", "BTN", ("CO raise 2.5",), "threebet",
            ge("T", 0.95)),
    SpotDef("sb28", "K7s defends the BB vs a BTN open", "Ks7s", "", "BB", ("BTN raise 2.5",), "continue",
            ge("T", 0.80)),
    SpotDef("sb29", "72o folds the BB to a UTG open", "7c2d", "", "BB", ("UTG raise 2.5",), "fold",
            ge("T", 0.98)),
    SpotDef("sb30", "A5s 3-bets the BB vs a BTN open", "As5s", "", "BB", ("BTN raise 2.5",), "threebet",
            ge("T", 0.90)),
    SpotDef("sb31", "AKo 4-bets a BTN 3-bet", "AsKd", "", "UTG", ("UTG raise 2.5", "BTN raise 7.5"), "raise",
            ge("T", 0.90)),
    SpotDef("sb32", "AA never folds to a 5-bet jam", "AsAh", "", "CO",
            ("CO raise 2.5", "BTN raise 7.5", "CO raise 16.5", "BTN jam"), "fold", le(ALL, 0.0)),
    SpotDef("sb33", "KK 5-bets a 4-bet", "KsKh", "", "BTN", ("CO raise 2.5", "BTN raise 7.5", "CO raise 16.5"),
            "raise", ge("T", 0.95)),
    SpotDef("sb34", "KK at 18bb 3-bets all-in", "KsKh", "", "BTN", ("CO raise 2.5",), "raise_as_jam",
            ge("T", 0.95), stacks_bb=18),
    SpotDef("sb35", "44 at 12bb never flats", "4s4d", "", "BTN", ("CO raise 2.5",), "call", le("T", 0.0),
            stacks_bb=12),
    SpotDef("sb36", "top set never folds to a small c-bet", "7s7d", "7hKd2c", "BB",
            (*SRP, "BB check", "BTN bet 0.33"), "fold", le(ALL, 0.02)),
    SpotDef("sb37", "an overpair continues vs a small c-bet", "QsQd", "8h5c2d", "BB",
            (*SRP, "BB check", "BTN bet 0.33"), "continue", ge("TNLS", 0.95)),
    SpotDef("sb38", "the nut straight never folds to a jam (floor)", "JsTs", "6h7d8c9sKh", "BB",
            (*HU_RIVER, "BB check", "BTN bet 0.75", "BB raise 3x", "BTN jam"), "fold", le(ALL, 0.0)),
    SpotDef("sb39", "a combo draw continues vs a half-pot c-bet", "Th9h", "8h7c2d", "BB",
            (*SRP, "BB check", "BTN bet 0.5"), "continue", ge("TL", 0.90)),
    SpotDef("sb40", "a nit gives up queen-high vs a turn barrel", "Qh2h", "Ah9c5d3s", "BB",
            (*SRP, "BB check", "BTN bet 0.5", "BB call", "turn", "BB check", "BTN bet 1.0"), "fold",
            ge("N", 0.80)),
    SpotDef("sb41", "deuces fold to a river 2x overbet", "2s2d", "AhKd8c5s3h", "BB",
            (*HU_RIVER, "BB check", "BTN bet 2.0"), "fold", ge("T", 0.80)),
    SpotDef("sb42", "top pair folds to a river raise", "AsQd", "AhJc7d4s2c", "BB",
            (*SRP, "BB check", "BTN bet 0.33", "BB call", "turn", "BB check", "BTN check", "river",
             "BB bet 0.75", "BTN raise 3x"), "fold", ge("T", 0.80)),
    SpotDef("sb43", "a set may 4-bet the flop", "4s4h", "AhKc4d", "BB",
            (*SRP, "BB check", "BTN bet 0.5", "BB raise 3x", "BTN raise 3x"), "raise", ge("T", 0.30)),
    SpotDef("sb44", "one pair never reraises", "AsJd", "AhKc4d", "BB",
            (*SRP, "BB check", "BTN bet 0.5", "BB raise 3x", "BTN raise 3x"), "raise", le(ALL, 0.0)),
    SpotDef("sb45", "multiway air c-bets far less than heads-up", RANGE, "Kh7d2c", "BTN",
            ("BTN raise 2.5", "SB call", "BB call", "flop", "SB check", "BB check"), "range_bet_air",
            _b("T"), ref=("sb13", 0.45, 0.0, "hi")),
    SpotDef("sb46", "river air when checked to", RANGE, "9d6c2h4s7c", "BTN", (*HU_RIVER, "BB check"),
            "range_bet_air", {**ge("M", 0.40), **le("N", 0.12)}),
    SpotDef("sb47", "top pair bets the flop when checked to", "KsJd", "Kh7d2c", "BTN", (*SRP, "BB check"),
            "bet", ge("T", 0.80)),
    SpotDef("sb48", "middle pair checks the river back", "8s7s", "Kh8d2c5s3h", "BTN", (*HU_RIVER, "BB check"),
            "bet", le("T", 0.20)),
    SpotDef("sb49", "a station calls bottom pair vs half pot", "3s2s", "Kh3d8c", "BB",
            (*SRP, "BB check", "BTN bet 0.5"), "continue", ge("S", 0.80)),
    SpotDef("sb50", "a nit folds middle pair to a turn pot bet", "9c8c", "Kh9d4c2s", "BB",
            (*SRP, "BB check", "BTN bet 0.33", "BB call", "turn", "BB check", "BTN bet 1.0"), "fold",
            ge("N", 0.70)),
    SpotDef("sb51", "a nut flush draw c-bets", "Ah5h", "Kh9h2c", "BTN", (*SRP, "BB check"), "bet",
            ge("T", 0.45)),
    SpotDef("sb52", "fit-or-fold folds ace-high", "Ah3c", "Kd9s4h", "BB", (*SRP, "BB check", "BTN bet 0.33"),
            "fold", ge("T", 0.95), leaks=(("fit_or_fold", 1.0),)),
    SpotDef("sb53", "can't-fold-a-pair calls bottom pair", "4s3s", "Kd9s4h7c2d", "BB",
            (*HU_RIVER, "BB check", "BTN bet 1.0"), "fold", le("T", 0.30), leaks=(("cant_fold_pair", 1.0),)),
    SpotDef("sb54", "scared money folds top pair to a pot bet", "KsJd", "Kh7c2d9s4h", "BB",
            (*HU_RIVER, "BB check", "BTN bet 1.0"), "fold", _b("T"), leaks=(("scared_money", 1.0),),
            ref=(None, 1.0, 0.20, "lo")),
    SpotDef("sb55", "a passive monster never raises", "7s7d", "7hKd2c", "BB",
            (*SRP, "BB check", "BTN bet 0.33"), "raise", le("S", 0.0), leaks=(("passive_monster", 1.0),)),
    SpotDef("sb56", "auto-c-bet bets its air", RANGE, "Kh7d2c", "BTN", (*SRP, "BB check"), "range_bet_air",
            ge("T", 0.90), leaks=(("auto_cbet", 1.0),)),
    SpotDef("sb57", "spewy river bluffs a missed draw", "QhJh", "9h8h2c3d5s", "BTN",
            (*SRP, "BB check", "BTN check", "turn", "BB check", "BTN check", "river", "BB check"), "bet",
            _b("L"), leaks=(("spewy_river", 1.0),), ref=(None, 2.0, 0.0, "lo")),
    SpotDef("sb58", "AA opens the SB", "AsAh", "", "SB", (), "open", ge(ALL, 0.95)),
    SpotDef("sb59", "KK 4-bets a squeeze-free 3-bet", "KsKd", "", "BB", ("UTG raise 2.5", "MP raise 7.5"),
            "raise", ge("T", 0.95)),
    SpotDef("sb60", "Broadway never folds the turn (floor)", "AsKs", "QcJhTd2s", "BB",
            (*SRP, "BB check", "BTN bet 0.5", "BB call", "turn", "BB check", "BTN bet 0.75"), "fold",
            le(ALL, 0.0)),
)

BY_ID: dict[str, SpotDef] = {s.id: s for s in SPOTS}


def _p(dist: ActionDist, *kinds: Kind) -> float:
    return sum(v for c, v in dist.items() if c.kind in kinds)


def measure(name: str, dist: ActionDist, spot: Spot) -> float:
    if name == "fold":
        return _p(dist, Kind.FOLD)
    if name == "continue":
        return 1.0 - _p(dist, Kind.FOLD)
    if name == "call":
        return _p(dist, Kind.CALL)
    if name in ("raise", "open", "threebet"):
        return _p(dist, Kind.RAISE, Kind.JAM, Kind.BET)
    if name == "raise_as_jam":
        return _p(dist, Kind.JAM) if _p(dist, Kind.RAISE, Kind.BET) == 0 else 0.0
    if name == "bet":
        return _p(dist, Kind.BET, Kind.JAM)
    if name == "enter":
        return 1.0 - _p(dist, Kind.FOLD, Kind.CHECK)
    raise ValueError(f"unknown measure {name!r}")


def persona_for(row: SpotDef, type_key: str, with_leaks: bool = True) -> Persona:
    leaks = tuple(LeakSpec(n, i) for n, i in row.leaks) if with_leaks else ()
    return Persona(f"{row.id}:{type_key}", type_key, type_mean(type_key), leaks)


def build(row: SpotDef) -> Spot:
    hero = "" if row.hero == RANGE else row.hero
    return build_spot(scenario(hero, row.board, hero_pos=row.hero_pos, line=list(row.line), n=row.n,
                               stacks_bb=row.stacks_bb))


def _range_value(row: SpotDef, spot: Spot, persona: Persona) -> float:
    weights = preflop_range_weights(persona.dials, spot, spot.seat, spot.board)
    num = den = 0.0
    for (a, b), w in zip(COMBOS.tolist(), weights):
        if w <= 0:
            continue
        hole = (FULL_DECK[a], FULL_DECK[b])
        priv = build_private(spot, hole)
        if row.measure == "range_bet_air":
            own_pair = priv.hand.hole_tier >= MadeTier.PAIR
            if own_pair or draw_class(priv.draws, spot.street, False) is not None:
                continue
        dist, _ = policy(spot, priv, persona)
        p = _p(dist, Kind.FOLD) if row.measure == "range_fold" else _p(dist, Kind.BET, Kind.JAM)
        num += w * p
        den += w
    return num / den if den else float("nan")


@lru_cache(maxsize=1024)
def _evaluate(row_id: str, type_key: str, with_leaks: bool) -> float:
    row = BY_ID[row_id]
    spot = build(row)
    persona = persona_for(row, type_key, with_leaks)
    if row.hero == RANGE:
        return _range_value(row, spot, persona)
    priv = build_private(spot, (row.hero[:2], row.hero[2:]))
    dist, _ = policy(spot, priv, persona)
    return measure(row.measure, dist, spot)


def evaluate_spot(row: SpotDef, type_key: str, with_leaks: bool = True) -> float:
    """The row's measure for the type mean (plus the row's leaks)."""
    return _evaluate(row.id, type_key, with_leaks)


def bounds_for(row: SpotDef, type_key: str) -> tuple[float, float]:
    """The interval for ``type_key``, with a ``ref`` side measured."""
    lo, hi = row.bounds[type_key]
    if row.ref is not None:
        ref_id, scale, shift, side = row.ref
        base = evaluate_spot(BY_ID[ref_id], type_key) if ref_id else evaluate_spot(row, type_key, with_leaks=False)
        if side == "lo":
            lo = scale * base + shift
        else:
            hi = scale * base + shift
    return lo, hi


def within(value: float, lo: float, hi: float) -> bool:
    return lo - TOL <= value <= hi + TOL


def cases() -> list[tuple[SpotDef, str]]:
    return [(row, t) for row in SPOTS for t in row.bounds]
