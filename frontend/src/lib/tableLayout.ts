// The table's camera and layout: a pure projection of table space onto the viewport.
//
// Table space: u, v in 0..1 over a plan 1000 px wide (and 1000 * aspect tall) at scale 1.
// The slab is drawn by CSS 3D (a plane under rotateX(tilt) inside a perspective of
// persp * s px, centred on the scene origin). project() is that same camera as arithmetic,
// so upright 2D things (type, the hero's hand, bet labels) can sit at projected points and
// never scale or blur. Everything scales linearly with one number, s.
//
// Ported from the approved Stage prototype (round2/stage/table.js, section 2), plus:
//   - bets sit on the seat-to-pot vector, clear of the full board and the pot block, with
//     their air from the backs and from each other kept on screen (placeBets, airKept);
//   - the slab's outline as the browser draws it (a rounded rectangle without corner-shape);
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
  /** Which side of the chip its bet label reads on (placeBets flips it where only the other
   * side has room). */
  betSide: BetSide
  /** The prototype's hand-placed bet anchor: a candidate where the vector has no room. */
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
    card: 0.11,
    gap: 0.011,
    board: [0.5, 0.43],
    pot: [0.5, 0.72],
    back: 0.046,
    chip: 0.024,
    rev: 0.068,
    heroBet: [0.5, 0.9],
    seats: {
      1: { side: 'left', cards: [0.054, 0.5], rev: [0.08, 0.5], betSide: 'right', bet: [0.235, 0.66] },
      2: { side: 'top', u: 0.25, cards: [0.25, 0.15], rev: [0.26, 0.165], betSide: 'right', bet: [0.34, 0.24] },
      3: { side: 'top', u: 0.5, cards: [0.5, 0.108], rev: [0.5, 0.125], betSide: 'right', bet: [0.6, 0.2] },
      4: { side: 'top', u: 0.75, cards: [0.75, 0.15], rev: [0.74, 0.165], betSide: 'left', bet: [0.66, 0.24] },
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
    board: [0.5, 0.465],
    pot: [0.5, 0.72],
    back: 0.074,
    chip: 0.044,
    rev: 0.125,
    heroBet: [0.5, 0.905],
    seats: {
      1: { side: 'corner-left', cards: [0.198, 0.802], rev: [0.225, 0.735], betSide: 'right', bet: [0.12, 0.655] },
      2: { side: 'top', u: 0.16, cards: [0.28, 0.148], rev: [0.3, 0.185], betSide: 'right', bet: [0.31, 0.25] },
      3: { side: 'top', u: 0.5, cards: [0.5, 0.105], rev: [0.5, 0.135], betSide: 'right', bet: [0.62, 0.2] },
      // the top three sit close on a phone: every top label reads to the right of its chip
      4: { side: 'top', u: 0.84, cards: [0.72, 0.148], rev: [0.7, 0.185], betSide: 'right', bet: [0.69, 0.25] },
      5: { side: 'corner-right', cards: [0.802, 0.802], rev: [0.775, 0.735], betSide: 'left', bet: [0.88, 0.655] },
    },
  },
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/* ---------- the camera ---------- */

/**
 * The slab's outline. Where the browser has corner-shape it is superellipse(1.35),
 * |x|^n + |y|^n = 1; elsewhere a rounded rectangle (border-radius 37% / 50%), which follows
 * the superellipse within a few px everywhere a card lies (a plain ellipse's corners are far
 * rounder and would push the corner seats' cards over the rim).
 */
export type Outline = 'superellipse' | 'rounded'

export const N_SUPER = Math.pow(2, 1.35)
/** The rounded rectangle's corner radius across, a share of the width (Stage.css). */
export const ROUNDED_RX = 0.37

/** The outline the browser draws (Stage.css: the superellipse only under @supports). */
export const slabOutline = (): Outline =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('corner-shape', 'superellipse(1.35)') ? 'rounded' : 'superellipse'

/** The far rim's v at u (the near rim is 1 - rimV(u)). */
export function rimV(u: number, outline: Outline = 'superellipse'): number {
  if (outline === 'rounded') {
    const d = Math.max(0, ROUNDED_RX - u, u - (1 - ROUNDED_RX)) / ROUNDED_RX
    return 0.5 - 0.5 * Math.sqrt(Math.max(0, 1 - d * d))
  }
  return 0.5 - 0.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), N_SUPER)), 1 / N_SUPER)
}

/** The rim nearest the middle at u, of either outline: what a bet keeps clear of, so the bets
 * lie the same in every browser. */
const rimIn = (u: number) => Math.max(rimV(u, 'superellipse'), rimV(u, 'rounded'))

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
export function potBlock(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy' | 'gk'>): PotBlock {
  const phone = L.gk === 'phone'
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

/** The widest bet label ("1,168"), 15 px type on a desktop, 14 on a phone, and half the
 * height of its ink (digits: about 0.36 em). */
export const BET_LABEL_PX: Readonly<Record<GeoKind, number>> = { desk: 42, phone: 36 }
export const BET_LABEL_INK_PX: Readonly<Record<GeoKind, number>> = { desk: 5.5, phone: 5 }

/** Clearance kept between a bet and the board (table units across; v scales by aspect). */
export const BET_CLEAR_U = 0.02

/* On screen, the far rim squashes table units (the tilt and the perspective), so the air
   between a bet and the backs is kept in viewport px, as the camera draws them: the chip's
   whole stack (its top disc stands above the felt) and the upright label's ink, against
   the exact pair of backs and the lit near edge under them. */

/** How high a chip's stack stands above the felt, px (Stage.css .chip__top translateZ). */
export const chipStackZ = (s: number) => 4.8 * s + 1.2

/** Air kept on screen, px: between a bet's chip (its whole stack) and any seat's backs, and
 * its footprint on the felt (what the chip element's box measures) and any backs; between
 * its label and any backs; between two bets; and the most asked of the board (where the
 * table-space clearance would ask more, the far rim's squash makes it waste), its label's
 * ink included. */
export const CHIP_AIR_PX = 6
export const FOOT_AIR_PX = 8
export const LABEL_AIR_PX = 4
export const BET_AIR_PX = 4
export const BOARD_AIR_PX = 4

/** The shares of that air (all but BET_AIR_PX) a bet may keep, best first. A small table
 * (s under about 0.5: a portrait tablet, a laptop with a side panel open) can leave a seat no
 * spot with all of it: the 42 px label and the air are fixed px while the felt shrinks with s
 * (at 768x1024 the band between the centre seat's backs and the board is 14 px; a chip with
 * full air needs 18). The solver then gives up the least it must, never past the last step.
 * Two bets never come within BET_AIR_PX, at any size. */
export const AIR_STEPS: readonly number[] = [1, 0.8, 0.6, 0.45, 0.3, 0.15, 0.01]

export interface ScreenRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The camera's constants at one scale, about the scene origin: projectWith without the
 * trigonometry per point (the bet search projects thousands of points per layout). */
export interface Camera {
  pw: number
  ph: number
  ct: number
  st: number
  p: number
}

export function cameraAt(g: Geo, s: number): Camera {
  const t = (g.tilt * Math.PI) / 180
  return { pw: 1000 * s, ph: 1000 * s * g.aspect, ct: Math.cos(t), st: Math.sin(t), p: g.persp * s }
}

/** Widen r by a box's edge at v, raised z px off the felt (projectWith, inlined). */
function widen(c: Camera, r: ScreenRect, b: BoxUV, v: number, z: number) {
  const y = (v - 0.5) * c.ph
  const f = c.p / (c.p - (y * c.st + z * c.ct))
  const sy = (y * c.ct - z * c.st) * f
  const xa = (b.u0 - 0.5) * c.pw * f
  const xb = (b.u1 - 0.5) * c.pw * f
  if (xa < r.x0) r.x0 = xa
  if (xb > r.x1) r.x1 = xb
  if (sy < r.y0) r.y0 = sy
  if (sy > r.y1) r.y1 = sy
}

/** A point on the felt (z px above it) as the camera draws it, about the scene origin. */
function pointAt(c: Camera, u: number, v: number, z: number): [number, number] {
  const y = (v - 0.5) * c.ph
  const f = c.p / (c.p - (y * c.st + z * c.ct))
  return [(u - 0.5) * c.pw * f, (y * c.ct - z * c.st) * f]
}

/** A box on the felt as the camera draws it (about the scene origin), from z0 up to z1. */
function screenRect(c: Camera, b: BoxUV, z0: number, z1 = z0): ScreenRect {
  const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  widen(c, r, b, b.v0, z0)
  widen(c, r, b, b.v1, z0)
  if (z1 !== z0) {
    widen(c, r, b, b.v0, z1)
    widen(c, r, b, b.v1, z1)
  }
  return r
}

/** Screen px between two rects: the distance between their nearest points (negative, the
 * depth of the overlap, where they overlap). */
export function rectGap(a: ScreenRect, b: ScreenRect): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1)
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1)
  return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy)
}

/** A seat's two backs on screen, the lit near edge under them included. */
export function backsRect(g: Geo, s: number, at: UV, c: Camera = cameraAt(g, s)): ScreenRect {
  const hu = (g.back * (1 + BACKS_OFFSET)) / 2
  const hv = (g.back * 1.4) / g.aspect / 2
  const r = screenRect(c, { u0: at[0] - hu, u1: at[0] + hu, v0: at[1] - hv, v1: at[1] + hv }, 0.6)
  return { ...r, y1: r.y1 + 0.5 + 0.5 * s }
}

/** What a bet must keep clear of, at a layout's scale: the board, the pot block, the label's
 * size, every seat's backs and the bets already placed (on screen). */
export interface BetRoom {
  s: number
  cam: Camera
  /** The widest label and half its ink's height, px. */
  label: number
  ink: number
  backs: readonly ScreenRect[]
  taken?: readonly ScreenRect[]
  /** The full board in table space, and its clearance along v (the table-space one, but
   * never more than BOARD_AIR_PX on screen at its far edge). */
  board: BoxUV
  boardV: number
  /** The pot block grown by its clearance. */
  potClear: BoxUV
}

export function betRoom(L: Pick<TableLayout, 'g' | 'gk' | 's' | 'pot'>, taken?: readonly ScreenRect[]): BetRoom {
  const { g, s } = L
  const cam = cameraAt(g, s)
  const board = boardBox(g)
  const pxPerV = (pointAt(cam, 0.5, board.v0, 0.6)[1] - pointAt(cam, 0.5, board.v0 - 0.01, 0.6)[1]) / 0.01
  const clearV = BET_CLEAR_U / g.aspect
  return {
    s,
    cam,
    label: BET_LABEL_PX[L.gk],
    ink: BET_LABEL_INK_PX[L.gk],
    backs: VILLAIN_SLOTS.map((k) => backsRect(g, s, g.seats[k].cards, cam)),
    taken,
    board,
    boardV: Math.min(clearV, BOARD_AIR_PX / pxPerV),
    potClear: grow(L.pot.box, BET_CLEAR_U * 0.5, clearV * 0.5),
  }
}

/** A bet on screen: its chip, from the base disc on the felt to the top of the stack, its
 * footprint, and its upright label on one side. */
export function betRects(g: Geo, at: UV, side: BetSide, room: BetRoom): { chip: ScreenRect; foot: ScreenRect; label: ScreenRect } {
  const { s, cam } = room
  const ru = g.chip / 2
  const rv = g.chip / 2 / g.aspect
  const disc = { u0: at[0] - ru, u1: at[0] + ru, v0: at[1] - rv, v1: at[1] + rv }
  const foot = screenRect(cam, disc, 0.6)
  const chip = screenRect(cam, disc, 0.6, 0.6 + chipStackZ(s))
  const [x, y] = pointAt(cam, at[0], at[1], 0.6)
  const off = (1000 * s * g.chip) / 2 + 8 // Stage.css .bet-label --gap
  const x0 = side === 'right' ? x + off : x - off - room.label
  return { chip, foot, label: { x0, x1: x0 + room.label, y0: y - room.ink, y1: y + room.ink } }
}

/**
 * How much of the air a bet at `at`, its label on `side`, keeps: the least share (0..1), over
 * every seat's backs and the board, of the air asked. 0 where a hard rule fails: on the board
 * or the pot block, over the rim (of either outline the browser draws), within BET_AIR_PX of
 * a bet already placed. Gives up (0) as soon as the share drops under `floor`.
 */
export function airKept(g: Geo, at: UV, side: BetSide, room: BetRoom, floor = 0): number {
  const box = betBox(g, at, side, room.label / (1000 * room.s))
  if (box.u0 < 0.03 || box.u1 > 0.97) return 0
  if (overlaps(box, room.potClear)) return 0
  const rim = Math.max(rimIn(box.u0), rimIn(box.u1))
  if (box.v0 < rim + 0.02 || box.v1 > 1 - rim - 0.03) return 0
  let kept = 1
  const b = room.board
  if (box.u0 < b.u1 + BET_CLEAR_U && b.u0 - BET_CLEAR_U < box.u1) {
    const gap = Math.max(b.v0 - box.v1, box.v0 - b.v1)
    if (gap <= 0) return 0
    kept = Math.min(kept, gap / room.boardV)
    if (kept < floor) return 0
  }
  const r = betRects(g, at, side, room)
  if (room.taken) for (const t of room.taken) if (rectGap(r.chip, t) < BET_AIR_PX || rectGap(r.label, t) < BET_AIR_PX) return 0
  for (const k of room.backs) {
    kept = Math.min(kept, rectGap(r.chip, k) / CHIP_AIR_PX, rectGap(r.foot, k) / FOOT_AIR_PX, rectGap(r.label, k) / LABEL_AIR_PX)
    if (kept < floor) return 0
  }
  return kept > 0 ? Math.min(1, kept) : 0
}

/** The step of AIR_STEPS a share of the air reaches (its index; -1 under the last). */
export function airStep(kept: number): number {
  for (let i = 0; i < AIR_STEPS.length; i++) if (kept >= AIR_STEPS[i] - 1e-9) return i
  return -1
}

/** The seat laid out as this one's mirror image (desk: 2 and 4, 1 and 5), if any: its bet
 * is then this one's, mirrored, so the table stays symmetric. */
export function twinOf(g: Geo, slot: VillainSlot): VillainSlot | null {
  const k = (6 - slot) as VillainSlot
  if (k === slot) return null
  const a = g.seats[slot]
  const b = g.seats[k]
  const same = Math.abs(a.cards[0] + b.cards[0] - 1) < 1e-9 && a.cards[1] === b.cards[1] && a.betSide !== b.betSide
  return same ? k : null
}

const mirror = ([u, v]: UV): UV => [round4(1 - u), v]
const flip = (side: BetSide): BetSide => (side === 'left' ? 'right' : 'left')

/** A bet's spot and how much air it keeps (its AIR_STEPS index; -1: no rule kept). */
interface Spot {
  at: UV
  step: number
}

/** Whether a bet at `at` reads as seat `slot`'s: on screen its chip's centre lies within
 * OWN_REACH_PX of that seat's backs, and nearer them than any other seat's (by OWN_MARGIN). */
function owns(slot: VillainSlot, at: UV, room: BetRoom): boolean {
  const [x, y] = pointAt(room.cam, at[0], at[1], 0.6)
  const p = { x0: x, x1: x, y0: y, y1: y }
  const own = rectGap(p, room.backs[slot - 1])
  if (own > OWN_REACH_PX) return false
  for (let k = 0; k < room.backs.length; k++) if (k !== slot - 1 && rectGap(p, room.backs[k]) * OWN_MARGIN <= own) return false
  return true
}

/** How far from its own seat's backs a bet's chip may lie (centre to their nearest edge, px:
 * 12 to 24 wherever the table has room), and how much nearer them than any other seat's. */
export const OWN_REACH_PX = 30
const OWN_MARGIN = 0.8

/** The step a seat's bet at `at` keeps, with its twin's (both clear, both theirs, and clear
 * of each other), giving up under step `worst` (cheaper: the share stops being worked out). */
function spotStep(g: Geo, slot: VillainSlot, at: UV, side: BetSide, room: BetRoom, twin: { slot: VillainSlot; side: BetSide; at: UV } | null, worst: number): number {
  if (!owns(slot, at, room) || (twin && !owns(twin.slot, twin.at, room))) return -1
  const floor = AIR_STEPS[worst]
  let kept = airKept(g, at, side, room, floor)
  if (twin && kept > 0) {
    kept = Math.min(kept, airKept(g, twin.at, twin.side, room, floor))
    if (kept > 0) {
      const a = betRects(g, at, side, room)
      const b = betRects(g, twin.at, twin.side, room)
      for (const r of [a.chip, a.label]) if (rectGap(r, b.chip) < BET_AIR_PX || rectGap(r, b.label) < BET_AIR_PX) kept = 0
    }
  }
  return airStep(kept)
}

/**
 * A seat's bet, its label on `side`: on the vector from where its cards lie toward the pot,
 * as close to the seat as the clearances allow (the backs, the full five-card board, the pot
 * block, the rim, the bets already placed). Where there is no room on the vector itself (the
 * side seats: the board spans the felt; the top centre: its backs and the board leave too
 * little), it steps off it by the least it must, never so far that it reads as another
 * seat's (owns). The full board is used on every street, so a bet never moves when a card
 * lands. With a twin (twinOf), the spot must suit the twin mirrored too (its label on the
 * mirrored side). The most air kept wins (AIR_STEPS), then the least t + 2|d|. The cells are
 * visited in order of that cost (the search stops at the first that keeps all the air), on a
 * coarse grid first, then at full resolution around its best. Null if no spot keeps even the
 * last step.
 */
export function betSpot(g: Geo, slot: VillainSlot, side: BetSide, room: BetRoom, twin: VillainSlot | null = null): Spot | null {
  const a = g.seats[slot].cards
  const ph = g.aspect // plane px per table unit, relative to u
  const p: UV = [g.pot[0], g.pot[1] - 0.03]
  // work in isotropic plane units, so "perpendicular" means perpendicular on the felt
  const dx = p[0] - a[0]
  const dy = (p[1] - a[1]) * ph
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  // rows: t from the seat to most of the way to the pot, len / 200 apart; columns: d off the
  // line, 0.005 apart
  const dt = len / 200
  const last = AIR_STEPS.length - 1
  const found: { best: (Spot & { cost: number; i: number; j: number }) | null } = { best: null }
  const visit = (i: number, j: number, cost: number) => {
    // only a spot that keeps more air, or as much nearer the seat, can win
    const worst = !found.best ? last : cost < found.best.cost ? found.best.step : found.best.step - 1
    if (worst < 0) return
    const t = i * dt
    const d = j * 0.005
    const at: UV = [round4(a[0] + ux * t - uy * d), round4(a[1] + (uy * t + ux * d) / ph)]
    const step = spotStep(g, slot, at, side, room, twin ? { slot: twin, side: flip(side), at: mirror(at) } : null, worst)
    if (step < 0 || step > worst || (found.best && step === found.best.step && cost >= found.best.cost)) return
    found.best = { at, step, cost, i, j }
  }
  // rows i0..i1 every di, columns j0..j1 every dj, in order of cost (a band of di rows at a
  // time: each column keeps its own next row), so that once a spot keeps all the air nothing
  // dearer is looked at
  const sweep = (i0: number, i1: number, di: number, j0: number, j1: number, dj: number) => {
    const cols: Cell[] = []
    for (let j = j0; j <= j1; j += dj) cols.push({ i: i0, j })
    for (let c = (i0 + di) * dt; ; c += di * dt) {
      let left = false
      for (const col of cols) {
        let cost = col.i * dt + 0.01 * Math.abs(col.j)
        while (col.i <= i1 && cost < c) {
          visit(col.i, col.j, cost)
          col.i += di
          cost += di * dt
        }
        if (col.i <= i1) left = true
      }
      if (!left || (found.best?.step === 0 && found.best.cost <= c)) break
    }
  }
  // coarse to fine: every 4th row and 2nd column, then every cell around the best of those
  sweep(0, BET_ROWS, 4, -BET_COLS, BET_COLS, 2)
  const coarse = found.best as (Spot & { i: number; j: number }) | null
  if (!coarse) return null
  sweep(Math.max(0, coarse.i - 3), Math.min(BET_ROWS, coarse.i + 3), 1, Math.max(-BET_COLS, coarse.j - 1), Math.min(BET_COLS, coarse.j + 1), 1)
  const { at, step } = found.best as Spot
  return { at, step }
}

interface Cell {
  i: number
  j: number
}

/** The bet search's grid (betSpot): 160 rows (0.8 of the way to the pot) by 2 x 32 columns. */
const BET_ROWS = 160
const BET_COLS = 32

const round4 = (n: number) => Math.round(n * 1e4) / 1e4

/** The order the bets are placed in: the top-centre seat first (its bet has the least room,
 * between its backs and the board), then its neighbours, then the sides. */
const BET_ORDER: readonly VillainSlot[] = [3, 2, 4, 1, 5]

export interface BetPlan {
  bets: Record<VillainSlot, UV>
  sides: Record<VillainSlot, BetSide>
  /** The share of the air each bet keeps (AIR_STEPS; 0: none found, the hand-placed anchor). */
  kept: Record<VillainSlot, number>
}

/**
 * Every villain's bet, one seat at a time (BET_ORDER), each keeping clear on screen of the
 * bets already placed (the hero's first). Per seat, the most air kept wins; at equal air, in
 * this order: its own side on the vector (twins mirrored), the hand-placed anchor, the label
 * on the other side (twins both flipped), and last, for twins, each placed on its own.
 */
export function placeBets(g: Geo, room: BetRoom, heroBet: UV): BetPlan {
  const plan: BetPlan = { bets: {} as BetPlan['bets'], sides: {} as BetPlan['sides'], kept: {} as BetPlan['kept'] }
  const taken: ScreenRect[] = []
  const put = (k: VillainSlot, at: UV, side: BetSide, step: number) => {
    plan.bets[k] = at
    plan.sides[k] = side
    plan.kept[k] = step < 0 ? 0 : AIR_STEPS[step]
    const r = betRects(g, at, side, room)
    taken.push(r.chip, r.label)
  }
  const r = betRects(g, heroBet, 'right', room)
  taken.push(r.chip, r.label)
  for (const k of BET_ORDER) {
    if (plan.bets[k]) continue
    const sg = g.seats[k]
    const side = sg.betSide
    const twin = twinOf(g, k)
    const here = { ...room, taken: [...taken] }
    // this seat (and its twin, mirrored) as one choice
    let pick = choice(betSpot(g, k, side, here, twin), side)
    if (pick?.step !== 0) {
      const anchor = { at: sg.bet, side, step: spotStep(g, k, sg.bet, side, here, twin ? { slot: twin, side: flip(side), at: mirror(sg.bet) } : null, AIR_STEPS.length - 1) }
      pick = better(pick, anchor)
    }
    if (pick?.step !== 0) pick = better(pick, choice(betSpot(g, k, flip(side), here, twin), flip(side)))
    if (twin && pick?.step !== 0) {
      // each on its own: this seat, then its twin clear of it
      const mine = alone(g, k, here)
      const theirs = mine && (!pick || mine.step < pick.step) ? alone(g, twin, { ...room, taken: [...taken, ...rectsOf(g, mine, room)] }) : null
      if (mine && theirs && (!pick || Math.max(mine.step, theirs.step) < pick.step)) {
        put(k, mine.at, mine.side, mine.step)
        put(twin, theirs.at, theirs.side, theirs.step)
        continue
      }
    }
    // nothing keeps even the last step (a table far smaller than any supported size): the
    // hand-placed anchors
    const at = pick?.at ?? sg.bet
    put(k, at, pick?.side ?? side, pick?.step ?? -1)
    if (twin) put(twin, pick ? mirror(at) : g.seats[twin].bet, flip(pick?.side ?? side), pick?.step ?? -1)
  }
  return plan
}

interface Choice extends Spot {
  side: BetSide
}

const choice = (s: Spot | null, side: BetSide): Choice | null => (s ? { ...s, side } : null)
const better = (a: Choice | null, b: Choice | null): Choice | null => (b && b.step >= 0 && (!a || b.step < a.step) ? b : a)
const rectsOf = (g: Geo, c: Choice, room: BetRoom) => {
  const r = betRects(g, c.at, c.side, room)
  return [r.chip, r.label]
}

/** A seat's bet on its own (no twin): its side, or the other where that keeps more air. */
function alone(g: Geo, k: VillainSlot, room: BetRoom): Choice | null {
  const side = g.seats[k].betSide
  const a = choice(betSpot(g, k, side, room), side)
  return a?.step === 0 ? a : better(a, choice(betSpot(g, k, flip(side), room), flip(side)))
}

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
  /** Tallest top-seat label (px); depends on the visibility mode (HUD adds a line). Per
   * geometry when a tablet may draw either (the phone's labels are smaller). */
  topSeatH: number | Readonly<Record<GeoKind, number>>
  /** Widest side-seat label (px). */
  sideSeatW: number
  /** The outline the browser draws (slabOutline). */
  outline?: Outline
}

export interface TableLayout {
  kind: LayoutKind
  /** The table's geometry: the phone's on a phone and on a tablet too small for the desk's
   * (TABLET_PHONE_GEO_S). The chrome (bar, dock, sheets) still follows `kind`. */
  gk: GeoKind
  g: Geo
  /** The slab's outline as this browser draws it. */
  outline: Outline
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
  /** Each villain's bet anchor and the hero's, in table space (placeBets). */
  bets: Readonly<Record<VillainSlot, UV>>
  /** The side each villain's bet label reads on (its seat's, unless that had no room). */
  betSides: Readonly<Record<VillainSlot, BetSide>>
  /** The share of the air each villain's bet keeps (AIR_STEPS; 1 on any table not small). */
  betKept: Readonly<Record<VillainSlot, number>>
  heroBet: UV
}

const PANEL_W = 360

/** The coach's ring size beside the hand (the coach builder draws 112 px). */
export const COACH_RING_SIDE = 112

/** Below this desk scale a tablet draws its table with the phone's geometry, when that one
 * reaches it: a portrait tablet 600-650 px wide (the desk's s is about 0.21-0.25 there, the
 * phone's 0.5). The desk's fixed-px labels and air outgrow so small a felt, its bets overlap
 * and its pot block runs past the near rim; the phone's deeper, nearer table spends the width
 * on the felt. A landscape phone (360-430 px tall) is too short for either: it keeps the desk's. */
export const TABLET_PHONE_GEO_S = 0.3

/** The table, seats, hand, pot and bets for a viewport. A phone draws the phone's geometry and
 * a desktop the desk's; a tablet the desk's unless TABLET_PHONE_GEO_S says otherwise. */
export function computeLayout(input: LayoutInput): TableLayout {
  if (input.kind !== 'tablet') return layoutAs(input, input.kind === 'phone' ? 'phone' : 'desk')
  const desk = layoutAs(input, 'desk')
  if (desk.s >= TABLET_PHONE_GEO_S) return desk
  const phone = layoutAs(input, 'phone')
  return phone.s >= TABLET_PHONE_GEO_S ? phone : desk
}

function layoutAs(input: LayoutInput, gk: GeoKind): TableLayout {
  const { w: W, h: H, kind, panelOpen, limb, safeBottom = 0, sideSeatW, outline = 'superellipse' } = input
  const topSeatH = typeof input.topSeatH === 'number' ? input.topSeatH : input.topSeatH[gk]
  // the chrome (bar, dock, coach row) follows the breakpoint; the table follows its geometry
  const phone = kind === 'phone'
  const pg = gk === 'phone'
  const g = GEO[gk]
  const unit = unitBounds(g)
  const lift = pg ? 10 : 16
  const barH = phone ? 56 : 64
  // the dock floats fully above the limb with clear air; on a phone the limb sinks below it
  const dockGap = phone ? Math.max(12, safeBottom) : 18
  const dockBottom = H - limb - dockGap
  const dockH = phone ? 66 : 64
  const panelW = kind === 'desk' && panelOpen ? PANEL_W : 0
  const Weff = W - (panelW ? panelW + 16 : 0)
  const regionTop = barH + (phone ? 6 : 14)
  const sideL = pg ? 0 : Math.max(W >= 1700 ? 140 : 116, sideSeatW + 22)
  const margin = pg ? 0 : W >= 1700 ? 64 : 32
  const topSeats = topSeatH + (pg ? 6 : 12)
  const topAir = pg ? 10 : 14
  const heroAir = (pg ? 14 : 24) + lift
  const heroLabelH = pg ? 8 + 22 + 4 + 18 : 12 + 26 + 6 + 20

  const fit = (rowH: number) => {
    const regionBottom = dockBottom - dockH - (phone ? 12 : 18) - rowH
    const avail = regionBottom - regionTop
    let s = pg ? (W - 64) / unit.w : Math.min((Weff - 2 * margin - 2 * sideL) / unit.w, (Weff * 0.66) / unit.w)
    s = Math.min(s, 1.05)
    let hw = 0
    for (let i = 0; i < 8; i++) {
      const boardPx = g.card * 1000 * s
      hw = pg ? clamp(boardPx * 1.25, 54, Math.min(66, (W - 260) / 2.1)) : clamp(boardPx * 1.04, 76, 116)
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
  // (on the phone's geometry the corner seats flank your hand, so the coach takes the row)
  if (phone || pg) coachAt = 'row'
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
  const stackTop = regionTop + Math.max(0, (avail - stackH) * (pg ? 0.5 : 0.46))
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

  const pot = potBlock({ g, s, ox, oy, gk })
  const heroBet = heroBetAnchor(g, pot.box)
  const { bets, sides: betSides, kept: betKept } = placeBets(g, betRoom({ g, gk, s, pot }), heroBet)
  return { kind, gk, g, outline, W, H, Weff, panelW, s, axis, ox, oy, tableW, tableH, objTop, objBottom, hw, lift, barH, dockBottom, dockH, coachAt, tight, heroTop, coach, pot, bets, betSides, betKept, heroBet }
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
  const phone = L.gk === 'phone'
  const size = (k: VillainSlot) => sizes[k] ?? { w: 0, h: 0 }
  const out = {} as Record<VillainSlot, SeatPlacement>
  for (const k of VILLAIN_SLOTS) {
    const sl = g.seats[k]
    if (sl.side === 'top') {
      const u = sl.u ?? 0.5
      const a = project(L, u, rimV(u, L.outline), 0)
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

/** A point on the slab's outline at angle t from its centre (0 the right end, pi/2 the
 * middle of the near rim, pi the left end). */
function outlineUV(t: number, outline: Outline): UV {
  const c = Math.abs(Math.cos(t))
  const sn = Math.abs(Math.sin(t))
  let r: number
  if (outline === 'superellipse') r = Math.pow(Math.pow(c, N_SUPER) + Math.pow(sn, N_SUPER), -1 / N_SUPER)
  else {
    // in -1..1 across and down: a flat run in the middle, quarter ellipses (a across, 1 down)
    const a = 2 * ROUNDED_RX
    if (sn > 0 && c / sn <= 1 - a) r = 1 / sn
    else {
      const A = (c * c) / (a * a) + sn * sn
      const B = (2 * c * (1 - a)) / (a * a)
      const C = ((1 - a) * (1 - a)) / (a * a) - 1
      r = (B + Math.sqrt(B * B - 4 * A * C)) / (2 * A)
    }
  }
  return [0.5 + 0.5 * Math.cos(t) * r, 0.5 + 0.5 * Math.sin(t) * r]
}

/** The near rim at a depth below the top (0..1 of the thickness), left end to right end. */
function nearRim(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy'>, depth: number, outline: Outline, steps: number): [number, number][] {
  const z = -L.g.thick * L.s * depth
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const [u, v] = outlineUV(Math.PI - (i / steps) * Math.PI, outline)
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
 * rest), following the outline the browser actually draws.
 */
export function slabSide(L: Pick<TableLayout, 'g' | 's' | 'ox' | 'oy' | 'outline'>, bands = 12, outline = L.outline, steps = 96): SlabSide {
  const bottom = nearRim(L, 1, outline, steps)
  const out: string[] = []
  for (let k = 0; k < bands; k++) {
    const top = nearRim(L, k / bands, outline, steps)
    out.push(`${pathOf([...top, ...bottom.slice().reverse()])}Z`)
  }
  const all = [...nearRim(L, 0, outline, steps), ...bottom]
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { bands: out, edge: pathOf(bottom), box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } }
}

/** Where the glint sits: the light source on the limb grazing the near rim. */
export function glintAt(L: TableLayout, sunX: number): { u: number; v: number; deg: number } {
  const gu = clamp((sunX - (L.axis - L.tableW / 2)) / L.tableW, 0.56, 0.88)
  const o = L.outline
  const slope = ((rimV(gu + 0.002, o) - rimV(gu - 0.002, o)) / 0.004) * L.g.aspect
  return { u: gu, v: 1 - rimV(gu, o), deg: (-Math.atan(slope) * 180) / Math.PI }
}
