"""A fingerprint of the v1 bots' behaviour.

The v1 archetypes stay the table's opponents until the v2 bots replace them,
and the shared code under them keeps changing (the classifier, the equity
maths, the engine's bookkeeping). ``v1_fingerprint`` hashes exactly what the
bots did over a fixed seeded run of the default lineup, so any change that
moves a single v1 decision, deal or amount changes the hash.
``tests/test_v1_frozen.py`` pins it.
"""

from __future__ import annotations

import hashlib
import json

from ..engine import Hand
from .runner import DEFAULT_LINEUP, iter_hands, shard_spec


def v1_fingerprint(hands: int = 300, seed: int = 0) -> str:
    """sha256[:16] over each hand's dealt holes, final board and the sequence
    of ``(seat, action, to_amount)``, for the default lineup at 5/10, 100bb."""
    digest = hashlib.sha256()

    def record(hand: Hand, seat_to_player: list[int]) -> None:
        snap = hand.snapshot(reveal_all=True)
        line = [
            hand.dealt_holes(),
            snap.board,
            [(e.seat, e.action, e.to_amount) for e in snap.history],
        ]
        digest.update(json.dumps(line, separators=(",", ":")).encode())

    for _ in iter_hands(shard_spec(DEFAULT_LINEUP, seed), 0, hands, on_end=record):
        pass
    return digest.hexdigest()[:16]
