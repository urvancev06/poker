# DESIGN.md — Visual Spec

The shipped direction is **Mono Minimal / Editorial**: dark, flat, type-driven, one accent. This
file is the written source of truth for the rules. The values below mirror
`frontend/src/index.css`, which is what actually runs; if the two ever drift, the CSS is the
authority on values and this file is the authority on intent.

**The intent:** a quiet private game, not a casino floor. Cool neutral dark surfaces, one green
accent spent sparingly, and typography carrying the hierarchy instead of colour. Restraint is the
whole aesthetic - hairlines instead of heavy borders, flat fills instead of lighting effects, and
no element decorated beyond what it needs to be read.

---

## 1. Palette (tokens)

Declared in `frontend/src/index.css` under `@theme`, so Tailwind exposes each one as a utility
(`text-ink`, `bg-bg2`, `border-line`). Contrast is measured against `--color-bg`; the rows marked
*step* are surface lifts rather than text colours, so their low ratios are deliberate.

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `--color-bg` | `#111114` | — | base background, lifted off near-black |
| `--color-bg2` | `#2a2a34` | 1.33:1 step | raised surfaces, panels, menus |
| `--color-felt-core` | `#1c1d23` | 1.12:1 step | the table "felt" |
| `--color-felt-edge` | `#101116` | — | felt edge, card-back fill |
| `--color-ink` | `#ffffff` | 18.9:1 | primary text, numerals, headings |
| `--color-muted` | `#bdbec8` | 10.2:1 | secondary text and labels |
| `--color-faint` | `#94959f` | 6.3:1 | tertiary text, captions, chart axes |
| `--color-line` | `#5f6170` | 3.1:1 | borders - a hairline you can actually see |
| `--color-hair` | `#2e2f37` | 1.4:1 step | faint internal dividers, decorative only |
| `--color-accent` | `#2bd673` | 9.9:1 | terminal green, the single accent |
| `--color-accent-soft` | `rgba(43,214,115,0.12)` | — | soft accent fill for a highlighted state |
| `--color-accent-ink` | `#06140c` | — | text on an accent fill |
| `--color-card` | `#f4f4f5` | — | playing-card face, kept light for legibility |
| `--color-card-ink` | `#18181b` | — | black suits and indices |
| `--color-card-red` | `#e0574c` | — | red suits |
| `--color-win` | `#2bd673` | 9.9:1 | positive result |
| `--color-loss` | `#e0574c` | 5.1:1 | negative result |
| `--color-warning` | `#f0b429` | 10.1:1 | caution |

Body, secondary and tertiary text all clear AA (≥4.5:1); borders and the accent clear the 3:1 UI
floor. The dim end is lifted rather than flattened, so the ink ≫ muted > faint hierarchy survives.

No blue and no purple in the chrome. Meaning comes from the accent, the two win/loss tones and
typography, never from a spread of hues. The optional four-colour deck is the one exception, and
there the blue and green are suit identity rather than UI colour.

---

## 2. Typography

- **Display, wordmark, headings:** **Sora** (`--font-display`), weights 400/500/600/700.
- **UI and body:** Sora (`--font-ui`). Same family, so weight and size do the separating.
- **Numbers:** **IBM Plex Mono** (`--font-mono`), weights 300–700. The `.tabular-nums` class
  switches an element to mono with `font-feature-settings: "tnum"`, so stacks, pots, equities and
  stat columns line up. Every figure the reader might compare down a column goes through it.
- Both families are self-hosted via `@fontsource` imports in `frontend/src/main.tsx`. No font CDN;
  the faces ship with the bundle.

Scale, approximately: view titles 24–30px · panel headings 16–18px · body 13–14px · labels 10–11px
uppercase, letter-spaced ~0.15em · headline numbers 20–24px mono.

---

## 3. Components

- **Felt table:** a flat fill (`--color-felt-core`) in a rounded oval, outlined by one `--color-line`
  hairline with a fainter `--color-hair` ring inset from it. No gradient, no glow, no shadow. The
  depth is the step from `--color-bg` to the felt, nothing more.
- **Cards:** drawn as **inline SVG**, not sprites and not CSS boxes. Deck definitions and geometry
  live in `frontend/src/prefs.tsx`; `frontend/src/components/Card.tsx` renders them. All decks share
  a `100 × 140` viewBox, so they are interchangeable at any width and only styling differs. A soft
  drop shadow lifts a card off the felt. The active deck is a user preference, kept in localStorage.
- **Seats:** a quiet panel with name, stack in mono tabular figures, and one line of secondary text.
  The archetype label is plain text and never a coloured badge; what it shows at all is gated by the
  visibility mode (STRATEGY.md §4).
- **Coach panel:** verdict first, in one line. Equity is a 2px track with no radius, filled with the
  accent, carrying a tick at the required-equity point so price and equity are read in one glance.
  Pot odds sit beside it as small mono readouts.
- **Action bar:** Fold is an outline button, Call is a subtle fill, Bet/Raise is the one accent fill -
  the single strong colour moment on the screen. Slider plus quick sizes (½, ¾, pot, all-in).

---

## 4. Motion

Short and literal: cards flip from back to face over ~450ms, panels rise in over ~0.28s, bot actions
fade. Motion only ever describes something that happened. Nothing loops, pulses, bounces or
overshoots, and nothing glows. `prefers-reduced-motion: reduce` collapses every animation and
transition to ~0 in `index.css`, so no information is carried by movement alone.

---

## 5. Accessibility and quality floor

- Contrast as in §1: body text clears AA, borders and the accent clear 3:1.
- `:focus-visible` gets a 2px accent outline at 2px offset, set globally in `index.css`. Nothing
  removes it.
- Responsive down to mobile: the table scales and the coach panel stacks beneath it.
- The header is the logo plus the wordmark "Poker" and nothing else
  (`frontend/public/brand/urvancev-logo-white.svg`, favicon `frontend/public/favicon.svg`/`.ico`).

---

## 6. Do / Don't

**Do:** cool dark neutrals; one accent; hairlines over heavy borders; mono tabular numbers;
plain-text labels; let type, weight and spacing carry the hierarchy.

**Don't:** neon accents or glows; multi-colour archetype badges; glassy gradient panels; CSS-drawn
or bitmap cards; bright casino-green felt; anything that reads as a crypto or gambling dashboard.

> The single rule: spend the boldness on the accent and the cards, and keep everything else quiet.
