"""Measure each archetype's *bet-range composition* — what fraction of the hands
a bot actually bets/raises with on each street is value / draw / air.

This is the empirical source for the coach's action-conditioned villain ranges:
the bluff slice the coach keeps in a barreling villain's range must match the
rate that bot truly barrels air, or the coach grades the hero against a fiction
(see the bluff-catching threshold). On the river draws have resolved, so the air
fraction there IS the river bluff rate a bluff-catcher beats.

    backend/.venv/bin/python scripts/measure_bet_ranges.py --hands 60000
"""

from __future__ import annotations

import argparse
from collections import defaultdict

from poker.engine import ActionType
from poker.math import Draw, MadeTier, classify
from poker.sim.runner import DEFAULT_LINEUP, run

_STREETS = ("flop", "turn", "river")
_STRONG_DRAWS = (Draw.FLUSH_DRAW, Draw.OPEN_ENDED, Draw.GUTSHOT)


def _category(hole, board) -> str:
    """value (made pair+), draw (no pair but a real draw), or air."""
    hc = classify(hole, board)
    if hc.made >= MadeTier.PAIR:
        return "value"
    if any(d in hc.draws for d in _STRONG_DRAWS):
        return "draw"
    return "air"


def measure(hands: int, seed: int = 0) -> dict[str, dict[str, dict[str, int]]]:
    # counts[archetype][street][category] = n
    counts: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: {s: defaultdict(int) for s in _STREETS}
    )

    def observer(name, ctx, action):
        if action.type not in (ActionType.BET, ActionType.RAISE):
            return
        if ctx.street not in _STREETS:
            return
        counts[name][ctx.street][_category(ctx.hole, ctx.board)] += 1

    run(hands, seed=seed, observer=observer)
    return counts


def format_table(counts: dict, hands: int, seed: int) -> str:
    lines = [
        "",
        "BET-RANGE COMPOSITION  (of the hands each archetype bets/raises with)",
        f"  source: {hands:,} hands, seed {seed}, lineup {DEFAULT_LINEUP}",
        "=" * 70,
        f"{'archetype':16}{'street':7}{'value%':>9}{'draw%':>8}{'air%':>8}{'bets':>9}",
        "-" * 70,
    ]
    for arch in ("Nit", "TAG", "LAG", "Calling Station", "Maniac"):
        for st in _STREETS:
            c = counts.get(arch, {}).get(st, {})
            tot = sum(c.values())
            if not tot:
                lines.append(f"{arch:16}{st:7}{'—':>9}{'—':>8}{'—':>8}{0:>9}")
                continue
            v, d, a = c.get("value", 0), c.get("draw", 0), c.get("air", 0)
            lines.append(
                f"{arch:16}{st:7}{100*v/tot:>9.1f}{100*d/tot:>8.1f}{100*a/tot:>8.1f}{tot:>9}"
            )
        lines.append("-" * 70)
    lines.append("air% on the river = the bluff fraction a bluff-catcher beats.")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Measure archetype bet-range composition.")
    ap.add_argument("--hands", type=int, default=60_000)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    counts = measure(args.hands, args.seed)
    print(format_table(counts, args.hands, args.seed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
