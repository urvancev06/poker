"""Preflop equity from a precomputed table: one dot product instead of Monte Carlo.

``data/preflop_eq.npz`` (built offline by ``scripts/build_preflop_table.py``)
holds the equity of each of the 169 hero classes, at its representative combo,
against each of the 1,326 villain combos: 20,000 seeded boards per class,
pooled over the suit permutations that fix the representative, stored as
uint16 (equity x 65535). One entry's standard error is about 0.35 pp before
pooling (less after).

Any other hero combo maps onto its representative through a suit permutation
(``suits.HERO_PERM``), and the villain combos go through the same permutation,
so suit-isomorphic matchups read the identical entry. Equity counts ties as
half a pot; the table has no separate win and tie.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np

from .suits import CLASSES_169, COMBO_PERM, HERO_CLASS, HERO_PERM, class_of
from .vector import INCIDENCE, combo_index

__all__ = ["BOARDS_PER_CLASS", "CLASSES_169", "STAMP", "TABLE", "class_of", "matchup", "preflop_equity"]

_DATA = Path(__file__).resolve().parent / "data" / "preflop_eq.npz"

with np.load(_DATA, allow_pickle=False) as _npz:
    TABLE: np.ndarray = _npz["table"]  # uint16 (169, 1326), class x villain combo
    STAMP: str = str(_npz["stamp"])
    BOARDS_PER_CLASS: int = int(_npz["boards_per_class"])
    if tuple(_npz["classes"].tolist()) != CLASSES_169:
        raise RuntimeError("preflop_eq.npz was built for another class order; rebuild it")
TABLE.flags.writeable = False

_ROWS = TABLE.astype(np.float64) / 65535.0
_ROWS.flags.writeable = False
_PERMS = COMBO_PERM.astype(np.intp)


def _hero(hero: Sequence[str]) -> tuple[int, int, int]:
    a, b = hero
    h = combo_index(a, b)
    return h, int(HERO_CLASS[h]), int(HERO_PERM[h])


def matchup(hero: Sequence[str], villain: Sequence[str]) -> float:
    """The hero's preflop equity against one villain combo (ties count half)."""
    h, k, p = _hero(hero)
    if set(hero) & set(villain):
        raise ValueError(f"{list(villain)} shares a card with the hero {list(hero)}")
    return float(_ROWS[k, _PERMS[p, combo_index(*villain)]])


def preflop_equity(hero: Sequence[str], villain_weights: np.ndarray) -> float:
    """The hero's equity against a weighted range: the mean of ``matchup`` over
    the combos that miss the hero's cards, weighted by ``villain_weights``
    (1,326 non-negative weights in ``vector.COMBOS`` order).

    Raises ValueError when no weighted combo misses the hero's cards.
    """
    h, k, p = _hero(hero)
    weights = np.asarray(villain_weights, dtype=np.float64)
    if weights.shape != (1326,):
        raise ValueError(f"expected 1326 weights, got shape {weights.shape}")
    a, b = np.flatnonzero(INCIDENCE[h])
    open_weights = np.where(INCIDENCE[:, a] | INCIDENCE[:, b], 0.0, weights)
    total = open_weights.sum()
    if total <= 0:
        raise ValueError(f"every weighted villain combo is blocked by the hero {list(hero)}")
    return float(open_weights @ _ROWS[k][_PERMS[p]] / total)
