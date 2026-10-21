"""Lab jobs over HTTP (B33): a simulation is a background job the client polls.

    POST   /lab/jobs        start a job        -> 202 {job_id, state}
    GET    /lab/jobs/{id}   progress + result  -> 200 job | 404
    DELETE /lab/jobs/{id}   cancel             -> 200 {job_id, state} | 404

The registry is in memory (``sim.jobs``), so a server restart forgets every job
and a poll after it answers 404; the Lab then says the run was lost.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from poker.sim.jobs import JobManager
from poker.sim.lab import MAX_LAB_HANDS

from .schemas import DEFAULT_BLINDS, DEFAULT_BUY_IN, DEFAULT_VILLAINS


class LabJobRequest(BaseModel):
    """One Lab job. ``hands`` is validated here (B29): 1 to the Lab cap."""

    kind: str = "simulate"
    lineup: list[str] = Field(default_factory=lambda: list(DEFAULT_VILLAINS) + ["tag"])
    hands: int = Field(default=5_000, ge=1, le=MAX_LAB_HANDS)
    seed: int = 0
    small_blind: int = Field(default=DEFAULT_BLINDS[0], ge=1)
    big_blind: int = Field(default=DEFAULT_BLINDS[1], ge=1)
    starting_stack: int = Field(default=DEFAULT_BUY_IN, ge=1)
    # {archetype_key: {knob: value}}; sanitized server-side against the allowlist.
    overrides: dict[str, dict[str, float]] = Field(default_factory=dict)
    # The bots to seat: v1 archetypes (default) or the v2 engine (beta). An
    # unknown engine is a 422; v2 ignores the v1 knob overrides.
    engine: Literal["v1", "v2"] = "v1"


router = APIRouter()


def _jobs(request: Request) -> JobManager:
    return request.app.state.jobs


@router.post("/lab/jobs", status_code=202)
def create_job(req: LabJobRequest, request: Request) -> dict:
    jobs = _jobs(request)
    try:
        job_id = jobs.submit(req.kind, req.model_dump(exclude={"kind"}))
    except ValueError as exc:  # unknown kind, lineup outside 2-6 seats, unknown archetype
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    job = jobs.get(job_id)
    return {"job_id": job_id, "state": job["state"] if job else "queued"}


@router.get("/lab/jobs/{job_id}")
def get_job(job_id: str, request: Request) -> dict:
    job = _jobs(request).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="lab job not found (the server may have restarted)")
    return job


@router.delete("/lab/jobs/{job_id}")
def cancel_job(job_id: str, request: Request) -> dict:
    job = _jobs(request).cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="lab job not found (the server may have restarted)")
    return {"job_id": job["job_id"], "state": job["state"]}
