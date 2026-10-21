"""The deciding player's private view of its hand (P3.5).

``h[j]`` is the hand's strength against opponent ``j``'s population range: the TAG
type mean's likelihood of j's public preflop line, with card removal (D23); bots
never use a seat's real type. ``s_all = Π h_j``, and on the flop and turn the
clean-draw term lifts it: ``s = s_all + (1 − s_all)·p_hit·clean``.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence

from ..math.board import board_cache
from ..math.cards import RANK_INDEX, RANKS
from ..math.classify import classify
from ..math.draws import NO_DRAWS, DrawSet
from ..math.suits import class_of
from . import constants as K
from .dials import type_mean
from .preflop import line_digest, range_array
from .spot import Spot
from .types import Private


def p_hit(draws: DrawSet, street: str) -> float:
    """The chance of hitting one of ``draws.outs`` by the river."""
    outs = draws.outs
    if street == "flop":
        return 1 - (1 - outs / 47) * (1 - outs / 46)
    if street == "turn":
        return outs / 46
    return 0.0


def clean_factor(draws: DrawSet, board: Sequence[str]) -> float:
    """How often a hit wins: 1.0 for a nut flush draw, .85 any other flush draw,
    .9 an open-ender on an unpaired board that is not two-tone, .75 any other
    straight draw, .7 a gutshot; x .75 on a paired board. 0 without a flush or
    straight draw (overcards and backdoors are not clean)."""
    ranks = [c[0] for c in board]
    paired = len(set(ranks)) < len(ranks)
    two_tone = max(Counter(c[1] for c in board).values()) >= 2 if board else False
    if draws.nut_flush:
        c = K.CLEAN["nut_flush"]
    elif draws.flush:
        c = K.CLEAN["flush"]
    elif draws.oesd:
        c = K.CLEAN["oesd_clean"] if not paired and not two_tone else K.CLEAN["straight"]
    elif draws.gutshot:
        c = K.CLEAN["gutshot"]
    else:
        return 0.0
    return c * K.PAIRED_CLEAN if paired else c


def draw_term(draws: DrawSet, street: str, board: Sequence[str]) -> float:
    """``p_hit·clean`` on the flop and turn, else 0."""
    if street not in ("flop", "turn"):
        return 0.0
    return p_hit(draws, street) * clean_factor(draws, board)


def _blockers(hole: tuple[str, str], board: Sequence[str]) -> frozenset[str]:
    """``"nut_flush"`` when the hole holds the best missing card of a suit with
    three or more on the board; ``"top_pair"`` when it holds the board's top rank."""
    out = set()
    suits = Counter(c[1] for c in board)
    on_board = set(board)
    for suit, n in suits.items():
        if n < 3:
            continue
        for r in reversed(RANKS):
            card = r + suit
            if card in on_board:
                continue
            if card in hole:
                out.add("nut_flush")
            break
    top = max(RANK_INDEX[c[0]] for c in board)
    if any(RANK_INDEX[c[0]] == top for c in hole):
        out.add("top_pair")
    return frozenset(out)


def build_private(spot: Spot, hole: tuple[str, str]) -> Private:
    hole = (hole[0], hole[1])
    cls = class_of(hole)
    board = list(spot.board)
    if not board:
        return Private(hole, cls, 0.0, {}, 0.0, 0.0, NO_DRAWS, False, classify(hole, ()), 1.0, frozenset())
    bc = board_cache(board)
    tag = type_mean("tag")
    digest = line_digest(spot)
    h = {
        j: bc.h(hole, range_array(tag, spot, j, board), key=f"pre:{j}:{digest}")
        for j in spot.opponents
    }
    s_all = 1.0
    for v in h.values():
        s_all *= v
    draws = bc.draws(hole)
    s = s_all + (1 - s_all) * draw_term(draws, spot.street, board)
    return Private(
        hole=hole,
        cls=cls,
        hs=bc.hs(hole),
        h=h,
        s_all=s_all,
        s=s,
        draws=draws,
        nuts=bc.is_nuts(hole),
        hand=classify(hole, board),
        bluff_q=bc.bluff_quantile(hole),
        blockers=_blockers(hole, board),
    )
