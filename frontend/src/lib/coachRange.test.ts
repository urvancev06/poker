import { describe, expect, it } from 'vitest'
import { COACH_SAMPLES, coachSample } from './coachSamples'
import { airLine, lastAction, parseRange, villainLines } from './coachRange'
import { isPriced } from './coachView'

const linesFor = (name: string, visibility: 'labeled' | 'hud' | 'live' = 'labeled') => {
  const s = coachSample(name)
  return villainLines(s.coach, { visibility, positions: s.positions, priced: isPriced(s.coach) })
}

describe('parseRange', () => {
  it('splits the archetype, the line tags and the top %', () => {
    expect(parseRange('Maniac, 3-bet pre + c-bet flop → ~top 7.6% (101 combos)')).toEqual({
      archetype: 'Maniac',
      tags: ['3-bet pre', 'c-bet flop'],
      topPct: '7.6',
    })
    expect(parseRange('Calling Station, preflop range → ~top 37.2% (493 combos)')).toEqual({
      archetype: 'Calling Station',
      tags: ['preflop range'],
      topPct: '37.2',
    })
  })

  it('falls back when the shape is unknown', () => {
    expect(parseRange('a neutral fallback range')).toEqual({ archetype: null, tags: [], topPct: null })
  })
})

describe('lastAction', () => {
  it('reads the last tag', () => {
    expect(lastAction(['3-bet pre', 'c-bet flop'])).toBe('bet')
    expect(lastAction(['raised turn', 'barreled river'])).toBe('bet')
    expect(lastAction(['called turn', 'called river'])).toBe('call')
    expect(lastAction(['c-bet flop', 'called turn'])).toBe('call')
    expect(lastAction(['preflop range'])).toBe('none')
    expect(lastAction([])).toBe('unknown')
  })
})

describe('villainLines', () => {
  it('one line per villain: name, line, combos, top %', () => {
    expect(linesFor('spot_implied_draw')).toEqual([
      {
        seat: 0,
        name: 'Maniac',
        line: '3-bet pre, c-bet flop. 101 combos',
        value: 'Top 7.6%',
        air: '24.8% of this betting range is air: a hand that beats only bluffs wins that often.',
      },
    ])
  })

  it('B28: no air line for a villain who only called; the bettor keeps the bluff-catch meaning', () => {
    const [tag, station] = linesFor('spot_facing_allin')
    expect(tag.line).toBe('Raised turn, barreled river. 96 combos')
    expect(tag.air).toBe('3.1% of this betting range is air: a hand that beats only bluffs wins that often.')
    expect(station.line).toBe('Called turn, called river. 409 combos')
    expect(station.air).toBeNull()
  })

  it('outside a priced spot the air share makes no bluff-catch claim', () => {
    const [lag, station] = linesFor('coach_verdict_check')
    expect(lag.air).toBe('51.0% of their range is air.')
    expect(station.air).toBe('54.4% of their range is air.')
  })

  it('no air line when the range has no air', () => {
    expect(linesFor('coach_verdict_clear_call')[0].air).toBeNull()
  })

  it('B16: HUD and Live name villains by position and never print the archetype', () => {
    for (const s of COACH_SAMPLES) {
      for (const visibility of ['hud', 'live'] as const) {
        const ls = villainLines(s.coach, { visibility, positions: s.positions, priced: isPriced(s.coach) })
        ls.forEach((l, i) => {
          const v = s.coach.villains[i]
          expect(l.name, s.name).toBe(s.positions[v.seat])
          expect(`${l.name} ${l.line} ${l.value} ${l.air ?? ''}`, s.name).not.toContain(v.archetype)
        })
      }
    }
    expect(linesFor('spot_implied_set', 'hud').map((l) => l.name)).toEqual(['MP', 'CO'])
    expect(linesFor('spot_implied_set', 'labeled').map((l) => l.name)).toEqual(['Station', 'Maniac'])
  })

  it('without positions, HUD and Live fall back to a neutral name', () => {
    const c = coachSample('spot_implied_set').coach
    expect(villainLines(c, { visibility: 'live', priced: true }).map((l) => l.name)).toEqual(['Opponent 1', 'Opponent 2'])
  })

  it('an unparsed description is shown verbatim, minus the archetype outside Labeled', () => {
    const c = { villains: [{ seat: 1, archetype: 'TAG', combos: 1326, description: 'TAG, a neutral fallback', bluff_pct: 0 }] }
    expect(villainLines(c, { visibility: 'hud', positions: ['SB', 'BB'], priced: false })[0]).toMatchObject({ name: 'BB', line: 'A neutral fallback', value: '1,326 combos' })
    expect(villainLines(c, { visibility: 'labeled', priced: false })[0]).toMatchObject({ name: 'TAG', line: 'TAG, a neutral fallback' })
  })
})

describe('airLine', () => {
  it('needs air to say anything', () => {
    expect(airLine({ bluff_pct: 0 }, 'bet', true)).toBeNull()
    expect(airLine({ bluff_pct: 12.5 }, 'unknown', true)).toBe('12.5% of their range is air.')
  })
})

describe('villainLines on a new-engine table', () => {
  it('names the pool-average range by position in every mode, never by a type', () => {
    const s = coachSample('reduced_flop_facing_bet')
    for (const visibility of ['labeled', 'hud', 'live'] as const) {
      const [line] = villainLines(s.coach, { visibility, positions: s.positions, priced: true })
      expect(line.name).toBe('BB')
      expect(line.line).toBe('Preflop range. 992 combos')
      expect(line.air).toBeNull()
    }
  })
})
