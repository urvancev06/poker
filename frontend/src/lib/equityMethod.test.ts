import { describe, expect, it } from 'vitest'
import { equityMargin, equityMethodNote, equityMethodSpoken, equityMethodTag } from './equityMethod'

describe('equity method wording', () => {
  it('names how the equity was computed', () => {
    expect(equityMethodNote({ equity_method: 'exact' })).toBe('Every runout counted')
    expect(equityMethodNote({ equity_method: 'preflop_table' })).toBe('From the preflop table')
    // the 95% margin: 1.96 standard errors, to 0.1 pp
    expect(equityMethodNote({ equity_method: 'sampled', equity_se_pct: 0.21 })).toBe('Sampled ±0.4 pp')
    expect(equityMethodNote({ equity_method: 'sampled', equity_se_pct: 0.8 })).toBe('Sampled ±1.6 pp')
    expect(equityMethodNote({ equity_method: 'sampled', equity_se_pct: null })).toBe('Sampled')
  })
  it('says nothing for an answer from before the method was sent, or an unknown one', () => {
    expect(equityMethodNote({})).toBeNull()
    expect(equityMethodNote({ equity_method: null })).toBeNull()
    expect(equityMethodNote({ equity_method: 'quantum' })).toBeNull()
  })
  it('a margin only for a sampled figure, and none at zero', () => {
    expect(equityMargin({ equity_method: 'sampled', equity_se_pct: 0.21 })).toBe(0.4)
    expect(equityMargin({ equity_method: 'sampled', equity_se_pct: 0 })).toBeNull()
    expect(equityMargin({ equity_method: 'exact', equity_se_pct: 0.21 })).toBeNull()
    expect(equityMargin({ equity_method: 'sampled' })).toBeNull()
  })
  it('a short tag to set beside an equity figure', () => {
    expect(equityMethodTag({ equity_method: 'exact' })).toBe('Exact')
    expect(equityMethodTag({ equity_method: 'sampled', equity_se_pct: 0.21 })).toBe('±0.4 pp')
    expect(equityMethodTag({ equity_method: 'sampled' })).toBe('Sampled')
    expect(equityMethodTag({ equity_method: 'preflop_table' })).toBe('Table')
    expect(equityMethodTag({})).toBeNull()
  })
  it('words for a screen reader', () => {
    expect(equityMethodSpoken({ equity_method: 'exact' })).toBe('every runout counted')
    expect(equityMethodSpoken({ equity_method: 'sampled', equity_se_pct: 0.5 })).toBe('sampled, plus or minus 1.0 points')
    expect(equityMethodSpoken({ equity_method: 'sampled' })).toBe('sampled')
    expect(equityMethodSpoken({ equity_method: 'preflop_table' })).toBe('from the preflop table')
    expect(equityMethodSpoken({})).toBeNull()
  })
})
