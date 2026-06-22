"""Run the headless bot simulation and print the measured-vs-target stat report.

    backend/.venv/bin/python scripts/simulate.py --hands 100000
    backend/.venv/bin/python scripts/simulate.py --hands 20000 --seed 7
"""

from __future__ import annotations

import argparse
import time

from poker.sim import format_report, run


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate bot archetypes and report stats.")
    parser.add_argument("--hands", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--lineup", nargs="*", default=None,
                        help="archetype names, e.g. nit tag lag station maniac tag")
    args = parser.parse_args()

    print(f"Simulating {args.hands:,} hands (seed {args.seed})...")
    t0 = time.time()
    acc = run(args.hands, lineup=args.lineup, seed=args.seed,
              progress_every=max(args.hands // 10, 1))
    dt = time.time() - t0
    print(format_report(acc))
    print(f"({args.hands:,} hands in {dt:.1f}s = {args.hands / dt:,.0f} hands/s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
