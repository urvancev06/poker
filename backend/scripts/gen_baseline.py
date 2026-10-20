"""Regenerate the locked bot-validation baseline: the 100k-hand stat gate report
plus the measured bet-range composition, written to backend/validation/phase3_gate.txt.

Rerun this after any change to bot strategy; a diff in the committed baseline is
the signal that the archetypes moved.

    cd backend && .venv/bin/python -m scripts.gen_baseline

The run uses the simulator's defaults: 5/10 blinds, 1,000-chip (100bb) stacks,
the default lineup, and hands dealt and decided from seeded streams.
"""

from __future__ import annotations

import datetime
import subprocess
import time
from pathlib import Path

from poker.sim import format_report, run
from poker.sim.fingerprint import v1_fingerprint
from poker.sim.report import gate_passes
from poker.sim.runner import DEFAULT_BLINDS, DEFAULT_LINEUP, DEFAULT_STACK
from scripts.measure_bet_ranges import format_table, measure

GATE_HANDS = 100_000
MEASURE_HANDS = 60_000
SEED = 0
OUT = Path(__file__).resolve().parent.parent / "validation" / "phase3_gate.txt"


def _commit() -> str:
    """The short commit of the code being measured, marked when the tree is dirty."""
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True,
                             text=True, check=True).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "poker"], capture_output=True,
                               text=True, check=True, cwd=OUT.parent.parent).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return f"{sha} (uncommitted changes under backend/poker)" if dirty else sha


def header(commit: str, date: str, fingerprint: str) -> str:
    sb, bb = DEFAULT_BLINDS
    return (
        "BOT VALIDATION GATE  (measured headless, before any UI work)\n"
        f"  command : cd backend && .venv/bin/python -m scripts.gen_baseline\n"
        f"  date    : {date}\n"
        f"  commit  : {commit}\n"
        f"  gate    : {GATE_HANDS:,} hands, seed {SEED}\n"
        f"  table   : {sb}/{bb} blinds, {DEFAULT_STACK:,}-chip ({DEFAULT_STACK // bb}bb) stacks, "
        f"lineup {DEFAULT_LINEUP}\n"
        f"  rng     : seeded streams (deck of hand h; decision k of player p in hand h)\n"
        f"  v1 pin  : {fingerprint}  (v1_fingerprint(300, 0), tests/test_v1_frozen.py)\n"
        f"  hard gate stats: VPIP, PFR, AF, WTSD in band for every archetype\n"
    )


def main() -> int:
    t0 = time.time()
    print(f"Running {GATE_HANDS:,}-hand gate (seed {SEED})...")
    acc = run(GATE_HANDS, seed=SEED, progress_every=GATE_HANDS // 10)
    report = format_report(acc)
    passed = gate_passes(acc)
    t_gate = time.time() - t0

    print(f"Measuring bet-range composition over {MEASURE_HANDS:,} hands...")
    counts = measure(MEASURE_HANDS, seed=SEED)
    table = format_table(counts, MEASURE_HANDS, SEED)

    head = header(_commit(), datetime.date.today().isoformat(), v1_fingerprint(300, 0))
    body = f"{head}\n{report}\n\n{table}\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(body)

    dt = time.time() - t0
    print(body)
    print(f"GATE {'PASS' if passed else 'FAIL'} — wrote {OUT}  (gate {t_gate:.0f}s, total {dt:.0f}s)")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
