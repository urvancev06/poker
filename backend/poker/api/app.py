"""FastAPI application — the API the frontend talks to.

Endpoints:
    GET  /health                       liveness
    POST /session                      start a session (choose archetypes, blinds, stacks) + deal hand 1
    GET  /session/{id}                 current state (hero viewpoint) + session info
    POST /session/{id}/action          submit the hero's action; bots auto-respond
    POST /session/{id}/advance         step one bot action (watch-the-hand pacing)
    POST /session/{id}/next-hand       deal the next hand
    GET  /session/{id}/coach           computed coaching for the hero's current spot
    GET  /hands                        list persisted hands
    GET  /hands/{id}                   one persisted hand (full data for replay)
    GET  /lab/archetypes               bot-lab metadata (target bands + tunable knobs)
    POST /lab/simulate                 run a capped sim; emergent stats vs targets
    POST /lab/cfr                      train CFR on Kuhn poker (learning module)

Run:  backend/.venv/bin/uvicorn poker.api.app:app --reload
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from poker import __version__
from poker.coach import build_coaching, leak_summary, review_hand_cached
from poker.db import HandRecord, get_hand, init_db, list_hands, make_engine, make_session_factory, save_hand
from poker.engine import Action, ActionType, IllegalAction
from poker.game import GameSession
from poker.learn import train as train_cfr
from poker.sim.hero_stats import decision_seconds, hero_report
from poker.sim.lab import archetypes_info, run_lab

from .schemas import ActionRequest, CfrRequest, CreateSessionRequest, LabSimulateRequest
from .serializers import session_to_dict

_ACTION_TYPES = {
    "fold": ActionType.FOLD,
    "check": ActionType.CHECK,
    "call": ActionType.CALL,
    "bet": ActionType.BET,
    "raise": ActionType.RAISE,
}


def create_app(db_url: str | None = None) -> FastAPI:
    engine = make_engine(db_url) if db_url else make_engine()
    init_db(engine)
    SessionFactory = make_session_factory(engine)

    app = FastAPI(title="Poker", version=__version__)
    # Local-first dev: the Vite dev server (any localhost port) may call the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.sessions: dict[str, GameSession] = {}
    app.state.saved: dict[str, set[int]] = {}

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
        gs = GameSession(
            session_id=sid,
            villains=req.villains,
            blinds=(req.small_blind, req.big_blind),
            buy_in=req.buy_in,
            seed=req.seed,
            auto_advance=req.auto_advance,
        )
        app.state.sessions[sid] = gs
        gs.start_hand()
        _persist_if_finished(gs, db)
        return session_to_dict(gs)

    @app.post("/session/{session_id}/advance")
    def advance(session_id: str, db: Session = Depends(get_db)) -> dict:
        """Step a single pending bot action (for watch-the-hand pacing). No-op
        when it's the hero's turn or the hand is over."""
        gs = _session(session_id)
        gs.advance_one()
        _persist_if_finished(gs, db)
        return session_to_dict(gs)

    @app.get("/session/{session_id}")
    def get_state(session_id: str) -> dict:
        return session_to_dict(_session(session_id))

    @app.post("/session/{session_id}/action")
    def submit_action(session_id: str, req: ActionRequest, db: Session = Depends(get_db)) -> dict:
        gs = _session(session_id)
        if not gs.hero_to_act:
            raise HTTPException(status_code=409, detail="it is not the hero's turn")
        atype = _ACTION_TYPES.get(req.type.lower())
        if atype is None:
            raise HTTPException(status_code=400, detail=f"unknown action type: {req.type}")
        try:
            gs.submit_hero_action(Action(atype, req.to_amount), decision_ms=req.decision_ms)
        except IllegalAction as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        _persist_if_finished(gs, db)
        return session_to_dict(gs)

    @app.post("/session/{session_id}/next-hand")
    def next_hand(session_id: str, db: Session = Depends(get_db)) -> dict:
        gs = _session(session_id)
        if not gs.hand_over:
            raise HTTPException(status_code=409, detail="the current hand is still in progress")
        gs.start_hand()
        _persist_if_finished(gs, db)
        return session_to_dict(gs)

    @app.get("/session/{session_id}/coach")
    def coach(session_id: str) -> dict:
        gs = _session(session_id)
        if not gs.hero_to_act:
            raise HTTPException(status_code=409, detail="coaching is only available on the hero's turn")
        return build_coaching(gs).as_dict()

    @app.get("/session/{session_id}/reads")
    def reads(session_id: str) -> dict:
        """Per-bot observed read for the HUD (revealed past the sample threshold)."""
        gs = _session(session_id)
        return {str(p): r for p, r in gs.reads().items()}

    @app.get("/stats/me")
    def my_stats(
        session_id: str | None = None,
        last: int | None = None,
        db: Session = Depends(get_db),
    ) -> dict:
        """The hero's stats over time vs target bands (STRATEGY.md §5).

        ``last`` restricts to the N most recent hands. Without it the report is
        lifetime, which is what the dashboard used to be unconditionally — so early
        learning hands dragged the average forever and the 2,000-hand window the
        study gate names could not be isolated.
        """
        limit = last if last and last > 0 else 100_000
        records = list_hands(db, session_id=session_id, limit=limit)
        # list_hands is newest-first; reverse to chronological for the trend.
        summaries = [
            r.data["hero_summary"]
            for r in reversed(records)
            if isinstance(r.data, dict) and "hero_summary" in r.data
        ]
        # bb/100 is only meaningful at one blind level. Mixing 1/2 and 5/10 hands into
        # a single figure is nonsense, so use the most recent level and say how many
        # hands actually match it.
        blinds = [
            tuple(r.data.get("blinds", (1, 2)))
            for r in reversed(records)
            if isinstance(r.data, dict)
        ]
        big_blind = int(blinds[-1][1]) if blinds else 2
        matching = sum(1 for b in blinds if int(b[1]) == big_blind)
        report = hero_report(summaries, big_blind=big_blind)
        report["window"] = {
            "last": last,
            "session_id": session_id,
            "hands": len(summaries),
            "big_blind": big_blind,
            "hands_at_this_blind": matching,
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
        return {**record.summary(), "data": record.data}

    @app.get("/hands/{hand_id}/review")
    def hand_review(hand_id: int, db: Session = Depends(get_db)) -> dict:
        """Street-by-street replay + computed coaching + leaks for one hand."""
        record = get_hand(db, hand_id)
        if record is None:
            raise HTTPException(status_code=404, detail="hand not found")
        return review_hand_cached(record.data, equity_trials=1800)

    @app.get("/stats/leaks")
    def leaks(session_id: str | None = None, limit: int = 1000, db: Session = Depends(get_db)) -> dict:
        """An honest, computed leak report aggregated over recent hands.

        Default raised from 200 to 1,000 and no longer scoped to a session by the
        client: the study gates count flags over 500 hands, and a browser refresh
        mints a new session, so the old default could not express the window the
        gates are stated in. Results are cached per hand (see coach.review), so a
        larger window costs little after the first pass.
        """
        records = list_hands(db, session_id=session_id, limit=limit)
        return leak_summary([r.data for r in records])

    # --- bot lab + learning (Phase 7) ---------------------------------- #
    @app.get("/lab/archetypes")
    def lab_archetypes() -> dict:
        """Archetype metadata for the lab: target bands + tunable knob defaults."""
        return archetypes_info()

    @app.post("/lab/simulate")
    def lab_simulate(req: LabSimulateRequest) -> dict:
        """Run a (capped) headless simulation and return emergent stats vs targets."""
        if not req.lineup:
            raise HTTPException(status_code=400, detail="lineup must have at least one seat")
        try:
            return run_lab(
                lineup=req.lineup,
                hands=req.hands,
                seed=req.seed,
                blinds=(req.small_blind, req.big_blind),
                starting_stack=req.starting_stack,
                overrides=req.overrides,
            )
        except ValueError as exc:  # unknown archetype name
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/lab/cfr")
    def lab_cfr(req: CfrRequest) -> dict:
        """Train CFR on Kuhn poker; converges to the known equilibrium (value -1/18)."""
        return train_cfr(iterations=req.iterations, seed=req.seed, checkpoints=req.checkpoints)

    return app


app = create_app()
