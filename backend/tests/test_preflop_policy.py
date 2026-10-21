"""P3.4: the chart-based preflop policy (charts x dials, sizes from P3.6)."""

from __future__ import annotations

import dataclasses

import pytest

from poker.bots.preflop_ranges import RFI_RANGES
from poker.math.suits import class_of
from poker.math.vector import COMBOS
from poker.math.cards import FULL_DECK
from poker.strategy.charts import preflop as charts
from poker.strategy.charts.order import CLASSES, COMBOS_OF
from poker.strategy.dials import TYPE_DIALS
from poker.strategy.preflop import decide_preflop, line_likelihood, preflop_range_weights
from poker.strategy.scenario import scenario
from poker.strategy.spot import build_spot
from poker.strategy.types import Kind, Node

POSITIONS = ("UTG", "MP", "CO", "BTN", "SB", "BB")
TYPES = tuple(TYPE_DIALS)
TAG = TYPE_DIALS["tag"]


def spot(hero_pos, line, hero="2c3d", **kw):
    return build_spot(scenario(hero, hero_pos=hero_pos, line=line, **kw))


def p(dist, *kinds):
    return sum(v for c, v in dist.items() if c.kind in kinds)


def p_raise(dist):
    return p(dist, Kind.RAISE, Kind.JAM)


def _rfi(pos):
    return {class_of(c) for c in RFI_RANGES[pos]}


def _open_set(dials, pos):
    s = spot(pos, [])
    return {c for c in CLASSES if p_raise(decide_preflop(s, c, dials)[0]) >= 0.5}


def test_tag_open_1_0_matches_rfi_lists():
    dials = dataclasses.replace(TAG, open=1.0, limp=0.0)
    for pos in POSITIONS[:-1]:
        assert _open_set(dials, pos) == _rfi(pos), pos


def test_ranges_nest_nit_tag_lag():
    for pos in POSITIONS[:-1]:
        nit, tag, lag = (_open_set(TYPE_DIALS[t], pos) for t in ("nit", "tag", "lag"))
        assert nit <= tag <= lag, pos
        assert nit < lag, pos


def test_limp_share_and_premiums_never_limp():
    station = TYPE_DIALS["station"]
    s = spot("BTN", [])
    d = decide_preflop(s, "98o", station)[0]
    enter = p(d, Kind.CALL) + p_raise(d)
    assert p(d, Kind.CALL) == pytest.approx(enter * station.limp)
    aa = decide_preflop(s, "AA", station)[0]
    assert p(aa, Kind.CALL) == 0 and p_raise(aa) == pytest.approx(1.0)


def test_aa_in_bb_raises_limpers():
    s = spot("BB", ["UTG call"])
    assert s.node == Node.UNOPENED and s.limpers == 1
    for t in TYPES:
        d = decide_preflop(s, "AA", TYPE_DIALS[t])[0]
        assert p_raise(d) >= 0.90, t
        assert p(decide_preflop(s, "72o", TYPE_DIALS[t])[0], Kind.CHECK) == pytest.approx(1.0)


def test_iso_cut_shrinks_per_limper():
    one = decide_preflop(spot("BTN", ["UTG call"]), "AA", TAG)[1]
    two = decide_preflop(spot("BTN", ["UTG call", "MP call"]), "AA", TAG)[1]
    assert two["cut"] == pytest.approx(one["cut"] * charts.ISO_SHRINK)


def test_ak_never_folds_to_a_single_open():
    for t in ("tag", "nit", "lag"):
        for opener in POSITIONS[:-1]:
            for hero in charts.heroes_after(opener):
                s = spot(hero, [f"{opener} raise 2.5"])
                for cls in ("AKs", "AKo"):
                    assert p(decide_preflop(s, cls, TYPE_DIALS[t])[0], Kind.FOLD) == 0, (t, hero, opener, cls)


def test_aa_never_folds_to_a_4bet():
    s = spot("BTN", ["CO raise 2.5", "BTN raise 7.5", "CO raise 2.2x"])
    assert s.node == Node.VS_4BET
    for t in TYPES:
        d = decide_preflop(s, "AA", TYPE_DIALS[t])[0]
        assert p(d, Kind.FOLD) == 0 and p(d, Kind.JAM) == pytest.approx(1.0), t


def test_vs_4bet_continues_on_price():
    s = spot("BTN", ["CO raise 2.5", "BTN raise 7.5", "CO raise 2.2x"])
    price = s.facts.to_call / s.facts.winnable_if_call
    assert price <= charts.CONTINUE_VS_4BET_PRICE
    assert p(decide_preflop(s, "QQ", TAG)[0], Kind.CALL) == pytest.approx(1.0)
    big = spot("BTN", ["CO raise 2.5", "BTN raise 7.5", "CO raise 5x"])
    assert big.facts.to_call / big.facts.winnable_if_call > charts.CONTINUE_VS_4BET_PRICE
    assert p(decide_preflop(big, "QQ", TAG)[0], Kind.FOLD) == pytest.approx(1.0)
    assert p(decide_preflop(s, "JJ", TAG)[0], Kind.FOLD) == pytest.approx(1.0)


def test_reg_flats_outside_the_bb():
    s = spot("BTN", ["CO raise 2.5"])
    for cls in ("88", "KQs", "T9s"):
        assert p(decide_preflop(s, cls, TAG)[0], Kind.CALL) >= 0.5, cls
    sb = spot("SB", ["BTN raise 2.5"])
    assert p(decide_preflop(sb, "66", TAG)[0], Kind.CALL) <= 0.2


def _fold_to_3bet(opener, line):
    opens = spot(opener, [])
    facing = spot(opener, line)
    assert facing.node == Node.VS_3BET
    total = folds = 0.0
    for c in CLASSES:
        w = COMBOS_OF[c] * p_raise(decide_preflop(opens, c, TAG)[0])
        total += w
        folds += w * p(decide_preflop(facing, c, TAG)[0], Kind.FOLD)
    return folds / total


def test_3bet_fold_share_matches_the_cut():
    """In position the call cut is 0.45 of the opener's own cut; out of position
    0.42 (owner decision (c)), so a reg folds inside the 45-62% pool band."""
    ip = _fold_to_3bet("BTN", ["BTN raise 2.5", "BB raise 10"])
    assert ip == pytest.approx(1 - 0.45, abs=0.03)
    oop = _fold_to_3bet("UTG", ["UTG raise 2.5", "BTN raise 7.5"])
    assert oop == pytest.approx(1 - 0.42, abs=0.03)
    assert 0.45 <= ip <= 0.62 and 0.45 <= oop <= 0.62


def test_open_size_shrinks_cuts():
    small = decide_preflop(spot("BTN", ["CO raise 2.5"]), "88", TAG)[1]
    big = decide_preflop(spot("BTN", ["CO raise 3.5"]), "88", TAG)[1]
    assert big["cut"] == pytest.approx(small["cut"] * (2.5 / 3.5) ** 0.8)
    assert small["node"] == "vs_open"


def test_short_stack_3bet_is_a_jam():
    s = spot("BTN", ["CO raise 2.5"], stacks_bb=20)
    d = decide_preflop(s, "KK", TAG)[0]
    assert {c.kind for c in d} == {Kind.JAM}
    deep = decide_preflop(spot("BTN", ["CO raise 2.5"]), "KK", TAG)[0]
    assert {c.kind for c in deep} == {Kind.RAISE}


def test_small_pairs_need_18x():
    short = spot("BB", ["BTN raise 2.5"], stacks_bb=12)
    assert p(decide_preflop(short, "44", TAG)[0], Kind.CALL) == 0
    deep = spot("BB", ["BTN raise 2.5"])
    assert p(decide_preflop(deep, "44", TAG)[0], Kind.CALL) >= 0.5


def test_squeeze_uses_the_squeeze_lists():
    s = spot("SB", ["CO raise 2.5", "BTN call"])
    assert s.callers == 1
    assert p_raise(decide_preflop(s, "QQ", TAG)[0]) == pytest.approx(1.0)
    bluff = min(1.0, charts.SQUEEZE_BLUFF_P * TAG.threebet)
    assert p_raise(decide_preflop(s, "A5s", TAG)[0]) == pytest.approx(bluff)
    assert p_raise(decide_preflop(s, "KJs", TAG)[0]) == 0


def test_limper_facing_an_iso_raise():
    s = spot("UTG", ["UTG call", "BTN raise 3.5"])
    assert s.node == Node.VS_OPEN and s.opener_pos == "BTN"
    assert p_raise(decide_preflop(s, "AA", TAG)[0]) == pytest.approx(1.0)
    assert p(decide_preflop(s, "72o", TAG)[0], Kind.FOLD) == pytest.approx(1.0)
    bb = spot("UTG", ["UTG call", "BB raise 4"])
    assert p_raise(decide_preflop(bb, "KK", TAG)[0]) == pytest.approx(1.0)


def test_line_likelihood():
    folded = spot("BTN", ["UTG fold"])
    utg = folded.positions.index("UTG")
    w = line_likelihood(TAG, folded, utg)
    assert len(w) == 169
    assert w[CLASSES.index("AA")] == 0
    opened = spot("BTN", ["UTG raise 2.5"])
    w = line_likelihood(TAG, opened, utg)
    assert w[CLASSES.index("AA")] > 0.95 and w[CLASSES.index("72o")] < 0.02
    # A seat that has not acted yet carries no information.
    bb = opened.positions.index("BB")
    assert set(line_likelihood(TAG, opened, bb)) == {1.0}
    # Memoised: the same spot gives the same object.
    assert line_likelihood(TAG, opened, utg) is line_likelihood(TAG, opened, utg)


def test_line_likelihood_multiplies_decisions():
    s = build_spot(scenario(
        "AsKd", "Qh7c2d", hero_pos="BTN", line=["CO raise 2.5", "BTN raise 7.5", "CO call", "flop", "CO check"]
    ))
    assert s.street == "flop"
    co = s.positions.index("CO")
    w = line_likelihood(TAG, s, co)
    opens = spot("CO", [])
    vs3 = spot("CO", ["CO raise 2.5", "BTN raise 7.5"])
    for cls in ("AQs", "88", "KK", "72o"):
        want = p_raise(decide_preflop(opens, cls, TAG)[0]) * p(decide_preflop(vs3, cls, TAG)[0], Kind.CALL)
        assert w[CLASSES.index(cls)] == pytest.approx(want), cls


def test_preflop_range_weights_card_removal():
    s = spot("BTN", ["UTG raise 2.5"])
    utg = s.positions.index("UTG")
    dead = ["As", "Kd", "7h"]
    w = preflop_range_weights(TAG, s, utg, dead)
    lk = line_likelihood(TAG, s, utg)
    assert len(w) == 1326
    for i, (a, b) in enumerate(COMBOS.tolist()):
        cards = (FULL_DECK[a], FULL_DECK[b])
        want = 0.0 if set(cards) & set(dead) else lk[CLASSES.index(class_of(cards))]
        assert w[i] == pytest.approx(want)


SCENARIOS = [
    ("UTG", [], 100),
    ("SB", [], 100),
    ("BB", ["UTG call", "SB call"], 100),
    ("BTN", ["UTG call", "MP call"], 100),
    ("BTN", ["CO raise 2.5"], 100),
    ("BB", ["BTN raise 2.5"], 100),
    ("SB", ["CO raise 2.5", "BTN call"], 100),
    ("CO", ["CO raise 2.5", "BTN raise 7.5"], 100),
    ("BB", ["CO raise 2.5", "BTN raise 7.5"], 100),
    ("BTN", ["CO raise 2.5", "BTN raise 7.5", "CO raise 2.2x"], 100),
    ("CO", ["CO raise 2.5", "BTN raise 7.5", "CO raise 2.2x", "BTN raise 2.2x"], 100),
    ("BTN", ["CO raise 2.5"], 12),
    ("UTG", ["UTG call", "BTN raise 3.5"], 100),
    ("BB", ["BTN raise 2.5"], 3),
]


@pytest.mark.parametrize("hero_pos,line,stack", SCENARIOS)
def test_distributions_sum_to_one_and_are_legal(hero_pos, line, stack):
    s = spot(hero_pos, line, stacks_bb=stack)
    for t in TYPES:
        for cls in CLASSES:
            dist, trace = decide_preflop(s, cls, TYPE_DIALS[t])
            assert sum(dist.values()) == pytest.approx(1.0), (t, cls)
            assert all(v > 0 for v in dist.values())
            for c in dist:
                if c.kind == Kind.CHECK:
                    assert s.legal.can_check
                elif c.kind == Kind.CALL:
                    assert s.legal.can_call
                elif c.kind in (Kind.RAISE, Kind.JAM):
                    assert s.legal.can_aggress
                else:
                    assert c.kind == Kind.FOLD and not s.legal.can_check
            assert trace["node"] == s.node.value
