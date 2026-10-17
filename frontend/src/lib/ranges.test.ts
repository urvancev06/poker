import { describe, expect, it } from 'vitest'
import { GRID, RANKS, TOTAL_COMBOS, cellAt, comboCount, parseRange, widthPct } from './ranges'

const sorted = (s: ReadonlySet<string>) => [...s].sort()

describe('the 13 x 13 grid', () => {
  it('has 169 classes adding up to 1,326 combos', () => {
    expect(GRID).toHaveLength(169)
    expect(new Set(GRID.map((c) => c.hand)).size).toBe(169)
    expect(GRID.reduce((n, c) => n + c.combos, 0)).toBe(TOTAL_COMBOS)
  })

  it('puts pairs on the diagonal, suited above it and offsuit below, higher rank first', () => {
    expect(cellAt(0, 0)).toMatchObject({ hand: 'AA', kind: 'pair', combos: 6 })
    expect(cellAt(0, 1)).toMatchObject({ hand: 'AKs', kind: 'suited', combos: 4 })
    expect(cellAt(1, 0)).toMatchObject({ hand: 'AKo', kind: 'offsuit', combos: 12 })
    expect(cellAt(12, 12).hand).toBe('22')
    expect(cellAt(4, 12).hand).toBe('T2s')
    expect(cellAt(12, 4).hand).toBe('T2o')
    expect(RANKS).toBe('AKQJT98765432')
  })
})

describe('parseRange (mirrors backend/poker/math/ranges.py)', () => {
  it('pairs: single, plus, dash', () => {
    expect(sorted(parseRange('TT'))).toEqual(['TT'])
    expect(sorted(parseRange('QQ+'))).toEqual(['AA', 'KK', 'QQ'])
    expect(sorted(parseRange('99-66'))).toEqual(['66', '77', '88', '99'])
    expect(parseRange('22+').size).toBe(13)
  })

  it('"+" fixes the high card and raises the kicker to one below it', () => {
    expect(sorted(parseRange('ATs+'))).toEqual(['AJs', 'AKs', 'AQs', 'ATs'])
    expect(sorted(parseRange('KTo+'))).toEqual(['KJo', 'KQo', 'KTo'])
    expect(sorted(parseRange('T8s+'))).toEqual(['T8s', 'T9s'])
  })

  it('dash ranges walk the kicker, typographic dashes included', () => {
    expect(sorted(parseRange('A5s-A2s'))).toEqual(['A2s', 'A3s', 'A4s', 'A5s'])
    expect(sorted(parseRange('A5s–A2s'))).toEqual(['A2s', 'A3s', 'A4s', 'A5s'])
    expect(sorted(parseRange('JJ—TT'))).toEqual(['JJ', 'TT'])
  })

  it('a bare class means both suited and offsuit; order and case do not matter', () => {
    expect(sorted(parseRange('AK'))).toEqual(['AKo', 'AKs'])
    expect(sorted(parseRange('ka'))).toEqual(['AKo', 'AKs'])
    expect(sorted(parseRange('kAs'))).toEqual(['AKs'])
  })

  it('duplicates count once', () => {
    expect(comboCount(parseRange('AKs, AKs, AK'))).toBe(16)
  })

  it('refuses what it cannot draw', () => {
    expect(() => parseRange('AhKs')).toThrow(RangeError)
    expect(() => parseRange('AXs')).toThrow(RangeError)
    expect(() => parseRange('AKs-QJs')).toThrow(RangeError)
    expect(() => parseRange('No RFI here')).toThrow(RangeError)
  })
})

describe('combos and width', () => {
  it('counts combos by class', () => {
    expect(comboCount(parseRange('AA'))).toBe(6)
    expect(comboCount(parseRange('AKs'))).toBe(4)
    expect(comboCount(parseRange('AKo'))).toBe(12)
    expect(comboCount(parseRange('22+'))).toBe(78)
  })

  it('width is the share of 1,326, one decimal', () => {
    expect(widthPct(182)).toBe(13.7)
    expect(widthPct(538)).toBe(40.6)
    expect(widthPct(0)).toBe(0)
    expect(widthPct(TOTAL_COMBOS)).toBe(100)
  })
})
