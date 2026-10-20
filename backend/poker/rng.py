"""Seeded random streams.

Every random draw the app makes comes from its own stream, keyed by what the
draw is for. One stream can never shift another, so:

* a seeded session replays exactly for the same hero actions;
* a different hero line leaves later deals unchanged (the deck of hand ``h``
  depends only on the seed and ``h``);
* a Lab run is reproducible while someone plays at a table in the same process
  (nothing reads Python's global ``random`` state).

Labels in use (the keys after the label identify one stream):

=============  ========================================  =======================
label          keys                                      draws
=============  ========================================  =======================
``deck``       hand index                                the shuffle of one hand
``decision``   hand index, player, decision number       one bot decision
``table``      hand index                                table events (phase 4)
``persona``    player                                    persona jitter (phase 3)
``seating``    (none)                                    seat order (phase 3)
``equity``     decision key                              sampled equity (phase 2)
=============  ========================================  =======================

``derive`` is blake2b over ``"seed|label|key1|key2..."`` with an 8-byte digest,
read big-endian. Its outputs are pinned by ``tests/test_rng.py``: changing the
derivation changes every seeded deal and decision.
"""

from __future__ import annotations

import hashlib
import random
import secrets

from .math.cards import FULL_DECK


def derive(seed: int, label: str, *keys: int | str) -> int:
    """A 64-bit integer that depends only on ``seed``, ``label`` and ``keys``."""
    text = "|".join([str(seed), label, *map(str, keys)])
    digest = hashlib.blake2b(text.encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def stream(seed: int, label: str, *keys: int | str) -> random.Random:
    """A private ``random.Random`` for one purpose (see the module docstring)."""
    return random.Random(derive(seed, label, *keys))


def shuffled_deck(rng: random.Random) -> list[str]:
    """A shuffled copy of the 52-card deck, drawn from ``rng`` only."""
    deck = list(FULL_DECK)
    rng.shuffle(deck)
    return deck


def new_seed() -> int:
    """A fresh 63-bit session seed from the OS. It reveals every future deck, so
    it is kept server-side and never sent to the client."""
    return secrets.randbits(63)
