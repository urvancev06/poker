"""Background Lab jobs (B33).

A Lab run used to execute on the request thread, so a 25,000-hand simulation
held the server for over a minute and the table could not answer. Now a run is
a job: ``submit`` returns an id at once, the hands are played in shards on an
executor (a process pool in the app, so the work also leaves the server's GIL),
and ``get`` reports progress and, at the end, the same report ``run_lab`` gives.

* Shards of ``shard_size`` hands are submitted in order and merged in order;
  progress is the number of hands merged. Hand h depends only on (seed, h), so
  the merged result equals a single-process run exactly.
* ``cancel`` cancels the shards that have not started and marks the job
  cancelled at once; shards already running finish and are discarded. A job
  that fails drops its unstarted shards the same way, so they do not hold the
  pool for the next job.
* A worker process that dies (the OOM killer, a crash) breaks a process pool
  for good. The jobs running on it fail, and the pool is thrown away so the
  next job starts a fresh one; a job that finds the pool already broken has
  played nothing yet, so it simply starts again on a fresh pool.
* States: ``queued`` -> ``running`` -> ``done`` | ``cancelled`` | ``failed``.
* The registry lives in memory: a server restart forgets every job (the API
  answers 404, and the Lab says the run was lost).
"""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import BrokenExecutor, CancelledError, Executor, Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from .lab import clamp_hands, lab_report, sanitize_overrides, validate_lineup
from .runner import (
    DEFAULT_BLINDS,
    DEFAULT_SHARD,
    DEFAULT_STACK,
    process_pool,
    run_shard,
    shard_bounds,
    shard_spec,
)
from .stats import StatsAccumulator

KINDS = ("simulate",)
TERMINAL = frozenset({"done", "cancelled", "failed"})
# Finished jobs kept for polling; older ones are forgotten first.
KEEP_JOBS = 64


@dataclass
class _Job:
    job_id: str
    kind: str
    params: dict
    total: int
    created_at: str
    started: float
    state: str = "queued"
    done: int = 0
    result: dict | None = None
    error: str | None = None
    finished: float | None = None
    futures: list[Future] = field(default_factory=list)

    def as_dict(self) -> dict:
        end = self.finished if self.finished is not None else time.perf_counter()
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "state": self.state,
            "progress": {"done": self.done, "total": self.total},
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "elapsed_ms": round((end - self.started) * 1000),
        }


def simulate_params(params: dict) -> dict:
    """A simulate job's parameters, validated and normalised. ValueError for a
    lineup outside 2 to 6 seats or an unknown archetype (the API turns it into a
    400)."""
    lineup = validate_lineup(list(params.get("lineup") or []))
    sb = int(params.get("small_blind", DEFAULT_BLINDS[0]))
    bb = int(params.get("big_blind", DEFAULT_BLINDS[1]))
    if not 0 < sb <= bb:
        raise ValueError("blinds must satisfy 0 < small blind <= big blind")
    stack = int(params.get("starting_stack", DEFAULT_STACK))
    if stack < bb:
        raise ValueError("the starting stack must be at least one big blind")
    return {
        "lineup": lineup,
        "hands": clamp_hands(params.get("hands", 1)),
        "seed": int(params.get("seed", 0)),
        "blinds": (sb, bb),
        "starting_stack": stack,
        "overrides": sanitize_overrides(params.get("overrides") or {}),
    }


class JobManager:
    """Runs Lab jobs on a shared executor and remembers their state."""

    def __init__(
        self,
        max_workers: int = 2,
        executor: Literal["process", "thread"] = "process",
        shard_size: int = DEFAULT_SHARD,
    ) -> None:
        if executor not in ("process", "thread"):
            raise ValueError("executor must be 'process' or 'thread'")
        self._kind = executor
        self._max_workers = max_workers
        self._shard_size = shard_size
        self._pool: Executor | None = None
        self._lock = threading.Lock()
        self._jobs: dict[str, _Job] = {}
        self._closed = False

    # ------------------------------------------------------------------ #
    def _executor(self) -> Executor:
        with self._lock:
            if self._closed:
                raise RuntimeError("the job manager has shut down")
            if self._pool is None:
                # Created on first use: a process pool spawns interpreters, which
                # a server that never runs the Lab should not pay for.
                self._pool = (
                    process_pool(self._max_workers)
                    if self._kind == "process"
                    else ThreadPoolExecutor(max_workers=self._max_workers, thread_name_prefix="lab")
                )
            return self._pool

    def _discard(self, pool: Executor) -> None:
        """Throw away a broken pool (a dead worker breaks it for good), so the
        next use builds a new one."""
        with self._lock:
            if self._pool is not pool:
                return  # another job already replaced it
            self._pool = None
        pool.shutdown(wait=False, cancel_futures=True)

    def submit(self, kind: str, params: dict) -> str:
        if kind not in KINDS:
            raise ValueError(f"unknown job kind: {kind!r} (expected one of {', '.join(KINDS)})")
        clean = simulate_params(params)
        job = _Job(
            job_id=uuid.uuid4().hex[:12],
            kind=kind,
            params=clean,
            total=clean["hands"],
            created_at=datetime.now(timezone.utc).isoformat(),
            started=time.perf_counter(),
        )
        with self._lock:
            self._jobs[job.job_id] = job
            self._prune()
        threading.Thread(target=self._drive, args=(job,), name=f"lab-job-{job.job_id}", daemon=True).start()
        return job.job_id

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return None if job is None else job.as_dict()

    def cancel(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.state not in TERMINAL:
                self._mark_cancelled(job)
            return job.as_dict()

    def shutdown(self, wait: bool = True) -> None:
        """Cancel every job and stop the executor. Shards that have not started
        are dropped; with ``wait`` the ones already running (a few seconds at
        most) are waited for, so no simulation outlives the app's shutdown."""
        with self._lock:
            self._closed = True
            for job in self._jobs.values():
                if job.state not in TERMINAL:
                    self._mark_cancelled(job)
            pool, self._pool = self._pool, None
        if pool is not None:
            pool.shutdown(wait=wait, cancel_futures=True)

    # ------------------------------------------------------------------ #
    def _mark_cancelled(self, job: _Job) -> None:  # caller holds the lock
        job.state = "cancelled"
        job.finished = time.perf_counter()
        for fut in job.futures:
            fut.cancel()

    def _prune(self) -> None:  # caller holds the lock
        if len(self._jobs) <= KEEP_JOBS:
            return
        for job_id in [j.job_id for j in self._jobs.values() if j.state in TERMINAL]:
            if len(self._jobs) <= KEEP_JOBS:
                break
            del self._jobs[job_id]

    def _drive(self, job: _Job) -> None:
        """The job's own thread: submit the shards, merge them in order."""
        p = job.params
        pool: Executor | None = None
        try:
            spec = shard_spec(p["lineup"], p["seed"], p["blinds"], p["starting_stack"], p["overrides"])
            bounds = shard_bounds(p["hands"], self._shard_size)
            pool = self._executor()
            try:
                futures = [pool.submit(run_shard, spec, lo, hi) for lo, hi in bounds]
            except BrokenExecutor:
                # The pool broke while idle; none of this job has run, so start
                # it on a fresh pool.
                self._discard(pool)
                pool = self._executor()
                futures = [pool.submit(run_shard, spec, lo, hi) for lo, hi in bounds]
            with self._lock:
                job.futures = futures
                if job.state == "cancelled":  # cancelled while we were submitting
                    for fut in futures:
                        fut.cancel()
                    return
            acc = StatsAccumulator(big_blind=p["blinds"][1])
            for (_, hi), fut in zip(bounds, futures):
                counts = self._wait(job, fut)
                if counts is None:
                    return  # cancelled
                acc.merge(counts)
                with self._lock:
                    if job.state == "cancelled":
                        return
                    job.done = hi
            elapsed_ms = round((time.perf_counter() - job.started) * 1000)
            report = lab_report(acc, p["lineup"], p["hands"], p["seed"], p["overrides"], elapsed_ms)
            with self._lock:
                if job.state != "cancelled":
                    job.result = report
                    job.state = "done"
                    job.finished = time.perf_counter()
        except Exception as exc:  # noqa: BLE001 - reported on the job, never raised
            with self._lock:
                if job.state != "cancelled":
                    job.state = "failed"
                    job.error = f"{type(exc).__name__}: {exc}"
                    job.finished = time.perf_counter()
                for fut in job.futures:  # the shards not started yet
                    fut.cancel()
            if isinstance(exc, BrokenExecutor) and pool is not None:
                self._discard(pool)

    def _wait(self, job: _Job, fut: Future) -> dict | None:
        """One shard's counts, or None once the job is cancelled."""
        while True:
            with self._lock:
                if job.state == "cancelled":
                    return None
                if job.state == "queued" and (fut.running() or fut.done()):
                    job.state = "running"
            try:
                return fut.result(timeout=0.05)
            except FutureTimeout:
                continue
            except CancelledError:
                return None
