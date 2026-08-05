"""A bot = a strategy parameter set + the decision function."""

from __future__ import annotations

import random

from ..engine import Action
from .context import DecisionContext
from .strategy import StrategyParams, decide


class Bot:
    def __init__(self, params: StrategyParams, name: str | None = None) -> None:
        self.params = params
        self.name = name or params.name

    def act(self, ctx: DecisionContext, rng: random.Random) -> Action:
        return decide(self.params, ctx, rng)

    def __repr__(self) -> str:
        return f"Bot({self.name})"
