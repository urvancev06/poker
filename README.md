# Poker

A private, single-user poker trainer: play 6-max No-Limit Hold'em cash against
realistic, statistically-validated bot archetypes, with an honest coaching layer
and tracking of my own leaks over time.

This is a personal tool, not a product. It is **not** multiplayer, not real-money,
not a GTO solver, and not a mobile app. See [`PROJECT.md`](PROJECT.md) for the full
spec and the project brief for the working principles.

## Stack

- **Backend (the brain)** — Python 3.11+ with [PokerKit](https://github.com/uoftcprg/pokerkit)
  (game state + hand eval), [treys](https://github.com/ihendley/treys) (fast Monte
  Carlo equity), [FastAPI](https://fastapi.tiangolo.com/) + uvicorn, and SQLite via
  SQLAlchemy. Chips are integers (smallest unit) to avoid float rounding.
- **Frontend (the face)** — React + Vite + TypeScript + Tailwind v4. Built later
  (Phase 5), after the bots pass their statistical validation gate.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the module map.

## Repo layout

```
backend/    Python brain — engine, math, bots, simulation, API (the poker package)
frontend/   React face — the table UI (scaffolded; built in Phase 5)
brand/       my logo kit + favicon
references/  design + layout references (HTML mockups)
*.md         the spec: PROJECT.md, STRATEGY.md, DESIGN.md, ARCHITECTURE.md
```

## Running it locally

### Backend

The backend lives in `backend/` and uses a virtual environment at `backend/.venv`
(Python 3.14). Dependencies are declared in `backend/pyproject.toml` and the package
is installed editable, so `import poker` works everywhere.

First-time setup:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
```

Run the test suite:

```bash
cd backend
.venv/bin/python -m pytest
```

Run the API (health check at <http://127.0.0.1:8000/health>, auto-docs at `/docs`):

```bash
cd backend
.venv/bin/uvicorn poker.api.app:app --reload
```

Sanity-check the PokerKit integration (builds a 6-max NLHE cash hand):

```bash
cd backend
.venv/bin/python scripts/pokerkit_smoke.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # dev server, usually http://localhost:5173
npm run build    # type-check + production build
```

## Status

Phase 0 (scaffold) complete. Building the headless brain next — see `PROJECT.md`
for the phased plan. No frontend table until the bots pass the Phase 3 stat gate
(≥100k-hand simulation, all archetypes' stats within their target bands).
