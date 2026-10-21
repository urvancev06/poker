"""The dials of a v2 player and the five type means (§4.5).

Every type plays the same logical policy; the dials only scale and shift it.
These are initial values: phase 4 calibrates them against the gate bands, and the
policy explorer (phase 6) shows the effect of each.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Dials:
    open: float        # width multiplier on the open and iso range
    limp: float        # share of first-in non-premium hands limped
    threebet: float    # width multiplier on 3-bet and 4-bet bluffs
    call: float        # width multiplier on flats, BB defence and calls vs 3-bets
    size_pre: float    # preflop size multiplier
    value: float       # shift in the value-bet threshold
    bluff: float       # air and semi-bluff frequency multiplier
    raise_: float      # raise frequency multiplier
    suspicion: float   # how much more the player believes the opponent bluffs
    price: float       # sensitivity λ to price and bet size (0 ignores size)
    sticky: float | None  # strength above which the player never folds
    trap: float        # probability of slowplaying monsters
    size: float        # bet size multiplier
    tell: float        # how much size tracks strength (regs 0)
    adapt: float       # weight on reads of opponents (phase 7)
    tilt: float        # tilt susceptibility (phase 7)
    tau: float         # decision temperature near a threshold


TYPE_DIALS: dict[str, Dials] = {
    "nit": Dials(
        open=0.75, limp=0.0, threebet=0.5, call=0.6, size_pre=1.0, value=0.03, bluff=0.35,
        raise_=0.8, suspicion=-0.10, price=1.0, sticky=None, trap=0.25, size=1.0, tell=0.2,
        adapt=0.2, tilt=0.1, tau=0.03,
    ),
    "tag": Dials(
        open=1.15, limp=0.0, threebet=1.8, call=1.0, size_pre=1.0, value=0.0, bluff=1.0,
        raise_=1.0, suspicion=0.0, price=1.0, sticky=None, trap=0.15, size=1.0, tell=0.0,
        adapt=0.6, tilt=0.1, tau=0.03,
    ),
    "lag": Dials(
        open=1.5, limp=0.0, threebet=2.6, call=1.15, size_pre=1.0, value=-0.03, bluff=1.6,
        raise_=1.4, suspicion=0.05, price=0.9, sticky=None, trap=0.10, size=1.05, tell=0.0,
        adapt=0.7, tilt=0.2, tau=0.04,
    ),
    "station": Dials(
        open=2.4, limp=0.8, threebet=0.3, call=2.6, size_pre=0.9, value=0.03, bluff=0.12,
        raise_=0.35, suspicion=0.25, price=0.3, sticky=0.86, trap=0.40, size=0.8, tell=1.0,
        adapt=0.0, tilt=0.3, tau=0.08,
    ),
    "maniac": Dials(
        open=3.2, limp=0.1, threebet=3.5, call=1.6, size_pre=1.5, value=-0.08, bluff=3.0,
        raise_=2.5, suspicion=0.15, price=0.5, sticky=0.90, trap=0.0, size=1.4, tell=0.3,
        adapt=0.0, tilt=0.6, tau=0.08,
    ),
}

TYPE_DISPLAY: dict[str, str] = {
    "nit": "Nit", "tag": "TAG", "lag": "LAG", "station": "Calling Station", "maniac": "Maniac",
}
REGS: frozenset[str] = frozenset({"nit", "tag", "lag"})
RECS: frozenset[str] = frozenset({"station", "maniac"})


def type_mean(key: str) -> Dials:
    """The type's mean dials (KeyError for an unknown type)."""
    return TYPE_DIALS[key]


def _meta(key: str, label: str, lo: float, hi: float, step: float) -> dict:
    return {"key": key, "label": label, "min": lo, "max": hi, "step": step}


# The Lab's knob shape, one row per dial, in field order.
DIAL_META: list[dict] = [
    _meta("open", "Open width", 0.5, 3.5, 0.05),
    _meta("limp", "Limp share", 0.0, 1.0, 0.05),
    _meta("threebet", "3-bet bluffs", 0.0, 4.0, 0.1),
    _meta("call", "Call width", 0.3, 3.0, 0.05),
    _meta("size_pre", "Preflop size", 0.7, 1.8, 0.05),
    _meta("value", "Value threshold", -0.15, 0.15, 0.01),
    _meta("bluff", "Bluff frequency", 0.0, 3.5, 0.05),
    _meta("raise_", "Raise frequency", 0.0, 3.0, 0.05),
    _meta("suspicion", "Suspicion", -0.2, 0.4, 0.01),
    _meta("price", "Price sensitivity", 0.0, 1.0, 0.05),
    _meta("sticky", "Never folds above", 0.8, 1.0, 0.01),
    _meta("trap", "Slowplay", 0.0, 0.6, 0.05),
    _meta("size", "Bet size", 0.6, 1.6, 0.05),
    _meta("tell", "Size tells", 0.0, 1.0, 0.05),
    _meta("adapt", "Adapts to reads", 0.0, 1.0, 0.05),
    _meta("tilt", "Tilt", 0.0, 1.0, 0.05),
    _meta("tau", "Mixing (τ)", 0.01, 0.15, 0.005),
]
