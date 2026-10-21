"""The v2 postflop policy (§4.6): no bet faced, and facing a bet.

``σ(x) = 1/(1 + e^−x)``, and every threshold is crossed smoothly with the
persona's τ. ``s`` is the strength against the opponents' preflop-line ranges plus
the clean-draw term; ``h_used`` is the strength against the bettor heads-up and
``s_all`` multiway.

No bet faced: ``P(bet) = w_v + (1 − w_v)·f_b`` with the value weight
``w_v = σ((s − V')/τ)`` (traps damp it), and ``f_b`` a semi-bluff frequency for a
draw or, for air, ``σ((f_air − bluff_quantile)/0.05)`` (D33). A hand with its own
pair below V' is in the showdown band and never bluffs.

Facing a bet: the bettor prior ``(v, β)`` (D34) gives the equity estimate, the
price includes the bot's own implied odds for draws, and the continue margin
``m`` goes through the D32 envelope so P(fold) never falls as the bet grows.
Raises need ``h_used`` above the level's threshold; facing a raise (level 2+) a
raise also needs two pair or better with both pairs in the hole, or a set.

The floors (the nuts never fold; never fold when checking is free) are applied
by the policy entry (P3.8).
"""

from __future__ import annotations

import math

from ..math.classify import MadeTier
from ..math.draws import DrawSet
from ..math.texture import scare_flags, texture
from . import constants as K
from .bettor import prior
from .dials import Dials
from .private import draw_term
from .sizing import bet_frac
from .spot import Spot, faced_chips, with_faced_size
from .types import ActionDist, Choice, Kind, Private

_FOLD, _CHECK, _CALL = Choice(Kind.FOLD), Choice(Kind.CHECK), Choice(Kind.CALL)
_RAISE, _JAM = Choice(Kind.RAISE), Choice(Kind.JAM)
_AGGRESSIVE = ("bet", "raise")


def sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    z = math.exp(x)
    return z / (1.0 + z)


def draw_class(draws: DrawSet, street: str, own_pair: bool) -> str | None:
    """The semi-bluff class of a draw (``SEMI`` key), or None. Overcards and
    backdoors count on the flop only; a hand with its own pair has none."""
    if own_pair or street == "river":
        return None
    straight = draws.oesd or draws.gutshot
    if draws.flush and straight:
        return "combo"
    if draws.flush or draws.oesd:
        return "fd_oesd"
    if draws.gutshot or (street == "flop" and draws.overcards):
        return "gut_over"
    if street == "flop" and (draws.backdoor_flush or draws.backdoor_straight):
        return "backdoor"
    return None


def _side(spot: Spot) -> str:
    return "ip" if spot.in_position else "oop"


def _decay(spot: Spot) -> float:
    return K.MW_DECAY ** max(0, len(spot.opponents) - 1)


def air_frequency(spot: Spot, priv: Private, dials: Dials) -> float:
    """f_air: the air bet frequency at this first-in spot, x bluff x the
    multiway decay (river x the blocker multiplier)."""
    street = spot.street
    if spot.is_aggressor:
        if street == "flop":
            base = K.AIR_CBET[texture(spot.board).wetness]
        elif street == "turn":
            base = K.BARREL + (K.SCARE_ADD if scare_flags(spot.board[:3], spot.board) else 0.0)
        else:
            base = K.RIVER_BLUFF
    else:
        base = K.STAB_IP if spot.in_position else K.STAB_OOP
    if street == "river":
        base *= K.BLOCKER_MULT[0] if priv.blockers else K.BLOCKER_MULT[1]
    return base * dials.bluff * _decay(spot)


def value_threshold(spot: Spot, dials: Dials) -> float:
    """V': the value threshold plus the lead, deep-SPR and value-dial shifts."""
    street = spot.street
    v = K.V["river"] if street == "river" else K.V[(street, _side(spot))]
    v += dials.value
    if spot.leading_into_aggressor:
        v += K.LEAD_ADD[street]
    if street in ("turn", "river") and spot.spr > K.DEEP_SPR:
        v += K.DEEP_SPR_ADD
    return v


def _add(dist: dict, choice: Choice, p: float) -> None:
    if p > 0:
        dist[choice] = dist.get(choice, 0.0) + p


def _first_in(spot: Spot, priv: Private, d: Dials) -> tuple[ActionDist, dict]:
    street, s = spot.street, priv.s
    vp = value_threshold(spot, d)
    w_v = sigmoid((s - vp) / d.tau)
    if s >= K.TRAP_S:
        w_v *= 1 - d.trap * K.TRAP_STREET[street]
    own_pair = priv.hand.hole_tier >= MadeTier.PAIR
    dc = draw_class(priv.draws, street, own_pair)
    f_air = air_frequency(spot, priv, d)
    air = not own_pair and dc is None and s < K.SHOWDOWN_LO
    if dc is not None:
        f_b = K.SEMI[dc] * d.bluff * _decay(spot)
        if not spot.in_position and not spot.is_aggressor:
            f_b *= K.OOP_NONAGG
        f_b = min(1.0, f_b)
    elif air:
        f_b = sigmoid((f_air - priv.bluff_q) / K.AIR_WIDTH)
    else:
        f_b = 0.0
    p_value, p_bluff = w_v, (1 - w_v) * f_b
    features = {"V": vp, "w_v": w_v, "f_b": f_b, "f_air": f_air, "air": air, "draw": dc, "s": s}
    info = {"features": features, "prior": None, "eq": None, "price": None, "margin": None}
    if not spot.legal.can_bet:
        return {_CHECK: 1.0}, info
    dist: dict = {}
    if p_value >= K.DUST:
        _add(dist, Choice(Kind.BET, bet_frac(spot, s, d, "value")), p_value)
    if p_bluff >= K.DUST:
        purpose = "semibluff" if dc is not None else "bluff"
        _add(dist, Choice(Kind.BET, bet_frac(spot, s, d, purpose)), p_bluff)
    _add(dist, _CHECK, 1.0 - sum(dist.values()))
    return dist, info


def _bettor(spot: Spot) -> int | None:
    for e in reversed(spot.history):
        if e.street == spot.street and e.action in _AGGRESSIVE:
            return e.seat
    return None


def _implied_kind(draws: DrawSet) -> str | None:
    if draws.nut_flush:
        return "nut"
    if draws.flush or draws.oesd:
        return "draw"
    if draws.gutshot:
        return "gutshot"
    return None


def _behind_after_call(sp: Spot) -> float:
    behind_now = sp.spr * sp.pot if math.isfinite(sp.spr) else float(sp.stack)
    return min(sp.stack - sp.to_call, behind_now)


def _margin(sp: Spot, h_used: float, dt: float, multiway: bool, d: Dials, imp: str | None) -> dict:
    street = sp.street
    frac = sp.facing_frac if sp.facing_frac is not None else 1.0
    v, beta = prior(street, sp.node, frac, multiway, d.price)
    eq = beta * min(1.0, h_used / K.BLUFF_H) + (1 - beta) * min(1.0, max(0.0, (h_used - v) / (1 - v)))
    eq += (1 - eq) * dt
    c = sp.to_call
    win = sp.facts.winnable_if_call if sp.facts is not None else sp.pot + c
    behind = _behind_after_call(sp)
    all_in = behind <= 0
    implied = 0.0
    if street != "river" and not all_in and imp is not None:
        implied = min(behind, sp.pot) * K.IMPLIED[imp]
    r = c / (win + implied) if win + implied > 0 else 0.0
    lam = d.price
    price_used = lam * r + (1 - lam) * K.PRICE_ANCHOR
    realize = 1.0 if street == "river" or all_in else K.R_BOT[(street, _side(sp))]
    lo, hi = K.SUSPICION_BAND
    band = 1.0 if lo <= h_used <= hi else 0.0
    # Disbelief discounts bluff-catchers, not a flush draw's or open-ender's outs
    # (§5 L2: a draw whose equity covers the price continues).
    suspicion = 0.0 if d.suspicion < 0 and imp in ("nut", "draw") else d.suspicion
    m = eq * realize - price_used + suspicion * (1 - eq) * band - K.TO_ACT_PENALTY * sp.players_to_act
    return {"m": m, "prior": (v, beta), "eq": eq, "price": price_used, "r": r, "behind": behind, "R": realize}


def _short_of_all_in(spot: Spot, before: int, added: int) -> int | None:
    """The largest faced-bet size in chips, below ``added``, whose call still
    leaves chips in play behind (``None`` if every size is all-in)."""
    lo, hi = 1, added - 1
    if hi < lo or _behind_after_call(with_faced_size(spot, lo / before)) <= 0:
        return None
    while lo < hi:  # behind shrinks as the bet grows
        mid = (lo + hi + 1) // 2
        if _behind_after_call(with_faced_size(spot, mid / before)) > 0:
            lo = mid
        else:
            hi = mid - 1
    return lo


def _envelope(spot: Spot, f: float, now: dict, margin) -> float:
    """D32: the least margin over the smaller sizes that can hold a lower one.

    The raw margin falls as the bet grows within a size bucket and while the
    call leaves chips behind; it can step up only where the bucket changes (the
    bettor priors' bluff share may rise, D34) or where the call puts the hero
    all-in (R jumps to 1). So the grid points are taken from below (a grid point
    on a bucket edge never rounds past it), plus the size just short of all-in:
    then P(fold) never decreases with size, at every chip size."""
    before, added = faced_chips(spot)
    m = math.inf
    for g in K.ENVELOPE_GRID:
        if g <= f:
            m = min(m, margin(with_faced_size(spot, math.floor(g * before + 1e-9) / before)))
    if now["behind"] <= 0 and spot.street != "river":
        short = _short_of_all_in(spot, before, added)
        if short is not None:
            m = min(m, margin(with_faced_size(spot, short / before)))
    return m


def _facing(spot: Spot, priv: Private, d: Dials) -> tuple[ActionDist, dict]:
    street = spot.street
    multiway = len(spot.opponents) > 1
    bettor = _bettor(spot)
    h_used = priv.s_all if multiway or bettor is None else priv.h.get(bettor, priv.s_all)
    dt = draw_term(priv.draws, street, spot.board)
    imp = _implied_kind(priv.draws)
    now = _margin(spot, h_used, dt, multiway, d, imp)
    m = now["m"]
    f = spot.facing_frac
    if f is not None:
        m = min(m, _envelope(spot, f, now, lambda sp: _margin(sp, h_used, dt, multiway, d, imp)["m"]))
    p_cont = sigmoid(m / d.tau)
    sticky = d.sticky is not None and priv.s >= d.sticky
    if sticky:
        p_cont = 1.0

    hand = priv.hand
    level = spot.raise_level
    thr = K.RAISE_THR[min(max(level, 1), 3) - 1]
    allowed = level < 2 or (hand.hole_tier >= MadeTier.TWO_PAIR and not hand.board_plays)
    heads_up = not multiway
    q = min(1.0, d.raise_ * sigmoid((h_used - thr) / d.tau)) if allowed else 0.0
    semi = (
        allowed and heads_up and street != "river"
        and (priv.draws.nut_flush or priv.draws.outs >= K.SEMI_RAISE_OUTS)
    )
    if semi:
        q = max(q, min(K.SEMI_RAISE_CAP, K.SEMI_RAISE * d.bluff))
    q_air = 0.0
    if (allowed and heads_up and street in ("flop", "turn") and d.bluff >= K.AIR_RAISE_MIN_BLUFF
            and priv.s < K.AIR_RAISE_S):
        q_air = K.AIR_RAISE_RATE * d.bluff
    can_raise = spot.legal.can_raise
    if not can_raise:
        q = q_air = 0.0
    p_raise = p_cont * q + (1 - p_cont) * q_air
    p_call = p_cont * (1 - q)
    p_fold = (1 - p_cont) * (1 - q_air)
    if p_raise < K.DUST:
        p_call, p_raise = p_call + p_raise, 0.0
    if p_fold < K.DUST:
        p_call, p_fold = p_call + p_fold, 0.0
    behind = now["behind"]
    pot_after = spot.pot + spot.to_call
    # Committed: the continue is a jam, but never a raise the hand may not make
    # (level 2+ with one pair or less calls, §5 L2).
    committed = allowed and can_raise and behind > 0 and behind / pot_after < K.COMMIT_SPR
    dist: dict = {}
    _add(dist, _FOLD, p_fold)
    if committed:
        _add(dist, _JAM, p_call + p_raise)
    else:
        _add(dist, _CALL, p_call)
        _add(dist, _RAISE, p_raise)
    features = {
        "h_used": h_used, "s": priv.s, "draw_term": dt, "r": now["r"], "R": now["R"],
        "m_raw": now["m"], "p_cont": p_cont, "q_raise": q, "q_air": q_air,
        "sticky": sticky, "committed": committed, "raise_allowed": allowed,
    }
    info = {"features": features, "prior": now["prior"], "eq": now["eq"], "price": now["price"], "margin": m}
    return dist, info


def decide_postflop(spot: Spot, priv: Private, dials: Dials) -> tuple[ActionDist, dict]:
    """The postflop distribution and its trace parts (features, prior, eq, price,
    margin)."""
    if spot.to_call == 0:
        return _first_in(spot, priv, dials)
    return _facing(spot, priv, dials)
