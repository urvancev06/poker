import { describe, expect, it } from 'vitest'
import type { LegalActions } from '../api'
import { aggroLabel, aggroType, aggroVerb, amountFill, dockActions, parseAmount, presetAmount, presetIndexFor, presetTicks, submitOf } from './sizing'

// spot_implied_draw: facing a 26 bet into 61, 52..185
const FACING: LegalActions = { can_fold: true, can_check: false, can_call: true, call_amount: 26, can_bet: false, can_raise: true, min_raise_to: 52, max_raise_to: 185 }
// fold_when_check: the engine says can_fold with a free check (B1)
const FREE: LegalActions = { can_fold: true, can_check: true, can_call: false, call_amount: 0, can_bet: true, can_raise: false, min_raise_to: 2, max_raise_to: 182 }
// spot_facing_allin: no aggression legal
const ALLIN: LegalActions = { can_fold: true, can_check: false, can_call: true, call_amount: 67, can_bet: false, can_raise: false, min_raise_to: null, max_raise_to: null }

describe('dockActions', () => {
  it('B1: never Fold beside a free check', () => {
    expect(dockActions(FREE, 'turn').map((a) => a.kind)).toEqual(['check', 'size'])
  })
  it('facing a bet: Fold, Call N, Raise', () => {
    expect(dockActions(FACING, 'flop')).toEqual([{ kind: 'fold' }, { kind: 'call', amount: 26 }, { kind: 'size', verb: 'Raise' }])
  })
  it('no sizing when no aggression is legal', () => {
    expect(dockActions(ALLIN, 'river').map((a) => a.kind)).toEqual(['fold', 'call'])
  })
  it('a collapsed range is one all-in button', () => {
    const short = { ...FACING, min_raise_to: 115, max_raise_to: 115 }
    expect(dockActions(short, 'flop')[2]).toEqual({ kind: 'allin', type: 'raise', amount: 115 })
    expect(submitOf({ kind: 'allin', type: 'raise', amount: 115 })).toEqual({ type: 'raise', toAmount: 115 })
  })
  it('nothing without legal actions', () => {
    expect(dockActions(null, 'flop')).toEqual([])
  })
})

describe('B26: the big blind option over limps reads Raise', () => {
  const option: LegalActions = { ...FREE, min_raise_to: 4, max_raise_to: 200 }
  it('preflop "bet" is labelled a raise, but submits what the engine asked for', () => {
    expect(aggroVerb(option, 'preflop')).toBe('Raise')
    expect(aggroLabel(option, 'preflop', 8)).toBe('Raise to 8')
    expect(aggroType(option)).toBe('bet')
  })
  it('postflop with nothing to call is a bet', () => {
    expect(aggroVerb(FREE, 'turn')).toBe('Bet')
    expect(aggroLabel(FREE, 'turn', 52)).toBe('Bet 52')
    expect(aggroLabel(FACING, 'flop', 1168)).toBe('Raise to 1,168')
  })
})

describe('presets: the pot-raise formula', () => {
  it('sizes from the level plus a fraction of pot + call', () => {
    // level 26, pot + call = 87
    expect(presetAmount(FACING, 61, 0, 1 / 3)).toBe(55)
    expect(presetAmount(FACING, 61, 0, 0.5)).toBe(70)
    expect(presetAmount(FACING, 61, 0, 0.75)).toBe(91)
    expect(presetAmount(FACING, 61, 0, 1)).toBe(113)
    expect(presetAmount(FACING, 61, 0, 'max')).toBe(185)
  })
  it('reduces to f x pot with nothing to call, and clamps to the range', () => {
    expect(presetAmount(FREE, 30, 0, 0.5)).toBe(15)
    expect(presetAmount(FREE, 3, 0, 1 / 3)).toBe(2) // under the min
    expect(presetAmount({ ...FACING, max_raise_to: 60 }, 61, 0, 1)).toBe(60) // over the max
  })
  it('counts the hero bet already in', () => {
    // hero has 10 in, faces 30 total: call 20, level 30
    const la = { ...FACING, call_amount: 20, min_raise_to: 50, max_raise_to: 300 }
    expect(presetAmount(la, 100, 10, 1)).toBe(30 + 120)
  })
  it('ticks and matching', () => {
    const ticks = presetTicks(FACING, 61, 0)
    expect(ticks).toHaveLength(4)
    expect(ticks[0]).toBeCloseTo(((55 - 52) / 133) * 100)
    expect(presetIndexFor(FACING, 61, 0, 113)).toBe(3)
    expect(presetIndexFor(FACING, 61, 0, 185)).toBe(4)
    expect(presetIndexFor(FACING, 61, 0, 100)).toBeNull()
  })
})

describe('parseAmount', () => {
  it('reads digits, rounds and clamps', () => {
    expect(parseAmount('1,168', 52, 2000)).toBe(1168)
    expect(parseAmount(' 60 ', 52, 185)).toBe(60)
    expect(parseAmount('10', 52, 185)).toBe(52)
    expect(parseAmount('999', 52, 185)).toBe(185)
    expect(parseAmount('abc', 52, 185)).toBeNull()
    expect(parseAmount('', 52, 185)).toBeNull()
  })
  it('fills the slider', () => {
    expect(amountFill(52, 52, 185)).toBe(0)
    expect(amountFill(185, 52, 185)).toBe(100)
    expect(amountFill(115, 115, 115)).toBe(100)
  })
})
