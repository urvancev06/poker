import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SessionState } from '../api'
import { handLog } from './handLog'
import { replayHand } from './tableModel'

const fixture = (name: string): SessionState => JSON.parse(readFileSync(new URL(`./__fixtures__/table/${name}.json`, import.meta.url), 'utf8')) as SessionState

describe('handLog', () => {
  const s = fixture('spot_implied_draw')
  const log = handLog(s.state.history, s.hero_seat, replayHand(s).amounts)
  it('groups by street', () => {
    expect(log.map((b) => b.label)).toEqual(['Preflop', 'Flop'])
    expect(log[0].rows).toHaveLength(7)
  })
  it('words rows, "You" first person, with call amounts', () => {
    expect(log[0].rows.map((r) => `${r.who} ${r.what}`)).toEqual([
      'UTG folds',
      'MP raises to 5',
      'CO folds',
      'BTN folds',
      'SB raises to 15',
      'You call 15',
      'MP folds',
    ])
    expect(log[1].rows[0]).toMatchObject({ who: 'SB', what: 'bets 26', you: false, fold: false })
    expect(log[0].rows[5].you).toBe(true)
    expect(log[0].rows[0].fold).toBe(true)
  })
  it('is empty before anyone acts', () => {
    expect(handLog([], 0, [])).toEqual([])
  })
})
