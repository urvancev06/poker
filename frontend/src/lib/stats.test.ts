import { describe, expect, it } from 'vitest'
import { ApiError } from './apiError'
import {
  GATES,
  bandFor,
  STATS,
  WINDOWS,
  count,
  countSize,
  decisionFact,
  foldToSteal,
  formatBand,
  formatValue,
  groupStats,
  groupStatus,
  judge,
  railPct,
  resultFact,
  ringLabel,
  rowDefinition,
  rowLabel,
  signedFixed,
  staleHeadline,
  stateText,
  windowLast,
  windowNote,
} from './stats'

const AF = STATS.find((s) => s.key === 'af')!
const VPIP = STATS.find((s) => s.key === 'vpip')!
const CBET = STATS.find((s) => s.key === 'cbet')!

describe('the nine', () => {
  it('has nine stats, each in one of the three gates', () => {
    expect(STATS).toHaveLength(9)
    expect(new Set(STATS.map((s) => s.key)).size).toBe(9)
    for (const s of STATS) expect(GATES).toContain(s.gate)
  })

  it('groups them by gate, nearest first, with what is left to go', () => {
    const g = groupStats(234)
    expect(g.map((x) => x.gate)).toEqual([500, 2000, 3000])
    expect(g.map((x) => x.stats.map((s) => s.name))).toEqual([
      ['VPIP', 'PFR'],
      ['ATS', 'AF', 'WTSD', 'WWSF', 'C-bet'],
      ['3-bet', 'W$SD'],
    ])
    expect(g.map((x) => x.left)).toEqual([266, 1766, 2766])
    expect(g.map(groupStatus)).toEqual(['266 to go', '1,766 to go', '2,766 to go'])
    expect(groupStats(2000).map((x) => x.ready)).toEqual([true, true, false])
    expect(groupStatus({ left: 0 })).toBe('Ready')
  })
})

describe('formatting', () => {
  it('prints percentages to 1 dp and AF to 2 dp; null is a dash, never 0', () => {
    expect(formatValue(VPIP, 85.9)).toBe('85.9%')
    expect(formatValue(VPIP, 0)).toBe('0.0%')
    expect(formatValue(AF, 0.04)).toBe('0.04')
    expect(formatValue(AF, null)).toBe('—')
    expect(formatValue(VPIP, undefined)).toBe('—')
  })

  it('prints bands as ranges', () => {
    expect(formatBand(VPIP, [22, 26])).toBe('22–26%')
    expect(formatBand(AF, [2.5, 3.5])).toBe('2.5–3.5')
  })

  it('signs with a true minus and leaves zero unsigned', () => {
    expect(signedFixed(-979.9, 1)).toBe('−979.9')
    expect(signedFixed(-1051.3, 1)).toBe('−1,051.3')
    expect(signedFixed(59.9, 1)).toBe('+59.9')
    expect(signedFixed(-0.01, 1)).toBe('0.0')
    expect(count(2766)).toBe('2,766')
  })

  it('places values on a fixed rail, clamped to its ends', () => {
    expect(railPct(VPIP, 85.9)).toBe(85.9)
    expect(railPct(VPIP, 140)).toBe(100)
    expect(railPct(AF, 3)).toBe(50)
    expect(railPct(AF, 9)).toBe(100)
    expect(railPct(AF, -1)).toBe(0)
  })
})

describe('judging', () => {
  it('refuses to judge below the gate, whatever the value', () => {
    expect(judge(85.9, [22, 26], 234, 500)).toEqual({ state: 'unjudged', reason: 'sample' })
    expect(judge(null, [22, 26], 234, 500)).toEqual({ state: 'unjudged', reason: 'sample' })
  })

  it('reads in band, out of band with the signed distance, and no value', () => {
    expect(judge(24, [22, 26], 500, 500)).toEqual({ state: 'in' })
    expect(judge(22, [22, 26], 600, 500)).toEqual({ state: 'in' })
    expect(judge(85.9, [22, 26], 600, 500).state).toBe('out')
    const above = judge(85.9, [22, 26], 600, 500)
    expect(above.state === 'out' && Math.round(above.by * 10) / 10).toBe(59.9)
    const below = judge(0.04, [2.5, 3.5], 2000, 2000)
    expect(below.state === 'out' && Math.round(below.by * 100) / 100).toBe(-2.46)
    expect(judge(null, [55, 70], 2000, 2000)).toEqual({ state: 'none' })
    expect(judge(60, null, 2000, 2000)).toEqual({ state: 'unjudged', reason: 'band' })
  })

  it('says how a judged row reads, in text as well as colour', () => {
    expect(stateText(VPIP, { state: 'in' })).toBe('In range')
    expect(stateText(VPIP, { state: 'out', by: 59.9 })).toBe('+59.9')
    expect(stateText(AF, { state: 'out', by: -2.46 })).toBe('−2.46')
    expect(stateText(CBET, { state: 'none' })).toBe('Not measured')
    expect(stateText(VPIP, { state: 'unjudged', reason: 'sample' })).toBe('')
  })

  it('names a row fully for a screen reader', () => {
    expect(rowLabel(VPIP, 85.9, [22, 26], judge(85.9, [22, 26], 234, 500))).toBe(
      'VPIP: 85.9%. Target 22 to 26%. Not read yet, readable at 500 hands.',
    )
    expect(rowLabel(AF, 0.04, [2.5, 3.5], { state: 'out', by: -2.46 })).toBe('AF: 0.04. Target 2.5 to 3.5. Out of range by −2.46.')
    expect(rowLabel(CBET, null, [55, 70], { state: 'none' })).toBe('C-bet: No c-bet chances yet. Target 55 to 70%. Not measured yet.')
  })

  it('defines a row in plain words, saying why a value is missing', () => {
    expect(rowDefinition(VPIP, 85.9, [22, 26])).toBe('Hands you put money in. Target 22–26%. Read from 500 hands.')
    expect(rowDefinition(AF, null, [2.5, 3.5])).toContain('No postflop calls yet')
    expect(rowDefinition(AF, undefined, [2.5, 3.5])).not.toContain('No postflop calls yet')
  })
})

describe('bands from the API', () => {
  it('takes a [lo, hi] pair and refuses anything else', () => {
    expect(bandFor({ vpip: [22, 26] }, 'vpip')).toEqual([22, 26])
    expect(bandFor({ vpip: [22, 26] }, 'cbet')).toBeNull()
    expect(bandFor({ vpip: [26, 22] }, 'vpip')).toBeNull()
    expect(bandFor({ vpip: [22] }, 'vpip')).toBeNull()
    expect(bandFor({ vpip: null }, 'vpip')).toBeNull()
    expect(bandFor(null, 'vpip')).toBeNull()
  })
})

describe('a failed refresh', () => {
  it('keeps the status-chosen headline and warns the figures may be old', () => {
    expect(staleHeadline(new ApiError({ status: null, detail: 'No response' }))).toBe('Can’t reach the server. These figures may be out of date.')
    expect(staleHeadline(new ApiError({ status: 500, detail: 'database is locked' }))).toBe('The server hit an error. These figures may be out of date.')
  })
})

describe('window', () => {
  it('maps the selector to ?last', () => {
    expect(WINDOWS.map((w) => w.label)).toEqual(['Lifetime', 'Last 500', 'Last 2,000', 'Last 5,000'])
    expect(windowLast('all')).toBeNull()
    expect(windowLast('5000')).toBe(5000)
  })

  it('says when the window is larger than the hands on record (B24)', () => {
    expect(windowNote(500, 234)).toBe('Showing all 234 hands')
    expect(windowNote(5000, 1)).toBe('Showing your only hand')
    expect(windowNote(500, 500)).toBe('')
    expect(windowNote(null, 234)).toBe('')
    expect(windowNote(500, 0)).toBe('')
  })
})

describe('the ring and the facts', () => {
  it('names the next gate', () => {
    expect(ringLabel(234)).toBe('234 hands. 266 more until the stats readable at 500 hands.')
    expect(ringLabel(1)).toBe('1 hand. 499 more until the stats readable at 500 hands.')
    expect(ringLabel(3000)).toBe('3,000 hands. Every stat can be read.')
  })

  it('shows decision time only when something was timed', () => {
    expect(decisionFact({ median_s: 8.3, n: 290 })).toEqual({ value: '8.3', note: 'Median of 290 decisions. Wall clock, so pauses count too.' })
    expect(decisionFact({ median_s: null, n: 0 })).toBeNull()
    expect(decisionFact(undefined)).toBeNull()
  })

  it('keeps bb/100 subordinate, with its caveat and blind level', () => {
    const f = resultFact({ hands: 234, net_bb_per_100: -979.9 }, { last: null, session_id: null, hands: 234, big_blind: 2, hands_at_this_blind: 234 })
    expect(f?.value).toBe('−979.9')
    expect(f?.note).toContain('big blind 2')
    expect(f?.note).toContain('tens of thousands of hands')
    expect(f?.mixed).toBeNull()
    expect(resultFact({ hands: 0, net_bb_per_100: 0 }, null)).toBeNull()
  })

  it('says so when the blinds changed inside the window', () => {
    const f = resultFact({ hands: 234, net_bb_per_100: 12 }, { last: null, session_id: null, hands: 234, big_blind: 4, hands_at_this_blind: 180 })
    expect(f?.value).toBe('+12.0')
    expect(f?.mixed).toBe('180 of 234 hands at big blind 4')
  })

  it('counts every hand in its own big blinds when the API says which levels it saw', () => {
    const mixed = resultFact(
      { hands: 240, net_bb_per_100: 4 },
      { last: null, session_id: null, hands: 240, big_blind: 10, hands_at_this_blind: 240, blind_levels: [[1, 2], [5, 10]] },
    )
    expect(mixed?.mixed).toBe('Includes hands at 1/2 and 5/10, each counted in its own big blinds')
    expect(mixed?.note).toContain('each hand in its own big blinds')
    expect(mixed?.note).not.toContain('big blind 10')
    const one = resultFact({ hands: 20, net_bb_per_100: -3 }, { last: 20, session_id: null, hands: 20, big_blind: 10, hands_at_this_blind: 20, blind_levels: [[5, 10]] })
    expect(one?.mixed).toBeNull()
    expect(one?.note).toContain('at 5/10')
  })

  it('shows fold to steal only when the API sends it', () => {
    expect(foldToSteal({ fold_to_steal: 7.1 })).toEqual({ value: '7.1%' })
    expect(foldToSteal({ fold_to_steal: null })).toEqual({ value: null })
    expect(foldToSteal({})).toBeNull()
  })

  it('shrinks the ring count as it grows, so it clears the ring', () => {
    expect(countSize(0)).toBe('lg')
    expect(countSize(999)).toBe('lg')
    expect(countSize(2400)).toBe('md')
    expect(countSize(9999)).toBe('md')
    expect(countSize(10000)).toBe('sm')
    expect(countSize(123456)).toBe('sm')
  })
})
