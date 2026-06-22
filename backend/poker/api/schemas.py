"""Request/response schemas for the API."""

from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_VILLAINS = ["nit", "tag", "lag", "station", "maniac"]


class CreateSessionRequest(BaseModel):
    villains: list[str] = Field(default_factory=lambda: list(DEFAULT_VILLAINS))
    small_blind: int = 1
    big_blind: int = 2
    buy_in: int = 200
    seed: int | None = None


class ActionRequest(BaseModel):
    type: str = Field(description="fold | check | call | bet | raise")
    to_amount: int | None = Field(default=None, description="total bet level for bet/raise")
