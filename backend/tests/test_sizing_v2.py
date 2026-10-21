"""P3.6: texture sizing, tells, jitter, no crumbs and legal chip amounts."""

from __future__ import annotations

import dataclasses
import math
import random

import pytest

from poker.engine.types import ActionType
from poker.strategy.dials import TYPE_DIALS
from poker.strategy.scenario import scenario
from poker.strategy.sizing import bet_frac, geometric_frac, preflop_to_bb, to_action
from poker.strategy.spot import build_spot
from poker.strategy.types import Choice, Kind

TAG, LAG, STATION = TYPE_DIALS["tag"], TYPE_DIALS["lag"], TYPE_DIALS["station"]
SRP = ["BTN raise 2.5", "BB call", "flop", "BB check"]
DRY, WET = "Ks7d2c", "9h8h6c"


def spot(hero, board="", *, hero_pos, line, **kw):
    return build_spot(scenario(hero, board, hero_pos=hero_pos, line=line, **kw))


def test_regs_size_by_texture_not_strength():
    dry = spot("AsQd", DRY, hero_pos="BTN", line=SRP)
    wet = spot("AsQd", WET, hero_pos="BTN", line=SRP)
    for purpose, s in (("value", 0.9), ("bluff", 0.2), ("semibluff", 0.4)):
        assert bet_frac(dry, s, TAG, purpose) == pytest.approx(0.33)
        assert bet_frac(wet, s, TAG, purpose) == pytest.approx(0.66)
    semi = spot("AsQd", "Ks7h2h", hero_pos="BTN", line=SRP)
    assert bet_frac(semi, 0.5, TAG, "value") == pytest.approx(0.50)


def test_three_bet_pot_cbet_33():
    s = spot("AsQd", WET, hero_pos="BTN", line=["CO raise 2.5", "BTN raise 7.5", "CO call", "flop", "CO check"])
    assert s.pot_type == "3bet"
    assert bet_frac(s, 0.8, TAG, "value") == pytest.approx(0.33)


def test_turn_66_river_75():
    turn = spot("AsQd", DRY + "3h", hero_pos="BTN", line=SRP + ["BTN check", "turn", "BB check"])
    river = spot("AsQd", DRY + "3h4s", hero_pos="BTN",
                 line=SRP + ["BTN check", "turn", "BB check", "BTN check", "river", "BB check"])
    assert bet_frac(turn, 0.8, TAG, "value") == pytest.approx(0.66)
    assert bet_frac(river, 0.8, TAG, "value") == pytest.approx(0.75)


def test_polar_overbet_for_lag():
    river = spot("AsQd", DRY + "3h4s", hero_pos="BTN",
                 line=SRP + ["BTN check", "turn", "BB check", "BTN check", "river", "BB check"])
    assert bet_frac(river, 0.2, LAG, "bluff") == pytest.approx(1.25 * LAG.size)
    assert bet_frac(river, 0.97, LAG, "value") == pytest.approx(1.25 * LAG.size)
    assert bet_frac(river, 0.85, LAG, "value") == pytest.approx(0.75 * LAG.size)
    assert bet_frac(river, 0.2, TAG, "bluff") == pytest.approx(0.75)


def test_near_nuts_use_geometric_sizing():
    s = spot("AsQd", DRY, hero_pos="BTN", line=SRP)
    behind = s.spr * s.pot
    want = max(0.33, geometric_frac(s.pot, behind, 3))
    assert bet_frac(s, 0.97, TAG, "value") == pytest.approx(want)
    assert want > 0.33


def test_tell_couples_size_for_station():
    s = spot("AsQd", DRY + "3h4s", hero_pos="BTN",
             line=SRP + ["BTN check", "turn", "BB check", "BTN check", "river", "BB check"])
    hi, lo = bet_frac(s, 0.95, STATION, "value"), bet_frac(s, 0.6, STATION, "value")
    assert hi > lo
    assert lo == pytest.approx(0.75 * STATION.size * (1 + 2 * STATION.tell * (0.6 - 0.85)))
    assert bet_frac(s, 0.0, STATION, "value") == pytest.approx(0.75 * STATION.size * 0.25)


def test_geometric():
    assert geometric_frac(100, 150, 2) == pytest.approx(0.5)
    assert geometric_frac(100, 300, 2) == pytest.approx((math.sqrt(7) - 1) / 2)
    assert geometric_frac(100, 100, 1) == pytest.approx(1.0)


def _open(pos, line=(), stack=100, dials=TAG, seed=0):
    s = spot("2c3d", hero_pos=pos, line=list(line), stacks_bb=stack)
    return s, to_action(Choice(Kind.RAISE), s, dials, random.Random(seed))


def test_preflop_sizes():
    utg = spot("2c3d", hero_pos="UTG", line=[])
    assert preflop_to_bb(utg, TAG) == pytest.approx(2.5)
    assert preflop_to_bb(spot("2c3d", hero_pos="SB", line=[]), TAG) == pytest.approx(3.0)
    assert preflop_to_bb(spot("2c3d", hero_pos="BTN", line=["UTG call"]), TAG) == pytest.approx(3.5)
    assert preflop_to_bb(spot("2c3d", hero_pos="BB", line=["UTG call", "BTN call"]), TAG) == pytest.approx(5.0)
    assert preflop_to_bb(spot("2c3d", hero_pos="BTN", line=["CO raise 2.5"]), TAG) == pytest.approx(7.5)
    assert preflop_to_bb(spot("2c3d", hero_pos="BB", line=["CO raise 2.5"]), TAG) == pytest.approx(10.0)
    assert preflop_to_bb(spot("2c3d", hero_pos="SB", line=["CO raise 2.5", "BTN call"]), TAG) == pytest.approx(12.5)
    four = spot("2c3d", hero_pos="CO", line=["CO raise 2.5", "BTN raise 7.5"])
    assert preflop_to_bb(four, TAG) == pytest.approx(16.5)
    assert preflop_to_bb(utg, STATION) == pytest.approx(2.25)
    for seed in range(50):
        _, a = _open("UTG", seed=seed)
        assert a.type == ActionType.RAISE and 24 <= a.to_amount <= 26
        _, a = _open("SB", seed=seed)
        assert 28 <= a.to_amount <= 32
        _, a = _open("BTN", ["UTG call"], seed=seed)
        assert 33 <= a.to_amount <= 37
        _, a = _open("BTN", ["CO raise 2.5"], seed=seed)
        assert 71 <= a.to_amount <= 79
        _, a = _open("BB", ["CO raise 2.5"], seed=seed)
        assert 95 <= a.to_amount <= 105
        _, a = _open("CO", ["CO raise 2.5", "BTN raise 7.5"], seed=seed)
        assert 156 <= a.to_amount <= 174
        _, a = _open("UTG", dials=STATION, seed=seed)
        assert 21 <= a.to_amount <= 24
    # A raise that commits more than 40% of the stack is a jam.
    s, a = _open("BTN", ["CO raise 2.5"], stack=18)
    assert a.to_amount == s.legal.max_raise_to
    s, a = _open("UTG", stack=5)
    assert a.to_amount == s.legal.max_raise_to
    s, a = _open("UTG", stack=7)
    assert a.to_amount < s.legal.max_raise_to


def test_jam_and_degenerate_legal_sets():
    s = spot("2c3d", hero_pos="BTN", line=["CO raise 2.5"])
    rng = random.Random(1)
    a = to_action(Choice(Kind.JAM), s, TAG, rng)
    assert a.type == ActionType.RAISE and a.to_amount == s.legal.max_raise_to
    allin = spot("2c3d", hero_pos="BTN", line=["CO jam"], stacks_bb={"BTN": 50})
    assert not allin.legal.can_raise
    assert to_action(Choice(Kind.JAM), allin, TAG, rng).type == ActionType.CALL
    assert to_action(Choice(Kind.RAISE), allin, TAG, rng).type == ActionType.CALL
    first = spot("AsQd", DRY, hero_pos="BTN", line=SRP)
    assert to_action(Choice(Kind.FOLD), first, TAG, rng).type == ActionType.CHECK
    assert to_action(Choice(Kind.CALL), first, TAG, rng).type == ActionType.CHECK
    bet = to_action(Choice(Kind.BET, 0.33), first, TAG, rng)
    assert bet.type == ActionType.BET and abs(bet.to_amount - 0.33 * first.pot) <= 0.05 * 0.33 * first.pot + 1


def test_check_raise_is_3_25x():
    s = spot("AsQd", DRY, hero_pos="BB", line=["BTN raise 2.5", "BB call", "flop", "BB check", "BTN bet 0.5"])
    level = s.street_bet + s.to_call
    for seed in range(20):
        a = to_action(Choice(Kind.RAISE), s, TAG, random.Random(seed))
        assert 3.25 * level * 0.95 - 1 <= a.to_amount <= 3.25 * level * 1.05 + 1
    lead = spot("AsQd", DRY, hero_pos="BTN", line=["BTN raise 2.5", "BB call", "flop", "BB bet 0.5"])
    level = lead.street_bet + lead.to_call
    a = to_action(Choice(Kind.RAISE), lead, TAG, random.Random(0))
    assert 3 * level * 0.95 - 1 <= a.to_amount <= 3 * level * 1.05 + 1


def _random_spots(n, seed):
    rng = random.Random(seed)
    lines = [
        ("UTG", "", []),
        ("BTN", "", ["CO raise 2.5"]),
        ("CO", "", ["CO raise 2.5", "BTN raise 7.5"]),
        ("BTN", DRY, SRP),
        ("BB", WET, ["BTN raise 2.5", "BB call", "flop", "BB check", "BTN bet 0.5"]),
        ("BTN", WET + "2s", ["BTN raise 2.5", "BB call", "flop", "BB check", "BTN bet 0.33", "BB call",
                            "turn", "BB bet 0.75"]),
        ("BTN", DRY + "3h4s", SRP + ["BTN check", "turn", "BB check", "BTN check", "river", "BB check"]),
    ]
    for i in range(n):
        pos, board, line = lines[i % len(lines)]
        stacks = {p: rng.choice([rng.uniform(3, 40), rng.uniform(40, 250)])
                  for p in ("SB", "BB", "UTG", "MP", "CO", "BTN")}
        try:
            s = spot("AsQd", board, hero_pos=pos, line=line, stacks_bb=stacks, seed=i)
        except ValueError:
            continue
        yield s


def test_no_crumbs():
    rng = random.Random(7)
    checked = 0
    for s in _random_spots(300, seed=3):
        for _ in range(8):
            kind = Kind.BET if s.legal.can_bet else Kind.RAISE
            choice = Choice(kind, rng.uniform(0.05, 2.5) if kind == Kind.BET else None)
            dials = dataclasses.replace(TAG, size_pre=rng.uniform(0.7, 1.8))
            a = to_action(choice, s, dials, rng)
            legal = s.legal
            if a.type in (ActionType.BET, ActionType.RAISE):
                assert legal.min_raise_to <= a.to_amount <= legal.max_raise_to
                checked += 1
                if a.to_amount == legal.max_raise_to:
                    continue
                added = a.to_amount - s.street_bet
                usable = s.eff_stack - s.street_bet
                behind = s.eff_stack - a.to_amount
                level = s.street_bet + s.to_call
                pot_after = s.pot + added + (a.to_amount - level)
                assert not (0 < behind < 0.3 * pot_after), (s.street, a, behind, pot_after)
                assert behind > 0
                if s.street == "preflop":
                    assert added <= 0.4 * usable
                else:
                    assert added < 0.6 * usable
            else:
                assert a.type == ActionType.CALL and legal.can_call and not legal.can_aggress
    assert checked >= 2000


def test_jitter_within_5pct_and_always_legal():
    s = spot("AsQd", DRY, hero_pos="BTN", line=SRP, stacks_bb=500)
    target = 0.5 * s.pot
    seen = set()
    for seed in range(200):
        a = to_action(Choice(Kind.BET, 0.5), s, TAG, random.Random(seed))
        assert a.type == ActionType.BET
        assert target * 0.95 - 0.5 <= a.to_amount <= target * 1.05 + 0.5
        assert s.legal.min_raise_to <= a.to_amount <= s.legal.max_raise_to
        seen.add(a.to_amount)
    assert len(seen) > 1
