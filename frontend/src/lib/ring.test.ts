import { describe, expect, it } from 'vitest'
import { RING, arcPoint, clampPct, dash, fillGradient, normalizeTone, notch, rawDot, ringVariant } from './ring'

describe('normalizeTone', () => {
  it('keeps the four backend tones and makes anything else neutral', () => {
    expect(normalizeTone('good')).toBe('good')
    expect(normalizeTone('fold')).toBe('fold')
    expect(normalizeTone('close')).toBe('close')
    expect(normalizeTone('bad')).toBe('neutral')
    expect(normalizeTone(undefined)).toBe('neutral')
  })
})

describe('ring geometry', () => {
  it('starts at twelve o’clock and runs clockwise', () => {
    expect(arcPoint(0, 50)).toEqual([60, 10])
    expect(arcPoint(25, 50)).toEqual([110, 60])
    expect(arcPoint(50, 50)).toEqual([60, 110])
  })

  it('clamps percentages', () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(140)).toBe(100)
    expect(clampPct(Number.NaN)).toBe(0)
    expect(dash(39.04)).toBe('39.04 100')
  })

  it('picks thicker strokes for small rings', () => {
    expect(ringVariant(52)).toBe('sm')
    expect(ringVariant(112)).toBe('lg')
  })

  it('draws the notch across both rings', () => {
    const { halo, line } = notch(25, 'lg')
    expect(halo).toEqual({ x1: 89, y1: 60, x2: 119.5, y2: 60 })
    expect(line.x1).toBeGreaterThan(halo.x1)
    expect(line.x2).toBeLessThan(halo.x2)
  })

  it('hides the raw dot when raw and realized agree within a point', () => {
    expect(rawDot(39, 39.5, 'lg')).toBeNull()
    expect(rawDot(39, null, 'lg')).toBeNull()
    expect(rawDot(39, 41, 'lg')).not.toBeNull()
  })

  it('keeps the raw dot clear of the notch even at the same angle', () => {
    for (const v of ['lg', 'sm'] as const) {
      const dot = rawDot(30, 22, v)!
      const tip = notch(22, v).halo
      const dist = Math.hypot(dot.cx - tip.x2, dot.cy - tip.y2)
      // the gap between the halo's tip and the dot's edge is at least 3 units
      expect(dist - dot.r).toBeGreaterThanOrEqual(3)
      // and the dot sits outside the outer track
      const fromCentre = Math.hypot(dot.cx - RING.c, dot.cy - RING.c)
      expect(fromCentre - dot.r).toBeGreaterThan(RING.outer + RING[v].outerW / 2)
    }
  })

  it('aims the fill gradient at the tip of the arc', () => {
    expect(fillGradient(25)).toEqual({ x1: 110, y1: 60, x2: 60, y2: 110 })
  })
})
