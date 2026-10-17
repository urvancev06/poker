import { describe, expect, it } from 'vitest'
import { barHeight, layoutKind } from './breakpoints'

describe('layoutKind', () => {
  it('splits at 600 and 1100', () => {
    expect(layoutKind(390)).toBe('phone')
    expect(layoutKind(599)).toBe('phone')
    expect(layoutKind(600)).toBe('tablet')
    expect(layoutKind(1024)).toBe('tablet')
    expect(layoutKind(1099)).toBe('tablet')
    expect(layoutKind(1100)).toBe('desk')
    expect(layoutKind(1440)).toBe('desk')
  })
})

describe('barHeight', () => {
  // tokens.test.ts checks it against --bar-h in index.css
  it('is 56 px on a phone and 64 px from 600 px', () => {
    expect(barHeight(390)).toBe(56)
    expect(barHeight(599)).toBe(56)
    expect(barHeight(600)).toBe(64)
    expect(barHeight(1440)).toBe(64)
  })
})
