"""The rank table: every hand value the app computes, from one precomputed file.

``data/ranktable.npz`` (built by ``scripts/build_rank_table.py``) holds the best
non-flush value of every 5-, 6- and 7-card rank multiset and the best flush of
every one-suit rank mask. A hand's value is the larger of the two:

    value = max(RANK_VALUE[rank multiset], FLUSH_VALUE[mask of the flush suit])

That is exact: a five-card subset is either a flush (its value is in the flush
table) or not (its value depends on ranks only, and the multiset entry is the
best of those). Values run 1 (7-5-4-3-2) to 7462 (royal flush), and
``value7(cards) == 7463 - treys.evaluate(cards)``; treys stays the test oracle.

Two access paths read the same numbers:

* **Scalar** (this module; bots, the simulator, BoardCache). Each rank has a
  prime, so a multiset is a prime product and one dict lookup gives its value.
  ``BoardRanker`` precomputes the board's product and its flush suit, so one
  holding costs two multiplies and a lookup. Pure Python.
* **Vector** (``vector.py``; the coach, the review, table builds). The base-5
  key ``sum(count[r] * 5**r)`` is linear in the cards, so a whole matrix of
  runouts x holdings is one broadcast add and one ``searchsorted`` into
  ``RANK_KEYS``.
"""

from __future__ import annotations

import bisect
from collections.abc import Iterable, Sequence
from pathlib import Path

import numpy as np

from .cards import FULL_DECK, RANK_INDEX
from .classify import MadeTier

_DATA = Path(__file__).resolve().parent / "data" / "ranktable.npz"

with np.load(_DATA, allow_pickle=False) as _npz:
    RANK_KEYS: np.ndarray = _npz["rank_keys"]  # int64, sorted base-5 rank-count keys
    RANK_VALUES: np.ndarray = _npz["rank_values"]  # int16, aligned with RANK_KEYS
    FLUSH_VALUES: np.ndarray = _npz["flush_values"]  # int16 [8192]; 0 unless 5-7 bits
    PRIMES: np.ndarray = _npz["primes"]  # int64 [13], rank 2..A
    STAMP: str = str(_npz["stamp"])

for _arr in (RANK_KEYS, RANK_VALUES, FLUSH_VALUES, PRIMES):
    _arr.flags.writeable = False

# --- the scalar path ---------------------------------------------------------

_P = [int(p) for p in PRIMES]
# Prime product of each multiset, from its base-5 counts.
_COUNTS = (RANK_KEYS[:, None] // (5 ** np.arange(13, dtype=np.int64))) % 5
_PRODUCTS = np.prod(PRIMES[None, :] ** _COUNTS, axis=1)
_VALUE_BY_PRODUCT: dict[int, int] = dict(zip(_PRODUCTS.tolist(), RANK_VALUES.tolist(), strict=True))
del _COUNTS, _PRODUCTS
_FLUSH: list[int] = FLUSH_VALUES.tolist()

_PRIME_OF = {c: _P[RANK_INDEX[c[0]]] for c in FULL_DECK}
_BIT_OF = {c: 1 << RANK_INDEX[c[0]] for c in FULL_DECK}
_SUIT_SLOT = {"s": 0, "h": 1, "d": 2, "c": 3}


def value7(cards: Sequence[str]) -> int:
    """The value of the best five of 5-7 distinct cards (higher is stronger)."""
    product = 1
    masks = [0, 0, 0, 0]
    counts = [0, 0, 0, 0]
    for c in cards:
        product *= _PRIME_OF[c]
        s = _SUIT_SLOT[c[1]]
        masks[s] |= _BIT_OF[c]
        counts[s] += 1
    value = _VALUE_BY_PRODUCT[product]
    for s in range(4):
        if counts[s] >= 5:
            flush = _FLUSH[masks[s]]
            if flush > value:
                value = flush
    return value


class BoardRanker:
    """Values holdings on one board of 3-5 cards, with the board part precomputed.

    Only a suit the board holds at least three of can make a flush with two hole
    cards, and a board of five or fewer cards has at most one such suit.
    """

    __slots__ = ("board", "_product", "_flush_suit", "_flush_mask")

    def __init__(self, board: Sequence[str]) -> None:
        if not 3 <= len(board) <= 5:
            raise ValueError(f"a board has 3-5 cards, got {len(board)}")
        self.board = tuple(board)
        product = 1
        for c in board:
            product *= _PRIME_OF[c]
        self._product = product
        self._flush_suit: str | None = None
        self._flush_mask = 0
        for suit in "shdc":
            suited = [c for c in board if c[1] == suit]
            if len(suited) >= 3:
                self._flush_suit = suit
                self._flush_mask = sum(_BIT_OF[c] for c in suited)

    def value(self, hole: Sequence[str]) -> int:
        """The value of ``hole`` plus the board. The hole must not share a card
        with the board (unchecked)."""
        a, b = hole
        value = _VALUE_BY_PRODUCT[self._product * _PRIME_OF[a] * _PRIME_OF[b]]
        suit = self._flush_suit
        if suit is not None:
            mask = self._flush_mask
            if a[1] == suit:
                mask |= _BIT_OF[a]
            if b[1] == suit:
                mask |= _BIT_OF[b]
            flush = _FLUSH[mask]
            if flush > value:
                value = flush
        return value

    def values(self, holes: Iterable[Sequence[str]]) -> list[int]:
        """``[self.value(h) for h in holes]``, with the lookups hoisted."""
        table, prime_of, bit_of, flush_table = _VALUE_BY_PRODUCT, _PRIME_OF, _BIT_OF, _FLUSH
        base, suit, base_mask = self._product, self._flush_suit, self._flush_mask
        if suit is None:
            return [table[base * prime_of[a] * prime_of[b]] for a, b in holes]
        out = []
        for a, b in holes:
            value = table[base * prime_of[a] * prime_of[b]]
            mask = base_mask
            if a[1] == suit:
                mask |= bit_of[a]
            if b[1] == suit:
                mask |= bit_of[b]
            flush = flush_table[mask]
            out.append(flush if flush > value else value)
        return out


# --- tiers --------------------------------------------------------------------

# The lowest value of each tier from PAIR up: 7463 minus treys' class limits
# (LookupTable.MAX_PAIR = 6185, MAX_TWO_PAIR = 3325, MAX_THREE_OF_A_KIND = 2467,
# MAX_STRAIGHT = 1609, MAX_FLUSH = 1599, MAX_FULL_HOUSE = 322,
# MAX_FOUR_OF_A_KIND = 166, MAX_STRAIGHT_FLUSH = 10). Pinned by the tests.
_TIER_FLOORS = (1278, 4138, 4996, 5854, 5864, 7141, 7297, 7453)


def tier_of(value: int) -> MadeTier:
    """The made-hand tier of a value from this table."""
    return MadeTier(bisect.bisect_right(_TIER_FLOORS, value) + 1)
