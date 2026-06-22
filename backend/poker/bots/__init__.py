"""Bots — parameterized archetype strategies over the engine + math.

    Bot                 the (game_state, legal, cards) -> action interface
    StrategyParams      the tunable knob set
    decide              the strategy function
    DecisionContext     situational facts for one decision
    build_context       derive a DecisionContext from a hand snapshot
    archetypes.make     build one of the five archetypes by name
"""

from . import archetypes
from .bot import Bot
from .context import DecisionContext, build_context
from .strategy import StrategyParams, decide

__all__ = [
    "Bot",
    "StrategyParams",
    "decide",
    "DecisionContext",
    "build_context",
    "archetypes",
]
