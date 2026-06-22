"""Simulation harness + stats — play archetypes headless and measure the result.

    run                 simulate N hands among a lineup -> StatsAccumulator
    play_hand           one hand with button rotation -> per-player summaries
    StatsAccumulator    aggregate summaries into stat lines
    format_report       measured-vs-target table; gate_passes -> bool
"""

from .report import evaluate, format_report, gate_passes
from .runner import DEFAULT_LINEUP, run
from .stats import StatLine, StatsAccumulator
from .table import PlayerHandSummary, play_hand

__all__ = [
    "run",
    "DEFAULT_LINEUP",
    "play_hand",
    "PlayerHandSummary",
    "StatsAccumulator",
    "StatLine",
    "format_report",
    "gate_passes",
    "evaluate",
]
