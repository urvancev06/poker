import { describe, expect, it } from 'vitest'
import { layoutKind, type LayoutKind } from './breakpoints'
import {
  GEO,
  BET_LABEL_PX,
  VILLAIN_SLOTS,
  backsBox,
  betBox,
  BACKS_OFFSET,
  airKept,
  betRects,
  betRoom,
  rectGap,
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
  type Outline,
  type TableLayout,
  type UV,
} from './tableLayout'
import { limbHeight } from './space'

const layout = (w: number, h: number, kind: LayoutKind, panelOpen = false, outline: Outline = 'superellipse') =>
  computeLayout({ w, h, kind, panelOpen, limb: limbHeight(h), topSeatH: kind === 'phone' ? 36 : kind === 'tablet' ? { desk: 43, phone: 36 } : 43, sideSeatW: 140, outline })

const OUTLINES: Outline[] = ['superellipse', 'rounded']

const SIZES: [number, number, LayoutKind][] = [
  [1440, 900, 'desk'],
  [1280, 720, 'desk'],
  [1920, 1080, 'desk'],
  [1024, 768, 'tablet'],
  // portrait tablets too small for the desk's geometry draw the phone's (TABLET_PHONE_GEO_S)
  [600, 960, 'tablet'],
  [640, 960, 'tablet'],
  [390, 844, 'phone'],
  [390, 664, 'phone'],
]

/** Small tables (s under about 0.5): portrait tablets, a laptop minus its browser chrome, a
 * desktop with a side panel open, the smallest phone. A bet may give up some of its air to
 * the backs there (AIR_STEPS), never its 4 px from another bet. (A 600-650 px wide tablet
 * would draw the desk's table at s about 0.21-0.25, its pot block past the near rim, so it
 * draws the phone's instead: SIZES.) */
const SMALL: [number, number, boolean][] = [
  [768, 1024, false],
  [820, 1180, false],
  [834, 1194, false],
  [744, 1133, false],
  [1366, 657, false],
  [1280, 720, true],
  [1280, 800, true],
  [1180, 820, true],
  [768, 1024, true],
  [820, 1180, true],
  [360, 640, false],
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
    const handBottom = L.heroTop + L.hw * 1.4 + (L.gk === 'phone' ? 52 : 64)
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
  it("draws a narrow portrait tablet's table with the phone's geometry, not a landscape phone's", () => {
    for (const [w, h] of [[600, 960], [640, 960], [647, 900]]) {
      const L = layout(w, h, 'tablet')
      expect(L.gk, `${w}x${h}`).toBe('phone')
      expect(L.s).toBeGreaterThan(0.45)
      // the chrome is still a tablet's
      expect(L).toMatchObject({ kind: 'tablet', barH: 64, dockH: 64, coachAt: 'row' })
    }
    for (const [w, h] of [[700, 900], [768, 1024], [1024, 768]]) expect(layout(w, h, 'tablet').gk, `${w}x${h}`).toBe('desk')
    // a landscape phone is too short for either geometry (the hand runs into the dock under
    // both): it keeps the desk's rather than trade one overlap for another
    for (const [w, h] of [[667, 375], [844, 390], [932, 430]]) expect(layout(w, h, 'tablet').gk, `${w}x${h}`).toBe('desk')
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
    const room = betRoom(L)
    for (const k of VILLAIN_SLOTS) {
      expect(airKept(L.g, L.bets[k], L.betSides[k], room), `seat ${k}`).toBe(1)
      expect(L.betKept[k], `seat ${k}`).toBe(1)
    }
  })
  it.each(SMALL)('%ix%i (panel %s): every bet finds a spot, and no two come within 4 px', (w, h, panelOpen) => {
    const L = layout(w, h, layoutKind(w), panelOpen)
    const room = betRoom(L)
    for (const k of VILLAIN_SLOTS) {
      expect(L.betKept[k], `seat ${k}`).toBeGreaterThan(0)
      expect(airKept(L.g, L.bets[k], L.betSides[k], room), `seat ${k}`).toBeGreaterThan(0)
    }
    const all = [betRects(L.g, L.heroBet, 'right', room), ...VILLAIN_SLOTS.map((k) => betRects(L.g, L.bets[k], L.betSides[k], room))]
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        for (const a of [all[i].chip, all[i].label]) for (const b of [all[j].chip, all[j].label]) expect(rectGap(a, b), `bets ${i} and ${j}`).toBeGreaterThanOrEqual(4)
  })
  it.each(SIZES)('%ix%i: no two bets (chip and label) touch', (w, h, kind) => {
    const L = layout(w, h, kind)
    const labelU = BET_LABEL_PX[L.gk] / (1000 * L.s)
    const boxes = [
      betBox(L.g, L.heroBet, 'right', labelU),
      ...VILLAIN_SLOTS.map((k) => betBox(L.g, L.bets[k], L.betSides[k], labelU)),
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
  it.each(BOTH)('%ix%i (%s, %s): on screen every chip, its whole stack, keeps 6 px from every seat\'s backs', (w, h, kind, outline) => {
    // projected here from the CSS, independently of the solver: a back pair is the cards
    // (BACKS_OFFSET over) plus the lit near edge; a chip is its base disc on the felt up to
    // its top disc (Stage.css .chip__top: translateZ(4.8px * s + 1.2px))
    const L = layout(w, h, kind, false, outline)
    const g = L.g
    const rect = (b: BoxUV, zs: number[]) => {
      const pts = zs.flatMap((z) => [project(L, b.u0, b.v0, z), project(L, b.u1, b.v0, z), project(L, b.u0, b.v1, z), project(L, b.u1, b.v1, z)])
      return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) }
    }
    // the distance between the nearest points
    const air = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => {
      const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1)
      const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1)
      return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy)
    }
    const backs = VILLAIN_SLOTS.map((k) => {
      const [u, v] = g.seats[k].cards
      const hu = (g.back * (1 + BACKS_OFFSET)) / 2
      const hv = (g.back * 1.4) / g.aspect / 2
      const r = rect({ u0: u - hu, u1: u + hu, v0: v - hv, v1: v + hv }, [0.6])
      return { ...r, y1: r.y1 + 0.5 + 0.5 * L.s }
    })
    for (const k of VILLAIN_SLOTS) {
      const [u, v] = L.bets[k]
      const ru = g.chip / 2
      const rv = g.chip / 2 / g.aspect
      const chip = rect({ u0: u - ru, u1: u + ru, v0: v - rv, v1: v + rv }, [0.6, 0.6 + 4.8 * L.s + 1.2])
      const foot = rect({ u0: u - ru, u1: u + ru, v0: v - rv, v1: v + rv }, [0.6])
      for (const [j, b] of backs.entries()) {
        expect(air(chip, b), `bet ${k} to the backs of seat ${j + 1}`).toBeGreaterThan(5.99)
        // its footprint (what a bounding box of the chip element measures) by 8
        expect(air(foot, b), `bet ${k} footprint to seat ${j + 1}`).toBeGreaterThan(7.99)
      }
    }
  })
  it.each(SIZES)('%ix%i: on screen no two bets (chip and label) come within 4 px', (w, h, kind) => {
    const L = layout(w, h, kind)
    const room = betRoom(L)
    const all = [betRects(L.g, L.heroBet, 'right', room), ...VILLAIN_SLOTS.map((k) => betRects(L.g, L.bets[k], L.betSides[k], room))]
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        for (const a of [all[i].chip, all[i].label]) for (const b of [all[j].chip, all[j].label]) expect(rectGap(a, b), `bets ${i} and ${j}`).toBeGreaterThanOrEqual(4)
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
      const box = betBox(L.g, bet, L.betSides[k], 0)
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

/** On-screen px from the nearest point of a box on the felt to the rim the layout's browser
 * draws, measured along the ray from the table's centre (inside the slab: v between
 * rimV(u) and 1 - rimV(u)). */
function rimGapPx(L: TableLayout, b: BoxUV): number {
  const inside = (u: number, v: number) => u > 0 && u < 1 && v > rimV(u, L.outline) && v < 1 - rimV(u, L.outline)
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

/** A seat's showdown pair as it lies (the second card --reveal of a card over: at most 0.6). */
const revealBox = (L: TableLayout, at: UV): BoxUV => {
  const hu = (L.g.rev * 1.6) / 2
  const hv = (L.g.rev * 1.4) / L.g.aspect / 2
  return { u0: at[0] - hu, u1: at[0] + hu, v0: at[1] - hv, v1: at[1] + hv }
}

const BOTH = SIZES.flatMap(([w, h, kind]) => OUTLINES.map((o) => [w, h, kind, o] as const))

describe('the backs', () => {
  it.each(BOTH)('%ix%i (%s, %s): every seat lays its pair inside the slab, the same distance from the rim', (w, h, kind, outline) => {
    const L = layout(w, h, kind, false, outline)
    const gaps = VILLAIN_SLOTS.map((k) => rimGapPx(L, backsBox(L.g, L.g.seats[k].cards)))
    expect(Math.min(...gaps)).toBeGreaterThan(4)
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.45)
  })
  it.each(BOTH)('%ix%i (%s, %s): every showdown pair turns up inside the slab, clear of the board', (w, h, kind, outline) => {
    const L = layout(w, h, kind, false, outline)
    const backs = Math.min(...VILLAIN_SLOTS.map((k) => rimGapPx(L, backsBox(L.g, L.g.seats[k].cards))))
    const board = boardBox(L.g)
    for (const k of VILLAIN_SLOTS) {
      const r = revealBox(L, L.g.seats[k].rev)
      // as far inside the rim as the backs are (within a few px), never kissing it
      expect(rimGapPx(L, r), `seat ${k}`).toBeGreaterThan(Math.max(3.5, backs * 0.6))
      const clear = r.v1 < board.v0 || r.v0 > board.v1 || r.u1 < board.u0 || r.u0 > board.u1
      expect(clear, `seat ${k} meets the board`).toBe(true)
    }
  })
  it('are a pair square to the table, smaller than a board card', () => {
    for (const g of [GEO.desk, GEO.phone]) {
      expect(g.back).toBeLessThan(g.card * 0.55)
      const b = backsBox(g, [0.5, 0.5])
      // the second card sits a fixed share of a card over: the pair is 1 + offset wide
      expect(b.u1 - b.u0).toBeGreaterThan(g.back * 1.3)
      expect(b.u1 - b.u0).toBeLessThan(g.back * 1.5 + 0.008)
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
  it('follows the outline the browser draws (a rounded rectangle where corner-shape is missing)', () => {
    const L = layout(1440, 900, 'desk', false, 'rounded')
    const rounded = slabSide(L, 4)
    expect(rounded.bands[0]).not.toBe(slabSide(L, 4, 'superellipse').bands[0])
    // the same object: as wide as the superellipse's, and as deep
    expect(rounded.box.w).toBeLessThanOrEqual(L.tableW + 0.5)
    expect(rounded.box.w).toBeGreaterThan(L.tableW * 0.97)
    expect(rounded.box.y + rounded.box.h).toBeCloseTo(L.objBottom, 0)
  })
  it('the rounded fallback keeps to the superellipse wherever a card lies', () => {
    // the far rim within 0.016 of the plan's height from a quarter of the way in (a plain
    // ellipse is 0.03 off at a top corner seat)
    for (let u = 0.2; u <= 0.5; u += 0.01) expect(Math.abs(rimV(u, 'rounded') - rimV(u))).toBeLessThan(0.016)
    expect(rimV(0.5, 'rounded')).toBe(0)
    expect(rimV(0, 'rounded')).toBeCloseTo(0.5)
  })
})
