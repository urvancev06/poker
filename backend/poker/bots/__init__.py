"""Bots — parameterized archetype strategies over the engine + math.

    Bot                 the (game_state, legal, cards) -> action interface
    StrategyParams      the tunable knob set
    decide              the strategy function
    DecisionContext     situational facts for one decision
    build_context       derive a DecisionContext from a hand snapshot
    archetypes.make     build one of the five archetypes by name
    PersonaBot          a v2 player (persona + the logical policy), engine=v2
    make_persona        draw a jittered v2 persona of a type

``PersonaBot`` and ``make_persona`` load lazily: ``poker.strategy.charts`` imports
``poker.bots.preflop_ranges``, so importing the v2 policy from here at import
time would be circular.
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
    "PersonaBot",
    "make_persona",
]


def __getattr__(name: str):
    if name == "PersonaBot":
        from .bot_v2 import PersonaBot

        return PersonaBot
    if name == "make_persona":
        from .personas import make_persona

        return make_persona
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
