import { describe, expect, it } from 'vitest'
import { createAvoidStore } from './spaceAvoid'

describe('avoid store', () => {
  it('unions owners and only notifies on a real change', () => {
    const s = createAvoidStore()
    let calls = 0
    s.subscribe(() => calls++)
    s.set('table', [{ x: 0, y: 0, w: 10, h: 10 }])
    s.set('table', [{ x: 0.2, y: 0, w: 10, h: 10 }]) // same after rounding
    expect(calls).toBe(1)
    s.set('stats', [{ x: 5, y: 5, w: 1, h: 1 }])
    expect(s.get()).toHaveLength(2)
    s.clear('table')
    expect(s.get()).toEqual([{ x: 5, y: 5, w: 1, h: 1 }])
    s.set('stats', [])
    expect(s.get()).toEqual([])
    expect(calls).toBe(4)
  })
})
