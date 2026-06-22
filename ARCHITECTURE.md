# ARCHITECTURE.md — module map

A one-page map of how the code is organised. The guiding split is a Python
**"brain"** (poker logic, math, bots, future ML) behind a React **"face"** (the
table UI). They talk over a small HTTP API. This document is the intended shape;
modules are built phase by phase (see `PROJECT.md`), so some are stubs or absent
until their phase.

## Top level

```
backend/    the brain  — Python package `poker` + tests + scripts
frontend/   the face   — React + Vite + TypeScript + Tailwind
brand/      logo kit + favicon (used by the frontend in Phase 5)
references/ design + layout reference HTML (not shipped)
*.md        the spec — PROJECT (plan), STRATEGY (poker), DESIGN (visual), this file
```

## Backend — the `poker` package

Installed editable from `backend/pyproject.toml`, so `import poker` resolves the
same in the app, tests, and scripts. Chips are integers throughout (smallest unit).

| Module | Responsibility | Phase |
|---|---|---|
| `poker.api` | FastAPI app: session, state, actions, coaching endpoints. *(Phase 0: a `/health` stub.)* | 0 → 4 |
| `poker.engine` | Thin wrapper over **PokerKit** for 6-max NLHE cash: whose turn, legal actions + sizing, apply action, advance streets, showdown, side pots, and a serializable game-state object. We do **not** hand-roll rules or evaluation. | 1 |
| `poker.math` | The computed coaching math: Monte Carlo equity (**treys**), pot odds / required equity / simple EV, a made-hand + draw classifier, and a range-string parser (`"22+, ATs+"` → combos, blockers removed). Pure functions, no solver fabrication. | 2 |
| `poker.bots` | Bot interface `(game_state, legal_actions, own_cards) -> action`, a parameterized strategy (position ranges + postflop heuristic over `poker.math`), and the five archetypes (Nit, TAG, LAG, Calling Station, Maniac) as parameter sets. Strategy params live in clear config. | 3 |
| `poker.sim` | Headless simulation harness: play archetypes against each other for N hands, logging every decision; plus the stats module (VPIP, PFR, 3-bet%, AF, WTSD, …), the measured-vs-target tuning report, and `lab.py` — the same machinery exposed as a JSON feature for the bot lab (knob overrides → emergent stats vs bands). | 3, 7 |
| `poker.coach` | The honest coaching + review layer: per-spot computed coaching (equity vs modelled ranges, pot odds, candid line), hand replay reconstruction, and computed leak detection. All math from `poker.math`; never fabricated GTO. | 4, 6 |
| `poker.game` | The interactive session: hero + villains, carrying stacks/rebuys, button rotation, bots auto-acting, per-bot observed reads for the HUD. | 4, 5 |
| `poker.db` | SQLAlchemy models + persistence: full hand histories and my stats over time, in SQLite. | 4 |
| `poker.learn` | The quant "understand it from the inside" layer: `kuhn_cfr.py` runs vanilla **Counterfactual Regret Minimization** on Kuhn poker and converges to its *known* equilibrium (game value −1/18), with exact best-response exploitability. A real, checkable solver — not a fabricated one. | 7 |

Supporting dirs (not part of the installed package):

```
backend/tests/     pytest — engine correctness, math (known equities, side pots, chip conservation)
backend/scripts/   runnable utilities — pokerkit_smoke.py, the console hand-runner, the sim CLI
```

### Why this split

- **PokerKit owns the rules.** `poker.engine` adapts it to a clean, serializable
  interface the rest of the app uses; it never re-implements betting, side pots, or
  hand ranking.
- **The math is isolated and pure.** `poker.math` has no game-state or framework
  dependencies, so it is trivially testable against known equities and odds — the
  thing a stats person will (rightly) want to see verified.
- **Bots are strategy + parameters, stats are outputs.** `poker.bots` defines
  *strategy*; `poker.sim` *measures* the resulting stats. We tune parameters until
  the measured stats hit the archetype targets — stats are never an input.

## Frontend — `frontend/`

Standard Vite + React + TypeScript layout. Tailwind v4 is wired via the
`@tailwindcss/vite` plugin (`@import "tailwindcss";` in `src/index.css`). The table —
layout from `references/poker-mockup.html`, styled in the "Felt & Brass" direction
from `DESIGN.md`, with a bundled real SVG card deck — was built in Phase 5, **after**
the Phase 3 statistical gate.

```
frontend/src/
  main.tsx        React entry (bundles the Fraunces + Hanken Grotesk fonts locally)
  App.tsx         shell: view nav (Table / My stats / History / Lab), Study↔Play, visibility modes
  api.ts          typed client mirroring poker.api serializers
  index.css       Tailwind import + Felt & Brass @theme tokens
  components/      Table, Seat, Board, Card, ActionBar, CoachPanel, StatsView, HistoryView, LabView
```

State of record lives in the backend; the frontend renders it and never stores game
logic in the browser.

## The boundary

The frontend talks to `poker.api` over HTTP (REST; WebSocket only if live updates
need it). Everything the coach displays is computed by `poker.math` and clearly
labelled as computed math — never fabricated solver output (see `PROJECT.md` §7).
