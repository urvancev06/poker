"""The policy properties of design §5 L2, as checks over decision nodes (P3.9).

Every check takes the nodes from ``validation.nodes.sample_nodes`` and returns a
list of violations (one line each, empty when the property holds). They run on
the exact distributions; only ``no_crumb_bets`` samples actions. The tests in
``tests/test_policy_properties.py`` run them over 600 nodes, and
``scripts/policy_properties.py`` over as many as asked.
"""

from __future__ import annotations

import dataclasses
import random
from collections.abc import Callable, Sequence

from poker.bots.personas import Persona
from poker.engine import Action, ActionType, LegalActions
from poker.math.classify import MadeTier
from poker.strategy import constants as K
from poker.strategy.policy import policy, sample
from poker.strategy.sizing import to_action
from poker.strategy.spot import Spot, with_faced_size
from poker.strategy.types import Kind, Private

Node = tuple[Spot, Private, Persona]

SIZE_GRID = (0.01, 0.1, 0.25, 0.33, 0.5, 0.66, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0)
S_GRID = tuple(i / 50 for i in range(51))
CRUMB_POT = 0.30
EPS = 1e-9


def describe(spot: Spot, priv: Private, persona: Persona) -> str:
    board = "".join(spot.board) or "-"
    return (f"{persona.type_key} {spot.position} {''.join(priv.hole)} {board} {spot.street} "
            f"{spot.node.value} to_call={spot.to_call} pot={spot.pot} eff={spot.eff_stack}")


def _p(dist, *kinds: Kind) -> float:
    return sum(v for c, v in dist.items() if c.kind in kinds)


def _postflop_facing(nodes: Sequence[Node]):
    return [n for n in nodes if n[0].street != "preflop" and n[0].to_call > 0]


def _postflop_first_in(nodes: Sequence[Node]):
    return [n for n in nodes if n[0].street != "preflop" and n[0].to_call == 0 and n[0].legal.can_bet]


def legal_kind(kind: Kind, legal: LegalActions) -> bool:
    if kind == Kind.FOLD:
        return legal.can_fold and not legal.can_check
    if kind == Kind.CHECK:
        return legal.can_check
    if kind == Kind.CALL:
        return legal.can_call
    if kind == Kind.BET:
        return legal.can_bet
    return legal.can_aggress


def legal_action(action: Action, legal: LegalActions) -> bool:
    t = action.type
    if t is ActionType.FOLD:
        return legal.can_fold
    if t is ActionType.CHECK:
        return legal.can_check
    if t is ActionType.CALL:
        return legal.can_call
    ok = legal.can_bet if t is ActionType.BET else legal.can_raise
    return ok and legal.min_raise_to <= action.to_amount <= legal.max_raise_to


def distributions_sum_to_one_and_are_legal(nodes: Sequence[Node]) -> list[str]:
    out = []
    for spot, priv, persona in nodes:
        dist, trace = policy(spot, priv, persona)
        bad = [c.kind.value for c, v in dist.items() if v <= 0 or not legal_kind(c.kind, spot.legal)]
        if abs(sum(dist.values()) - 1) > 1e-9 or bad:
            out.append(f"{describe(spot, priv, persona)}: sum {sum(dist.values()):.6f}, illegal {bad}")
    return out


def nuts_never_fold(nodes: Sequence[Node]) -> list[str]:
    """Every facing node with the hero's hand marked the nuts (the real nuts
    nodes, plus every other facing node as if it held them), at every size."""
    out = []
    for spot, priv, persona in _postflop_facing(nodes):
        nuts = priv if priv.nuts else dataclasses.replace(priv, nuts=True)
        for g in (None, *SIZE_GRID):
            sp = spot if g is None else with_faced_size(spot, g)
            fold = _p(policy(sp, nuts, persona)[0], Kind.FOLD)
            if fold > 0:
                out.append(f"{describe(sp, priv, persona)} size {g}: P(fold) {fold:.4f}")
                break
    return out


def fold_never_decreases_with_size(nodes: Sequence[Node]) -> list[str]:
    out = []
    for spot, priv, persona in _postflop_facing(nodes):
        prev, prev_g = -1.0, None
        for g in SIZE_GRID:
            fold = _p(policy(with_faced_size(spot, g), priv, persona)[0], Kind.FOLD)
            if fold < prev - EPS:
                out.append(f"{describe(spot, priv, persona)}: P(fold) {prev:.4f} at {prev_g} > {fold:.4f} at {g}")
                break
            prev, prev_g = fold, g
    return out


def value_bet_weight_monotone_in_strength(nodes: Sequence[Node]) -> list[str]:
    """``w_v`` never falls as s rises, within [0, TRAP_S) and within [TRAP_S, 1].
    At TRAP_S itself the trap dial (§4.6: slowplay monsters) deliberately moves
    a share of the value bets to checks, so the one step across it may fall."""
    out = []
    for spot, priv, persona in _postflop_first_in(nodes):
        prev, prev_s = -1.0, None
        for s in S_GRID:
            if prev_s is not None and prev_s < K.TRAP_S <= s:
                prev = -1.0
            w = policy(spot, dataclasses.replace(priv, s=s), persona)[1].features["w_v"]
            if w < prev - EPS:
                out.append(f"{describe(spot, priv, persona)}: w_v {prev:.4f} at s={prev_s} > {w:.4f} at s={s}")
                break
            prev, prev_s = w, s
    return out


def priced_draws_continue(nodes: Sequence[Node], cushion: float = 0.05) -> list[str]:
    """A flush draw or open-ender on the flop or turn whose eq·R covers the price
    used plus ``cushion`` folds less than half the time."""
    out = []
    for spot, priv, persona in _postflop_facing(nodes):
        if spot.street == "river" or not (priv.draws.flush or priv.draws.oesd):
            continue
        dist, tr = policy(spot, priv, persona)
        if tr.eq * tr.features["R"] >= tr.price + cushion and _p(dist, Kind.FOLD) >= 0.5:
            out.append(f"{describe(spot, priv, persona)}: eq {tr.eq:.3f} R {tr.features['R']:.2f} "
                       f"price {tr.price:.3f} yet P(fold) {_p(dist, Kind.FOLD):.3f}")
    return out


def no_one_pair_raise_at_level_two(nodes: Sequence[Node]) -> list[str]:
    out = []
    for spot, priv, persona in _postflop_facing(nodes):
        if spot.raise_level < 2:
            continue
        hand = priv.hand
        if hand.hole_tier >= MadeTier.TWO_PAIR and not hand.board_plays:
            continue
        p = _p(policy(spot, priv, persona)[0], Kind.RAISE, Kind.JAM)
        if p > 0:
            out.append(f"{describe(spot, priv, persona)}: {hand.hole_tier.name} P(raise) {p:.4f}")
    return out


def _street_level(spot: Spot) -> int:
    return spot.street_bet + spot.to_call


def no_crumb_bets(nodes: Sequence[Node], draws: int = 20, seed: int = 0) -> list[str]:
    """No sampled bet or raise short of all-in leaves the effective stack with
    less than 30% of the resulting pot behind (once the bet is called)."""
    out = []
    rng = random.Random(seed)
    for spot, priv, persona in nodes:
        dist, _ = policy(spot, priv, persona)
        for _ in range(draws):
            a = to_action(sample(dist, rng), spot, persona.dials, rng)
            if a.type not in (ActionType.BET, ActionType.RAISE) or a.to_amount == spot.legal.max_raise_to:
                continue
            behind = spot.eff_stack - a.to_amount
            pot_after = spot.pot + (a.to_amount - spot.street_bet) + (a.to_amount - _street_level(spot))
            if behind < CRUMB_POT * pot_after:
                out.append(f"{describe(spot, priv, persona)}: {a} leaves {behind} behind a pot of {pot_after}")
                break
    return out


def lead_threshold_above_checked_to(nodes: Sequence[Node]) -> list[str]:
    """Where the hero leads into last street's aggressor, its value threshold is
    above the same spot's checked-to threshold, and so is no more willing to bet."""
    out = []
    for spot, priv, persona in _postflop_first_in(nodes):
        if spot.is_aggressor or spot.aggressor_seat is None:
            continue
        if spot.leading_into_aggressor:
            lead = spot
            checked = dataclasses.replace(spot, leading_into_aggressor=False)
        else:
            lead, checked = dataclasses.replace(spot, leading_into_aggressor=True), spot
        fl = policy(lead, priv, persona)[1].features
        fc = policy(checked, priv, persona)[1].features
        if not (fl["V"] > fc["V"] and fl["w_v"] <= fc["w_v"] + EPS):
            out.append(f"{describe(spot, priv, persona)}: lead V {fl['V']:.3f} w_v {fl['w_v']:.4f}, "
                       f"checked-to V {fc['V']:.3f} w_v {fc['w_v']:.4f}")
    return out


def multiway_air_cbet_at_most_0_4x_heads_up(nodes: Sequence[Node]) -> list[str]:
    out = []
    for spot, priv, persona in _postflop_first_in(nodes):
        if not spot.is_aggressor or len(spot.opponents) < 2:
            continue
        mw = policy(spot, priv, persona)[1].features["f_air"]
        hu_spot = dataclasses.replace(spot, opponents=spot.opponents[:1])
        hu = policy(hu_spot, priv, persona)[1].features["f_air"]
        if mw > 0.4 * hu + EPS:
            out.append(f"{describe(spot, priv, persona)}: multiway f_air {mw:.4f} > 0.4 × {hu:.4f}")
    return out


CHECKS: dict[str, Callable[[Sequence[Node]], list[str]]] = {
    "distributions_sum_to_one_and_are_legal": distributions_sum_to_one_and_are_legal,
    "nuts_never_fold": nuts_never_fold,
    "fold_never_decreases_with_size": fold_never_decreases_with_size,
    "value_bet_weight_monotone_in_strength": value_bet_weight_monotone_in_strength,
    "priced_draws_continue": priced_draws_continue,
    "no_one_pair_raise_at_level_two": no_one_pair_raise_at_level_two,
    "no_crumb_bets": no_crumb_bets,
    "lead_threshold_above_checked_to": lead_threshold_above_checked_to,
    "multiway_air_cbet_at_most_0_4x_heads_up": multiway_air_cbet_at_most_0_4x_heads_up,
}
