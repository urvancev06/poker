"""Database engine + session factory (SQLite via SQLAlchemy).

File-based and zero-ops, which is all a single user needs. The DB path can be
overridden with the ``POKER_DB_URL`` env var (tests use an in-memory database).
"""

from __future__ import annotations

import os

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .models import Base

DEFAULT_URL = os.environ.get("POKER_DB_URL", "sqlite:///poker.db")


def make_engine(url: str = DEFAULT_URL) -> Engine:
    # check_same_thread=False so the dev server (threaded) can share the engine.
    if url in ("sqlite://", "sqlite:///:memory:"):
        # In-memory DBs need one shared connection or each connection sees an
        # empty database (used by tests).
        return create_engine(
            url, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args)


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
