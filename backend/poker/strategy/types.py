"""The v2 policy's vocabulary: abstract actions, distributions, nodes, traces.

Every decision returns an ``ActionDist`` over abstract ``Choice``s; ``sizing``
(P3.6) turns each choice into a legal amount and the bot samples one with its
decision stream.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

from ..math.classify import HandClass
from ..math.draws import DrawSet


class Kind(str, Enum):
    FOLD = "fold"
    CHECK = "check"
    CALL = "call"
    BET = "bet"
    RAISE = "raise"
    JAM = "jam"


@dataclass(frozen=True)
class Choice:
    """An abstract action. ``frac`` is a pot fraction for a bet or raise, or
    ``None`` to let sizing choose."""

    kind: Kind
    frac: float | None = None


ActionDist = dict[Choice, float]


def normalise(dist: ActionDist) -> ActionDist:
    """Drop non-positive (and NaN) weights and scale the rest to sum to 1."""
    kept = {c: float(p) for c, p in dist.items() if p > 0 and not math.isnan(p)}
    total = sum(kept.values())
    if total <= 0 or math.isinf(total):
        raise ValueError(f"cannot normalise a distribution with total {total!r}")
    return {c: p / total for c, p in kept.items()}


class Node(str, Enum):
    # preflop
    UNOPENED = "unopened"
    VS_OPEN = "vs_open"
    VS_3BET = "vs_3bet"
    VS_4BET = "vs_4bet"
    VS_5BET = "vs_5bet"
    COLD_VS_3BET = "cold_vs_3bet"
    # postflop
    FIRST_IN = "first_in"
    VS_CBET = "vs_cbet"
    VS_BARREL = "vs_barrel"
    VS_DONK = "vs_donk"
    VS_BET = "vs_bet"
    VS_CHECK_RAISE = "vs_check_raise"
    VS_RAISE = "vs_raise"
    VS_RERAISE = "vs_reraise"


PREFLOP_NODES = frozenset({
    Node.UNOPENED, Node.VS_OPEN, Node.VS_3BET, Node.VS_4BET, Node.VS_5BET, Node.COLD_VS_3BET,
})


@dataclass(frozen=True)
class Trace:
    """What one decision saw and chose (stored server-side only, D26)."""

    node: str
    street: str
    features: dict
    strength: dict
    prior: tuple[float, float] | None
    eq: float | None
    price: float | None
    margin: float | None
    dist: dict[str, float]
    leaks: tuple[str, ...]


@dataclass(frozen=True)
class Private:
    """The deciding player's private view of its hand (P3.5 fills it)."""

    hole: tuple[str, str]
    cls: str
    hs: float
    h: dict[int, float]
    s_all: float
    s: float
    draws: DrawSet
    nuts: bool
    hand: HandClass
    bluff_q: float
    blockers: frozenset[str]


@dataclass(frozen=True)
class PreflopLine:
    """One seat's preflop decisions so far, as ``(node, kind, size_bb)``: the node
    it faced, what it did (``fold``/``check``/``call``/``raise``/``jam``) and the
    raise-to size in big blinds (``None`` unless it raised)."""

    seat: int
    actions: tuple[tuple[str, str, float | None], ...]
