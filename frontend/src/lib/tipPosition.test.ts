import { describe, expect, it } from 'vitest'
import { placeTip } from './tipPosition'

const vp = { width: 390, height: 844 }

describe('placeTip', () => {
  it('centres above the anchor', () => {
    expect(placeTip({ left: 100, top: 300, width: 40, height: 20 }, { width: 100, height: 30 }, vp)).toEqual({ left: 70, top: 262, placement: 'top' })
  })

  it('flips below when there is no room above', () => {
    expect(placeTip({ left: 100, top: 10, width: 40, height: 20 }, { width: 100, height: 30 }, vp).placement).toBe('bottom')
  })

  it('clamps inside the viewport', () => {
    expect(placeTip({ left: 370, top: 300, width: 16, height: 16 }, { width: 200, height: 30 }, vp).left).toBe(182)
    expect(placeTip({ left: 0, top: 300, width: 16, height: 16 }, { width: 200, height: 30 }, vp).left).toBe(8)
  })
})
