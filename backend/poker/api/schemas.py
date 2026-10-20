"""Request/response schemas for the API."""

from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_VILLAINS = ["nit", "tag", "lag", "station", "maniac"]


# Decision 1: 5/10 blinds and 1,000-chip (100bb) buy-ins; the UI shows big blinds.
DEFAULT_BLINDS = (5, 10)
DEFAULT_BUY_IN = 1000


class CreateSessionRequest(BaseModel):
    villains: list[str] = Field(default_factory=lambda: list(DEFAULT_VILLAINS))
    small_blind: int = DEFAULT_BLINDS[0]
    big_blind: int = DEFAULT_BLINDS[1]
    buy_in: int = DEFAULT_BUY_IN
    seed: int | None = None
    # The UI passes False to step bots one action at a time (watch the hand);
    # default True keeps the simple "bots already acted" behaviour for API use.
    auto_advance: bool = True


class ActionRequest(BaseModel):
    type: str = Field(description="fold | check | call | bet | raise")
    to_amount: int | None = Field(default=None, description="total bet level for bet/raise")
    # Client-measured wall clock from "hero became the actor" to "action posted".
    # Stored raw: it includes thinking, tab-switching and interruptions, so it is
    # summarised as a median (target: under 10s) and never as a mean.
    decision_ms: int | None = Field(default=None, ge=0, description="ms the hero took to act")


class LabSimulateRequest(BaseModel):
    """Bot-lab run: a lineup, how many hands, and optional per-archetype knob tweaks."""

    lineup: list[str] = Field(default_factory=lambda: list(DEFAULT_VILLAINS) + ["tag"])
    hands: int = 5_000
    seed: int = 0
    small_blind: int = DEFAULT_BLINDS[0]
    big_blind: int = DEFAULT_BLINDS[1]
    starting_stack: int = DEFAULT_BUY_IN
    # {archetype_key: {knob: value}}; sanitized server-side against the allowlist.
    overrides: dict[str, dict[str, float]] = Field(default_factory=dict)


class CfrRequest(BaseModel):
    """Train CFR on Kuhn poker for N iterations (the learning module)."""

    iterations: int = Field(default=20_000, ge=1, le=500_000)
    seed: int = 0
    checkpoints: int = Field(default=20, ge=1, le=100)
