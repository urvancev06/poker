"""The Lab job API (B33, B29): a run is a background job the client polls, so the
table never waits for the Lab, and bad input is a 4xx, never a 500.

    POST   /lab/jobs        -> 202 {job_id, state}
    GET    /lab/jobs/{id}   -> 200 {job_id, kind, state, progress, result, error, ...}
    DELETE /lab/jobs/{id}   -> 200 {job_id, state}
"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.sim.runner import DEFAULT_LINEUP


@pytest.fixture
def client():
    with TestClient(create_app("sqlite://", job_executor="thread")) as c:
        yield c


def _poll(client: TestClient, job_id: str, timeout: float = 60.0) -> list[dict]:
    seen = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = client.get(f"/lab/jobs/{job_id}")
        assert r.status_code == 200
        seen.append(r.json())
        if seen[-1]["state"] in ("done", "cancelled", "failed"):
            return seen
        time.sleep(0.05)
    raise AssertionError(f"job did not finish: {seen[-1]}")


def test_job_endpoints_lifecycle(client):
    r = client.post("/lab/jobs", json={"kind": "simulate", "lineup": DEFAULT_LINEUP, "hands": 1500, "seed": 0})
    assert r.status_code == 202
    body = r.json()
    assert set(body) == {"job_id", "state"} and body["state"] in ("queued", "running")
    seen = _poll(client, body["job_id"])
    last = seen[-1]
    assert last["state"] == "done", last
    assert last["progress"] == {"done": 1500, "total": 1500}
    assert len(last["result"]["rows"]) == 5 and last["result"]["hands"] == 1500
    d = client.delete(f"/lab/jobs/{body['job_id']}")
    assert d.status_code == 200 and d.json() == {"job_id": body["job_id"], "state": "done"}


def test_cancel_endpoint(client):
    job_id = client.post("/lab/jobs", json={"kind": "simulate", "hands": 25_000, "seed": 0}).json()["job_id"]
    time.sleep(0.2)
    d = client.delete(f"/lab/jobs/{job_id}")
    assert d.status_code == 200 and d.json()["state"] == "cancelled"
    assert _poll(client, job_id, timeout=5.0)[-1]["state"] == "cancelled"


def test_unknown_job_404(client):
    assert client.get("/lab/jobs/nope").status_code == 404
    assert client.delete("/lab/jobs/nope").status_code == 404


def test_bad_kind_400(client):
    r = client.post("/lab/jobs", json={"kind": "train", "hands": 100})
    assert r.status_code == 400 and "kind" in r.json()["detail"]


def test_bad_lineups_400(client):
    assert client.post("/lab/jobs", json={"kind": "simulate", "lineup": [], "hands": 100}).status_code == 400
    bad = client.post("/lab/jobs", json={"kind": "simulate", "lineup": ["not-an-archetype"], "hands": 100})
    assert bad.status_code == 400


@pytest.mark.parametrize("hands", [0, -5, 25_001])
def test_hands_out_of_range_422(client, hands):
    """B29: hands must be 1 to 25,000; the frontend validates first, and the API
    answers anything else with a readable 422 instead of a 500."""
    r = client.post("/lab/jobs", json={"kind": "simulate", "hands": hands})
    assert r.status_code == 422


def test_one_hand_job_finishes(client):
    job_id = client.post("/lab/jobs", json={"kind": "simulate", "lineup": ["tag", "nit"], "hands": 1}).json()["job_id"]
    last = _poll(client, job_id)[-1]
    assert last["state"] == "done", last
    assert last["result"]["hands"] == 1


def test_lab_simulate_wrapper_still_answers(client):
    r = client.post("/lab/simulate", json={"lineup": ["tag", "nit"], "hands": 300, "seed": 0})
    assert r.status_code == 200
    assert r.json()["hands"] == 300 and r.json()["rows"]
    assert client.post("/lab/simulate", json={"lineup": ["tag", "nit"], "hands": 1}).status_code == 200
    assert client.post("/lab/simulate", json={"lineup": [], "hands": 100}).status_code == 400


def test_health_stays_fast_while_a_job_runs():
    """B33: with the process pool the simulation runs in other interpreters, so the
    server keeps answering while a Lab job plays thousands of hands."""
    with TestClient(create_app("sqlite://", job_executor="process", job_workers=2)) as client:
        job_id = client.post("/lab/jobs", json={"kind": "simulate", "hands": 4000, "seed": 0}).json()["job_id"]
        deadline = time.monotonic() + 60
        while client.get(f"/lab/jobs/{job_id}").json()["state"] != "running":
            assert time.monotonic() < deadline, "the job never started"
            time.sleep(0.02)
        times = []
        for _ in range(20):
            t0 = time.perf_counter()
            assert client.get("/health").status_code == 200
            times.append(time.perf_counter() - t0)
            time.sleep(0.01)
        assert client.get(f"/lab/jobs/{job_id}").json()["state"] == "running"
        assert max(times) < 0.05, f"slowest /health {max(times) * 1000:.0f} ms"
        assert _poll(client, job_id, timeout=120)[-1]["state"] == "done"


@pytest.mark.parametrize("seats", [1, 7, 30])
def test_lineup_sizes_outside_2_to_6_are_400(client, seats):
    """A table seats 2 to 6: anything else is refused at once, not accepted and
    then failed inside the job."""
    r = client.post("/lab/jobs", json={"kind": "simulate", "lineup": ["tag"] * seats, "hands": 100})
    assert r.status_code == 400 and "2 to 6" in r.json()["detail"]
