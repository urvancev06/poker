"""A line DSL that deals a real ``Hand`` up to the hero's decision.

    scenario("KsQs", hero_pos="BTN", line=["CO raise 2.5"])
    scenario("Th9h", "Kd7c2h", hero_pos="BB",
             line=["BTN raise 2.5", "BB call", "flop", "BB check", "BTN bet 0.33"])

Tokens:
  * ``"<POS> raise 2.5"``: preflop, raise to 2.5bb; postflop, raise by 2.5 × the
    pot after calling.
  * ``"<POS> raise 3x"`` (any street): raise to 3 × the bet faced.
  * ``"<POS> bet 0.33"``: bet a third of the pot (postflop).
  * ``"<POS> jam"``, ``call``, ``check``, ``fold``.
  * ``"flop"``, ``"turn"``, ``"river"``: the line expects that street next.
Any seat that comes to act but is not next in the line folds preflop and checks
postflop (folds if it faces a bet). Sizes round to the chip and clamp to the legal
range. The deal is a fixed deck: the hero's cards, the given board and any
``villain_holes``; everything else is seeded random cards that do not conflict.
"""

from __future__ import annotations

import random
from collections.abc import Mapping, Sequence

from ..bots.context import DecisionContext, build_context
from ..engine import Action, Hand
from ..engine.types import ActionType, positions_for
from ..math.cards import FULL_DECK

_STREETS = ("preflop", "flop", "turn", "river")
_VERBS = ("raise", "bet", "jam", "call", "check", "fold")


def _cards(text: str) -> list[str]:
    text = text.replace(" ", "")
    if len(text) % 2:
        raise ValueError(f"bad cards {text!r}")
    out = [text[i : i + 2] for i in range(0, len(text), 2)]
    for c in out:
        if c not in FULL_DECK:
            raise ValueError(f"bad card {c!r}")
    return out


def _stacks(stacks_bb: float | Mapping[str, float], positions: list[str], bb: int) -> list[int]:
    if isinstance(stacks_bb, Mapping):
        return [round(stacks_bb.get(p, 100) * bb) for p in positions]
    return [round(stacks_bb * bb)] * len(positions)


def _deck(n: int, holes: list[list[str]], board: list[str], rng: random.Random) -> list[str]:
    used = {c for h in holes for c in h} | set(board)
    if len(used) != sum(len(h) for h in holes) + len(board):
        raise ValueError("the scenario deals a card twice")
    rest = [c for c in FULL_DECK if c not in used]
    rng.shuffle(rest)
    holes = [h + [rest.pop() for _ in range(2 - len(h))] for h in holes]
    board = board + [rest.pop() for _ in range(5 - len(board))]
    deck = [holes[i][0] for i in range(n)] + [holes[i][1] for i in range(n)]
    # A burn before each street.
    deck += [rest.pop(), *board[:3], rest.pop(), board[3], rest.pop(), board[4]]
    return deck + rest


def _parse(token: str) -> tuple[str, str | None, str | None]:
    parts = token.split()
    if len(parts) == 1 and parts[0] in _STREETS[1:]:
        return parts[0], None, None
    if len(parts) not in (2, 3) or parts[1] not in _VERBS:
        raise ValueError(f"bad line token {token!r}")
    return parts[0], parts[1], parts[2] if len(parts) == 3 else None


def _auto(hand: Hand) -> None:
    legal = hand.legal_actions()
    assert legal is not None
    hand.apply(Action(ActionType.CHECK) if legal.can_check else Action(ActionType.FOLD))


def _apply(hand: Hand, verb: str, arg: str | None, bb: int, token: str) -> None:
    legal = hand.legal_actions()
    snap = hand.snapshot()
    assert legal is not None
    if verb == "fold":
        hand.apply(Action(ActionType.FOLD))
        return
    if verb == "check":
        if not legal.can_check:
            raise ValueError(f"{token!r}: cannot check facing a bet")
        hand.apply(Action(ActionType.CHECK))
        return
    if verb == "call":
        hand.apply(Action(ActionType.CALL if legal.can_call else ActionType.CHECK))
        return
    aggress = legal.can_bet or legal.can_raise
    if verb == "jam":
        if aggress:
            hand.apply(Action(ActionType.BET if legal.can_bet else ActionType.RAISE, legal.max_raise_to))
        else:
            hand.apply(Action(ActionType.CALL))
        return
    if not aggress or arg is None:
        raise ValueError(f"{token!r}: no legal {verb} here")
    level = max(s.bet for s in snap.seats)
    if arg.endswith("x"):
        to = float(arg[:-1]) * level
    elif snap.street == "preflop":
        to = float(arg) * bb
    elif verb == "bet":
        to = level + float(arg) * snap.total_pot
    else:
        to = level + float(arg) * (snap.total_pot + legal.call_amount)
    to = min(max(round(to), legal.min_raise_to), legal.max_raise_to)
    hand.apply(Action(ActionType.BET if legal.can_bet else ActionType.RAISE, to))


def deal_scenario(
    hero: str,
    board: str = "",
    *,
    hero_pos: str,
    line: Sequence[str],
    n: int = 6,
    stacks_bb: float | Mapping[str, float] = 100,
    big_blind: int = 10,
    villain_holes: Mapping[str, str] | None = None,
    seed: int = 0,
) -> tuple[Hand, DecisionContext]:
    """The ``Hand`` at the hero's decision and the hero's ``DecisionContext``."""
    positions = positions_for(n)
    if hero_pos not in positions:
        raise ValueError(f"no {hero_pos} at a {n}-handed table")
    hero_seat = positions.index(hero_pos)
    holes: list[list[str]] = [[] for _ in range(n)]
    holes[hero_seat] = _cards(hero)
    for pos, cards in (villain_holes or {}).items():
        holes[positions.index(pos)] = _cards(cards)
    deck = _deck(n, holes, _cards(board), random.Random(seed))
    hand = Hand.new(n, (big_blind // 2, big_blind), _stacks(stacks_bb, positions, big_blind), deck=deck)

    tokens = [_parse(t) for t in line]
    raw = list(line)
    i = 0
    while not hand.is_over and hand.actor is not None:
        actor = hand.actor
        if i == len(tokens):
            if actor == hero_seat:
                return hand, build_context(hand, big_blind)
            _auto(hand)
            continue
        who, verb, arg = tokens[i]
        if verb is None:  # a street marker
            now, want = _STREETS.index(hand.street.value), _STREETS.index(who)
            if now == want:
                i += 1
                continue
            if now > want:
                raise ValueError(f"line expects the {who} but the hand is on the {hand.street.value}")
        elif positions.index(who) == actor:
            _apply(hand, verb, arg, big_blind, raw[i])
            i += 1
            continue
        if actor == hero_seat:
            raise ValueError(f"the hero's turn came before the line was used up (at {raw[i]!r})")
        _auto(hand)
    raise ValueError("the hero's turn never came")


def scenario(
    hero: str,
    board: str = "",
    *,
    hero_pos: str,
    line: Sequence[str],
    n: int = 6,
    stacks_bb: float | Mapping[str, float] = 100,
    big_blind: int = 10,
    villain_holes: Mapping[str, str] | None = None,
    seed: int = 0,
) -> DecisionContext:
    """The hero's ``DecisionContext`` after ``line`` (see the module docstring)."""
    return deal_scenario(
        hero, board, hero_pos=hero_pos, line=line, n=n, stacks_bb=stacks_bb,
        big_blind=big_blind, villain_holes=villain_holes, seed=seed,
    )[1]
