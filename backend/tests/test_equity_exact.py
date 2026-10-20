"""Equity v2 (poker.math.equity.equity_vs_ranges): which method runs (decision
D17) and that each is right.

* Heads-up and two-way on the turn and river, and on a warm flop: exact. Every
  runout and every combination of villain combos is counted, weighted, with
  exact card removal between the villains (inclusion-exclusion over the
  card-incidence matrix).
* A flop, heads-up or two-way: exact too, from the cached flop matrix when it
  is warm and from the ranges' own combos when it is not (the same numbers).
  Turn-stratified sampling (every turn card, twelve seeded rivers each, with a
  standard error) runs only on request.
* Three or more villains, or two or more preflop: joint weighted sampling.
  Every villain is drawn together and the whole draw is rejected on any card
  clash, seeded by the decision key.
* Preflop heads-up: the precomputed preflop table.

treys enumeration is the oracle. ``equity()`` stays the Monte Carlo oracle and
keeps its behaviour.
"""

from __future__ import annotations

import itertools
import math
import time

import numpy as np
import pytest
from treys import Card, Evaluator

from poker.math.cards import FULL_DECK
from poker.math.equity import (
    EquityResult,
    equity,
    equity_vs_ranges,
    joint_sampled_equity,
    stratified_flop_equity,
    weights_from_combos,
)
from poker.math.ranges import parse_range, parse_weighted
from poker.math.vector import COMBOS, combo_index, flop_matrix, is_flop_warm
from poker.rng import stream

_EVAL = Evaluator()
_INT = {c: Card.new(c) for c in FULL_DECK}


def _score(hole, board) -> int:
    return 7463 - _EVAL.evaluate([_INT[c] for c in board], [_INT[c] for c in hole])


def _combo(i: int) -> tuple[str, str]:
    return FULL_DECK[COMBOS[i][0]], FULL_DECK[COMBOS[i][1]]


def _bruteforce(hero, board, ranges) -> tuple[float, float, float]:
    """(win, tie, equity) by treys over every disjoint tuple of villain combos
    (weight = the product of their weights) and every runout."""
    dead = set(hero) | set(board)
    options = []
    for w in ranges:
        opts = [(_combo(i), float(w[i])) for i in np.flatnonzero(w) if not set(_combo(i)) & dead]
        if opts:
            options.append(opts)
    win = tie = share = total = 0.0
    for pick in itertools.product(*options):
        cards = [c for combo, _ in pick for c in combo]
        if len(set(cards)) != len(cards):
            continue
        weight = math.prod(w for _, w in pick)
        rest = [c for c in FULL_DECK if c not in dead and c not in cards]
        for extra in itertools.combinations(rest, 5 - len(board)):
            full = [*board, *extra]
            me = _score(hero, full)
            others = [_score(combo, full) for combo, _ in pick]
            best = max(others)
            if me > best:
                win += weight
                share += weight
            elif me == best:
                tie += weight
                share += weight / (1 + others.count(me))
            total += weight
    return win / total, tie / total, share / total


def _random_range(rng, n: int, dead=()) -> np.ndarray:
    """``n`` random combos (some may clash with ``dead``) with random weights in (0, 1]."""
    w = np.zeros(1326)
    for i in rng.sample(range(1326), n):
        w[i] = 1.0 - rng.random() * 0.9
    return w


def _spot(rng, n_board: int):
    cards = rng.sample(FULL_DECK, n_board + 2)
    return (cards[0], cards[1]), tuple(cards[2:])


def _close(result: EquityResult, expected, tol: float) -> None:
    win, tie, eq = expected
    assert abs(result.win - win) <= tol, (result, expected)
    assert abs(result.tie - tie) <= tol, (result, expected)
    assert abs(result.equity - eq) <= tol, (result, expected)
    assert abs(result.win + result.tie + result.lose - 1.0) <= 1e-12


# --- weights ---------------------------------------------------------------------


def test_weights_from_combos():
    w = weights_from_combos([("Ks", "Kh"), ("Kh", "Ks"), ("As", "Kd")])
    assert w.shape == (1326,) and w.dtype == np.float64
    assert w[combo_index("Ks", "Kh")] == 1.0 and w[combo_index("As", "Kd")] == 1.0
    assert w.sum() == 2.0
    weighted = weights_from_combos(parse_weighted("AKo:0.5, AA"))
    assert weighted[combo_index("As", "Ah")] == 1.0
    assert weighted[combo_index("As", "Kh")] == 0.5
    assert weighted.sum() == 6 * 1.0 + 12 * 0.5


# --- exact heads-up ------------------------------------------------------------


@pytest.mark.parametrize("n_board", [5, 4, 3])
def test_hu_exact_matches_bruteforce(n_board):
    rng = stream(5, "eq-hu", n_board)
    for _ in range(2):
        hero, board = _spot(rng, n_board)
        w = _random_range(rng, 20)
        expected = _bruteforce(hero, board, [w])
        # On the flop: the cold path (runouts x the range's combos) first, then the
        # cached flop matrix.
        for flop_exact in (None, True):
            got = equity_vs_ranges(hero, board, [w], key="hu", flop_exact=flop_exact)
            assert got.method == "exact" and got.se is None and got.dropped == 0
            _close(got, expected, 1e-9)


def test_river_equity_is_exact_and_deterministic():
    hero, board = ("Ah", "Kd"), ("Ad", "7c", "2s", "9h", "Kc")
    w = weights_from_combos(parse_range("AA, KK, 99, A7s+, AJo+, KQs"))
    a = equity_vs_ranges(hero, board, [w], key="x")
    b = equity_vs_ranges(hero, board, [w], key="y")
    assert a == b and a.method == "exact"


# --- exact two-way -----------------------------------------------------------------


@pytest.mark.parametrize("n_board", [5, 4])
def test_two_villain_exact_matches_joint_enumeration(n_board):
    rng = stream(5, "eq-two", n_board)
    for _ in range(3):
        hero, board = _spot(rng, n_board)
        w1, w2 = _random_range(rng, 10), _random_range(rng, 10)
        expected = _bruteforce(hero, board, [w1, w2])
        got = equity_vs_ranges(hero, board, [w1, w2], key="two")
        assert got.method == "exact" and got.se is None
        _close(got, expected, 1e-9)


def test_two_villain_exact_card_removal_between_villains():
    # Both villains want the same few cards: a naive product of the two heads-up
    # equities is visibly wrong here, the joint count is not.
    hero, board = ("Qs", "Qh"), ("Jd", "8c", "4s", "2h")
    w1 = weights_from_combos(parse_range("AA, AKs"))
    w2 = weights_from_combos(parse_range("AA, AK"))
    expected = _bruteforce(hero, board, [w1, w2])
    got = equity_vs_ranges(hero, board, [w1, w2], key="removal")
    _close(got, expected, 1e-9)
    hu1 = equity_vs_ranges(hero, board, [w1], key="a").equity
    hu2 = equity_vs_ranges(hero, board, [w2], key="b").equity
    assert abs(hu1 * hu2 - got.equity) > 0.005


def test_two_villain_exact_three_way_chops():
    # The board plays for everyone: a three-way chop, a third of the pot each.
    royal = ("As", "Ks", "Qs", "Js", "Ts")
    any_two = np.ones(1326)
    got = equity_vs_ranges(("2c", "3d"), royal, [any_two, any_two], key="royal")
    assert got.tie == 1.0 and got.win == 0.0 and abs(got.equity - 1 / 3) <= 1e-12
    # A board straight on the turn: chops two and three ways are common.
    board = ("5c", "6d", "7h", "8s")
    w1 = weights_from_combos(parse_range("A2o, K3o, 9Ts"))
    w2 = weights_from_combos(parse_range("Q2o, J3o, 22"))
    _close(equity_vs_ranges(("Kc", "2d"), board, [w1, w2], key="chop"),
           _bruteforce(("Kc", "2d"), board, [w1, w2]), 1e-9)


def test_two_villain_exact_on_the_flop():
    rng = stream(5, "eq-two-flop")
    hero, board = _spot(rng, 3)
    w1, w2 = _random_range(rng, 5), _random_range(rng, 5)
    expected = _bruteforce(hero, board, [w1, w2])
    for flop_exact in (None, True):
        got = equity_vs_ranges(hero, board, [w1, w2], key="two-flop", flop_exact=flop_exact)
        assert got.method == "exact"
        _close(got, expected, 1e-9)


# --- three or more villains: joint sampling ------------------------------------------


def _tiny_ranges(rng, board, hero, n: int, size: int) -> list[np.ndarray]:
    dead = set(board) | set(hero)
    free = [c for c in FULL_DECK if c not in dead]
    out = []
    for _ in range(n):
        w = np.zeros(1326)
        for _ in range(size):
            a, b = rng.sample(free, 2)
            w[combo_index(a, b)] = 1.0 - rng.random() * 0.9
        out.append(w)
    return out


def test_joint_sampling_unbiased_and_order_independent():
    rng = stream(5, "eq-joint")
    hero, board = _spot(rng, 5)
    ranges = _tiny_ranges(rng, board, hero, 3, 5)
    _w, _t, exact = _bruteforce(hero, board, ranges)
    got = equity_vs_ranges(hero, board, ranges, key="joint", samples=20000)
    assert got.method == "sampled" and got.se is not None and got.se > 0
    assert abs(got.equity - exact) <= 2 * got.se
    permuted = equity_vs_ranges(hero, board, [ranges[2], ranges[0], ranges[1]], key="joint", samples=20000)
    assert abs(permuted.equity - got.equity) <= 2 * got.se


def test_joint_sampler_matches_exact_two_way():
    # The sampler on a two-way spot (where the exact count is available) is
    # within its standard errors, on equity, win and tie.
    rng = stream(5, "eq-joint-two")
    for _ in range(3):
        hero, board = _spot(rng, 4)
        ranges = [_random_range(rng, 60), _random_range(rng, 60)]
        exact = equity_vs_ranges(hero, board, ranges, key="e")
        sampled = joint_sampled_equity(hero, board, ranges, key="s", samples=20000)
        assert sampled.method == "sampled"
        assert abs(sampled.equity - exact.equity) <= 3 * sampled.se


def test_joint_sampling_preflop_multiway():
    hero = ("As", "Ah")
    kk, qq = weights_from_combos(parse_range("KK")), weights_from_combos(parse_range("QQ"))
    got = equity_vs_ranges(hero, (), [kk, qq], key="pre", samples=8000)
    assert got.method == "sampled"
    oracle = equity(list(hero), [], [parse_range("KK"), parse_range("QQ")], trials=20000, seed=3)
    assert abs(got.equity - oracle.equity) <= 3 * got.se + 0.01


def test_same_key_same_answer():
    rng = stream(5, "eq-key")
    hero, board = _spot(rng, 4)
    ranges = [_random_range(rng, 200) for _ in range(3)]
    a = equity_vs_ranges(hero, board, ranges, key="s1:4:12")
    b = equity_vs_ranges(hero, board, ranges, key="s1:4:12")
    c = equity_vs_ranges(hero, board, ranges, key="s1:4:13")
    assert a == b
    assert a.method == "sampled" and c.equity != a.equity


def test_ranges_that_cannot_be_held_together_are_refused():
    hero, board = ("2c", "3c"), ("Ts", "9d", "4h", "8c", "Jd")
    w1 = weights_from_combos([("As", "Ah")])
    w2 = weights_from_combos([("As", "Ad")])
    with pytest.raises(ValueError):
        equity_vs_ranges(hero, board, [w1, w2], key="clash")
    w3 = weights_from_combos([("Ah", "Ad")])
    with pytest.raises(ValueError):
        equity_vs_ranges(hero, board, [w1, w2, w3], key="clash3", samples=200)


# --- the flop: exact when warm, else turn-stratified ----------------------------------


_HERO_RANGE = sorted(parse_range("22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, ATo+, KJo+"))
_VILLAIN_RANGES = [
    "22+, A2s+, K9s+, QTs+, JTs, ATo+, KJo+",
    "TT+, AQs+, AKo",
    "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A2o+, K8o+, Q9o+, J9o+, T9o",
    "22-99, A2s-ATs, KTs, QTs, JTs, T9s, 98s, 87s, 76s, 65s, AJo, KQo",
]


def _flop_spot(rng, i: int):
    """A coach-like flop: the hero holds a hand from an opening range; the villain
    holds one of four preflop ranges, or (every fifth spot) 400 random weighted combos."""
    hero = tuple(rng.choice(_HERO_RANGE))
    board = tuple(rng.sample([c for c in FULL_DECK if c not in hero], 3))
    if i % 5 == 0:
        w = np.zeros(1326)
        for j in rng.sample(range(1326), 400):
            w[j] = rng.random() ** 2
    else:
        w = weights_from_combos(parse_range(_VILLAIN_RANGES[i % 4]))
    return hero, board, w


def test_stratified_flop_close_to_exact():
    rng = stream(5, "eq-strat")
    zs = []
    for i in range(30):
        hero, board, w = _flop_spot(rng, i)
        exact = equity_vs_ranges(hero, board, [w], key=f"k{i}")
        strat = equity_vs_ranges(hero, board, [w], key=f"k{i}", flop_exact=False)
        assert exact.method == "exact"
        assert strat.method == "sampled" and strat.se is not None and strat.se > 0
        assert strat.trials == 47 * 12
        assert abs(strat.equity - exact.equity) <= 0.015, (i, strat, exact)
        zs.append((strat.equity - exact.equity) / strat.se)
    # The standard error is the error's real size. It is estimated from twelve
    # replicates (11 degrees of freedom), so the z-scores are t-distributed with
    # rms sqrt(11/9) = 1.11.
    rms = math.sqrt(sum(z * z for z in zs) / len(zs))
    assert 0.5 <= rms <= 1.9, rms


def test_stratified_flop_two_villains_close_to_exact():
    rng = stream(5, "eq-strat-two")
    for i in range(4):
        hero, board, w1 = _flop_spot(rng, i + 1)
        w2 = weights_from_combos(parse_range(_VILLAIN_RANGES[i]))
        exact = equity_vs_ranges(hero, board, [w1, w2], key=f"t{i}")
        strat = stratified_flop_equity(hero, board, [w1, w2], key=f"t{i}")
        assert strat.method == "sampled" and exact.method == "exact"
        assert abs(strat.equity - exact.equity) <= 0.015, (i, strat, exact)


def test_stratified_design_is_balanced():
    # Every turn card gets twelve rivers, and every card is a river twelve times,
    # so a card's own effect (a flush card, a pairing card) is counted at its true
    # rate.
    from poker.math.equity import _stratified_runouts

    hero, board = ("Ah", "Kh"), ("9h", "8d", "2c")
    runouts = _stratified_runouts(hero, board, key="balance")
    assert runouts.shape == (564, 2)
    turns, rivers = np.unique(runouts[:, 0], return_counts=True)
    assert len(turns) == 47 and set(rivers.tolist()) == {12}
    _r, river_counts = np.unique(runouts[:, 1], return_counts=True)
    assert len(_r) == 47 and set(river_counts.tolist()) == {12}
    assert len({frozenset(r) for r in runouts.tolist()}) == 564  # no runout twice
    six = _stratified_runouts(hero, board, key="balance", rivers=6)
    assert six.shape == (282, 2) and len({frozenset(r) for r in six.tolist()}) == 282
    again = _stratified_runouts(hero, board, key="balance")
    assert np.array_equal(runouts, again)


def test_cold_flop_is_exact_without_building_the_matrix():
    hero, board = ("Ah", "Kh"), ("9h", "8d", "2c")
    w = weights_from_combos(parse_range("22+, A2s+, KTs+, ATo+, KJo+"))
    w2 = weights_from_combos(parse_range("TT+, AQs+, AKo, 87s"))
    low = [c for c in FULL_DECK if c[0] in "34567"]
    for j in range(5):  # push this flop out of the four-flop cache
        flop_matrix(tuple(stream(5, "eq-evict", j).sample(low, 3)))
    assert not is_flop_warm(board)
    cold = equity_vs_ranges(hero, board, [w], key="d")
    cold_two = equity_vs_ranges(hero, board, [w, w2], key="d")
    assert cold.method == cold_two.method == "exact" and cold.se is None
    assert not is_flop_warm(board)  # the cold path does not build the matrix
    flop_matrix(board)
    warm = equity_vs_ranges(hero, board, [w], key="d")
    warm_two = equity_vs_ranges(hero, board, [w, w2], key="d")
    assert warm.method == "exact"
    # The same runouts and combos in the same order: identical numbers.
    assert cold == warm and cold_two == warm_two
    sampled = equity_vs_ranges(hero, board, [w], key="d", flop_exact=False)
    assert sampled.method == "sampled" and abs(sampled.equity - warm.equity) <= 3 * sampled.se


# --- dropping, preflop, the old oracle ----------------------------------------------


def test_fully_blocked_range_is_dropped():
    hero, board = ("As", "Ah"), ("Ad", "7c", "2s", "9h")
    blocked = weights_from_combos([("As", "Kd"), ("Ah", "Qc"), ("Ad", "Ac"), ("7c", "7d")])
    other = weights_from_combos(parse_range("KK, QQ, 99, A9s"))
    got = equity_vs_ranges(hero, board, [blocked, other], key="drop")
    alone = equity_vs_ranges(hero, board, [other], key="drop")
    assert got.dropped == 1 and got.method == "exact"
    assert got.equity == alone.equity and got.win == alone.win and got.tie == alone.tie
    with pytest.raises(ValueError):
        equity_vs_ranges(hero, board, [blocked], key="drop")
    with pytest.raises(ValueError):
        equity_vs_ranges(hero, board, [], key="none")


def test_bad_inputs_are_refused():
    w = np.ones(1326)
    with pytest.raises(ValueError):
        equity_vs_ranges(("As", "Ah"), ("As", "7c", "2s"), [w], key="x")
    with pytest.raises(ValueError):
        equity_vs_ranges(("As", "Ah"), ("Kd", "7c"), [w], key="x")
    with pytest.raises(ValueError):
        equity_vs_ranges(("As", "Ah"), (), [np.ones(10)], key="x")
    with pytest.raises(ValueError):
        equity_vs_ranges(("As", "Ah"), (), [-w], key="x")


def test_preflop_table_route():
    kk = weights_from_combos(parse_range("KK"))
    got = equity_vs_ranges(("As", "Ah"), (), [kk], key="pre")
    assert got.method == "preflop_table" and got.se is None
    # Exact enumeration gives 0.8195 for AsAh against KK as a range; the table's
    # standard error is about 0.4 pp (P2.6 measured 0.8207).
    assert abs(got.equity - 0.8195) <= 0.006
    assert got.win == got.equity and got.tie == 0.0 and abs(got.lose - (1 - got.equity)) <= 1e-12


def test_old_monte_carlo_equity_is_unchanged():
    r = equity(["As", "Ad"], [], [parse_range("KK")], trials=2000, seed=1)
    assert r.method == "sampled" and r.se is None and r.dropped == 0
    again = equity(["As", "Ad"], [], [parse_range("KK")], trials=2000, seed=1)
    assert r == again


def test_paired_seven_card_values_match_the_scalar_path():
    from poker.math.equity import _values7
    from poker.math.ranktable import value7

    rng = stream(5, "eq-values7")
    hands = [rng.sample(range(52), 7) for _ in range(5000)]
    hands += [[0, 4, 8, 12, 16, 1, 5], [48, 44, 40, 36, 32, 49, 45], [51, 47, 43, 39, 35, 31, 27]]  # flushes
    got = _values7(np.array(hands))
    assert got.tolist() == [value7([FULL_DECK[c] for c in h]) for h in hands]


# --- cost ---------------------------------------------------------------------------


def test_exact_paths_are_fast():
    rng = stream(5, "eq-cost")
    w = _random_range(rng, 500)
    w2 = _random_range(rng, 500)
    hero, board = _spot(rng, 5)
    equity_vs_ranges(hero, board, [w], key="warmup")
    timings = {}
    for name, n_board, ranges in (
        ("river", 5, [w]),
        ("turn", 4, [w]),
        ("turn two-way", 4, [w, w2]),
        ("cold flop", 3, [w]),
    ):
        hero, board = _spot(rng, n_board)
        t0 = time.perf_counter()
        for _ in range(5):
            equity_vs_ranges(hero, board, ranges, key="c")
        timings[name] = (time.perf_counter() - t0) / 5
    assert timings["river"] < 0.02 and timings["turn"] < 0.05, timings
    assert timings["turn two-way"] < 0.1 and timings["cold flop"] < 0.15, timings
