import { describe, expect, it } from 'vitest'
import { bb, bbSpeech, bigBlindOf, count, LEGACY_BIG_BLIND, parseBB, pct, signed } from './format'

describe('format', () => {
  it('signed decimals', () => {
    expect(signed(8)).toBe('+8.0')
    expect(signed(-1)).toBe('−1.0')
    expect(signed(-0.04)).toBe('0.0')
    expect(signed(-979.9, 1)).toBe('−979.9')
  })

  it('percentages, with a dash for no sample', () => {
    expect(pct(39.04)).toBe('39%')
    expect(pct(22.2, 1)).toBe('22.2%')
    expect(pct(null)).toBe('—')
  })

  it('counts are whole numbers with separators', () => {
    expect(count(2766)).toBe('2,766')
    expect(count(3)).toBe('3')
  })
})

describe('bb', () => {
  it('shows big blinds with at most one decimal and no trailing .0', () => {
    expect(bb(25, 10)).toBe('2.5')
    expect(bb(1000, 10)).toBe('100')
    expect(bb(1005, 10)).toBe('100.5')
    expect(bb(12345, 10)).toBe('1,234.5')
    expect(bb(3, 2)).toBe('1.5')
    expect(bb(7, 2)).toBe('3.5')
    expect(bb(0, 10)).toBe('0')
  })

  it('adds a quiet unit when asked', () => {
    expect(bb(25, 10, { unit: true })).toBe('2.5 bb')
    expect(bb(10, 10, { unit: true })).toBe('1 bb')
  })

  it('signs results with a true minus and no sign on zero', () => {
    expect(bb(-191, 2, { sign: true })).toBe('−95.5')
    expect(bb(15, 10, { sign: true })).toBe('+1.5')
    expect(bb(0, 10, { sign: true })).toBe('0')
    expect(bb(-20, 10, { sign: true, unit: true })).toBe('−2 bb')
    expect(bb(-191, 2)).toBe('−95.5')
  })

  it('one decimal is exact at both blind levels', () => {
    for (const b of [2, 10]) for (let c = 0; c <= 5000; c++) expect(Math.round(Number(bb(c, b).replace(/,/g, '')) * b)).toBe(c)
  })

  it('rounds a level that one decimal cannot show exactly', () => {
    expect(bb(1, 3)).toBe('0.3')
    expect(bb(5, 3)).toBe('1.7')
  })

  it('never divides by a missing or bad big blind', () => {
    expect(bb(25, 0)).toBe('12.5')
    expect(bb(25, Number.NaN)).toBe('12.5')
  })

  it('speaks big blinds in words', () => {
    expect(bbSpeech(25, 10)).toBe('2.5 big blinds')
    expect(bbSpeech(10, 10)).toBe('1 big blind')
    expect(bbSpeech(1000, 10)).toBe('100 big blinds')
    expect(bbSpeech(-20, 10)).toBe('minus 2 big blinds')
  })
})

describe('bigBlindOf', () => {
  it('reads blinds or big_blind, else the legacy 1/2', () => {
    expect(bigBlindOf({ blinds: [5, 10] })).toBe(10)
    expect(bigBlindOf({ big_blind: 10 })).toBe(10)
    expect(bigBlindOf({})).toBe(2)
    expect(bigBlindOf(null)).toBe(2)
    expect(bigBlindOf(undefined)).toBe(LEGACY_BIG_BLIND)
    expect(bigBlindOf({ blinds: [0, 0] })).toBe(2)
  })
})

describe('parseBB (Review Focus 4)', () => {
  it('reads decimals with a point or a comma', () => {
    expect(parseBB('7.5', 10, 20, 1000)).toBe(75)
    expect(parseBB('7,5', 10, 20, 1000)).toBe(75)
    expect(parseBB('7,55', 10, 20, 1000)).toBe(76)
  })

  it('accepts a bb suffix and spaces', () => {
    expect(parseBB(' 75bb ', 10, 20, 1000)).toBe(750)
    expect(parseBB('12 BB', 10, 20, 1000)).toBe(120)
  })

  it('treats any other comma as a thousands separator', () => {
    expect(parseBB('1,000', 10, 20, 20000)).toBe(10000)
    expect(parseBB('1,000', 10, 20, 2000)).toBe(2000)
  })

  it('rounds to the nearest chip and clamps to the legal range', () => {
    expect(parseBB('0.04', 10, 20, 1000)).toBe(20)
    expect(parseBB('7.55', 10, 20, 1000)).toBe(76)
    expect(parseBB('500', 10, 20, 1000)).toBe(1000)
    expect(parseBB('3.25', 2, 4, 200)).toBe(7)
  })

  it('returns null for empty or digit-free input', () => {
    expect(parseBB('', 10, 20, 1000)).toBeNull()
    expect(parseBB('   ', 10, 20, 1000)).toBeNull()
    expect(parseBB('abc', 10, 20, 1000)).toBeNull()
    expect(parseBB('bb', 10, 20, 1000)).toBeNull()
    expect(parseBB('1.2.3', 10, 20, 1000)).toBeNull()
  })
})
