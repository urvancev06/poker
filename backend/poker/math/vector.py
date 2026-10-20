"""The vector path: hand values for whole matrices of boards x holdings, and exact
per-combo equity vectors.

Cards are indices into ``FULL_DECK`` (``rank * 4 + suit``, so ``2s`` is 0 and
``Ac`` is 51). ``COMBOS`` lists the 1,326 two-card combos in the one canonical
order every module shares: combo ``i`` is ``(hi, lo)`` with ``hi > lo``, numbered
``hi * (hi - 1) // 2 + lo``, so the higher card comes first exactly as
``cards.canonical_combo`` orders it.

Values come from the rank table (``ranktable.py``). The base-5 rank key
``sum(count[r] * 5**r)`` is a sum over the cards, so a boards x holdings key
matrix is one broadcast add, and one ``searchsorted`` into ``RANK_KEYS`` gives
the non-flush values. Flushes go suit by suit: only rows whose board holds three
or more of a suit can flush, and there the OR of the board's and the hole's
rank bits indexes ``FLUSH_VALUES``. A cell's value is the larger of the two.

Equity vectors count every runout: the hero's win and tie fractions against
each villain combo, over the runouts that combo leaves possible. A combo that
shares a card with the hero or the board is invalid and scores 0.

On the flop the runouts x combos matrix does not depend on the hero, so
``flop_matrix`` builds it once per flop and keeps the last four (the coach warms
it when the flop is dealt; see ``is_flop_warm``).
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from collections.abc import Sequence
from math import comb

import numpy as np

from .cards import FULL_DECK
from .ranktable import FLUSH_VALUES, RANK_KEYS, RANK_VALUES

# A cell where the combo meets the runout, the board or the hero. It is above
# every hand value, so a hero value is never greater than or equal to it.
BLOCKED = np.int16(np.iinfo(np.int16).max)

_CARD_INDEX = {c: i for i, c in enumerate(FULL_DECK)}
_RANK = np.arange(52) // 4
_SUIT = np.arange(52) % 4
_KEY = (5 ** _RANK).astype(np.int64)  # base-5 rank key of each card
_BIT = (1 << _RANK).astype(np.int16)  # rank bit of each card

COMBOS = np.array([(hi, lo) for hi in range(1, 52) for lo in range(hi)], dtype=np.int8)
COMBOS.flags.writeable = False

# INCIDENCE[c, x]: combo c holds card x (bool, read-only; the card-incidence matrix).
INCIDENCE = np.zeros((1326, 52), dtype=bool)
INCIDENCE[np.arange(1326), COMBOS[:, 0]] = True
INCIDENCE[np.arange(1326), COMBOS[:, 1]] = True
INCIDENCE.flags.writeable = False


def card_index(card: str) -> int:
    """The index of ``card`` in ``FULL_DECK``."""
    return _CARD_INDEX[card]


def combo_index(a: str, b: str) -> int:
    """The row of the combo ``{a, b}`` in ``COMBOS`` (either order)."""
    i, j = _CARD_INDEX[a], _CARD_INDEX[b]
    if i == j:
        raise ValueError(f"a combo needs two different cards, got {a} twice")
    hi, lo = (i, j) if i > j else (j, i)
    return hi * (hi - 1) // 2 + lo


def values_matrix(boards: np.ndarray, holes: np.ndarray) -> np.ndarray:
    """Values of every board x hole pairing, as int16 of shape ``(R, C)``.

    ``boards`` is ``(R, k)`` card indices with k of 3-5, ``holes`` is ``(C, 2)``.
    A cell where the hole shares a card with its board holds no defined value;
    callers mask those cells (``hero_runouts`` sets them to ``BLOCKED``).
    """
    boards = np.asarray(boards, dtype=np.intp)
    holes = np.asarray(holes, dtype=np.intp)
    keys = _KEY[boards].sum(axis=1)[:, None] + _KEY[holes].sum(axis=1)[None, :]
    values = RANK_VALUES.take(np.searchsorted(RANK_KEYS, keys), mode="clip")

    board_suits = _SUIT[boards]
    board_bits = _BIT[boards]
    hole_suits = _SUIT[holes]
    hole_bits = _BIT[holes]
    for s in range(4):
        in_suit = board_suits == s
        rows = np.flatnonzero(in_suit.sum(axis=1) >= 3)
        if rows.size == 0:
            continue
        board_mask = np.bitwise_or.reduce(np.where(in_suit[rows], board_bits[rows], 0), axis=1)
        hole_mask = np.bitwise_or.reduce(np.where(hole_suits == s, hole_bits, 0), axis=1)
        flush = FLUSH_VALUES[board_mask[:, None] | hole_mask[None, :]]
        values[rows] = np.maximum(values[rows], flush)
    return values


def _indices(cards: Sequence[str]) -> list[int]:
    out = [_CARD_INDEX[c] for c in cards]
    if len(set(out)) != len(out):
        raise ValueError(f"duplicate cards in {list(cards)}")
    return out


def _runouts(dead: list[int], n: int) -> np.ndarray:
    """Every set of ``n`` cards outside ``dead``, as an ``(R, n)`` index array."""
    rest = np.array([c for c in range(52) if c not in dead], dtype=np.intp)
    if n == 0:
        return np.zeros((1, 0), dtype=np.intp)
    if n == 1:
        return rest[:, None]
    i, j = np.triu_indices(len(rest), k=1)
    return np.stack([rest[i], rest[j]], axis=1)


def _block(values: np.ndarray, runouts: np.ndarray, blocked_combos: np.ndarray) -> np.ndarray:
    """Set ``BLOCKED`` where a combo holds a runout card or is ``blocked_combos``."""
    hit = np.zeros(values.shape, dtype=bool)
    for col in range(runouts.shape[1]):
        hit |= INCIDENCE[:, runouts[:, col]].T
    hit |= blocked_combos[None, :]
    values[hit] = BLOCKED
    return values


# --- the flop matrix --------------------------------------------------------

_FLOP_CACHE: OrderedDict[tuple[int, ...], tuple[np.ndarray, np.ndarray]] = OrderedDict()
_FLOP_CACHE_SIZE = 4
_FLOP_LOCK = threading.Lock()


def _flop_key(board: Sequence[str]) -> tuple[int, ...]:
    if len(board) != 3:
        raise ValueError(f"a flop has 3 cards, got {len(board)}")
    return tuple(sorted(_indices(board)))


def _build_flop(key: tuple[int, ...]) -> tuple[np.ndarray, np.ndarray]:
    flop = list(key)
    runouts = _runouts(flop, 2)  # (1176, 2): turn < river, both off the flop
    boards = np.concatenate([np.broadcast_to(np.array(flop), (len(runouts), 3)), runouts], axis=1)
    matrix = values_matrix(boards, COMBOS)
    _block(matrix, runouts, INCIDENCE[:, flop].any(axis=1))
    runouts = runouts.astype(np.int8)
    matrix.flags.writeable = False
    runouts.flags.writeable = False
    return matrix, runouts


def _flop_entry(board: Sequence[str]) -> tuple[np.ndarray, np.ndarray]:
    key = _flop_key(board)
    with _FLOP_LOCK:
        entry = _FLOP_CACHE.get(key)
        if entry is not None:
            _FLOP_CACHE.move_to_end(key)
            return entry
    entry = _build_flop(key)  # outside the lock: about 0.1 s, other flops stay readable
    with _FLOP_LOCK:
        entry = _FLOP_CACHE.setdefault(key, entry)
        _FLOP_CACHE.move_to_end(key)
        while len(_FLOP_CACHE) > _FLOP_CACHE_SIZE:
            _FLOP_CACHE.popitem(last=False)
    return entry


def flop_matrix(board: Sequence[str]) -> np.ndarray:
    """Values of every turn+river runout x combo on this flop, int16 ``(1176, 1326)``.

    Row ``r`` is the runout ``flop_runouts(board)[r]``. A cell where the combo
    holds a flop or runout card is ``BLOCKED``. The matrix is read-only and
    cached (the last four flops, in any card order).
    """
    return _flop_entry(board)[0]


def flop_runouts(board: Sequence[str]) -> np.ndarray:
    """The ``(turn, river)`` card indices of ``flop_matrix(board)``'s rows,
    int8 ``(1176, 2)``, turn < river."""
    return _flop_entry(board)[1]


def is_flop_warm(board: Sequence[str]) -> bool:
    """Whether ``flop_matrix(board)`` is already cached."""
    key = _flop_key(board)
    with _FLOP_LOCK:
        return key in _FLOP_CACHE


# --- equity vectors ----------------------------------------------------------


def hero_runouts(hero: Sequence[str], board: Sequence[str]) -> tuple[np.ndarray, np.ndarray]:
    """The hero's value and every combo's value on each runout of ``board``.

    Returns ``(h, v)``: ``h`` is int16 ``(R,)``, the hero's value on each runout
    that misses the hero's cards (1 on the river, 46 on the turn, 1,081 on the
    flop), and ``v`` is int16 ``(R, 1326)``, ``BLOCKED`` wherever the combo meets
    the hero, the board or that runout. So ``h[:, None] > v`` marks the hero's
    wins and ``v != BLOCKED`` the pairs that can happen. On the flop ``v`` comes
    from the cached ``flop_matrix``.
    """
    if not 3 <= len(board) <= 5:
        raise ValueError(f"a board has 3-5 cards, got {len(board)}")
    hero_idx = _indices(hero)
    board_idx = _indices(board)
    if len(hero_idx) != 2 or set(hero_idx) & set(board_idx):
        raise ValueError(f"the hero needs two cards off the board, got {list(hero)}")
    hero_combos = INCIDENCE[:, hero_idx].any(axis=1)

    if len(board) == 3:
        matrix, runouts = _flop_entry(board)
        rows = ~np.isin(runouts, hero_idx).any(axis=1)
        runouts = runouts[rows].astype(np.intp)
        v = matrix[rows]  # a copy
        v[:, hero_combos] = BLOCKED
    else:
        runouts = _runouts(board_idx + hero_idx, 5 - len(board))
        board_cols = np.broadcast_to(np.array(board_idx), (len(runouts), len(board_idx)))
        boards = np.concatenate([board_cols, runouts], axis=1)
        v = _block(values_matrix(boards, COMBOS), runouts, INCIDENCE[:, board_idx].any(axis=1) | hero_combos)
        h = values_matrix(boards, np.array([hero_idx]))[:, 0]
        return h, v

    board_cols = np.broadcast_to(np.array(board_idx), (len(runouts), 3))
    boards = np.concatenate([board_cols, runouts], axis=1)
    h = values_matrix(boards, np.array([hero_idx]))[:, 0]
    return h, v


def hero_vs_all(hero: Sequence[str], board: Sequence[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """The hero's exact ``(win, tie, valid)`` against each of the 1,326 combos.

    ``win`` and ``tie`` are float64 fractions over every runout the combo leaves
    possible; ``valid`` is False (and win = tie = 0) for combos that share a card
    with the hero or the board.
    """
    h, v = hero_runouts(hero, board)
    dead = _indices([*hero, *board])
    valid = ~INCIDENCE[:, dead].any(axis=1)
    # Every valid combo meets the same number of runouts: C(48 - k, 5 - k).
    n = comb(48 - len(board), 5 - len(board))
    win = (h[:, None] > v).sum(axis=0) / n
    tie = (h[:, None] == v).sum(axis=0) / n
    return win, tie, valid
