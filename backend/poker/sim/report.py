"""Measured-vs-target report (STRATEGY.md §4 bands).

The phase gate (PROJECT.md): over >=100k hands, each archetype's core stats
(VPIP, PFR, and aggression at minimum) must land in its target band.
"""

from __future__ import annotations

from dataclasses import dataclass

from .stats import StatLine, StatsAccumulator

# (low, high) bands from STRATEGY.md §4. None = no hard band ("varies"/"low").
TARGETS: dict[str, dict[str, tuple[float, float] | None]] = {
    "Nit":             {"vpip": (10, 15), "pfr": (8, 12),  "threebet": (1, 3),   "af": (1, 2),    "wtsd": (0, 24)},
    "TAG":             {"vpip": (20, 24), "pfr": (17, 21), "threebet": (6, 9),   "af": (2.5, 3.5),"wtsd": (25, 30)},
    "LAG":             {"vpip": (27, 33), "pfr": (22, 28), "threebet": (9, 13),  "af": (3, 4.5),  "wtsd": (27, 33)},
    "Calling Station": {"vpip": (40, 55), "pfr": (6, 13),  "threebet": (1, 3),   "af": (0, 1.5),  "wtsd": (38, 50)},
    "Maniac":          {"vpip": (50, 65), "pfr": (38, 50), "threebet": (14, 22), "af": (4, 99),   "wtsd": None},
}

# Stats that constitute the hard gate.
GATE_STATS = ("vpip", "pfr", "af")


@dataclass
class CellCheck:
    value: float
    band: tuple[float, float] | None
    ok: bool


def _check(value: float, band: tuple[float, float] | None) -> CellCheck:
    if band is None:
        return CellCheck(value, None, True)
    return CellCheck(value, band, band[0] <= value <= band[1])


def _fmt_band(band: tuple[float, float] | None) -> str:
    if band is None:
        return "  —  "
    lo, hi = band
    hi_s = "+" if hi >= 99 else f"{hi:g}"
    return f"{lo:g}-{hi_s}"


def evaluate(acc: StatsAccumulator) -> dict[str, dict[str, CellCheck]]:
    out: dict[str, dict[str, CellCheck]] = {}
    for arch, targets in TARGETS.items():
        line = acc.line(arch)
        out[arch] = {stat: _check(getattr(line, stat), band) for stat, band in targets.items()}
    return out


def gate_passes(acc: StatsAccumulator) -> bool:
    checks = evaluate(acc)
    return all(checks[a][s].ok for a in TARGETS for s in GATE_STATS)


def format_report(acc: StatsAccumulator) -> str:
    checks = evaluate(acc)
    stats = ["vpip", "pfr", "threebet", "af", "wtsd"]
    lines: list[str] = []
    lines.append("")
    lines.append("ARCHETYPE STAT REPORT  (measured  [target band]  ✓/✗)")
    lines.append("=" * 78)
    header = f"{'archetype':16} " + "".join(f"{s.upper():>12}" for s in stats) + f"{'hands':>9}{'bb/100':>9}"
    lines.append(header)
    lines.append("-" * 78)
    for arch in TARGETS:
        line: StatLine = acc.line(arch)
        cells = []
        for s in stats:
            c = checks[arch][s]
            mark = "✓" if c.ok else "✗"
            val = "inf" if c.value == float("inf") else f"{c.value:.1f}"
            cells.append(f"{val:>6}{mark} ")
        row = f"{arch:16} " + "".join(f"{c:>12}" for c in cells)
        row += f"{line.hands:>9}{line.net_bb_per_100:>9.1f}"
        lines.append(row)
    # target band row
    lines.append("-" * 78)
    for arch in TARGETS:
        bands = "".join(f"{_fmt_band(TARGETS[arch][s]):>12}" for s in stats)
        lines.append(f"{'  band: ' + arch:16} {bands}")
    lines.append("=" * 78)
    gate = "PASS ✓" if gate_passes(acc) else "FAIL ✗"
    lines.append(f"GATE (VPIP, PFR, AF in band for all archetypes): {gate}")
    lines.append("")
    return "\n".join(lines)
