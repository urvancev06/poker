"""The parameterized strategy: one decision function driven by a ``StrategyParams``
knob set. Archetypes (archetypes.py) are just different knob values.

Preflop is percentile-based off the computed hand ranking (preflop_strength.py):
open the top X% by position, 3-bet / call / 4-bet by strength thresholds, with a
bluff-3-bet frequency. Postflop follows STRATEGY.md §3 — value-bet strong made
hands, semi-bluff draws, c-bet/barrel as the aggressor, and call/fold by a
calldown tendency — with frequencies that tune AF, WTSD, and c-bet%.

Stats (VPIP/PFR/AF/...) are *outputs* of these knobs, never set directly.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from ..engine import Action, ActionType, LegalActions
from ..math import Draw, MadeTier, classify
from .context import DecisionContext
from .preflop_strength import hand_class, percentile

POSITIONS = ("SB", "BB", "UTG", "MP", "CO", "BTN")


@dataclass
class StrategyParams:
    name: str

    # --- preflop: percentile caps (smaller percentile = stronger hand) ---
    rfi_raise: dict[str, float]            # open-raise if percentile <= cap (by position)
    rfi_limp: dict[str, float] = field(default_factory=dict)  # else limp if <= cap (passive types)
    threebet_value: float = 0.04           # 3-bet for value if percentile <=
    threebet_bluff_freq: float = 0.10      # chance to 3-bet a flat-call hand as a bluff
    call_open: float = 0.10                # flat-call an open if percentile <=
    bb_defend_call: float = 0.45           # BB flats wider (price + closing action)
    fourbet_value: float = 0.012           # 4-bet for value if percentile <=
    call_3bet: float = 0.03                # call a 3-bet if percentile <=

    # --- preflop sizing (in big blinds / multiples) ---
    open_bb: float = 2.5
    sb_open_bb: float = 3.0
    threebet_mult: float = 3.0
    fourbet_mult: float = 2.2

    # --- postflop ---
    value_bet_min: MadeTier = MadeTier.PAIR
    value_bet_freq: float = 0.9
    semibluff_freq: float = 0.5
    cbet_freq: float = 0.6                 # c-bet flop with air as PFR
    barrel_freq: float = 0.5               # keep betting turn/river with air
    stab_freq: float = 0.1                 # bet when checked to and not the PFR (air)
    raise_value_min: MadeTier = MadeTier.TWO_PAIR
    raise_value_freq: float = 0.7
    calldown_freq: float = 0.5             # call a bet with a marginal made hand
    float_freq: float = 0.05               # call a bet with air (loose/sticky types)
    bet_frac: float = 0.6                  # bet/raise size as fraction of the pot


# convenience
_F, _X, _C = ActionType.FOLD, ActionType.CHECK, ActionType.CALL
_B, _R = ActionType.BET, ActionType.RAISE


def _raise_to(legal: LegalActions, target: float) -> int | None:
    if not legal.can_aggress or legal.min_raise_to is None:
        return None
    return max(legal.min_raise_to, min(int(round(target)), legal.max_raise_to))


def _aggress(legal: LegalActions, to: int) -> Action:
    return Action(_R if legal.can_raise else _B, to)


def heuristic_equity(hc, cards_to_come: int, all_in: bool) -> float:
    """Cheap equity estimate for the bots (the *coach* uses real Monte Carlo).
    Made hands map to rough win rates; draws use outs * rule-of-2/4."""
    tier = hc.made
    if tier >= MadeTier.STRAIGHT:
        base = 0.95
    elif tier == MadeTier.TRIPS:
        base = 0.85
    elif tier == MadeTier.TWO_PAIR:
        base = 0.75
    elif tier == MadeTier.PAIR:
        base = 0.50
    else:
        base = 0.15

    outs = 0
    if Draw.FLUSH_DRAW in hc.draws:
        outs += 9
    if Draw.OPEN_ENDED in hc.draws:
        outs += 6  # discount shared/overlapping outs
    elif Draw.GUTSHOT in hc.draws:
        outs += 4
    if Draw.OVERCARDS in hc.draws and tier == MadeTier.HIGH_CARD:
        outs += 3
    outs = min(outs, 15)
    per = 0.04 if (all_in and cards_to_come == 2) else 0.021
    draw_eq = min(0.92, outs * per * max(cards_to_come, 1))
    return max(base, draw_eq)


def _decide_preflop(p: StrategyParams, ctx: DecisionContext, rng: random.Random) -> Action:
    legal = ctx.legal
    pos = ctx.position
    pct = percentile(hand_class(ctx.hole))
    cur_level = ctx.to_call + ctx.my_bet  # bet level to match

    # Unopened (folded to us) or only limpers ahead.
    if ctx.folded_to_me or (ctx.preflop_raises == 0 and ctx.num_limpers > 0):
        raise_cap = p.rfi_raise.get(pos, 0.0)
        if pct <= raise_cap:
            size = (p.sb_open_bb if pos == "SB" else p.open_bb) + ctx.num_limpers
            to = _raise_to(legal, size * ctx.big_blind)
            if to is not None:
                return _aggress(legal, to)
        limp_cap = p.rfi_limp.get(pos, raise_cap)
        if pct <= limp_cap and legal.can_call:
            return Action(_C)  # limp
        return Action(_X) if legal.can_check else Action(_F)

    # Facing one raise (an open).
    if ctx.facing_level == 1:
        if pct <= p.threebet_value:
            to = _raise_to(legal, p.threebet_mult * cur_level)
            if to is not None:
                return _aggress(legal, to)
        call_cap = p.bb_defend_call if pos == "BB" else p.call_open
        if pct <= call_cap:
            if legal.can_raise and rng.random() < p.threebet_bluff_freq:
                to = _raise_to(legal, p.threebet_mult * cur_level)
                if to is not None:
                    return _aggress(legal, to)
            if legal.can_call:
                return Action(_C)
        return Action(_X) if legal.can_check else Action(_F)

    # Facing a 3-bet or 4-bet.
    if pct <= p.fourbet_value:
        to = _raise_to(legal, p.fourbet_mult * cur_level)
        if to is not None:
            return _aggress(legal, to)
    if pct <= p.call_3bet and legal.can_call:
        return Action(_C)
    return Action(_X) if legal.can_check else Action(_F)


def _decide_postflop(p: StrategyParams, ctx: DecisionContext, rng: random.Random) -> Action:
    legal = ctx.legal
    hc = classify(ctx.hole, ctx.board)
    tier = hc.made
    cards_to_come = {"flop": 2, "turn": 1, "river": 0}[ctx.street]
    strong_draw = Draw.FLUSH_DRAW in hc.draws or Draw.OPEN_ENDED in hc.draws

    # No bet to face: check or bet.
    if ctx.first_to_act:
        want_bet = False
        if tier >= p.value_bet_min:
            want_bet = rng.random() < p.value_bet_freq
        elif strong_draw:
            want_bet = rng.random() < p.semibluff_freq
        elif ctx.is_pfr and ctx.street == "flop":
            want_bet = rng.random() < p.cbet_freq
        elif ctx.is_pfr:
            want_bet = rng.random() < p.cbet_freq * p.barrel_freq
        else:
            want_bet = rng.random() < p.stab_freq
        if want_bet:
            to = _raise_to(legal, p.bet_frac * ctx.pot)
            if to is not None:
                return _aggress(legal, to)
        return Action(_X) if legal.can_check else Action(_F)

    # Facing a bet.
    cur_level = ctx.to_call + ctx.my_bet
    req = ctx.to_call / (ctx.pot + ctx.to_call) if ctx.to_call > 0 else 0.0
    all_in = ctx.to_call >= ctx.my_stack
    est = heuristic_equity(hc, cards_to_come, all_in)

    if tier >= p.raise_value_min and legal.can_raise and rng.random() < p.raise_value_freq:
        to = _raise_to(legal, cur_level + p.bet_frac * ctx.pot)
        if to is not None:
            return Action(_R, to)
    if strong_draw and legal.can_raise and rng.random() < p.semibluff_freq * 0.4:
        to = _raise_to(legal, cur_level + p.bet_frac * ctx.pot)
        if to is not None:
            return Action(_R, to)

    if tier >= MadeTier.TWO_PAIR and legal.can_call:
        return Action(_C)  # strong made hand always continues
    if strong_draw and est >= req and legal.can_call:
        return Action(_C)  # drawing with the right price
    if tier >= MadeTier.PAIR and rng.random() < p.calldown_freq and legal.can_call:
        return Action(_C)  # marginal made-hand calldown
    if rng.random() < p.float_freq and legal.can_call:
        return Action(_C)  # sticky float / bluff-catch (stations, maniacs)
    if legal.can_fold:
        return Action(_F)
    return Action(_X) if legal.can_check else Action(_C)


def decide(params: StrategyParams, ctx: DecisionContext, rng: random.Random) -> Action:
    if ctx.street == "preflop":
        return _decide_preflop(params, ctx, rng)
    return _decide_postflop(params, ctx, rng)
