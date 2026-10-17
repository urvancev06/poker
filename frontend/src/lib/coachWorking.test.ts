import { describe, expect, it } from 'vitest'
import { COACH_SAMPLES, coachSample } from './coachSamples'
import { adjustmentNote, capitalize, humanizeDraw, humanizeDraws, humanizeTier, workingRows, type WorkingRow } from './coachWorking'

const rows = (name: string) => workingRows(coachSample(name).coach)
const byKey = (rs: WorkingRow[]) => Object.fromEntries(rs.map((r) => [r.key, r]))

describe('workingRows', () => {
  it('derives the clear call step by step, each step tagged', () => {
    expect(rows('spot_implied_draw').map((r) => [r.label, r.value, r.kind])).toEqual([
      ['Your hand', 'High card', 'computed'],
      ['Equity', '40%', 'computed'],
      ['Realized', '≈39%', 'estimate'],
      ['Price', '29.9%', 'exact'],
      ['Price adjustment', '−7.7 pts', 'estimate'],
      ['Need', '22.2%', 'estimate'],
      ['Call EV', '≈+8.0', 'computed'],
    ])
    const r = byKey(rows('spot_implied_draw'))
    expect(r.hand.note).toBe('Flush draw')
    expect(r.equity.note).toBe('Wins 40%, ties 0%, loses 60%')
    expect(r.realized.note).toBe('Realizing ~99% in position, nobody left to act')
    expect(r.price.note).toBe('26 to call into 61, pot odds 2.3 : 1')
    expect(r.adjust.note).toBe('Cheaper: you should win more later when you hit. Draw — paid off when you complete.')
    expect(r.need.note).toBe('The price after that adjustment')
    expect(r.ev.note).toBe('39% of 87, less the 26 call. Before implied odds')
  })

  it('tags Need Estimate exactly when the price was adjusted', () => {
    for (const s of COACH_SAMPLES) {
      const need = byKey(workingRows(s.coach)).need
      if (s.coach.to_call === 0) {
        expect(need, s.name).toBeUndefined()
        continue
      }
      const adjusted = s.coach.required_equity_pct !== s.coach.required_direct_pct
      expect(need.kind, s.name).toBe(adjusted ? 'estimate' : 'exact')
      expect(!!byKey(workingRows(s.coach)).adjust, s.name).toBe(adjusted)
    }
  })

  it('words the reverse adjustment as dearer', () => {
    const r = byKey(rows('spot_implied_reverse'))
    expect(r.adjust.value).toBe('+11.7 pts')
    expect(r.adjust.note).toBe('Dearer: you may lose more later when you are behind. Reverse implied — dominated.')
    expect(r.price.value).toBe('30.0%')
    expect(r.need.value).toBe('41.7%')
  })

  it('an unadjusted price says so and the Need is exact arithmetic', () => {
    const r = byKey(rows('coach_verdict_call'))
    expect(r.adjust).toBeUndefined()
    expect(r.need).toMatchObject({ value: '38.5%', kind: 'exact', note: 'The price: nothing adjusts it' })
    expect(r.ev.note).toBe('46% of 13, less the 5 call')
    expect(r.realized.note).toBe('Realizing ~70% in position, 2 still to act behind you')
  })

  it('counts equity in full once the action is closed', () => {
    const r = byKey(rows('spot_flop_draw'))
    expect(r.realized).toMatchObject({ label: 'Equity counts in full', value: '38%', kind: 'exact' })
    expect(r.hand.note).toBe('Open-ended straight draw and backdoor flush draw')
  })

  it('bet/check spots have no price rows and no "nobody left to act" claim', () => {
    const rs = rows('coach_verdict_bet_for_value')
    expect(rs.map((r) => r.key)).toEqual(['hand', 'equity', 'realized'])
    expect(byKey(rs).realized.note).toBe('Realizing ~92% in position')
  })

  it('skips the realized row when nothing is discounted', () => {
    expect(rows('spot_river_bluffcatch').map((r) => r.key)).toEqual(['hand', 'equity', 'realized', 'price', 'need', 'ev'])
    const c = { ...coachSample('coach_verdict_call').coach, realization_pct: 100 }
    expect(workingRows(c).some((r) => r.key === 'realized')).toBe(false)
  })

  it('B18: never prints a raw enum, and prints the win/tie split once', () => {
    for (const s of COACH_SAMPLES) {
      const text = workingRows(s.coach)
        .flatMap((r) => [r.label, r.value, r.note ?? ''])
        .join(' | ')
      expect(text, s.name).not.toMatch(/[a-z]+_[a-z]+/)
      expect(text, s.name).not.toMatch(/[A-Z]{2,}_[A-Z]+/)
      expect(text.match(/Wins \d/g)?.length, s.name).toBe(1)
      expect(text.match(/ties \d/g)?.length, s.name).toBe(1)
    }
  })
})

describe('words', () => {
  it('humanises tiers and draws, unknown ones too', () => {
    expect(humanizeTier('TWO_PAIR')).toBe('Two pair')
    expect(humanizeTier('PAIR')).toBe('One pair')
    expect(humanizeTier('SOME_NEW_TIER')).toBe('Some new tier')
    expect(humanizeDraw('backdoor_flush_draw')).toBe('backdoor flush draw')
    expect(humanizeDraw('runner_runner')).toBe('runner runner')
    expect(humanizeDraws([])).toBeNull()
    expect(humanizeDraws(['backdoor_flush_draw', 'gutshot', 'flush_draw'])).toBe('Flush draw, gutshot and backdoor flush draw')
    expect(humanizeDraws(['overcards', 'overcards'])).toBe('Two overcards')
  })

  it('capitalises the first letter only', () => {
    expect(capitalize('draw — paid off')).toBe('Draw — paid off')
    expect(capitalize('  ')).toBe('')
  })

  it('leaves out an empty implied note', () => {
    expect(adjustmentNote(-2, '')).toBe('Cheaper: you should win more later when you hit.')
  })
})
