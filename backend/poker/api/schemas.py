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
    # The UI passes False to step bots one action at a time (watch the hand);
    # default True keeps the simple "bots already acted" behaviour for API use.
    auto_advance: bool = True


class ActionRequest(BaseModel):
    type: str = Field(description="fold | check | call | bet | raise")
    to_amount: int | None = Field(default=None, description="total bet level for bet/raise")
    # Client-measured wall clock from "hero became the actor" to "action posted".
    # Deliberately raw: it includes thinking, tab-switching and interruptions, so it
    # is stored as observed and only ever summarised as a median. Gate 2 names a
    # 10-second target and nothing in the app measured elapsed time at all.
    decision_ms: int | None = Field(default=None, ge=0, description="ms the hero took to act")


class LabSimulateRequest(BaseModel):
    """Bot-lab run: a lineup, how many hands, and optional per-archetype knob tweaks."""

    lineup: list[str] = Field(default_factory=lambda: list(DEFAULT_VILLAINS) + ["tag"])
    hands: int = 5_000
    seed: int = 0
    small_blind: int = 1
    big_blind: int = 2
    starting_stack: int = 200
    # {archetype_key: {knob: value}} — sanitized server-side against the allowlist.
    overrides: dict[str, dict[str, float]] = Field(default_factory=dict)


class CfrRequest(BaseModel):
    """Train CFR on Kuhn poker for N iterations (the learning module)."""

    iterations: int = Field(default=20_000, ge=1, le=500_000)
    seed: int = 0
    checkpoints: int = Field(default=20, ge=1, le=100)
