"""The explicit positional opening ranges from STRATEGY.md §2, as parsed combo sets.

STRATEGY.md states each position's range twice: a hand list (``22+, ATs+, A5s, ...``)
and a percentage label (``~15%``). The two disagree - the labels overstate their own
lists by 1.3 to 4.4 points - so the lists, not the labels, decide whether an open was
in range. Membership is exact, so no tolerance band is needed.

The bots still size their ranges by percentile (``archetypes.rfi_raise``); those values
drive VPIP and PFR, so changing them changes bot behaviour rather than measurement.
"""

from __future__ import annotations

from ..math.cards import Combo
from ..math.ranges import parse_range

# Verbatim from STRATEGY.md:28-32, up to the dash normalisation below.
_RANGE_TEXT: dict[str, str] = {
    "UTG": "22+, ATs+, A5s, A4s, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo",
    "MP": "22+, A9s+, A5s–A2s, KTs+, QTs+, J9s+, T9s, 98s, ATo+, KJo+",
    "CO": "22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo",
    "BTN": (
        "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, "
        "A2o+, K9o+, Q9o+, J9o+, T9o, 98o"
    ),
    "SB": "22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, A2o+, K9o+, QTo+, JTo",
    # BB has no RFI - it checks its option when folded to. Callers must treat a missing
    # range as "not judgeable"; read as a range of zero hands, every BB open is a leak.
}


def _normalise(text: str) -> str:
    """STRATEGY.md is prose written for humans and uses typographic dashes;
    ``parse_range`` splits ranges on ASCII "-" only."""
    return text.replace("–", "-").replace("—", "-")


RFI_RANGES: dict[str, frozenset[Combo]] = {
    pos: frozenset(parse_range(_normalise(text))) for pos, text in _RANGE_TEXT.items()
}

# Combo counts, computed from the lists rather than asserted, so they can never drift
# from the ranges they describe. (UTG 182, MP 222, CO 326, BTN 538, SB 450.)
RFI_COMBOS: dict[str, int] = {pos: len(c) for pos, c in RFI_RANGES.items()}
RFI_PCT: dict[str, float] = {pos: 100.0 * n / 1326.0 for pos, n in RFI_COMBOS.items()}


def has_rfi(position: str) -> bool:
    """False for the BB (and anything unknown), which has no opening range at all."""
    return position in RFI_RANGES


def in_rfi(position: str, combo: Combo) -> bool:
    """Is this exact two-card combo in the position's baseline opening range?"""
    rng = RFI_RANGES.get(position)
    return bool(rng and combo in rng)
