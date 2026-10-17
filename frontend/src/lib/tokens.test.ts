import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { EASE } from './motion'
import { BP, barHeight } from './breakpoints'

// Read from disk: Vitest hands CSS imports (even ?raw) to its CSS pipeline, which empties them.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

function token(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`missing ${name}`)
  return m[1].trim()
}

describe('CSS and JS tokens agree', () => {
  it('springs', () => {
    expect(token('--ease-spring')).toBe(EASE.spring)
    expect(token('--ease-bouncy')).toBe(EASE.bouncy)
    expect(token('--ease-grow')).toBe(EASE.grow)
  })

  it('springs settle at exactly 1 and the bouncy one overshoots by about 4.6%', () => {
    const peak = (s: string) => Math.max(...s.slice(7, -1).split(',').map(Number))
    for (const s of Object.values(EASE)) expect(s.endsWith(', 1)')).toBe(true)
    expect(peak(EASE.spring)).toBe(1)
    expect(peak(EASE.bouncy)).toBeCloseTo(1.046, 3)
  })

  it('the top bar height (--bar-h, and its phone value) is barHeight()', () => {
    expect(token('--bar-h')).toBe(`${barHeight(BP.sm)}px`)
    const phone = css.match(/@media \(max-width: ([\d.]+)px\) \{\s*:root \{\s*--bar-h:\s*([^;]+);/)
    expect(phone).not.toBeNull()
    const [, below, h] = phone!
    expect(Number(below)).toBeLessThan(BP.sm)
    expect(Number(below)).toBeGreaterThan(BP.sm - 1)
    expect(h.trim()).toBe(`${barHeight(BP.sm - 1)}px`)
  })

  it('breakpoints', () => {
    expect(token('--bp-sm')).toBe(`${BP.sm}px`)
    expect(token('--bp-lg')).toBe(`${BP.lg}px`)
    expect(token('--breakpoint-sm')).toBe(`${BP.sm}px`)
    expect(token('--breakpoint-lg')).toBe(`${BP.lg}px`)
  })
})
