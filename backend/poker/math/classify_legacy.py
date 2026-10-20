"""FROZEN for v1 bots until phase 5; do not edit.

A verbatim copy of ``poker.math.classify`` as the v1 bots were measured with it
(before the phase-2 hole-aware rewrite). ``bots/strategy.py`` and the scripts
that tune v1 knobs (``scripts/tune_calldown.py``, ``scripts/measure_overfold.py``)
import ``classify`` and ``pair_strength`` from here, so the v1 gate
(``validation/phase3_gate.txt``) and the v1 pin (``tests/test_v1_frozen.py``) stay
meaningful. ``tests/test_classify_legacy.py`` pins its outputs. The enums and
``HandClass`` are shared with the new classifier and gain no members; this copy
fills only ``made``, ``draws`` and ``label`` (the new fields keep their defaults).

Original docstring:

Hand-strength classifier: made-hand tier + draw detection.

The made-hand tier comes from treys (so it's the same evaluator the equity engine
trusts); draws (flush draws, open-enders, gutshots, overcards, backdoors) are
detected here because treys only scores made hands. This feeds both the bots'
postflop logic and the coach's "what do I have" read.
"""

from __future__ import annotations

from treys import Card, Evaluator

from .cards import RANK_INDEX, suit_of
from .classify import Draw, HandClass, MadeTier, PairStrength

__all__ = ["classify", "pair_strength", "Draw", "HandClass", "MadeTier", "PairStrength"]

_EVAL = Evaluator()
_INT = Card.new


# treys rank class (1=straight flush .. 9=high card) -> our MadeTier.
# Quirk: treys returns class 0 for a royal flush (best score) — also a straight flush.
_TREYS_TO_TIER = {0: MadeTier.STRAIGHT_FLUSH, **{c: MadeTier(10 - c) for c in range(1, 10)}}


def _rank_values(cards: list[str]) -> set[int]:
    """Distinct rank values (2..14, A=14), adding 1 for the wheel when an ace is
    present, for straight detection."""
    vals = {RANK_INDEX[c[0]] + 2 for c in cards}  # RANK_INDEX 0..12 -> 2..14
    if 14 in vals:
        vals.add(1)
    return vals


def _has_straight(vals: set[int]) -> bool:
    return any(all(v + k in vals for k in range(5)) for v in range(1, 11))


def _straight_outs(vals: set[int]) -> int:
    """Number of distinct RANKS that would complete a straight.

    A rank count, not a card count: an open-ended draw gives 2, a gutshot 1. These
    are the thresholds `classify` compares against."""
    out_ranks: set[int] = set()
    for v in range(1, 15):
        if v in vals:
            continue
        test = vals | {v}
        if v == 1:
            test.add(1)
        if _has_straight(test):
            out_ranks.add(14 if v == 1 else v)  # ace dedupe
    return len(out_ranks)


def classify(hole: tuple[str, str] | list[str], board: list[str] | tuple[str, ...] = ()) -> HandClass:
    """Classify a holding. ``board`` may be 0 (preflop), 3, 4, or 5 cards."""
    hole = list(hole)
    board = list(board)
    cards = hole + board

    # Preflop / too few cards to evaluate a 5-card hand.
    if len(cards) < 5:
        if hole[0][0] == hole[1][0]:
            return HandClass(MadeTier.PAIR, frozenset(), f"pocket {hole[0][0]}s")
        return HandClass(MadeTier.HIGH_CARD, frozenset(), "high card")

    score = _EVAL.evaluate([_INT(c) for c in board], [_INT(c) for c in hole])
    made = _TREYS_TO_TIER[_EVAL.get_rank_class(score)]

    draws: set[Draw] = set()
    on_flop_or_turn = len(board) in (3, 4)
    if on_flop_or_turn:
        # Flush draws (only meaningful if we don't already have a flush).
        if made < MadeTier.FLUSH:
            suit_counts: dict[str, int] = {}
            for c in cards:
                suit_counts[suit_of(c)] = suit_counts.get(suit_of(c), 0) + 1
            top = max(suit_counts.values())
            if top == 4:
                draws.add(Draw.FLUSH_DRAW)
            elif top == 3 and len(board) == 3:
                draws.add(Draw.BACKDOOR_FLUSH_DRAW)

        # Straight draws (only if we don't already have a straight).
        if made < MadeTier.STRAIGHT:
            outs = _straight_outs(_rank_values(cards))
            if outs >= 2:
                draws.add(Draw.OPEN_ENDED)
            elif outs == 1:
                draws.add(Draw.GUTSHOT)

        # Overcards: nothing made, both hole cards beat the board.
        if made == MadeTier.HIGH_CARD:
            top_board = max(RANK_INDEX[c[0]] for c in board)
            if all(RANK_INDEX[c[0]] > top_board for c in hole):
                draws.add(Draw.OVERCARDS)

    label = _label(made, draws)
    return HandClass(made=made, draws=frozenset(draws), label=label)


_TIER_LABEL = {
    MadeTier.HIGH_CARD: "high card",
    MadeTier.PAIR: "a pair",
    MadeTier.TWO_PAIR: "two pair",
    MadeTier.TRIPS: "three of a kind",
    MadeTier.STRAIGHT: "a straight",
    MadeTier.FLUSH: "a flush",
    MadeTier.FULL_HOUSE: "a full house",
    MadeTier.QUADS: "four of a kind",
    MadeTier.STRAIGHT_FLUSH: "a straight flush",
}
_DRAW_LABEL = {
    Draw.FLUSH_DRAW: "flush draw",
    Draw.BACKDOOR_FLUSH_DRAW: "backdoor flush draw",
    Draw.OPEN_ENDED: "open-ended straight draw",
    Draw.GUTSHOT: "gutshot",
    Draw.OVERCARDS: "two overcards",
}


def _label(made: MadeTier, draws: set[Draw]) -> str:
    parts = [_TIER_LABEL[made]]
    # show stronger draws first
    order = [Draw.FLUSH_DRAW, Draw.OPEN_ENDED, Draw.GUTSHOT, Draw.OVERCARDS, Draw.BACKDOOR_FLUSH_DRAW]
    extra = [_DRAW_LABEL[d] for d in order if d in draws]
    if made == MadeTier.HIGH_CARD and extra:
        parts = []  # "two overcards + flush draw" reads better without "high card"
    return " + ".join(parts + extra)


def pair_strength(hole: tuple[str, str] | list[str], board: list[str] | tuple[str, ...]) -> PairStrength:
    """Rank a one-pair holding relative to the board (for grading continue/fold).

    STRONG  = an overpair (pocket pair above the top board card) or top pair (a
              hole card pairs the highest board card).
    MEDIUM  = second/middle pair, or a pocket pair sitting between board cards.
    WEAK    = bottom pair, or an underpair below the whole board.
    NONE    = the pair isn't the hero's own (a board pair the hero doesn't add to)
              or there's no board yet.

    Kicker is deliberately ignored: every top pair and overpair grades STRONG
    regardless of kicker, and how often a bot actually continues with one is set by
    ``strong_pair_defend`` in its profile rather than here.
    """
    hole = list(hole)
    board = list(board)
    if len(board) < 3:
        return PairStrength.NONE
    hole_ranks = [RANK_INDEX[c[0]] for c in hole]
    board_ranks = sorted({RANK_INDEX[c[0]] for c in board}, reverse=True)
    top_board = board_ranks[0]

    if hole_ranks[0] == hole_ranks[1]:  # pocket pair
        pr = hole_ranks[0]
        if pr > top_board:
            return PairStrength.STRONG          # overpair
        if pr < board_ranks[-1]:
            return PairStrength.WEAK            # underpair to the whole board
        return PairStrength.MEDIUM             # pocket between board cards

    matched = [r for r in board_ranks if r in hole_ranks]
    if not matched:
        return PairStrength.NONE               # pair is on the board, not ours
    top_matched = max(matched)
    if top_matched == top_board:
        return PairStrength.STRONG             # top pair (kicker ignored, see above)
    if len(board_ranks) > 1 and top_matched == board_ranks[1]:
        return PairStrength.MEDIUM             # second pair
    return PairStrength.WEAK                    # third pair or lower
