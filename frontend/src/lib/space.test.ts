import { describe, expect, it } from 'vitest'
import {
  BRIGHT_STARS,
  FAR_STARS,
  FIELD_H,
  NEAR_STARS,
  holeMask,
  limbHeight,
  limbSag,
  limbTop,
  mulberry32,
  normaliseRects,
  rectsFromKey,
  rectsKey,
  sunPlacement,
} from './space'

describe('starfield', () => {
  it('is deterministic', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 20; i++) expect(a()).toBe(b())
    expect(FAR_STARS[0]).toEqual(FAR_STARS[0])
  })

  it('has the prototype counts and stays sparse', () => {
    expect(FAR_STARS).toHaveLength(260)
    expect(NEAR_STARS).toHaveLength(70)
    expect(BRIGHT_STARS).toHaveLength(5)
    for (const s of [...FAR_STARS, ...NEAR_STARS]) {
      expect(s.r).toBeGreaterThan(0.3)
      expect(s.r).toBeLessThanOrEqual(1.15)
      expect(s.opacity).toBeLessThanOrEqual(0.85)
    }
  })

  it('thins stars out towards the limb', () => {
    const low = NEAR_STARS.filter((s) => s.cy > FIELD_H - 80)
    for (const s of low) expect(s.opacity).toBeLessThan(0.35)
  })

  it('keeps bright stars well above the limb', () => {
    for (const s of BRIGHT_STARS) expect(s.cy).toBeLessThan(FIELD_H - 440)
  })
})

describe('horizon', () => {
  it('clamps the limb between 34 and 60 px', () => {
    expect(limbHeight(500)).toBe(34)
    expect(limbHeight(900)).toBe(50)
    expect(limbHeight(1400)).toBe(60)
  })

  it('crests at the centre and drops towards the edges', () => {
    expect(limbSag(720, 1440, 900)).toBe(0)
    expect(limbTop(720, 1440, 900)).toBe(850)
    expect(limbTop(0, 1440, 900)).toBeGreaterThan(limbTop(360, 1440, 900))
  })

  it('places the sun on the limb at 62% (72% when narrow)', () => {
    const desk = sunPlacement(1440, 900)
    expect(desk.left).toBeCloseTo(892.8, 1)
    expect(desk.limb).toBe(50)
    // a little below the crest, because the limb curves away
    expect(desk.bottom).toBeLessThan(50)
    expect(desk.bottom).toBeGreaterThan(40)
    expect(sunPlacement(390, 844).left).toBeCloseTo(280.8, 1)
  })
})

describe('holeMask', () => {
  it('is just the top fade with no rects', () => {
    const m = holeMask([])
    expect(m.maskImage).toBe('linear-gradient(rgba(0, 0, 0, 0.2) 0 58px, #000 120px)')
    expect(m.maskComposite).toBe('add')
  })

  it('cuts one padded hole per rect, the base subtracting the union of holes', () => {
    const m = holeMask([{ x: 100, y: 200, w: 50, h: 20 }, { x: 10, y: 10, w: 5, h: 5 }], { pad: 4 })
    expect(m.maskImage.split('linear-gradient').length - 1).toBe(3)
    expect(m.maskSize).toBe('100% 100%, 58px 28px, 13px 13px')
    expect(m.maskPosition).toBe('0 0, 96px 196px, 6px 6px')
    expect(m.maskComposite).toBe('subtract, add, add')
  })

  it('leaves a whisper with keep', () => {
    const m = holeMask([{ x: 0, y: 0, w: 1, h: 1 }], { keep: 0.3, topFade: null })
    expect(m.maskImage).toContain('rgba(0, 0, 0, 0.7)')
    expect(m.maskImage.startsWith('linear-gradient(#000, #000)')).toBe(true)
  })
})

describe('normaliseRects', () => {
  it('drops empty rects, rounds the rest and keys them stably', () => {
    const r = normaliseRects([{ x: 1.4, y: 2.6, w: 10.2, h: 0 }, null, { x: 1.4, y: 2.6, w: 10.2, h: 5.5 }])
    expect(r).toEqual([{ x: 1, y: 3, w: 10, h: 6 }])
    expect(rectsKey(r)).toBe('1,3,10,6')
    expect(rectsFromKey(rectsKey(r))).toEqual(r)
    expect(rectsFromKey('')).toEqual([])
  })
})
