"""v2 personas: a type's mean dials, jittered per player, plus named leaks (D31).

Two TAGs come out at, say, 22/18 and 25/20, not as clones. Every draw comes from
the caller's ``random.Random`` (the session's ``"persona"`` stream, keyed by player),
so a seeded session seats the same personas every time.

Jitter (D31), each draw truncated at 3σ so no persona is an outlier:
  * multipliers × exp(N(0, 0.10)): open, threebet, call, size_pre, bluff, raise_,
    size, tau;
  * thresholds + N(0, 0.015): value, suspicion and sticky (when set);
  * rates × exp(N(0, 0.10)) clipped to [0, 1]: limp, trap, price, tell;
  * adapt and tilt are not jittered (phase 7).

Leaks: regs get one with probability 0.5; recs get one plus a second with
probability 0.4, never the same twice. Intensity is U(0.4, 1).
"""

from __future__ import annotations

import dataclasses
import math
import random
from dataclasses import dataclass

from ..strategy.dials import REGS, TYPE_DIALS, Dials

LEAK_NAMES: tuple[str, ...] = (
    "cant_fold_pair", "fit_or_fold", "auto_cbet", "scared_money", "spewy_river", "passive_monster",
)

LEAK_POOLS: dict[str, dict[str, float]] = {
    "tag": {"cant_fold_pair": 0.3, "auto_cbet": 0.3, "fit_or_fold": 0.2, "scared_money": 0.2},
    "lag": {"auto_cbet": 0.5, "spewy_river": 0.5},
    "nit": {"fit_or_fold": 0.5, "scared_money": 0.5},
    "station": {"cant_fold_pair": 0.45, "passive_monster": 0.45, "spewy_river": 0.10},
    "maniac": {"spewy_river": 0.6, "auto_cbet": 0.2, "cant_fold_pair": 0.2},
}

_SIGMA_MULT = 0.10
_SIGMA_ADD = 0.015
_TRUNC = 3.0
_MULTIPLIERS = ("open", "threebet", "call", "size_pre", "bluff", "raise_", "size", "tau")
_ADDITIVE = ("value", "suspicion", "sticky")
_RATES = ("limp", "trap", "price", "tell")

_REG_LEAK_P = 0.5
_REC_SECOND_LEAK_P = 0.4
_INTENSITY = (0.4, 1.0)

# Handle words: plain, neutral, never a real name.
_ADJECTIVES = (
    "Quiet", "Lucky", "Brisk", "Mellow", "Steady", "Sly", "Bold", "Calm", "Dusty", "Rapid",
    "Sunny", "Frosty", "Gentle", "Clever", "Rusty", "Silver", "Velvet", "Wild", "Patient",
    "Crimson", "Hollow", "Misty", "Nimble", "Stormy",
)
_NOUNS = (
    "Heron", "Otter", "Falcon", "Badger", "Comet", "Harbor", "Maple", "Cedar", "Pebble",
    "Lantern", "Raven", "Walrus", "Bison", "Marten", "Willow", "Quarry", "Ember", "Tundra",
    "Puffin", "Glacier", "Thistle", "Meadow", "Beacon", "Canyon",
)


@dataclass(frozen=True)
class LeakSpec:
    name: str
    intensity: float


@dataclass(frozen=True)
class Persona:
    persona_id: str
    type_key: str
    dials: Dials
    leaks: tuple[LeakSpec, ...]
    handle: str = ""


def _z(rng: random.Random) -> float:
    return max(-_TRUNC, min(_TRUNC, rng.gauss(0.0, 1.0)))


def jitter(d: Dials, rng: random.Random) -> Dials:
    """A persona's dials around the type mean ``d``. Draw order is fixed (field
    order), so a seeded stream gives the same dials every time."""
    changes: dict[str, float | None] = {}
    for f in dataclasses.fields(d):
        name, mean = f.name, getattr(d, f.name)
        if name in _MULTIPLIERS:
            changes[name] = mean * math.exp(_SIGMA_MULT * _z(rng))
        elif name in _ADDITIVE:
            changes[name] = None if mean is None else mean + _SIGMA_ADD * _z(rng)
        elif name in _RATES:
            changes[name] = min(1.0, max(0.0, mean * math.exp(_SIGMA_MULT * _z(rng))))
    return dataclasses.replace(d, **changes)


def _weighted(rng: random.Random, pool: dict[str, float]) -> str:
    names = sorted(pool)
    total = sum(pool[n] for n in names)
    x = rng.random() * total
    for n in names:
        x -= pool[n]
        if x < 0:
            return n
    return names[-1]


def _leaks(type_key: str, rng: random.Random) -> tuple[LeakSpec, ...]:
    if type_key in REGS:
        count = 1 if rng.random() < _REG_LEAK_P else 0
    else:
        count = 2 if rng.random() < _REC_SECOND_LEAK_P else 1
    pool = dict(LEAK_POOLS[type_key])
    out: list[LeakSpec] = []
    for _ in range(min(count, len(pool))):
        name = _weighted(rng, pool)
        del pool[name]
        out.append(LeakSpec(name, rng.uniform(*_INTENSITY)))
    return tuple(out)


def _handle(rng: random.Random) -> str:
    return f"{rng.choice(_ADJECTIVES)}{rng.choice(_NOUNS)}{rng.randrange(10)}"


def make_persona(type_key: str, rng: random.Random, persona_id: str) -> Persona:
    """A jittered persona of ``type_key`` with its leaks and a word handle."""
    dials = jitter(TYPE_DIALS[type_key], rng)
    leaks = _leaks(type_key, rng)
    return Persona(persona_id, type_key, dials, leaks, _handle(rng))
