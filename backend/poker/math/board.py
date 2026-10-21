"""BoardCache: one sorted strength table per board, shared by every bot and the coach.

Building a cache values every live holding on the board once (the scalar rank
table, ``BoardRanker``) and sorts them. A holding's strength is then a few
bisections, with exact card removal for its own cards:

* ``hs(hole)``: the share of the board's live holdings, disjoint from ``hole``,
  that ``hole`` beats, ties counting half. Against random holdings, so a board
  pair counts for everyone and only the hole cards move the number.
* ``h(hole, weights, key)``: the same against a weighted range (1,326 weights in
  ``vector.COMBOS`` order), normalised over the weight of the combos disjoint
  from ``hole``. The weighted prefix sums are built once per ``key`` and kept;
  the caller promises that one key always means one weight vector. With no open
  weight it falls back to ``hs``.

How the bisections remove the hero's cards: with the live holdings sorted by
value, ``bisect`` counts those below and tied with the hero's value. Every
holding that holds a hero card is in one of two short per-card lists (51 - k
holdings each, also sorted), so subtracting those two counts and adding back the
hero's own combo (in both lists, tied with itself) leaves exactly the disjoint
holdings. The weighted version does the same with prefix sums of the weights.

The rest is per-holding detail the policy needs on this board: ``draws``
(memoised ``hole_draws``), ``is_nuts`` (nothing disjoint beats it), ``value``
and ``bluff_quantile`` (decision D33: where an air combo ranks among the board's
air combos by bluff score).

``board_cache(board)`` keeps the last 64 boards, keyed in deal order (thread-safe).
"""

from __future__ import annotations

import threading
from bisect import bisect_left, bisect_right
from collections import OrderedDict
from collections.abc import Sequence

import numpy as np

from .cards import FULL_DECK, RANK_INDEX
from .classify import MadeTier
from .draws import DrawSet, hole_draws
from .ranktable import BoardRanker, tier_of, value7
from .texture import Texture, texture
from .vector import COMBOS, INCIDENCE

__all__ = ["BoardCache", "board_cache"]

_CARD = {c: i for i, c in enumerate(FULL_DECK)}
_RANK = [RANK_INDEX[c[0]] for c in FULL_DECK]
_HOLES = [(FULL_DECK[a], FULL_DECK[b]) for a, b in COMBOS.tolist()]
_KEYS_PER_BOARD = 64


class _Weighted:
    """Prefix sums of one weight vector over a board's sorted holdings."""

    __slots__ = ("cum", "card_cum", "card_total", "total", "positive", "card_positive", "weights")

    def __init__(self, cache: BoardCache, weights: np.ndarray) -> None:
        live_w = weights[cache._order]
        self.cum = np.concatenate(([0.0], np.cumsum(live_w))).tolist()
        self.total = self.cum[-1]
        card_w = weights[cache._card_ids]  # (52, m); rows of board cards are unused
        card_cum = np.concatenate((np.zeros((52, 1)), np.cumsum(card_w, axis=1)), axis=1)
        self.card_cum = card_cum.tolist()
        self.card_total = card_cum[:, -1].tolist()
        # Counts of positive weights decide "no open weight" exactly (a difference
        # of float sums could leave rounding dust instead of zero).
        self.positive = int(np.count_nonzero(live_w > 0))
        self.card_positive = np.count_nonzero(card_w > 0, axis=1).tolist()
        self.weights = weights


class BoardCache:
    """The strength table of one 3-5 card board. Build it with ``board_cache``."""

    def __init__(self, board: Sequence[str]) -> None:
        board = tuple(board)
        if not 3 <= len(board) <= 5:
            raise ValueError(f"a board has 3-5 cards, got {len(board)}")
        if len(set(board)) != len(board) or any(c not in _CARD for c in board):
            raise ValueError(f"not a board: {list(board)}")
        self.board: tuple[str, ...] = board
        self.texture: Texture = texture(board)
        self._ranker = BoardRanker(board)
        self._on_board = frozenset(_CARD[c] for c in board)

        live = np.flatnonzero(~INCIDENCE[:, sorted(self._on_board)].any(axis=1))
        live.flags.writeable = False
        self.live: np.ndarray = live  # combo ids not blocked by the board, ascending

        values = self._ranker.values([_HOLES[i] for i in live.tolist()])
        value_of = np.zeros(1326, dtype=np.int32)
        value_of[live] = values
        self._value_of: list[int] = value_of.tolist()

        order = live[np.argsort(value_of[live], kind="stable")]
        self._order = order
        self._sorted: list[int] = value_of[order].tolist()
        self._n_live = len(live)

        # Per card: the live holdings that hold it, sorted by value. Board cards'
        # rows are padding (never read).
        m = 51 - len(board)
        self._m = m
        # Each sorted holding appears under both its cards; sorting by (card,
        # position in ``order``) keeps value order inside each card's group, and
        # every off-board card has exactly m holdings.
        n = len(order)
        cards = np.concatenate((COMBOS[order, 0], COMBOS[order, 1])).astype(np.intp)
        positions = np.concatenate((np.arange(n), np.arange(n)))
        by_card = np.argsort(cards * n + positions)
        off_board = np.array([x for x in range(52) if x not in self._on_board], dtype=np.intp)
        grouped = positions[by_card].reshape(len(off_board), m)  # positions in ``order``
        card_ids = np.zeros((52, m), dtype=np.intp)
        card_ids[off_board] = order[grouped]
        card_sorted: list[list[int]] = [[] for _ in range(52)]
        for x, row in zip(off_board.tolist(), value_of[card_ids[off_board]].tolist(), strict=True):
            card_sorted[x] = row
        self._card_ids = card_ids
        self._card_sorted = card_sorted

        self._lock = threading.Lock()
        self._weighted: OrderedDict[str, _Weighted] = OrderedDict()
        self._draws: dict[int, DrawSet] = {}
        self._bluff: dict[int, float] | None = None
        self._bluff_ids: np.ndarray | None = None

    # --- lookups ---------------------------------------------------------------

    def _hole(self, hole: Sequence[str]) -> tuple[int, int, int]:
        """(card a, card b, combo id) for a hole off this board, else ValueError."""
        a_card, b_card = hole
        a, b = _CARD.get(a_card), _CARD.get(b_card)
        if a is None or b is None or a == b or a in self._on_board or b in self._on_board:
            raise ValueError(f"{list(hole)} is not a holding on {list(self.board)}")
        hi, lo = (a, b) if a > b else (b, a)
        return a, b, hi * (hi - 1) // 2 + lo

    def _counts(self, a: int, b: int, v: int) -> tuple[int, int, int, int, int, int]:
        lo, hi = bisect_left(self._sorted, v), bisect_right(self._sorted, v)
        sa, sb = self._card_sorted[a], self._card_sorted[b]
        return lo, hi, bisect_left(sa, v), bisect_right(sa, v), bisect_left(sb, v), bisect_right(sb, v)

    def value(self, hole: Sequence[str]) -> int:
        """The rank-table value of ``hole`` on this board (higher is stronger)."""
        return self._value_of[self._hole(hole)[2]]

    def hs(self, hole: Sequence[str]) -> float:
        """The share of the live holdings disjoint from ``hole`` that it beats
        (ties count half)."""
        a, b, cid = self._hole(hole)
        lo, hi, la, ha, lb, hb = self._counts(a, b, self._value_of[cid])
        below = lo - la - lb
        tied = (hi - lo) - (ha - la) - (hb - lb) + 1  # the hero's own combo is in all three
        n = self._n_live - 2 * self._m + 1
        return (below + tied / 2) / n

    def _table(self, key: str, weights: Sequence[float]) -> _Weighted:
        with self._lock:
            table = self._weighted.get(key)
            if table is not None:
                self._weighted.move_to_end(key)
                return table
        w = np.array(weights, dtype=np.float64)  # a copy: the table outlives the caller's array
        if w.shape != (1326,):
            raise ValueError(f"expected 1326 weights, got shape {w.shape}")
        if not np.all(np.isfinite(w)) or np.any(w < 0):
            raise ValueError("weights must be finite and non-negative")
        table = _Weighted(self, w)
        with self._lock:
            table = self._weighted.setdefault(key, table)
            self._weighted.move_to_end(key)
            while len(self._weighted) > _KEYS_PER_BOARD:
                self._weighted.popitem(last=False)
        return table

    def h(self, hole: Sequence[str], weights: Sequence[float], key: str) -> float:
        """``hs`` against a weighted range: the weighted share of the combos
        disjoint from ``hole`` that it beats, ties counting half. ``weights`` is
        read only the first time ``key`` is seen on this board."""
        a, b, cid = self._hole(hole)
        t = self._table(key, weights)
        own_w = float(t.weights[cid])
        open_positive = t.positive - t.card_positive[a] - t.card_positive[b] + (own_w > 0)
        if open_positive <= 0:
            return self.hs(hole)
        lo, hi, la, ha, lb, hb = self._counts(a, b, self._value_of[cid])
        cum, ca, cb = t.cum, t.card_cum[a], t.card_cum[b]
        below = cum[lo] - ca[la] - cb[lb]
        tied = (cum[hi] - cum[lo]) - (ca[ha] - ca[la]) - (cb[hb] - cb[lb]) + own_w
        total = t.total - t.card_total[a] - t.card_total[b] + own_w
        return (below + tied / 2) / total

    def is_nuts(self, hole: Sequence[str]) -> bool:
        """No holding disjoint from ``hole`` beats it on this board (ties allowed)."""
        a, b, cid = self._hole(hole)
        _lo, hi, _la, ha, _lb, hb = self._counts(a, b, self._value_of[cid])
        return (self._n_live - hi) - (self._m - ha) - (self._m - hb) == 0

    def draws(self, hole: Sequence[str]) -> DrawSet:
        """``hole_draws(hole, board)``, memoised per combo."""
        cid = self._hole(hole)[2]
        d = self._draws.get(cid)
        if d is None:
            d = self._draws.setdefault(cid, hole_draws(_HOLES[cid], self.board))
        return d

    # --- bluff candidates (D33) ----------------------------------------------------

    def _hole_tier(self, cid: int) -> MadeTier:
        """The strength the hole cards contribute, by ``classify``'s rule, from
        the rank table instead of treys."""
        hole = _HOLES[cid]
        value = self._value_of[cid]
        made = tier_of(value)
        if len(self.board) == 5 and value7(self.board) == value:
            return MadeTier.HIGH_CARD  # the board plays
        hole_ranks = {_RANK[_CARD[c]] for c in hole}
        counts = [0] * 13
        for c in (*hole, *self.board):
            counts[_RANK[_CARD[c]]] += 1
        if made == MadeTier.QUADS:
            return MadeTier.QUADS if counts.index(4) in hole_ranks else MadeTier.HIGH_CARD
        if made >= MadeTier.STRAIGHT:
            return made
        if made == MadeTier.TRIPS:
            playing = [r for r in range(13) if counts[r] == 3]
        elif made == MadeTier.TWO_PAIR:
            playing = [r for r in range(12, -1, -1) if counts[r] == 2][:2]
        elif made == MadeTier.PAIR:
            playing = [r for r in range(13) if counts[r] == 2]
        else:
            return MadeTier.HIGH_CARD
        own = [r for r in playing if r in hole_ranks]
        if not own:
            return MadeTier.HIGH_CARD
        if made == MadeTier.TRIPS:
            return MadeTier.TRIPS
        return MadeTier.TWO_PAIR if len(own) == 2 else MadeTier.PAIR

    def _bluff_ranking(self) -> dict[int, float]:
        top_board = max(_RANK[_CARD[c]] for c in self.board)
        scored = []
        for cid in self.live.tolist():
            if self._hole_tier(cid) != MadeTier.HIGH_CARD:
                continue
            hole = _HOLES[cid]
            d = self.draws(hole)
            if d.flush or d.oesd or d.gutshot:
                continue
            ranks = [_RANK[_CARD[c]] for c in hole]
            # D33's score x 120, in integers so equal scores compare equal:
            # 0.3 per hole card above the board, 0.25 backdoor flush, 0.15 backdoor
            # straight, 0.3 x (top hole rank index / 12).
            score = (
                36 * sum(r > top_board for r in ranks)
                + 30 * d.backdoor_flush
                + 18 * d.backdoor_straight
                + 3 * max(ranks)
            )
            scored.append((-score, cid))
        scored.sort()
        n = len(scored)
        self._bluff_ids = np.array([cid for _s, cid in scored], dtype=np.int64)
        return {cid: rank / n for rank, (_s, cid) in enumerate(scored)}

    def bluff_quantile(self, hole: Sequence[str]) -> float:
        """Where ``hole`` ranks among this board's air combos (no pair of the
        hole's own, no flush draw, open-ender or gutshot), sorted by D33's bluff
        score, best first, ties by combo id: rank / count, in [0, 1). A holding
        that is not air returns 1.0, so it never falls in an air bluff slice."""
        cid = self._hole(hole)[2]
        return self._bluff_table().get(cid, 1.0)

    def _bluff_table(self) -> dict[int, float]:
        ranking = self._bluff
        if ranking is None:
            ranking = self._bluff_ranking()
            self._bluff = ranking
        return ranking

    def bluff_order(self) -> np.ndarray:
        """The combo ids ``bluff_quantile`` ranks (the board's air), best bluff
        candidate first: D33's score, ties by combo id."""
        self._bluff_table()
        assert self._bluff_ids is not None
        return self._bluff_ids


_CACHE: OrderedDict[tuple[str, ...], BoardCache] = OrderedDict()
_CACHE_SIZE = 64
_CACHE_LOCK = threading.Lock()


def board_cache(board: Sequence[str]) -> BoardCache:
    """The shared ``BoardCache`` of ``board``, in deal order (the last 64 boards
    are kept). Thread-safe: concurrent callers get one object."""
    key = tuple(board)
    with _CACHE_LOCK:
        cache = _CACHE.get(key)
        if cache is not None:
            _CACHE.move_to_end(key)
            return cache
    cache = BoardCache(key)  # outside the lock; a racing build is discarded
    with _CACHE_LOCK:
        cache = _CACHE.setdefault(key, cache)
        _CACHE.move_to_end(key)
        while len(_CACHE) > _CACHE_SIZE:
            _CACHE.popitem(last=False)
    return cache
