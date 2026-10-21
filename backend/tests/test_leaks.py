"""P3.7: six named, bounded leaks."""

from __future__ import annotations

import dataclasses
import random

import pytest

from poker.bots.personas import LEAK_NAMES, LeakSpec
from poker.strategy.leaks import LEAK_TEXT, apply_leaks
from poker.strategy.private import build_private
from poker.strategy.scenario import scenario
from poker.strategy.spot import build_spot
from poker.strategy.types import Choice, Kind

FOLD, CHECK, CALL, RAISE, JAM = (Choice(k) for k in (Kind.FOLD, Kind.CHECK, Kind.CALL, Kind.RAISE, Kind.JAM))
SRP = ["BTN raise 2.5", "BB call", "flop"]


def bet(frac):
    return Choice(Kind.BET, frac)


def setup(hero, board, *, hero_pos, line, **kw):
    s = build_spot(scenario(hero, board, hero_pos=hero_pos, line=line, **kw))
    return s, build_private(s, (hero[:2], hero[2:]))


def leak(name, i, dist, s, priv):
    out, fired = apply_leaks(dist, s, priv, (LeakSpec(name, i),))
    assert sum(out.values()) == pytest.approx(1.0)
    return out, fired


def approx(d):
    return {k: pytest.approx(v) for k, v in d.items() if v > 0}


def test_every_leak_has_text():
    assert set(LEAK_TEXT) == set(LEAK_NAMES)
    for text in LEAK_TEXT.values():
        assert text.endswith(".") and len(text.split()) >= 4


def test_cant_fold_pair():
    s, priv = setup("8c8d", "Kd7c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    d = {FOLD: 0.6, CALL: 0.3, RAISE: 0.1}
    out, fired = leak("cant_fold_pair", 1.0, d, s, priv)
    assert out == approx({FOLD: 0.12, CALL: 0.78, RAISE: 0.1}) and fired == ["cant_fold_pair"]
    out, _ = leak("cant_fold_pair", 0.5, d, s, priv)
    assert out == approx({FOLD: 0.36, CALL: 0.54, RAISE: 0.1})
    air, apriv = setup("Qc3d", "Kd8c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    assert leak("cant_fold_pair", 1.0, d, air, apriv) == (d, [])


def test_fit_or_fold_facing_and_as_aggressor():
    s, priv = setup("Qc3d", "Kd8c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    d = {FOLD: 0.5, CALL: 0.4, RAISE: 0.1}
    assert leak("fit_or_fold", 1.0, d, s, priv)[0] == approx({FOLD: 1.0})
    assert leak("fit_or_fold", 0.5, d, s, priv)[0] == approx({FOLD: 0.75, CALL: 0.2, RAISE: 0.05})
    agg, apriv = setup("Qc3d", "Kd8c2h", hero_pos="BTN", line=SRP + ["BB check"])
    d = {bet(0.33): 0.6, CHECK: 0.4}
    assert leak("fit_or_fold", 1.0, d, agg, apriv)[0] == approx({CHECK: 1.0})
    assert leak("fit_or_fold", 0.5, d, agg, apriv)[0] == approx({bet(0.33): 0.3, CHECK: 0.7})
    # A draw is a fit.
    fd, fpriv = setup("Jh4h", "9h7h2c", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    assert leak("fit_or_fold", 1.0, {FOLD: 0.5, CALL: 0.5}, fd, fpriv)[1] == []


def test_auto_cbet():
    s, priv = setup("Qc3d", "Kd8c2h", hero_pos="BTN", line=SRP + ["BB check"])
    d = {bet(0.5): 0.3, CHECK: 0.7}
    assert leak("auto_cbet", 1.0, d, s, priv)[0] == approx({bet(0.5): 0.3, bet(0.33): 0.63, CHECK: 0.07})
    assert leak("auto_cbet", 0.5, d, s, priv)[0] == approx({bet(0.5): 0.3, bet(0.33): 0.315, CHECK: 0.385})
    turn_line = SRP + ["BB check", "BTN bet 0.33", "BB call", "turn", "BB check"]
    t, tpriv = setup("Qc3d", "Kd8c2h4s", hero_pos="BTN", line=turn_line)
    d = {bet(0.66): 0.4, CHECK: 0.6}
    assert leak("auto_cbet", 1.0, d, t, tpriv)[0] == approx({CHECK: 1.0})
    assert leak("auto_cbet", 0.5, d, t, tpriv)[0] == approx({bet(0.66): 0.2, CHECK: 0.8})
    # Not the preflop raiser: nothing.
    bb, bpriv = setup("Qc3d", "Kd8c2h", hero_pos="BB", line=SRP)
    assert leak("auto_cbet", 1.0, {bet(0.5): 0.3, CHECK: 0.7}, bb, bpriv)[1] == []


def test_scared_money():
    s, priv = setup("Qc3d", "Kd8c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.0"])
    assert s.facing_frac >= 1.0
    d = {FOLD: 0.4, CALL: 0.4, RAISE: 0.2}
    assert leak("scared_money", 1.0, d, s, priv)[0] == approx({FOLD: 0.7, CALL: 0.3})
    assert leak("scared_money", 0.5, d, s, priv)[0] == approx({FOLD: 0.55, CALL: 0.45})
    two, tpriv = setup("Kc8d", "Kd8c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.0"])
    assert leak("scared_money", 1.0, d, two, tpriv)[0] == approx({FOLD: 0.7, CALL: 0.2, RAISE: 0.1})
    small, spriv = setup("Qc3d", "Kd8c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    assert leak("scared_money", 1.0, d, small, spriv)[1] == []


def test_spewy_river():
    line = SRP + ["BB check", "BTN check", "turn", "BB check", "BTN check", "river", "BB check"]
    s, priv = setup("Jh3h", "Kh8h2c4s9d", hero_pos="BTN", line=line)
    d = {bet(0.75): 0.2, CHECK: 0.8}
    assert leak("spewy_river", 1.0, d, s, priv)[0] == approx({bet(1.0): 0.6, CHECK: 0.4})
    assert leak("spewy_river", 0.5, d, s, priv)[0] == approx({bet(1.0): 0.5, CHECK: 0.5})
    big = {bet(1.25): 0.5, CHECK: 0.5}
    assert leak("spewy_river", 1.0, big, s, priv)[0] == approx({bet(1.25): 1.0})
    # No missed draw: nothing.
    dry, dpriv = setup("Jc3d", "Kh8h2c4s9d", hero_pos="BTN", line=line)
    assert leak("spewy_river", 1.0, d, dry, dpriv)[1] == []


def test_passive_monster():
    s, priv = setup("KcKh", "Kd7c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    assert priv.s >= 0.9
    d = {FOLD: 0.1, CALL: 0.5, RAISE: 0.4}
    assert leak("passive_monster", 1.0, d, s, priv)[0] == approx({FOLD: 0.1, CALL: 0.9})
    assert leak("passive_monster", 0.5, {CALL: 0.5, JAM: 0.5}, s, priv)[0] == approx({CALL: 1.0})
    first, fpriv = setup("KcKh", "Kd7c2h", hero_pos="BTN", line=SRP + ["BB check"])
    d = {bet(0.66): 0.9, CHECK: 0.1}
    assert leak("passive_monster", 1.0, d, first, fpriv)[0] == approx({CHECK: 1.0})
    assert leak("passive_monster", 0.5, d, first, fpriv)[0] == approx({bet(0.66): 0.45, CHECK: 0.55})
    weak = dataclasses.replace(fpriv, s=0.5)
    assert leak("passive_monster", 1.0, d, first, weak)[1] == []


def test_leaks_compose_in_order():
    s, priv = setup("8c8d", "Kd7c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.0"])
    d = {FOLD: 0.4, CALL: 0.4, RAISE: 0.2}
    out, fired = apply_leaks(d, s, priv, (LeakSpec("cant_fold_pair", 1.0), LeakSpec("scared_money", 1.0)))
    assert fired == ["cant_fold_pair", "scared_money"]
    # cant_fold_pair: fold .08, call .72, raise .2; scared_money: raise to call, fold += .92 x .5.
    assert out == approx({FOLD: 0.08 + 0.46, CALL: 0.46})


def _legal(c, legal):
    return {
        Kind.FOLD: legal.can_fold and not legal.can_check,
        Kind.CHECK: legal.can_check,
        Kind.CALL: legal.can_call,
        Kind.BET: legal.can_bet,
        Kind.RAISE: legal.can_raise,
        Kind.JAM: legal.can_raise,
    }[c.kind]


def test_leaks_preserve_sum_and_legality():
    spots = [
        setup("8c8d", "Kd7c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"]),
        setup("Qc3d", "Kd8c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.0"]),
        setup("Qc3d", "Kd8c2h", hero_pos="BTN", line=SRP + ["BB check"]),
        setup("KcKh", "Kd7c2h", hero_pos="BTN", line=SRP + ["BB check"]),
        setup("Qc3d", "Kd8c2h4s", hero_pos="BTN", line=SRP + ["BB check", "BTN bet 0.33", "BB call", "turn", "BB check"]),
        setup("Jh3h", "Kh8h2c4s9d", hero_pos="BTN",
              line=SRP + ["BB check", "BTN check", "turn", "BB check", "BTN check", "river", "BB check"]),
        setup("KcKh", "Kd7c2h", hero_pos="BB", line=SRP + ["BB check", "BTN bet 1.5"]),
    ]
    rng = random.Random(5)
    for _ in range(2000):
        s, priv = rng.choice(spots)
        choices = [c for c in (FOLD, CHECK, CALL, RAISE, JAM, bet(0.33), bet(0.75)) if _legal(c, s.legal)]
        picked = rng.sample(choices, rng.randint(1, len(choices)))
        weights = [rng.random() for _ in picked]
        dist = {c: w / sum(weights) for c, w in zip(picked, weights)}
        specs = tuple(LeakSpec(n, rng.uniform(0, 1)) for n in rng.sample(LEAK_NAMES, rng.randint(1, 3)))
        priv2 = dataclasses.replace(priv, s=rng.random())
        out, fired = apply_leaks(dist, s, priv2, specs)
        assert sum(out.values()) == pytest.approx(1.0)
        assert all(v >= 0 for v in out.values())
        assert all(_legal(c, s.legal) for c in out), (out, s.legal)
        assert set(fired) <= {sp.name for sp in specs}
        assert dist == {c: w / sum(weights) for c, w in zip(picked, weights)}  # pure


def test_no_leaks_preflop():
    s = build_spot(scenario("8c8d", hero_pos="BTN", line=["CO raise 2.5"]))
    priv = build_private(s, ("8c", "8d"))
    d = {FOLD: 0.5, CALL: 0.5}
    assert apply_leaks(d, s, priv, tuple(LeakSpec(n, 1.0) for n in LEAK_NAMES)) == (d, [])
