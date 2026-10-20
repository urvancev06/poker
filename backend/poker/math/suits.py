"""Suit isomorphism for preflop hands: the 169 classes and the suit relabellings
that take any two-card holding onto its class's representative.

Preflop equity does not change when every suit is renamed the same way, so the
1,326 hero combos collapse into 169 classes. Each class has one representative:

* a pair ``XX`` is ``Xs Xh``;
* a suited hand ``XYs`` is ``Xs Ys``;
* an offsuit hand ``XYo`` is ``Xs Yh`` (the higher rank on spades).

``HERO_PERM[c]`` names the suit permutation that maps combo ``c`` onto its
representative: the hero's suits go to the representative's suits (the higher
rank's suit first; a pair's two suits in suit order), and the remaining suits
keep their order. Applying the same permutation to a villain combo
(``COMBO_PERM``) gives the villain in the representative's frame.

Card and combo indices are those of ``vector.py``: card ``rank * 4 + suit``
with suits ordered s, h, d, c, and combo ``hi * (hi - 1) // 2 + lo``.
"""

from __future__ import annotations

import itertools
from collections.abc import Sequence

import numpy as np

from .cards import RANK_INDEX, RANKS, SUITS

# Every permutation of the four suit slots, as a tuple p with p[old] = new.
SUIT_PERMS: tuple[tuple[int, ...], ...] = tuple(itertools.permutations(range(4)))
_PERM_ID = {p: i for i, p in enumerate(SUIT_PERMS)}

_DESC = RANKS[::-1]  # A K Q ... 2
CLASSES_169: tuple[str, ...] = (
    tuple(r + r for r in _DESC)
    + tuple(_DESC[i] + _DESC[j] + "s" for i in range(13) for j in range(i + 1, 13))
    + tuple(_DESC[i] + _DESC[j] + "o" for i in range(13) for j in range(i + 1, 13))
)
CLASS_INDEX = {c: i for i, c in enumerate(CLASSES_169)}


def _combo_id(i: int, j: int) -> int:
    hi, lo = (i, j) if i > j else (j, i)
    return hi * (hi - 1) // 2 + lo


def _representative(cls: str) -> tuple[int, int]:
    hi, lo = RANK_INDEX[cls[0]], RANK_INDEX[cls[1]]
    if len(cls) == 2:
        return hi * 4 + 1, hi * 4  # Xh, Xs
    if cls[2] == "s":
        return hi * 4, lo * 4  # Xs, Ys
    return hi * 4, lo * 4 + 1  # Xs, Yh


REPRESENTATIVES: tuple[tuple[int, int], ...] = tuple(_representative(c) for c in CLASSES_169)


def _class_of_cards(i: int, j: int) -> str:
    (ri, si), (rj, sj) = divmod(i, 4), divmod(j, 4)
    if ri < rj:
        (ri, si), (rj, sj) = (rj, sj), (ri, si)
    if ri == rj:
        return RANKS[ri] * 2
    return RANKS[ri] + RANKS[rj] + ("s" if si == sj else "o")


def _perm_to_representative(i: int, j: int) -> tuple[int, ...]:
    (ri, si), (rj, sj) = divmod(i, 4), divmod(j, 4)
    if ri < rj or (ri == rj and si > sj):
        (ri, si), (rj, sj) = (rj, sj), (ri, si)
    sources = [si] if si == sj else [si, sj]  # suited: one suit; else higher rank's (or lower suit) first
    perm = [-1] * 4
    for target, source in enumerate(sources):
        perm[source] = target
    rest_targets = iter(range(len(sources), 4))
    for source in range(4):
        if perm[source] < 0:
            perm[source] = next(rest_targets)
    return tuple(perm)


def _apply(perm: Sequence[int], card: int) -> int:
    return card - card % 4 + perm[card % 4]


_ALL_COMBOS = [(hi, lo) for hi in range(1, 52) for lo in range(hi)]

# COMBO_PERM[p, c]: the combo that suit permutation p turns combo c into.
COMBO_PERM = np.array(
    [[_combo_id(_apply(p, a), _apply(p, b)) for a, b in _ALL_COMBOS] for p in SUIT_PERMS], dtype=np.int16
)
HERO_CLASS = np.array([CLASS_INDEX[_class_of_cards(a, b)] for a, b in _ALL_COMBOS], dtype=np.int16)
HERO_PERM = np.array([_PERM_ID[_perm_to_representative(a, b)] for a, b in _ALL_COMBOS], dtype=np.int8)
# STABILIZERS[k]: the permutations that map class k's representative onto itself.
STABILIZERS: tuple[tuple[int, ...], ...] = tuple(
    tuple(
        i
        for i, p in enumerate(SUIT_PERMS)
        if {_apply(p, rep[0]), _apply(p, rep[1])} == set(rep)
    )
    for rep in REPRESENTATIVES
)
for _arr in (COMBO_PERM, HERO_CLASS, HERO_PERM):
    _arr.flags.writeable = False


def class_of(hole: Sequence[str]) -> str:
    """The class of a two-card holding, e.g. ``("Kd", "Ad")`` -> ``"AKs"``."""
    a, b = hole
    return _class_of_cards(RANK_INDEX[a[0]] * 4 + SUITS.index(a[1]), RANK_INDEX[b[0]] * 4 + SUITS.index(b[1]))
