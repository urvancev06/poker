"""Diagnostic: how much do the bots over-fold made hands postflop?

For each archetype, across a sim, measure what fraction of postflop bet-facing
decisions it folds, split by made-hand strength. A flat calldown_freq folds one
pair (top pair == bottom pair) at a fixed rate, so the tight regs should show a
high one-pair fold rate — quantifying the realism hole flagged in STRATEGY.md §8.

    backend/.venv/bin/python scripts/measure_overfold.py --hands 40000
"""

from __future__ import annotations

import argparse
from collections import defaultdict

from poker.engine import ActionType
from poker.math import MadeTier, classify
from poker.sim.runner import run


def measure(hands: int, seed: int = 0, overrides: dict | None = None):
    c: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def obs(name, ctx, action):
        if ctx.street == "preflop" or ctx.to_call <= 0:
            return
        d = c[name]
        folded = action.type is ActionType.FOLD
        tier = classify(ctx.hole, ctx.board).made
        # fold to any flop bet (texture realism)
        if ctx.street == "flop" and not ctx.is_pfr:
            d["flopbet_faced"] += 1
            d["flopbet_fold"] += folded
        if tier == MadeTier.PAIR:
            d["pair_faced"] += 1
            d["pair_fold"] += folded
        elif tier >= MadeTier.TWO_PAIR:
            d["two_faced"] += 1
            d["two_fold"] += folded

    run(hands, seed=seed, observer=obs, overrides=overrides or {})
    return c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hands", type=int, default=40000)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    c = measure(args.hands, args.seed)

    def pct(a, b):
        return f"{100*a/b:.0f}%" if b else "—"

    print(f"OVER-FOLD DIAGNOSTIC  ({args.hands:,} hands, seed {args.seed})")
    print("fold% when FACING A POSTFLOP BET, by made-hand strength")
    print("(reg benchmark: fold-to-cbet ~45-55%; folding one pair to a single bet ~35-50% is healthy)")
    print("=" * 74)
    print(f"{'archetype':16}{'calldown':>9}{'1pair fold':>12}{'2pair+ fold':>13}{'fold-to-flop-bet':>18}")
    print("-" * 74)
    from poker.bots import archetypes
    for key in ("nit", "tag", "lag", "station", "maniac"):
        name = archetypes.make(key).name
        cd = archetypes.make(key).calldown_freq
        d = c.get(name, {})
        print(f"{name:16}{cd:>9.2f}"
              f"{pct(d.get('pair_fold',0), d.get('pair_faced',0)):>12}"
              f"{pct(d.get('two_fold',0), d.get('two_faced',0)):>13}"
              f"{pct(d.get('flopbet_fold',0), d.get('flopbet_faced',0)):>18}")
    print("=" * 74)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
