import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SessionState } from '../api'
import { buildTableModel } from './tableModel'
import { diffTable, isNewHand } from './tableMotion'

const fixture = (name: string): SessionState => JSON.parse(readFileSync(new URL(`./__fixtures__/table/${name}.json`, import.meta.url), 'utf8')) as SessionState
const model = (s: SessionState) => buildTableModel(s, undefined, 'labeled')

/** A copy of a snapshot with some seats changed. */
function edit(s: SessionState, fn: (s: SessionState) => void): SessionState {
  const c = structuredClone(s)
  fn(c)
  return c
}

describe('diffTable', () => {
  const base = fixture('state_hero_folded_hand_continues')
  it('the first snapshot deals, with the blinds chipping in', () => {
    const e = diffTable(null, model(fixture('state_dealing_no_history')))
    expect(e.deal).toBe(true)
    expect(e.chipIns.sort()).toEqual([1, 2]) // SB and BB: players 1 and 2 in that hand
  })
  it('a bot folding sends its cards to the muck', () => {
    const next = edit(base, (c) => {
      c.state.seats[5].folded = true
      c.state.history.push({ seat: 5, position: 'BTN', street: 'preflop', action: 'fold', to_amount: null })
    })
    const e = diffTable(model(base), model(next))
    expect(e.deal).toBe(false)
    expect(e.folds).toEqual([1]) // BTN is player 1 here
    expect(e.chipIns).toEqual([])
    expect(e.acted).toBe(1)
  })
  it('a raise chips in', () => {
    const next = edit(base, (c) => {
      c.state.seats[5].bet = 6
      c.state.seats[5].stack -= 6
      c.state.history.push({ seat: 5, position: 'BTN', street: 'preflop', action: 'raise', to_amount: 6 })
    })
    expect(diffTable(model(base), model(next)).chipIns).toEqual([1])
  })
  it('a new street collects the bets and deals', () => {
    const next = edit(base, (c) => {
      c.state.board = ['2d', '7s', 'Qd']
      c.state.seats.forEach((x) => (x.bet = 0))
      c.state.history.push({ seat: 5, position: 'BTN', street: 'preflop', action: 'call', to_amount: null })
    })
    const e = diffTable(model(base), model(next))
    expect(e.street).toEqual({ from: 0, to: 3, collected: [{ player: 2, amount: 1 }, { player: 3, amount: 2 }] })
    expect(e.chipIns).toEqual([])
  })
  it('the hand ending reveals only shown cards and collects what was out', () => {
    const before = edit(fixture('result_showdown_lost'), (c) => {
      c.hand_over = false
      c.last_result = null
      c.state.results = null
    })
    const e = diffTable(model(before), model(fixture('result_showdown_lost')))
    expect(e.handOver).toBe(true)
    expect(e.reveals).toEqual([2]) // the TAG; the hero's own cards are not a reveal
  })
  it('the hero turn', () => {
    const turn = fixture('spot_implied_draw')
    const before = edit(turn, (c) => {
      c.hero_to_act = false
    })
    expect(diffTable(model(before), model(turn))).toMatchObject({ turnOn: true, turnOff: false })
    expect(diffTable(model(turn), model(before))).toMatchObject({ turnOn: false, turnOff: true })
  })
})

describe('isNewHand', () => {
  it('a deal after the hand ended, a new session, or a shorter history', () => {
    const over = model(fixture('result_showdown_lost'))
    const next = model(fixture('state_dealing_no_history'))
    expect(isNewHand(null, next)).toBe(true)
    expect(isNewHand({ ...over, sessionId: next.sessionId }, next)).toBe(true)
    expect(isNewHand(next, { ...next, sessionId: 'other' })).toBe(true)
    expect(isNewHand(next, next)).toBe(false)
  })
})
