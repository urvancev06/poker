import { describe, expect, it } from 'vitest'
import { createEscapeStack } from './escapeStack'

describe('escape stack', () => {
  it('closes only the top-most layer, newest first', () => {
    const s = createEscapeStack()
    const closed: string[] = []
    const popSheet = s.push(() => closed.push('sheet'))
    s.push(() => closed.push('tooltip'))
    expect(s.escape()).toBe(true)
    expect(closed).toEqual(['tooltip'])
    // the tooltip's handler is still registered until it unregisters itself
    popSheet()
    s.escape()
    expect(closed).toEqual(['tooltip', 'tooltip'])
  })

  it('removes a layer from the middle without disturbing the others', () => {
    const s = createEscapeStack()
    const closed: string[] = []
    s.push(() => closed.push('a'))
    const popB = s.push(() => closed.push('b'))
    s.push(() => closed.push('c'))
    popB()
    popB()
    expect(s.size).toBe(2)
    s.escape()
    expect(closed).toEqual(['c'])
  })

  it('does nothing when empty', () => {
    expect(createEscapeStack().escape()).toBe(false)
  })
})
