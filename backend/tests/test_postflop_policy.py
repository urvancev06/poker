"""P3.5: bettor priors, private features and the priced postflop policy."""

from __future__ import annotations

import pytest

from poker.math.draws import DrawSet
from poker.strategy import constants as K
from poker.strategy.bettor import PRIORS, prior
from poker.strategy.dials import TYPE_DIALS
from poker.strategy.postflop import decide_postflop
from poker.strategy.private import build_private, clean_factor, p_hit
from poker.strategy.scenario import scenario
from poker.strategy.spot import build_spot, faced_chips, with_faced_size
from poker.strategy.types import Kind, Node

TAG, NIT, STATION, LAG, MANIAC = (TYPE_DIALS[t] for t in ("tag", "nit", "station", "lag", "maniac"))
SRP = ["BTN raise 2.5", "BB call", "flop"]
CHECKS_TO_RIVER = ["BB check", "BTN check", "turn", "BB check", "BTN check", "river"]


def setup(hero, board, *, hero_pos, line, **kw):
    s = build_spot(scenario(hero, board, hero_pos=hero_pos, line=line, **kw))
    return s, build_private(s, (hero[:2], hero[2:]))


def p(dist, *kinds):
    return sum(v for c, v in dist.items() if c.kind in kinds)


def fold(dist):
    return p(dist, Kind.FOLD)


def cont(dist):
    return 1.0 - fold(dist)


# --- priors (D34) -------------------------------------------------------------------


def test_priors_table_and_blend():
    assert PRIORS[("river", "bet")]["L"] == (0.78, 0.26)
    assert PRIORS[("river", "bet")]["J"] == (0.90, 0.20)
    assert PRIORS[("flop", "cbet")]["S"] == (0.45, 0.40)
    assert prior("flop", Node.VS_CBET, 0.3, False, 1.0) == pytest.approx((0.45, 0.40))
    assert prior("river", Node.VS_BARREL, 1.0, False, 1.0) == pytest.approx((0.78, 0.26))
    assert prior("river", Node.VS_DONK, 2.5, False, 1.0) == pytest.approx((0.90, 0.20))
    assert prior("turn", Node.VS_RAISE, 0.3, False, 1.0) == pytest.approx((0.88, 0.12))
    assert prior("river", Node.VS_CHECK_RAISE, 3.0, False, 1.0) == pytest.approx((0.92, 0.08))
    # Multiway: v + 0.05 (capped at 0.97), beta x 0.6.
    assert prior("flop", Node.VS_CBET, 0.3, True, 1.0) == pytest.approx((0.50, 0.24))
    assert prior("river", Node.VS_RERAISE, 1.0, True, 1.0) == pytest.approx((0.97, 0.03 * 0.6))
    # A size-blind player reads every size as medium.
    lo = prior("river", Node.VS_BET, 3.0, False, 0.0)
    assert lo == pytest.approx(PRIORS[("river", "bet")]["M"])
    half = prior("river", Node.VS_BET, 3.0, False, 0.5)
    assert half == pytest.approx((0.80, 0.235))


def test_p_hit_and_clean():
    fd = DrawSet(flush=True, outs=9)
    assert p_hit(fd, "flop") == pytest.approx(1 - (1 - 9 / 47) * (1 - 9 / 46))
    assert p_hit(fd, "turn") == pytest.approx(9 / 46)
    assert p_hit(fd, "river") == 0
    assert clean_factor(DrawSet(flush=True, nut_flush=True, outs=9), ["Kh", "7h", "2c"]) == 1.0
    assert clean_factor(fd, ["Kh", "7h", "2c"]) == 0.85
    assert clean_factor(DrawSet(oesd=True, outs=8), ["9c", "8d", "2s"]) == 0.9
    assert clean_factor(DrawSet(oesd=True, outs=8), ["9c", "8c", "2s"]) == 0.75
    assert clean_factor(DrawSet(gutshot=True, outs=4), ["9c", "7d", "2s"]) == 0.7
    assert clean_factor(DrawSet(gutshot=True, outs=4), ["9c", "9d", "6s"]) == pytest.approx(0.7 * 0.75)
    assert clean_factor(DrawSet(overcards=True, outs=6), ["9c", "7d", "2s"]) == 0


def test_build_private():
    s, priv = setup("Jh4h", "9h7h2c", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    btn = s.positions.index("BTN")
    assert set(priv.h) == {btn} and priv.s_all == pytest.approx(priv.h[btn])
    hit = p_hit(priv.draws, "flop") * clean_factor(priv.draws, s.board)
    assert priv.s == pytest.approx(priv.s_all + (1 - priv.s_all) * hit)
    assert priv.cls == "J4s" and priv.draws.flush and not priv.nuts
    three, pr3 = setup("4s4h", "AsAd9d3c6s", hero_pos="BTN",
                       line=["CO raise 2.5", "BTN call", "BB call", "flop"] + ["BB check", "CO check"])
    assert len(pr3.h) == 2
    assert pr3.s_all == pytest.approx(pr3.h[three.positions.index("CO")] * pr3.h[three.positions.index("BB")])


# --- facing a bet ------------------------------------------------------------------


def test_board_pair_three_way_folds():
    """The spec's hand #98."""
    line = ["CO raise 2.5", "BTN call", "BB call", "flop",
            "BB check", "CO check", "BTN check", "turn",
            "BB check", "CO check", "BTN check", "river",
            "BB check", "CO bet 1.0"]
    s, priv = setup("4s4h", "AsAd9d3c6s", hero_pos="BTN", line=line)
    assert len(s.opponents) == 2
    dist, tr = decide_postflop(s, priv, TAG)
    assert fold(dist) >= 0.90, (dist, tr)


def test_board_pair_heads_up_folds_to_pot():
    s, priv = setup("4s4h", "KsKh9d2c7s", hero_pos="BTN", line=SRP + CHECKS_TO_RIVER + ["BB bet 1.0"])
    assert s.size_bucket == "L"
    dist, tr = decide_postflop(s, priv, TAG)
    assert fold(dist) >= 0.90, (dist, tr)
    assert p(dist, Kind.RAISE, Kind.JAM) == 0


def test_flush_draw_continues():
    s, priv = setup("Jh4h", "9h7h2c", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    assert s.node == Node.VS_CBET
    dist, tr = decide_postflop(s, priv, TAG)
    assert cont(dist) >= 0.85, tr


def test_nut_flush_never_folds_to_a_min_bet():
    line = ["BTN raise 2.5", "BB call", "flop"] + CHECKS_TO_RIVER[:-1] + ["river", "BB check", "BTN bet 0.5"]
    s, priv = setup("Ah2c", "Kh9h6h3hJs", hero_pos="BB", line=line)
    s = with_faced_size(s, 0.02)
    assert priv.nuts
    dist, tr = decide_postflop(s, priv, NIT)
    assert tr["margin"] > 0 and fold(dist) < 0.01


def _top_pair():
    line = SRP + CHECKS_TO_RIVER + ["BB bet 0.5"]
    return setup("KsJd", "Kh7c2d9s4h", hero_pos="BTN", line=line)


def test_top_pair_tiny_bet_vs_shove():
    s, priv = _top_pair()
    tiny = with_faced_size(s, 0.01)
    assert tiny.to_call == 1
    dist, _ = decide_postflop(tiny, priv, TAG)
    assert cont(dist) >= 0.95
    big = with_faced_size(s, 3.0)
    dist, tr = decide_postflop(big, priv, TAG)
    assert fold(dist) >= 0.5, tr
    jam_line = SRP + CHECKS_TO_RIVER + ["BB jam"]
    js, jp = setup("KsJd", "Kh7c2d9s4h", hero_pos="BTN", line=jam_line, stacks_bb={"BB": 19})
    assert js.facing_frac == pytest.approx(3.0, abs=0.1)
    dist, tr = decide_postflop(js, jp, TAG)
    assert fold(dist) >= 0.5, tr


def test_fold_monotone_in_size():
    s, priv = _top_pair()
    grid = [0.01, 0.1, 0.25, 0.33, 0.4, 0.5, 0.66, 0.75, 0.8, 1.0, 1.05, 1.2, 1.3, 1.5, 1.65, 2.0, 2.5, 3.0]
    for dials in (TAG, NIT, STATION, LAG, MANIAC):
        folds = [fold(decide_postflop(with_faced_size(s, f), priv, dials)[0]) for f in grid]
        assert all(b >= a - 1e-12 for a, b in zip(folds, folds[1:])), folds


def _fold_by_chip(s, priv, dials):
    """(to_call, frac, P(fold)) for every chip size of the faced bet up to 3x pot."""
    before, _ = faced_chips(s)
    out = []
    for chips in range(1, 3 * before + 1):
        sp = with_faced_size(s, chips / before)
        out.append((sp.to_call, round(sp.facing_frac, 4), fold(decide_postflop(sp, priv, dials)[0])))
    return out


@pytest.mark.parametrize("case", ["river_bucket_edge", "flop_all_in"])
def test_fold_monotone_at_every_chip_size(case):
    """D32's grid alone misses two up-steps of the raw margin: a size bucket
    whose bluff share rises (river L→O, D34) when the grid point rounds past the
    edge, and the call that puts the hero all-in (R jumps to 1). The envelope
    probes each bucket edge from below and the size just short of all-in."""
    if case == "river_bucket_edge":
        s, priv = setup("7c7s", "As9d4d2d2h", hero_pos="BB", line=SRP + CHECKS_TO_RIVER + ["BB check", "BTN bet 0.5"])
    else:
        s, priv = setup("6h4h", "9d6s3s", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"],
                        stacks_bb={"BB": 14})
    for dials in (TAG, NIT, STATION, LAG, MANIAC):
        folds = _fold_by_chip(s, priv, dials)
        bad = [(a, b) for a, b in zip(folds, folds[1:]) if b[2] < a[2] - 1e-12]
        assert not bad, bad[:3]


def test_priced_flush_draw_never_folds_for_a_nit():
    """§5 L2: a draw whose equity covers the price continues. A nit's negative
    suspicion (it disbelieves bluffs) discounts bluff-catchers, not the outs of a
    flush draw or open-ender, so it no longer folds this K-high flush draw."""
    line = ["BTN call", "SB fold", "BB check", "flop", "BB check", "BTN check", "turn", "BB check", "BTN bet 0.88"]
    s, priv = setup("4sKc", "JsAh7s8s", hero_pos="BB", line=line)
    assert priv.draws.flush
    for dials in (NIT, TAG, LAG, STATION, MANIAC):
        dist, tr = decide_postflop(s, priv, dials)
        assert tr["eq"] * tr["features"]["R"] >= tr["price"] + 0.05
        assert fold(dist) < 0.5, (dials, fold(dist))


def test_committed_one_pair_calls_a_check_raise():
    """§5 L2: no raise at level 2 with one pair or less, even when the call
    commits the stack (the call stays a call; a set may still jam)."""
    line = SRP + ["BB check", "BTN bet 0.5", "BB raise 3x"]
    for hero in ("QsQd", "AhKh"):
        s, priv = setup(hero, "2cTs8d", hero_pos="BTN", line=line, stacks_bb=20)
        assert s.raise_level == 2
        for dials in (NIT, TAG, LAG, STATION, MANIAC):
            dist, tr = decide_postflop(s, priv, dials)
            assert tr["features"]["committed"] is False
            assert p(dist, Kind.RAISE, Kind.JAM) == 0, (hero, dials)
    s, priv = setup("8h8c", "2cTs8d", hero_pos="BTN", line=line, stacks_bb=20)
    dist, tr = decide_postflop(s, priv, TAG)
    assert tr["features"]["committed"] and p(dist, Kind.JAM) > 0.9


def test_fold_never_increases_with_strength_across_the_suspicion_band():
    """The suspicion term must not switch off as the hand gets stronger: a
    station with h = 0.62 folded 0.27 where h = 0.60 folded 0.07 (sb49), and a
    nit's disbelief switched on at h = 0.30. More bluffs help every hand that
    beats a bluff (h >= 0.3); disbelief hurts every hand short of value (h <= 0.6)."""
    import dataclasses

    s, priv = setup("3s2s", "Kh3d8c", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    for dials in (STATION, NIT, LAG, MANIAC, TAG):
        folds = []
        for i in range(51):
            x = i / 50
            pv = dataclasses.replace(priv, h={j: x for j in priv.h}, s_all=x)
            folds.append(fold(decide_postflop(s, pv, dials)[0]))
        assert all(b <= a + 1e-12 for a, b in zip(folds, folds[1:])), (dials.suspicion, folds)


def test_draw_hits_are_not_discounted_by_realization():
    """R_bot discounts showdown equity (being bluffed off or out-played later);
    the share that comes from hitting a clean draw is realised in full, so a
    LAG no longer folds a flush draw to a half-pot c-bet 20% of the time (sb04)."""
    s, priv = setup("Jh4h", "9h7h2c", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    for dials in (TAG, LAG, NIT):
        _, tr = decide_postflop(s, priv, dials)
        f = tr["features"]
        dt = f["draw_term"]
        eq_sd = (tr["eq"] - dt) / (1 - dt)
        assert f["m_raw"] == pytest.approx(eq_sd * f["R"] + (1 - eq_sd) * dt - tr["price"])


def test_station_calls_top_pair_vs_pot():
    s, priv = setup("Kc8d", "Ks7c2d", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.0"])
    dist, tr = decide_postflop(s, priv, STATION)
    assert cont(dist) >= 0.90, tr


@pytest.mark.xfail(strict=True, reason=(
    "Plan target P(fold) >= .95 is not met by the plan's formulas: 7c6d has h = 0.12 "
    "against the BB defence range (not ~0), so eq = 0.10 against price_used 0.295 and, "
    "at the station's tau 0.08, P(fold) = 0.92. Reported, constants unchanged (D34 note)."
))
def test_station_folds_seven_high_to_a_jam():
    line = SRP + CHECKS_TO_RIVER + ["BB jam"]
    s, priv = setup("7c6d", "AsKdQh9c2s", hero_pos="BTN", line=line, stacks_bb={"BB": 13.5})
    assert s.facing_frac == pytest.approx(2.0)
    dist, tr = decide_postflop(s, priv, STATION)
    assert fold(dist) >= 0.95, tr


def test_no_one_pair_raise_at_level_two():
    line = SRP + ["BB check", "BTN bet 0.33", "BB raise 3x"]
    s, priv = setup("AsAh", "Kd7c2h", hero_pos="BTN", line=line)
    assert s.raise_level == 2 and s.node == Node.VS_CHECK_RAISE
    for dials in TYPE_DIALS.values():
        dist, _ = decide_postflop(s, priv, dials)
        assert p(dist, Kind.RAISE, Kind.JAM) == 0
    s, priv = setup("7s7h", "Kd7c2h", hero_pos="BTN", line=line)
    assert p(decide_postflop(s, priv, MANIAC)[0], Kind.RAISE, Kind.JAM) > 0


def test_one_pair_may_raise_a_single_bet():
    s, priv = setup("AsAh", "Kd7c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.33"])
    assert s.raise_level == 1
    assert p(decide_postflop(s, priv, LAG)[0], Kind.RAISE) > 0


def test_commitment_jams():
    s, priv = setup("7s7h", "Kd7c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.8"],
                    stacks_bb=20)
    dist, tr = decide_postflop(s, priv, TAG)
    assert p(dist, Kind.CALL) == 0 and p(dist, Kind.JAM) > 0.9, (dist, tr)


def test_semi_bluff_raise_with_a_nut_flush_draw():
    s, priv = setup("Ah4h", "9h7h2c", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    assert priv.draws.nut_flush
    dist, _ = decide_postflop(s, priv, TAG)
    assert p(dist, Kind.RAISE) == pytest.approx(cont(dist) * min(K.SEMI_RAISE_CAP, K.SEMI_RAISE * TAG.bluff), abs=0.02)


def test_sticky_floor():
    s, priv = setup("Kc8d", "Ks7c2d", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.0"])
    import dataclasses
    sticky = dataclasses.replace(STATION, sticky=0.0)
    assert fold(decide_postflop(with_faced_size(s, 3.0), priv, sticky)[0]) == 0


# --- no bet faced ----------------------------------------------------------------


def test_lead_into_aggressor_with_middle_pair_is_rare():
    s, priv = setup("9s8s", "Kd9c4h", hero_pos="BB", line=SRP)
    assert s.node == Node.FIRST_IN and s.leading_into_aggressor
    dist, tr = decide_postflop(s, priv, TAG)
    assert p(dist, Kind.BET) <= 0.10, tr


def test_multiway_air_cbet_decay():
    hu, phu = setup("6c5d", "Ks9d2h", hero_pos="BTN", line=SRP + ["BB check"])
    mw, pmw = setup("6c5d", "Ks9d2h", hero_pos="BTN",
                    line=["BTN raise 2.5", "SB call", "BB call", "flop", "SB check", "BB check"])
    assert hu.is_aggressor and mw.is_aggressor and len(mw.opponents) == 2
    f_hu = decide_postflop(hu, phu, TAG)[1]["features"]["f_air"]
    f_mw = decide_postflop(mw, pmw, TAG)[1]["features"]["f_air"]
    assert f_hu == pytest.approx(K.AIR_CBET["dry"] * TAG.bluff)
    assert f_mw <= 0.4 * f_hu + 1e-9


def test_value_bets_and_traps():
    s, priv = setup("KcKh", "Kd7c2h", hero_pos="BTN", line=SRP + ["BB check"])
    assert priv.s >= K.TRAP_S
    dist, tr = decide_postflop(s, priv, TAG)
    assert tr["features"]["w_v"] == pytest.approx(1 - TAG.trap, abs=1e-4)
    assert p(dist, Kind.BET) == pytest.approx(1 - TAG.trap, abs=1e-4)
    river = SRP + ["BB check", "BTN check", "turn", "BB check", "BTN check", "river", "BB check"]
    s, priv = setup("KcKh", "Kd7c2h3s4d", hero_pos="BTN", line=river)
    f = decide_postflop(s, priv, TAG)[1]["features"]
    from poker.strategy.postflop import sigmoid

    assert f["V"] == pytest.approx(K.V["river"] + K.DEEP_SPR_ADD)  # SPR > 10: pot control
    assert f["w_v"] == pytest.approx(sigmoid((priv.s - f["V"]) / TAG.tau))  # never traps the river
    assert f["w_v"] > 0.95


def test_showdown_band_checks():
    s, priv = setup("8c8d", "Kd7c2h", hero_pos="BTN", line=SRP + ["BB check"])
    dist, tr = decide_postflop(s, priv, TAG)
    assert priv.hand.hole_tier >= 2 and tr["features"]["f_b"] == 0
    assert p(dist, Kind.BET) == pytest.approx(tr["features"]["w_v"])


def test_semi_bluffs_and_oop_non_aggressor():
    s, priv = setup("Jh4h", "9h7h2c", hero_pos="BB", line=SRP)
    f = decide_postflop(s, priv, TAG)[1]["features"]
    assert f["f_b"] == pytest.approx(K.SEMI["fd_oesd"] * TAG.bluff * K.OOP_NONAGG)
    s, priv = setup("Jh8h", "9h7h2c", hero_pos="BTN", line=SRP + ["BB check"])
    f = decide_postflop(s, priv, TAG)[1]["features"]
    assert f["f_b"] == pytest.approx(K.SEMI["combo"] * TAG.bluff)


def test_bet_sizes_come_from_sizing():
    s, priv = setup("6c5d", "Ks9d2h", hero_pos="BTN", line=SRP + ["BB check"])
    dist, _ = decide_postflop(s, priv, TAG)
    fracs = [c.frac for c in dist if c.kind == Kind.BET]
    assert fracs == [pytest.approx(0.33)]


@pytest.mark.parametrize("dials", list(TYPE_DIALS.values()), ids=list(TYPE_DIALS))
def test_distributions_sum_to_one_and_are_legal(dials):
    spots = [
        ("Jh4h", "9h7h2c", "BB", SRP + ["BB check", "BTN bet 0.5"]),
        ("6c5d", "Ks9d2h", "BTN", SRP + ["BB check"]),
        ("AsAh", "Kd7c2h", "BTN", SRP + ["BB check", "BTN bet 0.33", "BB raise 3x"]),
        ("4s4h", "KsKh9d2c7s", "BTN", SRP + CHECKS_TO_RIVER + ["BB bet 1.0"]),
        ("9s8s", "Kd9c4h", "BB", SRP),
        ("KsJd", "Kh7c2d9s4h", "BTN", SRP + CHECKS_TO_RIVER + ["BB jam"]),
    ]
    for hero, board, pos, line in spots:
        s, priv = setup(hero, board, hero_pos=pos, line=line)
        dist, tr = decide_postflop(s, priv, dials)
        assert sum(dist.values()) == pytest.approx(1.0)
        for c, v in dist.items():
            assert v > 0
            if c.kind == Kind.CHECK:
                assert s.legal.can_check
            elif c.kind == Kind.FOLD:
                assert not s.legal.can_check
            elif c.kind == Kind.CALL:
                assert s.legal.can_call
            elif c.kind == Kind.BET:
                assert s.legal.can_bet and c.frac > 0
            else:
                assert s.legal.can_raise
        assert {"features", "prior", "eq", "price", "margin"} <= set(tr)
