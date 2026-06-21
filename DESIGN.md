# DESIGN.md — Visual Spec: "Felt & Brass"

The look for the app. Rendered reference: **`references/poker-design-directions.html`, direction 01** — match it. This file is the written source of truth; if the two ever disagree, this file wins for *rules*, the HTML wins for *feel*.

**The idea:** a quiet, expensive private game — warm, low-lit, restrained. The opposite of a neon casino or a generated dashboard. It must not "look like a scam," and it must not look AI-generated.

---

## 1. Palette (tokens)

Use these as CSS variables. One accent only — **brass** — used sparingly.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#16140e` | warm near-black background |
| `--bg-2` | `#1d1a12` | panels / raised surfaces |
| `--felt-core` → `--felt-edge` | `#1f3d30` → `#0f2018` | table felt, radial — **desaturated, never bright green** |
| `--ink` | `#ece4d2` | primary text (warm bone) |
| `--muted` | `#9a9078` | secondary text, labels |
| `--line` | `#2b2618` | borders, dividers (low contrast) |
| `--accent` | `#c9a44e` | **brass** — wordmark, key numbers, primary button only |
| `--accent-ink` | `#1c1608` | text on the brass button |
| `--card-bg` | `#f4efe1` | ivory card stock |
| `--card-ink` | `#1c1813` | card black suits / indices |
| `--card-red` | `#9e2b25` | card red suits (deep oxblood, **not** bright red) |
| `--win` | `#7d9b6a` | muted sage for positive/equity (use rarely; brass is primary) |
| `--loss` | `#a8534a` | muted clay for negative |

There is **no blue, no purple, no bright green/red.** Semantic meaning comes from brass + the two muted win/loss tones + typography, not a rainbow.

---

## 2. Typography

- **Display / wordmark / headings:** **Fraunces** (characterful serif, used with restraint). Weights 400/600.
- **UI / body:** **Hanken Grotesk**. Weights 400/500/700/800.
- **Numbers** (stacks, pot, equity, odds, stats): Hanken Grotesk with **tabular figures** (`font-variant-numeric: tabular-nums`) so columns align.
- *Do not* use DM Sans or JetBrains Mono (the rejected default pairing).

Type scale (approx): wordmark 21px/600 Fraunces · panel headings 16–19px Fraunces · body 13–14px Hanken · labels 10–11px Hanken uppercase, letter-spaced · big numbers 18–22px tabular.

---

## 3. Components

- **Felt table:** radial gradient `--felt-core` → `--felt-edge`, a thin rail, a soft inset shadow for depth, a barely-there centre watermark. No glow.
- **Cards:** **real downloaded SVG deck** (see PROJECT.md §4) on ivory stock, soft drop shadow, gently rounded corners. Face-down = a tasteful brass-on-dark back. Do **not** hand-draw cards in CSS.
- **Seats:** a quiet card with avatar, name, stack (tabular), and a small **archetype label as plain text** (e.g. "TAG · c-bet"), not a coloured badge. HUD line (VPIP/PFR) in small muted tabular figures.
- **Coaching panel:** ivory-on-dark restraint. Hand title in Fraunces; equity as a slim bar filled in brass with a small marker at the required-equity point; pot-odds vs equity as two small readouts; one-line suggested read with a thin brass left-border.
- **Action bar:** Fold = quiet outline; Call = subtle filled; **Raise = the brass button** (the one strong colour moment). Bet slider with a brass thumb; quick-size chips (½ / ¾ / pot / all-in).

---

## 4. Motion

Restrained. A gentle deal/slide for cards, a soft fade for bot actions, a quiet highlight on the seat to act. **No glows, no pulsing neon, no bouncy effects** — over-animation reads as AI-generated. Respect `prefers-reduced-motion`.

---

## 5. Accessibility & quality floor

- Readable contrast (the warm palette must still pass for body text).
- Visible keyboard focus on every control (a brass focus ring).
- Responsive down to mobile (the table scales; the coach panel stacks under it).
- The header is **my logo + the wordmark "Poker"** — nothing else (`brand/urvancev-logo-white.svg`, favicon from `brand/favicon.svg`/`.ico`).

---

## 6. Do / Don't

**Do:** warm, low-lit, restrained; one brass accent; real card art; lots of quiet neutral; tabular numbers; let the cards and felt carry it.

**Don't:** near-black + neon accents; multi-colour archetype badges; glows or glassy gradient-cards everywhere; DM Sans / JetBrains Mono; bright casino green; CSS-generated cards; anything that reads as a crypto/gambling dashboard.

> The single rule: **spend the boldness on the brass and the cards; keep everything else quiet.**