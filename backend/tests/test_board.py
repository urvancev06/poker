"""BoardCache (poker.math.board): one sorted strength table per board, shared by
every bot and the coach.

``hs`` is a holding's percentile against every live holding on the board, with
exact card removal for the hero's own cards; ``h`` is the same against a
weighted range. treys is the oracle: the golden table was computed with it while
writing the plan, and the brute-force checks enumerate the holdings directly.
"""

from __future__ import annotations

import threading
import time
from fractions import Fraction

import numpy as np
import pytest
from treys import Card, Evaluator

from poker.math.board import BoardCache, board_cache
from poker.math.cards import FULL_DECK
from poker.math.draws import hole_draws
from poker.math.ranktable import value7
from poker.math.texture import texture
from poker.math.vector import COMBOS
from poker.rng import stream

_EVAL = Evaluator()
_INT = {c: Card.new(c) for c in FULL_DECK}


def _treys_value(hole, board) -> int:
    return 7463 - _EVAL.evaluate([_INT[c] for c in board], [_INT[c] for c in hole])


def _combo(i: int) -> tuple[str, str]:
    return FULL_DECK[COMBOS[i][0]], FULL_DECK[COMBOS[i][1]]


def _brute(hole, board, weights=None) -> float:
    """(wins + ties/2) / total over every holding disjoint from hole and board,
    weighted, by treys."""
    dead = set(hole) | set(board)
    me = _treys_value(hole, board)
    num = den = 0.0
    for i in range(1326):
        a, b = _combo(i)
        if a in dead or b in dead:
            continue
        w = 1.0 if weights is None else float(weights[i])
        if w == 0.0:
            continue
        v = _treys_value((a, b), board)
        num += w * (1.0 if me > v else 0.5 if me == v else 0.0)
        den += w
    return num / den


def _random_spot(rng, n_board: int) -> tuple[tuple[str, ...], tuple[str, str]]:
    cards = rng.sample(FULL_DECK, n_board + 2)
    return tuple(cards[:n_board]), (cards[n_board], cards[n_board + 1])


# --- hs ------------------------------------------------------------------------

_GOLDEN = [
    ("4s4h", "As Ad 9d 3c 6s", 0.6268),
    ("7c3d", "Ks Kh 9d 9c 2s", 0.1803),
    ("Ac8d", "Qs Qh Qd 5c 2s", 0.6025),
    ("Ah2c", "Kh 9h 6h 3h Js", 1.0000),
    ("8c4d", "Ks Kh 5d 5c Qs", 0.2667),
    ("AcQd", "2h 5h 9h Kh Js", 0.2051),
]


@pytest.mark.parametrize("hole,board,expected", _GOLDEN)
def test_hs_golden(hole, board, expected):
    h = (hole[:2], hole[2:])
    b = tuple(board.split())
    assert abs(board_cache(b).hs(h) - expected) <= 5e-4


@pytest.mark.parametrize("n_board", [3, 4, 5])
def test_hs_matches_bruteforce(n_board):
    rng = stream(2, "board-hs", n_board)
    for _ in range(4):
        board, hole = _random_spot(rng, n_board)
        assert abs(board_cache(board).hs(hole) - _brute(hole, board)) <= 1e-12


def test_hs_is_the_same_for_either_card_order():
    cache = board_cache(("As", "Ad", "9d", "3c", "6s"))
    assert cache.hs(("4s", "4h")) == cache.hs(("4h", "4s"))


def test_value_matches_value7_and_treys():
    rng = stream(2, "board-value")
    for _ in range(50):
        board, hole = _random_spot(rng, rng.choice((3, 4, 5)))
        cache = board_cache(board)
        assert cache.value(hole) == value7([*hole, *board]) == _treys_value(hole, board)


def test_a_hole_on_the_board_is_refused():
    cache = board_cache(("As", "Ad", "9d"))
    with pytest.raises(ValueError):
        cache.hs(("As", "Kh"))
    with pytest.raises(ValueError):
        cache.h(("Kh", "Kh"), np.ones(1326), key="x")


def test_board_size_is_checked():
    for bad in ((), ("As", "Kd"), ("As", "Kd", "Qh", "Jc", "Ts", "9s")):
        with pytest.raises(ValueError):
            board_cache(bad)
    with pytest.raises(ValueError):
        board_cache(("As", "As", "Kd"))


# --- h (weighted) ----------------------------------------------------------------


def test_h_uniform_equals_hs():
    rng = stream(2, "board-uniform")
    ones = np.ones(1326)
    for n_board in (3, 4, 5):
        board, hole = _random_spot(rng, n_board)
        cache = board_cache(board)
        assert abs(cache.h(hole, ones, key="uniform") - cache.hs(hole)) <= 1e-12


def test_h_matches_bruteforce_weighted():
    rng = stream(2, "board-weighted")
    for i in range(50):
        board, hole = _random_spot(rng, rng.choice((3, 4, 5)))
        np_rng = np.random.default_rng(i)
        weights = np_rng.random(1326) * (np_rng.random(1326) < 0.3)  # sparse, uneven
        got = board_cache(board).h(hole, weights, key=f"w{i}")
        assert abs(got - _brute(hole, board, weights)) <= 1e-12, (board, hole)


def test_h_caches_the_prefix_table_under_the_key():
    board = ("Kh", "9h", "6h", "3h", "Js")
    cache = board_cache(board)
    hole = ("Qd", "Qc")
    tight = np.zeros(1326)
    for i in range(1326):  # every flush: a range the queens never beat
        a, b = _combo(i)
        if (a[1] == "h" or b[1] == "h") and not {a, b} & set(board):
            tight[i] = 1.0
    first = cache.h(hole, tight, key="flushes")
    assert first == 0.0
    # Same key: the stored table answers, whatever weights are passed.
    assert cache.h(hole, np.ones(1326), key="flushes") == first
    assert cache.h(hole, np.ones(1326), key="all") == cache.hs(hole)


def test_h_with_no_open_weight_falls_back_to_hs():
    board = ("As", "Ad", "9d", "3c", "6s")
    cache = board_cache(board)
    hole = ("Kc", "Kd")
    weights = np.zeros(1326)
    for i in range(1326):  # only combos holding the hero's kings: all blocked
        a, b = _combo(i)
        if {a, b} & {"Kc", "Kd"}:
            weights[i] = 1.0
    assert cache.h(hole, weights, key="blocked") == cache.hs(hole)
    assert cache.h(hole, np.zeros(1326), key="zero") == cache.hs(hole)


def test_h_rejects_a_bad_weight_shape():
    with pytest.raises(ValueError):
        board_cache(("As", "Ad", "9d")).h(("Kc", "Kd"), np.ones(10), key="short")


# --- the rest of the cache -----------------------------------------------------


def test_cache_is_shared():
    b = ("Qs", "Qh", "Qd", "5c", "2s")
    assert board_cache(b) is board_cache(b)
    assert isinstance(board_cache(b), BoardCache)
    assert board_cache(list(b)) is board_cache(b)


def test_cache_is_shared_across_threads():
    b = ("7s", "8d", "Tc", "2h")
    seen = []
    barrier = threading.Barrier(8)

    def worker():
        barrier.wait()
        seen.append(board_cache(b))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len({id(c) for c in seen}) == 1


def test_live_texture_and_draws():
    board = ("Kh", "9h", "2c")
    cache = board_cache(board)
    assert cache.board == board
    assert cache.texture == texture(board)
    expected_live = [i for i in range(1326) if not set(_combo(i)) & set(board)]
    assert list(cache.live) == expected_live and len(cache.live) == 1176
    d = cache.draws(("Ah", "5h"))
    assert d == hole_draws(("Ah", "5h"), board) and d.nut_flush
    assert cache.draws(("Ah", "5h")) is d  # memoised


def test_is_nuts():
    assert board_cache(("Kh", "9h", "6h", "3h", "Js")).is_nuts(("Ah", "2c"))
    # A set on the turn of a three-spade board: any flush beats it.
    assert not board_cache(("7s", "Ks", "2c", "9s")).is_nuts(("7h", "7d"))
    # The plan's flop case, as written: top set (KK) beats bottom set there.
    assert not board_cache(("7s", "Kd", "2c")).is_nuts(("7h", "7d"))
    assert board_cache(("7s", "Kd", "2c")).is_nuts(("Kh", "Ks"))
    # A board straight nobody can improve: everyone chops, so it is the nuts.
    assert board_cache(("Ts", "Jd", "Qc", "Kh", "Ad")).is_nuts(("2c", "3c"))


def _bluff_score(hole, board) -> Fraction:
    """D33's score, exactly (Fractions, so equal scores tie exactly)."""
    ranks = "23456789TJQKA"
    top = max(ranks.index(c[0]) for c in board)
    d = hole_draws(hole, board)
    return (
        Fraction(3, 10) * sum(ranks.index(c[0]) > top for c in hole)
        + Fraction(1, 4) * d.backdoor_flush
        + Fraction(3, 20) * d.backdoor_straight
        + Fraction(3, 10) * Fraction(max(ranks.index(c[0]) for c in hole), 12)
    )


def _is_air(hole, board) -> bool:
    from poker.math.classify import MadeTier, classify

    hc = classify(list(hole), list(board))
    d = hole_draws(hole, board)
    return hc.hole_tier == MadeTier.HIGH_CARD and not (d.flush or d.oesd or d.gutshot)


_BLUFF_BOARDS = [
    ("Kh", "9h", "2c"),
    ("Ts", "7s", "6d", "2c"),
    ("As", "Ad", "9d", "3c", "6s"),
    ("5c", "6d", "7h", "8s", "9c"),  # a board straight
    ("Ks", "Kh", "Kd", "Kc", "2s"),  # board quads
    ("Qs", "Qh", "Qd", "5c", "2s"),  # board trips
    ("2h", "5h", "9h", "Kh", "Jh"),  # a board flush
    ("8s", "8d", "4c", "4h"),  # a paired turn
]


@pytest.mark.parametrize("board", _BLUFF_BOARDS)
def test_bluff_quantile_matches_the_definition(board):
    cache = board_cache(board)
    air = [i for i in cache.live if _is_air(_combo(i), board)]
    order = sorted(air, key=lambda i: (-_bluff_score(_combo(i), board), i))
    for rank, i in enumerate(order):
        assert abs(cache.bluff_quantile(_combo(i)) - rank / len(order)) <= 1e-12
    air_set = set(air)
    not_air = [i for i in cache.live if i not in air_set]
    assert not_air or len(set(c[0] for c in board)) == 2  # on board quads every combo is air
    for i in not_air[:40]:
        assert cache.bluff_quantile(_combo(i)) == 1.0


def test_bluff_quantile_is_deterministic_and_in_range():
    rng = stream(2, "board-bluff")
    for _ in range(10):
        board, hole = _random_spot(rng, rng.choice((3, 4, 5)))
        q = board_cache(board).bluff_quantile(hole)
        assert 0.0 <= q <= 1.0
        fresh = BoardCache(board)  # a separate build gives the same answer
        assert fresh.bluff_quantile(hole) == q
        assert fresh.bluff_quantile((hole[1], hole[0])) == q


def test_build_cost_per_river_board():
    rng = stream(2, "board-cost")
    boards = [tuple(rng.sample(FULL_DECK, 5)) for _ in range(40)]
    BoardCache(boards[0]).hs(("2s", "3s") if not {"2s", "3s"} & set(boards[0]) else ("4d", "5d"))
    t0 = time.perf_counter()
    for b in boards:
        BoardCache(b)
    per = (time.perf_counter() - t0) / len(boards)
    assert per < 3e-3, f"{per * 1e3:.2f} ms per river board"


def test_every_holding_counts_once():
    # Each unordered pair of disjoint holdings shares exactly one point between
    # its two orders (a win and a loss, or two half-ties), so the hs of every
    # live holding sums to half the number of live holdings.
    board = ("Qs", "Qh", "Qd", "5c", "2s")
    cache = board_cache(board)
    hs_sum = sum(cache.hs(_combo(i)) for i in cache.live)
    assert abs(hs_sum - len(cache.live) / 2) <= 1e-9
