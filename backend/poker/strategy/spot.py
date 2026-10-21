"""Spot: the public features of one decision, built from a ``DecisionContext``.

Everything here comes from the actor's redacted snapshot (the history, the seats,
the decision facts), so a Spot never knows another player's cards.

Conventions:
  * In position means acting after every live opponent postflop. PokerKit acts
    seat 0 first postflop, so it is "the hero's seat is greater than every live
    opponent's seat", on every street.
  * The aggressor (``aggressor_seat``) is the last bettor or raiser of the most
    recent *earlier* street that had aggression; preflop it is the last raiser so
    far. On the flop that is the preflop raiser. ``None`` in a limped pot.
  * ``raise_level`` counts the bets and raises on the current street (the blinds
    are not bets): preflop an open is 1 and a 3-bet 2; postflop a first bet is 1.
  * ``facing_frac`` is the faced aggressive action's chips over the pot before
    it (postflop only); ``size_bucket`` is its D34 bucket.
  * ``spr`` is the effective chips behind now over the pot now.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Literal

from ..bots.context import DecisionContext
from ..engine import DecisionFacts, LegalActions
from .types import Node, PreflopLine

_AGGRESSIVE = ("bet", "raise")
_STREETS = ("preflop", "flop", "turn", "river")

PotType = Literal["limped", "srp", "3bet", "4bet+"]


@dataclass(frozen=True)
class Spot:
    street: str
    seat: int
    position: str
    big_blind: int
    pot: int
    to_call: int
    stack: int
    street_bet: int
    eff_stack: int
    spr: float
    legal: LegalActions
    node: Node
    raise_level: int
    facing_frac: float | None
    size_bucket: str | None
    opponents: tuple[int, ...]
    players_to_act: int
    in_position: bool
    is_aggressor: bool
    aggressor_seat: int | None
    leading_into_aggressor: bool
    limpers: int
    callers: int
    opener_pos: str | None
    threebettor_pos: str | None
    open_size_bb: float | None
    pot_type: PotType
    preflop_lines: dict[int, PreflopLine]
    positions: tuple[str, ...]
    facts: DecisionFacts | None
    history: tuple
    board: tuple[str, ...]
    seats: tuple  # SeatState per seat, redacted


def size_bucket(frac: float) -> str:
    """D34 size buckets: S ≤ 40%, M ≤ 80%, L ≤ 130%, O ≤ 200%, J above."""
    if frac <= 0.40:
        return "S"
    if frac <= 0.80:
        return "M"
    if frac <= 1.30:
        return "L"
    if frac <= 2.00:
        return "O"
    return "J"


def _preflop_node(raises: list, seat: int) -> Node:
    level = len(raises)
    if level == 0:
        return Node.UNOPENED
    if level == 1:
        return Node.VS_OPEN
    if level == 2:
        return Node.VS_3BET if raises[0].seat == seat else Node.COLD_VS_3BET
    if level == 3:
        return Node.VS_4BET
    return Node.VS_5BET


def _kind(entry) -> str:
    if entry.action in _AGGRESSIVE:
        return "jam" if entry.all_in else "raise"
    return entry.action


def _preflop(history: tuple, bb: int) -> tuple[list, int, int, dict[int, PreflopLine]]:
    """The preflop raises, limpers, callers of the last raise and each seat's line."""
    raises: list = []
    limpers = callers = 0
    lines: dict[int, list] = {}
    for e in history:
        if e.street != "preflop":
            break
        node = _preflop_node(raises, e.seat).value
        size = e.to_amount / bb if e.action in _AGGRESSIVE and e.to_amount is not None else None
        lines.setdefault(e.seat, []).append((node, _kind(e), size))
        if e.action in _AGGRESSIVE:
            raises.append(e)
            callers = 0
        elif e.action == "call":
            if raises:
                callers += 1
            else:
                limpers += 1
    return raises, limpers, callers, {s: PreflopLine(s, tuple(a)) for s, a in lines.items()}


def _aggressor(history: tuple, street: str) -> int | None:
    """Last aggressor of the most recent earlier street with aggression (preflop:
    the last raiser so far)."""
    now = _STREETS.index(street)
    last: dict[str, int] = {}
    for e in history:
        if e.action in _AGGRESSIVE:
            last[e.street] = e.seat
    if street == "preflop":
        return last.get("preflop")
    for st in reversed(_STREETS[:now]):
        if st in last:
            return last[st]
    return None


def _pot_type(n_raises: int) -> PotType:
    return ("limped", "srp", "3bet")[n_raises] if n_raises < 3 else "4bet+"


def _street_entries(history: tuple, street: str) -> list:
    return [e for e in history if e.street == street]


def _faced(entries: list) -> tuple[int, object] | None:
    """(index, entry) of the last bet or raise on this street, if any."""
    for i in range(len(entries) - 1, -1, -1):
        if entries[i].action in _AGGRESSIVE:
            return i, entries[i]
    return None


def _pot_before(pot: int, entries: list, idx: int) -> int:
    return pot - sum(e.added for e in entries[idx:])


def _behind(stack: int, seats: tuple, opponents: tuple[int, ...]) -> int:
    opp = max((seats[i].stack for i in opponents), default=0)
    return min(stack, opp)


def build_spot(ctx: DecisionContext) -> Spot:
    seats = ctx.seats
    seat, street, bb = ctx.seat, ctx.street, ctx.big_blind
    opponents = tuple(s.seat for s in seats if s.seat != seat and not s.folded)
    raises, limpers, callers, lines = _preflop(ctx.history, bb)
    entries = _street_entries(ctx.history, street)
    aggressor = _aggressor(ctx.history, street)

    facing_frac = bucket = None
    if street == "preflop":
        raise_level = len(raises)
        node = _preflop_node(raises, seat)
    else:
        raise_level = sum(1 for e in entries if e.action in _AGGRESSIVE)
        faced = _faced(entries)
        if faced is None or ctx.to_call == 0:
            node = Node.FIRST_IN
        else:
            idx, last = faced
            before = _pot_before(ctx.pot, entries, idx)
            facing_frac = last.added / before if before > 0 else None
            bucket = size_bucket(facing_frac) if facing_frac is not None else None
            node = _postflop_node(raise_level, last, entries[:idx], aggressor, seats, street)

    hero_total = ctx.my_stack + ctx.my_bet
    opp_total = max((seats[i].stack + seats[i].bet for i in opponents), default=hero_total)
    behind = _behind(ctx.my_stack, seats, opponents)
    aggressor_live = aggressor is not None and not seats[aggressor].folded
    leading = (
        street != "preflop"
        and raise_level == 0
        and aggressor_live
        and aggressor != seat
        and aggressor > seat
    )
    return Spot(
        street=street,
        seat=seat,
        position=ctx.position,
        big_blind=bb,
        pot=ctx.pot,
        to_call=ctx.to_call,
        stack=ctx.my_stack,
        street_bet=ctx.my_bet,
        eff_stack=min(hero_total, opp_total),
        spr=behind / ctx.pot if ctx.pot else float("inf"),
        legal=ctx.legal,
        node=node,
        raise_level=raise_level,
        facing_frac=facing_frac,
        size_bucket=bucket,
        opponents=opponents,
        players_to_act=ctx.facts.to_act_after_call if ctx.facts else 0,
        in_position=all(seat > o for o in opponents),
        is_aggressor=aggressor == seat,
        aggressor_seat=aggressor,
        leading_into_aggressor=leading,
        limpers=limpers,
        callers=callers,
        opener_pos=raises[0].position if raises else None,
        threebettor_pos=raises[1].position if len(raises) > 1 else None,
        open_size_bb=(raises[0].to_amount / bb) if raises and raises[0].to_amount else None,
        pot_type=_pot_type(len(raises)),
        preflop_lines=lines,
        positions=tuple(s.position for s in seats),
        facts=ctx.facts,
        history=tuple(ctx.history),
        board=tuple(ctx.board),
        seats=tuple(seats),
    )


def _postflop_node(level: int, last, earlier: list, aggressor: int | None, seats: tuple, street: str) -> Node:
    if level >= 3:
        return Node.VS_RERAISE
    if level == 2:
        checked = any(e.seat == last.seat and e.action == "check" for e in earlier)
        return Node.VS_CHECK_RAISE if checked else Node.VS_RAISE
    bettor = last.seat
    if aggressor is not None and bettor == aggressor:
        return Node.VS_CBET if street == "flop" else Node.VS_BARREL
    if aggressor is not None and not seats[aggressor].folded and aggressor > bettor:
        return Node.VS_DONK
    return Node.VS_BET


def with_faced_size(spot: Spot, frac: float) -> Spot:
    """The same spot as if the faced bet had been ``frac`` × the pot before it,
    capped at the bettor's stack. Rebuilds pot, to_call, legal, facing_frac,
    size_bucket, spr and the facts' price; callers in between call the new size."""
    entries = _street_entries(spot.history, spot.street)
    faced = _faced(entries)
    if spot.street == "preflop" or faced is None or spot.to_call == 0:
        raise ValueError("with_faced_size needs a postflop spot facing a bet")
    idx, last = faced
    before = _pot_before(spot.pot, entries, idx)
    available = last.added + spot.seats[last.seat].stack  # the bettor has not acted since
    level_before = last.street_total - last.added
    prior_level = max((e.street_total for e in entries[:idx]), default=0)
    floor = max(1, spot.street_bet - level_before + 1)
    added = min(max(round(frac * before), floor), available)
    level = level_before + added
    pot = before + added
    for e in entries[idx + 1 :]:
        if e.action == "call":
            had = e.street_total - e.added
            pot += min(level - had, e.added + (e.stack_after or 0))
        else:
            pot += e.added
    to_call = max(0, min(level - spot.street_bet, spot.stack))
    increment = max(level - prior_level, spot.big_blind)
    max_to = spot.stack + spot.street_bet
    can_raise = spot.stack > to_call and (available - added) > 0
    legal = LegalActions(
        can_fold=True,
        can_check=False,
        can_call=to_call > 0,
        call_amount=to_call,
        can_bet=False,
        can_raise=can_raise,
        min_raise_to=min(level + increment, max_to) if can_raise else None,
        max_raise_to=max_to if can_raise else None,
    )
    bettor_behind = available - added
    others = [i for i in spot.opponents if i != last.seat]
    behind = min(spot.stack, max([bettor_behind] + [spot.seats[i].stack for i in others]))
    unmatched = max(0, (level - spot.street_bet) - to_call)
    facts = spot.facts
    if facts is not None:
        facts = dataclasses.replace(
            facts, to_call=to_call, pot=pot, winnable_if_call=pot + to_call - unmatched
        )
    new_frac = added / before if before > 0 else None
    return dataclasses.replace(
        spot,
        pot=pot,
        to_call=to_call,
        legal=legal,
        facing_frac=new_frac,
        size_bucket=size_bucket(new_frac) if new_frac is not None else None,
        spr=behind / pot if pot else float("inf"),
        facts=facts,
    )

