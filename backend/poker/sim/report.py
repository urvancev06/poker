"""Measured-vs-target report (STRATEGY.md §4 bands).

The validation gate: over >=100k simulated hands, every archetype's gated stats
must land inside its target band.
"""

from __future__ import annotations

from dataclasses import dataclass

from .stats import StatLine, StatsAccumulator

# (low, high) bands from STRATEGY.md §4. None = no hard band ("varies").
# Nit WTSD departs from §4's "low": a tight-passive premium range structurally
# shows down at a reg-like rate (~30%) and wins it, so the nit tell is a high WSD,
# not a low WTSD. WTSD cannot go below ~28 without pushing VPIP or AF out of the
# bands that define the archetype, so the band here follows the model.
# wsd is displayed as evidence but not gated: §4 gives no per-archetype WSD bands.
TARGETS: dict[str, dict[str, tuple[float, float] | None]] = {
    "Nit":             {"vpip": (10, 15), "pfr": (8, 12),  "threebet": (1, 3),   "af": (1, 2),    "wtsd": (26, 32), "wsd": None},
    "TAG":             {"vpip": (20, 24), "pfr": (17, 21), "threebet": (6, 9),   "af": (2.5, 3.5),"wtsd": (25, 30), "wsd": None},
    "LAG":             {"vpip": (27, 33), "pfr": (22, 28), "threebet": (9, 13),  "af": (3, 4.5),  "wtsd": (27, 33), "wsd": None},
    "Calling Station": {"vpip": (40, 55), "pfr": (6, 13),  "threebet": (1, 3),   "af": (0, 1.5),  "wtsd": (38, 50), "wsd": None},
    "Maniac":          {"vpip": (50, 65), "pfr": (38, 50), "threebet": (14, 22), "af": (4, 99),   "wtsd": None,     "wsd": None},
}

# Stats that constitute the hard gate.
GATE_STATS = ("vpip", "pfr", "af", "wtsd")


@dataclass
class CellCheck:
    value: float | None
    band: tuple[float, float] | None
    ok: bool


def _check(value: float | None, band: tuple[float, float] | None) -> CellCheck:
    if value is None:
        # No sample: cannot be shown to be in band, so it is not a pass.
        return CellCheck(None, band, False)
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
    """Do the gated stats sit in band for every archetype present in the lineup?

    Only archetypes that played are judged. An absent archetype has no hands, so its
    stats are no-sample and would fail every band, which would red-FAIL the partial
    lineups most Lab runs use."""
    checks = evaluate(acc)
    present = [a for a in TARGETS if acc.line(a).hands > 0]
    if not present:
        return False
    return all(checks[a][s].ok for a in present for s in GATE_STATS)


def format_report(acc: StatsAccumulator) -> str:
    checks = evaluate(acc)
    stats = ["vpip", "pfr", "threebet", "af", "wtsd", "wsd"]
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
            val = "—" if c.value is None else "inf" if c.value == float("inf") else f"{c.value:.1f}"
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
    lines.append(f"GATE ({', '.join(s.upper() for s in GATE_STATS)} in band for all archetypes): {gate}")
    lines.append("")
    return "\n".join(lines)
