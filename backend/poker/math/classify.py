"""Hole-aware hand classifier: the made tier, the part the hole cards play, draws
that need a hole card, and a label a player would say.

``made`` is the tier of the best five cards, from treys, exactly as before. What
changed in phase 2 is everything that asks "whose hand is it":

* ``hole_tier`` is the strength the hole cards themselves contribute. A straight
  or better counts only when a hole card is in it (quads only when a hole card is
  one of the four). Below a straight the best five's groups are read from rank
  counts, and a group is the hero's when the hole holds its rank. So 4♠4♥ on
  A♠A♦9♦3♣6♠ is two pair (``made``) but one pair of fours (``hole_tier``), and
  8♣4♦ on K♠K♥5♦5♣Q♠ plays the board (``hole_tier`` HIGH_CARD).
* ``board_plays`` is True when the board alone is as good as the best hand (the
  river only), so no hole card is needed.
* ``draws`` come from ``draws.hole_draws`` (a hole card must take part, the
  board's own straight outs do not count); ``nut_flush_draw`` marks the nut one.
* ``label`` reads like a player: "top pair, good kicker", "underpair", "board two
  pair, ace kicker", "set", "ace high + nut flush draw".

The v1 bots keep the classifier they were measured with, in
``classify_legacy.py``. The enums and ``HandClass`` here are shared with it.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from enum import Enum, IntEnum
from typing import Sequence

from treys import Card, Evaluator

from .cards import RANK_INDEX
from .draws import hole_draws

_EVAL = Evaluator()
_INT = Card.new


class MadeTier(IntEnum):
    HIGH_CARD = 1
    PAIR = 2
    TWO_PAIR = 3
    TRIPS = 4
    STRAIGHT = 5
    FLUSH = 6
    FULL_HOUSE = 7
    QUADS = 8
    STRAIGHT_FLUSH = 9


class Draw(str, Enum):
    FLUSH_DRAW = "flush_draw"
    BACKDOOR_FLUSH_DRAW = "backdoor_flush_draw"
    OPEN_ENDED = "open_ended_straight_draw"
    GUTSHOT = "gutshot"
    OVERCARDS = "overcards"


class PairStrength(IntEnum):
    """Strength of a one-pair holding relative to the board, for grading how willing
    a player should be to continue.

    STRONG  = an overpair or top pair (any kicker).
    MEDIUM  = second or middle pair, or a pocket pair between the board's ranks.
    WEAK    = bottom pair, or an underpair below the whole board.
    NONE    = no one-pair holding of the hero's own (a board pair, a pair that
              does not play, two pair or better) or no board yet.
    """

    NONE = 0
    WEAK = 1
    MEDIUM = 2
    STRONG = 3


# treys rank class (1=straight flush .. 9=high card) -> our MadeTier.
# Quirk: treys returns class 0 for a royal flush (best score) — also a straight flush.
_TREYS_TO_TIER = {0: MadeTier.STRAIGHT_FLUSH, **{c: MadeTier(10 - c) for c in range(1, 10)}}


@dataclass(frozen=True)
class HandClass:
    made: MadeTier
    draws: frozenset[Draw] = field(default_factory=frozenset)
    label: str = ""
    # The strength the hole cards themselves contribute (see the module docstring).
    hole_tier: MadeTier = MadeTier.HIGH_CARD
    nut_flush_draw: bool = False
    board_plays: bool = False

    def has(self, draw: Draw) -> bool:
        return draw in self.draws

    @property
    def is_made_hand(self) -> bool:
        """At least a pair (the board's pairs included; see ``hole_tier``)."""
        return self.made >= MadeTier.PAIR


_WORD = ("two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "ace")
_PLURAL = ("twos", "threes", "fours", "fives", "sixes", "sevens", "eights", "nines", "tens",
           "jacks", "queens", "kings", "aces")
_BOARD_TIER = {
    MadeTier.PAIR: "pair",
    MadeTier.TWO_PAIR: "two pair",
    MadeTier.TRIPS: "trips",
    MadeTier.STRAIGHT: "straight",
    MadeTier.FLUSH: "flush",
    MadeTier.FULL_HOUSE: "full house",
    MadeTier.QUADS: "quads",
    MadeTier.STRAIGHT_FLUSH: "straight flush",
}
_OWN_TIER = {
    MadeTier.STRAIGHT: "straight",
    MadeTier.FULL_HOUSE: "full house",
    MadeTier.QUADS: "quads",
    MadeTier.STRAIGHT_FLUSH: "straight flush",
}
_DRAW_ORDER = (Draw.FLUSH_DRAW, Draw.OPEN_ENDED, Draw.GUTSHOT, Draw.OVERCARDS, Draw.BACKDOOR_FLUSH_DRAW)
_DRAW_LABEL = {
    Draw.FLUSH_DRAW: "flush draw",
    Draw.BACKDOOR_FLUSH_DRAW: "backdoor flush draw",
    Draw.OPEN_ENDED: "open-ended straight draw",
    Draw.GUTSHOT: "gutshot",
    Draw.OVERCARDS: "two overcards",
}
_TEN = RANK_INDEX["T"]
_KING = RANK_INDEX["K"]
_ACE = RANK_INDEX["A"]


@dataclass(frozen=True)
class _Read:
    made: MadeTier
    hole_tier: MadeTier
    own: tuple[int, ...]  # the rank indices of the hero's groups in the best five
    board_plays: bool


def _read(hole: list[str], board: list[str]) -> _Read:
    """Made tier, the hole's own part and whether the board plays (3-5 board cards)."""
    board_ints = [_INT(c) for c in board]
    score = _EVAL.evaluate(board_ints, [_INT(c) for c in hole])
    made = _TREYS_TO_TIER[_EVAL.get_rank_class(score)]
    board_plays = len(board) == 5 and _EVAL.evaluate(board_ints, []) == score
    if board_plays:
        return _Read(made, MadeTier.HIGH_CARD, (), True)

    hole_ranks = {RANK_INDEX[c[0]] for c in hole}
    counts = Counter(RANK_INDEX[c[0]] for c in hole + board)
    if made == MadeTier.QUADS:
        quad = next(r for r, n in counts.items() if n == 4)
        return _Read(made, MadeTier.QUADS, (quad,), False) if quad in hole_ranks else _Read(made, MadeTier.HIGH_CARD, (), False)
    if made >= MadeTier.STRAIGHT:
        # Every card of a straight, flush or full house is part of it, and the board
        # alone does not make it (or the board would play).
        return _Read(made, made, (), False)

    # Below a straight there is no flush, so rank counts fix the best five's groups.
    if made == MadeTier.TRIPS:
        playing = [r for r, n in counts.items() if n == 3]
    elif made == MadeTier.TWO_PAIR:
        playing = sorted((r for r, n in counts.items() if n == 2), reverse=True)[:2]
    elif made == MadeTier.PAIR:
        playing = [r for r, n in counts.items() if n == 2]
    else:
        playing = []
    own = tuple(r for r in playing if r in hole_ranks)
    if not own:
        tier = MadeTier.HIGH_CARD
    elif made == MadeTier.TRIPS:
        tier = MadeTier.TRIPS
    elif len(own) == 2:
        tier = MadeTier.TWO_PAIR
    else:
        tier = MadeTier.PAIR
    return _Read(made, tier, own, False)


def _pair_kind(hole_ranks: list[int], board_ranks: list[int], pair: int) -> str:
    """Where the hero's one pair sits: over / under / pocket (a pocket pair the
    board does not match), or top / second / middle / bottom (a hole card pairing
    a board card)."""
    distinct = sorted(set(board_ranks), reverse=True)
    if hole_ranks[0] == hole_ranks[1]:
        if pair > distinct[0]:
            return "over"
        if pair < distinct[-1]:
            return "under"
        return "pocket"
    idx = distinct.index(pair)
    if idx == 0:
        return "top"
    if idx == len(distinct) - 1 and len(distinct) >= 3:
        return "bottom"
    if idx == 1:
        return "second"
    return "middle"


def _made_label(hole: list[str], board: list[str], rd: _Read) -> str:
    hole_ranks = [RANK_INDEX[c[0]] for c in hole]
    board_ranks = [RANK_INDEX[c[0]] for c in board]
    high = max(hole_ranks)
    tier = rd.hole_tier
    if tier == MadeTier.HIGH_CARD:
        if rd.made == MadeTier.HIGH_CARD:
            return f"{_WORD[high]} high"
        return f"board {_BOARD_TIER[rd.made]}, {_WORD[high]} kicker"
    if tier == MadeTier.PAIR:
        pair = rd.own[0]
        kind = _pair_kind(hole_ranks, board_ranks, pair)
        if kind == "pocket":
            text = f"pocket {_PLURAL[pair]}"
        elif kind == "over":
            text = "overpair"
        elif kind == "under":
            text = "underpair"
        elif kind == "top":
            kicker = hole_ranks[1] if hole_ranks[0] == pair else hole_ranks[0]
            if kicker == _ACE or (kicker == _KING and pair == _ACE):
                text = "top pair, top kicker"
            elif kicker >= _TEN:
                text = "top pair, good kicker"
            else:
                text = "top pair, weak kicker"
        else:
            text = f"{kind} pair"
        if len(set(board_ranks)) < len(board_ranks):
            text += " on a paired board"
        return text
    if tier == MadeTier.TWO_PAIR:
        top_two = sorted(set(board_ranks), reverse=True)[:2]
        return "top two pair" if sorted(rd.own, reverse=True) == top_two else "two pair"
    if tier == MadeTier.TRIPS:
        return "set" if hole_ranks[0] == hole_ranks[1] else "trips"
    if tier == MadeTier.FLUSH:
        return "nut flush" if _holds_nut_flush(hole, board) else "flush"
    return _OWN_TIER[tier]


def _holds_nut_flush(hole: list[str], board: list[str]) -> bool:
    """The hole holds the highest rank of the flush suit that is not on the board."""
    suit = Counter(c[1] for c in hole + board).most_common(1)[0][0]
    on_board = {RANK_INDEX[c[0]] for c in board if c[1] == suit}
    missing = max(r for r in range(13) if r not in on_board)
    return any(c[1] == suit and RANK_INDEX[c[0]] == missing for c in hole)


def classify(hole: tuple[str, str] | list[str], board: Sequence[str] = ()) -> HandClass:
    """Classify a holding. ``board`` may be 0 (preflop), 3, 4, or 5 cards."""
    hole = list(hole)
    board = list(board)

    # Preflop: the labels are unchanged.
    if len(board) < 3:
        if hole[0][0] == hole[1][0]:
            return HandClass(MadeTier.PAIR, frozenset(), f"pocket {hole[0][0]}s", hole_tier=MadeTier.PAIR)
        return HandClass(MadeTier.HIGH_CARD, frozenset(), "high card")

    rd = _read(hole, board)
    ds = hole_draws(hole, board)
    draws: set[Draw] = set()
    if ds.flush:
        draws.add(Draw.FLUSH_DRAW)
    if ds.oesd:
        draws.add(Draw.OPEN_ENDED)
    if ds.gutshot:
        draws.add(Draw.GUTSHOT)
    if ds.overcards:
        draws.add(Draw.OVERCARDS)
    if ds.backdoor_flush:
        draws.add(Draw.BACKDOOR_FLUSH_DRAW)

    parts = [_made_label(hole, board, rd)]
    for d in _DRAW_ORDER:
        if d in draws:
            parts.append("nut flush draw" if d is Draw.FLUSH_DRAW and ds.nut_flush else _DRAW_LABEL[d])
    return HandClass(
        made=rd.made,
        draws=frozenset(draws),
        label=" + ".join(parts),
        hole_tier=rd.hole_tier,
        nut_flush_draw=ds.nut_flush,
        board_plays=rd.board_plays,
    )


_PAIR_STRENGTH = {
    "over": PairStrength.STRONG,
    "top": PairStrength.STRONG,
    "pocket": PairStrength.MEDIUM,
    "second": PairStrength.MEDIUM,
    "middle": PairStrength.MEDIUM,
    "under": PairStrength.WEAK,
    "bottom": PairStrength.WEAK,
}


def pair_strength(hole: tuple[str, str] | list[str], board: Sequence[str]) -> PairStrength:
    """Rank the hero's own one-pair holding relative to the board (for grading
    continue/fold). NONE unless the hole cards make exactly one pair that plays
    (``hole_tier`` PAIR): a board pair, a counterfeited pair and two pair or better
    all give NONE. Kicker is ignored: every top pair and overpair is STRONG."""
    hole = list(hole)
    board = list(board)
    if len(board) < 3:
        return PairStrength.NONE
    rd = _read(hole, board)
    if rd.hole_tier != MadeTier.PAIR:
        return PairStrength.NONE
    kind = _pair_kind([RANK_INDEX[c[0]] for c in hole], [RANK_INDEX[c[0]] for c in board], rd.own[0])
    return _PAIR_STRENGTH[kind]
