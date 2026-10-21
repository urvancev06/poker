"""P2.8: the current coach and review on the phase-2 maths.

* Hole-aware labels: a board pair is not the hero's hand (8c4d on KKh55Q is "playing
  the board (two pair)" and checks), and four hearts on the board is not the
  hero's flush draw without a heart.
* Equity v2 with honest labels: exact heads-up and two-way after the flop (every
  runout), the preflop table heads-up, seeded joint sampling otherwise, and the
  basis line names the method that ran.
* One villain selection (``coach/villains.py``) and one decision key for the
  coach and the review, so both give the same equity and price for the same
  decision.
* ``/advance?warm_coach=true`` builds the flop matrix when the hero sees a flop.
"""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from poker.coach import build_coaching, review_hand
from poker.engine import Action, ActionType, Hand
from poker.game import GameSession
from tests.helpers import HandSession

F, X, C, B, R = (ActionType.FOLD, ActionType.CHECK, ActionType.CALL, ActionType.BET, ActionType.RAISE)


# --- D21: one villain selection and one decision key -------------------------


def test_select_villains_contesting_and_behind():
    from poker.coach.villains import select_villains

    live = [0, 2, 3, 4]
    bets = [30, 0, 30, 10, 0, 30]
    # Facing a bet of 30: the seats that put in 30 contest it; the others act behind.
    assert select_villains(live, bets, 30, None) == ([0, 2], 2)
    # The engine's fact wins over the count when it exists.
    assert select_villains(live, bets, 30, 1) == ([0, 2], 1)
    # Nobody at the level (a check spot): every live villain contests.
    assert select_villains(live, [0] * 6, 0, None) == ([0, 2, 3, 4], 0)
    assert select_villains(live, bets, 50, None) == ([0, 2, 3, 4], 4)


def test_decision_key_is_session_hand_and_history_length():
    from poker.coach.villains import decision_key

    assert decision_key("abc", 3, 7) == "abc:3:7"


# --- spots -------------------------------------------------------------------


def _hu_hand(hero: str, villain: str) -> Hand:
    """Heads-up 5/10: the hero is seat 1 (SB and button), the villain seat 0 (BB)."""
    h = Hand.new(table_size=2, blinds=(5, 10), starting_stacks=1000, manual_deal=True)
    h.deal_hole(villain)
    h.deal_hole(hero)
    return h


def _board_two_pair_checked_to() -> Hand:
    """The hero raises the button, the TAG calls and checks every street, and the
    hero checks behind until the river: 8c4d on Ks Kh 5d 5c Qs, checked to."""
    h = _hu_hand("8c4d", "JdTc")
    h.apply(Action(R, 25))
    h.apply(Action(C))
    for board in ("KsKh5d", "5c"):
        h.deal_board(board)
        h.apply(Action(X))
        h.apply(Action(X))
    h.deal_board("Qs")
    h.apply(Action(X))
    return h


def test_board_two_pair_checked_to_says_check():
    c = build_coaching(HandSession(_board_two_pair_checked_to(), hero_seat=1, archetypes={0: "TAG"}))
    assert c.hand_label == "playing the board (two pair)"
    assert c.hole_tier == "HIGH_CARD"
    assert c.verdict == "Check."


def test_no_phantom_flush_draw():
    h = _hu_hand("AcQd", "JsTs")
    h.apply(Action(R, 25))
    h.apply(Action(C))
    h.deal_board("2h5h9h")
    h.apply(Action(X))
    h.apply(Action(X))
    h.deal_board("Kh")
    h.apply(Action(B, 30))
    c = build_coaching(HandSession(h, hero_seat=1, archetypes={0: "TAG"}))
    assert c.to_call == 30
    assert c.draws == []
    assert "flush draw" not in c.hand_label


def test_river_equity_is_exact_and_stable():
    s = HandSession(_board_two_pair_checked_to(), hero_seat=1, archetypes={0: "TAG"})
    a, b = build_coaching(s), build_coaching(s)
    assert a.equity_method == "exact"
    assert a.equity_se_pct is None
    assert a.equity_pct == b.equity_pct
    assert (a.win_pct, a.tie_pct, a.lose_pct) == (b.win_pct, b.tie_pct, b.lose_pct)


def _four_way_flop() -> Hand:
    """4-handed 5/10: the CO and BTN limp, the SB completes, the BB checks; on the
    flop the SB checks and the BB (the hero) acts with three villains in."""
    h = Hand.new(table_size=4, blinds=(5, 10), starting_stacks=1000, manual_deal=True)
    h.deal_hole("7c2d")  # SB
    h.deal_hole("9h8h")  # BB, the hero
    h.deal_hole("AsQd")  # CO
    h.deal_hole("KcJc")  # BTN
    for a in (C, C, C, X):
        h.apply(Action(a))
    h.deal_board("Kd9c4s")
    h.apply(Action(X))
    return h


def test_basis_names_the_method():
    river = build_coaching(HandSession(_board_two_pair_checked_to(), hero_seat=1, archetypes={0: "TAG"}))
    assert "Equity is exact: every runout is counted." in river.basis
    assert not any("Monte Carlo" in line for line in river.basis)

    pre = _hu_hand("AsAh", "KsKh")  # the button (the hero) to act first preflop
    c = build_coaching(HandSession(pre, hero_seat=1, archetypes={0: "TAG"}))
    assert c.equity_method == "preflop_table"
    assert c.equity_se_pct is None
    assert "Preflop equity comes from a precomputed table (±0.4 pp)." in c.basis

    # Three villains still in on the flop: joint sampling, with its uncertainty.
    three = build_coaching(HandSession(_four_way_flop(), hero_seat=1, archetypes={0: "LAG", 2: "TAG", 3: "Nit"}))
    assert three.equity_method == "sampled"
    assert three.equity_se_pct is not None and 0 < three.equity_se_pct < 2
    line = next(x for x in three.basis if x.startswith("Equity is sampled"))
    m = re.fullmatch(r"Equity is sampled \(±(\d+\.\d) pp\)\.", line)
    assert m and float(m.group(1)) == pytest.approx(round(1.96 * three.equity_se_pct, 1))


def test_coach_and_review_agree():
    """A seeded session (seed 21) to a hero river decision facing a bet: the review
    of the stored hand gives that call the coach's equity and price."""
    gs = GameSession("agree21", villains=["nit", "tag", "lag", "station", "maniac"], seed=21)
    for _ in range(80):
        gs.start_hand()
        advised = None
        while not gs.hand_over:
            st = gs.state()
            la = st.legal_actions
            if len(st.board) == 5 and la.call_amount > 0 and advised is None:
                c = build_coaching(gs)
                advised = (c.equity_pct, c.required_equity_pct, c.equity_method, len(st.history))
                gs.submit_hero_action(Action(C))
            elif la.can_check:
                gs.submit_hero_action(Action(X))
            else:
                gs.submit_hero_action(Action(C))
        if advised is not None:
            break
    assert advised is not None, "no river call in 80 hands"
    rev = review_hand(gs.last_result)
    hero_calls = [d for d in rev["decisions"] if d["street"] == "river" and d["action"] == "call"]
    d = hero_calls[0]
    assert d["equity_pct"] == pytest.approx(advised[0], abs=0.05)
    assert d["required_pct"] == advised[1]
    assert d["equity_method"] == advised[2]


def test_coach_and_review_agree_when_every_range_is_blocked(monkeypatch):
    """When no modelled combo is left open, the coach falls back to any two cards;
    the review of the same decision must use the same fallback, not drop the equity."""
    from dataclasses import replace

    import poker.coach.coach as coach_mod
    import poker.coach.review as review_mod
    from poker.coach.villain_model import condition_range

    def blocked(archetype, board, role, postflop, dead):
        cr = condition_range(archetype, board, role, postflop, dead)
        return replace(cr, combos=[tuple(sorted(dead))[:2]])  # two dead cards: never open

    monkeypatch.setattr(coach_mod, "condition_range", blocked)
    monkeypatch.setattr(review_mod, "condition_range", blocked)
    gs = GameSession("agree21", villains=["nit", "tag", "lag", "station", "maniac"], seed=21)
    advised = None
    for _ in range(80):
        gs.start_hand()
        advised = None
        while not gs.hand_over:
            st = gs.state()
            la = st.legal_actions
            if len(st.board) == 5 and la.call_amount > 0 and advised is None:
                c = build_coaching(gs)
                advised = (c.equity_pct, c.required_equity_pct, c.equity_method)
                gs.submit_hero_action(Action(C))
            elif la.can_check:
                gs.submit_hero_action(Action(X))
            else:
                gs.submit_hero_action(Action(C))
        if advised is not None:
            break
    assert advised is not None, "no river call in 80 hands"
    d = [d for d in review_hand(gs.last_result)["decisions"] if d["street"] == "river" and d["action"] == "call"][0]
    assert d["equity_pct"] is not None
    assert d["equity_pct"] == pytest.approx(advised[0], abs=0.05)
    assert d["required_pct"] == advised[1]
    assert d["equity_method"] == advised[2]


def test_villain_equity_or_any_two_falls_back():
    """Two villains whose only combo (AsAh) is open but cannot be held by both:
    no modelled equity, so the shared helper falls back to any two cards."""
    from poker.coach.villains import villain_equity, villain_equity_or_any_two

    args = (["Qc", "Jc"], ["2d", "7h", "9s"], [[("As", "Ah")]] * 2)
    assert villain_equity(*args, key="k") is None
    eq, modelled = villain_equity_or_any_two(*args, key="k")
    assert eq is not None and modelled is False
    eq2, modelled2 = villain_equity_or_any_two(["Qc", "Jc"], ["2d", "7h", "9s"], [[("As", "Ah")]], key="k")
    assert modelled2 is True and eq2 is not None and eq2.equity < 0.3


# --- D18: warm the flop matrix ------------------------------------------------


def _to_a_flop_by_advance(client: TestClient, warm: bool) -> list[str]:
    """Step seeded sessions with /advance (the hero checks or calls) until an
    /advance step leaves the hero live on a flop; returns that flop."""
    from poker.math import vector

    for seed in range(1, 40):
        sid = client.post("/session", json={"seed": seed, "auto_advance": False}).json()["session_id"]
        for _hand in range(4):
            for _step in range(60):
                gs = client.app.state.sessions[sid]
                if gs.hand_over:
                    break
                if gs.hero_to_act:
                    la = gs.state().legal_actions
                    body = {"type": "check"} if la.can_check else {"type": "call"}
                    client.post(f"/session/{sid}/action", json=body)
                    continue
                with vector._FLOP_LOCK:
                    vector._FLOP_CACHE.clear()
                path = f"/session/{sid}/advance" + ("?warm_coach=true" if warm else "")
                st = client.post(path).json()["state"]
                hero = next(s for s in st["seats"] if s["hole_cards"])
                if len(st["board"]) == 3 and not hero["folded"] and not st["is_over"]:
                    return st["board"]
            client.post(f"/session/{sid}/next-hand")
    raise AssertionError("no flop reached by an /advance step")


def test_warm_coach_param_builds_the_flop_matrix():
    from poker.api.app import create_app
    from poker.math.vector import is_flop_warm

    client = TestClient(create_app("sqlite://", job_executor="thread"))
    board = _to_a_flop_by_advance(client, warm=True)
    assert is_flop_warm(board)
    # Without the parameter the step leaves the matrix cold.
    board = _to_a_flop_by_advance(client, warm=False)
    assert not is_flop_warm(board)


# --- the villain model's labeller (BET_COMPOSITION is measured with it) -------
# It stays classify_legacy in P2.8 (see villain_model.py): the switch is an owner
# decision. One function serves both, so the measurement can never use another.


def test_bet_range_script_measures_with_the_villain_models_labeller():
    from poker.coach import villain_model
    from scripts import measure_bet_ranges

    assert measure_bet_ranges._category is villain_model.bet_category
