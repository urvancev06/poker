"""The v2 preflop policy (§4.6): the P3.1 charts scaled by a persona's dials.

``decide_preflop`` reads the node off the ``Spot`` and looks the class up in a
per-node table that holds every class at once (memoised on the node and the
dials), so a whole range costs one table. Raises are abstract: ``RAISE`` (P3.6
picks the size) or ``JAM`` when the effective stack is at most 25bb and the raise
is a 3-bet or bigger.

``line_likelihood`` replays a seat's preflop decisions from the public history and
multiplies the chart probabilities of what it did, class by class; it is the
population range of D23 when called with the TAG type mean.

Rules beyond the plan's list (documented for the owner):
  * A limper facing a raise (an iso-raise, or the BB raising over limpers) has no
    chart key; it re-raises the opener's value 3-bets and calls with the top
    ``LIMP_CALL_FRAC`` of its own entering cut.
  * An iso-raiser facing a 3-bet defends a share of its own iso cut; the BB's own
    cut over limpers is BB_ISO_VALUE.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from ..math.suits import HERO_CLASS
from ..math.vector import INCIDENCE, card_index
from .charts import preflop as ch
from .charts.order import CLASSES, OPEN_ORDER, combos, p_in
from .dials import Dials
from .spot import Spot
from .types import ActionDist, Choice, Kind, Node

LIMP_CALL_FRAC = 0.6
_AGGRESSIVE = ("bet", "raise")
_RAISE, _JAM = Choice(Kind.RAISE), Choice(Kind.JAM)
_FOLD, _CHECK, _CALL = Choice(Kind.FOLD), Choice(Kind.CHECK), Choice(Kind.CALL)


@dataclass(frozen=True)
class PreNode:
    """What one preflop decision depends on, from the public line."""

    node: Node
    pos: str
    limpers: int
    callers: int
    opener: str | None
    threebettor: str | None
    open_size_bb: float | None
    eff_bb: float
    to_call: int
    price: float
    big_blind: int
    can_check: bool
    can_call: bool
    can_raise: bool


@dataclass(frozen=True)
class _Row:
    fold: float
    check: float
    call: float
    raise_: float
    jam: bool  # the raise is a jam


def _node_of(spot: Spot) -> PreNode:
    facts = spot.facts
    if facts is not None and facts.winnable_if_call > 0:
        price = facts.to_call / facts.winnable_if_call
    else:
        price = spot.to_call / (spot.pot + spot.to_call) if spot.to_call else 0.0
    return PreNode(
        node=spot.node,
        pos=spot.position,
        limpers=spot.limpers,
        callers=spot.callers,
        opener=spot.opener_pos,
        threebettor=spot.threebettor_pos,
        open_size_bb=spot.open_size_bb,
        eff_bb=spot.eff_stack / spot.big_blind,
        to_call=spot.to_call,
        price=price,
        big_blind=spot.big_blind,
        can_check=spot.legal.can_check,
        can_call=spot.legal.can_call,
        can_raise=spot.legal.can_aggress,
    )


def _limped(pos: str, opener: str) -> bool:
    """No chart key: the hero acted before the opener, so it limped."""
    if pos == "BB":
        return opener not in ch.BB_DEFEND_TARGET
    return (pos, opener) not in ch.LIGHT_BASE


def _own_open_cut(pos: str, d: Dials, limpers: int) -> float:
    if pos == "BB":
        return float(combos(ch.BB_ISO_VALUE))
    return ch.open_cut(pos, d.open, limpers)


def _probs(pn: PreNode, d: Dials) -> tuple[dict[str, tuple[float, float, float, float]], dict]:
    """Per class (fold, check, call, raise) before legality, and the trace cut."""
    out: dict[str, tuple[float, float, float, float]] = {}
    node = pn.node
    trace: dict = {"cut": None, "light_cut": None}
    if node == Node.UNOPENED:
        if pn.pos == "BB":
            for c in CLASSES:
                r = 1.0 if (pn.limpers and c in ch.BB_ISO_VALUE) else 0.0
                out[c] = (0.0, 1.0 - r, 0.0, r)
            return out, trace
        cut = ch.open_cut(pn.pos, d.open, pn.limpers)
        trace["cut"] = cut
        premium = set(ch.PREMIUM)
        for c in CLASSES:
            enter = p_in(c, OPEN_ORDER, cut)
            limp = 0.0 if c in premium else enter * d.limp
            out[c] = (1.0 - enter, 0.0, limp, enter - limp)
        return out, trace

    if node == Node.VS_OPEN:
        assert pn.opener is not None
        k = ch.size_factor(pn.open_size_bb, pn.opener)
        if _limped(pn.pos, pn.opener):
            value = set(ch.VALUE_3BET.get(pn.opener, ch.VALUE_3BET["CO"]))
            cut = LIMP_CALL_FRAC * ch.open_cut(pn.pos, d.open) * d.call * k
            trace["cut"] = cut
            for c in CLASSES:
                r = 1.0 if c in value else 0.0
                call = (1.0 - r) * p_in(c, OPEN_ORDER, cut)
                out[c] = (1.0 - r - call, 0.0, call, r)
            return out, trace
        table = ch.vs_open_probs(
            pn.pos, pn.opener, threebet=d.threebet, call=d.call, k=k, callers=pn.callers
        )
        light_cut, cut = ch.vs_open_cuts(
            pn.pos, pn.opener, threebet=d.threebet, call=d.call, k=k, callers=pn.callers
        )
        trace["cut"], trace["light_cut"] = cut, light_cut
        short = pn.to_call > 0 and pn.eff_bb * pn.big_blind < ch.SMALL_PAIR_STACK_X * pn.to_call
        small = set(ch.SMALL_PAIRS)
        for c in CLASSES:
            r, call = table[c]
            if short and c in small:
                call = 0.0
            out[c] = (1.0 - r - call, 0.0, call, r)
        return out, trace

    if node == Node.VS_3BET:
        assert pn.threebettor is not None
        own = _own_open_cut(pn.pos, d, pn.limpers)
        table = ch.vs_3bet_probs(
            pn.pos, pn.threebettor, open_mult=d.open, call=d.call, threebet=d.threebet, own_cut=own
        )
        trace["cut"] = ch.call_3bet_cut(pn.pos, pn.threebettor, call=d.call, own_cut=own)
        for c in CLASSES:
            r, call = table[c]
            out[c] = (1.0 - r - call, 0.0, call, r)
        return out, trace

    if node == Node.COLD_VS_3BET:
        table = ch.cold_vs_3bet_probs(call=d.call)
        trace["cut"] = ch.COLD_CALL_3BET_BASE * d.call
        for c in CLASSES:
            r, call = table[c]
            out[c] = (1.0 - r - call, 0.0, call, r)
        return out, trace

    # vs_4bet and vs_5bet: the jams are always jams; vs a 5-bet nothing else plays.
    table = ch.vs_4bet_probs(pn.price)
    for c in CLASSES:
        r, call = table[c]
        if node == Node.VS_5BET:
            call = 0.0
        out[c] = (1.0 - r - call, 0.0, call, r)
    return out, trace


def _legal_row(fold: float, check: float, call: float, raise_: float, pn: PreNode, jam: bool) -> _Row:
    if raise_ and not pn.can_raise:
        call, raise_ = call + raise_, 0.0
    if call and not pn.can_call:
        check, call = check + call, 0.0
    if fold and pn.can_check:
        check, fold = check + fold, 0.0
    return _Row(fold, check, call, raise_, jam)


@lru_cache(maxsize=4096)
def _table(pn: PreNode, d: Dials) -> tuple[dict[str, _Row], dict]:
    raw, trace = _probs(pn, d)
    three_plus = pn.node != Node.UNOPENED
    jam = pn.node in (Node.VS_4BET, Node.VS_5BET) or (three_plus and pn.eff_bb <= ch.SHORT_STACK_BB)
    rows = {c: _legal_row(*raw[c], pn, jam) for c in CLASSES}
    return rows, trace


def _dist(row: _Row) -> ActionDist:
    dist = {
        _FOLD: row.fold,
        _CHECK: row.check,
        _CALL: row.call,
        (_JAM if row.jam else _RAISE): row.raise_,
    }
    kept = {c: v for c, v in dist.items() if v > 0}
    total = sum(kept.values())
    return {c: v / total for c, v in kept.items()}


def _value_sets(pn: PreNode) -> frozenset[str]:
    if pn.node == Node.VS_OPEN and pn.opener is not None:
        if pn.callers:
            return frozenset(ch.SQUEEZE_VALUE)
        return frozenset(ch.VALUE_3BET.get(pn.opener, ch.VALUE_3BET["CO"]))
    if pn.node == Node.VS_3BET and pn.threebettor is not None:
        return frozenset(ch.FOURBET_VALUE_VS_EP if pn.threebettor in ch.EARLY else ch.FOURBET_VALUE)
    if pn.node == Node.COLD_VS_3BET:
        return frozenset(ch.COLD_4BET)
    if pn.node in (Node.VS_4BET, Node.VS_5BET):
        return frozenset(ch.JAM_VS_4BET)
    return frozenset()


def decide_preflop(spot: Spot, cls: str, dials: Dials) -> tuple[ActionDist, dict]:
    """The preflop distribution of ``cls`` at ``spot`` and its trace features:
    node, cut (the open, flat or call cut in combos), p_value, p_light, p_flat."""
    pn = _node_of(spot)
    rows, trace = _table(pn, dials)
    row = rows[cls]
    value = cls in _value_sets(pn)
    features = {
        "node": pn.node.value,
        "cut": trace["cut"],
        "p_value": row.raise_ if value else 0.0,
        "p_light": 0.0 if value else row.raise_,
        "p_flat": row.call,
    }
    return _dist(row), features


# --- Line likelihood (the population range, D23) ----------------------------------


def _line_key(spot: Spot) -> tuple:
    pre = tuple(
        (e.seat, e.position, e.action, e.to_amount, e.added, e.street_total, e.all_in, e.stack_after)
        for e in spot.history
        if e.street == "preflop"
    )
    now = tuple((s.stack, s.bet, s.folded) for s in spot.seats) if spot.street == "preflop" else ()
    return (spot.big_blind, spot.positions, pre, now)


def _blind(pos: str, bb: int) -> int:
    return bb if pos == "BB" else (bb // 2 if pos == "SB" else 0)


def _replay(key: tuple) -> list[tuple[int, PreNode, str, bool]]:
    """Every preflop decision as (seat, node, observed kind, all-in)."""
    bb, positions, entries, now = key
    n = len(positions)
    bet = [_blind(p, bb) for p in positions]
    stack = [0] * n
    seen = set()
    for seat, _pos, _a, _to, added, total, _ai, after in entries:
        if seat in seen:
            continue
        seen.add(seat)
        bet[seat] = total - added
        stack[seat] = (after if after is not None else 0) + added
    for i in range(n):
        if i not in seen and now:
            stack[i], bet[i] = now[i][0], now[i][1]
    folded: set[int] = set()
    raises: list[tuple[int, str, int | None]] = []
    limpers = callers = 0
    out = []
    for seat, pos, action, to, added, total, all_in, after in entries:
        level = max(bet)
        to_call = max(0, min(level - bet[seat], stack[seat]))
        lvl = len(raises)
        if lvl == 0:
            node = Node.UNOPENED
        elif lvl == 1:
            node = Node.VS_OPEN
        elif lvl == 2:
            node = Node.VS_3BET if raises[0][0] == seat else Node.COLD_VS_3BET
        elif lvl == 3:
            node = Node.VS_4BET
        else:
            node = Node.VS_5BET
        mine = bet[seat] + to_call
        winnable = mine + sum(min(bet[i], mine) for i in range(n) if i != seat)
        live_opp = [i for i in range(n) if i != seat and i not in folded]
        opp_total = max((stack[i] + bet[i] for i in live_opp), default=stack[seat] + bet[seat])
        eff = min(stack[seat] + bet[seat], opp_total)
        opp_chips = any(stack[i] > 0 for i in live_opp)
        pn = PreNode(
            node=node,
            pos=pos,
            limpers=limpers,
            callers=callers,
            opener=raises[0][1] if raises else None,
            threebettor=raises[1][1] if len(raises) > 1 else None,
            open_size_bb=(raises[0][2] / bb) if raises and raises[0][2] else None,
            eff_bb=eff / bb,
            to_call=to_call,
            price=to_call / winnable if winnable and to_call else 0.0,
            big_blind=bb,
            can_check=to_call == 0,
            can_call=to_call > 0,
            can_raise=stack[seat] > to_call and opp_chips,
        )
        kind = "jam" if action in _AGGRESSIVE and all_in else ("raise" if action in _AGGRESSIVE else action)
        out.append((seat, pn, kind, all_in))
        bet[seat] = total
        stack[seat] = after if after is not None else max(0, stack[seat] - added)
        if action == "fold":
            folded.add(seat)
        elif action in _AGGRESSIVE:
            raises.append((seat, pos, to))
            callers = 0
        elif action == "call":
            if raises:
                callers += 1
            else:
                limpers += 1
    return out


def _observed(row: _Row, kind: str, node: Node) -> float:
    if kind == "fold":
        return row.fold
    if kind == "check":
        return row.check
    if kind == "call":
        return row.call
    if kind == "jam" and node in (Node.VS_4BET, Node.VS_5BET):
        return row.raise_ + row.call  # a committed call is sized up to a jam (P3.6)
    return row.raise_


@lru_cache(maxsize=4096)
def _likelihood(d: Dials, key: tuple, seat: int) -> tuple[float, ...]:
    w = [1.0] * len(CLASSES)
    for s, pn, kind, _ai in _replay(key):
        if s != seat:
            continue
        rows, _ = _table(pn, d)
        for i, c in enumerate(CLASSES):
            if w[i]:
                w[i] *= _observed(rows[c], kind, pn.node)
    return tuple(w)


def line_likelihood(dials: Dials, spot: Spot, seat: int) -> tuple[float, ...]:
    """169 values in ``CLASSES`` order: the product over ``seat``'s preflop
    decisions of P(what it did | class). A seat that has not acted is all 1."""
    return _likelihood(dials, _line_key(spot), seat)


def line_digest(spot: Spot) -> str:
    """A stable short digest of the preflop line (a BoardCache key part)."""
    return hashlib.blake2b(repr(_line_key(spot)[:3]).encode(), digest_size=8).hexdigest()


def range_array(dials: Dials, spot: Spot, seat: int, dead: Iterable[str]) -> np.ndarray:
    """``preflop_range_weights`` as a float array."""
    w = np.asarray(line_likelihood(dials, spot, seat), dtype=np.float64)[HERO_CLASS]
    idx = [card_index(c) for c in dead]
    if idx:
        w = np.where(INCIDENCE[:, idx].any(axis=1), 0.0, w)
    return w


def preflop_range_weights(dials: Dials, spot: Spot, seat: int, dead: Iterable[str]) -> list[float]:
    """1,326 weights in ``vector.COMBOS`` order: the line likelihood of each
    combo's class, 0 for a combo holding a dead card."""
    return range_array(dials, spot, seat, dead).tolist()


__all__ = [
    "LIMP_CALL_FRAC",
    "decide_preflop",
    "line_digest",
    "line_likelihood",
    "preflop_range_weights",
    "range_array",
]
