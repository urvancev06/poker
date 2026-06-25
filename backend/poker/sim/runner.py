"""Run a headless simulation of N hands among a fixed lineup, accumulating stats.

Deals come from Python's global RNG (seeded once for reproducibility); bot
decisions use a separate RNG so the two streams are independent and stable.
"""

from __future__ import annotations

import dataclasses
import random

from ..bots import Bot, archetypes
from .stats import StatsAccumulator
from .table import play_hand

# A representative 6-max field with every archetype present (TAG doubled as the
# benchmark/sixth seat). Stats aggregate by archetype across all seats.
DEFAULT_LINEUP = ["nit", "tag", "lag", "station", "maniac", "tag"]


def run(
    hands: int,
    lineup: list[str] | None = None,
    seed: int = 0,
    blinds: tuple[int, int] = (1, 2),
    starting_stack: int = 200,
    progress_every: int | None = None,
    overrides: dict[str, dict[str, float]] | None = None,
    observer=None,
) -> StatsAccumulator:
    """Simulate ``hands`` hands among ``lineup``.

    ``overrides`` lets the bot lab tweak strategy knobs without editing the
    archetype defaults: it maps an archetype key (``"tag"``, ``"station"``, …)
    to ``{field: value}`` pairs applied to every instance of that archetype.
    Only scalar ``StrategyParams`` fields make sense here — the caller (the lab)
    validates which knobs are tunable; the runner just applies them.
    """
    lineup = lineup or DEFAULT_LINEUP
    overrides = overrides or {}

    def build(name: str) -> Bot:
        params = archetypes.make(name)
        ov = overrides.get(name.lower().replace(" ", ""))
        if ov:
            params = dataclasses.replace(params, **ov)
        return Bot(params)

    bots = [build(name) for name in lineup]
    n = len(bots)

    random.seed(seed)               # deal stream
    decision_rng = random.Random(seed ^ 0x9E3779B9)  # bot-decision stream
    acc = StatsAccumulator(big_blind=blinds[1])

    for h in range(hands):
        button = h % n
        summaries = play_hand(
            bots, button, decision_rng, blinds=blinds, starting_stack=starting_stack,
            observer=observer,
        )
        acc.add_hand(summaries)
        if progress_every and (h + 1) % progress_every == 0:
            print(f"  ...{h + 1:,} hands")

    return acc
