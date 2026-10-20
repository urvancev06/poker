"""The interactive session at the new chip unit, and one lock per session.

* New sessions play 5/10 with 1,000-chip (100bb) buy-ins (decision 1). Old stored
  hands keep their own blinds; nothing here touches them.
* Every route that reads or changes a session holds that session's lock, so a
  double-click, a coach fetch during ``/advance`` or a Lab run in another thread
  can never interleave two mutations: no 500s, and no chips created or lost.
"""

from __future__ import annotations

import random
import sys
import threading

from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.game import GameSession

VILLAINS = ["nit", "tag", "lag", "station", "maniac"]


def test_session_defaults_are_5_10_1000():
    gs = GameSession("t", villains=VILLAINS)
    assert gs.blinds == (5, 10)
    assert gs.buy_in == 1000
    assert gs.stacks == [1000] * 6

    client = TestClient(create_app("sqlite://"))
    state = client.post("/session", json={}).json()
    assert state["state"]["blinds"] == [5, 10]
    assert state["stacks_by_player"] == [1000] * 6


def test_session_has_a_reentrant_lock():
    gs = GameSession("t", villains=VILLAINS)
    with gs.lock:
        with gs.lock:  # re-entrant: a route can call a locked session method
            gs.start_hand()
    assert gs.hand is not None


# "act" reads the state and then answers it (check, call up to 5bb, else fold), so
# hands progress; a raw "check" is the stale double-click. "advance" and "act" are
# listed twice so most requests move the hand along.
_ROUTES = ("advance", "get", "coach", "reads", "check", "act", "next", "advance", "act")


def _end_stacks(data: dict) -> list[int]:
    """Each player's stack after the hand (start stack plus result)."""
    n = len(data["seat_to_player"])
    out = [0] * n
    for seat, player in enumerate(data["seat_to_player"]):
        out[player] = data["start_stacks"][seat] + data["results_by_player"][str(player)]
    return out


def test_concurrent_requests_on_one_session():
    """Review Focus 3: eight clients hammer one session with a random mix of
    requests. Every answer is a 200, 400 or 409, the hands are persisted once
    each and in order, every hand is zero-sum, and every chip a player carries
    into a hand is the chip they left the previous one with (or a rebuy)."""
    app = create_app("sqlite://")
    boot = TestClient(app)
    sess = boot.post("/session", json={"seed": 11, "auto_advance": False}).json()
    sid = sess["session_id"]

    statuses: list[int] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def worker(i: int) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        rng = random.Random(i)
        try:
            for _ in range(25):
                route = rng.choice(_ROUTES)
                if route == "advance":
                    r = client.post(f"/session/{sid}/advance")
                elif route == "get":
                    r = client.get(f"/session/{sid}")
                elif route == "coach":
                    r = client.get(f"/session/{sid}/coach")
                elif route == "reads":
                    r = client.get(f"/session/{sid}/reads")
                elif route == "check":
                    r = client.post(f"/session/{sid}/action", json={"type": "check"})
                elif route == "act":
                    la = client.get(f"/session/{sid}").json()["state"]["legal_actions"]
                    kind = (
                        "check" if la and la["can_check"]
                        else "call" if la and la["can_call"] and la["call_amount"] <= 50
                        else "fold"
                    )
                    r = client.post(f"/session/{sid}/action", json={"type": kind})
                else:
                    r = client.post(f"/session/{sid}/next-hand")
                with lock:
                    statuses.append(r.status_code)
        except BaseException as exc:  # pragma: no cover - reported below
            errors.append(exc)

    # Switch threads far more often than the default 5 ms, so an unlocked
    # read-modify-write is actually interleaved within a short test.
    old = sys.getswitchinterval()
    sys.setswitchinterval(1e-6)
    try:
        threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    finally:
        sys.setswitchinterval(old)

    assert not errors
    assert set(statuses) <= {200, 400, 409}, sorted(set(statuses))
    assert len(statuses) == 200

    rows = boot.get("/hands", params={"session_id": sid, "limit": 1000}).json()
    datas = sorted(
        (boot.get(f"/hands/{row['id']}").json()["data"] for row in rows),
        key=lambda d: d["hand_index"],
    )
    assert [d["hand_index"] for d in datas] == list(range(len(datas)))
    final = boot.get(f"/session/{sid}").json()
    finished = final["hand_index"]
    assert finished >= 1, "no hand finished, so the chip checks below would test nothing"
    assert len(datas) == finished

    bb, buy_in = 10, 1000
    for d in datas:
        assert sum(d["results_by_player"].values()) == 0
    for prev, nxt in zip(datas, datas[1:]):
        carried = [s if s >= bb else buy_in for s in _end_stacks(prev)]
        start = [0] * len(carried)
        for seat, player in enumerate(nxt["seat_to_player"]):
            start[player] = nxt["start_stacks"][seat]
        assert start == carried
    if datas:
        last = _end_stacks(datas[-1])
        if final["hand_over"]:
            assert final["stacks_by_player"] == last
        else:  # a hand in progress: stacks are its start stacks (after rebuys)
            assert final["stacks_by_player"] == [s if s >= bb else buy_in for s in last]
