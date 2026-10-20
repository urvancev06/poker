import { describe, expect, it } from 'vitest'
import { acrossStops, edgeLight, lightAcross, wallColor, wallFills, wallShade } from './slabLight'

const luma = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('the wall down its height', () => {
  it('runs from a soft highlight under the rim through a deeper belly to the brightest lower bevel', () => {
    const top = luma(wallColor(0))
    const belly = luma(wallColor(0.45))
    const bevel = luma(wallColor(1))
    expect(belly).toBeLessThan(top)
    expect(bevel).toBeGreaterThan(top)
    expect(luma(wallColor(0.97))).toBeGreaterThan(luma(wallColor(0.7)))
  })
  it('gives one fill per band, darkest in the middle', () => {
    const f = wallFills(14).map(luma)
    expect(f).toHaveLength(14)
    expect(Math.max(...f)).toBe(f[13])
    expect(Math.min(...f)).toBeLessThan(f[0])
  })
})

describe('the wall across its width', () => {
  it.each([0.36, 0.5, 0.62, 0.74])('light at %f: lit under the light, darker toward both ends, no hard edges', (lx) => {
    const shade = acrossStops(wallShade, lx)
    const at = (x: number) => wallShade(x, lx)
    expect(at(lx)).toBe(0)
    expect(at(0)).toBeGreaterThan(0.5)
    expect(at(1)).toBeGreaterThan(0.5)
    // smooth: the stops never share an offset (two stops at one offset are a hard edge),
    // and neighbours 5% apart never jump
    const edge = acrossStops(edgeLight, lx)
    for (const stops of [shade, edge])
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0])
        expect(Math.abs(stops[i][1] - stops[i - 1][1])).toBeLessThan(0.2)
      }
    expect(Math.min(...edge.map((s) => s[1]))).toBeGreaterThan(0.15)
  })
  it('keeps the light on the wall', () => {
    expect(lightAcross(-200, 100, 800)).toBe(0.36)
    expect(lightAcross(5000, 100, 800)).toBe(0.74)
    expect(lightAcross(500, 100, 800)).toBe(0.5)
  })
})
