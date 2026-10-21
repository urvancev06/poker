"""Engine v2 in the simulator and the Lab (P3.11).

``run(..., engine="v2")`` seats one PersonaBot per lineup entry, each persona
drawn from ``stream(seed, "persona", seat)``. The run stays a pure function of
its arguments, so shards and repeats agree exactly, and v1 stays the default.
"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.bots import PersonaBot
from poker.sim.jobs import simulate_params
from poker.sim.lab import run_lab
from poker.sim.runner import DEFAULT_LINEUP, _bots, iter_hands, run, shard_spec

_ARCHS = ["Nit", "TAG", "LAG", "Calling Station", "Maniac"]


def test_v2_spec_seats_persona_bots_and_v1_stays_default():
    assert shard_spec()["engine"] == "v1"
    bots = _bots(shard_spec(DEFAULT_LINEUP, seed=2, engine="v2"))
    assert all(isinstance(b, PersonaBot) for b in bots)
    assert [b.name for b in bots] == ["Nit", "TAG", "LAG", "Calling Station", "Maniac", "TAG"]
    # Each seat draws its own persona: the two TAGs are different people.
    assert bots[1].persona.dials != bots[5].persona.dials
    assert [b.persona.persona_id for b in bots] == [f"p{i}" for i in range(6)]
    with pytest.raises(ValueError):
        shard_spec(engine="v3")


def test_v2_run_conserves_and_is_deterministic():
    spec = shard_spec(DEFAULT_LINEUP, seed=2, engine="v2")
    for summaries in iter_hands(spec, 0, 300):
        assert sum(s.net for s in summaries) == 0
    a = run(600, seed=2, engine="v2")
    b = run(600, seed=2, engine="v2")
    assert [a.line(x) for x in _ARCHS] == [b.line(x) for x in _ARCHS]
    assert a.to_counts() != run(600, seed=2).to_counts()  # v1 is a different run


def test_v2_sharding_identical():
    whole = run(600, seed=4, engine="v2")
    sharded = run(600, seed=4, engine="v2", workers=3, shard_size=200)
    assert whole.to_counts() == sharded.to_counts()


def test_v2_lab_ignores_overrides_and_says_engine():
    res = run_lab(DEFAULT_LINEUP, 300, seed=1, engine="v2", overrides={"tag": {"cbet_freq": 0.0}})
    assert res["engine"] == "v2" and res["overrides"] == {}
    assert sorted(r["archetype"] for r in res["rows"]) == sorted(_ARCHS)
    assert run_lab(DEFAULT_LINEUP, 50, seed=1)["engine"] == "v1"


def test_simulate_params_carry_the_engine():
    p = simulate_params({"lineup": DEFAULT_LINEUP, "engine": "v2", "overrides": {"tag": {"cbet_freq": 0.1}}})
    assert p["engine"] == "v2" and p["overrides"] == {}
    assert simulate_params({"lineup": DEFAULT_LINEUP})["engine"] == "v1"
    with pytest.raises(ValueError):
        simulate_params({"lineup": DEFAULT_LINEUP, "engine": "v9"})


def _poll(client: TestClient, job_id: str, timeout: float = 120.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/lab/jobs/{job_id}").json()
        if job["state"] in ("done", "cancelled", "failed"):
            return job
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_v2_lab_job_via_api():
    with TestClient(create_app("sqlite://", job_executor="thread")) as client:
        r = client.post("/lab/jobs", json={"lineup": DEFAULT_LINEUP, "hands": 600, "seed": 3, "engine": "v2"})
        assert r.status_code == 202
        job = _poll(client, r.json()["job_id"])
        assert job["state"] == "done", job
        assert job["result"]["engine"] == "v2" and job["result"]["hands"] == 600
        assert sorted(row["archetype"] for row in job["result"]["rows"]) == sorted(_ARCHS)
        bad = client.post("/lab/jobs", json={"lineup": DEFAULT_LINEUP, "hands": 10, "engine": "v3"})
        assert bad.status_code == 422


def test_v2_ordering_smoke():
    """§5 keeps the ordering tests: informative at 6,000 hands, but asserted."""
    acc = run(6000, seed=11, engine="v2", workers=4, shard_size=1500)
    vpip = {a: acc.line(a).vpip for a in _ARCHS}
    print({a: round(v, 1) for a, v in vpip.items()})
    assert vpip["Nit"] < vpip["TAG"] < vpip["LAG"]
    assert vpip["Calling Station"] > vpip["TAG"]
