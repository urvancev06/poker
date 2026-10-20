"""The numpy vector path (poker.math.vector): a whole runouts x holdings value
matrix from one broadcast add and one searchsorted into the rank table, and the
exact per-combo equity vectors built on it (the hero against each of the 1,326
villain combos, every runout counted).

treys enumeration is the oracle for the vectors. The flop oracle over every
valid combo is about a million treys evaluations, so the default run checks a
seeded sample of combos and ``-m slow`` checks them all.
"""

from __future__ import annotations

import itertools

import numpy as np
import pytest
from treys import Card, Evaluator

from poker.math.cards import FULL_DECK, canonical_combo
from poker.math.ranktable import value7
from poker.math.vector import (
    BLOCKED,
    COMBOS,
    INCIDENCE,
    card_index,
    combo_index,
    flop_matrix,
    flop_runouts,
    hero_runouts,
    hero_vs_all,
    is_flop_warm,
    values_matrix,
)
from poker.rng import stream

_EVAL = Evaluator()
_INT = {c: Card.new(c) for c in FULL_DECK}


def _score(cards) -> int:
    ints = [_INT[c] for c in cards]
    return 7463 - _EVAL.evaluate(ints[:2], ints[2:])


def _bruteforce(hero, board, villain, hero_scores: dict) -> tuple[float, float]:
    """(win, tie) of hero against one villain combo over every runout, by treys."""
    dead = set(hero) | set(board) | set(villain)
    rest = [c for c in FULL_DECK if c not in dead]
    wins = ties = n = 0
    for extra in itertools.combinations(rest, 5 - len(board)):
        full = [*board, *extra]
        h = hero_scores.get(extra)
        if h is None:
            h = hero_scores[extra] = _score([*hero, *full])
        v = _score([*villain, *full])
        wins += h > v
        ties += h == v
        n += 1
    return wins / n, ties / n


def _check_vector(hero, board, combos=None):
    win, tie, valid = hero_vs_all(hero, board)
    assert win.shape == tie.shape == valid.shape == (1326,)
    dead = set(hero) | set(board)
    ids = range(1326) if combos is None else combos
    checked = 0
    hero_scores: dict = {}
    for i in ids:
        villain = (FULL_DECK[COMBOS[i][0]], FULL_DECK[COMBOS[i][1]])
        if dead & set(villain):
            assert not valid[i]
            continue
        assert valid[i]
        w, t = _bruteforce(hero, board, villain, hero_scores)
        assert abs(win[i] - w) <= 1e-9 and abs(tie[i] - t) <= 1e-9, (villain, win[i], w, tie[i], t)
        checked += 1
    return checked


def test_combos_are_canonical_and_indexed():
    assert COMBOS.shape == (1326, 2) and COMBOS.dtype == np.int8
    assert len({tuple(c) for c in COMBOS.tolist()}) == 1326
    assert np.all(COMBOS[:, 0] > COMBOS[:, 1]), "higher card first"
    assert card_index("2s") == 0 and card_index("2h") == 1 and card_index("Ac") == 51
    for i, (a, b) in enumerate(COMBOS.tolist()):
        ca, cb = FULL_DECK[a], FULL_DECK[b]
        assert (ca, cb) == canonical_combo(ca, cb)
        assert combo_index(ca, cb) == combo_index(cb, ca) == i


def test_incidence_marks_each_combos_two_cards():
    assert INCIDENCE.shape == (1326, 52) and INCIDENCE.dtype == bool
    assert np.all(INCIDENCE.sum(axis=1) == 2) and np.all(INCIDENCE.sum(axis=0) == 51)
    i = combo_index("Ah", "Kd")
    assert set(np.flatnonzero(INCIDENCE[i])) == {card_index("Ah"), card_index("Kd")}


def test_combo_index_rejects_a_pair_of_one_card():
    with pytest.raises(ValueError):
        combo_index("As", "As")


@pytest.mark.parametrize("k", [3, 4, 5])
def test_values_matrix_matches_scalar(k):
    rng = stream(11, "vec", k)
    boards = [rng.sample(FULL_DECK, k) for _ in range(500)]
    holes = [rng.sample(FULL_DECK, 2) for _ in range(50)]
    out = values_matrix(
        np.array([[card_index(c) for c in b] for b in boards], dtype=np.int8),
        np.array([[card_index(c) for c in h] for h in holes], dtype=np.int8),
    )
    assert out.shape == (500, 50) and out.dtype == np.int16
    compared = 0
    for r, board in enumerate(boards):
        for c, hole in enumerate(holes):
            if set(board) & set(hole):
                continue  # a blocked cell holds no defined value
            assert out[r, c] == value7([*hole, *board]), (hole, board)
            compared += 1
    assert compared > 15_000


def test_values_matrix_on_flush_boards():
    # Monotone and four-flush runouts, where only the flush part decides.
    boards = [["Ah", "Kh", "7h", "2h", "9c"], ["2h", "3h", "4h", "Kd", "Qc"], ["Th", "9h", "8h", "7h", "6h"]]
    rest = [c for c in FULL_DECK if c[1] == "h" or c[0] in "AK5"]
    holes = [h for h in itertools.combinations(rest, 2)]
    out = values_matrix(
        np.array([[card_index(c) for c in b] for b in boards], dtype=np.int8),
        np.array([[card_index(c) for c in h] for h in holes], dtype=np.int8),
    )
    for r, board in enumerate(boards):
        for c, hole in enumerate(holes):
            if not set(board) & set(hole):
                assert out[r, c] == _score([*hole, *board])


def test_river_vector_matches_bruteforce():
    assert _check_vector(("Ah", "Qh"), ("Kh", "9h", "6c", "3h", "Js")) == 990  # C(45, 2)


def test_turn_vector_matches_bruteforce():
    assert _check_vector(("Jc", "Tc"), ("9c", "8d", "2c", "3h")) == 1035  # C(46, 2)


def test_flop_vector_matches_bruteforce():
    hero, board = ("Ah", "5h"), ("Kh", "9h", "2c")
    rng = stream(12, "vec", "flop")
    sample = sorted(rng.sample(range(1326), 90))
    # Plus combos that make a flush, a set, two pair or a straight draw here.
    sample += [combo_index(*c) for c in [("Qh", "Jh"), ("9s", "9d"), ("Ks", "9c"), ("Ts", "Jd"), ("As", "Kd")]]
    assert _check_vector(hero, board, sample) >= 80


@pytest.mark.slow
def test_flop_vector_matches_bruteforce_every_combo():
    assert _check_vector(("Ah", "5h"), ("Kh", "9h", "2c")) == 1081


def test_blocked_combos_are_invalid():
    hero, board = ("As", "Kd"), ("Ah", "7c", "2d", "Ts")
    win, tie, valid = hero_vs_all(hero, board)
    dead = {card_index(c) for c in (*hero, *board)}
    blocked = np.array([a in dead or b in dead for a, b in COMBOS.tolist()])
    assert blocked.sum() == 1326 - 1035  # C(46, 2) combos miss the six dead cards
    assert np.array_equal(valid, ~blocked)
    assert np.all(win[blocked] == 0) and np.all(tie[blocked] == 0)
    assert np.all((win[valid] + tie[valid]) <= 1 + 1e-12)


def test_hero_vs_all_rejects_a_preflop_board():
    with pytest.raises(ValueError):
        hero_vs_all(("As", "Kd"), ())


def test_hero_runouts_mark_blocked_cells():
    hero, board = ("As", "Kd"), ("Ah", "7c", "2d", "Ts")
    h, v = hero_runouts(hero, board)
    assert h.shape == (46,) and v.shape == (46, 1326)
    # Each valid combo meets 44 of the 46 rivers; blocked combos meet none.
    n_valid = (v != BLOCKED).sum(axis=0)
    _, _, valid = hero_vs_all(hero, board)
    assert np.all(n_valid[valid] == 44) and np.all(n_valid[~valid] == 0)


def test_flop_matrix_is_cached():
    board = ("Qs", "8d", "3c")
    assert not is_flop_warm(board)
    m = flop_matrix(board)
    assert m.shape == (1176, 1326) and m.dtype == np.int16
    assert flop_matrix(board) is m
    assert is_flop_warm(board)
    # The flop's card order does not matter.
    assert flop_matrix(("3c", "Qs", "8d")) is m and is_flop_warm(("8d", "3c", "Qs"))
    with pytest.raises(ValueError):
        m[0, 0] = 1  # shared between callers, so read-only


def test_flop_matrix_values_and_blocks():
    board = ("Qs", "8d", "3c")
    m, runouts = flop_matrix(board), flop_runouts(board)
    assert runouts.shape == (1176, 2)
    rng = stream(13, "vec", "cells")
    for _ in range(3_000):
        r, c = rng.randrange(1176), rng.randrange(1326)
        turn, river = (FULL_DECK[i] for i in runouts[r])
        villain = [FULL_DECK[i] for i in COMBOS[c]]
        if {turn, river, *board} & set(villain):
            assert m[r, c] == BLOCKED
        else:
            assert m[r, c] == value7([*villain, *board, turn, river])


def test_flop_vector_warm_equals_cold():
    board = ("Td", "6s", "4h")
    hero = ("9c", "8c")
    cold = hero_vs_all(hero, board)
    assert is_flop_warm(board)
    warm = hero_vs_all(hero, board)
    for a, b in zip(cold, warm, strict=True):
        assert np.array_equal(a, b)
