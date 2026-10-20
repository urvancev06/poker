"""Engine hygiene: positions named by distance to the button, history that never
shows a viewer anyone else's cards, and the rake hook (off unless asked for).
"""

from __future__ import annotations

import random

from poker.engine import Action, ActionType, Hand, RakeConfig, positions_for
from poker.rng import shuffled_deck, stream

X, C, R = ActionType.CHECK, ActionType.CALL, ActionType.RAISE


def _deck(key: int = 0) -> list[str]:
    return shuffled_deck(stream(2, "deck", key))


def _check_down(hand: Hand) -> None:
    while not hand.is_over:
        la = hand.legal_actions()
        hand.apply(Action(X if la.can_check else C))


def test_positions_by_distance_to_button():
    assert positions_for(2) == ["BB", "SB"]
    assert positions_for(3) == ["SB", "BB", "BTN"]
    assert positions_for(4) == ["SB", "BB", "CO", "BTN"]
    assert positions_for(5) == ["SB", "BB", "MP", "CO", "BTN"]
    assert positions_for(6) == ["SB", "BB", "UTG", "MP", "CO", "BTN"]


def test_five_handed_first_to_act_is_mp():
    h = Hand.new(table_size=5, blinds=(5, 10), starting_stacks=1000, deck=_deck())
    assert h.snapshot().seats[h.actor].position == "MP"


# --------------------------------------------------------------------------- #
# redaction
# --------------------------------------------------------------------------- #
def test_snapshot_history_redacts_other_seats_hole_cards():
    h = Hand.new(blinds=(5, 10), starting_stacks=1000, deck=_deck(1))
    for _ in range(4):
        h.apply(Action(C if h.legal_actions().can_call else X))
    seen = h.snapshot(viewer=3).history
    assert {e.seat for e in seen} == {2, 3, 4, 5}
    assert all(e.hole_cards is None for e in seen if e.seat != 3)
    assert next(e for e in seen if e.seat == 3).hole_cards == h.hole_cards(3)
    assert all(e.hole_cards is None for e in h.snapshot().history)  # no viewer: nobody's
    assert all(e.hole_cards for e in h.snapshot(reveal_all=True).history)


def test_redaction_does_not_touch_the_stored_history():
    h = Hand.new(blinds=(5, 10), starting_stacks=1000, deck=_deck(1))
    h.apply(Action(C))
    h.snapshot(viewer=0)
    assert h.snapshot(reveal_all=True).history[0].hole_cards == h.hole_cards(2)


# --------------------------------------------------------------------------- #
# rake (off by default; the mechanism only, until phase 4)
# --------------------------------------------------------------------------- #
def _random_hand(rng: random.Random, key: int, rake=None) -> Hand:
    h = Hand.new(
        table_size=rng.randint(2, 6), blinds=(5, 10), starting_stacks=1000,
        deck=_deck(key), rake=rake,
    )
    while not h.is_over:
        la = h.legal_actions()
        options = [Action(X)] if la.can_check else [Action(C), Action(ActionType.FOLD)]
        if la.can_aggress:
            kind = R if la.can_raise else ActionType.BET
            options.append(Action(kind, rng.randint(la.min_raise_to, la.max_raise_to)))
        h.apply(rng.choice(options))
    return h


def test_rake_off_by_default_is_zero_sum():
    rng = random.Random(11)
    for k in range(100):
        h = _random_hand(rng, k)
        assert sum(h.results()) == 0
        assert h.ledger.rake == 0


def test_rake_on_conserves_and_caps_per_pot():
    # Limped heads-up pot of 20 checked down: 5% of 20 = 1.
    h = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=1000, deck=_deck(3), rake=RakeConfig())
    _check_down(h)
    assert h.ledger.pot == 20
    assert sum(h.results()) == -1 and h.ledger.rake == 1
    assert sum(h.ledger.payouts(h.results())) == h.ledger.pot - h.ledger.rake

    # A 2,000-chip pot: 5% would be 100, the cap is 3bb = 30.
    big = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=1000, deck=_deck(4), rake=RakeConfig())
    big.apply(Action(R, 1000))
    big.apply(Action(C))
    assert big.is_over and big.ledger.pot == 2000
    assert big.ledger.rake == 30 and sum(big.results()) == -30
    assert sum(big.ledger.payouts(big.results())) == 1970


def test_rake_on_random_hands_conserves_chips():
    rng = random.Random(12)
    for k in range(100):
        h = _random_hand(rng, k, rake=RakeConfig())
        led = h.ledger
        assert sum(h.results()) == -led.rake
        assert 0 <= led.rake <= 30 * max(1, len(h.snapshot().pots))
        assert sum(led.payouts(h.results())) == led.pot - led.rake
        assert all(p >= 0 for p in led.payouts(h.results()))


def test_no_flop_no_drop():
    h = Hand.new(blinds=(5, 10), starting_stacks=1000, deck=_deck(5), rake=RakeConfig())
    h.apply(Action(R, 30))
    for _ in range(5):
        h.apply(Action(ActionType.FOLD))
    assert h.is_over and h.ledger.rake == 0 and sum(h.results()) == 0


def test_reading_pots_twice_does_not_double_rake():
    def play(read: bool) -> tuple[int, list[int]]:
        h = Hand.new(table_size=3, blinds=(5, 10), starting_stacks=1000, deck=_deck(6), rake=RakeConfig())
        h.apply(Action(R, 30))
        h.apply(Action(C))
        h.apply(Action(C))
        while not h.is_over:
            if read:
                for _ in range(5):
                    h.snapshot()
                    _ = h.total_pot
            la = h.legal_actions()
            h.apply(Action(X if la.can_check else C))
        return h.ledger.rake, h.results()

    assert play(read=True) == play(read=False)
    assert play(read=False)[0] == 4  # 5% of a 90-chip pot, rounded
