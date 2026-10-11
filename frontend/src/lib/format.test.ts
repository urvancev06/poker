import { describe, expect, it } from 'vitest'
import { chips, pct, signed, signedChips } from './format'

describe('format', () => {
  it('chips are integers with thousands separators', () => {
    expect(chips(1168)).toBe('1,168')
    expect(chips(26)).toBe('26')
    expect(chips(-191)).toBe('−191')
    expect(chips(0)).toBe('0')
  })

  it('signed chips', () => {
    expect(signedChips(14)).toBe('+14')
    expect(signedChips(-191)).toBe('−191')
    expect(signedChips(0)).toBe('0')
    expect(signedChips(1200)).toBe('+1,200')
  })

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
})
