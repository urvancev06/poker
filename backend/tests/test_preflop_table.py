"""The preflop equity table (poker.math.preflop_table): the equity of each of the
169 canonical hero hands against each of the 1,326 villain combos, built offline
from 20,000 seeded boards per hand (``scripts/build_preflop_table.py``) and
stored as uint16. Any hero combo maps onto its class representative through a
suit permutation, and the villain combo goes through the same permutation.

The table is not rebuilt here (1-4 minutes). It is checked against its
build stamp, against exact enumeration on pinned matchups, and against the treys
Monte Carlo oracle on ranges.
"""

from __future__ import annotations

import itertools
import time

import numpy as np
import pytest

from poker.math.cards import FULL_DECK
from poker.math.equity import equity as monte_carlo
from poker.math.preflop_table import CLASSES_169, STAMP, class_of, matchup, preflop_equity
from poker.math.ranges import parse_range
from poker.math.vector import COMBOS, combo_index
from poker.rng import stream

# Exact equities by full enumeration of the C(48, 5) boards (vector path, which
# matches treys; recomputed by test_pinned_matchups_are_exact under -m slow).
EXACT = {
    (("As", "Ah"), ("Ks", "Kh")): 0.826366,
    (("As", "Ah"), ("Kd", "Kc")): 0.812555,
    (("Ac", "Kc"), ("Qh", "Qd")): 0.462145,
    (("Kd", "Qh"), ("7s", "7c")): 0.458703,
    (("7h", "2d"), ("As", "Ac")): 0.125776,
    (("Js", "Ts"), ("Ah", "Kd")): 0.411799,
    (("5d", "5c"), ("Ah", "Kh")): 0.517799,
    (("Ah", "Kh"), ("Ad", "Kd")): 0.500000,
    (("9c", "8c"), ("9h", "8d")): 0.524921,
    (("Qd", "Qc"), ("Ad", "Kc")): 0.563505,
    (("Ts", "9h"), ("Th", "9s")): 0.500000,
}
# 20,000 boards give a standard error of about 0.35 pp per entry; allow 3 SE.
TOL = 0.012


def _weights(combos) -> np.ndarray:
    w = np.zeros(1326)
    for a, b in combos:
        w[combo_index(a, b)] = 1.0
    return w


def test_classes_169_order():
    assert len(CLASSES_169) == len(set(CLASSES_169)) == 169
    assert CLASSES_169[:3] == ("AA", "KK", "QQ") and CLASSES_169[12] == "22"
    assert CLASSES_169[13:16] == ("AKs", "AQs", "AJs") and CLASSES_169[13 + 77] == "32s"
    assert CLASSES_169[13 + 78] == "AKo" and CLASSES_169[-1] == "32o"
    assert class_of(("Kd", "Ad")) == "AKs" and class_of(("7c", "7h")) == "77" and class_of(("2h", "Tc")) == "T2o"


def test_aa_vs_kk():
    # Exact: 0.8264 when the kings share both suits with the aces, 0.8195 with
    # one, 0.8126 with none, and 0.8195 against KK as a range. The planned check
    # was "As Ah vs Ks Kh in [0.81, 0.82]", which the exact 0.8264 misses, and
    # 0.8195 sits 0.05 pp under that window's top, inside the table's error, so
    # both are checked against the exact numbers instead.
    assert abs(matchup(("As", "Ah"), ("Ks", "Kh")) - 0.826366) <= TOL
    kings = list(itertools.combinations(["Ks", "Kh", "Kd", "Kc"], 2))
    vs_range = preflop_equity(("As", "Ah"), _weights(kings))
    assert 0.81 <= vs_range <= 0.83
    assert abs(vs_range - 0.819461) <= 0.006


@pytest.mark.parametrize(("hero", "villain"), list(EXACT))
def test_matchups_close_to_exact(hero, villain):
    assert abs(matchup(hero, villain) - EXACT[(hero, villain)]) <= TOL


def test_symmetry():
    # The build averages each matchup with its reverse, so e(a, b) + e(b, a) is
    # 1 up to the uint16 rounding (planned bound: 0.01; one raw row each would
    # miss by up to about 1.3 pp at 20,000 boards).
    rng = stream(21, "pf", "sym")
    worst = 0.0
    for _ in range(500):
        a, b, c, d = rng.sample(FULL_DECK, 4)
        worst = max(worst, abs(matchup((a, b), (c, d)) + matchup((c, d), (a, b)) - 1))
    assert worst <= 0.01
    assert worst <= 1.5 / 65535


def test_isomorphism_is_exact():
    assert matchup(("As", "Ks"), ("Qh", "Qd")) == matchup(("Ah", "Kh"), ("Qs", "Qd"))
    # Any suit relabelling of both hands gives the identical number.
    rng = stream(22, "pf", "iso")
    for _ in range(200):
        a, b, c, d = rng.sample(FULL_DECK, 4)
        perm = dict(zip("shdc", rng.sample("shdc", 4), strict=True))
        relabel = [x[0] + perm[x[1]] for x in (a, b, c, d)]
        assert matchup((a, b), (c, d)) == matchup(tuple(relabel[:2]), tuple(relabel[2:]))


def test_order_of_cards_does_not_matter():
    assert matchup(("Ks", "As"), ("Qd", "Qh")) == matchup(("As", "Ks"), ("Qh", "Qd"))


def test_blocked_villain_is_refused():
    with pytest.raises(ValueError):
        matchup(("As", "Ks"), ("As", "Qd"))


def test_preflop_equity_is_the_weighted_mean_over_disjoint_combos():
    hero = ("Jh", "Td")
    rng = stream(23, "pf", "w")
    w = np.array([rng.random() if rng.random() < 0.1 else 0.0 for _ in range(1326)])
    num = den = 0.0
    for i, (x, y) in enumerate(COMBOS.tolist()):
        villain = (FULL_DECK[x], FULL_DECK[y])
        if w[i] and not set(villain) & set(hero):
            num += w[i] * matchup(hero, villain)
            den += w[i]
    assert abs(preflop_equity(hero, w) - num / den) <= 1e-9


def test_fully_blocked_range_is_refused():
    with pytest.raises(ValueError):
        preflop_equity(("As", "Ks"), _weights([("As", "Kh"), ("Ks", "Qd")]))


@pytest.mark.parametrize(
    ("hero", "villain_range"),
    [(("Ah", "Kd"), "QQ+, AKs"), (("8s", "7s"), "22+, ATs+, KQs, AJo+"), (("Tc", "Th"), "random")],
)
def test_range_equity_agrees_with_monte_carlo(hero, villain_range):
    combos = (
        [tuple(c) for c in itertools.combinations(FULL_DECK, 2)]
        if villain_range == "random"
        else sorted(parse_range(villain_range))
    )
    mc = monte_carlo(hero, (), [combos], trials=20_000, seed=7)
    se = (mc.equity * (1 - mc.equity) / mc.trials) ** 0.5
    table = preflop_equity(hero, _weights(combos))
    assert abs(table - mc.equity) <= 3 * (se**2 + 0.004**2) ** 0.5, (table, mc.equity)


def test_stamp_matches_build_params():
    from scripts.build_preflop_table import BUILD_PARAMS, build_stamp

    assert build_stamp() == STAMP
    assert BUILD_PARAMS["boards_per_class"] == 20_000
    assert BUILD_PARAMS["classes"] == list(CLASSES_169)


def test_build_reproduces_the_table():
    """Two classes rebuilt from their seeded streams give the stored cells where
    they meet (72o against every pair of aces, and the reverse) exactly."""
    from scripts.build_preflop_table import build_row, quantize, reverse_cells

    from poker.math import preflop_table

    k72, kaa = CLASSES_169.index("72o"), CLASSES_169.index("AA")
    raw72, raw_aa = build_row("72o"), build_row("AA")
    k2, c2 = reverse_cells(k72)
    cols = np.flatnonzero(k2 == kaa)
    assert len(cols) == 6
    expected = quantize((raw72[cols] + 1 - raw_aa[c2[cols]]) / 2)
    assert np.array_equal(preflop_table.TABLE[k72, cols], expected)
    assert np.all(preflop_table.TABLE[kaa, c2[cols]].astype(int) + expected == 65535)


def test_lookup_is_fast():
    rng = stream(24, "pf", "fast")
    w = np.array([rng.random() for _ in range(1326)])
    heroes = [tuple(rng.sample(FULL_DECK, 2)) for _ in range(1000)]
    t = time.perf_counter()
    for hero in heroes:
        preflop_equity(hero, w)
    assert time.perf_counter() - t < 1.0


@pytest.mark.slow
def test_pinned_matchups_are_exact():
    from poker.math.vector import card_index, values_matrix

    idx48 = np.array(list(itertools.combinations(range(48), 5)), dtype=np.int8)
    for (hero, villain), pinned in EXACT.items():
        dead = [card_index(c) for c in (*hero, *villain)]
        rest = np.array([i for i in range(52) if i not in dead], dtype=np.int8)
        holes = np.array([[card_index(c) for c in hero], [card_index(c) for c in villain]])
        v = values_matrix(rest[idx48], holes)
        exact = ((v[:, 0] > v[:, 1]).sum() + (v[:, 0] == v[:, 1]).sum() / 2) / len(v)
        assert abs(exact - pinned) <= 1e-6, (hero, villain, exact)
