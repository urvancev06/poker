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
- Legacy aliases (`bg-bg2`, `text-muted`, `text-faint`, `border-line`, `accent`, `felt`,
  `animate-rise`, `font-mono` ...) exist only so the pre-Stage views still render. Do not use
  them in new code; delete them when the last old view is rewritten.

## Primitives (src/ui/)

- `Space` - the void behind every view: deterministic starfield, the planet limb, the light
  source. Rendered once in App. `variant` stage|page, `dollyKey`, `intro`.
- `Glass` - the glass material wrapper (fill, blur, hairline, top specular, blue lower rim,
  shadow). `as`, `shape` capsule|sheet|none.
- `Capsule` - the button. `variant` primary|secondary|quiet, `size` sm 34|md 44|lg 48.
- `IconButton` - a circle holding one icon. `label` (required), `size`, `variant`.
- `Segmented` - exclusive choice as a radiogroup with roving focus; selected segment >= 3:1.
- `Sheet` - non-modal side panel (desk) / bottom sheet with grabber and medium/large detents
  (phone, tablet). Escape and Done close; focus to Done and back. `bottomInset` to end it
  above the dock.
- `Disclosure` - button with aria-expanded + chevron + the block it shows; controlled or not.
- `Tooltip` - description on hover, focus and tap; `InfoButton` - a circled i that pins a
  note open on tap. (Internals: `useTip`, `TipBubble`.)
- `Ring` - the coach equity ring: `realizedPct`, `needPct|null`, `rawPct?`, `tone`, `size`,
  `reveal`. Raw equity is a dot outside the track, never merging with the price notch.
- `Icons` - `IconLog`, `IconMore`, `IconChevronRight`, `IconBack`, `IconAlert`, `IconInfo`,
  `IconClose`, `IconCoach`.
- `ErrorNotice` - a scoped error: human headline by status code + context, the backend
  detail visible, optional Dismiss / Try again. `layout` stack|row.
- `LayerHost` - where a view's overlays portal (App wraps every view): a hidden view's open
  sheet hides with it.

Cards: `components/Card.tsx` (`Card`, `DealtCard`, `BoardCard`) and `lib/decks.tsx`. Five
decks: Standard (default), Four-colour, Large index, Minimal, Classic (ids `standard`,
`four`, `large`, `minimal`, `classic`; old ids migrate, `lib/deckIds.ts`). One back for all.

## Pure logic (src/lib/, each with *.test.ts)

- `apiError.ts` - `ApiError` {status, code, detail, path}; FastAPI string / 422 array
  detail -> readable text; `describeError(err, context)` -> {headline, detail, retryable,
  needsNewGame}. `api.ts` throws ApiError for every failure.
- `useTableSession.ts` - the table session hook (see "Contracts").
- `coachStatus.ts` - `deriveCoachStatus()`: off | idle | loading | ready | error.
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
- `components/stats/StatsView.tsx` `StatsView()`, `components/history/HistoryView.tsx`
  `HistoryView({ sessionId? })`, `components/lab/LabView.tsx` `LabView()`,
  `components/study/StudyView.tsx` `StudyView()`, `components/prefs/PreferencesView.tsx`
  `PreferencesView()` - moved unchanged (plus page gutters); each builder rewrites its own.
- Shell (App.tsx, `components/shell/`): renders every view inside `<Activity>` + `LayerHost`
  under a `<main class="pt-[var(--bar-h)] pb-40">` (the table renders its own fixed main).
