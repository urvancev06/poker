"""P3.3: strategy types, Spot features, the scenario builder and the context fields."""

from __future__ import annotations

import dataclasses

import pytest

from poker.bots.context import build_context
from poker.engine import Hand
from poker.engine.types import Action, ActionType
from poker.strategy.scenario import deal_scenario, scenario
from poker.strategy.spot import build_spot, size_bucket, with_faced_size
from poker.strategy.types import Choice, Kind, Node, PreflopLine, normalise

SRP_FLOP = ["BTN raise 2.5", "BB call", "flop"]


def spot(*args, **kw):
    return build_spot(scenario(*args, **kw))


def test_choice_and_normalise():
    a, b = Choice(Kind.CALL), Choice(Kind.BET, 0.33)
    assert Choice(Kind.BET, 0.33) == b and len({a, b, Choice(Kind.CALL)}) == 2
    assert Kind("jam") is Kind.JAM and Node("vs_cbet") is Node.VS_CBET
    d = normalise({a: 2.0, b: 6.0, Choice(Kind.FOLD): 0.0})
    assert d == {a: 0.25, b: 0.75}
    with pytest.raises(ValueError):
        normalise({a: 0.0})


def test_vs_open_spot():
    s = spot("KsQs", hero_pos="BTN", line=["CO raise 2.5"])
    assert s.node == Node.VS_OPEN and s.street == "preflop" and s.position == "BTN"
    assert s.opener_pos == "CO" and s.open_size_bb == 2.5 and s.to_call == 25
    assert s.raise_level == 1 and s.pot_type == "srp" and s.limpers == 0 and s.callers == 0
    assert s.big_blind == 10 and s.pot == 40 and s.eff_stack == 1000
    assert s.in_position and s.players_to_act == 2
    co = s.positions.index("CO")
    assert s.preflop_lines[co] == PreflopLine(co, (("unopened", "raise", 2.5),))
    assert s.facing_frac is None and s.size_bucket is None


def test_vs_3bet_spot():
    s = spot("AhJh", hero_pos="CO", line=["CO raise 2.5", "BTN raise 7.5"])
    assert s.node == Node.VS_3BET and s.threebettor_pos == "BTN" and s.opener_pos == "CO"
    assert s.raise_level == 2 and s.to_call == 50 and s.pot_type == "3bet"
    assert not s.in_position and s.aggressor_seat == s.positions.index("BTN")
    btn = s.positions.index("BTN")
    assert s.preflop_lines[btn].actions == (("vs_open", "raise", 7.5),)
    cold = spot("QdQc", hero_pos="BB", line=["CO raise 2.5", "BTN raise 7.5"])
    assert cold.node == Node.COLD_VS_3BET
    four = spot("AdAc", hero_pos="BTN", line=["CO raise 2.5", "BTN raise 7.5", "CO raise 2.2x"])
    assert four.node == Node.VS_4BET and four.pot_type == "4bet+" and four.to_call == 165 - 75


def test_limpers_counted():
    s = spot("8d8c", hero_pos="BTN", line=["UTG call", "MP call"])
    assert s.node == Node.UNOPENED and s.limpers == 2 and s.pot_type == "limped"
    bb = spot("AsKd", hero_pos="BB", line=["UTG call", "BTN call", "SB call"])
    assert bb.node == Node.UNOPENED and bb.limpers == 3 and bb.to_call == 0 and bb.legal.can_check
    sq = spot("AsKd", hero_pos="BB", line=["CO raise 2.5", "BTN call", "SB call"])
    assert sq.node == Node.VS_OPEN and sq.callers == 2 and sq.limpers == 0


def test_vs_cbet_small_bucket():
    s = spot("Th9h", "Kd7c2h", hero_pos="BB", line=SRP_FLOP + ["BB check", "BTN bet 0.33"])
    assert s.node == Node.VS_CBET and s.size_bucket == "S" and s.street == "flop"
    assert s.facing_frac == pytest.approx(18 / 55) and s.to_call == 18 and s.pot == 73
    btn = s.positions.index("BTN")
    assert s.aggressor_seat == btn and not s.is_aggressor and not s.in_position
    assert s.pot_type == "srp" and s.opponents == (btn,) and s.board == ("Kd", "7c", "2h")
    assert s.spr == pytest.approx(957 / 73)  # chips behind now / pot now


def test_first_in_and_leading_into_the_aggressor():
    btn = spot("AsKs", "Kd7c2h", hero_pos="BTN", line=SRP_FLOP + ["BB check"])
    assert btn.node == Node.FIRST_IN and btn.is_aggressor and btn.in_position
    assert btn.raise_level == 0 and not btn.leading_into_aggressor
    bb = spot("7d7s", "Kd7c2h", hero_pos="BB", line=SRP_FLOP)
    assert bb.node == Node.FIRST_IN and bb.leading_into_aggressor and not bb.is_aggressor


def test_donk_and_check_raise_nodes():
    board = "Kd7c2h"
    donk = spot("AsKs", board, hero_pos="BTN", line=SRP_FLOP + ["BB bet 0.5"])
    assert donk.node == Node.VS_DONK and donk.size_bucket == "M"
    xr = spot("Th9h", board, hero_pos="BTN", line=SRP_FLOP + ["BB check", "BTN bet 0.33", "BB raise 3x"])
    assert xr.node == Node.VS_CHECK_RAISE and xr.to_call == 54 - 18
    vs_raise = spot("7d7s", board, hero_pos="BB", line=SRP_FLOP + ["BB bet 0.5", "BTN raise 3x"])
    assert vs_raise.node == Node.VS_RAISE
    rr = spot("AsKs", board, hero_pos="BTN",
              line=SRP_FLOP + ["BB check", "BTN bet 0.33", "BB raise 3x", "BTN raise 3x", "BB raise 3x"])
    assert rr.node == Node.VS_RERAISE
    barrel = spot("Th9h", board + "3s", hero_pos="BB",
                  line=SRP_FLOP + ["BB check", "BTN bet 0.33", "BB call", "turn", "BB check", "BTN bet 0.66"])
    assert barrel.node == Node.VS_BARREL and barrel.street == "turn"
    limped = spot("9s8s", board, hero_pos="SB",
                  line=["UTG call", "SB call", "BB check", "flop", "SB check", "BB bet 0.5", "UTG call"])
    assert limped.node == Node.VS_BET and limped.aggressor_seat is None and limped.pot_type == "limped"
    assert limped.callers == 0 and limped.limpers == 2


def test_raise_level_counts_postflop():
    board = "Kd7c2h"
    base = SRP_FLOP + ["BB check", "BTN bet 0.33"]
    assert spot("Th9h", board, hero_pos="BB", line=base).raise_level == 1
    assert spot("AsKs", board, hero_pos="BTN", line=base + ["BB raise 3x"]).raise_level == 2
    assert spot("Th9h", board, hero_pos="BB", line=base + ["BB raise 3x", "BTN raise 3x"]).raise_level == 3


def test_context_history_is_redacted():
    ctx = scenario("Th9h", "Kd7c2h", hero_pos="BB", line=SRP_FLOP + ["BB check", "BTN bet 0.33"],
                   villain_holes={"BTN": "AhAd"})
    assert ctx.history and all(e.hole_cards is None for e in ctx.history if e.seat != ctx.seat)
    assert all(s.hole_cards is None for s in ctx.seats if s.seat != ctx.seat)
    assert ctx.seats[ctx.seat].hole_cards == ["Th", "9h"]
    assert ctx.blinds == (5, 10) and ctx.facts is not None and ctx.facts.to_call == ctx.to_call


def test_scenario_deals_what_it_is_told():
    hand, ctx = deal_scenario("Th9h", "Kd7c2h", hero_pos="BB", line=SRP_FLOP,
                              villain_holes={"BTN": "AhAd"}, seed=4)
    holes = hand.dealt_holes()
    assert holes[ctx.seat] == ["Th", "9h"] and holes[5] == ["Ah", "Ad"]
    assert ctx.board == ["Kd", "7c", "2h"]
    dealt = [c for h in holes for c in h] + ctx.board
    assert len(dealt) == len(set(dealt))
    again, _ = deal_scenario("Th9h", "Kd7c2h", hero_pos="BB", line=SRP_FLOP,
                             villain_holes={"BTN": "AhAd"}, seed=4)
    assert again.dealt_holes() == holes
    short = spot("AsKd", hero_pos="BTN", line=["CO raise 2.5"], stacks_bb={"BTN": 20})
    assert short.stack == 200 and short.eff_stack == 200
    jam = spot("AsKd", hero_pos="BB", line=["SB jam"], stacks_bb=30)
    assert jam.to_call == 290 and jam.node == Node.VS_OPEN


def test_scenario_rejects_lines_it_cannot_play():
    with pytest.raises(ValueError):
        scenario("AsKd", hero_pos="UTG", line=["CO raise 2.5"])  # hero acts first
    with pytest.raises(ValueError):
        scenario("AsKd", hero_pos="CO", line=["UTG raise 2.5", "CO fold"])  # never again
    with pytest.raises(ValueError):
        scenario("AsKd", hero_pos="BTN", line=["CO shove"])


def test_with_faced_size_rebuilds_price():
    s = spot("Th9h", "Kd7c2h", hero_pos="BB", line=SRP_FLOP + ["BB check", "BTN bet 0.33"])
    pot_before = s.pot - s.to_call
    pot = with_faced_size(s, 1.0)
    assert pot.to_call == pot_before == 55 and pot.pot == 110 and pot.legal.can_call
    assert pot.legal.call_amount == 55 and pot.legal.can_raise and pot.legal.min_raise_to == 110
    assert pot.facing_frac == pytest.approx(1.0) and pot.size_bucket == "L"
    assert with_faced_size(s, 3.0).size_bucket == "J"
    capped = with_faced_size(s, 100.0)
    assert capped.to_call == 975 and capped.legal.can_call and not capped.legal.can_raise
    assert capped.facts.winnable_if_call == 55 + 2 * 975
    assert dataclasses.replace(s) == s and with_faced_size(s, 18 / 55).to_call == s.to_call


def test_size_bucket_edges():
    assert [size_bucket(f) for f in (0.40, 0.41, 0.80, 0.81, 1.30, 2.0, 2.01)] == [
        "S", "M", "M", "L", "L", "O", "J",
    ]


def test_v1_context_fields_unchanged():
    hand = Hand.new(6, (5, 10), 1000, seed=3)
    hand.apply(Action(ActionType.RAISE, 25))
    ctx = build_context(hand, 10)
    snap = hand.snapshot(viewer=ctx.seat)
    assert ctx.pot == snap.total_pot and ctx.to_call == 25 and ctx.preflop_raises == 1
    assert ctx.position == "MP" and not ctx.folded_to_me and ctx.players_in_hand == 6
    assert len(ctx.history) == 1 and len(ctx.seats) == 6 and ctx.blinds == (5, 10)
    old = {f.name for f in dataclasses.fields(ctx)} - {"history", "seats", "facts", "blinds"}
    assert old == {
        "seat", "position", "hole", "street", "board", "legal", "pot", "to_call", "big_blind",
        "my_stack", "my_bet", "preflop_raises", "num_limpers", "folded_to_me", "is_pfr",
        "players_in_hand", "first_to_act",
    }
