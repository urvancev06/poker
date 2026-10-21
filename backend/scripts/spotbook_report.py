"""Print every spot-book row's measured value against its interval, per type,
and write ``validation/spotbook_report.txt``.

    PYTHONPATH=. .venv/bin/python -m scripts.spotbook_report
"""

from __future__ import annotations

import sys
from pathlib import Path

from poker.strategy.policy import policy_hash
from validation.spotbook import SPOTS, bounds_for, evaluate_spot, within

OUT = Path(__file__).resolve().parents[1] / "validation" / "spotbook_report.txt"


def report() -> tuple[list[str], int]:
    lines = [f"Spot book: {len(SPOTS)} rows, policy {policy_hash()}", ""]
    outside = 0
    for row in SPOTS:
        leaks = " + " + ", ".join(f"{n}({i:g})" for n, i in row.leaks) if row.leaks else ""
        lines.append(f"{row.id}  {row.hero} {row.board or '-'} {row.hero_pos}  {row.measure}{leaks}  ({row.note})")
        for t in row.bounds:
            lo, hi = bounds_for(row, t)
            v = evaluate_spot(row, t)
            ok = within(v, lo, hi)
            outside += not ok
            lines.append(f"    {t:<8} {v:7.4f}  in [{lo:.3f}, {hi:.3f}]  {'ok' if ok else 'OUTSIDE'}")
    lines += ["", f"{outside} (row, type) values outside their bounds"]
    return lines, outside


def main() -> int:
    lines, outside = report()
    text = "\n".join(lines) + "\n"
    OUT.write_text(text)
    print(text, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
