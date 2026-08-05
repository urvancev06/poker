"""Bots + simulation layer.

The real proof of the bots is the ≥100k-hand stat gate (scripts/simulate.py). These
guard the machinery around it: archetypes build, the strategy always returns a legal
action, the harness conserves chips across many hands, and stats compute sanely.
"""

import random

import pytest

from poker.bots import Bot, archetypes, build_context
from poker.engine import Hand
from poker.sim import StatsAccumulator, play_hand, run


def test_all_archetypes_build():
    names = ["nit", "tag", "lag", "station", "maniac"]
    for n in names:
        p = archetypes.make(n)
        assert p.name
        assert set(p.rfi_raise) >= {"UTG", "MP", "CO", "BTN", "SB"}
    with pytest.raises(ValueError):
        archetypes.make("nonsense")


def test_strategy_always_returns_a_legal_action():
    """Fuzz: every decision the bots make must be legal in the engine."""
    bots = [Bot(archetypes.make(n)) for n in ["nit", "tag", "lag", "station", "maniac", "tag"]]
    rng = random.Random(0)
    random.seed(0)
    for _ in range(300):
        hand = Hand.new(table_size=6, blinds=(1, 2), starting_stacks=200)
        guard = 0
        while not hand.is_over and guard < 500:
            guard += 1
            seat = hand.actor
            ctx = build_context(hand, 2)
            action = bots[seat].act(ctx, rng)
            legal = ctx.legal
            ok = {
                "fold": legal.can_fold,
                "check": legal.can_check,
                "call": legal.can_call,
                "bet": legal.can_bet,
                "raise": legal.can_raise,
            }[action.type.value]
            assert ok, f"illegal {action} in spot {legal}"
            hand.apply(action)  # would raise IllegalAction if not legal
        assert hand.is_over


def test_simulation_conserves_chips():
    bots = [Bot(archetypes.make(n)) for n in ["nit", "tag", "lag", "station", "maniac", "tag"]]
    rng = random.Random(1)
    random.seed(1)
    for h in range(200):
        summaries = play_hand(bots, button=h % 6, rng=rng)
        assert sum(s.net for s in summaries) == 0  # zero-sum each hand


def test_stats_are_in_range():
    acc = run(2000, seed=3)
    for arch in acc.archetypes():
        line = acc.line(arch)
        assert 0 <= line.vpip <= 100
        assert 0 <= line.pfr <= 100
        assert line.pfr <= line.vpip + 1e-9  # can't raise more often than play
        assert line.af >= 0


def test_archetype_ordering_makes_sense():
    """Looser archetypes should play more hands than tighter ones."""
    acc = run(4000, seed=5)
    vpip = {a: acc.line(a).vpip for a in acc.archetypes()}
    assert vpip["Nit"] < vpip["TAG"] < vpip["LAG"]
    assert vpip["Calling Station"] > vpip["TAG"]
    assert vpip["Maniac"] > vpip["TAG"]
    # Station is passive (low PFR despite high VPIP); Maniac is aggressive.
    assert acc.line("Calling Station").pfr < acc.line("Maniac").pfr


def test_aggression_ordering():
    acc = run(4000, seed=6)
    af = {a: acc.line(a).af for a in acc.archetypes()}
    assert af["Calling Station"] < af["Nit"] < af["Maniac"]
