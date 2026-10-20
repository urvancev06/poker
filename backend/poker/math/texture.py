"""Board texture, computed once per street.

* ``suits``: the most cards of one suit on the board. 1 is ``"rainbow"``, 2
  ``"two_tone"``, 3 ``"monotone"`` (three of a suit, so two hole cards make a
  flush; on the turn and river this is a three-flush, not a one-suit board) and
  4 or more ``"four_flush"``.
* ``paired``: two board cards share a rank.
* ``connectivity``: the most board ranks inside any five-rank window, the A-5
  wheel counted. Three or more means two hole cards can make a straight.
* ``high``: the top board rank as ``"A"``, ``"K"``, ``"Q"``, ``"mid"`` (T or J)
  or ``"low"`` (9 or below).
* ``wetness``: ``"wet"`` when monotone, four-flush, or two-tone with
  connectivity ≥ 3; ``"semi"`` when two-tone or connectivity ≥ 3; else ``"dry"``.

``scare_flags(prev_board, board)`` names what the new card(s) brought:
``"flush"`` (a suit reached three or more on the board), ``"straight"`` (the
board's connectivity rose to three or more) and ``"overcard"`` (a card above
every earlier board card).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Literal, Sequence

from .cards import RANK_INDEX
from .draws import max_window

Suits = Literal["rainbow", "two_tone", "monotone", "four_flush"]
High = Literal["A", "K", "Q", "mid", "low"]
Wetness = Literal["dry", "semi", "wet"]

_SUITS: dict[int, Suits] = {1: "rainbow", 2: "two_tone", 3: "monotone"}


@dataclass(frozen=True, slots=True)
class Texture:
    suits: Suits
    paired: bool
    connectivity: int
    high: High
    wetness: Wetness


def _mask(cards: Sequence[str]) -> int:
    m = 0
    for c in cards:
        m |= 1 << RANK_INDEX[c[0]]
    return m


def _high(top: int) -> High:
    if top == 12:
        return "A"
    if top == 11:
        return "K"
    if top == 10:
        return "Q"
    if top >= 8:
        return "mid"
    return "low"


def texture(board: Sequence[str]) -> Texture:
    """The texture of a flop, turn or river board."""
    if not 3 <= len(board) <= 5:
        raise ValueError(f"texture needs 3-5 board cards, got {len(board)}")
    most = max(Counter(c[1] for c in board).values())
    suits: Suits = _SUITS.get(most, "four_flush")
    ranks = [RANK_INDEX[c[0]] for c in board]
    paired = len(set(ranks)) < len(ranks)
    connectivity = max_window(_mask(board))
    if suits in ("monotone", "four_flush") or (suits == "two_tone" and connectivity >= 3):
        wetness: Wetness = "wet"
    elif suits == "two_tone" or connectivity >= 3:
        wetness = "semi"
    else:
        wetness = "dry"
    return Texture(suits, paired, connectivity, _high(max(ranks)), wetness)


def scare_flags(prev_board: Sequence[str], board: Sequence[str]) -> frozenset[str]:
    """What the cards ``board`` adds to ``prev_board`` (a prefix of it) bring:
    ``"flush"``, ``"straight"`` and/or ``"overcard"``. Empty from no board."""
    prev, board = list(prev_board), list(board)
    if board[: len(prev)] != prev:
        raise ValueError("prev_board must be a prefix of board")
    new = board[len(prev):]
    if len(prev) < 3 or not new:
        return frozenset()
    flags: set[str] = set()
    suit_count = Counter(c[1] for c in board)
    if any(suit_count[c[1]] >= 3 for c in new):
        flags.add("flush")
    conn = max_window(_mask(board))
    if conn >= 3 and conn > max_window(_mask(prev)):
        flags.add("straight")
    top_prev = max(RANK_INDEX[c[0]] for c in prev)
    if any(RANK_INDEX[c[0]] > top_prev for c in new):
        flags.add("overcard")
    return frozenset(flags)
