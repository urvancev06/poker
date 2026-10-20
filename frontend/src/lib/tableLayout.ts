// The table's camera and layout: a pure projection of table space onto the viewport.
//
// Table space: u, v in 0..1 over a plan 1000 px wide (and 1000 * aspect tall) at scale 1.
// The slab is drawn by CSS 3D (a plane under rotateX(tilt) inside a perspective of
// persp * s px, centred on the scene origin). project() is that same camera as arithmetic,
// so upright 2D things (type, the hero's hand, bet labels) can sit at projected points and
// never scale or blur. Everything scales linearly with one number, s.
//
// Ported from the approved Stage prototype (round2/stage/table.js, section 2), plus:
//   - bets sit on the seat-to-pot vector, clear of the full board, the backs and the pot
//     block (betAnchors);
//   - the street label has one fixed place (just above the pot block), in every state;
//   - the top-centre seat's showdown reveal sits higher, so it never meets the board;
//   - every seat lays its two backs the same distance inside the rim (backsBox);
//   - the slab's side wall in viewport px, for the SVG under the 3D object (slabSide).

import type { LayoutKind } from './breakpoints'

export type GeoKind = 'desk' | 'phone'
export type SeatSide = 'top' | 'left' | 'right' | 'top-left' | 'top-right' | 'corner-left' | 'corner-right'
export type BetSide = 'left' | 'right'
export type UV = readonly [number, number]

export interface SeatGeo {
  side: SeatSide
  /** Where a top seat's label meets the rim (u). */
  u?: number
  /** Where the seat's two backs lie on the felt. */
  cards: UV
  /** Where its cards turn face up at a showdown. */
  rev: UV
  /** Which side of the chip its bet label reads on. */
  betSide: BetSide
  /** The prototype's hand-placed bet anchor: the fallback if the vector has no room. */
  bet: UV
}

export interface Geo {
  tilt: number
  aspect: number
  persp: number
  thick: number
  /** Board card width as a share of the plan width; gap between board cards. */
  card: number
  gap: number
  board: UV
  /** Where the pot's chips gather (bets glide here when a street is collected). */
  pot: UV
  /** Villain back, chip and showdown reveal widths (share of the plan width). */
  back: number
  chip: number
  rev: number
  heroBet: UV
  seats: Readonly<Record<VillainSlot, SeatGeo>>
}

/** Places 1..5 run clockwise from the hero, which is also action order (inventory 6.1). */
export type VillainSlot = 1 | 2 | 3 | 4 | 5
export const VILLAIN_SLOTS: readonly VillainSlot[] = [1, 2, 3, 4, 5]

export const GEO: Readonly<Record<GeoKind, Geo>> = {
  desk: {
    tilt: 50,
    aspect: 0.56,
    persp: 1800,
    thick: 34,
    card: 0.114,
    gap: 0.011,
    board: [0.5, 0.43],
    pot: [0.5, 0.72],
    back: 0.05,
    chip: 0.026,
    rev: 0.068,
    heroBet: [0.5, 0.9],
    seats: {
      1: { side: 'left', cards: [0.054, 0.5], rev: [0.08, 0.5], betSide: 'right', bet: [0.235, 0.66] },
      2: { side: 'top', u: 0.25, cards: [0.25, 0.15], rev: [0.25, 0.16], betSide: 'right', bet: [0.34, 0.24] },
      3: { side: 'top', u: 0.5, cards: [0.5, 0.112], rev: [0.5, 0.115], betSide: 'right', bet: [0.6, 0.2] },
      4: { side: 'top', u: 0.75, cards: [0.75, 0.15], rev: [0.75, 0.16], betSide: 'left', bet: [0.66, 0.24] },
      5: { side: 'right', cards: [0.946, 0.5], rev: [0.92, 0.5], betSide: 'left', bet: [0.765, 0.66] },
    },
  },
  phone: {
    tilt: 38,
    aspect: 0.9,
    persp: 2000,
    thick: 36,
    card: 0.168,
    gap: 0.016,
    board: [0.5, 0.45],
    pot: [0.5, 0.72],
    back: 0.08,
    chip: 0.05,
    rev: 0.125,
    heroBet: [0.5, 0.905],
    seats: {
      1: { side: 'corner-left', cards: [0.2, 0.8], rev: [0.22, 0.75], betSide: 'right', bet: [0.12, 0.64] },
      2: { side: 'top', u: 0.16, cards: [0.26, 0.16], rev: [0.29, 0.155], betSide: 'right', bet: [0.31, 0.25] },
      3: { side: 'top', u: 0.5, cards: [0.5, 0.105], rev: [0.5, 0.11], betSide: 'right', bet: [0.62, 0.2] },
      // the top three sit close on a phone: every top label reads to the right of its chip
      4: { side: 'top', u: 0.84, cards: [0.74, 0.16], rev: [0.71, 0.155], betSide: 'right', bet: [0.69, 0.25] },
      5: { side: 'corner-right', cards: [0.8, 0.8], rev: [0.78, 0.75], betSide: 'left', bet: [0.88, 0.64] },
    },
  },
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/* ---------- the camera ---------- */

/** The slab's corner: superellipse(1.35), |x|^n + |y|^n = 1. */
const N_SUPER = Math.pow(2, 1.35)

/** The far rim's v at u (the near rim is 1 - rimV(u)). */
export function rimV(u: number): number {
  return 0.5 - 0.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), N_SUPER)), 1 / N_SUPER)
}

/**
 * Table space (u, v, and z in px of the plane above it) to viewport px, for a plane at
 * scale s whose centre (the scene origin) is at (ox, oy). Pure arithmetic: CSS rotateX
 * then CSS perspective, centred on the origin.
 */
export function projectWith(g: Geo, s: number, ox: number, oy: number, u: number, v: number, z = 0.6): [number, number] {
  const pw = 1000 * s
  const ph = pw * g.aspect
  const x = (u - 0.5) * pw
  const y = (v - 0.5) * ph
  const t = (g.tilt * Math.PI) / 180
  const ct = Math.cos(t)
  const st = Math.sin(t)
  const y1 = y * ct - z * st
  const z1 = y * st + z * ct
  const f = (g.persp * s) / (g.persp * s - z1)
  return [ox + x * f, oy + y1 * f]
}

export interface UnitBounds {
  /** Projected width of the object (top face and wall) at s = 1. */
  w: number
  /** Top (far rim) and bottom (near wall) relative to the origin at s = 1. */
  top: number
  bottom: number
  h: number
}

const boundsCache = new Map<Geo, UnitBounds>()

/** The projected object's extent at s = 1, from points on the superellipse itself. */
export function unitBounds(g: Geo): UnitBounds {
  const hit = boundsCache.get(g)
  if (hit) return hit
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const z of [0, -g.thick]) {
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * Math.PI * 2
      const cx = Math.cos(t)
      const sy = Math.sin(t)
      const r = Math.pow(Math.pow(Math.abs(cx), N_SUPER) + Math.pow(Math.abs(sy), N_SUPER), -1 / N_SUPER)
      const [x, y] = projectWith(g, 1, 0, 0, 0.5 + 0.5 * cx * r, 0.5 + 0.5 * sy * r, z)
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }
  const b = { w: x1 - x0, top: y0, bottom: y1, h: y1 - y0 }
  boundsCache.set(g, b)
  return b
}

/* ---------- things on the felt (table space) ---------- */

/** The u of board card i when n cards are down: the board centres on what is dealt. */
export function boardU(g: Geo, i: number, n: number): number {
  const total = n * g.card + (n - 1) * g.gap
  return g.board[0] - total / 2 + g.card / 2 + i * (g.card + g.gap)
}

export interface BoxUV {
  u0: number
  u1: number
  v0: number
  v1: number
}

/** The full five-card board's box in table space (bets keep clear of it on every street). */
export function boardBox(g: Geo): BoxUV {
  const half = (5 * g.card + 4 * g.gap) / 2
  const hv = (g.card * 1.4) / g.aspect / 2
  return { u0: g.board[0] - half, u1: g.board[0] + half, v0: g.board[1] - hv, v1: g.board[1] + hv }
}

function overlaps(a: BoxUV, b: BoxUV): boolean {
  return a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1
}

function grow(b: BoxUV, du: number, dv: number): BoxUV {
  return { u0: b.u0 - du, u1: b.u1 + du, v0: b.v0 - dv, v1: b.v1 + dv }
}

export interface PotBlock {
  /** Its centre line (the axis). */
  x: number
  /** Centres (viewport y) of the street label, the pot figure and the "in bets" line. The
   * street label has one fixed place in every state, hand over included. */
  streetY: number
  potY: number
  betsY: number
  /** The whole block in table space (bets keep clear of it). */
  box: BoxUV
}

/** The v under a viewport y on the table's centre line (inverse of project at u = 0.5). */
export function vAtY(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy'>, y: number): number {
  let lo = -0.5
  let hi = 1.5
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (project(L, 0.5, mid, 0)[1] < y) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The pot block, laid out in upright px under the full board: the street label, then the
 * pot figure, then "26 in bets". Type does not scale with the table, so it is placed in
 * viewport px from the board's lower edge, not in table units.
 */
export function potBlock(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy' | 'kind'>): PotBlock {
  const phone = L.kind === 'phone'
  const bottom = project(L, 0.5, boardBox(L.g).v1, 0)[1]
  const streetY = bottom + (phone ? 14 : 20)
  const potY = streetY + (phone ? 23 : 28)
  const betsY = potY + (phone ? 21 : 24)
  // "Pot 1,168" and "1,168 in bets" are about 100 px wide (88 at the phone's sizes)
  const halfU = (phone ? 46 : 54) / (1000 * L.s)
  return { x: L.ox, streetY, potY, betsY, box: { u0: 0.5 - halfU, u1: 0.5 + halfU, v0: vAtY(L, streetY - 9), v1: vAtY(L, betsY + 9) } }
}

/** How far the second back sits over from the first (a share of the card width; the CSS
 * spaces the pair by the same amount). */
export const BACKS_OFFSET = 0.34

/** The two backs lying at a seat (square to the table, the second BACKS_OFFSET over). */
export function backsBox(g: Geo, at: UV): BoxUV {
  const hu = (g.back * (1 + BACKS_OFFSET)) / 2 + 0.004
  const hv = (g.back * 1.4) / g.aspect / 2 + 0.006
  return { u0: at[0] - hu, u1: at[0] + hu, v0: at[1] - hv, v1: at[1] + hv }
}

/** The chip plus its upright label beside it, at a point, in table space. */
export function betBox(g: Geo, at: UV, side: BetSide, labelU: number): BoxUV {
  const ru = g.chip / 2
  const rv = g.chip / 2 / g.aspect
  const chip = { u0: at[0] - ru, u1: at[0] + ru, v0: at[1] - rv, v1: at[1] + rv }
  return side === 'right' ? { ...chip, u1: chip.u1 + labelU } : { ...chip, u0: chip.u0 - labelU }
}

/** The widest bet label ("1,168"), 15 px type on a desktop, 14 on a phone. */
export const BET_LABEL_PX: Readonly<Record<GeoKind, number>> = { desk: 42, phone: 36 }

/** Clearance kept between a bet and the board (table units across; v scales by aspect). */
export const BET_CLEAR_U = 0.02

/** Whether a bet (chip + label) at `at` clears the board, the backs, the pot block and the rim. */
export function betClear(g: Geo, slot: VillainSlot, at: UV, pot: BoxUV, labelU: number): boolean {
  const sg = g.seats[slot]
  const clearV = BET_CLEAR_U / g.aspect
  const box = betBox(g, at, sg.betSide, labelU)
  if (overlaps(box, grow(boardBox(g), BET_CLEAR_U, clearV))) return false
  if (overlaps(box, grow(pot, BET_CLEAR_U * 0.5, clearV * 0.5))) return false
  if (overlaps(box, grow(backsBox(g, sg.cards), BET_CLEAR_U * 0.5, clearV * 0.5))) return false
  // inside the slab, with a margin from either rim
  if (box.u0 < 0.03 || box.u1 > 0.97) return false
  if (box.v0 < Math.max(rimV(box.u0), rimV(box.u1)) + 0.02) return false
  if (box.v1 > 1 - Math.max(rimV(box.u0), rimV(box.u1)) - 0.03) return false
  return true
}

/**
 * A seat's bet: on the vector from where its cards lie toward the pot, as close to the
 * seat as the clearances allow (the backs, the full five-card board, the pot block, the
 * rim). Where the board leaves no room on the vector itself (the side seats: the board
 * spans the felt), it steps off it by the least it must. The full board is used on every
 * street, so a bet never moves when a card lands. Falls back to the hand-placed anchor.
 */
export function betAnchor(g: Geo, slot: VillainSlot, s: number, pot: BoxUV, labelPx = 44): UV {
  const sg = g.seats[slot]
  const labelU = labelPx / (1000 * s)
  const ph = g.aspect // plane px per table unit, relative to u
  const a = sg.cards
  const p: UV = [g.pot[0], g.pot[1] - 0.03]
  // work in isotropic plane units, so "perpendicular" means perpendicular on the felt
  const dx = p[0] - a[0]
  const dy = (p[1] - a[1]) * ph
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  let best: UV | null = null
  let bestCost = Infinity
  // in front of the seat (at least clear of its backs along the line), then the least
  // total of distance from the seat and distance off the line
  for (let i = 0; i <= 80; i++) {
    const t = Math.max(0.05, (i / 100) * len)
    for (let j = -16; j <= 16; j++) {
      const d = j * 0.005
      const cost = t + 2 * Math.abs(d)
      if (cost >= bestCost) continue
      const x = a[0] + ux * t - uy * d
      const y = a[1] + (uy * t + ux * d) / ph
      const at: UV = [x, y]
      if (!betClear(g, slot, at, pot, labelU)) continue
      best = [round4(x), round4(y)]
      bestCost = cost
    }
  }
  return best ?? sg.bet
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4

/* ---------- the layout ---------- */

export interface LayoutInput {
  /** Viewport size. */
  w: number
  h: number
  kind: LayoutKind
  /** A desktop side panel (the maths or the log) is open on the right. */
  panelOpen: boolean
  /** The limb's height above the viewport bottom (lib/space limbHeight). */
  limb: number
  /** env(safe-area-inset-bottom), when known. */
  safeBottom?: number
  /** Tallest top-seat label (px); depends on the visibility mode (HUD adds a line). */
  topSeatH: number
  /** Widest side-seat label (px). */
  sideSeatW: number
}

export interface TableLayout {
  kind: LayoutKind
  gk: GeoKind
  g: Geo
  W: number
  H: number
  /** Width left for the table (minus a desktop side panel). */
  Weff: number
  panelW: number
  s: number
  /** The shared vertical axis: table, hand and dock centre on it. */
  axis: number
  /** The scene origin (the plane's centre) in viewport px. */
  ox: number
  oy: number
  tableW: number
  tableH: number
  objTop: number
  objBottom: number
  /** Hero card width. */
  hw: number
  /** How far the hand lifts on your turn. */
  lift: number
  barH: number
  /** Viewport y of the dock's bottom edge, and the rest height of the dock. */
  dockBottom: number
  dockH: number
  /** Where the coach goes: beside the hand, or a row above the dock. */
  coachAt: 'side' | 'row'
  /** Beside the hand but narrow: the coach drops its third figure. */
  tight: boolean
  /** Top of the hero block (unlifted cards). */
  heroTop: number
  /** The coach's box (viewport px). For 'row' it is centred on the axis above the dock. */
  coach: { left: number; top: number; width: number; height: number }
  /** The street label, the pot and its "in bets" line. */
  pot: PotBlock
  /** Each villain's bet anchor and the hero's, in table space (betAnchor). */
  bets: Readonly<Record<VillainSlot, UV>>
  heroBet: UV
}

const PANEL_W = 360

/** The coach's ring size beside the hand (the coach builder draws 112 px). */
export const COACH_RING_SIDE = 112

export function computeLayout(input: LayoutInput): TableLayout {
  const { w: W, h: H, kind, panelOpen, limb, safeBottom = 0, topSeatH, sideSeatW } = input
  const phone = kind === 'phone'
  const gk: GeoKind = phone ? 'phone' : 'desk'
  const g = GEO[gk]
  const unit = unitBounds(g)
  const lift = phone ? 10 : 16
  const barH = phone ? 56 : 64
  // the dock floats fully above the limb with clear air; on a phone the limb sinks below it
  const dockGap = phone ? Math.max(12, safeBottom) : 18
  const dockBottom = H - limb - dockGap
  const dockH = phone ? 66 : 64
  const panelW = kind === 'desk' && panelOpen ? PANEL_W : 0
  const Weff = W - (panelW ? panelW + 16 : 0)
  const regionTop = barH + (phone ? 6 : 14)
  const sideL = phone ? 0 : Math.max(W >= 1700 ? 140 : 116, sideSeatW + 22)
  const margin = phone ? 0 : W >= 1700 ? 64 : 32
  const topSeats = topSeatH + (phone ? 6 : 12)
  const topAir = phone ? 10 : 14
  const heroAir = (phone ? 14 : 24) + lift
  const heroLabelH = phone ? 8 + 22 + 4 + 18 : 12 + 26 + 6 + 20

  const fit = (rowH: number) => {
    const regionBottom = dockBottom - dockH - (phone ? 12 : 18) - rowH
    const avail = regionBottom - regionTop
    let s = phone ? (W - 64) / unit.w : Math.min((Weff - 2 * margin - 2 * sideL) / unit.w, (Weff * 0.66) / unit.w)
    s = Math.min(s, 1.05)
    let hw = 0
    for (let i = 0; i < 8; i++) {
      const boardPx = g.card * 1000 * s
      hw = phone ? clamp(boardPx * 1.25, 54, Math.min(66, (W - 260) / 2.1)) : clamp(boardPx * 1.04, 76, 116)
      const need = topSeats + topAir + unit.h * s + heroAir + hw * 1.4 + heroLabelH
      if (need <= avail) break
      s *= Math.max(0.8, (avail - (need - unit.h * s)) / (unit.h * s))
    }
    return { s: Math.max(0.12, s), hw, avail }
  }

  // the coach sits beside your hand when there is room, else in a row above the dock
  let f = fit(0)
  let coachAt: 'side' | 'row' = 'side'
  let tight = false
  const axis = phone ? W / 2 : Weff / 2
  const coachW = (t: boolean) => COACH_RING_SIDE + 24 + (t ? 170 : 236)
  const roomRight = Weff - 16 - (axis + f.hw * 1.05 + 48)
  if (phone) coachAt = 'row'
  else if (roomRight < coachW(false)) {
    tight = true
    if (roomRight < coachW(true)) coachAt = 'row'
  }
  if (coachAt === 'row') f = fit(74)
  const { s, hw, avail } = f
  const tableW = unit.w * s
  const tableH = unit.h * s
  const stackH = topSeats + topAir + tableH + heroAir + hw * 1.4 + heroLabelH
  // the leftover air is shared out, so no band of void opens on either side (a desktop
  // sits a little high)
  const stackTop = regionTop + Math.max(0, (avail - stackH) * (phone ? 0.5 : 0.46))
  const objTop = stackTop + topSeats + topAir
  const ox = axis
  const oy = objTop - unit.top * s
  const objBottom = objTop + tableH
  const heroTop = objBottom + heroAir

  let coach: TableLayout['coach']
  if (coachAt === 'side') {
    // beside your hand: top-aligned with the lifted cards, 48 px clear of them
    coach = { left: axis + hw * 1.05 + 48, top: heroTop - lift, width: coachW(tight), height: COACH_RING_SIDE }
  } else {
    const width = Math.min(W - 16, 360)
    coach = { left: axis - width / 2, top: dockBottom - dockH - 10 - 64, width, height: 64 }
  }

  const pot = potBlock({ g, s, ox, oy, kind })
  const label = BET_LABEL_PX[gk]
  const bets = {
    1: betAnchor(g, 1, s, pot.box, label),
    2: betAnchor(g, 2, s, pot.box, label),
    3: betAnchor(g, 3, s, pot.box, label),
    4: betAnchor(g, 4, s, pot.box, label),
    5: betAnchor(g, 5, s, pot.box, label),
  }
  const heroBet = heroBetAnchor(g, pot.box)
  return { kind, gk, g, W, H, Weff, panelW, s, axis, ox, oy, tableW, tableH, objTop, objBottom, hw, lift, barH, dockBottom, dockH, coachAt, tight, heroTop, coach, pot, bets, heroBet }
}

/** The hero's bet: straight up from your hand toward the pot, just below the pot block,
 * inside the near rim. */
export function heroBetAnchor(g: Geo, pot: BoxUV): UV {
  const rv = g.chip / 2 / g.aspect
  const clearV = BET_CLEAR_U / g.aspect
  const below = pot.v1 + clearV * 0.25 + rv
  const nearRim = 1 - 0.02 - rv
  return [g.heroBet[0], round4(Math.min(nearRim, Math.max(g.heroBet[1], below)))]
}

/** Project with a layout's camera. */
export function project(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy'>, u: number, v: number, z?: number): [number, number] {
  return projectWith(L.g, L.s, L.ox, L.oy, u, v, z)
}

/* ---------- the seats: anchored to the rim, then pushed apart ---------- */

export interface SeatSize {
  w: number
  h: number
}

export interface SeatPlacement {
  x: number
  y: number
  side: SeatSide
  /** Cap (px) with ellipsis, when the label would collide or leave the viewport. */
  maxWidth: number | null
}

/**
 * Where each villain's label goes: on the rim (top seats above it, side seats beside it;
 * on a phone the two flanking seats sit beside your hand). Measured sizes push the outer
 * top labels apart from the centre one by at least 20 px, and cap them with an ellipsis
 * rather than let them leave the viewport (or run under a side panel).
 */
export function placeSeats(L: TableLayout, sizes: Readonly<Partial<Record<VillainSlot, SeatSize>>>): Record<VillainSlot, SeatPlacement> {
  const g = L.g
  const phone = L.kind === 'phone'
  const size = (k: VillainSlot) => sizes[k] ?? { w: 0, h: 0 }
  const out = {} as Record<VillainSlot, SeatPlacement>
  for (const k of VILLAIN_SLOTS) {
    const sl = g.seats[k]
    if (sl.side === 'top') {
      const u = sl.u ?? 0.5
      const a = project(L, u, rimV(u), 0)
      if (phone && u !== 0.5) out[k] = { x: u < 0.5 ? 16 : L.W - 16, y: a[1] - 8, side: u < 0.5 ? 'top-left' : 'top-right', maxWidth: null }
      else out[k] = { x: a[0], y: a[1] - (phone ? 8 : 14), side: 'top', maxWidth: null }
    } else if (sl.side === 'left') {
      const a = project(L, 0, 0.5, 0)
      out[k] = { x: a[0] - 20, y: a[1], side: 'left', maxWidth: Math.max(60, a[0] - 20 - 16) }
    } else if (sl.side === 'right') {
      const a = project(L, 1, 0.5, 0)
      out[k] = { x: a[0] + 20, y: a[1], side: 'right', maxWidth: Math.max(60, L.Weff - 16 - (a[0] + 20)) }
    } else {
      // phone: the next seats clockwise from you flank your hand
      const y = L.heroTop + L.hw * 0.7
      out[k] = { x: sl.side === 'corner-left' ? 16 : L.W - 16, y, side: sl.side, maxWidth: Math.max(60, (L.W - L.hw * 2.1) / 2 - 28) }
    }
  }
  const c = out[3]
  const cw = size(3).w
  if (phone) {
    const left = c.x - cw / 2 - 12
    if (16 + size(2).w > left) out[2].maxWidth = Math.max(48, left - 16)
    const right = c.x + cw / 2 + 12
    if (L.W - 16 - size(4).w < right) out[4].maxWidth = Math.max(48, L.W - 16 - right)
  } else {
    const gap = 20
    const a = out[2]
    const b = out[4]
    const aw = size(2).w
    const bw = size(4).w
    let ax = Math.min(a.x, c.x - cw / 2 - gap - aw / 2)
    let bx = Math.max(b.x, c.x + cw / 2 + gap + bw / 2)
    const minX = 16 + aw / 2
    const maxX = L.Weff - 16 - bw / 2
    if (ax < minX) {
      const cap = Math.max(60, c.x - cw / 2 - gap - 16)
      a.maxWidth = cap
      ax = Math.max(16 + Math.min(aw, cap) / 2, Math.min(a.x, c.x - cw / 2 - gap - Math.min(aw, cap) / 2))
    }
    if (bx > maxX) {
      const cap = Math.max(60, L.Weff - 16 - (c.x + cw / 2 + gap))
      b.maxWidth = cap
      bx = Math.min(L.Weff - 16 - Math.min(bw, cap) / 2, Math.max(b.x, c.x + cw / 2 + gap + Math.min(bw, cap) / 2))
    }
    a.x = ax
    b.x = bx
  }
  return out
}

/* ---------- the slab's side, in viewport px ---------- */

/** A point on the slab's outline at angle t (0 the right end, pi/2 the middle of the near
 * rim, pi the left end), for a corner exponent n (N_SUPER, or 2 for a plain ellipse). */
function outlineUV(t: number, n: number): UV {
  const cx = Math.cos(t)
  const sy = Math.sin(t)
  const r = Math.pow(Math.pow(Math.abs(cx), n) + Math.pow(Math.abs(sy), n), -1 / n)
  return [0.5 + 0.5 * cx * r, 0.5 + 0.5 * sy * r]
}

/** The near rim at a depth below the top (0..1 of the thickness), left end to right end. */
function nearRim(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy'>, depth: number, n: number, steps: number): [number, number][] {
  const z = -L.g.thick * L.s * depth
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const [u, v] = outlineUV(Math.PI - (i / steps) * Math.PI, n)
    out.push(project(L, u, v, z))
  }
  return out
}

const pathOf = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

export interface SlabSide {
  /** The visible side, from the top's near rim down to the bottom edge, as closed paths
   * from successive depths (0 = just under the rim) to the bottom: band k starts at depth
   * k / bands. Painted in order, each covers the lower part of the one before, so a fill
   * per band is a vertical ramp that follows the curve. */
  bands: string[]
  /** The bottom edge, left end to right end (an open path). */
  edge: string
  /** Its extent on screen. */
  box: { x: number; y: number; w: number; h: number }
}

/**
 * The slab's side wall as the camera sees it: the band between the top's near rim and
 * the bottom's, projected exactly as CSS 3D draws the slab (the top face paints over the
 * rest). n is the corner exponent the browser actually draws (2 where corner-shape is
 * unsupported and the slab is a plain ellipse).
 */
export function slabSide(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy'>, bands = 12, n = N_SUPER, steps = 96): SlabSide {
  const bottom = nearRim(L, 1, n, steps)
  const out: string[] = []
  for (let k = 0; k < bands; k++) {
    const top = nearRim(L, k / bands, n, steps)
    out.push(`${pathOf([...top, ...bottom.slice().reverse()])}Z`)
  }
  const all = [...nearRim(L, 0, n, steps), ...bottom]
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { bands: out, edge: pathOf(bottom), box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } }
}

/** Where the glint sits: the light source on the limb grazing the near rim. */
export function glintAt(L: TableLayout, sunX: number): { u: number; v: number; deg: number } {
  const gu = clamp((sunX - (L.axis - L.tableW / 2)) / L.tableW, 0.56, 0.88)
  const slope = ((rimV(gu + 0.002) - rimV(gu - 0.002)) / 0.004) * L.g.aspect
  return { u: gu, v: 1 - rimV(gu), deg: (-Math.atan(slope) * 180) / Math.PI }
}
