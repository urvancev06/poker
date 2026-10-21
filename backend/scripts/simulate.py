"""Run the headless bot simulation and print the measured-vs-target stat report.

    backend/.venv/bin/python scripts/simulate.py --hands 100000
    backend/.venv/bin/python scripts/simulate.py --hands 100000 --workers 4
    backend/.venv/bin/python scripts/simulate.py --hands 20000 --seed 7
    backend/.venv/bin/python scripts/simulate.py --hands 20000 --engine v2

Hands are dealt and decided from seeded streams, so ``--workers`` changes only the
wall time: any worker count gives the identical report.
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
    parser.add_argument("--workers", type=int, default=1,
                        help="processes to play shards in (same result for any count)")
    parser.add_argument("--engine", choices=["v1", "v2"], default="v1",
                        help="v1 archetype bots (default) or the v2 engine's personas")
    args = parser.parse_args()

    print(f"Simulating {args.hands:,} hands (engine {args.engine}, seed {args.seed}, 5/10, 100bb, {args.workers} worker(s))...")
    t0 = time.time()
    if args.workers > 1:
        acc = run(args.hands, lineup=args.lineup, seed=args.seed, workers=args.workers,
                  engine=args.engine, on_progress=lambda done: print(f"  ...{done:,} hands"))
    else:
        acc = run(args.hands, lineup=args.lineup, seed=args.seed,
                  progress_every=max(args.hands // 10, 1), engine=args.engine)
    dt = time.time() - t0
    print(format_report(acc))
    print(f"({args.hands:,} hands in {dt:.1f}s = {args.hands / dt:,.0f} hands/s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
