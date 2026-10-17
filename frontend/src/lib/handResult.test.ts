import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SessionState } from '../api'
import { classifyResult } from './handResult'

const fixture = (name: string): SessionState => JSON.parse(readFileSync(new URL(`./__fixtures__/table/${name}.json`, import.meta.url), 'utf8')) as SessionState

describe('classifyResult (B2)', () => {
  it('won at showdown', () => {
    expect(classifyResult(fixture('result_showdown_won'))).toEqual({ kind: 'won-showdown', word: 'You won', net: 14, tone: 'win', sub: 'At showdown' })
  })
  it('won because everyone folded', () => {
    expect(classifyResult(fixture('result_fold_win'))).toMatchObject({ kind: 'won-uncontested', net: 3, sub: 'Everyone folded' })
  })
  it('lost at showdown', () => {
    expect(classifyResult(fixture('result_showdown_lost'))).toMatchObject({ kind: 'lost-showdown', word: 'You lost', net: -191, tone: 'loss' })
  })
  it('folded at a cost, from a blind', () => {
    expect(classifyResult(fixture('result_hero_folded_lost'))).toEqual({ kind: 'folded-cost', word: 'You folded', net: -2, tone: 'loss', sub: 'From the big blind' })
  })
  it('folded at a cost later in the hand', () => {
    const s = fixture('result_hero_folded_lost')
    const later: SessionState = {
      ...s,
      last_result: { ...s.last_result!, hero_net: -11 },
      state: {
        ...s.state,
        history: [
          { seat: 1, position: 'BB', street: 'preflop', action: 'check', to_amount: null },
          { seat: 1, position: 'BB', street: 'flop', action: 'fold', to_amount: null },
        ],
      },
    }
    expect(classifyResult(later)).toMatchObject({ kind: 'folded-cost', net: -11, sub: 'On the flop' })
  })
  it('folded preflop after putting more in: "Before the flop", never "On the preflop"', () => {
    const s = fixture('result_hero_folded_lost')
    const hero = s.hero_seat
    const raised: SessionState = {
      ...s,
      last_result: { ...s.last_result!, hero_net: -2 },
      state: {
        ...s.state,
        seats: s.state.seats.map((seat, i) => (i === hero ? { ...seat, position: 'BTN' } : seat)),
        history: [
          { seat: hero, position: 'BTN', street: 'preflop', action: 'call', to_amount: 2 },
          { seat: (hero + 1) % s.state.seats.length, position: 'SB', street: 'preflop', action: 'raise', to_amount: 10 },
          { seat: hero, position: 'BTN', street: 'preflop', action: 'fold', to_amount: null },
        ],
      },
    }
    expect(classifyResult(raised)).toMatchObject({ kind: 'folded-cost', net: -2, sub: 'Before the flop' })
  })
  it('folded for free: no 0, no "Chop"', () => {
    expect(classifyResult(fixture('result_hero_folded_net0'))).toEqual({ kind: 'folded-free', word: 'You folded', net: null, tone: 'neutral', sub: 'It cost nothing' })
  })
  it('a real split pot is not a free fold', () => {
    const s = fixture('result_showdown_won')
    const split: SessionState = { ...s, last_result: { ...s.last_result!, hero_net: 0 } }
    expect(classifyResult(split)).toMatchObject({ kind: 'split', word: 'Split pot', net: null, sub: 'At showdown' })
  })
  it('nothing while the hand runs', () => {
    expect(classifyResult(fixture('spot_implied_draw'))).toBeNull()
  })
})
