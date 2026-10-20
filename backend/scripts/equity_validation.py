"""Validate equity v2's sampled paths against its exact ones (phase-2 L1 check).

Three checks over seeded coach-like spots (the hero holds a hand from an opening
range; villains hold one of four preflop ranges, or random weighted combos):

1. **Stratified flop vs exact** (one and two villains). The error of
   ``stratified_flop_equity`` (47 turns x 12 balanced rivers by default)
   against exact enumeration: median, p95, max, how many spots miss by more
   than 1.5 pp, and whether the reported standard error is the error's real
   size (rms of error / se; sqrt((k - 1) / (k - 3)) is expected with k
   replicates, 1.11 for 12).
2. **Cold flop vs warm flop.** The exact path that values only the ranges'
   combos against the one that reads the cached flop matrix: the largest
   difference (should be float rounding only).
3. **Joint sampling vs exact two-way** (turn and river). The sampler's error in
   units of its standard error, to show it is unbiased and its se honest.

Usage::

    cd backend && PYTHONPATH=. .venv/bin/python -m scripts.equity_validation --spots 200

Exits 1 when a stratified spot misses by more than 1.5 pp or a cold/warm pair
differs by more than 1e-9.
"""

from __future__ import annotations

import argparse
import importlib
import math
import statistics
import sys
import time

import numpy as np

from poker.math.cards import FULL_DECK
from poker.math.ranges import parse_range
from poker.math.vector import flop_matrix
from poker.rng import stream

# ``poker.math.equity`` the module (the package re-exports a function of that name).
eqm = importlib.import_module("poker.math.equity")

HERO_RANGE = sorted(parse_range("22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, ATo+, KJo+"))
VILLAIN_RANGES = [
    "22+, A2s+, K9s+, QTs+, JTs, ATo+, KJo+",
    "TT+, AQs+, AKo",
    "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A2o+, K8o+, Q9o+, J9o+, T9o",
    "22-99, A2s-ATs, KTs, QTs, JTs, T9s, 98s, 87s, 76s, 65s, AJo, KQo",
]
TOLERANCE = 0.015


def _range(rng, i: int) -> np.ndarray:
    if i % 5 == 0:
        w = np.zeros(1326)
        for j in rng.sample(range(1326), 400):
            w[j] = rng.random() ** 2
        return w
    return eqm.weights_from_combos(parse_range(VILLAIN_RANGES[i % 4]))


def _spots(n: int, n_board: int, label: str):
    rng = stream(0, "equity-validation", label)
    out = []
    while len(out) < n:
        i = len(out)
        hero = tuple(rng.choice(HERO_RANGE))
        board = tuple(rng.sample([c for c in FULL_DECK if c not in hero], n_board))
        ranges = [_range(rng, i)]
        if i % 4 == 3:
            ranges.append(_range(rng, i + 1))
        out.append((hero, board, ranges))
    return out


def _pct(x: float) -> str:
    return f"{x * 100:.2f} pp"


def check_stratified(n: int, rivers: int) -> tuple[list[str], bool]:
    errs, zs, t_strat, t_exact = [], [], [], []
    worst = None
    for i, (hero, board, ranges) in enumerate(_spots(n, 3, "stratified")):
        t0 = time.perf_counter()
        exact = eqm.equity_vs_ranges(hero, board, ranges, key=f"v{i}")
        t1 = time.perf_counter()
        strat = eqm.stratified_flop_equity(hero, board, ranges, key=f"v{i}", rivers=rivers)
        t2 = time.perf_counter()
        t_exact.append(t1 - t0)
        t_strat.append(t2 - t1)
        err = strat.equity - exact.equity
        errs.append(abs(err))
        zs.append(err / strat.se)
        if worst is None or abs(err) > abs(worst[0]):
            worst = (err, hero, board, len(ranges), strat.se)
    s = sorted(errs)
    over = sum(e > TOLERANCE for e in s)
    rms_z = math.sqrt(sum(z * z for z in zs) / len(zs))
    lines = [
        f"1. stratified flop ({rivers} rivers per turn) vs exact ({n} spots, 1-2 villains)",
        f"   |error|: median {_pct(statistics.median(s))}, p95 {_pct(s[int(0.95 * (len(s) - 1))])}, max {_pct(s[-1])}",
        f"   over {_pct(TOLERANCE)}: {over} of {n}",
        f"   rms(error / se): {rms_z:.2f} ({rivers} replicates: {math.sqrt((rivers - 1) / (rivers - 3)):.2f} expected);"
        f" |z| > 3: {sum(abs(z) > 3 for z in zs)}",
        f"   worst: {worst[1]} on {worst[2]}, {worst[3]} villain(s): {worst[0] * 100:+.2f} pp (se {_pct(worst[4])})",
        f"   time: stratified median {statistics.median(t_strat) * 1e3:.1f} ms, cold exact median {statistics.median(t_exact) * 1e3:.1f} ms",
    ]
    return lines, over == 0


def check_cold_vs_warm(n: int) -> tuple[list[str], bool]:
    worst = 0.0
    for i, (hero, board, ranges) in enumerate(_spots(n, 3, "cold-warm")):
        cold = eqm.equity_vs_ranges(hero, board, ranges, key=f"c{i}", flop_exact=None)
        flop_matrix(board)
        warm = eqm.equity_vs_ranges(hero, board, ranges, key=f"c{i}")
        worst = max(worst, abs(cold.equity - warm.equity), abs(cold.win - warm.win), abs(cold.tie - warm.tie))
    return [f"2. cold flop (ranges' combos) vs warm flop (matrix), {n} spots: max difference {worst:.1e}"], worst <= 1e-9


def check_joint(n: int) -> list[str]:
    zs = []
    spots = _spots((n + 1) // 2, 4, "joint-turn") + _spots(n // 2, 5, "joint-river")
    for i, (hero, board, ranges) in enumerate(spots):
        if len(ranges) == 1:
            ranges = [ranges[0], eqm.weights_from_combos(parse_range(VILLAIN_RANGES[i % 4]))]
        exact = eqm.equity_vs_ranges(hero, board, ranges, key=f"j{i}")
        sampled = eqm.joint_sampled_equity(hero, board, ranges, key=f"j{i}", samples=4000)
        err = sampled.equity - exact.equity
        if sampled.se > 0:
            zs.append(err / sampled.se)
        elif abs(err) > 1e-12:  # every sample alike, yet the answer differs: flag it
            zs.append(math.inf)
    mean_z = sum(zs) / len(zs)
    rms_z = math.sqrt(sum(z * z for z in zs) / len(zs))
    return [
        f"3. joint sampling (4,000 samples) vs exact two-way, {n} turn/river spots ({n - len(zs)} with every sample alike):",
        f"   mean(error / se) {mean_z:+.2f} (bias would show here), rms {rms_z:.2f} (1 expected), |z| > 3: {sum(abs(z) > 3 for z in zs)}",
    ]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--spots", type=int, default=200, help="stratified-flop spots (default 200)")
    ap.add_argument("--rivers", type=int, default=eqm._STRATIFIED_RIVERS, help="rivers per turn card")
    args = ap.parse_args(argv)
    t0 = time.perf_counter()
    lines, ok_strat = check_stratified(args.spots, args.rivers)
    more, ok_cold = check_cold_vs_warm(max(10, args.spots // 10))
    lines += more
    lines += check_joint(max(20, args.spots // 4))
    ok = ok_strat and ok_cold
    lines.append(f"{'PASS' if ok else 'FAIL'} ({time.perf_counter() - t0:.0f} s)")
    print("\n".join(lines))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
