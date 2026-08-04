"""Aggregate the hero's persisted per-hand summaries into stats over time, with
the healthy 6-max reg target bands from STRATEGY.md §5 (the dashboard targets)."""

from __future__ import annotations

import math

from .stats import StatLine, StatsAccumulator
from .table import PlayerHandSummary

# STRATEGY.md §5 — my targets for the progress dashboard.
HERO_TARGETS: dict[str, tuple[float, float]] = {
    "vpip": (22, 26),
    "pfr": (18, 22),
    "threebet": (7, 10),
    "ats": (30, 40),
    "af": (2.5, 3.5),
    "wtsd": (25, 30),
    "wsd": (52, 58),
    "wwsf": (48, 54),
}


def line_to_dict(line: StatLine) -> dict:
    af = None if math.isinf(line.af) else round(line.af, 2)
    return {
        "hands": line.hands,
        "vpip": round(line.vpip, 1),
        "pfr": round(line.pfr, 1),
        "threebet": round(line.threebet, 1),
        "ats": round(line.ats, 1),
        "af": af,
        "wtsd": round(line.wtsd, 1),
        "wsd": round(line.wsd, 1),
        "wwsf": round(line.wwsf, 1),
        "cbet": round(line.cbet, 1),
        "net_bb_per_100": round(line.net_bb_per_100, 1),
    }


def _aggregate(summary_dicts: list[dict]) -> StatLine:
    acc = StatsAccumulator()
    for d in summary_dicts:
        clean = {**d, "archetype": "me"}
        acc.add_hand([PlayerHandSummary(**clean)])
    return acc.line("me")


def decision_seconds(records: list[dict]) -> dict:
    """Median hero decision time, in seconds, over hands that recorded any.

    Median rather than mean because the distribution has a long right tail (a hand
    left open while the learner does something else). Reported raw: it is wall clock,
    not thinking time, and nothing is derived from it beyond this summary."""
    ms = [v for r in records for v in (r.get("hero_decision_ms") or []) if isinstance(v, (int, float))]
    if not ms:
        return {"median_s": None, "n": 0}
    ms.sort()
    mid = len(ms) // 2
    med = ms[mid] if len(ms) % 2 else (ms[mid - 1] + ms[mid]) / 2
    return {"median_s": round(med / 1000.0, 1), "n": len(ms)}


def hero_report(summary_dicts: list[dict], buckets: int = 8) -> dict:
    """Overall hero stats + a coarse trend (chronological order assumed)."""
    overall = line_to_dict(_aggregate(summary_dicts))
    trend: list[dict] = []
    n = len(summary_dicts)
    if n >= buckets * 5:  # only show a trend once there's enough sample
        size = n // buckets
        for i in range(buckets):
            chunk = summary_dicts[i * size : (i + 1) * size if i < buckets - 1 else n]
            trend.append(line_to_dict(_aggregate(chunk)))
    return {"overall": overall, "trend": trend, "targets": HERO_TARGETS}
