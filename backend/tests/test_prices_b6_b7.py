"""The current (v1) coach and review price decisions from the engine's ledger and
decision facts.

B6: a short stack facing a bigger all-in can only win each opponent's chips up to
its own stack, so the price is to_call / winnable, not to_call / (pot + to_call).
B7: "the action closes" is a fact (nobody acts after a call and no later street
has betting), so the coach never says "no more betting" with a player still to
act behind.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from poker.coach import build_coaching, review_hand
from poker.engine import Action, ActionType, Hand
from tests.helpers import HandSession, stored_record

F, X, C, B, R = (ActionType.FOLD, ActionType.CHECK, ActionType.CALL, ActionType.BET, ActionType.RAISE)
FIXTURES = Path(__file__).parent / "fixtures"


def _b6_hand() -> Hand:
    """3-handed 5/10, stacks (SB 1000, BB 50, BTN 1000): BTN jams 1000, SB folds,
    the BB (seat 1) has 40 left to call."""
    h = Hand.new(table_size=3, blinds=(5, 10), starting_stacks=(1000, 50, 1000), manual_deal=True)
    h.deal_hole("7c2d")  # SB
    h.deal_hole("AsJs")  # BB, the hero
    h.deal_hole("QhTh")  # BTN
    h.apply(Action(R, 1000))
    h.apply(Action(F))
    return h


def test_b6_short_stack_prices_what_it_can_win():
    c = build_coaching(HandSession(_b6_hand(), hero_seat=1, archetypes={0: "Nit", 2: "TAG"}), trials=800)
    assert c.to_call == 40 and c.winnable == 105
    assert c.required_direct_pct == 38.1  # 40 / 105, not 40 / (1015 + 40) = 3.8
    assert c.required_equity_pct == 38.1  # the call ends the betting: no implied term
    assert c.pot_odds == "1.6 : 1"        # 65 to win for 40
    assert c.action_closed is True and c.closes_on_call is True
    assert c.big_blind == 10
    assert abs(c.call_ev - (c.realized_equity_pct / 100 * 105 - 40)) <= 0.6  # pct is rounded


def _three_handed_river_bet() -> Hand:
    """3-handed 5/10 checked to the river; on the river SB (seat 0) and BB check
    and the BTN (seat 2) bets 30. The SB, the hero, is to act, and the BB still
    acts after it."""
    h = Hand.new(table_size=3, blinds=(5, 10), starting_stacks=1000, manual_deal=True)
    h.deal_hole("9h8h")  # SB, the hero: second pair
    h.deal_hole("Kc2d")  # BB
    h.deal_hole("AsQd")  # BTN
    for a in (C, C, X):  # BTN limps, SB completes, BB checks
        h.apply(Action(a))
    for board in ("Kd9c4s", "2h"):
        h.deal_board(board)
        for _ in range(3):
            h.apply(Action(X))
    h.deal_board("7c")
    h.apply(Action(X))
    h.apply(Action(X))
    h.apply(Action(B, 30))
    return h


def test_b7_river_with_a_player_behind_never_says_both():
    c = build_coaching(HandSession(_three_handed_river_bet(), hero_seat=0, archetypes={1: "LAG", 2: "TAG"}), trials=800)
    assert c.players_behind == 1
    assert c.action_closed is False and c.closes_on_call is False
    assert "no more betting" not in c.rationale
    assert c.winnable == 90 and c.required_direct_pct == round(30 / 90 * 100, 1)


def test_b7_closing_river_call_is_a_pure_price_spot():
    h = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=1000, manual_deal=True)
    h.deal_hole("Kc2d")  # BB (seat 0)
    h.deal_hole("9h8h")  # SB/BTN (seat 1), the hero
    h.apply(Action(C))
    h.apply(Action(X))
    for board in ("Kd9c4s", "2h"):
        h.deal_board(board)
        h.apply(Action(X))
        h.apply(Action(X))
    h.deal_board("7c")
    h.apply(Action(B, 30))  # BB bets the river
    c = build_coaching(HandSession(h, hero_seat=1, archetypes={0: "TAG"}), trials=800)
    assert c.players_behind == 0
    assert c.action_closed is True and c.closes_on_call is True
    assert c.realized_equity_pct == c.equity_pct
    assert c.winnable == 80 and c.required_direct_pct == 37.5  # 30 to win 50 + 30


def _short_all_in_call_with_a_player_behind(hero_hole: str, flop: str) -> Hand:
    """3-handed 5/10, stacks (SB 1000, BB 100, BTN 1000). BTN limps, SB completes,
    BB checks. On the flop the SB bets 500; the BB, the hero, has 90 left, so a call
    puts it all-in for less, and the BTN still acts after it."""
    h = Hand.new(table_size=3, blinds=(5, 10), starting_stacks=(1000, 100, 1000), manual_deal=True)
    h.deal_hole("7c2d")    # SB
    h.deal_hole(hero_hole)  # BB, the hero
    h.deal_hole("AsQd")    # BTN
    for a in (C, C, X):
        h.apply(Action(a))
    h.deal_board(flop)
    h.apply(Action(B, 500))
    return h


@pytest.mark.parametrize("hero_hole, flop", [
    ("Qh2h", "Kh9h4s"),  # a flush draw: implied odds would lower the price
    ("4h3d", "Kd9c4s"),  # bottom pair: reverse implied odds would raise it
])
def test_an_all_in_call_is_priced_exactly_with_a_player_behind(hero_hole, flop):
    """Calling puts the hero all-in, so it can win nothing more on later streets and
    lose nothing more: no implied or reverse-implied term, and its equity counts in
    full (it sees every card). The betting is not over (the BTN acts behind and can
    bet the side pot), so B7's text stays, but the hero's price is the plain one."""
    c = build_coaching(
        HandSession(_short_all_in_call_with_a_player_behind(hero_hole, flop), hero_seat=1,
                    archetypes={0: "LAG", 2: "TAG"}),
        trials=600,
    )
    assert c.to_call == 90 and c.winnable == 210 and c.players_behind == 1
    assert c.required_direct_pct == 42.9  # 90 / 210
    assert c.required_equity_pct == 42.9 and c.implied_note == ""
    assert c.realization_pct == 100 and c.realized_equity_pct == c.equity_pct
    assert c.action_closed is False and "no more betting" not in c.rationale

    h = _short_all_in_call_with_a_player_behind(hero_hole, flop)
    h.apply(Action(C))
    rev = [x for x in review_hand(stored_record(h, 1, ["LAG", "hero", "TAG"]), equity_trials=300)["decisions"]
           if x["street"] == "flop"][0]
    assert rev["required_direct_pct"] == rev["required_pct"] == 42.9
    assert rev["realized_pct"] == rev["equity_pct"]


def test_review_reads_prices_from_the_stored_ledger():
    h = _b6_hand()
    h.apply(Action(C))  # the hero calls its last 40
    data = stored_record(h, hero_seat=1, lineup=["Nit", "hero", "TAG"])
    d = [x for x in review_hand(data, equity_trials=300)["decisions"] if x["action"] == "call"][0]
    assert d["to_call"] == 40 and d["winnable"] == 105
    assert d["required_direct_pct"] == 38.1
    assert d["pot"] == 1015


def test_review_reports_the_hands_big_blind():
    h = _b6_hand()
    h.apply(Action(C))
    assert review_hand(stored_record(h, 1, ["Nit", "hero", "TAG"]), equity_trials=200)["big_blind"] == 10
    legacy = json.loads((FIXTURES / "legacy_reviews.json").read_text())
    any_row = next(iter(legacy.values()))["data"]
    assert review_hand(any_row, equity_trials=200)["big_blind"] == 2


def test_review_of_a_legacy_row_is_unchanged(monkeypatch):
    """Rows stored before the ledger existed are reviewed exactly as before. The
    snapshot was taken by running review_hand on these rows before the ledger
    path was added. The review's equity reads the villain ranges, which follow the
    measured BET_COMPOSITION, so the review runs with the composition of the
    snapshot: a re-measured composition (P1.12, P2.8) moves equities, not this path."""
    from poker.coach import villain_model

    era = json.loads((FIXTURES / "legacy_reviews_bet_composition.json").read_text())["bet_composition"]
    monkeypatch.setattr(villain_model, "BET_COMPOSITION", era)
    legacy = json.loads((FIXTURES / "legacy_reviews.json").read_text())
    for name, case in legacy.items():
        assert "ledger" not in case["data"]
        got = json.loads(json.dumps(review_hand(case["data"], equity_trials=600)))
        want = case["review"]
        # Fields added since the snapshot: the review's big_blind and each
        # decision's winnable (None without a ledger).
        assert all(d.pop("winnable") is None for d in got["decisions"]), name
        assert {k: got[k] for k in want} == want, name


def test_review_legacy_heads_up_posts_the_blinds_by_position():
    """Heads-up, seat 1 is the small blind (and the button), seat 0 the big blind.
    An old row has no ledger, so the review replays the log; it used to put the
    small blind on seat 0."""
    data = {
        "session_id": "hu-legacy", "hand_index": 0, "lineup": ["hero", "TAG"],
        "hero_seat": 0, "button_player": 1, "blinds": [1, 2], "start_stacks": [200, 200],
        "hero_cards": "AhKd", "board": "",
        "actions": [
            {"player": 1, "seat": 1, "position": "SB", "street": "preflop", "action": "call", "to_amount": None},
            {"player": 0, "seat": 0, "position": "BB", "street": "preflop", "action": "check", "to_amount": None},
        ],
        "hero_net": 0, "went_to_showdown": False,
    }
    d = review_hand(data, equity_trials=200)["decisions"][0]
    assert d["action"] == "check" and d["to_call"] == 0 and d["pot"] == 4


@pytest.mark.parametrize("trials", [400])
def test_coach_and_review_agree_on_the_price(trials):
    coach = build_coaching(HandSession(_b6_hand(), hero_seat=1, archetypes={0: "Nit", 2: "TAG"}), trials=trials)
    h = _b6_hand()
    h.apply(Action(C))
    rev = [x for x in review_hand(stored_record(h, 1, ["Nit", "hero", "TAG"]), equity_trials=trials)["decisions"]
           if x["action"] == "call"][0]
    assert (rev["to_call"], rev["winnable"], rev["required_direct_pct"], rev["required_pct"]) == (
        coach.to_call, coach.winnable, coach.required_direct_pct, coach.required_equity_pct
    )


def test_coach_and_review_agree_on_every_priced_decision():
    """Over real session hands, the review of the stored hand prices each hero
    decision exactly as the live coach did when it advised it."""
    from poker.game import GameSession

    gs = GameSession("agree", villains=["nit", "tag", "lag", "station", "maniac"], seed=31)
    compared = 0
    for _ in range(25):
        gs.start_hand()
        advised = []
        while not gs.hand_over:
            c = build_coaching(gs, trials=40)
            advised.append((c.to_call, c.winnable, c.required_direct_pct, c.required_equity_pct, c.pot))
            la = gs.state().legal_actions
            if la.can_check:
                gs.submit_hero_action(Action(X))
            elif la.call_amount <= 40:
                gs.submit_hero_action(Action(C))
            else:
                gs.submit_hero_action(Action(F))
        rev = review_hand(gs.last_result, equity_trials=40)["decisions"]
        assert len(rev) == len(advised)
        for d, a in zip(rev, advised):
            assert (d["to_call"], d["winnable"], d["required_direct_pct"], d["required_pct"], d["pot"]) == a
            compared += a[0] > 0
    assert compared >= 10
