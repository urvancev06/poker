"""FastAPI application — the API the frontend talks to.

Phase 0: a single health-check endpoint to prove the server runs. The real
session/coaching endpoints arrive in Phase 4.

Run locally:
    backend/.venv/bin/uvicorn poker.api.app:app --reload
"""

from fastapi import FastAPI

from poker import __version__

app = FastAPI(title="Poker", version=__version__)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — confirms the backend is up."""
    return {"status": "ok", "version": __version__}
