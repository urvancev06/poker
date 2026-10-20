"""Background Lab jobs (D14): a job runs a simulation in shards on an executor,
reports progress as hands merged, can be cancelled, and its result is the same
report ``run_lab`` gives for the same arguments.
"""

from __future__ import annotations

import time

import pytest

from poker.sim.jobs import JobManager
from poker.sim.lab import run_lab
from poker.sim.runner import DEFAULT_LINEUP


@pytest.fixture
def jobs():
    manager = JobManager(max_workers=2, executor="thread", shard_size=300)
    yield manager
    manager.shutdown()


def _wait(jobs: JobManager, job_id: str, timeout: float = 60.0) -> list[dict]:
    seen = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = jobs.get(job_id)
        seen.append(job)
        if job["state"] in ("done", "cancelled", "failed"):
            return seen
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish: {seen[-1]}")


def test_job_lifecycle_thread_executor(jobs):
    job_id = jobs.submit("simulate", {"lineup": DEFAULT_LINEUP, "hands": 1200, "seed": 0})
    seen = _wait(jobs, job_id)
    done = [j["progress"]["done"] for j in seen]
    assert done == sorted(done)  # never goes backwards
    last = seen[-1]
    assert last["state"] == "done", last
    assert last["progress"] == {"done": 1200, "total": 1200}
    assert last["result"]["hands"] == 1200
    assert len(last["result"]["rows"]) == 5
    assert last["error"] is None
    assert last["job_id"] == job_id and last["kind"] == "simulate"
    assert isinstance(last["elapsed_ms"], int) and last["created_at"]


def test_job_result_matches_run_lab(jobs):
    params = {"lineup": ["station", "tag", "nit"], "hands": 700, "seed": 4,
              "overrides": {"station": {"calldown_freq": 0.9}}}
    job_id = jobs.submit("simulate", params)
    result = _wait(jobs, job_id)[-1]["result"]
    direct = run_lab(**params)
    for key in ("hands", "seed", "lineup", "overrides", "gate_pass", "rows"):
        assert result[key] == direct[key], key


def test_job_cancel_thread_executor():
    jobs = JobManager(max_workers=1, executor="thread", shard_size=500)
    try:
        job_id = jobs.submit("simulate", {"lineup": DEFAULT_LINEUP, "hands": 25_000, "seed": 0})
        time.sleep(0.3)
        t0 = time.monotonic()
        jobs.cancel(job_id)
        seen = _wait(jobs, job_id, timeout=5.0)
        assert seen[-1]["state"] == "cancelled"
        assert time.monotonic() - t0 < 5.0
        assert seen[-1]["progress"]["done"] < 25_000
        time.sleep(1.0)
        assert jobs.get(job_id)["state"] == "cancelled"
        assert jobs.get(job_id)["result"] is None
    finally:
        jobs.shutdown()


def test_cancel_after_done_keeps_done(jobs):
    job_id = jobs.submit("simulate", {"lineup": ["tag", "nit"], "hands": 300, "seed": 1})
    _wait(jobs, job_id)
    assert jobs.cancel(job_id)["state"] == "done"
    assert jobs.get(job_id)["result"]["hands"] == 300


def test_unknown_job_is_none(jobs):
    assert jobs.get("nope") is None
    assert jobs.cancel("nope") is None


def test_bad_submissions_raise(jobs):
    with pytest.raises(ValueError):
        jobs.submit("train", {})
    with pytest.raises(ValueError):
        jobs.submit("simulate", {"lineup": [], "hands": 100})
    with pytest.raises(ValueError):
        jobs.submit("simulate", {"lineup": ["not-an-archetype"], "hands": 100})


def test_hands_are_capped_and_at_least_one(jobs):
    job_id = jobs.submit("simulate", {"lineup": ["tag", "nit"], "hands": 1, "seed": 0})
    last = _wait(jobs, job_id)[-1]
    assert last["state"] == "done", last  # a one-hand run reports, it does not crash (B29)
    assert last["result"]["hands"] == 1
    big = jobs.submit("simulate", {"lineup": ["tag", "nit"], "hands": 10_000_000, "seed": 0})
    assert jobs.get(big)["progress"]["total"] == 25_000
    jobs.cancel(big)


def test_process_executor_runs_a_job():
    jobs = JobManager(max_workers=2, executor="process", shard_size=200)
    try:
        job_id = jobs.submit("simulate", {"lineup": DEFAULT_LINEUP, "hands": 400, "seed": 3})
        last = _wait(jobs, job_id, timeout=120.0)[-1]
        assert last["state"] == "done", last
        assert last["result"]["rows"] == run_lab(lineup=DEFAULT_LINEUP, hands=400, seed=3)["rows"]
    finally:
        jobs.shutdown()
