import { describe, expect, it } from 'vitest'
import { commandForKey, targetKind } from './tableHotkeys'

const key = (k: string, extra: object = {}) => ({ key: k, ...extra })

describe('commandForKey', () => {
  it('maps the decision keys on the actions face', () => {
    expect(commandForKey(key('f'), 'other', 'actions')).toEqual({ type: 'fold' })
    expect(commandForKey(key('C'), 'other', 'actions')).toEqual({ type: 'checkCall' })
    expect(commandForKey(key('r'), 'button', 'actions')).toEqual({ type: 'aggro' })
    expect(commandForKey(key('3'), 'other', 'actions')).toEqual({ type: 'preset', index: 2 })
  })
  it('Enter confirms the size, but a focused button keeps its own Enter', () => {
    expect(commandForKey(key('Enter'), 'other', 'sizing')).toEqual({ type: 'confirm' })
    expect(commandForKey(key('Enter'), 'button', 'sizing')).toBeNull()
    expect(commandForKey(key('Enter'), 'other', 'actions')).toBeNull()
  })
  it('Space deals the next hand from the result face only', () => {
    expect(commandForKey(key(' '), 'other', 'result')).toEqual({ type: 'next' })
    expect(commandForKey(key(' '), 'button', 'result')).toBeNull()
    expect(commandForKey(key(' '), 'other', 'actions')).toBeNull()
    expect(commandForKey(key('f'), 'other', 'result')).toBeNull()
  })
  it('never fires while typing, with a modifier, on repeat, or off the decision', () => {
    expect(commandForKey(key('f'), 'text', 'actions')).toBeNull()
    expect(commandForKey(key('f', { metaKey: true }), 'other', 'actions')).toBeNull()
    expect(commandForKey(key('c', { ctrlKey: true }), 'other', 'actions')).toBeNull()
    expect(commandForKey(key('c', { repeat: true }), 'other', 'actions')).toBeNull()
    expect(commandForKey(key('c', { defaultPrevented: true }), 'other', 'actions')).toBeNull()
    expect(commandForKey(key('c'), 'other', 'other')).toBeNull()
    expect(commandForKey(key('6'), 'other', 'sizing')).toBeNull()
    expect(commandForKey(key('l'), 'other', 'actions')).toBeNull()
  })
})

describe('targetKind', () => {
  // a stand-in for an element: closest(selector) answers for the selectors it matches
  const el = (matches: Record<string, unknown>) => ({
    closest: (sel: string) => {
      for (const [k, v] of Object.entries(matches)) if (sel.includes(k)) return v
      return null
    },
  })
  it('a text input is typing; a range slider is not', () => {
    expect(targetKind(el({ input: { getAttribute: () => 'text' } }) as unknown as EventTarget)).toBe('text')
    expect(targetKind(el({ input: { getAttribute: () => null } }) as unknown as EventTarget)).toBe('text')
    expect(targetKind(el({ input: { getAttribute: () => 'range' } }) as unknown as EventTarget)).toBe('other')
    expect(targetKind(el({ textarea: {} }) as unknown as EventTarget)).toBe('text')
  })
  it('buttons, and anything else', () => {
    expect(targetKind(el({ button: {} }) as unknown as EventTarget)).toBe('button')
    expect(targetKind(el({}) as unknown as EventTarget)).toBe('other')
    expect(targetKind(null)).toBe('other')
  })
})
