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
