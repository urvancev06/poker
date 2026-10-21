"""v2 sizing (§4.6): texture-based pot fractions, the size tell, preflop bb sizes,
and the conversion of an abstract ``Choice`` into a legal chip ``Action``.

Regs size by texture, never by strength, so their bluffs and value bets share a
size; ``tell`` couples size to strength for the fish. Every amount gets ±5%
jitter from the decision stream and is rounded to the chip. No crumbs: a bet that
would leave less than 30% of the resulting pot behind, or use 60% or more of the
effective stack (postflop), or a preflop raise committing more than 40% of it, is
a jam instead. Stacks here are effective: chips no opponent can match do not
count.
"""

from __future__ import annotations

import random
from typing import Literal

from ..engine.types import Action, ActionType
from ..math.texture import texture
from .charts.preflop import in_position
from .dials import Dials
from .spot import Spot
from .types import Choice, Kind, Node

Purpose = Literal["value", "bluff", "semibluff"]

FLOP_FRAC = {"dry": 0.33, "semi": 0.50, "wet": 0.66}
THREEBET_POT_FRAC = 0.33
TURN_FRAC = 0.66
RIVER_FRAC = 0.75
OVERBET_FRAC = 1.25
OVERBET_SIZE = 1.05   # dials.size at or above this ...
OVERBET_BLUFF = 1.5   # ... and dials.bluff at or above this overbet polar hands
NEAR_NUTS = 0.95
TELL_PIVOT = 0.85
TELL_CLAMP = (0.25, 1.5)
JITTER = (0.95, 1.05)

OPEN_BB = 2.5
SB_OPEN_BB = 3.0
BB_ISO_BB = 3.0
PER_LIMPER_BB = 1.0
THREEBET_X = {"ip": 3.0, "oop": 4.0}
FOURBET_X = 2.2
RAISE_X = 3.0
CHECK_RAISE_X = 3.25

CRUMB_POT = 0.30         # jam if less than this share of the resulting pot is left
POSTFLOP_COMMIT = 0.60   # jam if a bet uses at least this share of the stack
PREFLOP_COMMIT = 0.40    # jam if a preflop raise commits more than this share

_STREETS_LEFT = {"flop": 3, "turn": 2, "river": 1}


def geometric_frac(pot: int, stack: int, streets: int) -> float:
    """The pot fraction that, bet and called on each of ``streets`` streets, gets
    ``stack`` in: ``((1 + 2·stack/pot)^(1/streets) − 1)/2``."""
    if pot <= 0 or streets <= 0:
        return 0.0
    return ((1 + 2 * stack / pot) ** (1 / streets) - 1) / 2


def _behind(spot: Spot) -> float:
    return spot.spr * spot.pot if spot.pot else 0.0


def bet_frac(spot: Spot, s: float, dials: Dials, purpose: Purpose) -> float:
    """The pot fraction of a bet at ``spot`` for a hand of strength ``s``."""
    street = spot.street
    if street == "flop":
        if spot.pot_type in ("3bet", "4bet+"):
            base = THREEBET_POT_FRAC
        else:
            base = FLOP_FRAC[texture(spot.board).wetness]
    elif street == "turn":
        base = TURN_FRAC
    else:
        base = RIVER_FRAC
    polar = s >= NEAR_NUTS or purpose == "bluff"
    if street in ("turn", "river") and dials.size >= OVERBET_SIZE and dials.bluff >= OVERBET_BLUFF and polar:
        base = OVERBET_FRAC
    if s >= NEAR_NUTS and street in ("flop", "turn"):
        base = max(base, geometric_frac(spot.pot, _behind(spot), _STREETS_LEFT[street]))
    lo, hi = TELL_CLAMP
    coupling = min(hi, max(lo, 1 + 2 * dials.tell * (s - TELL_PIVOT)))
    return base * dials.size * coupling


def _level(spot: Spot) -> int:
    """The bet level the hero faces (its street bet plus the call)."""
    return spot.street_bet + spot.to_call


def preflop_to_bb(spot: Spot, dials: Dials) -> float:
    """The preflop raise-to size in big blinds: open 2.5 (SB 3.0) + 1 per limper,
    the BB's iso 3.0 + 1 per limper; a 3-bet 3x the open in position and 4x out of
    position, +1x per caller; a 4-bet or more 2.2x the raise faced; x size_pre."""
    bb = spot.big_blind
    if spot.node == Node.UNOPENED:
        if spot.position == "BB":
            base = BB_ISO_BB
        elif spot.position == "SB":
            base = SB_OPEN_BB
        else:
            base = OPEN_BB
        size = base + PER_LIMPER_BB * spot.limpers
    elif spot.node == Node.VS_OPEN:
        open_bb = spot.open_size_bb or _level(spot) / bb
        opener = spot.opener_pos or "BB"
        try:
            ip = in_position(spot.position, opener)
        except ValueError:
            ip = False
        size = open_bb * (THREEBET_X["ip" if ip else "oop"] + spot.callers)
    else:
        size = FOURBET_X * _level(spot) / bb
    return size * dials.size_pre


def _checked_this_street(spot: Spot) -> bool:
    return any(e.street == spot.street and e.seat == spot.seat and e.action == "check" for e in spot.history)


def _aggress(legal, to: int) -> Action:
    return Action(ActionType.BET if legal.can_bet else ActionType.RAISE, to)


def _passive(legal) -> Action:
    return Action(ActionType.CALL) if legal.can_call else Action(ActionType.CHECK)


def _crumb(spot: Spot, to: int) -> bool:
    """Should a bet or raise to ``to`` be a jam instead?"""
    usable = spot.eff_stack - spot.street_bet
    added = to - spot.street_bet
    behind = spot.eff_stack - to
    if behind <= 0 or usable <= 0:
        return True
    pot_after = spot.pot + added + (to - _level(spot))
    if behind < CRUMB_POT * pot_after:
        return True
    if spot.street == "preflop":
        return added > PREFLOP_COMMIT * usable
    return added >= POSTFLOP_COMMIT * usable


def to_action(choice: Choice, spot: Spot, dials: Dials, rng: random.Random) -> Action:
    """A legal chip ``Action`` for ``choice`` at ``spot``."""
    legal = spot.legal
    kind = choice.kind
    if kind == Kind.FOLD:
        return Action(ActionType.CHECK) if legal.can_check else Action(ActionType.FOLD)
    if kind == Kind.CHECK:
        return Action(ActionType.CHECK) if legal.can_check else Action(ActionType.FOLD)
    if kind == Kind.CALL or not legal.can_aggress:
        return _passive(legal)
    assert legal.min_raise_to is not None and legal.max_raise_to is not None
    if kind == Kind.JAM:
        return _aggress(legal, legal.max_raise_to)
    if spot.street == "preflop":
        target = preflop_to_bb(spot, dials) * spot.big_blind
    elif _level(spot) == 0:
        frac = choice.frac if choice.frac is not None else bet_frac(spot, 0.5, dials, "value")
        target = frac * spot.pot
    else:
        x = CHECK_RAISE_X if _checked_this_street(spot) else RAISE_X
        target = x * _level(spot)
    to = round(target * rng.uniform(*JITTER))
    to = min(max(to, legal.min_raise_to), legal.max_raise_to)
    if to < legal.max_raise_to and _crumb(spot, to):
        to = legal.max_raise_to
    return _aggress(legal, to)
