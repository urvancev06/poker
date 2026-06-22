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

## Cards & assets

The card faces are **Byron Knoll's Vector-Playing-Cards**
([notpeter/Vector-Playing-Cards](https://github.com/notpeter/Vector-Playing-Cards)),
released into the **public domain** (optionally WTFPL). They're bundled locally
in `frontend/public/cards/` (not hot-linked) as `{RANK}{SUIT}.svg` — rank `2`–`9`,
`10`, `J`/`Q`/`K`/`A`; suit `C`/`D`/`H`/`S` (e.g. `10D.svg`, `AH.svg`). `back.svg`
is a custom Felt & Brass card back.

The raw deck is heavy (court cards 400–665 KB). It was run through **SVGO**
(`floatPrecision: 1`, multipass — visually lossless at card display size),
cutting it ~60% to ~3.2 MB total (court cards ~250–460 KB). This knowingly
exceeds the ~80 KB/card guideline in PROJECT.md §4 — the deliberate "good but
heavy" Byron Knoll tradeoff. Cards are lazy-loaded so only the ~10 on screen
load. To re-optimise, run SVGO with `frontend/svgo.cards.config.mjs`.

## Status

The whole **backend brain is built and tested** (56 pytest tests passing):

- **Phase 0** — scaffold (monorepo, deps, CI-able test setup).
- **Phase 1** — `poker.engine`: PokerKit wrapper (legal actions, side pots,
  showdown, serializable state) + console runner.
- **Phase 2** — `poker.math`: Monte Carlo equity, pot odds/EV, hand classifier,
  range parser.
- **Phase 3** — `poker.bots` + `poker.sim`: five archetypes, simulation harness,
  stats, tuning report. **The ≥100k-hand stat gate PASSES** (VPIP/PFR/AF in band
  for every archetype). Run it: `.venv/bin/python scripts/simulate.py --hands 100000`.
- **Phase 4** — `poker.api` + `poker.coach` + `poker.db`: FastAPI session/play/
  coaching endpoints and SQLite hand-history persistence.

**Next: Phase 5 — the frontend table** (not started). It needs a deliberate
card-deck choice (see §4 of `PROJECT.md`) and the Felt & Brass styling from
`DESIGN.md`.
