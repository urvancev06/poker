"""Computed preflop hand-strength ranking of the 169 starting hands.

Generated once by ranking every starting hand by heads-up all-in equity versus a
random hand (using ``poker.math.equity``, seed 12345, 2500 trials each) — so it
is *computed*, not fabricated. Used to drive each archetype's preflop ranges as a
tunable "open the top X% by position" dial.

KNOWN LIMITATION (flagged for review): raw all-in equity under-rates small pairs
and suited connectors, whose real value is set-mining / implied odds, not raw
equity (e.g. 22 ranks ~80th here). So a percentile-based range opens fewer small
pairs/SCs from early position than STRATEGY.md §2's explicit lists. The stat gate
(VPIP/PFR/etc.) is unaffected; swap in §2's explicit lists later for finer realism.
NOTE: the LEAK DETECTOR no longer uses this ranking -- it judges the hero against §2's
explicit lists via bots/preflop_ranges.py. Only the BOTS still open by percentile.
Switching them is step 2 of audit/10-BOT-REALISM-PHASE.md, deferred because it voids
the coach's BET_COMPOSITION calibration along with every threshold derived from it.
Regenerate with scripts/gen_preflop_ranking.py.
"""

from __future__ import annotations

# Ordered best -> worst (169 classes).
HAND_RANKING: list[str] = [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "AKs", "77", "AJs", "AKo", "AQs",
    "ATs", "KJs", "KQs", "66", "AJo", "AQo", "A8s", "A9s", "ATo", "KTs", "KJo",
    "KQo", "A7s", "QJs", "55", "K9s", "A8o", "A6s", "A9o", "A5s", "KTo", "A7o",
    "A3s", "QTs", "QJo", "A4s", "K8s", "A2s", "44", "K9o", "Q9s", "K7s", "A5o",
    "Q8s", "JTs", "A6o", "A4o", "A3o", "K8o", "QTo", "K6s", "J9s", "33", "A2o",
    "J8s", "Q7s", "K4s", "K5s", "Q9o", "JTo", "K7o", "Q8o", "K3s", "T8s", "T9s",
    "K2s", "J7s", "K6o", "Q6s", "J9o", "J8o", "Q7o", "Q5s", "K5o", "Q4s", "T7s",
    "K4o", "22", "98s", "Q3s", "T8o", "T9o", "K3o", "Q6o", "97s", "Q2s", "J7o",
    "T6s", "J6s", "J5s", "K2o", "Q5o", "Q4o", "98o", "J4s", "T7o", "J3s", "J2s",
    "87s", "T5s", "97o", "Q3o", "96s", "Q2o", "T4s", "T3s", "J6o", "T6o", "76s",
    "J5o", "T2s", "95s", "86s", "J4o", "75s", "87o", "J3o", "J2o", "T5o", "85s",
    "96o", "94s", "93s", "T4o", "65s", "74s", "76o", "92s", "T3o", "86o", "95o",
    "73s", "T2o", "84s", "75o", "63s", "54s", "64s", "83s", "82s", "85o", "94o",
    "65o", "74o", "53s", "93o", "72s", "84o", "43s", "92o", "73o", "54o", "62s",
    "64o", "32s", "83o", "63o", "82o", "42s", "52s", "53o", "72o", "43o", "62o",
    "42o", "32o", "52o",
]

assert len(HAND_RANKING) == 169, "ranking must cover all 169 starting hands"

_RANK_ORDER = "23456789TJQKA"
_RV = {r: i for i, r in enumerate(_RANK_ORDER)}


def combo_count(name: str) -> int:
    """How many concrete combos a starting-hand class represents."""
    if len(name) == 2:  # pair
        return 6
    return 4 if name.endswith("s") else 12


def hand_class(hole: tuple[str, str] | list[str]) -> str:
    """Canonical class name for two hole cards, e.g. ('As','Kh') -> 'AKo'."""
    (r1, s1), (r2, s2) = hole[0], hole[1]
    if r1 == r2:
        return r1 + r2
    hi, lo = (r1, r2) if _RV[r1] > _RV[r2] else (r2, r1)
    return f"{hi}{lo}{'s' if s1 == s2 else 'o'}"


# Precompute cumulative combo fraction at each rank position (best->worst).
_CUM_FRACTION: dict[str, float] = {}
_running = 0
for _name in HAND_RANKING:
    _running += combo_count(_name)
    _CUM_FRACTION[_name] = _running / 1326.0


def percentile(name: str) -> float:
    """Fraction of all combos at least as strong as ``name`` (0..1; smaller =
    stronger). E.g. 'AA' ~ 0.0045, a median hand ~ 0.5."""
    return _CUM_FRACTION[name]


def top_fraction(x: float) -> set[str]:
    """The set of hand classes making up (approximately) the strongest ``x`` of
    all dealt combos."""
    if x <= 0:
        return set()
    out: set[str] = set()
    for name in HAND_RANKING:
        out.add(name)
        if _CUM_FRACTION[name] >= x:
            break
    return out


def in_top(hole: tuple[str, str] | list[str], x: float) -> bool:
    return percentile(hand_class(hole)) <= x
