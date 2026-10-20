"""Equity: the hero's expected share of the pot against one or more ranges.

Two families live here.

``equity()`` is the Monte Carlo oracle via treys, unchanged: each opponent is a
*range* (a set of combos from ``ranges.py``) or an unknown random hand, and
trials sample holdings plus the rest of the board.

``equity_vs_ranges()`` is equity v2 (decision D17). Each villain is a weighted
range, 1,326 non-negative weights in ``vector.COMBOS`` order
(``weights_from_combos`` builds one). It picks the method by the spot:

==========================  ==========================================  ===============
spot                        method                                      ``method``
==========================  ==========================================  ===============
preflop, one villain        the precomputed table (``preflop_table``)   "preflop_table"
preflop, two or more        joint weighted sampling                     "sampled"
turn or river, 1-2          exact: every runout, every combo pairing    "exact"
flop, 1-2, matrix warm      exact, from the cached flop matrix          "exact"
flop, 1-2, matrix cold      exact, valuing only the ranges' combos      "exact"
any street, three or more   joint weighted sampling                     "sampled"
==========================  ==========================================  ===============

The cold flop departs from D17, which sampled there: valuing every runout for
just the combos the ranges hold costs runouts x combos (7 ms for a 226-combo
range, 18 ms for 534, 72 ms for all 1,326), less than the sampled fallback was
budgeted at, and it gives the warm path's numbers. So the method never depends
on what happens to be cached, and the coach and the review agree on the flop.
``flop_exact=False`` (or ``stratified_flop_equity``) still samples.

* **Exact two-way.** Over each runout, with the hero's beat and tie indicators
  ``b`` and ``t`` per combo and the villains' valid weights A and B, the hero's
  share of the disjoint pairs is ``sum [b1 b2 + (b1 t2 + t1 b2)/2 + t1 t2/3] A B``.
  Each term is ``S(X, Y) = (sum X)(sum Y) - sum_k (X Inc)_k (Y Inc)_k + sum_c X_c
  Y_c`` with ``Inc`` the 1,326 x 52 card-incidence matrix: every pair, minus the
  pairs that share a card, plus the identical pairs counted twice by that. The
  result is normalised by ``S(A, B)``. A product of two heads-up equities is
  wrong whenever the villains want the same cards.
* **Joint sampling.** Every villain's combo is drawn from its weights together,
  and the whole draw is rejected when two villains share a card (a sequential
  draw is biased). The runout is dealt from what is left. ``se`` is the standard
  error of the mean share. Draws come from ``stream(0, "equity", key)``, so the
  same decision key always gives the same number (the coach and the review
  agree).
* **Stratified flop** (on request). Each of the 47 turn cards gets twelve
  seeded rivers in a balanced design (every card is also a river twelve times);
  each runout is counted exactly over every combo (pairing). The equity is the
  ratio of the summed shares to the summed weights, and ``se`` comes from the
  spread between the twelve offset replicates of the design. The plan's six
  rivers missed its own 1.5 pp bar on 4 of 200 coach-like spots (max 1.89 pp);
  twelve kept all of 400 inside it (max 1.39 pp, median 0.19 pp).

A range whose every weighted combo meets the hero or the board is dropped (and
counted in ``dropped``); the equity is against the rest. No range left, or
ranges that cannot all be held at once, raise ValueError.
"""

from __future__ import annotations

import math
import random
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import TypeAlias

import numpy as np
from treys import Card, Evaluator

from .cards import FULL_DECK, Combo
from .preflop_table import BOARDS_PER_CLASS, preflop_equity
from .ranktable import FLUSH_VALUES, RANK_KEYS, RANK_VALUES
from .vector import BLOCKED, COMBOS, INCIDENCE, combo_index, flop_matrix, flop_runouts, is_flop_warm, values_matrix

_EVAL = Evaluator()
# Cache the treys int for every card string once.
_INT = {c: Card.new(c) for c in FULL_DECK}

# An opponent is a range (iterable of combos) or None / "random" for any hand.
Opponent: TypeAlias = set[Combo] | list[Combo] | None | str


@dataclass(frozen=True)
class EquityResult:
    win: float       # fraction of trials hero is sole best
    tie: float       # fraction hero ties for best
    lose: float      # fraction hero is beaten
    equity: float    # expected pot share (ties split by number sharing)
    trials: int
    # How it was computed: "exact", "sampled" or "preflop_table" (equity_vs_ranges);
    # equity() is always "sampled".
    method: str = "sampled"
    # Standard error of ``equity`` for equity_vs_ranges' sampled methods, else None.
    se: float | None = None
    # Ranges ignored because every weighted combo met the hero or the board.
    dropped: int = 0

    def as_pct(self) -> dict[str, float]:
        return {
            "win": round(self.win * 100, 2),
            "tie": round(self.tie * 100, 2),
            "lose": round(self.lose * 100, 2),
            "equity": round(self.equity * 100, 2),
        }


def _is_range(opp: Opponent) -> bool:
    return not (opp is None or (isinstance(opp, str) and opp == "random"))


def _sample_opponent(
    opp: Opponent, used: set[str], deck: list[str], rng: random.Random
) -> tuple[str, str] | None:
    """Pick a holding for one opponent that avoids ``used`` cards."""
    if _is_range(opp):
        combos = opp if isinstance(opp, (list, tuple)) else list(opp)
        for _ in range(64):  # rejection sample
            a, b = rng.choice(combos)
            if a not in used and b not in used:
                return (a, b)
        return None  # range fully blocked in this trial
    # random unknown hand: any two free cards
    free = [c for c in deck if c not in used]
    if len(free) < 2:
        return None
    a, b = rng.sample(free, 2)
    return (a, b)


def equity(
    hero: tuple[str, str] | list[str],
    board: tuple[str, ...] | list[str] = (),
    opponents: list[Opponent] | None = None,
    trials: int = 10_000,
    seed: int | None = None,
) -> EquityResult:
    """Equity of ``hero`` (2 cards) on ``board`` (0–5 cards) vs ``opponents``
    (default: one random hand)."""
    if opponents is None:
        opponents = [None]
    rng = random.Random(seed)

    hero = list(hero)
    board = list(board)
    hero_int = [_INT[c] for c in hero]
    board_int = [_INT[c] for c in board]
    need = 5 - len(board)

    # Materialise range opponents to lists once (faster sampling).
    opps = [list(o) if _is_range(o) else o for o in opponents]

    wins = ties = 0
    share_sum = 0.0
    completed = 0
    attempts = 0

    while completed < trials:
        used = set(hero) | set(board)
        holdings: list[list[int]] = []
        ok = True
        for o in opps:
            pick = _sample_opponent(o, used, FULL_DECK, rng)
            if pick is None:
                ok = False
                break
            used.add(pick[0])
            used.add(pick[1])
            holdings.append([_INT[pick[0]], _INT[pick[1]]])
        if not ok:
            # The opponent's range is fully blocked by the hero's cards and the board.
            # Drop the trial from the denominator entirely: counting it would land it
            # in `lose` and bias equity down. `attempts` bounds the loop so a range
            # that is always blocked can't spin forever.
            attempts += 1
            if attempts > trials * 4:
                break
            continue

        if need:
            free = [c for c in FULL_DECK if c not in used]
            drawn = rng.sample(free, need)
            full_board = board_int + [_INT[c] for c in drawn]
        else:
            full_board = board_int

        hero_score = _EVAL.evaluate(full_board, hero_int)
        opp_scores = [_EVAL.evaluate(full_board, h) for h in holdings]
        best_opp = min(opp_scores)

        if hero_score < best_opp:
            wins += 1
            share_sum += 1.0
        elif hero_score > best_opp:
            pass  # lose
        else:
            ties += 1
            sharers = 1 + sum(1 for s in opp_scores if s == hero_score)
            share_sum += 1.0 / sharers
        completed += 1

    # Denominator is the trials that reached a showdown; `or 1` returns zeros
    # rather than dividing by zero when every trial was blocked.
    n = completed or 1
    return EquityResult(
        win=wins / n,
        tie=ties / n,
        lose=(n - wins - ties) / n,
        equity=share_sum / n,
        trials=completed,
    )


# --- equity v2: weighted ranges (decision D17) -------------------------------------

_CARD_INDEX = {c: i for i, c in enumerate(FULL_DECK)}
_INC = INCIDENCE.astype(np.float64)  # (1326, 52)
_KEY = (5 ** (np.arange(52) // 4)).astype(np.int64)  # base-5 rank key of each card
_BIT = (1 << (np.arange(52) // 4)).astype(np.int64)
_STRATIFIED_RIVERS = 12  # rivers per turn card in the stratified flop sample


def weights_from_combos(combos: Iterable[Combo] | Mapping[Combo, float]) -> np.ndarray:
    """1,326 weights in ``vector.COMBOS`` order: 1.0 for each combo listed (either
    card order), or the mapping's weight (``ranges.parse_weighted``'s output)."""
    w = np.zeros(1326, dtype=np.float64)
    if isinstance(combos, Mapping):
        for (a, b), weight in combos.items():
            w[combo_index(a, b)] = float(weight)
    else:
        for a, b in combos:
            w[combo_index(a, b)] = 1.0
    return w


def _cards(hero: Sequence[str], board: Sequence[str]) -> tuple[list[int], list[int]]:
    hero_idx = [_CARD_INDEX.get(c, -1) for c in hero]
    board_idx = [_CARD_INDEX.get(c, -1) for c in board]
    if len(hero_idx) != 2 or len(board) not in (0, 3, 4, 5):
        raise ValueError(f"need two hole cards and 0, 3, 4 or 5 board cards, got {list(hero)} {list(board)}")
    every = hero_idx + board_idx
    if -1 in every or len(set(every)) != len(every):
        raise ValueError(f"not a hand: {list(hero)} on {list(board)}")
    return hero_idx, board_idx


def _open_ranges(ranges: Sequence[np.ndarray], dead: list[int]) -> tuple[list[np.ndarray], int]:
    """Each range's weights with the combos that meet ``dead`` zeroed, and how many
    ranges were left with no weight at all (dropped)."""
    blocked = INCIDENCE[:, dead].any(axis=1)
    open_, dropped = [], 0
    for r in ranges:
        w = np.array(r, dtype=np.float64)
        if w.shape != (1326,):
            raise ValueError(f"a range is 1326 weights, got shape {w.shape}")
        if not np.all(np.isfinite(w)) or np.any(w < 0):
            raise ValueError("range weights must be finite and non-negative")
        w[blocked] = 0.0
        if np.any(w > 0):
            open_.append(w)
        else:
            dropped += 1
    if not open_:
        raise ValueError("every villain range is blocked by the hero's cards and the board")
    return open_, dropped


def _per_runout(h: np.ndarray, v: np.ndarray, ws: list[np.ndarray], inc: np.ndarray) -> tuple[np.ndarray, ...]:
    """Per runout: the weight of the hero's sole wins, ties and pot share, and the
    total weight, over the valid villain combos (one villain) or the disjoint
    pairs of combos (two). ``h`` is (R,); ``v`` is (R, C) with BLOCKED cells, for
    the C combos whose weights are ``ws`` and whose card incidence is ``inc``."""
    valid = v != BLOCKED
    beat = h[:, None] > v
    tie = h[:, None] == v
    if len(ws) == 1:
        (w,) = ws
        total = valid @ w
        win = beat @ w
        tied = tie @ w
        return win, tied, win + tied / 2, total

    w1, w2 = ws
    parts = {}
    for name, m in (("a", valid), ("b", beat), ("t", tie)):
        x1 = m * w1
        x2 = m * w2
        parts[name] = (x1, x1.sum(axis=1), x1 @ inc, x2, x2.sum(axis=1), x2 @ inc)

    def pairs(p: str, q: str) -> np.ndarray:
        """S(X, Y) per runout: X from villain 1's ``p`` part, Y from villain 2's ``q``."""
        x, sx, xi, _y, _sy, _yi = parts[p]
        _x, _sx, _xi, y, sy, yi = parts[q]
        return sx * sy - np.einsum("rk,rk->r", xi, yi) + np.einsum("rc,rc->r", x, y)

    bb, bt, tb, tt = pairs("b", "b"), pairs("b", "t"), pairs("t", "b"), pairs("t", "t")
    total = pairs("a", "a")
    return bb, bt + tb + tt, bb + (bt + tb) / 2 + tt / 3, total


def _runout_sums(hero_idx: list[int], board_idx: list[int], ws: list[np.ndarray], runouts: np.ndarray,
                 matrix: np.ndarray | None = None, rows: np.ndarray | None = None) -> tuple[np.ndarray, ...]:
    """``_per_runout`` on the given runouts (R, 5 - len(board)), for only the
    combos some range weights (open weights are already 0 on the hero's and the
    board's cards), so the cost is runouts x the ranges' combos. The villain
    values are computed, or read from ``matrix[rows]`` (the cached flop matrix,
    whose cells are already BLOCKED where a combo meets the flop or runout)."""
    support = np.flatnonzero(np.any([w > 0 for w in ws], axis=0))
    board_cols = np.broadcast_to(np.array(board_idx, dtype=np.intp), (len(runouts), len(board_idx)))
    boards = np.concatenate([board_cols, runouts], axis=1)
    if matrix is not None:
        v = matrix[np.ix_(rows, support)]
    else:
        v = values_matrix(boards, COMBOS[support])
        inc = INCIDENCE[support]
        hit = np.zeros(v.shape, dtype=bool)
        for col in range(runouts.shape[1]):
            hit |= inc[:, runouts[:, col]].T
        v[hit] = BLOCKED
    h = values_matrix(boards, np.array([hero_idx]))[:, 0]
    return _per_runout(h, v, [w[support] for w in ws], _INC[support])


def _all_runouts(dead: list[int], need: int) -> np.ndarray:
    """Every set of ``need`` cards outside ``dead``, (R, need)."""
    rest = np.array([c for c in range(52) if c not in set(dead)], dtype=np.intp)
    if need == 0:
        return np.zeros((1, 0), dtype=np.intp)
    if need == 1:
        return rest[:, None]
    i, j = np.triu_indices(len(rest), k=1)
    return np.stack([rest[i], rest[j]], axis=1)


def _result(win: float, tie: float, share: float, total: float, trials: int, method: str,
            se: float | None, dropped: int) -> EquityResult:
    if total <= 0:
        raise ValueError("the villain ranges cannot all be held at once on this board")
    w, t = win / total, tie / total
    return EquityResult(win=w, tie=t, lose=max(0.0, 1.0 - w - t), equity=share / total, trials=trials,
                        method=method, se=se, dropped=dropped)


def _exact(board: Sequence[str], hero_idx: list[int], board_idx: list[int], ws: list[np.ndarray],
           dropped: int, use_matrix: bool) -> EquityResult:
    """Exact equity against one or two ranges, over every runout and only the
    combos the ranges weight. ``use_matrix`` (flop only) reads the villain
    values from the cached flop matrix, building it if needed; otherwise they
    are computed. Both visit the same runouts in the same order, so they give
    the same numbers."""
    if use_matrix:
        matrix, all_runouts = flop_matrix(board), flop_runouts(board)
        rows = np.flatnonzero(~np.isin(all_runouts, hero_idx).any(axis=1))
        runouts = all_runouts[rows].astype(np.intp)
        sums = _runout_sums(hero_idx, board_idx, ws, runouts, matrix, rows)
    else:
        runouts = _all_runouts(hero_idx + board_idx, 5 - len(board_idx))
        sums = _runout_sums(hero_idx, board_idx, ws, runouts)
    win, tie, share, total = (float(x.sum()) for x in sums)
    return _result(win, tie, share, total, len(runouts), "exact", None, dropped)


def _stratified_runouts(hero: Sequence[str], board: Sequence[str], *, key: str,
                        rivers: int = _STRATIFIED_RIVERS) -> np.ndarray:
    """The stratified flop sample: (47 x rivers, 2) (turn, river) card indices.

    Every turn card gets ``rivers`` rivers, in a balanced design: the 47 live
    cards in a seeded random order, and river = the card ``o`` places further
    round the circle for ``rivers`` seeded offsets ``o`` in 1-23. So every card
    is also a river exactly ``rivers`` times, a card's own effect on the hand is
    counted at its true rate, and no runout repeats (all 23 offsets would be
    every runout once). Row ``j * 47 + i`` has offset ``j``.
    """
    from ..rng import stream  # here, not at the top: poker.rng imports poker.math

    hero_idx, board_idx = _cards(hero, board)
    rng = stream(0, "equity", key)
    order = [c for c in range(52) if c not in set(hero_idx + board_idx)]
    rng.shuffle(order)
    offsets = rng.sample(range(1, (len(order) + 1) // 2), rivers)
    n = len(order)
    return np.array([(order[i], order[(i + o) % n]) for o in offsets for i in range(n)], dtype=np.intp)


def stratified_flop_equity(hero: Sequence[str], board: Sequence[str], ranges: Sequence[np.ndarray], *,
                           key: str, rivers: int = _STRATIFIED_RIVERS) -> EquityResult:
    """Flop equity against one or two weighted ranges from 47 x ``rivers`` of
    the 1,081 runouts (564 by default): every turn card with seeded rivers
    (``_stratified_runouts``), every combo counted exactly on each. ``se`` is
    the standard error of the equity, from the spread between the offset
    replicates (each a balanced sample of 47 runouts; ``rivers`` of the 23
    possible, so with the finite-population correction)."""
    hero_idx, board_idx = _cards(hero, board)
    if len(board_idx) != 3:
        raise ValueError(f"stratified sampling is for the flop, got {len(board_idx)} board cards")
    ws, dropped = _open_ranges(ranges, hero_idx + board_idx)
    if len(ws) > 2:
        raise ValueError("stratified flop equity takes one or two ranges")
    if not 2 <= rivers <= 22:
        raise ValueError(f"rivers per turn must be 2-22, got {rivers}")
    runouts = _stratified_runouts(hero, board, key=key, rivers=rivers)
    win, tie, share, total = _runout_sums(hero_idx, board_idx, ws, runouts)

    big_t = float(total.sum())
    if big_t <= 0:
        raise ValueError("the villain ranges cannot all be held at once on this board")
    eq = float(share.sum()) / big_t
    # A linearised ratio estimator over k of K = 23 offset replicates.
    k, big_k = rivers, (52 - 5) // 2
    d = (share - eq * total).reshape(k, -1).sum(axis=1)
    se = math.sqrt((1 - k / big_k) * k * d.var(ddof=1)) / big_t
    return _result(float(win.sum()), float(tie.sum()), float(share.sum()), big_t, len(runouts),
                   "sampled", se, dropped)


def _values7(cards: np.ndarray) -> np.ndarray:
    """Rank-table values of rows of seven card indices, (N, 7) -> (N,)."""
    values = RANK_VALUES[np.searchsorted(RANK_KEYS, _KEY[cards].sum(axis=1))].astype(np.int32)
    suits = cards % 4
    bits = _BIT[cards]
    for s in range(4):
        in_suit = suits == s
        rows = np.flatnonzero(in_suit.sum(axis=1) >= 5)
        if rows.size:
            mask = np.bitwise_or.reduce(np.where(in_suit[rows], bits[rows], 0), axis=1)
            values[rows] = np.maximum(values[rows], FLUSH_VALUES[mask])
    return values


def joint_sampled_equity(hero: Sequence[str], board: Sequence[str], ranges: Sequence[np.ndarray], *,
                         key: str, samples: int = 4000) -> EquityResult:
    """Equity against any number of weighted ranges by joint rejection sampling,
    seeded by ``key``. ``se`` is the standard error of the equity."""
    hero_idx, board_idx = _cards(hero, board)
    ws, dropped = _open_ranges(ranges, hero_idx + board_idx)
    from ..rng import stream  # here, not at the top: poker.rng imports poker.math

    gen = np.random.default_rng(stream(0, "equity", key).getrandbits(64))
    m = len(ws)
    ids = [np.flatnonzero(w) for w in ws]
    cums = [np.cumsum(w[i]) for w, i in zip(ws, ids, strict=True)]

    kept: list[np.ndarray] = []
    accepted = drawn = 0
    cap = max(50 * samples, 20_000)
    while accepted < samples and drawn < cap:
        rate = accepted / drawn if drawn else 1.0
        batch = min(cap - drawn, int((samples - accepted) / max(rate, 0.02) * 1.1) + 64)
        picks = np.stack(
            [i[np.searchsorted(c, gen.random(batch) * c[-1], side="right")] for i, c in zip(ids, cums, strict=True)],
            axis=1,
        )
        cards = np.sort(COMBOS[picks].reshape(batch, 2 * m).astype(np.intp), axis=1)
        ok = ~(cards[:, 1:] == cards[:, :-1]).any(axis=1)
        kept.append(picks[ok])
        accepted += int(ok.sum())
        drawn += batch
    if accepted == 0:
        raise ValueError("the villain ranges cannot all be held at once on this board")
    picks = np.concatenate(kept)[:samples]
    n = len(picks)
    villain_cards = COMBOS[picks].astype(np.intp)  # (n, m, 2)

    need = 5 - len(board_idx)
    full = np.empty((n, 5), dtype=np.intp)
    full[:, : len(board_idx)] = board_idx
    if need:
        base = np.array([c for c in range(52) if c not in set(hero_idx + board_idx)], dtype=np.intp)
        keys = gen.random((n, len(base)))
        pos = np.searchsorted(base, villain_cards.reshape(n, 2 * m))
        np.put_along_axis(keys, pos, 2.0, axis=1)  # villain cards are never dealt
        pick = np.argpartition(keys, need - 1, axis=1)[:, :need]
        full[:, len(board_idx):] = base[pick]

    hands = np.empty((n, m + 1, 7), dtype=np.intp)
    hands[:, :, :5] = full[:, None, :]
    hands[:, 0, 5:] = hero_idx
    hands[:, 1:, 5:] = villain_cards
    values = _values7(hands.reshape(n * (m + 1), 7)).reshape(n, m + 1)
    me, best = values[:, 0], values[:, 1:].max(axis=1)
    win = me > best
    tie = me == best
    share = np.where(win, 1.0, np.where(tie, 1.0 / (1 + (values[:, 1:] == me[:, None]).sum(axis=1)), 0.0))
    se = float(share.std(ddof=1) / math.sqrt(n)) if n > 1 else 0.5
    return _result(float(win.sum()), float(tie.sum()), float(share.sum()), float(n), n, "sampled", se, dropped)


def equity_vs_ranges(hero: Sequence[str], board: Sequence[str], ranges: Sequence[np.ndarray], *, key: str,
                     samples: int = 4000, flop_exact: bool | None = None) -> EquityResult:
    """The hero's equity against weighted villain ranges, by the method the spot
    calls for (see the module docstring). ``key`` seeds the sampled methods (the
    decision key). On the flop with one or two villains, ``flop_exact`` None is
    exact from the cached flop matrix when it is warm and from the ranges' own
    combos when it is not (the same numbers either way); True builds and uses
    the matrix; False samples (``stratified_flop_equity``)."""
    hero_idx, board_idx = _cards(hero, board)
    ws, dropped = _open_ranges(ranges, hero_idx + board_idx)
    if not board_idx:
        if len(ws) == 1:
            eq = preflop_equity(hero, ws[0])
            return EquityResult(win=eq, tie=0.0, lose=1.0 - eq, equity=eq, trials=BOARDS_PER_CLASS,
                                method="preflop_table", se=None, dropped=dropped)
        result = joint_sampled_equity(hero, board, ws, key=key, samples=samples)
    elif len(ws) >= 3:
        result = joint_sampled_equity(hero, board, ws, key=key, samples=samples)
    elif len(board_idx) == 3 and flop_exact is False:
        result = stratified_flop_equity(hero, board, ws, key=key)
    else:
        use_matrix = len(board_idx) == 3 and (flop_exact is True or is_flop_warm(board))
        return _exact(board, hero_idx, board_idx, ws, dropped, use_matrix)
    return EquityResult(result.win, result.tie, result.lose, result.equity, result.trials,
                        result.method, result.se, dropped)
