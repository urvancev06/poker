import { describe, expect, it } from 'vitest'
import { SHEET_MEDIUM_MIN, sheetHeights } from './sheetHeights'

describe('sheetHeights', () => {
  it('medium is about 56% of the screen, large reaches up to the top bar', () => {
    // 390 x 844, ending 132 px above the bottom (8 px above the dock)
    expect(sheetHeights(844, 56, 132)).toEqual({ medium: 473, large: 648 })
  })

  it('with mediumTop the medium detent stops under the hero’s cards (D5)', () => {
    // the lifted cards end at y 511: the sheet's top sits 8 px under them
    const h = sheetHeights(844, 56, 132, 519)
    expect(h.medium).toBe(193)
    expect(844 - 132 - h.medium).toBe(519)
    expect(h.large).toBe(648) // dragging up still opens the large detent
  })

  it('never gets shorter than the minimum, nor taller than without mediumTop', () => {
    // 390 x 664: only 136 px are left under the cards
    expect(sheetHeights(664, 56, 123, 405).medium).toBe(SHEET_MEDIUM_MIN)
    expect(sheetHeights(844, 56, 132, 100).medium).toBe(473)
  })
})
