# DESIGN.md — Visual Spec

The shipped direction is **Stage**. This file is the written source of truth for the rules. The
values below mirror `frontend/src/index.css`, which is what actually runs; if the two ever drift,
the CSS is the authority on values and this file is the authority on intent. Component-level
numbers (the table's camera, the ring's geometry) live in the `frontend/src/lib/` module named
next to them, and those modules have tests.

**The intent:** a product shot on a dark stage, not a casino floor. The background is a true black
void with a sparse starfield and a planet's limb glowing blue at the bottom of the frame. In the
middle sits one obsidian table, seen in real perspective and lit from below by that atmosphere.
Everything else is type floating on the void, one ring beside your hand, and one glass dock that
holds every action. The read sits next to your cards: over the price or short of it, in one glance.

Restraint is still the aesthetic. One family of type, one interactive blue, colour spent only where
it means something (the coach's tone, a win or a loss), and no element decorated beyond what it
needs to be read.

---

## 1. Palette (tokens)

Declared on `:root` in `frontend/src/index.css` under short names (`--ink`, `--fog` ...) and
mapped into Tailwind's namespaces in `@theme inline`, so each is also a utility (`text-ink`,
`bg-sheet`, `text-signal`). Tailwind's own palette is removed (`--color-*: initial`): an unknown
colour utility generates no CSS at all, so a colour that is not here cannot appear by accident.

| Token | Value | On `#000` | On the sheet `#1c1c1e` | Worst measured in use | Use |
|---|---|---|---|---|---|
| `--void` | `#000` | — | — | — | the background of everything |
| `--ink` | `#f5f5f7` | 19.3:1 | 15.6:1 | 5.50 (stats segmented control, on its selected fill) | primary text, numerals, the ring's notch |
| `--fog` | `#a1a1a6` | 8.2:1 | 6.6:1 | 6.61 (maths notes on the sheet) | secondary text, the ring's price arc |
| `--dust` | `#86868b` | 5.8:1 | 4.7:1 | 5.66 (figure labels on a phone, near the limb glow) | tertiary text on the void |
| `--dust-sheet` | `#98989d` | 7.3:1 | 5.9:1 | 5.93 (working tags, folded log rows) | tertiary text on the sheet |
| `--signal` | `#2997ff` | 6.96:1 | 5.6:1 | 5.64 (disclosures on the sheet) | interactive text, focus ring, the atmosphere's light |
| `--win` | `#30d158` | 10.4:1 | 8.4:1 | 6.16 (verdict) | a win, a good verdict |
| `--loss` | `#ff453a` | 6.2:1 | 5.0:1 | 5.05 (result on the phone's glass) | a loss, a fold verdict, a flagged decision |
| `--close` | `#ffd60a` | 14.9:1 | 12.1:1 | — | a close verdict |
| `--hairline` | `rgba(255,255,255,0.12)` | — | — | — | dividers, decorative only |

How the columns were got, honestly:

- **On `#000` and on the sheet** are the WCAG ratio of the hex value against a flat background,
  computed from the tokens.
- **Worst measured in use** comes from the approved prototype's rendered-page probe
  (`round2/stage/notes.md`). Every text box in 22 rendered cases was recorded, 938 in all; the text
  was then hidden and the real background screenshotted, and each colour was checked against the
  2nd- and 98th-percentile pixel of its own box. Every real text box passed AA, and the worst was
  5.05:1. That probe ran on the prototype, not re-run on the port. The tokens are identical, but
  the port's layouts differ in detail.
- `--dust` measures 4.7:1 on the sheet, which is why the sheet has its own tertiary colour.

**Coach ring tones** (start of the arc → its tip; the gradient runs along the arc):

| Tone | Start | Tip | On `#000` |
|---|---|---|---|
| `good` | `--tone-good-a` `#1aa64a` | `--tone-good-b` `#4cf27a` | 6.6 → 14.3:1 |
| `neutral` | `--tone-neutral-a` `#8e8e93` | `--tone-neutral-b` `#f5f5f7` | 6.4 → 19.3:1 |
| `close` | `--tone-close-a` `#d4a400` | `--tone-close-b` `#ffe14d` | 9.1 → 16.1:1 |
| `fold` | `--tone-fold-a` `#d8382c` | `--tone-fold-b` `#ff6a5f` | 4.5 → 7.5:1 |

A tone always comes from the backend's `tone` field (`lib/ring.ts` `normalizeTone`); anything
unknown renders neutral. The verdict text is never parsed for a colour.

**Data colours local to a view** (declared on the view's root, not global):

- `#ff9f0a` (10.2:1) for out of band, in My stats and the Lab. Out of band is also said in text,
  as the signed distance (`+0.14`), so the orange is never the only cue.
- `#6b6b6e` (3.9:1) for trend bars, chart bars and dots.
- `#64d2ff` as the second stop of the readiness ring and the leak-review progress sweep.

No purple and no casino green. Blue is the light source and the interactive colour; green,
yellow and red are the coach's three tones and a hand's result.

---

## 2. Typography

**One family.** `--font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Variable",
system-ui, sans-serif`. On Apple devices that resolves to the system's SF Pro. Everywhere else it
falls through to **Inter Variable**, self-hosted from `@fontsource-variable/inter` (5.3.0): its
`opsz.css` is imported in `frontend/src/main.tsx`, so the faces ship with the bundle (weights 100–900,
the optical-size axis, `font-display: swap`) and nothing is fetched from a font CDN.
`font-optical-sizing: auto` is set on `body`, so Inter tightens at display sizes and opens up at
caption sizes the way SF Pro does. The earlier Sora / IBM Plex Mono pairing is gone, and there is no
monospace face anywhere.

**Numbers are tabular.** Without a mono face, alignment comes from tabular figures: stacks,
bets, the pot, equities, percentages and stat columns set Tailwind's `tabular-nums`
(`font-variant-numeric: tabular-nums`), as do `Capsule`, `Segmented` and the tooltip bubble, so a
figure that changes in place or lines up in a column never shifts. It is set per element rather
than globally, so running prose keeps proportional figures. The minus sign is a real `−`.

**Scale** (Tailwind `text-*` utilities; size / line-height / letter-spacing):

| Token | Size | Line-height | Tracking | Where |
|---|---|---|---|---|
| `text-hero` | 80 | 1 | −0.045em | My stats' hand count |
| `text-facts` | 64 | 1 | −0.035em | the facts beside it, CFR's exploitability, a range's width in Study |
| `text-display` | 56 | 1 | −0.035em | page titles (40 on a phone) |
| `text-verdict` | 30 | 1.06 | −0.028em | the coach's verdict (34 at ≥ 1700 × 960; 22 in the phone row) |
| `text-title` | 28 | 1.1 | −0.02em | the pot |
| `text-headline` | 20 | 1.2 | −0.018em | the coach's figures, your hand's label, sheet titles |
| `text-body` | 17 | 1.45 | inherited −0.011em | body, the coach's rationale |
| `text-callout` | 15 | 1.35 | inherited | secondary lines, bet labels |
| `text-foot` | 13 | 1.35 | 0 | seat lines, notes, the street label |
| `text-caption` | 12 | 1.3 | 0 | figure labels, provenance tags |

`body` itself is 17 px / 1.35 / −0.011em. Tracking tokens: `--track-display` −0.035em,
`--track-title` −0.022em, `--track-body` −0.011em. `font-strong` is weight **650**, between
semibold and bold, and is what names, stacks, the pot and figures use. Seat names are 19 / 650
(15 on a phone), with the stack beside them at 17 / 500 in `--fog`.

The UI copy uses US spelling ("Realized", "Labeled"), matching the backend's strings; these
documents use British spelling.

---

## 3. Radii

- **Capsules are true capsules**: radius = height / 2, never squircled (`rounded-full`). That
  covers the dock (64 px tall, radius 32), its buttons (48, radius 24, sitting 8 px inside: one
  centre), the phone dock (66), the nav, New game, presets and segmented controls.
- **Circles**: `…`, the log button, the info button, the dealer puck.
- **Squircles** (`squircle` utility: `corner-shape: squircle`) only where the radius is less than
  half the height: `--r-sheet` 30 (sheets), `--r-menu` 22, `--r-tip` 14 (tooltips),
  `--r-control` 12 (menu items). Notices on page views use 20; `--r-button` 18 is the deck
  picker's options in Preferences. A squircle at radius 999 squares a pill off, which is why
  capsules never get one.
- **Cards**: a continuous-corner SVG path (corner length 16 on the 100 × 140 viewBox); the element's
  own radius (`16% / 11.43%`) matches it, so a shadow follows the card.
- **The slab**: `border-radius: 50%` with `corner-shape: superellipse(1.35)`.

`corner-shape` is Chromium-only (139+). Elsewhere the squircles are ordinary radii and the slab is
a plain ellipse; nothing breaks.

---

## 4. Materials

There are two, and the rule for choosing is whether anything lit sits behind the surface.

**Glass** floats over light: the table's dock over the atmosphere. **One per screen.**

- fill `--glass-fill` `rgba(22, 26, 34, 0.46)`, `--glass-blur` `blur(36px) saturate(170%)`;
- a 1 px hairline `--glass-line` `rgba(255, 255, 255, 0.15)` and a top specular `--glass-spec`
  `inset 0 1px 0 rgba(255, 255, 255, 0.2)`;
- a blue lower rim `--glass-under` `inset 0 -1px 0 rgba(140, 200, 255, 0.26)`, because the light
  comes from below;
- a deep shadow `--glass-shadow` `0 24px 60px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.4)`.

Utilities: `material-glass` (all of it) and `glass-rim` (the light only, no blur). The table's dock
is built in three parts so the blur never resizes: a blurred box sized once per morph whose visible
capsule is an animated `clip-path: inset(... round r)`, a separate light-only rim pill, and a shadow
that scales on the compositor (`components/table/Dock.css`). The Lab's run dock is the only other
glass, with a denser fill (`rgba(18, 21, 28, 0.84)`) because rows of text scroll behind it.

The budget: the plan allowed two `backdrop-filter` elements on a desktop and one on a phone. The
app uses one on every screen.

**Sheet** is the opaque, elevated surface for anything over the void: the maths, the hand log, the
menu, tooltips, the replay panel, notices, the Preferences choice lists. `--sheet-fill` `#1c1c1e`,
`--sheet-line` `rgba(255, 255, 255, 0.1)`, `--sheet-shadow` (a top highlight, the hairline, and
`0 30px 80px rgba(0, 0, 0, 0.7)`). Utility: `material-sheet`. There is nothing behind a sheet to
blur, so it has no `backdrop-filter`.

**Quiet fills** for buttons on either: `--fill-quiet` white 7% (hover 13%) for New game, Done and Ask
the coach; `--fill-act` white 10% (hover 16%) for the dock's Fold / Call / Raise.

---

## 5. Space

`ui/Space.tsx`, rendered once at the app root behind every view (`lib/space.ts` holds the maths).

- **Stars** are deterministic (a seeded `mulberry32`), so the sky is the same on every load: a far
  layer of 260, a near layer of 70 and a few bright stars, thinning towards the limb. The star SVG
  renders once and never again.
- **The planet** is a black circle 300vmax wide whose lit limb sits `limbHeight` above the
  viewport's bottom: 5.5% of the height, clamped to 34–60 px. **The light source** is a star
  rising behind it, 62% across (72% under 700 px). The table's glint is placed from it.
- **Stars stay out from under the UI.** Each view reports its rects (`useSpaceAvoid`); near stars
  inside one are dropped, far stars drop to a whisper, bright stars keep 40 px clear, and the top
  bar's band fades. This only rewrites CSS masks.
- On the table the space is fixed to the viewport. On a scrolling page the stars stay put and the
  horizon sits at the end of the document, so the limb never crosses text while scrolling.

---

## 6. The table object

The one memorable thing: the table is a product shot (`components/table/Stage.css`,
`lib/tableLayout.ts`).

**The camera.** A plane 1000·s px wide and 1000·s·aspect tall, under `rotateX(tilt)` inside a
`perspective` of persp·s px. Everything scales linearly with one number, `s` (capped at 1.05; it
is 0.89 at 1440 × 900, where a board card is 98 px wide). The perspective is strong enough that the
far rim visibly recedes (at 1440 × 900 a far-rim card is drawn at about 80% of a near-rim one's
scale), so the slab reads as an object in depth, not an ellipse.

| | Tilt | Aspect | Perspective | Thickness | Board card |
|---|---|---|---|---|---|
| desk and tablet | 50° | 0.56 | 1800 | 34 | 0.11 of the plan width |
| phone | 38° | 0.9 | 2000 | 36 | 0.168 (the board sits at v 0.465) |

`project(u, v, z)` is the same camera written as arithmetic: CSS `rotateX`, then perspective,
centred on the scene origin. That is what lets upright 2D things (seat type, the pot, bet labels,
your hand) sit at projected points, so type is never scaled, skewed or blurred by the 3D. The tests
check it against the closed form and check that it scales linearly with `s`.

**The slab.** The superellipse lies flat on the plane. Where a browser has no `corner-shape`
(Safari, Firefox) it is a rounded rectangle instead, `border-radius: 37% / 50%`
(`ROUNDED_RX`): it follows the superellipse within a few px wherever a card lies, so one seat
geometry serves both (a plain ellipse's corners are far rounder and pushed the corner seats' cards
over the rim). The layout knows which one the browser draws (`slabOutline`), and the wall, the
seat labels and the glint follow it; tests keep the cards inside both. Its top is obsidian: a near-black gradient
(`#17181e` → `#040506`) that falls off from a softbox sheen along the far third to a deep middle,
the atmosphere's blue reflected on the near half, and darker toward the ends where the surface
turns away; a crisp specular on the far rim, a faint hairline and soft bevel inside the whole rim,
and a soft line on the near rim (at 0.38, a specular, not a second bright edge: the light is
below, so the wall's lower bevel carries it). **The side wall** is a solid you can see all the way round: an
inline SVG under the 3D object (`SlabSide`), the band between the top's near rim and the bottom
edge projected by the same camera (`slabSide`, so it meets the CSS 3D top exactly, on either
outline), drawn as 36 bands, each under a pixel at the middle of the near rim and stroked in its
own fill so no seam shows where they meet. It is lit as `lib/slabLight.ts` says, from the planet
below and in front: down its height a soft highlight where the rounded top edge turns down, a
deeper belly, then a lower bevel that faces the light; across it brightest under the light source
and darker toward the ends; and a faint lower edge line all the way round, so the silhouette reads
against the void at the ends. The bottom face, at `translateZ(−thickness·s)`, keeps only the soft
blue glow under the near wall. One glint marks where the light source grazes the near rim
(`glintAt`). On your turn a pool of the same blue gathers on the near rim in front of you.

**On the felt.** Cards land on bare obsidian: there are no slots or placeholders. Every card on the
felt lies square to the table, like the board, with a tight contact shadow, a soft one under it,
and a near edge that catches the limb's light (`--limb-light`, one colour for every edge the planet
lights: the card rims, the bevels, the wall's lower edge). The board centres on the cards dealt so far, and on
the turn the flop slides over to make room. **A live opponent's two backs** follow one rule at every
seat: a pair square to the table, the second a fixed 34% of a card over (`BACKS_OFFSET`), so a
sliver of the first shows, the front card casting a shadow onto it and the under card a step
darker, so the pair reads as two cards, not one tile; about 42% of a board card's width (44% on a
phone); and laid the same distance inside the rim at every seat (a test keeps the on-screen gaps
within 1.45× of each other at every size, on both outlines). Folded seats lose their pair (it
slides to the muck). A chip is three discs stacked in z, so its edge shows at the tilt and its
near edge catches the blue. A bet sits on the vector from the seat toward the pot, as close to the
seat as it can while clearing the full five-card board, the pot block and the rim (`betSpot`,
`placeBets`), so it never moves when a card lands. Its air from the backs is kept on screen, as the
camera draws it, because the far rim squashes table units: the chip's whole stack keeps 6 px from
every seat's backs and its footprint 8 px, its label 4 px. Where the board leaves no room straight
in front of a top seat (the smaller desktops, a phone), the bet steps beside its backs instead; the
two side seats of a desktop mirror each other (`twinOf`). On a small table (s under about 0.5: a
portrait tablet, a laptop with a panel open) the fixed-px label and air can outgrow the felt, so a
bet gives up the least of its air from the backs it must (`AIR_STEPS`, down to touching), and its
label may read on the other side; two bets never come within 4 px, at any supported size (a
600 px wide tablet is below that range: its pot block alone runs past the near rim). The
street label has one fixed place, above the pot.

**Seats** are floating type, not panels: the name and stack on one line, the position and the
street's action on the next ("BB 3-bet 24, bets 34"). In HUD mode the read gets its own line.
The three top labels are measured and pushed at least 20 px apart, and capped with an ellipsis
rather than leave the viewport. On a phone the two seats next to you flank your hand.

**Your hand** stands below the rim, outside the 3D, at full size. On your turn it lifts 16 px
(10 on a phone) into a pool of blue and its edges catch the light. A hand you folded stays white:
it steps back (scale 0.9, 12 px down) under a deeper shadow, and the label reads "Folded".

**The dock** is the one glass. Its face morphs between status (the latest action in words,
"Maniac bets 26", or "Dealing"), actions, sizing (presets, a slider and the exact amount), the
hand's result, and a scoped error. Fold, Call and Raise are three equal capsules: the coach's
recommendation is stated in its verdict, and no button is painted to agree with it.

**The coach** sits bare on the void beside your hand, top-aligned with the lifted cards and 48 px
clear of them. When there is not room for it, and always on a phone, it becomes one row just
above the dock.

---

## 7. Cards and decks

- Drawn as **inline SVG**, never sprites or CSS boxes: `components/Card.tsx` renders,
  `lib/decks.tsx` defines. Every deck draws on the same `100 × 140` viewBox, so decks swap at any
  size. There are no card image assets and no per-card requests.
- **Faces** are white with a soft top-to-bottom fall-off (`#ffffff` → `#ebebf0`); suits are paths,
  not font glyphs; the rank is set in the app's own family at 650. Shadows belong to the context
  (felt or hand), not the card.
- **Five decks**, a preference kept in localStorage: **Standard** (default; rank and small suit
  top-left, a large pip bottom-right), **Four-color** (spades `#1d1d1f`, hearts `#d70015`,
  diamonds `#0057c8`, clubs `#167a33`), **Large index** (an oversized rank and suit, meant for
  small cards), **Minimal** (corner index only, flat face) and **Classic** (indices in opposite
  corners and a centre pip). Suit colours clear 4.5:1 on the white face; the tightest is red at 4.53:1 against
  the bottom of the fall-off. The pre-Stage deck ids migrate (`lib/deckIds.ts`), so nobody loses a
  four-colour choice.
- **One back** for every deck, quiet so a table of them never outshouts the board: deep navy
  graphite (`#223558` → `#17233a`) lifted softly from the bottom edge by the limb's light (a
  smooth glow: at 20–40 px any engraved pattern or mark rendered as ribbing or a smudge), a thin
  frame, and a thin light rim drawn as a 1.15 px screen hairline at any size
  (`non-scaling-stroke`), lit only along the near (bottom) edge, where the planet's light catches
  it as it catches a chip's (0.16 at the far edge, 0.9 at the near). The rim is what reads against the obsidian (about 4–7:1 at 1440 × 900,
  measured on screenshots); the body sits only just above the felt (about 1.2–1.5:1), and a
  folded seat also says "Folded" in words.
- **At a showdown** the backs turn face up where they lay, square to the table, the second leaving
  the first's index column showing: the share is the deck's (`reveal`: 44% for Standard,
  Four-color and Minimal, 59% for Large index, 35% for Classic), so the cut misses the pips and
  the front card's shadow takes the last unit. The pairs sit as far inside the rim as the backs and
  clear of the board.

---

## 8. The coach ring and the maths sheet

**The ring** (`ui/Ring.tsx`, geometry in `lib/ring.ts`), on a 120 × 120 viewBox:

- the **outer ring** (r 50, stroke 14) is your **realized** equity, filled with the tone's gradient on
  a faint track in the same tone. Once the action is closed it shows raw equity and is labelled
  "Equity";
- the **inner ring** (r 35, stroke 7) is the **price**, the required equity, in `--fog` on a white
  10% track. It measures 6.8:1 against that track;
- the **notch** is one ink line (2.6) with a black halo (6) across both rings at the price. Over
  the notch or short of it is the whole read;
- **raw equity**, when it differs from realized by a point or more, is a small ink dot just outside
  the outer track, so it can never merge with the notch;
- with **nothing to call** there is no ring at all: the verdict and one figure.

Sizes: 112 px beside the hand, 52 px in the phone row, 40 px in the maths sheet's head. Under
72 px the strokes thicken (17 and 9, a 4.4 notch) so over/under still reads.

**The glance** beside it: the verdict in the tone's colour, then three figures, each a value with a
small label under it at matching precision — Realized, Need, Call EV ("Call EV" drops when the side
is tight). If the EV's sign disagrees with the tone, it renders neutral and says "before implied"
rather than contradicting the verdict. Everything else is behind "Show the maths". While the
coach works, a faint ring appears after 300 ms, so a fast answer never flashes it.

**The maths sheet** (`components/coach/MathsSheet.tsx`) reads as an explanation, top to bottom:
two bars on one 0–100 scale (Realized against Need, with an ink tick at raw); the backend's
rationale, verbatim; **Their range**, one line per modelled villain (the line they took, the top %
and combos, and the air share with what it means); **Show working**, the derivation, every row
tagged **Exact**, **Computed** or **Estimate** (Need is an Estimate whenever the implied-odds
adjustment moved the price), with its open state remembered; **How this is worked out**, the
backend's basis; and "Computed, not solved." with a link to check in GTO Wizard. On a desktop it is a
side panel 27% of the viewport wide (340–400 px), and the table glides left and re-centres to make
room. On a phone or tablet it is a non-modal bottom sheet whose medium detent ends above the dock,
so you can read and act without closing it. The body scrolls and fades at the bottom; nothing
clips.

---

## 9. Motion

**Springs.** Damped oscillators sampled into CSS `linear()` (`--ease-*` in `@theme`; the same
strings are `EASE` in `lib/motion.ts`, and a test keeps them equal):

| Token | ζ | Overshoot | Used for |
|---|---|---|---|
| `--ease-spring` | 1.00 | none (critically damped) | everything that moves |
| `--ease-bouncy` | 0.70 | 4.6% | only your hand lifting on your turn |
| `--ease-grow` | 0.68 | 5.4% of the change (about 3% of the final width) | only the dock growing into its buttons |

Durations: `--dur-quick` 200 ms, `--dur-base` 460 ms (the default for `play()`).

**What moves, and why.** Motion only ever describes something that happened at the table. The
backend sends one snapshot per bot action, 650 ms apart, and the motion of each fits inside that.

| Event | What moves |
|---|---|
| first load | the limb's light comes up over 1.1 s, the light source 250 ms later; the slab rises 28 px from scale 0.955 over 1.1 s while it fades in; seats and the dock follow |
| a view opens | the near star layer does one slow push-in (2.6 s on the table, 2 s on a page) |
| the deal | backs come off a deck at the centre, two rounds from the small blind 28 ms apart, each in 380 ms with a lift and a spin; your two cards rise out of the felt into your hand over 520 ms, turning face up and coming into focus; the blinds slide out as the last card lands, then the pot appears, so a card in flight never sits on a label |
| a bet | the chip slides out from in front of the player (360 ms); its label follows |
| a fold | the backs slide toward the muck and fade (300 ms) |
| a street | last street's chips glide into the pot; the dealt cards slide over (460 ms) and the new ones come off the deck and turn |
| a showdown | the shown cards turn face up where they lay |
| hand over | the pot goes to whoever won it |
| your turn | the dock grows from its status pill into three capsules (560 ms, `grow`); your hand lifts on `bouncy` (760 ms); the price arc draws, then the notch, then your equity sweeps past them |
| a desktop panel | the table glides aside and re-centres (560 ms) |
| a sheet | opens on the spring in 520 ms (desk: slides 16 px in from scale 0.96, blur 8 px → 0; phone: rises 48 px) and closes in 200 ms |
| the menu | opens in 320 ms (scale 0.96, blur 6 px → 0) and closes at once |

**The rules.**

- **State first.** The screen already shows the new state when an animation starts. Every
  animation runs from the previous look to what is on screen (`fill: backwards`), and anything
  being removed (chips gliding into the pot, folded backs) is a throwaway ghost. An interrupted or
  skipped animation can never hide a bet, a card or a seat.
- **Movement is transform and opacity only**, plus `stroke-dasharray` on the ring, `clip-path` on
  the dock's glass, and width/height on the dock's light-only rim. Hover and press states change
  colour over 200 ms (a capsule also presses to 97%); that is feedback, not movement.
- **Blur appears in three places, all brief and all ending at zero**: your card coming into focus as
  it is dealt (6 px → 0), a desktop sheet opening (8 px → 0), and the menu opening (6 px → 0).
  Nothing is blurred at rest except the dock's glass.
- **The only loops are waiting indicators**, each shown only while something is in flight: a bot's
  thinking dot (1.1 s, during its 650 ms), the coach's loading ring (1.2 s), the dock's spinner
  during a request (0.9 s), and the sweep while the leak review runs (1.6 s). Nothing decorative
  loops, pulses or glows.
- **A view coming back into sight replays nothing**, and a skip to the result after you fold is
  instant.

**Reduced motion.** `prefers-reduced-motion: reduce` sets every CSS animation and transition to
0 ms in `index.css`, and `play()` does not animate at all. Because the element already holds its
final state, skipping the animation is the instant version: the ring is drawn, the hand is lifted,
the cards are dealt. The star push-in and the waiting loops stop. No information is carried by
movement alone.

---

## 10. Accessibility and quality floor

- **Contrast** as in §1: every text token clears AA (4.5:1) on the surface it is used on, and the
  non-text marks clear 3:1. The ring's notch is ink with a black halo (19:1 on the void); the price
  arc is 6.8:1 against its track; the trend bars are 3.9:1 and the stats band hairlines 4.2:1; a
  selected segment's rim is at least 5:1 against its track on the sheet.
- **Never colour alone.** Out of band carries the signed distance in text; in band carries a dot
  state and "In range"; an in-band trend bar gets an ink cap; a flagged decision is named in words
  ("Called without odds."); the selected segment is also heavier; the chosen deck gets a check and a
  heavier name, and lifts.
- **Focus**: one ring everywhere, `:focus-visible` with a 2 px `--signal` outline at 2 px offset, set
  globally. Nothing removes it. Opening a sheet moves focus to Done and closing returns it; Escape
  closes only the top-most layer.
- **Keyboard** at the table: F fold, C check or call, R bet or raise, 1–5 the size presets, Enter
  confirms, Escape backs out of sizing, Space deals the next hand, L toggles the hand log. Never
  while typing in a field.
- **Screen readers**: every card is named in words ("Ace of hearts"), on its own or in its seat's
  label ("Your cards: Jack of clubs, 3 of spades, high card"); each seat is a group
  with its full state ("TAG, BB, 198 chips, bet 2, in the hand"); the board is read out as a
  sentence; the coach's verdict and figures are announced once, in a polite live region, when the
  answer arrives; the table has a visually hidden heading.
- **Touch**: nothing is hover-only. Stat definitions, band numbers and caveats open from
  disclosures and info buttons that work on tap.
- **Layout** has two breakpoints, defined once (`--bp-sm` / `--bp-lg`, and `lib/breakpoints.ts` for
  JS; a test keeps them equal): phone under 600 px (bottom sheets, the coach as a row), tablet
  600–1099 (bottom sheets, the coach beside the hand when there is room), desk from 1100 (the
  centred nav, side panels). The phone respects the safe area (`--sab`).
- **The header** is the mark and the wordmark "Poker" on the left, the centred capsule nav (Table /
  My stats / History), and on the right the hand log, New game and the `…` menu
  (`frontend/public/brand/urvancev-logo-white.svg`, favicon `frontend/public/favicon.svg`/`.ico`).

---

## 11. Do / Don't

**Do:** a true black void; one object, lit from below; type floating on the void rather than in
boxes; one glass per screen and opaque sheets for everything else; capsules that are true capsules;
tabular figures for every number; colour only for the coach's tone and a hand's result; motion that
describes a real event and settles.

**Don't:** a felt-green table or a casino floor; panels around seats; a second glass surface; blur at
rest; neon glows or pulsing; multi-colour archetype badges; painting the coach's pick onto a
button; parsing the verdict for a colour; anything that loops when nothing is happening; a number
in a proportional font that the reader might compare down a column.

> The single rule: the table is the product shot, and the read sits next to your hand. Everything
> else stays quiet.

---

## 12. Known limitations

- **`corner-shape` is Chromium-only.** Other engines get a plain ellipse for the slab and ordinary
  radii for the squircles.
- **SF Pro and Inter are not identical.** Apple devices render SF Pro; the screenshots in the README
  are Inter on Linux.
- **Board indices are foreshortened** by cos 50° because the cards lie on the tilted felt. At
  1280 × 720 (height-limited) a board card is 64 px wide: it reads, but that is the limit.
- **The phone table is small at 390 × 664**: the slab is about 288 px across on screen and a board
  card 43 px wide. Its 38° tilt is gentler than the desktop's 50°.
- **Showdown reveals are small**, because they must clear the far rim and the board: 61 px wide at
  1440 × 900, 39 px at 1280 × 720, 32–40 px on a phone, on either outline.
- **Opponents' backs are small on a phone**: 24 px wide at 390 × 844 and 19 px at 390 × 664, so
  the phone's top row has room for three seats' bets between the backs and the board with the
  air above (the phone's board also sits a little lower, at v 0.465). On the smaller desktops
  (1280 × 720, 1024 × 768) the two top corner seats' bets sit beside their backs rather than in
  front of them: the board leaves no room for a row of bets there with 6 px of air.
- **The dock's rim still resizes.** The glass does not, but its 1 px light rim animates width and
  height during a morph.
- **The backend's rationale is shown verbatim**, so it reads like a log line in places
  ("~23% raw → ~22% realized … (price adjusted — draw — paid off when you complete)"). The fix
  belongs in the backend's wording, not in the frontend rewriting it.
- **Performance was measured only in headless Chromium on SwiftShader** (a software GPU), on the
  prototype: a median frame of 16.7 ms through the opening sequence at 1440 × 900, with long frames
  traced to the full-viewport star layers. It has not been tried on a physical mid-range Android.
