# Stage: shared layer

What exists for every view. Each file documents its props at the top; this is the index.
The look is the approved Stage prototype (`scratchpad/round2/stage/`); tokens live in
`src/index.css`.

## Tokens (src/index.css)

- Colours (Tailwind utilities and CSS vars): `ink` #f5f5f7, `fog` #a1a1a6, `dust` #86868b,
  `dust-sheet` #98989d (tertiary on the sheet), `signal` #2997ff, `win` #30d158, `loss` #ff453a,
  `close` #ffd60a, `void` #000, `sheet` #1c1c1e, `sheet-line`, `hairline`, `quiet` / `quiet-hi`
  (white 7% / 13%), `act` / `act-hi` (white 10% / 16%), `glass`, `white`, `black`. Tailwind's
  default palette is removed. CSS: `var(--ink)` etc.; ring tones `--tone-{good,neutral,close,fold}-{a,b}`.
- Type: `text-hero` 80, `text-facts` 64, `text-display` 56, `text-verdict` 30, `text-title` 28,
  `text-headline` 20, `text-body` 17, `text-callout` 15, `text-foot` 13, `text-caption` 12;
  `font-strong` = 650; `tracking-display|title|body`; numbers: `tabular-nums`.
- Radii: capsules `rounded-full` (never squircled); `rounded-control` 12, `rounded-tip` 14,
  `rounded-button` 18, `rounded-menu` 22, `rounded-sheet` 30, plus `squircle` (corner-shape).
- Materials: `material-glass` (one per screen), `glass-rim` (light-only rim), `material-sheet`.
- Motion: `ease-spring` / `ease-bouncy` / `ease-grow` (CSS) = `EASE.*` in `lib/motion.ts`;
  `--dur-quick` 200 ms, `--dur-base` 460 ms.
- Breakpoints: `sm` 600, `lg` 1100 only (`max-sm:`, `max-lg:` too). JS: `lib/breakpoints.ts`.
- Shell: `--bar-h` (64, 56 on a phone), `--sab` (safe-area bottom).
- Layers (z): space 0, views 1, coach 8, dock 10, top bar 20, scrim 29, sheet 30, dock over a
  bottom sheet's scrim 31, menu 40, tooltip 50.
- There are no other colour, font or animation names: the pre-Stage aliases (`bg-bg2`,
  `text-muted`, `accent`, `felt`, `font-mono`, `animate-rise` ...) were removed once every
  view was rebuilt. An unknown utility simply generates no CSS, so check the rendered page.

## Primitives (src/ui/)

- `Space` - the void behind every view: deterministic starfield, the planet limb, the light
  source. Rendered once in App. `variant` stage|page, `dollyKey`, `intro`.
- `Capsule` - the button. `variant` primary|secondary|quiet, `size` sm 34|md 44|lg 48.
- `MethodChip` - how an equity figure was computed ("Exact", "±0.4 pp", "Table"): a small quiet pill, decorative (the figure's label speaks it).
- `IconButton` - a circle holding one icon. `label` (required), `size`, `variant`.
- `Segmented` - exclusive choice as a radiogroup with roving focus; selected segment >= 3:1.
- `Sheet` - non-modal side panel (desk) / bottom sheet with grabber and medium/large detents
  (phone, tablet). Escape and Done close; focus to Done and back. `bottomInset` to end it
  above the dock; `mediumTop` to stop the medium detent under something (the table's
  phone sheets stop under your cards). A view coming back into sight replays nothing.
- `Disclosure` - button with aria-expanded + chevron + the block it shows; controlled or not.
- `Tooltip` - description on hover, focus and tap; `InfoButton` - a circled i that pins a
  note open on tap. (Internals: `useTip`, `TipBubble`.)
- `Ring` - the coach equity ring: `realizedPct`, `needPct|null`, `rawPct?`, `tone`, `size`,
  `reveal`. Raw equity is a dot outside the track, never merging with the price notch.
- `Icons` - `IconLog`, `IconMore`, `IconChevronRight`, `IconBack`, `IconAlert`, `IconInfo`,
  `IconClose`, `IconCoach`.
- `ErrorNotice` - a scoped error: human headline by status code + context, the backend
  detail visible, optional Dismiss / Try again. `layout` stack|row; `compactDismiss`
  (a close button, for the phone dock). Page views give it one 640 px measure.
- `PageHeader` - the title row of every page view: the h1, optional `controls` bottom-aligned
  with it, an optional `note` under them; the title sits at the same height on all five.
- `LayerHost` - where a view's overlays portal (App wraps every view): a hidden view's open
  sheet hides with it.

Cards: `components/Card.tsx` (`Card`: a face or the back) and `lib/decks.tsx`; the table's
turning card is `FlipCard` in `components/table/Felt.tsx`. Five
decks: Standard (default), Four-color, Large index, Minimal, Classic (ids `standard`,
`four`, `large`, `minimal`, `classic`; old ids migrate, `lib/deckIds.ts`). One back for all.

## Logic (src/lib/: pure modules with *.test.ts; the hooks in it wire them to React)

- `apiError.ts` - `ApiError` {status, code, detail, path}; FastAPI string / 422 array
  detail -> readable text; `describeError(err, context)` -> {headline, detail, retryable,
  needsNewGame}. `api.ts` throws ApiError for every failure.
- `useTableSession.ts` - the table session hook (see "Contracts"); its bookkeeping lives in
  `sessionGuards.ts` (`DecisionClock`: decision_ms per decision; `Generation`: a response
  from before New game is dropped) and `coachStatus.ts`.
- `coachStatus.ts` - `deriveCoachStatus()`: off | idle | loading | ready | error;
  `coachSlot()`: that status and the answer/error bookkeeping for the decision on screen.
- `sheetHeights.ts` - a bottom sheet's medium and large detents. `svgIds.ts` - give a
  cloned SVG its own ids (the motion's ghosts).
- `prefsSchema.ts` - stored prefs: deck, visibility (labeled|hud|live), coach mode
  (on|think|off); `usePrefs()` from `prefsContext.ts` exposes all three.
- `motion.ts` - `EASE`, `DUR`, `play(el, keyframes, opts)` (spring, fill backwards, skipped
  under reduced motion), `useReducedMotion()`.
- `breakpoints.ts` - `BP`, `layoutKind(w)`, `useLayoutKind()`, `useViewportSize()`, `barHeight(w)`.
- `space.ts` / `spaceAvoid.ts` - star data, horizon geometry (`limbTop`, `sunPlacement`),
  `holeMask`; `useSpaceAvoid(owner, rects)` keeps stars out from under a view's UI.
- `ring.ts` - ring geometry and `normalizeTone()` (unknown -> neutral).
- `escapeStack.ts` - `useEscape(active, onEscape)`: Escape closes only the top-most layer.
- `tipPosition.ts` - tooltip placement. `format.ts` - `chips`, `signedChips`, `signed`, `pct`.
- `cards.ts` - `parseCard`, `cardLabel` ("Ace of spades"), `splitCards`. `views.ts` - the six views.

## Contracts for the parallel builders

- `components/table/TableView.tsx` - `TableView({ table: TableSession, logOpen: boolean,
  onLogOpenChange(open) })`. Table builder owns `components/table/` (the old Table,
  MobileTable, Seat, Board, ActionBar, ActionLog live there now) and `lib/useTableSession.ts`.
- `lib/useTableSession.ts` - `TableSession`: `session`, `reads`, `booting`, `busy`, `heroTurn`,
  `decisionKey`, `coachMode`, `setCoachMode`, `coaching`, `coachStatus`, `askCoach`,
  `hideCoach`, `errors` (scoped: boot|newGame|action|advance|nextHand|coach), `dismissError`,
  `retry`, `act`, `nextHand`, `newGame`.
- `components/coach/CoachGlance.tsx` - `{ coaching, status, error?, layout: 'side'|'row',
  onAsk, onRetry, onDismissError, onOpenMaths }`. Coach builder owns `components/coach/`.
- `components/coach/MathsSheet.tsx` - `{ coaching, open, onClose, bottomInset? }`.
- The page views, each owning its folder: `components/stats/StatsView.tsx`
  `StatsView({ onGoToTable? })`, `components/history/HistoryView.tsx`
  `HistoryView({ sessionId?, onGoToTable? })`, `components/lab/LabView.tsx` `LabView()`,
  `components/study/StudyView.tsx` `StudyView()`, `components/prefs/PreferencesView.tsx`
  `PreferencesView({ coachMode?, onCoachMode? })` (App passes the table's own coach setter).
- Shell (App.tsx, `components/shell/`): renders every view inside `<Activity>` + `LayerHost`
  under a `<main class="pt-[var(--bar-h)] pb-40">` (the table renders its own fixed main).
