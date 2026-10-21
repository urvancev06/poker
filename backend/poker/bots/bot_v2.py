"""PersonaBot: a v2 player, a persona (type, jittered dials, leaks) playing the
logical policy in ``poker.strategy.policy`` (phase 3, behind ``engine=v2``).

It has the v1 ``Bot`` interface (``.name``, ``.act(ctx, rng)``), so the session
and the simulator drive it unchanged. Each decision builds the public ``Spot``
and the private features from the actor's own redacted context, then samples
the policy with the decision stream it is given. ``last_trace`` keeps the most
recent decision's ``Trace`` (server-side only, D26).
"""

from __future__ import annotations

import random

from ..engine import Action
from ..strategy.dials import TYPE_DISPLAY
from ..strategy.policy import policy, sample
from ..strategy.private import build_private
from ..strategy.sizing import to_action
from ..strategy.spot import Spot, build_spot
from ..strategy.types import ActionDist, Trace
from .context import DecisionContext
from .personas import Persona


class PersonaBot:
    def __init__(self, persona: Persona) -> None:
        self.persona = persona
        self.name = TYPE_DISPLAY[persona.type_key]
        self.last_trace: Trace | None = None

    def _decide(self, ctx: DecisionContext) -> tuple[Spot, ActionDist, Trace]:
        spot = build_spot(ctx)
        priv = build_private(spot, ctx.hole)
        dist, trace = policy(spot, priv, self.persona)
        self.last_trace = trace
        return spot, dist, trace

    def decide(self, ctx: DecisionContext) -> tuple[ActionDist, Trace]:
        _, dist, trace = self._decide(ctx)
        return dist, trace

    def act(self, ctx: DecisionContext, rng: random.Random) -> Action:
        spot, dist, _ = self._decide(ctx)
        return to_action(sample(dist, rng), spot, self.persona.dials, rng)

    def __repr__(self) -> str:
        return f"PersonaBot({self.name}, {self.persona.persona_id})"
