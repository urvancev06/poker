"""The v1 bots' classifier is frozen until the v2 bots replace them (phase 5).

Phase 2 rewrites ``poker.math.classify`` so labels and draws need a hole card.
The v1 bots (``bots/strategy.py``) and the scripts that tune v1 knobs read
``poker.math.classify_legacy`` instead, a verbatim copy of the classifier they
were measured with. This pin hashes its outputs over 20,000 seeded holdings
(preflop, flop, turn and river), so an edit that moves a single v1 label, tier or
draw fails here.

Pinned in P2.3 with the classifier as it stood before the rewrite. If this
fails, a change reached the v1 bots: find it, do not re-pin.
"""

from __future__ import annotations

import hashlib

from poker.math.classify_legacy import classify, pair_strength
from poker.rng import shuffled_deck, stream

LEGACY_CLASSIFY_SHA256 = "155c6cc4fbd7c4bc7421a0a024d7e440b6c292c18e01217c0b3af47a418eff28"
LEGACY_PAIR_STRENGTH_SHA256 = "8e7168c22076b842a7ecc790b7ff01f86869cae1fd1f71726a68887bf12ad594"

_BOARD_SIZES = (0, 3, 4, 5)


def _samples(n: int = 20_000):
    for i in range(n):
        deck = shuffled_deck(stream(0, "classify_pin", i))
        yield deck[:2], deck[2 : 2 + _BOARD_SIZES[i % 4]]


def _sha(obj) -> str:
    return hashlib.sha256(repr(obj).encode()).hexdigest()


def test_legacy_outputs_are_pinned():
    outs = []
    for hole, board in _samples():
        c = classify(hole, board)
        outs.append((c.made, sorted(c.draws), c.label))
    assert _sha(outs) == LEGACY_CLASSIFY_SHA256


def test_legacy_pair_strength_is_pinned():
    outs = [pair_strength(hole, board) for hole, board in _samples()]
    assert _sha(outs) == LEGACY_PAIR_STRENGTH_SHA256


def test_v1_bots_read_the_legacy_classifier():
    """``bots/strategy.py`` names the frozen functions, not the hole-aware ones."""
    from poker.bots import strategy
    from poker.math import classify_legacy

    assert strategy.classify is classify_legacy.classify
    assert strategy.pair_strength is classify_legacy.pair_strength
