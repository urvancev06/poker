"""Phase 4 API tests (PROJECT.md Definition of Done):

- play a full hand end-to-end via the API,
- coaching numbers match the Phase-2 engine,
- completed hands are persisted.
"""

import pytest
from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.math import required_equity


@pytest.fixture
def client() -> TestClient:
    # Fresh in-memory DB + session store per test.
    return TestClient(create_app("sqlite://"))


def _new_session(client: TestClient, seed: int = 7) -> dict:
    resp = client.post("/session", json={"seed": seed})
    assert resp.status_code == 200
    return resp.json()


def _hero_action(state: dict) -> dict:
    """A simple hero policy to drive a hand to completion: check if free, call
    small bets, otherwise fold."""
    legal = state["state"]["legal_actions"]
    if legal["can_check"]:
        return {"type": "check"}
    if legal["can_call"] and legal["call_amount"] <= 10:
        return {"type": "call"}
    return {"type": "fold"}


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_play_full_hand_via_api(client: TestClient):
    sess = _new_session(client)
    sid = sess["session_id"]
    assert sess["state"]["pot"] >= 3  # blinds posted

    guard = 0
    while not sess["hand_over"] and guard < 50:
        guard += 1
        assert sess["hero_to_act"], "if the hand isn't over, the hero should be to act"
        action = _hero_action(sess)
        sess = client.post(f"/session/{sid}/action", json=action).json()

    assert sess["hand_over"]
    assert sess["last_result"] is not None
    # stacks are conserved across the table (zero-sum nets)
    nets = sess["last_result"]["results_by_player"]
    assert sum(nets.values()) == 0

    # can deal the next hand
    nxt = client.post(f"/session/{sid}/next-hand").json()
    assert nxt["hand_index"] == 1


def test_coaching_matches_phase2_math(client: TestClient):
    # find a spot where the hero is to act
    sess = _new_session(client, seed=3)
    sid = sess["session_id"]
    for _ in range(20):
        if sess["hero_to_act"]:
            break
        if sess["hand_over"]:
            sess = client.post(f"/session/{sid}/next-hand").json()
    assert sess["hero_to_act"]

    coach = client.get(f"/session/{sid}/coach").json()
    assert 0.0 <= coach["equity_pct"] <= 100.0
    # required equity must equal the exact Phase-2 pot-odds computation
    if coach["to_call"] > 0:
        expected = round(required_equity(coach["to_call"], coach["pot"]) * 100, 1)
        assert coach["required_equity_pct"] == expected
    # honesty: the basis is labelled and defers to GTO Wizard
    assert any("GTO Wizard" in note for note in coach["basis"])
    assert coach["verdict"]


def test_hands_are_persisted(client: TestClient):
    sess = _new_session(client, seed=11)
    sid = sess["session_id"]
    guard = 0
    while not sess["hand_over"] and guard < 50:
        guard += 1
        sess = client.post(f"/session/{sid}/action", json=_hero_action(sess)).json()

    hands = client.get("/hands", params={"session_id": sid}).json()
    assert len(hands) >= 1
    h = hands[0]
    assert h["session_id"] == sid
    assert h["hero_cards"]  # recorded

    detail = client.get(f"/hands/{h['id']}").json()
    assert "data" in detail and detail["data"]["actions"]


def _play_hands(client: TestClient, sid: str, n: int) -> None:
    for _ in range(n):
        sess = client.get(f"/session/{sid}").json()
        while not sess["hand_over"]:
            if not sess["hero_to_act"]:
                break
            sess = client.post(f"/session/{sid}/action", json=_hero_action(sess)).json()
        client.post(f"/session/{sid}/next-hand")


def test_my_stats_and_reads_endpoints(client: TestClient):
    sess = _new_session(client, seed=4)
    sid = sess["session_id"]
    _play_hands(client, sid, 6)

    me = client.get("/stats/me", params={"session_id": sid}).json()
    assert me["overall"]["hands"] >= 1
    assert "vpip" in me["overall"] and "vpip" in me["targets"]

    reads = client.get(f"/session/{sid}/reads").json()
    assert set(reads.keys()) == {"1", "2", "3", "4", "5"}
    assert all("hands" in r and "ready" in r for r in reads.values())


def test_review_and_leaks_endpoints(client: TestClient):
    sess = _new_session(client, seed=8)
    sid = sess["session_id"]
    _play_hands(client, sid, 5)

    hands = client.get("/hands", params={"session_id": sid}).json()
    assert hands
    review = client.get(f"/hands/{hands[0]['id']}/review").json()
    assert "streets" in review and "decisions" in review and "leaks" in review

    leaks = client.get("/stats/leaks", params={"session_id": sid}).json()
    assert leaks["hands_reviewed"] >= 1
    assert isinstance(leaks["by_type"], list)


def test_illegal_action_rejected(client: TestClient):
    sess = _new_session(client, seed=5)
    sid = sess["session_id"]
    for _ in range(20):
        if sess["hero_to_act"] or sess["hand_over"]:
            break
    if not sess["hero_to_act"]:
        pytest.skip("hero not to act in this deal")
    # If there's a bet to call, checking is illegal -> 400.
    legal = sess["state"]["legal_actions"]
    if not legal["can_check"]:
        r = client.post(f"/session/{sid}/action", json={"type": "check"})
        assert r.status_code == 400


def test_step_mode_advances_one_bot_at_a_time(client: TestClient):
    """With auto_advance off, the hand starts un-advanced and /advance applies
    exactly one bot action at a time until it's the hero's turn (or hand over)."""
    resp = client.post("/session", json={"seed": 7, "auto_advance": False})
    assert resp.status_code == 200
    state = resp.json()

    # No bot has acted yet: the action log is empty and it's not the hero's turn
    # (someone before the hero is first to act preflop in a 6-max field).
    assert state["state"]["history"] == []

    steps = 0
    while not state["hero_to_act"] and not state["hand_over"]:
        prev_actions = len(state["state"]["history"])
        state = client.post(f"/session/{state['session_id']}/advance").json()
        # each /advance adds exactly one action to the log
        assert len(state["state"]["history"]) == prev_actions + 1
        steps += 1
        assert steps < 50  # guard against an infinite loop

    assert state["hero_to_act"] or state["hand_over"]


def test_history_never_leaks_villain_holes(client: TestClient):
    state = client.post("/session", json={"seed": 3, "auto_advance": False}).json()
    for _ in range(20):
        if state["hero_to_act"] or state["hand_over"]:
            break
        state = client.post(f"/session/{state['session_id']}/advance").json()
    for entry in state["state"]["history"]:
        assert "hole_cards" not in entry  # the log must not carry anyone's cards


def test_showdown_reveals_villain_cards_and_labels(client: TestClient):
    """At a showdown the opponents' cards are revealed (not mucked away) and every
    visible hand carries a 'hand_label'. Hero always has a label."""
    state = client.post("/session", json={"seed": 7, "auto_advance": False}).json()
    sid = state["session_id"]
    # Drive a hand to the end, hero calling everything to reach showdowns.
    for _ in range(400):
        if state["hand_over"]:
            break
        if state["hero_to_act"]:
            legal = state["state"]["legal_actions"]
            act = "check" if legal["can_check"] else "call" if legal["can_call"] else "fold"
            state = client.post(f"/session/{sid}/action", json={"type": act}).json()
        else:
            state = client.post(f"/session/{sid}/advance").json()

    seats = state["state"]["seats"]
    hero_seat = state["hero_seat"]
    # hero always has a label (cards always visible)
    assert seats[hero_seat]["hand_label"]
    live = [s for s in seats if not s["folded"]]
    if len(live) >= 2:  # a genuine showdown
        for s in live:
            assert s["hole_cards"] is not None and len(s["hole_cards"]) == 2
            assert s["hand_label"]
