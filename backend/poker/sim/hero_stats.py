"""Aggregate the hero's persisted per-hand summaries into stats over time, against
the healthy 6-max reg target bands from STRATEGY.md §5."""

from __future__ import annotations

import math

from .stats import StatLine, StatsAccumulator
from .table import PlayerHandSummary

# Target bands for the progress dashboard (STRATEGY.md §5).
HERO_TARGETS: dict[str, tuple[float, float]] = {
    "vpip": (22, 26),
    "pfr": (18, 22),
    "threebet": (7, 10),
    "ats": (30, 40),
    "af": (2.5, 3.5),
    "wtsd": (25, 30),
    "wsd": (52, 58),
    "wwsf": (48, 54),
    # Every band the Study page prints needs an entry here and a row in StatsView,
    # or the UI quotes a target it has no measured value to sit beside.
    "cbet": (55, 70),
}


def _r(v: float | None) -> float | None:
    """Round, preserving None ("no sample") rather than coercing it to 0."""
    return None if v is None else round(v, 1)


def line_to_dict(line: StatLine) -> dict:
    af = None if math.isinf(line.af) else round(line.af, 2)
    return {
        "hands": line.hands,
        "vpip": _r(line.vpip),
        "pfr": _r(line.pfr),
        "threebet": _r(line.threebet),
        "ats": _r(line.ats),
        "fold_to_steal": _r(line.fold_to_steal),
        "af": af,
        "wtsd": _r(line.wtsd),
        "wsd": _r(line.wsd),
        "wwsf": _r(line.wwsf),
        "cbet": _r(line.cbet),
        "net_bb_per_100": _r(line.net_bb_per_100),
    }


# Hands persisted before the pf_* -> postflop_* rename still carry the old keys.
_LEGACY_KEYS = {"pf_bets": "postflop_bets", "pf_raises": "postflop_raises", "pf_calls": "postflop_calls"}


def _aggregate(summary_dicts: list[dict], big_blind: int = 2) -> StatLine:
    acc = StatsAccumulator(big_blind=big_blind)
    for d in summary_dicts:
        clean = {_LEGACY_KEYS.get(k, k): v for k, v in d.items()}
        clean["archetype"] = "me"
        acc.add_hand([PlayerHandSummary(**clean)])
    return acc.line("me")


def decision_seconds(records: list[dict]) -> dict:
    """Median hero decision time, in seconds, over hands that recorded any.

    Median rather than mean: the distribution has a long right tail from hands left
    open while the player does something else. This is wall-clock time, not thinking
    time, so nothing is derived from it."""
    ms = [v for r in records for v in (r.get("hero_decision_ms") or []) if isinstance(v, (int, float))]
    if not ms:
        return {"median_s": None, "n": 0}
    ms.sort()
    mid = len(ms) // 2
    med = ms[mid] if len(ms) % 2 else (ms[mid - 1] + ms[mid]) / 2
    return {"median_s": round(med / 1000.0, 1), "n": len(ms)}


def hero_report(summary_dicts: list[dict], buckets: int = 8, big_blind: int = 2) -> dict:
    """Overall hero stats + a coarse trend (chronological order assumed).

    ``big_blind`` must be the session's real big blind - bb/100 divides net chips by
    it, so a hardcoded value silently rescales every result."""
    overall = line_to_dict(_aggregate(summary_dicts, big_blind))
    trend: list[dict] = []
    n = len(summary_dicts)
    if n >= buckets * 5:  # only show a trend once there's enough sample
        size = n // buckets
        for i in range(buckets):
            chunk = summary_dicts[i * size : (i + 1) * size if i < buckets - 1 else n]
            trend.append(line_to_dict(_aggregate(chunk, big_blind)))
    return {"overall": overall, "trend": trend, "targets": HERO_TARGETS}
