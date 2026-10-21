"""Six named, bounded leaks (§4.5, D31): a persona's human mistakes.

Each leak is pure: it takes a distribution and returns a new one that sums to 1,
moving mass only between legal choices already present or to a legal check, call
or fold (``auto_cbet`` adds a third-pot bet, ``spewy_river`` resizes its bets to
at least the pot). A leak fires only after the flop, at intensity ``i`` in [0, 1].
"""

from __future__ import annotations

from collections.abc import Sequence

from ..math.classify import MadeTier
from ..math.draws import hole_draws
from . import constants as K
from .postflop import draw_class
from .spot import Spot
from .types import ActionDist, Choice, Kind, Private

LEAK_TEXT: dict[str, str] = {
    "cant_fold_pair": "Can't fold a pair: calls bets with any pair it holds.",
    "fit_or_fold": "Fit or fold: gives up without a pair or a draw and rarely c-bets a miss.",
    "auto_cbet": "Auto c-bets every flop as the raiser, then gives up the turn with nothing.",
    "scared_money": "Scared money: folds too often to big bets and only raises them with two pair or better.",
    "spewy_river": "Spews on the river: bets big as a bluff when its draw misses.",
    "passive_monster": "Plays monsters passively: slowplays big hands and never raises them.",
}

_FOLD, _CHECK, _CALL = Choice(Kind.FOLD), Choice(Kind.CHECK), Choice(Kind.CALL)
_AUTO_CBET_FRAC = 0.33
_MONSTER_S = 0.9
_SCARED_FRAC = 1.0
_AGGRESSIVE = ("bet", "raise")


def _mass(d: dict, *kinds: Kind) -> float:
    return sum(v for c, v in d.items() if c.kind in kinds)


def _move(d: dict, kinds: tuple[Kind, ...], share: float, target: Choice) -> bool:
    """Move ``share`` of the mass on ``kinds`` to ``target``."""
    moved = 0.0
    for c in [c for c in d if c.kind in kinds and c != target]:
        m = d[c] * share
        d[c] -= m
        moved += m
    if moved <= 0:
        return False
    d[target] = d.get(target, 0.0) + moved
    return True


def _raise_fold(d: dict, add: float) -> bool:
    """P(fold) += (1 − P(fold))·add, the rest scaled down proportionally."""
    fold = d.get(_FOLD, 0.0)
    if add <= 0 or fold >= 1.0:
        return False
    for c in d:
        if c != _FOLD:
            d[c] *= 1 - add
    d[_FOLD] = fold + (1 - fold) * add
    return True


def _own_pair(priv: Private) -> bool:
    return priv.hand.hole_tier >= MadeTier.PAIR


def _no_draw(spot: Spot, priv: Private) -> bool:
    return draw_class(priv.draws, spot.street, False) is None


def _bet_on(spot: Spot, street: str) -> bool:
    return any(e.street == street and e.seat == spot.seat and e.action in _AGGRESSIVE for e in spot.history)


def _cant_fold_pair(d: dict, spot: Spot, priv: Private, i: float) -> bool:
    if spot.to_call == 0 or not _own_pair(priv) or not spot.legal.can_call:
        return False
    return _move(d, (Kind.FOLD,), 0.8 * i, _CALL)


def _fit_or_fold(d: dict, spot: Spot, priv: Private, i: float) -> bool:
    if spot.street not in ("flop", "turn") or _own_pair(priv):
        return False
    if spot.to_call > 0:
        return _no_draw(spot, priv) and _raise_fold(d, i)
    if spot.street == "flop" and spot.is_aggressor and spot.legal.can_check:
        return _move(d, (Kind.BET,), i, _CHECK)
    return False


def _auto_cbet(d: dict, spot: Spot, priv: Private, i: float) -> bool:
    if spot.to_call > 0:
        return False
    if spot.street == "flop" and spot.is_aggressor and spot.legal.can_bet:
        add = (1 - _mass(d, Kind.BET)) * 0.9 * i
        check = d.get(_CHECK, 0.0)
        if add <= 0 or check <= 0:
            return False
        add = min(add, check)
        d[_CHECK] = check - add
        target = Choice(Kind.BET, _AUTO_CBET_FRAC)
        d[target] = d.get(target, 0.0) + add
        return True
    if (spot.street == "turn" and _bet_on(spot, "flop") and not _own_pair(priv)
            and _no_draw(spot, priv) and spot.legal.can_check):
        return _move(d, (Kind.BET,), i, _CHECK)
    return False


def _scared_money(d: dict, spot: Spot, priv: Private, i: float) -> bool:
    if spot.to_call == 0 or (spot.facing_frac or 0.0) < _SCARED_FRAC:
        return False
    fired = False
    if priv.hand.hole_tier < MadeTier.TWO_PAIR and spot.legal.can_call:
        fired = _move(d, (Kind.RAISE, Kind.JAM), 1.0, _CALL)
    return _raise_fold(d, 0.5 * i) or fired


def _spewy_river(d: dict, spot: Spot, priv: Private, i: float) -> bool:
    if spot.street != "river" or spot.to_call > 0 or not spot.legal.can_bet:
        return False
    if _own_pair(priv) or priv.s >= K.SHOWDOWN_LO:
        return False
    turn = hole_draws(priv.hole, spot.board[:4])
    if not (turn.flush or turn.oesd):
        return False
    bets = [c for c in d if c.kind == Kind.BET]
    p_bet = sum(d[c] for c in bets)
    if p_bet <= 0:
        return False
    frac = max([c.frac or 0.0 for c in bets] + [1.0])
    new = min(1.0, p_bet * (2 + i))
    for c in bets:
        del d[c]
    rest = 1.0 - p_bet
    scale = (1.0 - new) / rest if rest > 0 else 0.0
    for c in d:
        d[c] *= scale
    d[Choice(Kind.BET, frac)] = new
    return True


def _passive_monster(d: dict, spot: Spot, priv: Private, i: float) -> bool:
    if priv.s < _MONSTER_S:
        return False
    if spot.to_call > 0:
        return spot.legal.can_call and _move(d, (Kind.RAISE, Kind.JAM), 1.0, _CALL)
    if spot.street in ("flop", "turn") and spot.legal.can_check:
        return _move(d, (Kind.BET,), i, _CHECK)
    return False


_LEAKS = {
    "cant_fold_pair": _cant_fold_pair,
    "fit_or_fold": _fit_or_fold,
    "auto_cbet": _auto_cbet,
    "scared_money": _scared_money,
    "spewy_river": _spewy_river,
    "passive_monster": _passive_monster,
}


def apply_leaks(
    dist: ActionDist, spot: Spot, priv: Private, leaks: Sequence
) -> tuple[ActionDist, list[str]]:
    """``dist`` after each leak in order, and the names of the leaks that moved
    mass. ``leaks`` holds ``LeakSpec``s (name, intensity)."""
    if spot.street == "preflop" or not leaks:
        return dict(dist), []
    d = dict(dist)
    fired: list[str] = []
    for spec in leaks:
        i = min(1.0, max(0.0, spec.intensity))
        if _LEAKS[spec.name](d, spot, priv, i):
            fired.append(spec.name)
    d = {c: v for c, v in d.items() if v > 1e-12}
    total = sum(d.values())
    return {c: v / total for c, v in d.items()}, fired
