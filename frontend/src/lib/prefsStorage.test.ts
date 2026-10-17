import { describe, expect, it } from 'vitest'
import { canPersist } from './prefsStorage'

function store(fail?: 'set' | 'remove') {
  const data = new Map<string, string>()
  return {
    data,
    setItem(k: string, v: string) {
      if (fail === 'set') throw new DOMException('quota', 'QuotaExceededError')
      data.set(k, v)
    },
    removeItem(k: string) {
      if (fail === 'remove') throw new Error('blocked')
      data.delete(k)
    },
  }
}

describe('canPersist', () => {
  it('is true when storage takes a write and leaves nothing behind', () => {
    const s = store()
    expect(canPersist(s)).toBe(true)
    expect(s.data.size).toBe(0)
  })

  it('is false when storage throws or is missing', () => {
    expect(canPersist(store('set'))).toBe(false)
    expect(canPersist(store('remove'))).toBe(false)
    expect(canPersist(null)).toBe(false)
    expect(canPersist(undefined)).toBe(false)
  })
})
