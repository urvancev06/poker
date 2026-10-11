import { describe, expect, it } from 'vitest'
import { layoutKind } from './breakpoints'

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
  it('matches --bar-h', async () => {
    const { barHeight } = await import('./breakpoints')
    expect(barHeight(390)).toBe(56)
    expect(barHeight(1440)).toBe(64)
  })
})
