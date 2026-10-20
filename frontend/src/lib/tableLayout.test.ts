import { describe, expect, it } from 'vitest'
import type { LayoutKind } from './breakpoints'
import {
  GEO,
  BET_LABEL_PX,
  VILLAIN_SLOTS,
  backsBox,
  betBox,
  betClear,
  boardBox,
  boardU,
  computeLayout,
  glintAt,
  placeSeats,
  project,
  projectWith,
  rimV,
  slabSide,
  unitBounds,
  vAtY,
  type BoxUV,
  type TableLayout,
} from './tableLayout'
import { limbHeight } from './space'

const layout = (w: number, h: number, kind: LayoutKind, panelOpen = false) =>
  computeLayout({ w, h, kind, panelOpen, limb: limbHeight(h), topSeatH: kind === 'phone' ? 36 : 43, sideSeatW: 140 })

const SIZES: [number, number, LayoutKind][] = [
  [1440, 900, 'desk'],
  [1280, 720, 'desk'],
  [1920, 1080, 'desk'],
  [1024, 768, 'tablet'],
  [390, 844, 'phone'],
  [390, 664, 'phone'],
]

describe('project (the camera)', () => {
  it('puts the plane centre on the scene origin', () => {
    const [x, y] = projectWith(GEO.desk, 1, 100, 200, 0.5, 0.5, 0)
    expect(x).toBeCloseTo(100)
    expect(y).toBeCloseTo(200)
  })
  it('is CSS rotateX then perspective: the far half shrinks, the near half grows', () => {
    const g = GEO.desk
    const far = projectWith(g, 1, 0, 0, 1, 0, 0)
    const near = projectWith(g, 1, 0, 0, 1, 1, 0)
    expect(far[1]).toBeLessThan(0)
    expect(near[1]).toBeGreaterThan(0)
    expect(near[0]).toBeGreaterThan(far[0]) // the near edge is wider on screen
    // a point at depth y=0 is foreshortened only by cos(tilt) in y
    const t = (g.tilt * Math.PI) / 180
    const [, y] = projectWith(g, 1, 0, 0, 0.5, 0.75, 0)
    const y0 = 0.25 * 1000 * g.aspect
    const z1 = y0 * Math.sin(t)
    expect(y).toBeCloseTo((y0 * Math.cos(t) * g.persp) / (g.persp - z1), 6)
  })
  it('scales linearly with s', () => {
    const a = projectWith(GEO.phone, 1, 0, 0, 0.2, 0.9, 0)
    const b = projectWith(GEO.phone, 0.5, 0, 0, 0.2, 0.9, 0)
    expect(b[0]).toBeCloseTo(a[0] * 0.5, 1)
    expect(b[1]).toBeCloseTo(a[1] * 0.5, 1)
  })
  it('rimV: the superellipse far rim', () => {
    expect(rimV(0.5)).toBeCloseTo(0)
    expect(rimV(0)).toBeCloseTo(0.5)
    expect(rimV(0.25)).toBeCloseTo(rimV(0.75))
    expect(unitBounds(GEO.desk).w).toBeGreaterThan(1000)
  })
})

describe('boardU', () => {
  it('centres the board on the cards dealt so far', () => {
    const g = GEO.desk
    expect(boardU(g, 1, 3)).toBeCloseTo(0.5)
    expect(boardU(g, 2, 5)).toBeCloseTo(0.5)
    expect((boardU(g, 0, 4) + boardU(g, 3, 4)) / 2).toBeCloseTo(0.5)
    expect(boardU(g, 1, 3) - boardU(g, 0, 3)).toBeCloseTo(g.card + g.gap)
  })
})

describe('computeLayout', () => {
  it.each(SIZES)('%ix%i: one axis, the stack between the bar and the dock, the dock above the limb', (w, h, kind) => {
    const L = layout(w, h, kind)
    expect(L.axis).toBeCloseTo(w / 2)
    expect(L.objTop).toBeGreaterThan(L.barH)
    expect(L.heroTop).toBeGreaterThan(L.objBottom)
    // hand + label end above the dock (and above the coach row when it is one)
    const handBottom = L.heroTop + L.hw * 1.4 + (kind === 'phone' ? 52 : 64)
    const ceiling = L.coachAt === 'row' ? L.coach.top : L.dockBottom - L.dockH
    expect(handBottom).toBeLessThanOrEqual(ceiling + 1)
    expect(L.dockBottom).toBeLessThan(h - limbHeight(h))
    expect(L.tableW).toBeLessThanOrEqual(w)
  })
  it('puts the coach beside the hand on a desktop, above the dock on a phone', () => {
    const d = layout(1440, 900, 'desk')
    expect(d.coachAt).toBe('side')
    expect(d.coach.left).toBeGreaterThan(d.axis + d.hw * 1.05)
    expect(d.coach.left + d.coach.width).toBeLessThan(1440)
    expect(layout(390, 844, 'phone').coachAt).toBe('row')
    expect(layout(1024, 768, 'tablet')).toMatchObject({ coachAt: 'side', tight: true })
    expect(layout(700, 900, 'tablet').coachAt).toBe('row')
  })
  it('re-centres the table when a desktop panel opens', () => {
    const open = layout(1440, 900, 'desk', true)
    expect(open.panelW).toBe(360)
    expect(open.axis).toBeCloseTo((1440 - 376) / 2)
    expect(open.coach.left + open.coach.width).toBeLessThan(1440 - 376)
    // a phone never takes a side panel
    expect(layout(390, 844, 'phone', true).panelW).toBe(0)
  })
  it('lifts the hand 16 px (10 on a phone)', () => {
    expect(layout(1440, 900, 'desk').lift).toBe(16)
    expect(layout(390, 844, 'phone').lift).toBe(10)
  })
})

describe('bets', () => {
  it.each(SIZES)('%ix%i: every bet clears the full board, the backs, the pot block and the rim', (w, h, kind) => {
    const L = layout(w, h, kind)
    for (const k of VILLAIN_SLOTS) expect(betClear(L.g, k, L.bets[k], L.pot.box, BET_LABEL_PX[L.gk] / (1000 * L.s)), `seat ${k}`).toBe(true)
  })
  it.each(SIZES)('%ix%i: no two bets (chip and label) touch', (w, h, kind) => {
    const L = layout(w, h, kind)
    const labelU = BET_LABEL_PX[L.gk] / (1000 * L.s)
    const boxes = [
      betBox(L.g, L.heroBet, 'right', labelU),
      ...VILLAIN_SLOTS.map((k) => betBox(L.g, L.bets[k], L.g.seats[k].betSide, labelU)),
    ]
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const touch = a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1
        expect(touch, `bets ${i} and ${j}`).toBe(false)
      }
  })
  it.each(SIZES)('%ix%i: the hero bet sits below the pot block, inside the near rim', (w, h, kind) => {
    const L = layout(w, h, kind)
    const rv = L.g.chip / 2 / L.g.aspect
    expect(L.heroBet[1] - rv).toBeGreaterThan(L.pot.box.v1)
    expect(L.heroBet[1] + rv).toBeLessThan(1)
  })
  it('a desktop bet lies toward the pot from the seat', () => {
    const L = layout(1440, 900, 'desk')
    for (const k of VILLAIN_SLOTS) {
      const from = L.g.seats[k].cards
      const to = L.g.pot
      const bet = L.bets[k]
      // moving from the seat to its bet goes the pot's way on both axes (or not at all)
      expect(Math.sign(bet[0] - from[0]) * Math.sign(to[0] - from[0])).toBeGreaterThanOrEqual(0)
      expect(Math.sign(bet[1] - from[1]) * Math.sign(to[1] - from[1])).toBeGreaterThanOrEqual(0)
      // and never onto the board
      const box = betBox(L.g, bet, L.g.seats[k].betSide, 0)
      const b = boardBox(L.g)
      expect(box.v1 < b.v0 || box.v0 > b.v1 || box.u1 < b.u0 || box.u0 > b.u1).toBe(true)
    }
  })
})

describe('placeSeats', () => {
  it('pushes the outer top labels clear of the centre one by 20 px', () => {
    const L = layout(1280, 720, 'desk')
    const p = placeSeats(L, { 2: { w: 220, h: 42 }, 3: { w: 220, h: 42 }, 4: { w: 220, h: 42 } })
    expect(p[3].x - 110 - (p[2].x + 110)).toBeGreaterThanOrEqual(19.9)
    expect(p[4].x - 110 - (p[3].x + 110)).toBeGreaterThanOrEqual(19.9)
  })
  it('caps a label rather than let it leave the viewport', () => {
    const L = layout(1024, 768, 'tablet')
    const p = placeSeats(L, { 2: { w: 400, h: 42 }, 3: { w: 200, h: 42 }, 4: { w: 400, h: 42 } })
    expect(p[2].maxWidth).not.toBeNull()
    expect(p[2].x - Math.min(400, p[2].maxWidth!) / 2).toBeGreaterThanOrEqual(15.9)
    expect(p[4].x + Math.min(400, p[4].maxWidth!) / 2).toBeLessThanOrEqual(1024 - 15.9)
  })
  it('on a phone: the flanks sit beside the hand, the top corners hug the edges', () => {
    const L = layout(390, 844, 'phone')
    const p = placeSeats(L, { 2: { w: 100, h: 36 }, 3: { w: 90, h: 36 }, 4: { w: 100, h: 36 } })
    expect(p[1]).toMatchObject({ x: 16, side: 'corner-left' })
    expect(p[5]).toMatchObject({ x: 390 - 16, side: 'corner-right' })
    expect(p[2].side).toBe('top-left')
    expect(p[1].y).toBeGreaterThan(L.heroTop)
    // the flanks are capped so they never run into the hero cards
    expect(16 + p[1].maxWidth!).toBeLessThanOrEqual(L.axis - L.hw * 1.05)
  })
  it('stays on the projected rim', () => {
    const L = layout(1440, 900, 'desk')
    const p = placeSeats(L, {})
    const rim = project(L, 0.5, 0, 0)
    expect(p[3].y).toBeCloseTo(rim[1] - 14)
  })
})

describe('potBlock', () => {
  it.each(SIZES)('%ix%i: street label, pot and "in bets" stack under the board, inside the slab', (w, h, kind) => {
    const L = layout(w, h, kind)
    const boardBottom = project(L, 0.5, boardBox(L.g).v1, 0)[1]
    expect(L.pot.streetY - 9).toBeGreaterThan(boardBottom)
    expect(L.pot.potY).toBeGreaterThan(L.pot.streetY + 18)
    expect(L.pot.betsY).toBeGreaterThan(L.pot.potY + 16)
    expect(L.pot.box.v1).toBeLessThan(1)
    expect(vAtY(L, project(L, 0.5, 0.7, 0)[1])).toBeCloseTo(0.7, 4)
  })
})

describe('glintAt', () => {
  it('sits on the near rim, under the light source', () => {
    const L = layout(1440, 900, 'desk')
    const gl = glintAt(L, 1440 * 0.62)
    expect(gl.u).toBeGreaterThan(0.5)
    expect(gl.v).toBeCloseTo(1 - rimV(gl.u))
    expect(gl.deg).toBeLessThan(0) // the rim turns up toward the right
  })
})

/** On-screen px from the nearest point of a box on the felt to the rim, measured along
 * the ray from the table's centre (inside the slab: v between rimV(u) and 1 - rimV(u)). */
function rimGapPx(L: TableLayout, b: BoxUV): number {
  const inside = (u: number, v: number) => u > 0 && u < 1 && v > rimV(u) && v < 1 - rimV(u)
  const gap = (u: number, v: number) => {
    let lo = 0
    let hi = 4
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2
      if (inside(0.5 + (u - 0.5) * m, 0.5 + (v - 0.5) * m)) lo = m
      else hi = m
    }
    const a = project(L, u, v, 0)
    const r = project(L, 0.5 + (u - 0.5) * lo, 0.5 + (v - 0.5) * lo, 0)
    return Math.sign(lo - 1) * Math.hypot(a[0] - r[0], a[1] - r[1])
  }
  const pts: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const u = b.u0 + (b.u1 - b.u0) * t
    const v = b.v0 + (b.v1 - b.v0) * t
    pts.push([u, b.v0], [u, b.v1], [b.u0, v], [b.u1, v])
  }
  return Math.min(...pts.map(([u, v]) => gap(u, v)))
}

describe('the backs', () => {
  it.each(SIZES)('%ix%i: every seat lays its pair inside the slab, the same distance from the rim', (w, h, kind) => {
    const L = layout(w, h, kind)
    const gaps = VILLAIN_SLOTS.map((k) => rimGapPx(L, backsBox(L.g, L.g.seats[k].cards)))
    expect(Math.min(...gaps)).toBeGreaterThan(4)
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.45)
  })
  it('are a pair square to the table, smaller than a board card', () => {
    for (const g of [GEO.desk, GEO.phone]) {
      expect(g.back).toBeLessThan(g.card * 0.55)
      const b = backsBox(g, [0.5, 0.5])
      // the second card sits a fixed share of a card over: the pair is 1 + offset wide
      expect(b.u1 - b.u0).toBeGreaterThan(g.back * 1.3)
      expect(b.u1 - b.u0).toBeLessThan(g.back * 1.5)
    }
  })
})

describe('slabSide', () => {
  it.each(SIZES)('%ix%i: the wall spans the object, from the near rim down by the thickness', (w, h, kind) => {
    const L = layout(w, h, kind)
    const side = slabSide(L, 8)
    expect(side.bands).toHaveLength(8)
    for (const d of side.bands) expect(d).toMatch(/^M[^Z]+Z$/)
    expect(side.edge.startsWith('M')).toBe(true)
    // the same extent as the projected object: its width, and its bottom is the wall's
    expect(side.box.w).toBeCloseTo(L.tableW, 0)
    expect(side.box.y + side.box.h).toBeCloseTo(L.objBottom, 0)
    // in the middle of the near rim the wall is the thickness seen at the tilt (its bottom
    // edge is farther from the camera, so a little smaller)
    const top = project(L, 0.5, 1, 0)[1]
    const bottom = project(L, 0.5, 1, -L.g.thick * L.s)[1]
    const seen = L.g.thick * L.s * Math.sin((L.g.tilt * Math.PI) / 180)
    expect(bottom - top).toBeGreaterThan(seen * 0.75)
    expect(bottom - top).toBeLessThan(seen * 1.1)
  })
  it('follows the outline the browser draws (a plain ellipse where corner-shape is missing)', () => {
    const L = layout(1440, 900, 'desk')
    const ellipse = slabSide(L, 4, 2)
    expect(ellipse.bands[0]).not.toBe(slabSide(L, 4).bands[0])
    // the ellipse is the slimmer outline: never wider than the superellipse's object
    expect(ellipse.box.w).toBeLessThanOrEqual(L.tableW + 0.5)
    expect(ellipse.box.w).toBeGreaterThan(L.tableW * 0.95)
  })
})
