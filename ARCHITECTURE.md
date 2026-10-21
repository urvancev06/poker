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
so no rounding error can accumulate across a session. Sessions, the simulator and the Lab
play 5/10 blinds with 1,000-chip (100bb) stacks; the engine's own defaults stay 1/2 and
200, so the rules tests do not depend on the table's chip unit. Hands stored before phase 1
are at 1/2, and every reader takes a hand's big blind from the hand itself.

| Module | Responsibility |
|---|---|
| `poker.engine` | Wrapper over **PokerKit** for 6-max NLHE cash: whose turn, legal actions and sizing, apply action, advance streets, showdown, side pots, and a serialisable game-state object. Rules and hand evaluation are not re-implemented. Deals come from a deck we shuffle (PokerKit's manual dealing). `ledger.py` keeps the chip ledger beside PokerKit: chips added per post and action, the uncalled-bet return, the pot, `winnable(seat, extra)` (side-pot aware) and payouts. The decision facts for the player to act (to call, what a call can win, who acts after a call, whether a call ends the betting) feed the coach and the review. Snapshots hide other seats' hole cards, history included; the rake hook exists and is off. |
| `poker.rng` | Seeded random streams: one `random.Random` per purpose (the deck of hand h, decision k of player p in hand h, ...), derived with blake2b from the seed and keys. Nothing reads the global `random` state, so a seeded session or simulation replays exactly. |
| `poker.math` | Equity, odds and hand reading; pure functions, no game state (modules below). NumPy for the vector paths. |
| `poker.bots` | Bot interface `(game_state, legal_actions, own_cards) -> action`, a parameterised strategy (positional ranges + a postflop heuristic over `poker.math`), and five archetypes as parameter sets. These are the v1 bots; `sim/fingerprint.py` hashes what they do over 300 seeded hands and `tests/test_v1_frozen.py` pins it, so shared code can change under them without moving a decision. |
| `poker.sim` | Headless simulation: play archetypes against each other for N hands, logging every decision; the stats module (VPIP, PFR, 3-bet%, AF, WTSD); the measured-vs-target report; and `lab.py`, the same machinery exposed as JSON for the bot lab. Hand h is dealt and decided from streams seeded by (seed, h), so a run splits into shards of 1,000 hands that play anywhere and merge, as integer counts, into exactly the one-process result (`run(..., workers=4)`). `jobs.py` (`JobManager`) runs Lab simulations as background jobs on a pool of spawned processes at low CPU priority (replaced when a dead worker breaks it): `queued` → `running` → `done`, `cancelled` or `failed`, progress per merged shard, cancel between shards, and an in-memory registry that a restart forgets. |
| `poker.coach` | Per-spot coaching (equity against modelled ranges, pot odds, a candid line), hand replay reconstruction, and computed leak detection. All maths comes from `poker.math`. |
| `poker.game` | Interactive session: hero plus villains, stacks and rebuys, button rotation, bots auto-acting, per-bot observed reads for the HUD. Deals and bot decisions come from the session seed's streams; the seed is stored server-side only (`truth` in the hand record). Each session has a re-entrant lock that every request on it takes, so a double-click, a coach fetch during an advance and the next action cannot interleave. A finished hand stores the ledger's pot, the ledger itself and each action's chips (`added`, `street_total`, `all_in`, `stack_after`), all as new keys of `hands.data`; old rows without them still load, replay and review. |
| `poker.db` | SQLAlchemy models and persistence: hand histories and hero stats over time, in SQLite. `HandRecord.summary()` reports each hand's big blind (2 for rows stored before phase 1), and `/stats/me` counts bb/100 in each hand's own big blinds. |
| `poker.api` | FastAPI app: session, state, action, coaching, history and lab endpoints. `lab_jobs.py` adds the Lab job API: `POST /lab/jobs` starts a simulation and answers at once, `GET /lab/jobs/{id}` reports progress and the result, `DELETE /lab/jobs/{id}` cancels; `/lab/simulate` remains as a wrapper that waits for a job. `GET /hands/{id}` strips the server-only `truth`. |
| `poker.learn` | `kuhn_cfr.py` runs vanilla Counterfactual Regret Minimization on Kuhn poker and converges to its known equilibrium (game value −1/18), with exact best-response exploitability. |

`poker.math` modules:

| Module | Responsibility |
|---|---|
| `cards`, `suits` | Card strings, the deck, canonical combos and suit isomorphism. |
| `ranktable` | The 7-card rank table (scalar path), checked against treys. |
| `vector` | The NumPy evaluator over many hands at once, and the cached flop equity matrix (`flop_matrix`, `is_flop_warm`). |
| `board` | `BoardCache`: per-board hand strengths and weighted shares, for the phase-3 bots. |
| `classify` | The hole-aware classifier: `made` counts the board, `hole_tier` only what the hole adds; labels such as "board pair, ace kicker" or "playing the board (two pair)". |
| `classify_legacy` | The frozen pre-phase-2 classifier, used by the v1 bots and the villain model (`tests/test_classify_legacy.py` pins it). |
| `draws`, `texture` | Draws that need a hole card, and board texture. |
| `equity` | `equity_vs_ranges`: exact heads-up and two-way after the flop, the preflop table heads-up preflop, seeded joint sampling otherwise; the older Monte Carlo `equity` (treys), kept for `scripts/gen_preflop_ranking.py`. |
| `preflop_table` | The 169 x 169 precomputed preflop equities (`data/`). |
| `ranges` | Range strings to combos (blockers removed) and weighted ranges. |
| `odds` | Pot odds, required equity, implied-odds prices and EV, exact arithmetic. |

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

React 19 + Vite + TypeScript, styled with Tailwind v4 through the `@tailwindcss/vite` plugin
(`@import "tailwindcss";` in `src/index.css`). The look is the Stage design in
[DESIGN.md](DESIGN.md). One runtime dependency beyond React and Tailwind: the self-hosted Inter
Variable font. Cards are drawn as inline SVG, so there are no card image assets and no per-card
network requests.

```
frontend/
  index.html          the page (black theme colour, viewport-fit=cover for the safe area)
  coach-harness.html  dev only: the coach against captured answers; served by vite, never built
  vite.config.ts      React and Tailwind plugins, and the vitest config
  src/
    main.tsx          entry: imports Inter Variable (opsz), index.css, the prefs provider
    App.tsx           the shell: the space behind every view, the top bar, view switching
    api.ts            typed client mirroring the poker.api serialisers; every failure is an ApiError
    index.css         the Stage tokens (colour, type, radii, materials, springs, breakpoints)
    prefs.tsx         preferences provider: deck, opponent visibility, coach mode (localStorage)
    ui/               shared primitives; ui/README.md is the index
    components/       Card.tsx, and one folder per view
    lib/              pure logic with its tests, the session hook, the decks
```

**`ui/`** holds what every view uses: `Space` (the starfield, the planet's limb, the light source),
`Capsule`, `IconButton`, `Segmented`, `Sheet` (side panel on a desktop, bottom sheet with detents on
a phone or tablet), `Disclosure`, `Tooltip` and `InfoButton`, `Ring` (the coach's equity ring), `ErrorNotice`,
`PageHeader`, `Icons`, and `LayerHost`, which keeps a hidden view's sheets hidden with it.

**`components/<view>/`**, one folder per view, each owning its own data:

| Folder | What it is |
|---|---|
| `shell/` | `TopBar` (brand, the centred nav, the log button, New game) and `MoreMenu` (the `…` menu: coach mode, opponent visibility, Study, Lab, Preferences) |
| `table/` | `TableView` and its parts: `Felt` (the CSS 3D slab and what lies on it), `SeatLabel`, `HeroHand`, `Dock` and `DockFaces` (actions, sizing, result, error), `HandLog`, and `useTableMotion` |
| `coach/` | `CoachGlance` (ring, verdict, figures) and `MathsSheet` (the working); `dev/` is the harness behind `coach-harness.html` |
| `stats/` | My stats: the readiness ring, the facts, stats grouped by sample gate, the trend; `useMyStats` |
| `history/` | the leak report, the hand list, the street-by-street replay; `useHistoryData` |
| `lab/` | the bot lab (lineup, results against bands, knobs) and CFR on Kuhn; `useLabJob` runs a simulation as a background job (progress, Cancel, polling paused while the Lab is hidden), CFR keeps `useLabRun`; `useLabInfo` |
| `study/` | the static reference: positions, opening ranges on a 13 × 13 grid, the postflop framework, pot odds, draws, the five player types, stat targets, bankroll, terms |
| `prefs/` | Preferences: coach mode, opponent visibility, the deck picker |

**`lib/`** is plain TypeScript with no React in most of it, so it can be tested without a DOM. The
table's camera is `tableLayout.ts`: `project(u, v, z)` is the CSS 3D camera written as arithmetic,
and `computeLayout()` turns a viewport into the scale, the seat and bet positions, the pot block and
where the coach goes. `tableModel.ts` turns a backend snapshot into what the table shows, and
`tableMotion.ts` diffs two snapshots into the events the table animates. The coach's glance, working
rows and range lines are `coachView.ts`, `coachWorking.ts` and `coachRange.ts`. Alongside them are
sizing and presets, hotkeys, error parsing, ring geometry, the starfield and its masks, the stats,
history, lab and study models, and the decks.

Every chip amount reaches the screen through `format.ts`: `bb(chips, bigBlind)` shows at most
one decimal and drops a trailing `.0` (25 at a 10-chip big blind is "2.5"), `parseBB` reads a
typed size ("7.5", "7,5", "75bb") back into chips, and `bigBlindOf` takes the big blind from
the payload itself, falling back to 2 for records stored before phase 1. A Lab simulation's
state is a pure reducer in `labJob.ts`, and its request loop (create, poll every 400 ms, one
poll at a time, cancel, pause and resume) is `labJobController.ts`, with the transport and
timers injected so it is tested with fake timers.

**`lib/useTableSession.ts`** is the table session hook. It lives in `App`, above the views, so the
game keeps running while another view is open: bots keep stepping (650 ms apart, 1,000 ms for the
first action of a hand) and the coach keeps fetching. It owns the latest snapshot, the HUD reads,
the coach mode (on, think first, off) and the coach's answer for the decision on screen, and errors
scoped to where they happened (boot, new game, action, advance, next hand, coach), each dismissible
and retryable; a 409 reloads the state instead of resubmitting. Its bookkeeping is in plain classes
in `sessionGuards.ts`: a decision clock that sends one `decision_ms` per decision, and a generation
counter that drops any response to a request made before New game. `coachStatus.ts` says what the
coach area should show.

`App` keeps every visited view mounted inside React's `<Activity>`, so a hidden view keeps its state
and its effects pause until it is shown again. There is no router and no URL state; a reload lands
on the table.

### Tests

`npm test` runs **vitest** (`vitest run`): **428 tests in 37 files**, all `src/lib/*.test.ts`, in a
Node environment with no DOM. They test the pure logic, not the components. The largest groups are
the table's layout and camera (44), the lab (33), the replay and hand list shaping (27 and 26), the
table model (24), the stats model (22), the formatter (16), and the Lab job reducer and request
loop (15 each). Many assert a specific number or property: the
projection against its closed form; every bet clearing the board, the backs, the pot block and the
rim at each tested viewport size; the top seat labels at least 20 px apart; a 409 on an action being
retryable and a 404 needing a new game. One (`tokens.test.ts`) reads `index.css` and checks that
the CSS and the JS agree on the springs, the breakpoints and the top bar's height. The fixtures in
`lib/__fixtures__/` and the coach answers in `lib/coachSamples.ts` were captured from the running
backend, not written by hand.

`npm run build` type-checks the app and the tests (`tsc -b`) before building, and `npm run lint`
runs ESLint.

State of record lives in the backend. The frontend renders it and holds no game rules: who may act,
what is legal and who won all come from `poker.api`.

## The boundary

The frontend talks to `poker.api` over REST. Everything the coach displays is computed
by `poker.math` and labelled as computed maths - exact GTO frequencies are never
asserted, and the coach defers to a solver for those.
