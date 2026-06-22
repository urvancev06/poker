"""FastAPI application — the API the frontend talks to.

Endpoints:
    GET  /health                       liveness
    POST /session                      start a session (choose archetypes, blinds, stacks) + deal hand 1
    GET  /session/{id}                 current state (hero viewpoint) + session info
    POST /session/{id}/action          submit the hero's action; bots auto-respond
    POST /session/{id}/next-hand       deal the next hand
    GET  /session/{id}/coach           computed coaching for the hero's current spot
    GET  /hands                        list persisted hands
    GET  /hands/{id}                   one persisted hand (full data for replay)

Run:  backend/.venv/bin/uvicorn poker.api.app:app --reload
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from poker import __version__
from poker.coach import build_coaching
from poker.db import HandRecord, get_hand, init_db, list_hands, make_engine, make_session_factory, save_hand
from poker.engine import Action, ActionType, IllegalAction
from poker.game import GameSession

from .schemas import ActionRequest, CreateSessionRequest
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
        )
        app.state.sessions[sid] = gs
        gs.start_hand()
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
            gs.submit_hero_action(Action(atype, req.to_amount))
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

    @app.get("/hands")
    def hands(session_id: str | None = None, limit: int = 50, db: Session = Depends(get_db)) -> list[dict]:
        return [h.summary() for h in list_hands(db, session_id=session_id, limit=limit)]

    @app.get("/hands/{hand_id}")
    def hand_detail(hand_id: int, db: Session = Depends(get_db)) -> dict:
        record = get_hand(db, hand_id)
        if record is None:
            raise HTTPException(status_code=404, detail="hand not found")
        return {**record.summary(), "data": record.data}

    return app


app = create_app()
