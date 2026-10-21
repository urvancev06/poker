"""Seeded decision nodes for the policy property tests (P3.9, design §5 L2).

``sample_nodes(n, seed)`` plays seeded v2 self-play hands at 5/10 with the five
type means (no leaks, seats shuffled, a sixth seat of a random type) and stops at
random decisions: each postflop decision is kept with probability 0.8 and each
preflop one with 0.25, so the sample leans on the postflop nodes the properties
are about. Each seat's stack is drawn as 70% in 60-150bb, 20% in 10-40bb and
10% in 1-6bb. The hands are played by the policy itself (``policy`` → ``sample``
→ ``to_action``), so the nodes are the ones the bots really reach.

``play_hands(n_hands, seed, stacks_bb)`` is the same self-play without stopping,
for the legality fuzz: it returns every (spot, legal, action) it played and the
hands' results.
"""

from __future__ import annotations

import random
from collections.abc import Iterator

from poker.bots import build_context
from poker.bots.personas import Persona
from poker.engine import Action, Hand, LegalActions
from poker.strategy.dials import type_mean
from poker.strategy.policy import policy, sample
from poker.strategy.private import build_private
from poker.strategy.sizing import to_action
from poker.strategy.spot import Spot, build_spot
from poker.strategy.types import Private

TYPES: tuple[str, ...] = ("nit", "tag", "lag", "station", "maniac")
STACK_BANDS: tuple[tuple[float, tuple[float, float]], ...] = ((0.7, (60, 150)), (0.2, (10, 40)), (0.1, (1, 6)))
KEEP = {"preflop": 0.25, "postflop": 0.8}
BIG_BLIND = 10


def mean_personas() -> dict[str, Persona]:
    """One leak-free persona per type, on the type mean."""
    return {k: Persona(f"{k}-mean", k, type_mean(k), ()) for k in TYPES}


def stack_bb(rng: random.Random) -> float:
    u, acc = rng.random(), 0.0
    for p, (lo, hi) in STACK_BANDS:
        acc += p
        if u < acc:
            return rng.uniform(lo, hi)
    return rng.uniform(*STACK_BANDS[-1][1])


def _hands(seed: int, stacks) -> Iterator[tuple[Hand, list[Persona], random.Random, random.Random]]:
    rng = random.Random(seed)
    personas = mean_personas()
    while True:
        lineup = [*TYPES, rng.choice(TYPES)]
        rng.shuffle(lineup)
        chips = [max(1, round(stacks(rng) * BIG_BLIND)) for _ in lineup]
        hand = Hand.new(len(lineup), (BIG_BLIND // 2, BIG_BLIND), chips, seed=rng.randrange(2**32))
        yield hand, [personas[k] for k in lineup], random.Random(rng.randrange(2**32)), rng


def _step(hand: Hand, persona: Persona, drng: random.Random) -> tuple[Spot, Private, LegalActions, Action]:
    ctx = build_context(hand, BIG_BLIND)
    spot = build_spot(ctx)
    priv = build_private(spot, ctx.hole)
    dist, _ = policy(spot, priv, persona)
    return spot, priv, hand.legal_actions(), to_action(sample(dist, drng), spot, persona.dials, drng)


def sample_nodes(n: int, seed: int) -> Iterator[tuple[Spot, Private, Persona]]:
    """``n`` seeded decision nodes (see the module docstring)."""
    produced = 0
    for hand, lineup, drng, rng in _hands(seed, stack_bb):
        while not hand.is_over and hand.actor is not None:
            persona = lineup[hand.actor]
            spot, priv, _legal, action = _step(hand, persona, drng)
            keep = KEEP["preflop" if spot.street == "preflop" else "postflop"]
            if rng.random() < keep:
                yield spot, priv, persona
                produced += 1
                if produced >= n:
                    return
            hand.apply(action)


def play_hands(
    n_hands: int, seed: int, stacks_bb: tuple[float, float] = (60, 150)
) -> tuple[list[tuple[Spot, LegalActions, Action]], list[list[int]]]:
    """Self-play ``n_hands`` with every seat's stack uniform in ``stacks_bb``;
    returns every decision played and each hand's results."""
    decisions: list[tuple[Spot, LegalActions, Action]] = []
    results: list[list[int]] = []
    hands = _hands(seed, lambda rng: rng.uniform(*stacks_bb))
    for _ in range(n_hands):
        hand, lineup, drng, _rng = next(hands)
        while not hand.is_over and hand.actor is not None:
            spot, _priv, legal, action = _step(hand, lineup[hand.actor], drng)
            decisions.append((spot, legal, action))
            hand.apply(action)
        results.append(hand.results())
    return decisions, results
