"""The chip ledger (engine/ledger.py) and the decision facts.

PokerKit owns the rules; the ledger is bookkeeping beside it: chips added per
post and action, the uncalled-bet return as its own entry, the pot, what a seat
can win (side-pot aware), and per-decision facts (who still acts after a call,
whether calling ends the betting). These tests compare it with PokerKit's own
pots, bets, stacks and results.
"""

from __future__ import annotations

import json
import random

import pytest
from pokerkit import BetCollection, ChipsPushing

from poker.engine import Action, ActionType, Hand, Ledger
from poker.engine.ledger import RakeConfig
from poker.rng import shuffled_deck, stream

F, X, C, B, R = (ActionType.FOLD, ActionType.CHECK, ActionType.CALL, ActionType.BET, ActionType.RAISE)


def _deck(key: int = 0) -> list[str]:
    return shuffled_deck(stream(1, "deck", key))


def _hand(n=6, stacks=1000, key=0) -> Hand:
    return Hand.new(table_size=n, blinds=(5, 10), starting_stacks=stacks, deck=_deck(key))


def _play(hand: Hand, *actions) -> None:
    for a in actions:
        if isinstance(a, tuple):
            hand.apply(Action(*a))
        else:
            hand.apply(Action(a))


def _check_down(hand: Hand) -> None:
    while not hand.is_over:
        la = hand.legal_actions()
        hand.apply(Action(X if la.can_check else C))


def _bb_short_jam_spot() -> Hand:
    """3-handed 5/10, stacks (SB 1000, BB 50, BTN 1000). BTN jams 1000, SB folds;
    the BB is to act with 40 to call (all-in for less)."""
    h = Hand.new(table_size=3, blinds=(5, 10), starting_stacks=(1000, 50, 1000), deck=_deck())
    _play(h, (R, 1000), F)
    return h


# --------------------------------------------------------------------------- #
# returns and the pot (B5)
# --------------------------------------------------------------------------- #
def test_uncalled_open_is_returned():
    h = _hand()
    _play(h, (R, 25), F, F, F, F, F)  # UTG opens to 25, everyone folds
    led = h.ledger
    last = led.entries[-1]
    assert last.kind == "return" and last.seat == 2 and last.added == -15
    assert led.pot == 25
    assert h.results()[2] == 15
    assert sum(led.payouts(h.results())) == led.pot


def test_all_in_for_less_returns_the_excess():
    h = _bb_short_jam_spot()
    _play(h, C)  # BB calls its last 40
    led = h.ledger
    ret = [e for e in led.entries if e.kind == "return"]
    assert [(e.seat, e.added) for e in ret] == [(2, -950)]
    assert led.pot == 105
    assert sum(led.payouts(h.results())) == 105
    call = [e for e in led.entries if e.kind == "action"][-1]
    assert call.seat == 1 and call.added == 40 and call.all_in and call.stack_after == 0


def test_bb_walk_returns_the_big_blind_overage():
    h = _hand()
    _play(h, F, F, F, F, F)  # folded to the BB
    assert h.is_over
    assert h.ledger.entries[-1].kind == "return" and h.ledger.entries[-1].seat == 1
    assert h.ledger.entries[-1].added == -5
    assert h.ledger.pot == 10
    assert h.ledger.payouts(h.results()) == [0, 10, 0, 0, 0, 0]


def test_heads_up_blinds_posted_by_position():
    h = _hand(n=2)
    posts = [(e.seat, e.added) for e in h.ledger.entries if e.kind == "post"]
    assert posts == [(1, 5), (0, 10)]  # heads-up: seat 1 is the SB (and button)


def test_ledger_pot_equals_engine_pot_at_every_step():
    rng = random.Random(5)
    for k in range(200):
        h = _hand(n=rng.randint(2, 6), key=k)
        while not h.is_over:
            _assert_matches_engine(h)
            h.apply(_random_action(h.legal_actions(), rng))
        assert h.ledger.pot == sum(h.ledger.contributed)


def _assert_matches_engine(h: Hand) -> None:
    s = h._state
    led = h.ledger
    assert led.pot == h.total_pot
    assert led.street_bets == list(s.bets)
    assert [led.stack(i) for i in range(h.table_size)] == list(s.stacks)


def _random_action(legal, rng):
    options = []
    if legal.can_check:
        options.append(Action(X))
    if legal.can_call:
        options.append(Action(C))
    if legal.can_fold and not legal.can_check:
        options.append(Action(F))
    if legal.can_aggress:
        lo, hi = legal.min_raise_to, legal.max_raise_to
        to = rng.choice([lo, hi, rng.randint(lo, hi)])
        options.append(Action(R if legal.can_raise else B, to))
    return rng.choice(options)


def test_ledger_conservation_random_short_stacks():
    """Review focus 2: all-ins for less, several all-ins at different sizes, folds
    after an all-in, heads-up. Every chip is accounted for and returns go to the
    right seat (a folded seat never collects)."""
    for h_idx in range(400):
        srng = stream(9, "t", h_idx)
        n = srng.randint(2, 6)
        # Mostly 3-300bb with odd chips; now and then a stack at or below a blind,
        # which goes all-in by posting.
        start = [
            srng.randint(1, 15) if srng.random() < 0.08 else srng.randint(3, 300) * 10 + srng.randint(0, 9)
            for _ in range(n)
        ]
        h = Hand.new(table_size=n, blinds=(5, 10), starting_stacks=start, deck=_deck(h_idx))
        arng = stream(9, "a", h_idx)
        while not h.is_over:
            _assert_matches_engine(h)
            h.apply(_random_action(h.legal_actions(), arng))
        led = h.ledger
        results = h.results()
        payouts = led.payouts(results)
        assert sum(results) == 0
        assert all(p >= 0 for p in payouts), payouts
        assert sum(payouts) == led.pot
        assert sum(e.added for e in led.entries) == led.pot
        assert all(0 <= led.contributed[i] <= start[i] for i in range(n))
        folded = {e.seat for e in led.entries if e.action == "fold"}
        assert all(payouts[i] == 0 for i in folded), (folded, payouts)
        # Each seat's last ledger entry leaves it holding start - contributed.
        for i in range(n):
            mine = [e for e in led.entries if e.seat == i]
            assert mine, f"seat {i} has no ledger entry"
            assert mine[-1].stack_after == start[i] - led.contributed[i]


def _pokerkit_books(h: Hand) -> tuple[list[int], list[int]]:
    """Per seat, the chips PokerKit's own operation log collected into the pot
    (net of the uncalled bets it handed back) and pushed out of it."""
    n = h.table_size
    collected, pushed = [0] * n, [0] * n
    for op in h._state.operations:
        if isinstance(op, BetCollection):
            collected = [c + b for c, b in zip(collected, op.bets)]
        elif isinstance(op, ChipsPushing):
            pushed = [p + a for p, a in zip(pushed, op.amounts)]
    return collected, pushed


@pytest.mark.parametrize("rake", [None, RakeConfig(no_flop_no_drop=False)], ids=["no-rake", "rake"])
def test_ledger_matches_pokerkit_collections_and_payouts(rake):
    """The ledger against PokerKit's own record of each hand rather than against
    itself: per seat, what went into the pot (BetCollection) and what came out
    (ChipsPushing), and the rake between them. Stacks from 1 chip to 300 bb, so
    some hands end on the blinds alone, with nobody acting.

    A hand everyone folds to is different: PokerKit never collects the winner's
    last bet (it hands it back whole), so there the losers' chips must match, and
    the winner's matched chips equal the most any other seat put in."""
    no_action = 0
    for h_idx in range(500):
        srng = stream(11, "t", h_idx)
        n = srng.randint(2, 6)
        bb = srng.choice([2, 10])
        start = [
            srng.choice([srng.randint(1, bb), srng.randint(bb, 3 * bb), srng.randint(bb, 300 * bb)])
            for _ in range(n)
        ]
        h = Hand.new(table_size=n, blinds=(bb // 2, bb), starting_stacks=start, deck=_deck(h_idx), rake=rake)
        no_action += h.is_over
        arng = stream(11, "a", h_idx)
        while not h.is_over:
            h.apply(_random_action(h.legal_actions(), arng))
        led, results = h.ledger, h.results()
        collected, pushed = _pokerkit_books(h)
        assert led.rake == -sum(results)
        folded = {e.seat for e in led.entries if e.action == "fold"}
        if len(folded) == n - 1:
            (winner,) = set(range(n)) - folded
            others = [i for i in range(n) if i != winner]
            assert [led.contributed[i] for i in others] == [collected[i] for i in others], h_idx
            assert led.contributed[winner] == max(led.contributed[i] for i in others), h_idx
        else:
            assert led.contributed == collected, (h_idx, start, led.contributed, collected)
            assert led.payouts(results) == pushed, (h_idx, start)
            assert led.rake == sum(collected) - sum(pushed), h_idx
    assert no_action > 0  # the sample reaches hands the blinds alone settle


@pytest.mark.parametrize("manual", [False, True], ids=["dealt", "manual-deal"])
def test_blinds_alone_ending_the_betting_return_the_uncalled_blind(manual):
    """Heads-up 5/10, the small blind holds 2 chips: it is all-in for 2, the big
    blind's 10 covers it, and nobody acts. The 8 nobody can call go back, so the
    pot is 4, as PokerKit plays it."""
    if manual:
        h = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=(1712, 2), manual_deal=True)
        h.deal_hole("AsAd")
        h.deal_hole("7c2d")
        for cards in ("Kh9s4c", "3d", "8h"):
            h.deal_board(cards)
    else:
        h = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=(1712, 2), deck=_deck())
    assert h.is_over
    led = h.ledger
    back = [e for e in led.entries if e.kind == "return"]
    assert [(e.seat, e.added, e.stack_after) for e in back] == [(0, -8, 1710)]
    assert led.contributed == [2, 2] and led.pot == 4
    collected, pushed = _pokerkit_books(h)
    assert led.contributed == collected
    assert led.payouts(h.results()) == pushed and sum(pushed) == 4
    assert h.snapshot().ledger["pot"] == 4


def test_blinds_alone_settle_the_rake():
    """A hand the blinds alone play out is raked like any other once it is over."""
    h = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=(1712, 4), deck=_deck(),
                 rake=RakeConfig(no_flop_no_drop=False, percentage=0.5))
    assert h.is_over
    collected, pushed = _pokerkit_books(h)
    assert h.ledger.rake == sum(collected) - sum(pushed) > 0
    assert h.ledger.rake == -sum(h.results())


def test_ledger_round_trips_through_a_dict():
    h = _bb_short_jam_spot()
    _play(h, C)
    d = h.ledger.as_dict()
    json.dumps(d)  # stored as JSON in hands.data
    assert d["version"] == 1 and d["pot"] == 105 and d["rake"] == 0
    back = Ledger.from_dict(d)
    assert back.as_dict() == d
    assert back.payouts(h.results()) == h.ledger.payouts(h.results())
    call = [e for e in d["entries"] if e["kind"] == "action"][-1]
    assert call["facts"]["to_call"] == 40 and call["facts"]["winnable_if_call"] == 105


# --------------------------------------------------------------------------- #
# winnable and decision facts (B6, B7)
# --------------------------------------------------------------------------- #
def test_winnable_caps_at_own_stack():
    h = _bb_short_jam_spot()
    facts = h.decision_facts()
    assert facts.seat == 1 and facts.to_call == 40
    assert facts.pot == 1015
    assert facts.winnable_if_call == 105  # 50 + SB's dead 5 + 50 of the BTN's 1000
    assert h.ledger.winnable(1, 40) == 105
    assert h.snapshot().facts == facts


def test_winnable_without_side_pots_is_pot_plus_call():
    h = _hand()
    _play(h, (R, 25))
    f = h.decision_facts()  # MP faces the open
    assert f.to_call == 25 and f.pot == 40 and f.winnable_if_call == 65


def _three_handed_river_bet() -> Hand:
    h = _hand(n=3)
    _play(h, C, C, X)          # BTN limps, SB completes, BB checks
    for _ in range(2):         # flop and turn check through
        _play(h, X, X, X)
    _play(h, (B, 20))          # river: SB (seat 0) bets
    return h


def test_facts_river_with_a_player_behind():
    h = _three_handed_river_bet()
    f = h.decision_facts()
    assert f.seat == 1 and f.street == "river" and f.to_call == 20
    assert f.to_act_after_call == 1
    assert f.closes_on_call is False
    assert f.betting_over_after_call is False
    assert f.can_respond_to_raise == 2


def test_facts_closing_call_on_the_river():
    h = _hand(n=2)
    _play(h, C, X)              # SB/BTN limps, BB checks
    for _ in range(2):
        _play(h, X, X)
    _play(h, (B, 20))           # river: BB (seat 0) bets
    f = h.decision_facts()
    assert f.seat == 1 and f.to_act_after_call == 0
    assert f.closes_on_call is True and f.betting_over_after_call is True


def test_facts_flop_call_closes_but_betting_goes_on():
    h = _hand(n=2)
    _play(h, C, X, (B, 20))     # flop: BB bets
    f = h.decision_facts()
    assert f.closes_on_call is True and f.betting_over_after_call is False


def test_facts_all_in_ends_betting():
    h = _hand(n=2)
    _play(h, C, X)
    la = h.legal_actions()
    _play(h, (B, la.max_raise_to))  # flop: BB jams
    f = h.decision_facts()
    assert f.closes_on_call is True and f.betting_over_after_call is True
    assert f.can_respond_to_raise == 0


def test_facts_are_none_when_nobody_acts():
    h = _hand()
    _play(h, F, F, F, F, F)
    assert h.decision_facts() is None and h.snapshot().facts is None


def test_action_entries_carry_the_facts_seen_before_acting():
    h = _bb_short_jam_spot()
    before = h.decision_facts()
    _play(h, C)
    entry = [e for e in h.ledger.entries if e.kind == "action"][-1]
    assert entry.facts == before


# --------------------------------------------------------------------------- #
# labels and the lossless action log
# --------------------------------------------------------------------------- #
def test_bb_option_raise_is_labelled_raise():
    h = _hand()
    _play(h, C, C, C, C, C)        # UTG..SB limp
    _play(h, (B, 40))              # BB raises over the limpers (no call amount)
    assert h.snapshot().history[-1].action == "raise"


def test_postflop_labels_follow_the_street():
    h = _hand(n=2)
    _play(h, C, X)
    _play(h, (R, 20))              # first wager on the flop, even if sent as RAISE
    assert h.snapshot().history[-1].action == "bet"
    _play(h, (B, 60))              # over a bet, even if sent as BET
    assert h.snapshot().history[-1].action == "raise"


def test_history_entries_carry_amounts():
    h = _hand()
    _play(h, (R, 25), C, F, F, C, F)  # UTG opens, MP calls, CO/BTN fold, SB calls, BB folds
    hist = h.snapshot(reveal_all=True).history
    utg, mp, co, _btn, sb, bb = hist[:6]
    assert (utg.action, utg.added, utg.street_total, utg.stack_after) == ("raise", 25, 25, 975)
    assert (mp.action, mp.added, mp.street_total, mp.stack_after) == ("call", 25, 25, 975)
    assert mp.to_amount is None  # to_amount keeps its old meaning: null for calls
    assert (co.action, co.added, co.street_total, co.stack_after) == ("fold", 0, 0, 1000)
    assert (sb.action, sb.added, sb.street_total, sb.stack_after) == ("call", 20, 25, 975)
    assert (bb.action, bb.added, bb.street_total, bb.stack_after) == ("fold", 0, 10, 990)
    assert not any(e.all_in for e in hist)
    assert h.snapshot().ledger == {"contributed": [25, 10, 25, 25, 0, 0], "pot": 85, "rake": 0}


def test_ledger_survives_the_end_of_the_hand():
    h = _hand(n=2)
    _play(h, (R, 30), C)
    _check_down(h)
    assert h.total_pot == 0          # PokerKit has pushed the chips
    assert h.ledger.pot == 60        # the ledger still knows the pot
    assert h.snapshot().ledger["pot"] == 60


def test_facts_follow_manual_dealing():
    h = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=1000, manual_deal=True)
    h.deal_hole("AhKh")
    h.deal_hole("QsJs")
    assert h.decision_facts().street == "preflop"
    _play(h, C, X)
    assert h.decision_facts() is None  # waiting for the flop
    h.deal_board("2c7d9h")
    f = h.decision_facts()
    assert f.street == "flop" and f.seat == 0 and f.to_call == 0 and f.pot == 20
