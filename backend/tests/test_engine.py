"""Phase 1 engine tests (PROJECT.md Definition of Done):

- hand-ranking sanity on known showdowns,
- a multi-all-in side pot distributes correctly,
- legal-action generation is correct in tricky spots,
- random hands complete and conserve chips.

We use ``manual_deal=True`` to construct deterministic showdowns: deal exact hole
cards + board, then assert the payouts PokerKit produces.
"""

import random

import pytest

from poker.engine import Action, ActionType, Hand, IllegalAction


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def run_allin_showdown(holes, board, stacks, blinds=(1, 2)):
    """All players go all-in preflop, then run out ``board`` (a 5-card string
    like ``"9h8h7c2dKh"``). Returns the per-seat net result. Stacks must be equal
    so that the simple shove/call driver doesn't trigger a re-raise."""
    n = len(holes)
    hand = Hand.new(table_size=n, blinds=blinds, starting_stacks=stacks, manual_deal=True)
    for hc in holes:
        hand.deal_hole(hc)

    while not hand.is_over and hand.actor is not None and hand.street.value == "preflop":
        legal = hand.legal_actions()
        if legal.can_aggress:
            kind = ActionType.BET if legal.can_bet else ActionType.RAISE
            hand.apply(Action(kind, legal.max_raise_to))
        else:
            hand.apply(Action(ActionType.CALL))

    if not hand.is_over:  # everyone all-in preflop -> deal the runout
        hand.deal_board(board[0:6])  # flop
        hand.deal_board(board[6:8])  # turn
        hand.deal_board(board[8:10])  # river

    assert hand.is_over
    results = hand.results()
    assert sum(results) == 0  # zero-sum, chips conserved
    return results


# --------------------------------------------------------------------------- #
# hand-ranking sanity (known showdowns)
# --------------------------------------------------------------------------- #
def test_flush_beats_straight():
    # seat0: Ah Qh -> nut flush; seat1: Tc 6c -> 6-7-8-9-T straight on the board.
    res = run_allin_showdown(
        holes=["AhQh", "Tc6c"], board="9h8h7c2dKh", stacks=(100, 100)
    )
    assert res[0] == 100 and res[1] == -100


def test_full_house_beats_flush():
    # seat0: Ah Qh -> heart flush; seat1: Kc 7d -> kings full of sevens.
    res = run_allin_showdown(
        holes=["AhQh", "Kc7d"], board="KhKd3h7h2c", stacks=(100, 100)
    )
    assert res[1] == 100 and res[0] == -100


def test_higher_pair_wins():
    # Aces vs kings on a blank board.
    res = run_allin_showdown(
        holes=["AsAd", "KsKd"], board="2c7d9hJs4c", stacks=(100, 100)
    )
    assert res[0] == 100 and res[1] == -100


def test_split_pot_when_board_plays():
    # Royal flush on the board: both players play it -> tie -> chips returned.
    res = run_allin_showdown(
        holes=["2c3c", "4d5d"], board="AhKhQhJhTh", stacks=(100, 100)
    )
    assert res == [0, 0]


# --------------------------------------------------------------------------- #
# side pots
# --------------------------------------------------------------------------- #
def test_three_way_side_pot_distribution():
    # Stacks 50/100/200. seat0 trips aces (wins main), seat1 pair kings (wins
    # the side pot vs seat2's junk), seat2's uncalled 100 comes back.
    hand = Hand.new(
        table_size=3, blinds=(1, 2), starting_stacks=(50, 100, 200), manual_deal=True
    )
    hand.deal_hole("AhAs")  # seat0
    hand.deal_hole("KhKs")  # seat1
    hand.deal_hole("2c3d")  # seat2 (big stack, junk)

    hand.apply(Action(ActionType.BET, 200))  # seat2 (acts first 3-handed) shoves
    hand.apply(Action(ActionType.CALL))      # seat0 all-in for 50
    hand.apply(Action(ActionType.CALL))      # seat1 all-in for 100

    hand.deal_board("Ad7c9h")  # flop
    hand.deal_board("Js")      # turn
    hand.deal_board("4c")      # river

    assert hand.is_over
    # seat0: -50 +150 = +100 ; seat1: -100 +100 = 0 ; seat2: -100 (loses side, gets uncalled back) = -100
    assert hand.results() == [100, 0, -100]
    final_stacks = [s.stack for s in hand.snapshot(reveal_all=True).seats]
    assert final_stacks == [150, 100, 100]
    assert sum(final_stacks) == 350  # conserved


def test_side_pot_structure_in_snapshot():
    # Before the river is dealt, the snapshot should expose two pots: a main pot
    # eligible to all three, and a side pot eligible to the two deeper stacks.
    hand = Hand.new(
        table_size=3, blinds=(1, 2), starting_stacks=(50, 100, 200), manual_deal=True
    )
    hand.deal_hole("AhAs")
    hand.deal_hole("KhKs")
    hand.deal_hole("2c3d")
    hand.apply(Action(ActionType.BET, 200))
    hand.apply(Action(ActionType.CALL))
    hand.apply(Action(ActionType.CALL))
    hand.deal_board("Ad7c9h")  # bets collected into pots at street end

    pots = hand.snapshot().pots
    amounts = sorted(p.amount for p in pots)
    assert amounts == [100, 150]  # side pot 100, main pot 150
    main = next(p for p in pots if p.amount == 150)
    side = next(p for p in pots if p.amount == 100)
    assert set(main.eligible_seats) == {0, 1, 2}
    assert set(side.eligible_seats) == {1, 2}


# --------------------------------------------------------------------------- #
# legal-action generation (tricky spots)
# --------------------------------------------------------------------------- #
def test_legal_actions_preflop_utg():
    hand = Hand.new(seed=1)  # 6-max, blinds 1/2
    legal = hand.legal_actions()
    assert hand.actor == 2  # UTG
    assert legal.can_fold
    assert not legal.can_check  # there's a big blind to call
    assert legal.can_call and legal.call_amount == 2
    assert legal.can_raise and not legal.can_bet
    assert legal.min_raise_to == 4 and legal.max_raise_to == 200


def test_legal_actions_facing_a_raise():
    hand = Hand.new(seed=1)
    hand.apply(Action(ActionType.RAISE, 6))  # UTG opens to 6
    legal = hand.legal_actions()  # MP faces the raise
    assert legal.can_call and legal.call_amount == 6
    assert not legal.can_check
    assert legal.can_raise and legal.min_raise_to == 10  # raise increment = 4 -> to 10


def test_legal_actions_postflop_check_available():
    # Limped pot to the flop: first to act may check or bet, not call.
    hand = Hand.new(table_size=2, blinds=(1, 2), starting_stacks=200, manual_deal=True)
    hand.deal_hole("AhKh")
    hand.deal_hole("QsJs")
    hand.apply(Action(ActionType.CALL))   # seat0 (SB/BTN) limps
    hand.apply(Action(ActionType.CHECK))  # seat1 (BB) checks -> flop
    hand.deal_board("2c7d9h")
    legal = hand.legal_actions()
    assert legal.can_check and not legal.can_call
    assert legal.can_bet and not legal.can_raise
    assert legal.min_raise_to == 2  # min bet = big blind


def test_short_stack_can_only_call_allin():
    # seat0 deep, seat1 short. The effective stack caps seat0's max bet at the
    # short stack (40); once seat0 puts seat1 all-in, seat1 may only call — no raise.
    hand = Hand.new(
        table_size=2, blinds=(1, 2), starting_stacks=(200, 40), manual_deal=True
    )
    hand.deal_hole("AhKh")
    hand.deal_hole("2c7d")
    legal0 = hand.legal_actions()
    assert legal0.max_raise_to == 40  # capped at the effective (short) stack
    hand.apply(Action(ActionType.RAISE, 40))  # puts seat1 all-in
    legal = hand.legal_actions()
    assert legal.can_call and legal.call_amount == 38  # all-in for the remaining 38
    assert legal.can_fold
    assert not legal.can_raise and not legal.can_bet


def test_illegal_action_raises():
    hand = Hand.new(seed=1)
    with pytest.raises(IllegalAction):
        hand.apply(Action(ActionType.CHECK))  # can't check facing the BB
    with pytest.raises(IllegalAction):
        hand.apply(Action(ActionType.RAISE, 3))  # below min raise-to of 4


# --------------------------------------------------------------------------- #
# random fuzz: completion + chip conservation
# --------------------------------------------------------------------------- #
def _random_action(legal, rng):
    options = []
    if legal.can_check:
        options.append(Action(ActionType.CHECK))
    if legal.can_call:
        options.append(Action(ActionType.CALL))
    # Folding for free is no longer a legal action (a free check dominates it and
    # it can burn chips) — only fold when actually facing a bet.
    if legal.can_fold and not legal.can_check:
        options.append(Action(ActionType.FOLD))
    if legal.can_aggress:
        to = rng.randint(legal.min_raise_to, legal.max_raise_to)
        options.append(Action(ActionType.RAISE if legal.can_raise else ActionType.BET, to))
    return rng.choice(options)


def test_random_hands_complete_and_conserve_chips():
    rng = random.Random(2024)
    for _ in range(500):
        hand = Hand.new(seed=rng.randint(0, 10**9))
        guard = 0
        while not hand.is_over and guard < 400:
            guard += 1
            hand.apply(_random_action(hand.legal_actions(), rng))
        assert hand.is_over, "hand did not terminate"
        results = hand.results()
        assert sum(results) == 0, "chips not conserved"


def test_snapshot_hides_other_hole_cards():
    hand = Hand.new(seed=7)
    snap = hand.snapshot(viewer=2)
    assert snap.seats[2].hole_cards is not None
    assert all(snap.seats[i].hole_cards is None for i in range(6) if i != 2)
    # reveal_all shows everyone
    assert all(s.hole_cards is not None for s in hand.snapshot(reveal_all=True).seats)
