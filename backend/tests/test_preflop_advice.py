"""The beta coach's preflop chart advice plays the rules the v2 bots play.

Regression tests for review 3: the SB's 3bb open is the BB's standard defence size.
"""

from __future__ import annotations

import pytest

from poker.bots.personas import Persona
from poker.coach.reduced import preflop_advice
from poker.strategy.charts import preflop as ch
from poker.strategy.charts.order import COMBOS_OF
from poker.strategy.dials import type_mean
from poker.strategy.policy import policy
from poker.strategy.private import build_private
from poker.strategy.scenario import scenario
from poker.strategy.spot import build_spot
from poker.strategy.types import Kind

TAG = Persona("t", "tag", type_mean("tag"), ())


def _both(hole, pos, line, stacks=100):
    ctx = scenario(hole, hero_pos=pos, line=line, stacks_bb=stacks)
    sp = build_spot(ctx)
    dist, _ = policy(sp, build_private(sp, ctx.hole), TAG)
    return sp, dist, preflop_advice(sp, ctx.hole)


def _p(dist, kind):
    return sum(p for c, p in dist.items() if c.kind == kind)


def test_bb_defends_the_published_share_vs_a_standard_sb_open():
    t = ch.vs_open_probs("BB", "SB", k=ch.size_factor(3.0, "SB"))
    share = sum(COMBOS_OF[c] * (a + b) for c, (a, b) in t.items()) / 1326
    assert share == pytest.approx(ch.BB_DEFEND_TARGET["SB"], abs=0.01)


@pytest.mark.parametrize("hole", ["Js3s", "Th5h", "6c3c"])
def test_bb_defends_the_chart_vs_a_3bb_sb_open(hole):
    _, dist, adv = _both(hole, "BB", ["SB raise 3"])
    assert adv["action"] == "call" and adv["chart"] == "BB defence vs SB"
    assert _p(dist, Kind.CALL) > 0.5
