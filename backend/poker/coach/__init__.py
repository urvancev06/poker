"""Coaching — honest, computed advice for the hero's current spot."""

from .coach import Coaching, VillainModel, build_coaching
from .review import leak_summary, review_hand, review_hand_cached
from .villain_model import ARCHETYPE_RANGE_PCT, condition_range

__all__ = [
    "build_coaching",
    "Coaching",
    "VillainModel",
    "ARCHETYPE_RANGE_PCT",
    "condition_range",
    "review_hand",
    "review_hand_cached",
    "leak_summary",
]
