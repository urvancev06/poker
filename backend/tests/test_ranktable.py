"""The rank table (poker.math.ranktable): one precomputed table of every 5-, 6-
and 7-card rank multiset plus an 8,192-entry flush-mask table, read by a scalar
path (prime products, for bots and the simulator) and by the numpy vector path
(base-5 rank-count keys, poker.math.vector).

treys is the oracle: ``value7(cards) == 7463 - treys.evaluate(cards)``, so a
higher value is a stronger hand and values run 1 (7-5-4-3-2) to 7462 (royal).
"""

from __future__ import annotations

import itertools

import numpy as np
import pytest
from treys import Card, Evaluator

from poker.math.cards import FULL_DECK
from poker.math.classify import MadeTier
from poker.math.ranktable import (
    FLUSH_VALUES,
    PRIMES,
    RANK_KEYS,
    RANK_VALUES,
    STAMP,
    BoardRanker,
    tier_of,
    value7,
)
from poker.rng import stream

_EVAL = Evaluator()
_INT = {c: Card.new(c) for c in FULL_DECK}


def _treys_value(cards) -> int:
    ints = [_INT[c] for c in cards]
    return 7463 - _EVAL.evaluate(ints[:2], ints[2:])


def test_multiset_count():
    # 6,175 five-card + 18,395 six-card + 49,205 seven-card rank multisets, each
    # count <= 4.
    assert len(RANK_KEYS) == 73775
    assert len(RANK_VALUES) == 73775
    assert RANK_KEYS.dtype == np.int64 and RANK_VALUES.dtype == np.int16
    assert np.all(np.diff(RANK_KEYS) > 0), "keys must be sorted and unique"
    counts = (RANK_KEYS[:, None] // (5 ** np.arange(13))) % 5
    sizes = counts.sum(axis=1)
    assert [int((sizes == n).sum()) for n in (5, 6, 7)] == [6175, 18395, 49205]
    assert counts.max() == 4
    assert list(PRIMES) == [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]


def test_flush_table_covers_masks_of_five_to_seven_bits():
    assert FLUSH_VALUES.shape == (8192,) and FLUSH_VALUES.dtype == np.int16
    bits = np.array([bin(m).count("1") for m in range(8192)])
    reachable = (bits >= 5) & (bits <= 7)  # one suit holds at most 7 of 7 cards
    assert np.all(FLUSH_VALUES[~reachable] == 0)
    assert np.all(FLUSH_VALUES[reachable] >= 5864), "every 5-7 card suit is a flush or better"
    # A-K-Q-J-T in one suit is the royal flush, the best value there is.
    assert FLUSH_VALUES[0b1111100000000] == 7462


def test_scalar_matches_treys_random():
    mismatches = 0
    for i in range(20_000):
        cards = stream(1, "rt", i).sample(FULL_DECK, 7)
        if value7(cards) != _treys_value(cards):
            mismatches += 1
    assert mismatches == 0


@pytest.mark.parametrize("n", [5, 6])
def test_5_and_6_card_hands_match_treys(n):
    mismatches = 0
    for i in range(5_000):
        cards = stream(n, "rt", i).sample(FULL_DECK, n)
        if value7(cards) != _treys_value(cards):
            mismatches += 1
    assert mismatches == 0


def test_wheel_steel_wheel_and_royal():
    royal = value7(["As", "Ks", "Qs", "Js", "Ts", "2d", "3c"])
    king_sf = value7(["Ks", "Qs", "Js", "Ts", "9s", "2d", "3c"])
    steel_wheel = value7(["As", "2s", "3s", "4s", "5s", "Kd", "Kc"])
    quad_aces = value7(["As", "Ah", "Ad", "Ac", "Ks", "2d", "3c"])
    six_high_straight = value7(["2s", "3h", "4d", "5c", "6s", "Kd", "Jc"])
    wheel = value7(["As", "2h", "3d", "4c", "5s", "Kd", "Jc"])
    trip_aces = value7(["As", "Ah", "Ad", "9c", "5s", "Kd", "Jc"])
    seven_high = value7(["7s", "5h", "4d", "3c", "2s"])
    assert royal == 7462
    assert royal > king_sf > steel_wheel > quad_aces
    assert six_high_straight > wheel > trip_aces
    assert seven_high == 1
    # A flush beats a straight even when the straight is in the same seven cards.
    assert value7(["9s", "Ts", "Js", "Qd", "Ks", "2s", "4c"]) > value7(["9s", "Th", "Js", "Qd", "Ks", "2s", "4c"])


def test_tier_of_matches_treys_rank_class():
    # treys rank class 1 = straight flush ... 9 = high card (0 = royal, also a
    # straight flush); MadeTier runs 1 = high card ... 9 = straight flush.
    for i in range(3_000):
        cards = stream(2, "rt", i).sample(FULL_DECK, 7)
        ints = [_INT[c] for c in cards]
        cls = _EVAL.get_rank_class(_EVAL.evaluate(ints[:2], ints[2:]))
        expected = MadeTier.STRAIGHT_FLUSH if cls == 0 else MadeTier(10 - cls)
        assert tier_of(value7(cards)) == expected
    assert tier_of(7462) == MadeTier.STRAIGHT_FLUSH
    assert tier_of(1) == MadeTier.HIGH_CARD


def test_tier_of_boundaries():
    # Every tier's lowest and highest value, from treys' own class limits.
    edges = [
        (1, 1277, MadeTier.HIGH_CARD),
        (1278, 4137, MadeTier.PAIR),
        (4138, 4995, MadeTier.TWO_PAIR),
        (4996, 5853, MadeTier.TRIPS),
        (5854, 5863, MadeTier.STRAIGHT),
        (5864, 7140, MadeTier.FLUSH),
        (7141, 7296, MadeTier.FULL_HOUSE),
        (7297, 7452, MadeTier.QUADS),
        (7453, 7462, MadeTier.STRAIGHT_FLUSH),
    ]
    for lo, hi, tier in edges:
        assert tier_of(lo) == tier and tier_of(hi) == tier


def test_board_ranker_matches_value7():
    for i in range(200):
        rng = stream(3, "rt", i)
        board = rng.sample(FULL_DECK, 3 + i % 3)
        ranker = BoardRanker(board)
        rest = [c for c in FULL_DECK if c not in board]
        holes = list(itertools.combinations(rest, 2))
        assert len(holes) == {3: 1176, 4: 1128, 5: 1081}[len(board)]
        for hole in holes:
            assert ranker.value(hole) == value7([*hole, *board]), (hole, board)


def test_board_ranker_values_all_holes_at_once():
    board = ["Kh", "9h", "6h", "3h", "Js"]
    ranker = BoardRanker(board)
    rest = [c for c in FULL_DECK if c not in board]
    holes = list(itertools.combinations(rest, 2))
    assert ranker.values(holes) == [ranker.value(h) for h in holes]


def test_build_is_deterministic():
    from scripts.build_rank_table import build, build_stamp

    arrays = build()
    assert build_stamp() == STAMP
    assert np.array_equal(arrays["rank_keys"], RANK_KEYS)
    assert np.array_equal(arrays["rank_values"], RANK_VALUES)
    assert np.array_equal(arrays["flush_values"], FLUSH_VALUES)
    assert str(arrays["stamp"]) == STAMP
