"""The simulator deals and decides from seeded streams (poker.rng), never from
the global ``random`` state: hand h's deck is ``stream(seed, "deck", h)`` and
decision k of player p in hand h is ``stream(seed, "decision", h, p, k)``.
"""

import random

from poker.bots import Bot, archetypes
from poker.rng import shuffled_deck, stream
from poker.sim import play_hand, run
from poker.sim.runner import DEFAULT_LINEUP

_ARCHS = ["Nit", "TAG", "LAG", "Calling Station", "Maniac"]


def test_run_ignores_global_rng():
    random.seed(1)
    a = run(300, seed=4)
    random.seed(2)
    b = run(300, seed=4)
    assert [a.line(x) for x in _ARCHS] == [b.line(x) for x in _ARCHS]


def test_run_seed_matters():
    a = run(300, seed=4)
    b = run(300, seed=5)
    assert [a.line(x) for x in _ARCHS] != [b.line(x) for x in _ARCHS]


def test_run_deals_hand_h_from_its_deck_stream():
    seen = []

    def observer(name, ctx, action):
        seen.append((ctx.street, ctx.seat, ctx.hole))

    run(3, seed=9, observer=observer)
    # The first decision of each hand is UTG (seat 2) preflop; the deck of hand h
    # gives seat 2 its cards deck[2] and deck[8].
    firsts = [s for s in seen if s[0] == "preflop"]
    deck0 = shuffled_deck(stream(9, "deck", 0))
    assert firsts[0][1] == 2 and firsts[0][2] == (deck0[2], deck0[8])


def test_play_hand_with_decision_streams_is_reproducible():
    bots = [Bot(archetypes.make(n)) for n in DEFAULT_LINEUP]
    deck = shuffled_deck(stream(3, "deck", 0))
    rngs = lambda player, k: stream(3, "decision", 0, player, k)  # noqa: E731
    a = play_hand(bots, 0, rngs, deck=deck)
    random.seed(77)
    b = play_hand(bots, 0, rngs, deck=deck)
    assert a == b
    assert sum(s.net for s in a) == 0
