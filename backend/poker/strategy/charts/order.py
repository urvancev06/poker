"""The 169 preflop classes, Chen playability and the one opening order (§4.6).

The STRATEGY.md §2 RFI lists nest (UTG ⊂ MP ⊂ CO ⊂ SB ⊂ BTN at 182/222/326/450/538
combos), so a single order makes every list an exact prefix: the UTG tier, then
MP∖UTG, CO∖MP, SB∖CO, BTN∖SB, then the rest. Inside each tier, and in the tail,
hands sort by playability (Chen), so widening adds 54s before K2o.

A cut is a number of combos along an order. ``p_in`` turns it into a smooth
membership: a class whose middle combo sits ``w`` combos inside the cut is in with
about 73%, so a range is never a cliff, and a class exactly at the cut is 50/50.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from functools import lru_cache

from ...bots.preflop_ranges import RFI_RANGES
from ...math.cards import RANKS
from ...math.suits import CLASSES_169, class_of

CLASSES: tuple[str, ...] = CLASSES_169

_FACE = {r: i + 2 for i, r in enumerate(RANKS)}  # 2..14
_HIGH = {"A": 10.0, "K": 8.0, "Q": 7.0, "J": 6.0}
_GAP_PENALTY = (0.0, -1.0, -2.0, -4.0)  # gaps 0..3; 4+ is -5


def _combos(cls: str) -> int:
    if len(cls) == 2:
        return 6
    return 4 if cls[2] == "s" else 12


COMBOS_OF: dict[str, int] = {c: _combos(c) for c in CLASSES}


def kind_of(cls: str) -> str:
    """``"pair"``, ``"suited"`` or ``"offsuit"``."""
    if len(cls) == 2:
        return "pair"
    return "suited" if cls[2] == "s" else "offsuit"


def ranks_of(cls: str) -> tuple[int, int]:
    """Face values (2..14) of the high and low card."""
    return _FACE[cls[0]], _FACE[cls[1]]


def gap_of(cls: str) -> int:
    """Ranks strictly between the two cards (0 for connectors); -1 for a pair."""
    hi, lo = ranks_of(cls)
    return hi - lo - 1


def chen(cls: str) -> float:
    """Unrounded Chen score of a class (higher plays better)."""
    hi, lo = ranks_of(cls)
    high = _HIGH.get(cls[0], hi / 2.0)
    if len(cls) == 2:
        return max(5.0, 2.0 * high)
    score = high + (2.0 if cls[2] == "s" else 0.0)
    gap = hi - lo - 1
    score += _GAP_PENALTY[gap] if gap < 4 else -5.0
    if gap <= 1 and hi < 12:
        score += 1.0
    return score


_KIND_RANK = {"pair": 0, "suited": 1, "offsuit": 2}


def playability_key(cls: str) -> tuple[float, int, int, int]:
    """Sort key: Chen descending, then pair > suited > offsuit, then high and low
    rank descending."""
    hi, lo = ranks_of(cls)
    return (-chen(cls), _KIND_RANK[kind_of(cls)], -hi, -lo)


def by_playability(classes: Iterable[str]) -> tuple[str, ...]:
    return tuple(sorted(classes, key=playability_key))


def _rfi_classes(pos: str) -> frozenset[str]:
    return frozenset(class_of(c) for c in RFI_RANGES[pos])


# Nesting order of the RFI lists, tightest first.
OPEN_TIERS: tuple[str, ...] = ("UTG", "MP", "CO", "SB", "BTN")


def _build_open_order() -> tuple[str, ...]:
    out: list[str] = []
    seen: set[str] = set()
    for pos in OPEN_TIERS:
        tier = _rfi_classes(pos) - seen
        out.extend(by_playability(tier))
        seen |= tier
    out.extend(by_playability(set(CLASSES) - seen))
    return tuple(out)


OPEN_ORDER: tuple[str, ...] = _build_open_order()


@lru_cache(maxsize=256)
def _mids(order: tuple[str, ...]) -> dict[str, float]:
    mids: dict[str, float] = {}
    total = 0
    for cls in order:
        n = COMBOS_OF[cls]
        mids[cls] = total + n / 2.0
        total += n
    return mids


def order_mid(order: Sequence[str], cls: str) -> float:
    """Combos before ``cls`` in ``order`` plus half of its own."""
    return _mids(tuple(order))[cls]


def p_in(cls: str, order: Sequence[str], cut: float, w: float = 3.0) -> float:
    """σ((cut − order_mid)/w): the chance that ``cls`` is inside a cut of ``cut``
    combos along ``order``; 0 when ``cls`` is not in the order at all."""
    mids = _mids(tuple(order))
    mid = mids.get(cls)
    if mid is None:
        return 0.0
    z = (cut - mid) / w
    if z >= 40:
        return 1.0
    if z <= -40:
        return 0.0
    return 1.0 / (1.0 + math.exp(-z))


def combos(classes: Iterable[str]) -> int:
    return sum(COMBOS_OF[c] for c in classes)


_DESC = RANKS[::-1]


def _runs(values: list[int]) -> list[list[int]]:
    """Group descending rank indices into runs of consecutive ranks."""
    runs: list[list[int]] = []
    for v in values:
        if runs and runs[-1][-1] == v + 1:
            runs[-1].append(v)
        else:
            runs.append([v])
    return runs


def compact(classes: Iterable[str]) -> str:
    """Range notation for a set of classes, in the STRATEGY.md style:
    ``22+, ATs+, A5s-A4s, KTs+, AJo+, KQo``. ``parse_range`` reads it back."""
    pool = set(classes)
    parts: list[str] = []
    pairs = sorted((RANKS.index(c[0]) for c in pool if len(c) == 2), reverse=True)
    for run in _runs(pairs):
        top, bottom = RANKS[run[0]] * 2, RANKS[run[-1]] * 2
        if run[0] == 12 and len(run) > 1:
            parts.append(f"{bottom}+")
        elif len(run) == 1:
            parts.append(top)
        else:
            parts.append(f"{top}-{bottom}")
    for suffix in ("s", "o"):
        for hi in _DESC:
            lows = sorted(
                (RANKS.index(c[1]) for c in pool if len(c) == 3 and c[0] == hi and c[2] == suffix),
                reverse=True,
            )
            for run in _runs(lows):
                top, bottom = f"{hi}{RANKS[run[0]]}{suffix}", f"{hi}{RANKS[run[-1]]}{suffix}"
                if run[0] == RANKS.index(hi) - 1 and len(run) > 1:
                    parts.append(f"{bottom}+")
                elif len(run) == 1:
                    parts.append(top)
                else:
                    parts.append(f"{top}-{bottom}")
    return ", ".join(parts)
