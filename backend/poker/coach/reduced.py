"""The reduced coach for v2 (beta) tables (D24, owner decisions 2 and a).

The full coach's realization factors, implied odds and verdicts were calibrated
against the v1 bots, so on a v2 table it would advise against the wrong
opponents. Until phase 4 recalibrates it, a v2 table gets:

* exact (or the table's, or seeded) raw equity against each contesting villain's
  **pool-average** preflop line range: the mean of ``preflop_range_weights`` over
  the five type means, equally weighted (the Classic pool). The coach never reads
  a seat's type, persona or trace, so swapping who is who changes nothing (§5 L7);
* the exact price from the engine facts; no realization, implied odds or EV;
* postflop, the verdict ``"Odds only."``;
* preflop, the chart advice from the same charts the v2 bots play (P3.1
  ``chart_advice``), sized as the baseline sizes it (P3.6), and whether the hand
  is in that chart.
"""

from __future__ import annotations

import numpy as np

from ..bots import build_context
from ..math.classify import classify
from ..math.equity import equity_vs_ranges
from ..math.odds import required_equity
from ..math.suits import class_of
from ..strategy.charts.preflop import chart_advice, short_stacked, small_pairs_can_flat
from ..strategy.dials import TYPE_DIALS, type_mean
from ..strategy.preflop import range_array
from ..strategy.sizing import _crumb, preflop_to_bb
from ..strategy.spot import Spot, build_spot
from ..strategy.types import PREFLOP_NODES
from .coach import Coaching, VillainModel, _bb, equity_basis
from .villain_model import villain_line
from .villains import EQUITY_SAMPLES, decision_key, select_villains

MODE_NOTE = "Not yet calibrated for the new bots"
PREFLOP_MODE_NOTE = "Preflop chart advice; odds only after the flop"
POOL_ARCHETYPE = "Pool average"
ODDS_ONLY = "Odds only."

# The baseline the advice is sized with (size_pre 1.0: open 2.5bb, SB 3bb, 3-bet
# 3x in position and 4x out of it).
_SIZING_DIALS = type_mean("tag")
_LINE_TEXT = {"3bet+": "3-bet pre", "raise": "raised pre", "call": "called pre", "passive": "preflop range"}
_TONE = {"raise": "good", "3bet": "good", "4bet": "good", "jam": "good", "call": "good", "check": "neutral", "fold": "fold"}
_TOTAL_COMBOS = 1326


def pool_range(spot: Spot, seat: int, dead) -> np.ndarray:
    """Seat ``seat``'s pool-average preflop line range: the mean of the five type
    means' line likelihoods, with the dead cards removed."""
    return np.mean([range_array(type_mean(k), spot, seat, dead) for k in TYPE_DIALS], axis=0)


def _advice_to(spot: Spot) -> int:
    """The baseline's raise-to in chips, legal and without a crumb behind."""
    legal = spot.legal
    to = round(preflop_to_bb(spot, _SIZING_DIALS) * spot.big_blind)
    to = min(max(to, legal.min_raise_to), legal.max_raise_to)
    if to < legal.max_raise_to and _crumb(spot, to):  # the bots' own no-crumb rule
        to = legal.max_raise_to
    return to


def preflop_advice(spot: Spot, hole) -> dict | None:
    """The chart's play for the hero's hand, or None where no chart covers the
    spot (a limper facing an iso-raise, an unusual line)."""
    if spot.node not in PREFLOP_NODES:
        return None
    cls = class_of(hole)
    facts = spot.facts
    price = facts.to_call / facts.winnable_if_call if facts is not None and facts.winnable_if_call else None
    eff_bb = spot.eff_stack / spot.big_blind  # the stack rules exactly as the bots read them
    try:
        adv = chart_advice(
            cls, spot.position, spot.node.value,
            opener=spot.opener_pos, threebettor=spot.threebettor_pos,
            limpers=spot.limpers, callers=spot.callers,
            open_size_bb=spot.open_size_bb, price=price,
            short_stack=short_stacked(eff_bb),
            small_pair_flat=small_pairs_can_flat(eff_bb, spot.big_blind, spot.to_call),
        )
    except (KeyError, ValueError, AssertionError):
        return None
    action = adv.action
    legal = spot.legal
    to_amount = None
    if action in ("raise", "3bet", "4bet", "jam"):
        if legal.can_aggress:
            to_amount = legal.max_raise_to if action == "jam" else _advice_to(spot)
        else:
            action = "call" if legal.can_call else "check"
    if action == "fold" and legal.can_check:
        action = "check"
    if action == "call" and not legal.can_call:
        action = "check"
    return {
        "action": action,
        "to_amount": to_amount,
        "chart": adv.chart,
        "in_chart": action not in ("fold", "check"),
        "hand": cls,
        "position": spot.position,
        "all_in": to_amount is not None and to_amount == legal.max_raise_to,
    }


def advice_text(adv: dict, spot: Spot) -> tuple[str, str]:
    """``(verdict, rationale)`` for a chart advice."""
    action, cls, pos, bb = adv["action"], adv["hand"], adv["position"], spot.big_blind
    to = adv["to_amount"]
    if to is not None and adv["all_in"]:
        verdict = f"All-in, {_bb(to, bb)}."
    elif action == "raise":
        verdict = f"{'Open-raise' if spot.limpers == 0 else 'Raise'} to {_bb(to, bb)}."
    elif action in ("3bet", "4bet"):
        verdict = f"{action[0]}-bet to {_bb(to, bb)}."
    else:
        verdict = {"call": "Call.", "check": "Check.", "fold": "Fold.", "jam": "All-in."}[action]
    if adv["in_chart"]:
        chart = pos if adv["chart"] == f"{pos} open" else adv["chart"]
        rationale = f"{cls} is in your {chart} chart."
    elif spot.limpers == 0 and spot.opener_pos is None:
        rationale = f"{cls} is not in your {pos} chart."
    else:
        rationale = f"{cls} is in none of your {pos} charts for this spot."
    return verdict, rationale


def _basis(*, priced: bool, method: str, se_pct: float | None, advised: bool) -> list[str]:
    out = ["Hand classification is computed from your cards and the board.", equity_basis(method, se_pct)]
    if priced:
        out.append("Pot odds and required equity are exact arithmetic.")
    out.append(
        "Villain ranges are the pool average: every player type's range for the "
        "preflop line taken, equally weighted."
    )
    if advised:
        out.append("Preflop advice is the baseline chart the new bots play (STRATEGY.md §2).")
    out.append("No realization, implied odds or call EV: the coach is not yet calibrated for the new bots.")
    return out


def build_reduced_coaching(session, trials: int | None = None) -> Coaching:
    """The coaching for the hero's current decision on a v2 table (D24)."""
    if not session.hero_to_act:
        raise RuntimeError("coaching is only available when it's the hero's turn")
    state = session.state()
    hero_seat = session.hero_seat
    hole = state.seats[hero_seat].hole_cards
    assert hole is not None
    board = list(state.board)
    legal = state.legal_actions
    assert legal is not None
    bb = int(state.blinds[1])
    spot = build_spot(build_context(session.hand, bb))
    hc = classify(hole, board)
    dead = set(hole) | set(board)

    facts = getattr(state, "facts", None)
    level = state.seats[hero_seat].bet + legal.call_amount if legal.call_amount > 0 else 0
    villain_seats, players_behind = select_villains(
        session.live_villain_seats(),
        [seat.bet for seat in state.seats],
        level,
        facts.to_act_after_call if facts is not None else None,
    )

    ranges, villains = [], []
    for s in villain_seats:
        w = pool_range(spot, s, dead)
        ranges.append(w)
        role, _ = villain_line(state.history, s)
        mass = float(w.sum())
        villains.append(VillainModel(
            seat=s,
            archetype=POOL_ARCHETYPE,
            combos=round(mass),
            description=(
                f"{state.seats[s].position}, {_LINE_TEXT[role]} → "
                f"~top {round(100 * mass / _TOTAL_COMBOS, 1)}% ({round(mass)} combos)"
            ),
            bluff_pct=0.0,
        ))

    key = decision_key(getattr(session, "session_id", None) or "local", getattr(session, "hand_index", 0),
                       len(state.history))
    eq = None
    if ranges:
        try:
            eq = equity_vs_ranges(hole, board, ranges, key=key, samples=trials or EQUITY_SAMPLES)
        except ValueError:  # every range blocked: any two cards, as the full coach falls back
            eq = equity_vs_ranges(hole, board, [np.ones(_TOTAL_COMBOS)] * len(ranges), key=key,
                                  samples=trials or EQUITY_SAMPLES)
    if eq is not None:
        equity, win, tie, lose = eq.equity, eq.win, eq.tie, eq.lose
        method, se_pct = eq.method, (None if eq.se is None else round(eq.se * 100, 2))
    else:
        equity, win, tie, lose, method, se_pct = 1.0, 1.0, 0.0, 0.0, "exact", None

    to_call = facts.to_call if facts is not None else legal.call_amount
    winnable = facts.winnable_if_call if facts is not None else state.total_pot + to_call
    in_position = all(hero_seat > s for s in villain_seats) if villain_seats else True
    action_closed = bool(facts is not None and to_call > 0 and facts.betting_over_after_call)
    if to_call > 0:
        pot_for_call = winnable - to_call
        required_pct = round(required_equity(to_call, pot_for_call) * 100, 1)
        pot_odds = f"{pot_for_call / to_call:.1f} : 1"
    else:
        required_pct, pot_odds = None, None

    eq_pct = round(equity * 100, 1)
    advice = preflop_advice(spot, hole) if not board else None
    if advice is not None:
        verdict, rationale = advice_text(advice, spot)
        tone, mode_note = _TONE[advice["action"]], PREFLOP_MODE_NOTE
    else:
        verdict, tone, mode_note = ODDS_ONLY, "neutral", MODE_NOTE
        rationale = f"Your equity is {eq_pct}% against the pool-average ranges"
        rationale += f"; a call needs {required_pct}%." if required_pct is not None else "."

    return Coaching(
        hand_label=hc.label or hc.made.name.replace("_", " ").lower(),
        made_tier=hc.made.name,
        draws=[d.value for d in hc.draws],
        equity_pct=eq_pct,
        realized_equity_pct=eq_pct,
        realization_pct=100,
        win_pct=round(win * 100),
        tie_pct=round(tie * 100),
        lose_pct=round(lose * 100),
        to_call=to_call,
        pot=state.total_pot,
        required_equity_pct=required_pct,
        required_direct_pct=required_pct,
        implied_note="",
        pot_odds=pot_odds,
        call_ev=None,
        in_position=in_position,
        action_closed=action_closed,
        players_behind=players_behind,
        villains=villains,
        verdict=verdict,
        rationale=rationale,
        tone=tone,
        basis=_basis(priced=to_call > 0, method=method, se_pct=se_pct, advised=advice is not None),
        winnable=winnable if facts is not None else None,
        big_blind=bb,
        closes_on_call=facts.closes_on_call if facts is not None else None,
        equity_method=method,
        equity_se_pct=se_pct,
        hole_tier=hc.hole_tier.name,
        mode="reduced",
        mode_note=mode_note,
        advice=advice,
    )
