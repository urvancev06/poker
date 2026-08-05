"""Smoke test: PokerKit imports, and a trivial 6-max NLHE *cash* state can be
created and is ready for action. A scratch runner, not the engine wrapper
(that's poker/engine).

    backend/.venv/bin/python backend/scripts/pokerkit_smoke.py
"""

from pokerkit import Automation, Mode, NoLimitTexasHoldem

# Chips are integers (cents / smallest unit) to avoid float rounding bugs.
# 1/2 blinds, 100bb stacks => SB=1, BB=2, min_bet=2, stack=200, six seats.
SMALL_BLIND = 1
BIG_BLIND = 2
STARTING_STACK = 200
PLAYER_COUNT = 6

# Automate the mechanical steps so the state walks straight to the first
# decision (UTG preflop). Betting actions are never automated.
AUTOMATIONS = (
    Automation.ANTE_POSTING,
    Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING,
    Automation.CARD_BURNING,
    Automation.HOLE_DEALING,
    Automation.BOARD_DEALING,
    Automation.HOLE_CARDS_SHOWING_OR_MUCKING,
    Automation.HAND_KILLING,
    Automation.CHIPS_PUSHING,
    Automation.CHIPS_PULLING,
    Automation.RUNOUT_COUNT_SELECTION,
)


def build_state():
    """Create a fresh 6-max NLHE cash hand, dealt and ready for the first action."""
    return NoLimitTexasHoldem.create_state(
        AUTOMATIONS,
        False,                       # ante_trimming_status (no antes here)
        0,                           # antes
        (SMALL_BLIND, BIG_BLIND),    # blinds: SB then BB
        BIG_BLIND,                   # min_bet
        STARTING_STACK,              # starting stacks (same for all seats)
        PLAYER_COUNT,
        mode=Mode.CASH_GAME,
    )


def main():
    state = build_state()
    print("PokerKit 6-max NLHE cash state created.\n")
    print(f"Players:          {PLAYER_COUNT}")
    print(f"Blinds:           {SMALL_BLIND}/{BIG_BLIND}  (min bet {BIG_BLIND})")
    print(f"Starting stacks:  {STARTING_STACK}  ({STARTING_STACK // BIG_BLIND}bb)")
    print(f"Stacks now:       {list(state.stacks)}")
    print(f"Bets now:         {list(state.bets)}")
    print(f"Hole cards dealt: {[''.join(repr(c) for c in h) for h in state.hole_cards]}")
    print(f"To act (seat):    {state.actor_index}")
    print(f"Can check/call:   {state.can_check_or_call()}")
    print(f"Can fold:         {state.can_fold()}")
    print(f"Can raise:        {state.can_complete_bet_or_raise_to()}")

    # Total chips on the table must equal what everyone sat down with.
    total = sum(state.stacks) + sum(state.bets)
    expected = STARTING_STACK * PLAYER_COUNT
    print(f"\nChip conservation: {total} == {expected}  ->  {total == expected}")
    assert total == expected, "chips not conserved at deal!"


if __name__ == "__main__":
    main()
