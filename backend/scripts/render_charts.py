"""Render the v2 preflop charts into STRATEGY.md §2 (plan D28).

    cd backend && PYTHONPATH=. .venv/bin/python -m scripts.render_charts          # print
    cd backend && PYTHONPATH=. .venv/bin/python -m scripts.render_charts --write  # update

The block sits between ``<!-- charts:v2:start -->`` and ``<!-- charts:v2:end -->``;
the first ``--write`` inserts it at the end of §2, just before §3.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from poker.strategy.charts.preflop import MD_END, MD_START
from poker.strategy.charts.render import render_markdown

STRATEGY_MD = Path(__file__).resolve().parents[2] / "STRATEGY.md"
SECTION_3 = "\n---\n\n## 3."


def updated(text: str, block: str) -> str:
    start, end = text.find(MD_START), text.find(MD_END)
    if start >= 0 and end > start:
        tail = text[end + len(MD_END) :]
        return text[:start] + block.rstrip("\n") + tail
    at = text.find(SECTION_3)
    if at < 0:
        raise SystemExit("STRATEGY.md has no §3 heading to insert before")
    return text[:at] + "\n" + block.rstrip("\n") + "\n" + text[at:]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="update STRATEGY.md in place")
    args = parser.parse_args()
    block = render_markdown()
    if not args.write:
        print(block, end="")
        return
    text = STRATEGY_MD.read_text()
    new = updated(text, block)
    if new != text:
        STRATEGY_MD.write_text(new)
    print(f"STRATEGY.md §2 block: {'updated' if new != text else 'unchanged'}")


if __name__ == "__main__":
    main()
