import { describe, expect, it } from 'vitest'
import { activeSection, isAtBottom } from './studyNav'

describe('activeSection', () => {
  const tops = [120, 900, 1700, 2400]

  it('is the last section whose top has passed the reading line', () => {
    expect(activeSection(tops, 200, false)).toBe(0)
    expect(activeSection(tops, 900, false)).toBe(1)
    expect(activeSection(tops, 1699, false)).toBe(1)
    expect(activeSection([-800, -20, 300, 1200], 200, false)).toBe(1)
  })

  it('is the first before the page reaches it, and the last at the bottom', () => {
    expect(activeSection(tops, 50, false)).toBe(0)
    expect(activeSection([-3000, -2000, -900, 400], 200, true)).toBe(3)
  })

  it('has nothing to point at without sections', () => {
    expect(activeSection([], 200, false)).toBe(-1)
  })
})

describe('isAtBottom', () => {
  it('allows a pixel of rounding', () => {
    expect(isAtBottom(1100, 900, 2000)).toBe(true)
    expect(isAtBottom(1099.4, 900, 2000)).toBe(true)
    expect(isAtBottom(1000, 900, 2000)).toBe(false)
  })
})
