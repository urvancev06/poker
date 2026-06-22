"""Persistence helpers for hand history."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import HandRecord


def save_hand(db: Session, record: HandRecord) -> HandRecord:
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_hands(db: Session, session_id: str | None = None, limit: int = 50) -> list[HandRecord]:
    stmt = select(HandRecord).order_by(HandRecord.id.desc()).limit(limit)
    if session_id is not None:
        stmt = stmt.where(HandRecord.session_id == session_id)
    return list(db.scalars(stmt))


def get_hand(db: Session, hand_id: int) -> HandRecord | None:
    return db.get(HandRecord, hand_id)


def count_hands(db: Session, session_id: str | None = None) -> int:
    stmt = select(HandRecord)
    if session_id is not None:
        stmt = stmt.where(HandRecord.session_id == session_id)
    return len(list(db.scalars(stmt)))
