"""FastAPI application: the API the frontend talks to.

Endpoints:
    GET  /health                       liveness
    POST /session                      start a session (choose archetypes, blinds, stacks) + deal hand 1
    GET  /session/{id}                 current state (hero viewpoint) + session info
    POST /session/{id}/action          submit the hero's action; bots auto-respond
    POST /session/{id}/advance         step one bot action (watch-the-hand pacing);
                                       ?warm_coach=true builds the flop's equity matrix
    POST /session/{id}/next-hand       deal the next hand
    GET  /session/{id}/coach           computed coaching for the hero's current spot
    GET  /session/{id}/reads           per-bot HUD reads (past the sample threshold)
    GET  /stats/me                     hero stats vs target bands (?last=N to window it)
    GET  /stats/leaks                  computed leak report over recent hands
    GET  /hands                        list persisted hands
    GET  /hands/{id}                   one persisted hand (full data for replay)
    GET  /hands/{id}/review            street-by-street replay + coaching + leaks
    GET  /lab/archetypes               bot-lab metadata (target bands + tunable knobs)
    POST /lab/jobs                     start a background Lab simulation (202 + job id)
    GET  /lab/jobs/{id}                a job's progress and, when done, its report
    DELETE /lab/jobs/{id}              cancel a job
    POST /lab/simulate                 (compatibility) run a sim as a job and wait for it
    POST /lab/cfr                      train CFR on Kuhn poker (learning module)

Run:  backend/.venv/bin/uvicorn poker.api.app:app --reload
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from poker import __version__
from poker.coach import build_coaching, leak_summary, review_hand_cached
from poker.db import HandRecord, get_hand, init_db, list_hands, make_engine, make_session_factory, save_hand
from poker.db.models import LEGACY_BLINDS, blinds_of
from poker.engine import Action, ActionType, IllegalAction
from poker.game import GameSession
from poker.game.session import public_result
from poker.learn import train as train_cfr
from poker.sim.hero_stats import decision_seconds, hero_report
from poker.sim.jobs import JobManager
from poker.sim.lab import archetypes_info

from .lab_jobs import router as lab_jobs_router
from .schemas import ActionRequest, CfrRequest, CreateSessionRequest, LabSimulateRequest
from .serializers import session_to_dict

_ACTION_TYPES = {
    "fold": ActionType.FOLD,
    "check": ActionType.CHECK,
    "call": ActionType.CALL,
    "bet": ActionType.BET,
    "raise": ActionType.RAISE,
}


def _warn_if_multi_worker() -> None:
    """Sessions are per-process state; more than one worker breaks them silently."""
    import os
    import warnings

    for var in ("WEB_CONCURRENCY", "UVICORN_WORKERS"):
        raw = os.environ.get(var)
        if raw and raw.strip().isdigit() and int(raw) > 1:
            raise RuntimeError(
                f"{var}={raw}: this app keeps game sessions in process memory and must "
                "run with exactly one worker. Start it with --workers 1."
            )
    if os.environ.get("POKER_ALLOW_MULTI_WORKER"):
        warnings.warn(
            "POKER_ALLOW_MULTI_WORKER is set: sessions will not be shared between "
            "workers and requests will intermittently 404.",
            RuntimeWarning,
            stacklevel=2,
        )


def create_app(
    db_url: str | None = None,
    *,
    job_executor: Literal["process", "thread"] = "process",
    job_workers: int = 2,
) -> FastAPI:
    """The app. Lab jobs run on ``job_workers`` processes (spawned on first use),
    so a long simulation never holds the server; tests pass ``"thread"``."""
    engine = make_engine(db_url) if db_url else make_engine()
    init_db(engine)
    SessionFactory = make_session_factory(engine)
    jobs = JobManager(max_workers=job_workers, executor=job_executor)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        jobs.shutdown()

    app = FastAPI(title="Poker", version=__version__, lifespan=lifespan)
    # Local-first dev: the Vite dev server (any localhost port) may call the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Sessions live in this process's memory. With more than one worker, requests
    # land on whichever worker the OS picks and 404 for a session that exists,
    # which reads as a network fault. Fail loudly at startup instead.
    _warn_if_multi_worker()

    app.state.sessions: dict[str, GameSession] = {}
    app.state.saved: dict[str, set[int]] = {}
    app.state.jobs = jobs
    app.include_router(lab_jobs_router)

    def get_db():
        db = SessionFactory()
        try:
            yield db
        finally:
            db.close()

    def _session(session_id: str) -> GameSession:
        gs = app.state.sessions.get(session_id)
        if gs is None:
            raise HTTPException(status_code=404, detail="session not found")
        return gs

    def _persist_if_finished(gs: GameSession, db: Session) -> None:
        result = gs.last_result
        if result is None:
            return
        saved = app.state.saved.setdefault(gs.session_id, set())
        if result["hand_index"] in saved:
            return
        record = HandRecord(
            session_id=result["session_id"],
            hand_index=result["hand_index"],
            hero_position=result["hero_position"],
            hero_cards=result["hero_cards"],
            board=result["board"],
            pot=result["pot"],
            hero_net=result["hero_net"],
            went_to_showdown=result["went_to_showdown"],
            data=result,
        )
        save_hand(db, record)
        saved.add(result["hand_index"])

    # --- routes -------------------------------------------------------- #
    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "version": __version__}

    @app.post("/session")
    def create_session(req: CreateSessionRequest, db: Session = Depends(get_db)) -> dict:
        sid = uuid4().hex[:12]
        # Build AND deal before registering: a session that fails to deal must not
        # end up in the registry, and bad input has to surface as a 400, not a 500.
        try:
            gs = GameSession(
                session_id=sid,
                villains=req.villains,
                blinds=(req.small_blind, req.big_blind),
                buy_in=req.buy_in,
                seed=req.seed,
                auto_advance=req.auto_advance,
            )
            gs.start_hand()
        except (ValueError, AssertionError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        app.state.sessions[sid] = gs
        _persist_if_finished(gs, db)
        return session_to_dict(gs)

    @app.post("/session/{session_id}/advance")
    def advance(session_id: str, warm_coach: bool = False, db: Session = Depends(get_db)) -> dict:
        """Step a single pending bot action (for watch-the-hand pacing). No-op
        when it's the hero's turn or the hand is over.

        ``warm_coach`` (the client sends it while the coach is on, D18): once the
        hand is on the flop with the hero in it, build the flop's equity matrix
        here, inside the bots' pacing, so the hero's flop coach reads it warm."""
        gs = _session(session_id)
        with gs.lock:
            gs.advance_one()
            if warm_coach:
                gs.warm_coach_matrix()
            _persist_if_finished(gs, db)
            return session_to_dict(gs)

    @app.get("/session/{session_id}")
    def get_state(session_id: str) -> dict:
        gs = _session(session_id)
        with gs.lock:
            return session_to_dict(gs)

    @app.post("/session/{session_id}/action")
    def submit_action(session_id: str, req: ActionRequest, db: Session = Depends(get_db)) -> dict:
        gs = _session(session_id)
        atype = _ACTION_TYPES.get(req.type.lower())
        if atype is None:
            raise HTTPException(status_code=400, detail=f"unknown action type: {req.type}")
        # One lock across check-act-persist: a double-click's second request sees
        # the first one's result, never a half-applied action.
        with gs.lock:
            if not gs.hero_to_act:
                raise HTTPException(status_code=409, detail="it is not the hero's turn")
            try:
                gs.submit_hero_action(Action(atype, req.to_amount), decision_ms=req.decision_ms)
            except IllegalAction as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            _persist_if_finished(gs, db)
            return session_to_dict(gs)

    @app.post("/session/{session_id}/next-hand")
    def next_hand(session_id: str, db: Session = Depends(get_db)) -> dict:
        gs = _session(session_id)
        with gs.lock:
            if not gs.hand_over:
                raise HTTPException(status_code=409, detail="the current hand is still in progress")
            gs.start_hand()
            _persist_if_finished(gs, db)
            return session_to_dict(gs)

    @app.get("/session/{session_id}/coach")
    def coach(session_id: str) -> dict:
        gs = _session(session_id)
        # Held for the whole computation: the coach reads the hand several times,
        # and an /advance landing in between would mix two spots in one answer.
        with gs.lock:
            if not gs.hero_to_act:
                raise HTTPException(status_code=409, detail="coaching is only available on the hero's turn")
            return build_coaching(gs).as_dict()

    @app.get("/session/{session_id}/reads")
    def reads(session_id: str) -> dict:
        """Per-bot observed read for the HUD (revealed past the sample threshold)."""
        gs = _session(session_id)
        with gs.lock:
            return {str(p): r for p, r in gs.reads().items()}

    @app.get("/stats/me")
    def my_stats(
        session_id: str | None = None,
        last: int | None = None,
        db: Session = Depends(get_db),
    ) -> dict:
        """The hero's stats over time vs target bands (STRATEGY.md §5).

        ``last`` restricts to the N most recent hands; without it the report is
        lifetime, so early learning hands drag the average forever.
        """
        limit = last if last and last > 0 else 100_000
        records = list_hands(db, session_id=session_id, limit=limit)
        # list_hands is newest-first; reverse to chronological for the trend.
        rows = [
            r.data
            for r in reversed(records)
            if isinstance(r.data, dict) and "hero_summary" in r.data
        ]
        summaries = [d["hero_summary"] for d in rows]
        # bb/100 divides each hand's net by that hand's own big blind (D13): the
        # live database holds 1/2 hands and new sessions play 5/10, and every hand
        # counts. Rows from before blinds were stored were all at 1/2.
        levels = [blinds_of(d) for d in rows]
        report = hero_report(summaries, big_blinds=[bb for _, bb in levels])
        report["window"] = {
            "last": last,
            "session_id": session_id,
            "hands": len(summaries),
            # The most recent level (kept for old clients); every hand counts now.
            "big_blind": levels[-1][1] if levels else LEGACY_BLINDS[1],
            "hands_at_this_blind": len(summaries),
            "blind_levels": [list(b) for b in sorted(set(levels))],
        }
        report["decision_time"] = decision_seconds(
            [r.data for r in reversed(records) if isinstance(r.data, dict)]
        )
        return report

    @app.get("/hands")
    def hands(session_id: str | None = None, limit: int = 50, db: Session = Depends(get_db)) -> list[dict]:
        return [h.summary() for h in list_hands(db, session_id=session_id, limit=limit)]

    @app.get("/hands/{hand_id}")
    def hand_detail(hand_id: int, db: Session = Depends(get_db)) -> dict:
        record = get_hand(db, hand_id)
        if record is None:
            raise HTTPException(status_code=404, detail="hand not found")
        # The record keeps server-only keys (the session seed in ``truth``).
        return {**record.summary(), "data": public_result(record.data)}

    @app.get("/hands/{hand_id}/review")
    def hand_review(hand_id: int, db: Session = Depends(get_db)) -> dict:
        """Street-by-street replay + computed coaching + leaks for one hand."""
        record = get_hand(db, hand_id)
        if record is None:
            raise HTTPException(status_code=404, detail="hand not found")
        return review_hand_cached(record.data)

    @app.get("/stats/leaks")
    def leaks(session_id: str | None = None, limit: int = 1000, db: Session = Depends(get_db)) -> dict:
        """A computed leak report aggregated over recent hands.

        The default window is wide on purpose: leaks are read over the last 500
        hands, and a browser refresh mints a new session, so scoping to a single
        session would undercount. Per-hand results are cached (see coach.review),
        so the wider window costs little after the first pass.
        """
        records = list_hands(db, session_id=session_id, limit=limit)
        return leak_summary([r.data for r in records])

    # --- bot lab + learning -------------------------------------------- #
    @app.get("/lab/archetypes")
    def lab_archetypes() -> dict:
        """Archetype metadata for the lab: target bands + tunable knob defaults."""
        return archetypes_info()

    @app.post("/lab/simulate")
    def lab_simulate(req: LabSimulateRequest) -> dict:
        """Compatibility: run a (capped) simulation as a background job and wait for
        it. The work runs on the job pool, so even this blocking call no longer
        holds the server; the Lab itself uses /lab/jobs and polls."""
        try:
            job_id = jobs.submit("simulate", req.model_dump())
        except ValueError as exc:  # lineup outside 2-6 seats, unknown archetype name
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        while True:
            job = jobs.get(job_id)
            if job is None or job["state"] in ("cancelled", "failed"):
                detail = "the simulation was lost" if job is None else (job["error"] or job["state"])
                raise HTTPException(status_code=503, detail=detail)
            if job["state"] == "done":
                return job["result"]
            time.sleep(0.05)

    @app.post("/lab/cfr")
    def lab_cfr(req: CfrRequest) -> dict:
        """Train CFR on Kuhn poker; converges to the known equilibrium (value -1/18)."""
        return train_cfr(iterations=req.iterations, seed=req.seed, checkpoints=req.checkpoints)

    return app


app = create_app()
