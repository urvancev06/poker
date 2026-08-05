# Architecture

How the code is organised. The split is a Python **brain** (poker logic, maths, bots)
behind a React **face** (the table UI), talking over a small HTTP API.

## Top level

```
backend/    Python package `poker`, plus tests and scripts
frontend/   React + Vite + TypeScript + Tailwind
brand/      logo kit + favicon
*.md        README, this file, STRATEGY (poker), DESIGN (visual)
```

## Backend — the `poker` package

Installed editable from `backend/pyproject.toml`, so `import poker` resolves the same
in the app, the tests and the scripts. Chips are integers throughout (smallest unit),
so no rounding error can accumulate across a session.

| Module | Responsibility |
|---|---|
| `poker.engine` | Wrapper over **PokerKit** for 6-max NLHE cash: whose turn, legal actions and sizing, apply action, advance streets, showdown, side pots, and a serialisable game-state object. Rules and hand evaluation are not re-implemented. |
| `poker.math` | Monte Carlo equity (**treys**), pot odds, required equity, EV, a made-hand and draw classifier, and a range-string parser (`"22+, ATs+"` → combos, blockers removed). Pure functions, no game-state or framework dependencies. |
| `poker.bots` | Bot interface `(game_state, legal_actions, own_cards) -> action`, a parameterised strategy (positional ranges + a postflop heuristic over `poker.math`), and five archetypes as parameter sets. |
| `poker.sim` | Headless simulation: play archetypes against each other for N hands, logging every decision; the stats module (VPIP, PFR, 3-bet%, AF, WTSD); the measured-vs-target report; and `lab.py`, the same machinery exposed as JSON for the bot lab. |
| `poker.coach` | Per-spot coaching (equity against modelled ranges, pot odds, a candid line), hand replay reconstruction, and computed leak detection. All maths comes from `poker.math`. |
| `poker.game` | Interactive session: hero plus villains, stacks and rebuys, button rotation, bots auto-acting, per-bot observed reads for the HUD. |
| `poker.db` | SQLAlchemy models and persistence: hand histories and hero stats over time, in SQLite. |
| `poker.api` | FastAPI app: session, state, action, coaching, history and lab endpoints. |
| `poker.learn` | `kuhn_cfr.py` runs vanilla Counterfactual Regret Minimization on Kuhn poker and converges to its known equilibrium (game value −1/18), with exact best-response exploitability. |

Not part of the installed package:

```
backend/tests/     pytest - engine correctness, equity against known values, side pots, chip conservation
backend/scripts/   runnable utilities - the sim CLI, the console hand-runner, calibration probes
backend/validation/ recorded output of the 100k-hand stat gate and the coach calibration probe
```

### Why this split

- **PokerKit owns the rules.** `poker.engine` adapts it to a serialisable interface;
  it never re-implements betting, side pots or hand ranking.
- **The maths is isolated and pure.** `poker.math` has no game-state or framework
  dependencies, so it can be tested directly against known equities and odds.
- **Bots are strategy plus parameters; stats are outputs.** `poker.bots` defines the
  strategy, `poker.sim` measures what it produces. Parameters are tuned until the
  measured stats land in the archetype bands. A stat is never an input.

## Frontend — `frontend/`

Vite + React + TypeScript. Tailwind v4 is wired via the `@tailwindcss/vite` plugin
(`@import "tailwindcss";` in `src/index.css`). Cards are drawn as inline SVG, so there
are no card image assets and no per-card network requests.

```
frontend/src/
  main.tsx        React entry
  App.tsx         shell: view nav (Table / My stats / History / Lab / Study), coach toggle, visibility modes
  api.ts          typed client mirroring the poker.api serialisers
  index.css       Tailwind import + theme tokens (Sora, IBM Plex Mono - see DESIGN.md)
  prefs.tsx       preferences provider (persists deck + opponent visibility)
  lib/            deck definitions, card geometry, seat labels, action text
  components/     Table, Seat, Board, Card, ActionBar, ActionLog, CoachPanel,
                  StatsView, HistoryView, LabView, StudyView, MobileTable
```

State of record lives in the backend. The frontend renders it and holds no game logic.

## The boundary

The frontend talks to `poker.api` over REST. Everything the coach displays is computed
by `poker.math` and labelled as computed maths - exact GTO frequencies are never
asserted, and the coach defers to a solver for those.
