"""Generate the locked Phase-3 baseline: the 100k gate report + the measured
bet-range composition, written to backend/validation/phase3_gate.txt.

    backend/.venv/bin/python scripts/gen_baseline.py
"""

from __future__ import annotations

import time
from pathlib import Path

from poker.sim import format_report, run
from poker.sim.report import gate_passes
from scripts.measure_bet_ranges import format_table, measure

GATE_HANDS = 100_000
MEASURE_HANDS = 60_000
SEED = 0
OUT = Path(__file__).resolve().parent.parent / "validation" / "phase3_gate.txt"


def main() -> int:
    t0 = time.time()
    print(f"Running {GATE_HANDS:,}-hand gate (seed {SEED})...")
    acc = run(GATE_HANDS, seed=SEED, progress_every=GATE_HANDS // 10)
    report = format_report(acc)
    passed = gate_passes(acc)

    print(f"Measuring bet-range composition over {MEASURE_HANDS:,} hands...")
    counts = measure(MEASURE_HANDS, seed=SEED)
    table = format_table(counts, MEASURE_HANDS, SEED)

    header = (
        "PHASE-3 VALIDATION GATE  (the brain, validated headless before the UI)\n"
        f"  command : backend/.venv/bin/python scripts/gen_baseline.py\n"
        f"  gate    : {GATE_HANDS:,} hands, seed {SEED}\n"
        f"  hard gate stats: VPIP, PFR, AF, WTSD in band for every archetype\n"
    )
    body = f"{header}\n{report}\n\n{table}\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(body)

    dt = time.time() - t0
    print(body)
    print(f"GATE {'PASS' if passed else 'FAIL'} — wrote {OUT}  ({dt:.0f}s)")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
