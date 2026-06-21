"""Phase 0 smoke tests: the toolchain works end to end.

These are deliberately trivial. Real correctness tests (known equities, side
pots, chip conservation) arrive with the engine and math in Phases 1-2.
"""

from poker import __version__


def test_package_imports():
    """The `poker` package is installed and importable."""
    assert __version__ == "0.1.0"


def test_pokerkit_creates_nlhe_cash_state():
    """PokerKit builds a 6-max NLHE cash hand and conserves chips at the deal."""
    from scripts.pokerkit_smoke import (
        BIG_BLIND,
        PLAYER_COUNT,
        STARTING_STACK,
        build_state,
    )

    state = build_state()

    # Hole cards dealt to all six seats.
    assert len(state.hole_cards) == PLAYER_COUNT
    assert all(len(hand) == 2 for hand in state.hole_cards)

    # Someone is to act preflop (UTG, after the blinds).
    assert state.actor_index is not None

    # Chips on the table == chips everyone sat down with.
    total = sum(state.stacks) + sum(state.bets)
    assert total == STARTING_STACK * PLAYER_COUNT

    # Blinds were posted: exactly the SB and BB are in the pot.
    assert sorted(state.bets) == [0, 0, 0, 0, 1, BIG_BLIND]
