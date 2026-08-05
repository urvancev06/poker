# Frontend

The table UI: React + Vite + TypeScript + Tailwind v4. It renders state served by the
Python backend and holds no game logic of its own.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run lint
```

The backend is expected at `http://127.0.0.1:8000`. Override with `VITE_API_URL`, which is
baked in at build time rather than read at runtime:

```bash
VITE_API_URL=/api npm run build
```

## Layout

```
src/
  main.tsx      entry point
  App.tsx       shell: view nav, coach toggle, opponent visibility mode, hand pacing
  api.ts        typed client mirroring the backend serialisers
  index.css     Tailwind import and the theme tokens (see ../DESIGN.md)
  prefs.tsx     preferences provider (persists deck + opponent visibility)
  lib/          deck definitions and card geometry, seat labels, action text
  components/   Table, Seat, Board, Card, ActionBar, ActionLog, CoachPanel,
                StatsView, HistoryView, LabView, StudyView, MobileTable
```

Cards are drawn as inline SVG in `components/Card.tsx`, with face layouts and backs
defined in `lib/decks.tsx` (five selectable decks). Nothing is fetched at runtime, so there
are no card image assets.

`MobileTable.tsx` is a separate portrait layout for small screens; the desktop table
scales to fit its container so seats never overlap the board.
