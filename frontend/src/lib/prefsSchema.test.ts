import { describe, expect, it } from 'vitest'
import { DEFAULT_ENGINE, STORAGE_KEYS, normalizeEngine } from './prefsSchema'

describe('normalizeEngine', () => {
  it('keeps a known engine and falls back to the current bots otherwise', () => {
    expect(normalizeEngine('v2')).toBe('v2')
    expect(normalizeEngine('v1')).toBe('v1')
    expect(normalizeEngine('x')).toBe('v1')
    expect(normalizeEngine(null)).toBe('v1')
    expect(DEFAULT_ENGINE).toBe('v1')
    expect(STORAGE_KEYS.engine).toBe('poker-engine')
  })
})
