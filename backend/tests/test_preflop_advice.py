"""The beta coach's preflop chart advice plays the rules the v2 bots play.

Regression tests for review 3: the short-stack jam and the small-pair flat rule
(§4.6), the iso-raiser's own range facing a 3-bet, and the SB's 3bb open as the
BB's standard defence size.
"""

from __future__ import annotations

import pytest

from poker.bots.personas import Persona
from poker.coach.reduced import advice_text, preflop_advice
from poker.strategy.charts import preflop as ch
from poker.strategy.charts.order import CLASSES, COMBOS_OF
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


@pytest.mark.parametrize("hole", ["QsQd", "AsKd"])
def test_short_stack_3bet_advice_is_a_jam(hole):
    sp, dist, adv = _both(hole, "BTN", ["CO raise 2.5"], stacks=22)
    assert _p(dist, Kind.JAM) == 1.0
    assert adv["action"] == "jam" and adv["all_in"] and adv["to_amount"] == sp.legal.max_raise_to
    assert advice_text(adv, sp)[0].startswith("All-in")


def test_short_stack_4bet_advice_is_a_jam():
    _, dist, adv = _both("AsAd", "CO", ["CO raise 2.5", "BTN raise 7.5"], stacks=24)
    assert _p(dist, Kind.JAM) == 1.0
    assert adv["action"] == "jam" and adv["all_in"]


def test_deep_3bet_advice_stays_a_3bet():
    _, _, adv = _both("QsQd", "BTN", ["CO raise 2.5"], stacks=100)
    assert adv["action"] == "3bet" and not adv["all_in"]


def test_small_pair_needs_18x_to_flat_in_advice():
    _, dist, adv = _both("5s5d", "BTN", ["CO raise 2.5"], stacks=40)
    assert _p(dist, Kind.FOLD) == 1.0
    assert adv["action"] == "fold" and not adv["in_chart"]


def test_small_pair_flats_deep_in_advice():
    _, dist, adv = _both("5s5d", "BTN", ["CO raise 2.5"], stacks=100)
    assert _p(dist, Kind.CALL) > 0.5 and adv["action"] == "call"


def test_bb_iso_raiser_facing_3bet_advice_uses_its_iso_range():
    _, dist, adv = _both("QsQd", "BB", ["UTG call", "BB raise 4", "UTG raise 12"])
    assert _p(dist, Kind.CALL) > 0.5
    assert adv["action"] == "call" and adv["chart"] == "call a 3-bet out of position"


def test_iso_raiser_facing_3bet_cut_shrinks_per_limper():
    def calls(own):
        t = ch.vs_3bet_probs("CO", "BTN", own_cut=own)
        return {c for c, (p4, p_call) in t.items() if p_call > p4 and p_call >= 1 - p4 - p_call}

    iso, unopened = calls(ch.open_cut("CO", 1.0, 1)), calls(ch.open_cut("CO"))
    assert iso < unopened  # the test bites: some unopened calls fold as an iso
    advised = {
        c for c in CLASSES
        if ch.chart_advice(c, "CO", "vs_3bet", opener="CO", threebettor="BTN", limpers=1).action == "call"
    }
    assert advised == iso


def test_bb_defends_the_published_share_vs_a_standard_sb_open():
    t = ch.vs_open_probs("BB", "SB", k=ch.size_factor(3.0, "SB"))
    share = sum(COMBOS_OF[c] * (a + b) for c, (a, b) in t.items()) / 1326
    assert share == pytest.approx(ch.BB_DEFEND_TARGET["SB"], abs=0.01)


@pytest.mark.parametrize("hole", ["Js3s", "Th5h", "6c3c"])
def test_bb_defends_the_chart_vs_a_3bb_sb_open(hole):
    _, dist, adv = _both(hole, "BB", ["SB raise 3"])
    assert adv["action"] == "call" and adv["chart"] == "BB defence vs SB"
    assert _p(dist, Kind.CALL) > 0.5
