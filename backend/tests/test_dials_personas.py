"""P3.2: the dials, the five type means (§4.5) and jittered personas with leaks (D31)."""

from __future__ import annotations

import dataclasses
import math
import random
import re
from collections import Counter

import pytest

from poker.bots.personas import LEAK_NAMES, LEAK_POOLS, LeakSpec, Persona, jitter, make_persona
from poker.strategy.dials import DIAL_META, RECS, REGS, TYPE_DIALS, TYPE_DISPLAY, Dials, type_mean

FIELDS = [f.name for f in dataclasses.fields(Dials)]
MULTIPLIERS = ("open", "threebet", "call", "size_pre", "bluff", "raise_", "size", "tau")
ADDITIVE = ("value", "suspicion", "sticky")
RATES = ("limp", "trap", "price", "tell")

# §4.5, column by column: Nit, TAG, LAG, Station, Maniac.
SPEC = {
    "open": (0.75, 1.15, 1.5, 2.4, 3.2),
    "limp": (0, 0, 0, 0.8, 0.1),
    "threebet": (0.5, 1.8, 2.6, 0.3, 3.5),
    "call": (0.6, 1.0, 1.15, 2.6, 1.6),
    "size_pre": (1, 1, 1, 0.9, 1.5),
    "value": (0.03, 0, -0.03, 0.03, -0.08),
    "bluff": (0.35, 1, 1.6, 0.12, 3.0),
    "raise_": (0.8, 1, 1.4, 0.35, 2.5),
    "suspicion": (-0.10, 0, 0.05, 0.25, 0.15),
    "price": (1, 1, 0.9, 0.3, 0.5),
    "sticky": (None, None, None, 0.86, 0.90),
    "trap": (0.25, 0.15, 0.10, 0.40, 0),
    "size": (1, 1, 1.05, 0.8, 1.4),
    "tell": (0.2, 0, 0, 1.0, 0.3),
    "adapt": (0.2, 0.6, 0.7, 0, 0),
    "tilt": (0.1, 0.1, 0.2, 0.3, 0.6),
    "tau": (0.03, 0.03, 0.04, 0.08, 0.08),
}
TYPES = ("nit", "tag", "lag", "station", "maniac")


def test_type_table_matches_spec():
    assert set(TYPE_DIALS) == set(TYPES)
    assert len(FIELDS) == 17 and set(FIELDS) == set(SPEC)
    for dial, column in SPEC.items():
        for type_key, want in zip(TYPES, column):
            got = getattr(TYPE_DIALS[type_key], dial)
            if want is None:
                assert got is None, (type_key, dial)
            else:
                assert got == pytest.approx(want), (type_key, dial)
    assert TYPE_DIALS["tag"].open == 1.15
    assert TYPE_DIALS["station"].sticky == 0.86
    assert TYPE_DIALS["maniac"].tau == 0.08
    assert TYPE_DIALS["nit"].sticky is None


def test_type_names_and_groups():
    assert TYPE_DISPLAY == {
        "nit": "Nit", "tag": "TAG", "lag": "LAG", "station": "Calling Station", "maniac": "Maniac",
    }
    assert REGS == {"nit", "tag", "lag"} and RECS == {"station", "maniac"}
    assert type_mean("lag") == TYPE_DIALS["lag"]
    with pytest.raises(KeyError):
        type_mean("whale")


def test_jitter_is_seeded_and_bounded():
    for type_key in TYPES:
        mean = TYPE_DIALS[type_key]
        assert jitter(mean, random.Random(7)) == jitter(mean, random.Random(7))
        for i in range(2000):
            d = jitter(mean, random.Random(i))
            for name in MULTIPLIERS:
                m = getattr(mean, name)
                assert m * math.exp(-0.5) <= getattr(d, name) <= m * math.exp(0.5), (type_key, name)
            for name in ADDITIVE:
                m = getattr(mean, name)
                if m is None:
                    assert getattr(d, name) is None
                else:
                    assert abs(getattr(d, name) - m) <= 0.075, (type_key, name)
            for name in RATES:
                assert 0.0 <= getattr(d, name) <= 1.0
                if getattr(mean, name) == 0:
                    assert getattr(d, name) == 0
            assert (d.adapt, d.tilt) == (mean.adapt, mean.tilt)


def test_jitter_spread_matches_sigma():
    mean = TYPE_DIALS["tag"]
    logs = [math.log(jitter(mean, random.Random(i)).open / mean.open) for i in range(2000)]
    sd = (sum(x * x for x in logs) / len(logs)) ** 0.5
    assert 0.085 <= sd <= 0.115


def test_leak_counts_by_type():
    assert LEAK_NAMES == (
        "cant_fold_pair", "fit_or_fold", "auto_cbet", "scared_money", "spewy_river", "passive_monster",
    )
    for type_key in TYPES:
        pool = LEAK_POOLS[type_key]
        assert sum(pool.values()) == pytest.approx(1.0)
        counts: Counter[int] = Counter()
        for i in range(2000):
            p = make_persona(type_key, random.Random(i), f"p{i}")
            assert isinstance(p, Persona) and p.type_key == type_key
            names = [leak.name for leak in p.leaks]
            assert len(set(names)) == len(names)
            for leak in p.leaks:
                assert isinstance(leak, LeakSpec)
                assert leak.name in pool
                assert 0.4 <= leak.intensity <= 1.0
            counts[len(p.leaks)] += 1
        if type_key in REGS:
            assert set(counts) <= {0, 1}
            assert 0.45 <= counts[1] / 2000 <= 0.55
        else:
            assert set(counts) <= {1, 2}
            assert 0.35 <= counts[2] / 2000 <= 0.45


def test_leak_pool_weights_drive_the_draw():
    first = Counter(
        make_persona("maniac", random.Random(i), "m").leaks[0].name for i in range(3000)
    )
    assert 0.55 <= first["spewy_river"] / 3000 <= 0.65


def test_two_personas_of_a_type_differ():
    rng = random.Random(3)
    a, b = make_persona("tag", rng, "a"), make_persona("tag", rng, "b")
    assert a.dials != b.dials
    assert make_persona("tag", random.Random(3), "a") == a


def test_handles_are_word_handles_and_seeded():
    handles = {make_persona("tag", random.Random(i), "x").handle for i in range(300)}
    assert len(handles) > 200
    for h in handles:
        assert re.fullmatch(r"[A-Z][a-z]+[A-Z][a-z]+[0-9]", h), h


def test_dial_meta_shape():
    assert [m["key"] for m in DIAL_META] == FIELDS
    for meta in DIAL_META:
        assert set(meta) == {"key", "label", "min", "max", "step"}
        assert isinstance(meta["label"], str) and meta["label"]
        assert meta["min"] < meta["max"] and meta["step"] > 0
        for type_key in TYPES:
            v = getattr(TYPE_DIALS[type_key], meta["key"])
            if v is not None:
                assert meta["min"] <= v <= meta["max"], (type_key, meta["key"])
