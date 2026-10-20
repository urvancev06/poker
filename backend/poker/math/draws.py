"""Hole-aware draws: a draw needs a hole card to take part.

The audit found the old classifier calling four hearts on the board a "flush
draw" for a hand with no heart (A♣Q♦ on 2♥5♥9♥K♥), and counting the board's own
straight outs as the hero's. Here:

* **Flush draw** (flop and turn): a suit with exactly four cards among hole and
  board, at least one of them a hole card, and no flush yet. It is the **nut**
  flush draw when the hole holds the highest rank of that suit not on the board.
* **Straight outs** (flop and turn): a rank counts when hole + board + that rank
  makes a higher straight than board + that rank alone (0 when the board makes
  none). Two or more out ranks is an open-ender (a double gutshot included), one
  is a gutshot. A hand that already has a straight or better has none.
* **Overcards** (flop only): no own pair, and both hole ranks above the board's
  top rank.
* **Backdoor flush** (flop only): exactly three of a suit, at least one in the
  hole.
* **Backdoor straight** (flop only), when there is no straight draw: some
  five-rank window (the A-5 wheel included) holds exactly three of the ranks in
  hole + board, at least one of them a hole rank.
* **Outs** (a rule of thumb): flush 9, open-ender 8, gutshot 4; a flush draw with
  an open-ender 15, with a gutshot 12; overcards add 6.

Everything works on 13-bit rank masks (bit ``r`` is rank index ``r``, 2 = 0 ..
A = 12), with no evaluator inside: a flop's 1,176 holdings cost a few ms.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .cards import FULL_DECK, RANK_INDEX, SUITS

# Per card: rank index (2 = 0 .. A = 12) and suit index (s, h, d, c).
_R = {c: RANK_INDEX[c[0]] for c in FULL_DECK}
_S = {c: SUITS.index(c[1]) for c in FULL_DECK}

_ACE = 1 << 12


def extended(mask: int) -> int:
    """A rank mask shifted up one bit, with bit 0 set for an ace playing low:
    bit 0 = A (low), bit 1 = 2, ..., bit 13 = A."""
    return (mask << 1) | (1 if mask & _ACE else 0)


# The ten five-rank straight windows on the extended mask: A-5 (bits 0-4) .. T-A (bits 9-13).
WINDOWS = tuple(0b11111 << lo for lo in range(10))


def _straight_top(mask: int) -> int:
    ext = extended(mask)
    for lo in range(9, -1, -1):
        if ext & WINDOWS[lo] == WINDOWS[lo]:
            return lo + 4  # the top card on the extended scale: 4 = the wheel's five .. 13 = ace
    return 0


# STRAIGHT_TOP[mask] is the best straight in a rank mask (0 when there is none).
STRAIGHT_TOP = tuple(_straight_top(m) for m in range(1 << 13))


def max_window(mask: int) -> int:
    """The most ranks of ``mask`` inside any five-rank window, the wheel counted."""
    ext = extended(mask)
    return max((ext & w).bit_count() for w in WINDOWS)


@dataclass(frozen=True, slots=True)
class DrawSet:
    flush: bool = False
    nut_flush: bool = False
    oesd: bool = False
    gutshot: bool = False
    overcards: bool = False
    backdoor_flush: bool = False
    backdoor_straight: bool = False
    outs: int = 0

    @property
    def any(self) -> bool:
        """A flush or straight draw, overcards, or a backdoor."""
        return (
            self.flush or self.oesd or self.gutshot or self.overcards
            or self.backdoor_flush or self.backdoor_straight
        )


NO_DRAWS = DrawSet()


def hole_draws(hole: Sequence[str], board: Sequence[str]) -> DrawSet:
    """The draws ``hole`` has on ``board`` (see the module docstring). Preflop and
    on the river there are none."""
    n = len(board)
    if n != 3 and n != 4:
        return NO_DRAWS
    h1, h2 = hole
    r1, r2 = _R[h1], _R[h2]
    s1, s2 = _S[h1], _S[h2]

    board_mask = 0
    suit_count = [0, 0, 0, 0]
    suit_mask = [0, 0, 0, 0]  # board ranks per suit
    rank_count = [0] * 13
    for c in board:
        r = _R[c]
        s = _S[c]
        board_mask |= 1 << r
        suit_count[s] += 1
        suit_mask[s] |= 1 << r
        rank_count[r] += 1
    all_mask = board_mask | (1 << r1) | (1 << r2)
    rank_count[r1] += 1
    rank_count[r2] += 1
    total = suit_count[:]
    total[s1] += 1
    total[s2] += 1

    made_flush = max(total) >= 5
    top_two = sorted(rank_count, reverse=True)[:2]
    full_or_quads = top_two[0] >= 4 or (top_two[0] >= 3 and top_two[1] >= 2)
    made_straight = STRAIGHT_TOP[all_mask] > 0

    flush = nut = False
    if not (made_flush or full_or_quads):
        for s in (s1,) if s1 == s2 else (s1, s2):
            if total[s] == 4:
                flush = True
                missing = 12
                while suit_mask[s] & (1 << missing):
                    missing -= 1
                nut = (s1 == s and r1 == missing) or (s2 == s and r2 == missing)

    oesd = gutshot = False
    if not (made_straight or made_flush or full_or_quads):
        out_ranks = 0
        for r in range(13):
            bit = 1 << r
            if all_mask & bit:
                continue
            top = STRAIGHT_TOP[all_mask | bit]
            if top and top > STRAIGHT_TOP[board_mask | bit]:
                out_ranks += 1
        oesd = out_ranks >= 2
        gutshot = out_ranks == 1

    overcards = backdoor_flush = backdoor_straight = False
    if n == 3:
        top_board = board_mask.bit_length() - 1
        overcards = r1 != r2 and min(r1, r2) > top_board and not (made_straight or made_flush)
        backdoor_flush = total[s1] == 3 or total[s2] == 3
        if not (oesd or gutshot or made_straight or made_flush or full_or_quads):
            ext_all = extended(all_mask)
            ext_hole = extended((1 << r1) | (1 << r2))
            for w in WINDOWS:
                if ext_hole & w and (ext_all & w).bit_count() == 3:
                    backdoor_straight = True
                    break

    if flush and oesd:
        outs = 15
    elif flush and gutshot:
        outs = 12
    elif flush:
        outs = 9
    elif oesd:
        outs = 8
    elif gutshot:
        outs = 4
    else:
        outs = 0
    if overcards:
        outs += 6

    if not (flush or oesd or gutshot or overcards or backdoor_flush or backdoor_straight):
        return NO_DRAWS
    return DrawSet(flush, nut, oesd, gutshot, overcards, backdoor_flush, backdoor_straight, outs)
