"""SQLAlchemy models for persisted hand history (SQLAlchemy 2.0 style).

One row per completed hand, with the full structured hand stored as JSON so it
can be replayed street-by-street later.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class HandRecord(Base):
    __tablename__ = "hands"
    # A hand index is unique within a session. Enforced in the schema rather than
    # in process memory so a restart cannot re-persist a hand already stored.
    __table_args__ = (UniqueConstraint("session_id", "hand_index", name="uq_hand_per_session"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session_id: Mapped[str] = mapped_column(String(64), index=True)
    hand_index: Mapped[int] = mapped_column(Integer)

    hero_position: Mapped[str] = mapped_column(String(4))
    hero_cards: Mapped[str] = mapped_column(String(8))
    board: Mapped[str] = mapped_column(String(20), default="")
    pot: Mapped[int] = mapped_column(Integer, default=0)
    hero_net: Mapped[int] = mapped_column(Integer, default=0)
    went_to_showdown: Mapped[bool] = mapped_column(default=False)

    # Full structured hand for replay: lineup, action log, per-seat results, board.
    data: Mapped[dict] = mapped_column(JSON, default=dict)

    def summary(self) -> dict:
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "session_id": self.session_id,
            "hand_index": self.hand_index,
            "hero_position": self.hero_position,
            "hero_cards": self.hero_cards,
            "board": self.board,
            "pot": self.pot,
            "hero_net": self.hero_net,
            "went_to_showdown": self.went_to_showdown,
        }
