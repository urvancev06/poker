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
  main.tsx      entry point (Inter Variable with its opsz axis, self-hosted)
  App.tsx       the Stage shell: space background, top bar, centred nav, "..." menu, views
  api.ts        typed client mirroring the backend serialisers; throws ApiError
  index.css     Stage tokens (colour, type, radii, materials, springs, breakpoints) as
                CSS vars and Tailwind @theme
  prefs.tsx     preferences provider (deck, opponent visibility, coach mode)
  ui/           shared primitives: Space, Glass, Capsule, IconButton, Segmented, Sheet,
                Disclosure, Tooltip, InfoButton, Ring, Icons, ErrorNotice (see ui/README.md)
  lib/          pure logic with vitest tests, the table session hook, decks
  components/   Card, shell/, table/, coach/, stats/, history/, lab/, study/, prefs/
```

Cards are inline SVG on one 100 x 140 viewBox (`components/Card.tsx`, `lib/decks.tsx`, five
selectable decks), so there are no card image assets.

```bash
npm test         # vitest (pure logic in src/lib)
```
