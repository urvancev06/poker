import { describe, expect, it } from 'vitest'
import { advancePath } from './apiPaths'

describe('advancePath', () => {
  it('asks the server to warm the flop matrix only while the coach is on (D18)', () => {
    expect(advancePath('abc', true)).toBe('/session/abc/advance?warm_coach=true')
    expect(advancePath('abc', false)).toBe('/session/abc/advance')
  })
  it('escapes the session id', () => {
    expect(advancePath('a/b', false)).toBe('/session/a%2Fb/advance')
  })
})
