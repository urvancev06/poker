"""Seeded RNG streams (poker.rng): every random draw in a session or a simulation
comes from its own stream, keyed by what it is for (the deck of hand h, decision k
of player p in hand h, ...), so one stream never shifts another and the global
``random`` module is never an input.
"""

import random

from poker.math.cards import FULL_DECK
from poker.rng import derive, new_seed, shuffled_deck, stream


def test_derive_is_pinned():
    # blake2b("0|deck|0", digest_size=8), read big-endian: a stable, documented key.
    assert derive(0, "deck", 0) == 0x76EA538A8025999C
    assert derive(7, "decision", 3, 2, 0) == 0x6EA1553D1C6F89C9


def test_streams_are_deterministic_and_separated():
    assert stream(7, "deck", 3).random() == stream(7, "deck", 3).random()
    assert stream(7, "deck", 3).random() != stream(7, "decision", 3).random()
    assert stream(7, "deck", 3).random() != stream(7, "deck", 4).random()
    assert stream(7, "decision", 1, 2).random() != stream(7, "decision", 12).random()


def test_shuffled_deck_is_a_pinned_permutation():
    d = shuffled_deck(stream(5, "deck", 0))
    assert sorted(d) == sorted(FULL_DECK) and len(set(d)) == 52
    assert d[:4] == ["5c", "Th", "8c", "3s"]


def test_shuffled_deck_does_not_touch_the_global_rng_or_the_full_deck():
    random.seed(99)
    expected = random.random()
    random.seed(99)
    shuffled_deck(stream(1, "deck", 0))
    assert random.random() == expected
    assert FULL_DECK[:3] == ["2s", "2h", "2d"]


def test_new_seed_is_a_63_bit_int():
    seeds = {new_seed() for _ in range(20)}
    assert len(seeds) == 20
    assert all(isinstance(s, int) and 0 <= s < 2**63 for s in seeds)
