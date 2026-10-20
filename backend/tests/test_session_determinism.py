"""The interactive session on seeded streams and the engine ledger.

* The same seed and the same hero actions replay the same session.
* A different hero line leaves later deals unchanged (the deck of hand h depends
  only on the seed and h; each bot decision has its own stream).
* The stored pot is the ledger pot (B5): the chips actually in the middle, net of
  uncalled bets, posted by the right seats heads-up.
* The seed reveals future decks, so it is stored server-side only.
"""

from __future__ import annotations

import hashlib
import json

from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.api.serializers import session_to_dict
from poker.engine import Action, ActionType, Ledger
from poker.game import GameSession

VILLAINS = ["nit", "tag", "lag", "station", "maniac"]


def _hero_policy(gs: GameSession) -> Action:
    """Deterministic: check if free, call small bets, otherwise fold."""
    la = gs.state().legal_actions
    if la.can_check:
        return Action(ActionType.CHECK)
    if la.can_call and la.call_amount <= 10:
        return Action(ActionType.CALL)
    return Action(ActionType.FOLD)


def _play_hand(gs: GameSession, policy=_hero_policy) -> dict:
    gs.start_hand()
    while not gs.hand_over:
        gs.submit_hero_action(policy(gs))
    return gs.last_result


def _fingerprint(r: dict) -> str:
    return hashlib.sha256(json.dumps([r["actions"], r["hero_cards"], r["board"]]).encode()).hexdigest()


def test_same_seed_same_actions_same_log():
    a = GameSession("a", villains=VILLAINS, seed=42)
    b = GameSession("b", villains=VILLAINS, seed=42)
    fa = [_fingerprint(_play_hand(a)) for _ in range(30)]
    fb = [_fingerprint(_play_hand(b)) for _ in range(30)]
    assert fa == fb


def test_hero_line_does_not_change_later_deals():
    fold_first = lambda gs: Action(ActionType.FOLD) if not gs.state().legal_actions.can_check else Action(ActionType.CHECK)  # noqa: E731
    call_down = lambda gs: Action(ActionType.CHECK if gs.state().legal_actions.can_check else ActionType.CALL)  # noqa: E731
    a = GameSession("a", villains=VILLAINS, seed=9)
    b = GameSession("b", villains=VILLAINS, seed=9)
    # Find a hand-0 deal where the hero gets to act, then diverge there.
    _play_hand(a, fold_first)
    _play_hand(b, call_down)
    assert a.last_result["actions"] != b.last_result["actions"]
    for _ in range(10):
        a.start_hand()
        b.start_hand()
        assert a.hand.dealt_holes() == b.hand.dealt_holes()
        while not a.hand_over:
            a.submit_hero_action(fold_first(a))
        while not b.hand_over:
            b.submit_hero_action(fold_first(b))
        assert a.last_result["board"] == b.last_result["board"]


def test_stored_pot_equals_ledger_payouts():
    gs = GameSession("t", villains=VILLAINS, seed=5)
    for _ in range(50):
        r = _play_hand(gs)
        led = Ledger.from_dict(r["ledger"])
        results_by_seat = [r["results_by_player"][p] for p in r["seat_to_player"]]
        assert r["pot"] == led.pot == sum(led.payouts(results_by_seat))
        assert r["rake"] == 0
        assert r["versions"] == {"engine": "v1", "ledger": 1}


class _CheckFold:
    """A villain that checks when free and folds to any bet (fixes the line)."""

    name = "Check-fold"

    def act(self, ctx, rng):
        return Action(ActionType.CHECK if ctx.legal.can_check else ActionType.FOLD)


def test_stored_pot_counts_only_called_chips_b5():
    """Heads-up at 1/2, the hero raises to 6 whenever it can and the villain folds.
    As the button (SB) the pot is the BB's 2 plus the 2 of the hero's raise it
    called off: 4. As the BB the villain folds its small blind: the pot is 1 + 1
    (the BB's uncalled 1 comes back): 2. The old action-log replay said 7 and 3:
    it counted uncalled chips and had the heads-up blinds on the wrong seats."""
    gs = GameSession("hu", villains=["nit"], seed=3)
    gs._bots[1] = _CheckFold()
    seen = []
    for _ in range(4):
        gs.start_hand()
        while not gs.hand_over:
            la = gs.state().legal_actions
            gs.submit_hero_action(Action(ActionType.RAISE, 6) if la.can_aggress else Action(ActionType.CHECK))
        r = gs.last_result
        seen.append((r["hero_position"], r["pot"]))
    assert sorted(set(seen)) == [("BB", 2), ("SB", 4)]


def test_stored_actions_carry_ledger_amounts():
    gs = GameSession("t", villains=VILLAINS, seed=6)
    for _ in range(10):
        r = _play_hand(gs)
        entries = r["ledger"]["entries"]
        stored = [(a["seat"], a["action"], a["added"], a["street_total"], a["all_in"], a["stack_after"]) for a in r["actions"]]
        ledger_actions = [
            (e["seat"], e["action"], e["added"], e["street_total"], e["all_in"], e["stack_after"])
            for e in entries if e["kind"] == "action"
        ]
        assert stored == ledger_actions
        assert sum(e["added"] for e in entries) == r["pot"]
        assert r["seat_to_player"] == [(r["button_player"] + 1 + s) % 6 for s in range(6)]


def test_seed_is_never_exposed():
    client = TestClient(create_app("sqlite://"))
    sess = client.post("/session", json={"seed": 1234}).json()
    sid = sess["session_id"]
    for _ in range(3):
        while not sess["hand_over"]:
            legal = sess["state"]["legal_actions"]
            act = "check" if legal["can_check"] else "fold"
            sess = client.post(f"/session/{sid}/action", json={"type": act}).json()
        body = json.dumps(sess)
        assert "truth" not in body and "1234" not in body
        sess = client.post(f"/session/{sid}/next-hand").json()
    hands = client.get("/hands", params={"session_id": sid}).json()
    assert hands
    for h in hands:
        detail = client.get(f"/hands/{h['id']}").json()
        assert "truth" not in detail["data"] and "1234" not in json.dumps(detail)


def test_seed_is_kept_server_side():
    gs = GameSession("t", villains=VILLAINS, seed=77)
    r = _play_hand(gs)
    assert r["truth"] == {"seed": 77}
    assert "truth" not in json.dumps(session_to_dict(gs))
    unseeded = GameSession("u", villains=VILLAINS)
    assert isinstance(unseeded.seed, int) and 0 <= unseeded.seed < 2**63
