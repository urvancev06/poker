import { describe, expect, it } from 'vitest'
import type { Coaching } from '../api'
import { COACH_SAMPLES, coachSample } from './coachSamples'
import { evView, glanceView, headlineEquity, isPriceAdjusted, isPriced, priceAdjustment } from './coachView'

const coach = (name: string) => coachSample(name).coach

describe('glanceView over every captured answer', () => {
  it('takes the tone from the backend field, for all nine verdicts', () => {
    const tones = Object.fromEntries(COACH_SAMPLES.map((s) => [s.coach.verdict, glanceView(s.coach).tone]))
    expect(tones).toEqual({
      'Bet for value.': 'good',
      'Raise for value.': 'good',
      'Clear call.': 'good',
      'Call.': 'good',
      'Thin value bet, or check.': 'neutral',
      'Semi-bluff or check.': 'neutral',
      'Check.': 'neutral',
      'Close — call or fold.': 'close',
      'Fold.': 'fold',
    })
  })

  it('shows three figures in a priced spot and one in a bet/check spot', () => {
    for (const s of COACH_SAMPLES) {
      const g = glanceView(s.coach)
      const kinds = g.figures.map((f) => f.kind)
      if (s.coach.to_call > 0) expect(kinds, s.name).toEqual(['eq', 'need', 'ev'])
      else expect(kinds, s.name).toEqual(['eq'])
      expect(g.priced, s.name).toBe(s.coach.to_call > 0)
    }
  })

  it('reads like the prototype for the clear-call flush draw', () => {
    const g = glanceView(coach('spot_implied_draw'))
    expect(g.verdict).toBe('Clear call.')
    expect(g.figures.map((f) => [f.value, f.label])).toEqual([
      ['39%', 'Realized'],
      ['22%', 'Need'],
      ['+4.0', 'Call EV'],
    ])
    expect(g.figures[2].unit).toBe('bb')
    expect(g.figures.map((f) => f.tone)).toEqual(['good', 'need', 'win'])
    expect(g.need).toBe(22.2)
    expect(g.raw).toBe(40)
    // a 1/2 sample: call EV +8 chips is +4 big blinds
    expect(g.spoken).toBe('Clear call. Realized 39%, need 22%, call EV +4.0 big blinds.')
  })

  it('shows call EV in big blinds of the hand, one decimal', () => {
    const c = { ...coach('spot_implied_draw'), call_ev: 8 }
    expect(evView(c)?.text).toBe('+4.0')
    expect(evView({ ...c, big_blind: 10 })?.text).toBe('+0.8')
    expect(evView({ ...c, big_blind: 10, call_ev: -15 })?.text).toBe('−1.5')
  })

  it('a bet/check spot has no ring figures: the verdict and one figure', () => {
    const g = glanceView(coach('coach_verdict_check'))
    expect(g.priced).toBe(false)
    expect(g.need).toBeNull()
    expect(g.ev).toBeNull()
    expect(g.figures).toEqual([{ kind: 'eq', value: '10%', label: 'Realized', tone: 'neutral', note: null }])
    expect(g.spoken).toBe('Check. Realized 10%.')
  })

  it('switches the headline to raw Equity once the action is closed', () => {
    for (const name of ['spot_flop_draw', 'spot_facing_allin', 'spot_river_bluffcatch_close']) {
      const c = coach(name)
      expect(c.action_closed).toBe(true)
      expect(headlineEquity(c)).toEqual({ pct: c.equity_pct, label: 'Equity' })
      expect(glanceView(c).figures[0].label).toBe('Equity')
    }
    expect(headlineEquity(coach('coach_verdict_fold'))).toEqual({ pct: 24, label: 'Realized' })
  })

  it('reads an unknown tone as neutral, never positive', () => {
    const c = { ...coach('coach_verdict_call'), tone: 'great' } as unknown as Coaching
    expect(glanceView(c).tone).toBe('neutral')
  })
})

describe('the price', () => {
  it('is priced only with something to call and a required equity', () => {
    expect(isPriced({ to_call: 5, required_equity_pct: 38.5 })).toBe(true)
    expect(isPriced({ to_call: 0, required_equity_pct: null })).toBe(false)
    expect(isPriced({ to_call: 5, required_equity_pct: null })).toBe(false)
  })

  it('knows when the implied adjustment moved it, and by how much', () => {
    expect(isPriceAdjusted(coach('spot_implied_draw'))).toBe(true)
    expect(priceAdjustment(coach('spot_implied_draw'))).toBe(-7.7)
    expect(priceAdjustment(coach('spot_implied_reverse'))).toBe(11.7)
    expect(priceAdjustment(coach('spot_implied_set'))).toBe(-9.3)
    expect(isPriceAdjusted(coach('coach_verdict_call'))).toBe(false)
    expect(priceAdjustment(coach('coach_verdict_check'))).toBeNull()
  })
})

describe('Call EV and the verdict (B8)', () => {
  it('colours EV by sign when it agrees with the verdict', () => {
    expect(evView(coach('spot_implied_draw'))).toEqual({ text: '+4.0', tone: 'win', disagrees: false, note: null })
    expect(evView(coach('coach_verdict_fold'))).toEqual({ text: '−1.5', tone: 'loss', disagrees: false, note: null })
    // close on the raw price: the sign is information, not an argument
    expect(evView(coach('coach_verdict_close__call_or_fold'))?.tone).toBe('win')
    expect(evView(coach('coach_verdict_close_preflop'))?.tone).toBe('loss')
  })

  it('renders EV neutral, "before implied", when its sign argues with the verdict', () => {
    // "Call." with -1.0: the set-value adjustment made the call right
    expect(evView(coach('spot_implied_set'))).toEqual({ text: '−0.5', tone: 'neutral', disagrees: true, note: 'before implied' })
    // "Fold." with +0.3: the reverse-implied adjustment made the fold right
    expect(evView(coach('spot_implied_reverse'))).toEqual({ text: '+0.2', tone: 'neutral', disagrees: true, note: 'before implied' })
    const g = glanceView(coach('spot_implied_set'))
    expect(g.figures[2]).toEqual({ kind: 'ev', value: '−0.5', unit: 'bb', label: 'Call EV', tone: 'neutral', note: 'before implied' })
    expect(g.spoken).toBe('Call. Realized 22%, need 19%, call EV −0.5 big blinds before implied.')
  })

  it('a close verdict on an adjusted price keeps EV neutral', () => {
    const c = { ...coach('spot_implied_reverse'), tone: 'close', verdict: 'Close — call or fold.', call_ev: -2.7 } as Coaching
    expect(evView(c)).toEqual({ text: '−1.4', tone: 'neutral', disagrees: true, note: 'before implied' })
  })

  it('a good verdict with negative EV on the raw price is neutral without the implied note', () => {
    const c = { ...coach('coach_verdict_raise_for_value'), call_ev: -1.2 }
    expect(evView(c)).toEqual({ text: '−0.6', tone: 'neutral', disagrees: true, note: null })
  })

  it('a zero EV has no sign and no colour', () => {
    expect(evView({ ...coach('coach_verdict_call'), call_ev: 0.04 })).toEqual({ text: '0.0', tone: 'neutral', disagrees: false, note: null })
  })

  it('is absent with no price', () => {
    expect(evView(coach('coach_verdict_bet_for_value'))).toBeNull()
  })
})

describe('glanceView on a new-engine table (reduced coach)', () => {
  it('shows odds only after the flop: no EV, the raw equity, the caption', () => {
    const v = glanceView(coach('reduced_flop_facing_bet'))
    expect(v.verdict).toBe('Odds only.')
    expect(v.tone).toBe('neutral')
    expect(v.reduced).toBe(true)
    expect(v.caption).toBe('Not yet calibrated for the new bots')
    expect(v.figures.map((f) => f.kind)).toEqual(['eq', 'need'])
    expect(v.figures[0]).toMatchObject({ label: 'Equity', value: '48%' })
    expect(v.ev).toBeNull()
    expect(v.spoken).not.toMatch(/EV/)
  })

  it('preflop gives the chart advice and says whether the hand is in the chart', () => {
    const v = glanceView(coach('reduced_preflop_open'))
    expect(v.verdict).toBe('Open-raise to 2.5 bb.')
    expect(v.tone).toBe('good')
    expect(v.caption).toBe('22 is in your CO chart.')
    expect(v.figures.map((f) => f.kind)).not.toContain('ev')
    expect(v.spoken).toContain('22 is in your CO chart.')
    expect(glanceView(coach('reduced_preflop_3bet')).caption).toBe('JJ is in your value 3-bet vs CO chart.')
  })

  it('the full coach has no caption', () => {
    for (const s of COACH_SAMPLES) {
      const v = glanceView(s.coach)
      expect(v.reduced).toBe(false)
      expect(v.caption).toBeNull()
    }
  })
})
