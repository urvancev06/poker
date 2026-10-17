import { describe, expect, it } from 'vitest'
import type { LabArchetypesInfo, LabResult, LabStatCell } from '../api'
import {
  LAB_STATS,
  bandFractions,
  cellSpeech,
  changedCount,
  clampHands,
  clampSeed,
  configKey,
  dotFraction,
  durationText,
  elapsedText,
  estimateText,
  formatBand,
  formatDistance,
  formatStat,
  gateCaveat,
  gateHeadline,
  gateSummary,
  isChanged,
  judgeCell,
  knobText,
  metaLine,
  msPerHand,
  overrideEcho,
  parseWhole,
  previewRows,
  railFraction,
  resultRows,
  rowContext,
  rowSpeech,
  seatPhrase,
  seatedKeys,
  seatedOverrides,
  seatsOf,
  snapKnob,
  targetsText,
  tuneTarget,
  unseatedChanged,
  withKnob,
  withoutArch,
} from './lab'

const def = (k: string) => LAB_STATS.find((s) => s.key === k)!
const VPIP = def('vpip')
const AF = def('af')
const WTSD = def('wtsd')

const cell = (value: number | null, band: [number, number] | null, ok: boolean | null): LabStatCell => ({ value, band, ok })

// Trimmed from samples/lab_archetypes.json (real API output).
const INFO: LabArchetypesInfo = {
  archetypes: [
    { key: 'nit', name: 'Nit', targets: { vpip: [10, 15] }, knobs: { cbet_freq: 0.35, threebet_value: 0.025, bet_frac: 0.6 } },
    { key: 'tag', name: 'TAG', targets: { vpip: [20, 24] }, knobs: { cbet_freq: 0.68, threebet_value: 0.055, bet_frac: 0.6 } },
    { key: 'lag', name: 'LAG', targets: { vpip: [27, 33] }, knobs: { cbet_freq: 0.75, threebet_value: 0.06, bet_frac: 0.65 } },
    { key: 'station', name: 'Calling Station', targets: { vpip: [40, 55] }, knobs: { cbet_freq: 0.2, threebet_value: 0.03, bet_frac: 0.55 } },
    { key: 'maniac', name: 'Maniac', targets: { vpip: [50, 65], wtsd: null }, knobs: { cbet_freq: 0.9, threebet_value: 0.06, bet_frac: 0.75 } },
  ],
  knob_meta: [
    { key: 'threebet_value', label: '3-bet value', min: 0, max: 0.15, step: 0.005 },
    { key: 'cbet_freq', label: 'C-bet freq', min: 0, max: 1, step: 0.05 },
    { key: 'bet_frac', label: 'Bet size (pot)', min: 0.25, max: 1, step: 0.05 },
  ],
  default_lineup: ['nit', 'tag', 'lag', 'station', 'maniac', 'tag'],
  max_hands: 25000,
  default_hands: 5000,
}

// The shape of samples/lab_simulate_2000.json, trimmed to the five banded stats (+ two extras).
function row(archetype: string, hands: number, bb: number, s: Record<string, LabStatCell>) {
  return { archetype, hands, net_bb_per_100: bb, stats: s }
}
const RESULT: LabResult = {
  hands: 2000,
  seed: 0,
  lineup: ['nit', 'tag', 'lag', 'station', 'maniac', 'tag'],
  overrides: { tag: { cbet_freq: 0.8 } },
  gate_pass: false,
  elapsed_ms: 5180,
  rows: [
    row('Nit', 2000, 52.62, {
      vpip: cell(12.4, [10, 15], true),
      pfr: cell(9.55, [8, 12], true),
      threebet: cell(2.09, [1, 3], true),
      af: cell(2.71, [1, 2], false),
      wtsd: cell(25.0, [26, 32], false),
      wsd: cell(77.5, null, true),
      ats: cell(26.18, null, null),
    }),
    row('TAG', 4000, 64.8, {
      vpip: cell(19.57, [20, 24], false),
      pfr: cell(16.73, [17, 21], false),
      threebet: cell(7.02, [6, 9], true),
      af: cell(2.84, [2.5, 3.5], true),
      wtsd: cell(30.02, [25, 30], false),
    }),
    row('Maniac', 2000, 77.5, {
      vpip: cell(56, [50, 65], true),
      pfr: cell(46, [38, 50], true),
      threebet: cell(25, [14, 22], false),
      af: cell(7.9, [4, 99], true),
      // Unbanded: the backend says ok: true. It must not read as a pass (B24).
      wtsd: cell(37.74, null, true),
    }),
  ],
}

describe('judging a cell', () => {
  it('in band and out of band, with the signed distance', () => {
    expect(judgeCell(VPIP, cell(12.4, [10, 15], true))).toEqual({ state: 'in' })
    const out = judgeCell(VPIP, cell(19.57, [20, 24], false))
    expect(out.state).toBe('out')
    expect(out.state === 'out' && out.by).toBeCloseTo(-0.43, 5)
    const above = judgeCell(WTSD, cell(30.02, [25, 30], false))
    expect(above.state === 'out' && above.by).toBeCloseTo(0.02, 5)
  })

  it('never reads an unbanded stat as a pass, even when the server says ok (B24)', () => {
    expect(judgeCell(WTSD, cell(37.74, null, true))).toEqual({ state: 'unbanded' })
    expect(cellSpeech(WTSD, cell(37.74, null, true))).toBe('WTSD 37.7%, no target, not judged')
  })

  it('tells no sample from zero', () => {
    expect(judgeCell(VPIP, cell(null, [10, 15], false))).toEqual({ state: 'none' })
    expect(judgeCell(VPIP, cell(0, [10, 15], false)).state).toBe('out')
    expect(judgeCell(VPIP, undefined)).toEqual({ state: 'none' })
    expect(formatStat(VPIP, cell(null, [10, 15], false))).toBe('No sample')
    expect(dotFraction(VPIP, cell(null, [10, 15], false))).toBeNull()
  })

  it('reads a null AF as infinity: no calls to divide by, out of a finite band', () => {
    const inf = cell(null, [1, 2], false)
    expect(formatStat(AF, inf)).toBe('∞')
    expect(judgeCell(AF, inf)).toEqual({ state: 'out', by: null })
    expect(formatDistance(AF, null)).toBe('∞')
    expect(dotFraction(AF, inf)).toBe(1)
    // The server fails infinity even against "4+"; follow it so the count matches the gate.
    expect(judgeCell(AF, cell(null, [4, 99], false)).state).toBe('out')
  })

  it('trusts the server at the band edge (it judged the unrounded value)', () => {
    expect(judgeCell(VPIP, cell(24.0, [20, 24], false)).state).toBe('out')
    expect(judgeCell(VPIP, cell(24.0, [20, 24], null)).state).toBe('in')
  })
})

describe('formatting', () => {
  it('values, bands and distances', () => {
    expect(formatStat(VPIP, cell(12.4, [10, 15], true))).toBe('12.4%')
    expect(formatStat(AF, cell(2.71, [1, 2], false))).toBe('2.71')
    expect(formatBand(VPIP, [10, 15])).toBe('10–15%')
    expect(formatBand(AF, [2.5, 3.5])).toBe('2.5–3.5')
    expect(formatBand(AF, [4, 99])).toBe('4+')
    expect(formatDistance(VPIP, -0.43)).toBe('−0.4')
    expect(formatDistance(WTSD, 0.02)).toBe('+0.02')
    expect(formatDistance(AF, 0.71)).toBe('+0.71')
  })

  it('places values and bands on fixed rails', () => {
    expect(railFraction(VPIP, 35)).toBe(0.5)
    expect(railFraction(VPIP, 120)).toBe(1)
    expect(railFraction(VPIP, -3)).toBe(0)
    expect(bandFractions(AF, [4, 99])).toEqual({ lo: 0.6667, hi: 1, open: true })
    expect(bandFractions(VPIP, [10, 15]).open).toBe(false)
  })
})

describe('rows', () => {
  const rows = resultRows(RESULT, INFO)

  it('says when two seats are pooled into one row (B24)', () => {
    const tag = rows.find((r) => r.name === 'TAG')!
    expect(tag.key).toBe('tag')
    expect(tag.seats).toEqual([2, 6])
    expect(rowContext(tag.seats, tag.hands)).toBe('Seats 2 and 6, read together over 4,000 hands')
    expect(rowContext([1], 2000)).toBe('Seat 1, 2,000 hands')
  })

  it('counts the gated stats out of range per row', () => {
    expect(rows.map((r) => r.gatedOut)).toEqual([2, 3, 0])
  })

  it('carries the unbanded extras as text', () => {
    expect(rows[0].extras.find((e) => e.name === 'ATS')!.text).toBe('26.2%')
    expect(rows[0].extras.find((e) => e.name === 'C-bet')!.text).toBe('no sample')
  })

  it('speaks a whole row', () => {
    const s = rowSpeech(rows[1])
    expect(s).toContain('TAG, seats 2 and 6, read together over 4,000 hands.')
    expect(s).toContain('VPIP 19.6%, target 20 to 24%, out of range by −0.4')
    expect(s).toContain('+64.8 big blinds per 100 hands.')
  })

  it('phrases seats', () => {
    expect(seatPhrase([3])).toBe('Seat 3')
    expect(seatPhrase([1, 3, 5])).toBe('Seats 1, 3 and 5')
    expect(seatPhrase([1, 2, 3, 4, 5, 6])).toBe('All six seats')
    expect(seatsOf(['nit', 'tag', 'tag'], 'tag')).toEqual([2, 3])
  })
})

describe('the gate', () => {
  const rows = resultRows(RESULT, INFO)
  const g = gateSummary(RESULT, rows)

  it('counts gated readings and leaves the unbanded Maniac WTSD out', () => {
    expect(g).toEqual({ pass: false, gated: 11, out: 5, unbanded: ['Maniac WTSD'] })
  })

  it('keeps the caveat with the verdict', () => {
    expect(gateHeadline(g)).toBe('Fails the gate.')
    expect(gateCaveat(g, 2000)).toBe('Indicative, not the gate: 5 of 11 gated stats are out of range after 2,000 hands.')
    const pass = { pass: true, gated: 4, out: 0, unbanded: [] }
    expect(gateHeadline(pass)).toBe('Passes the gate.')
    expect(gateCaveat(pass, 25000)).toBe('Indicative, not the gate: every gated stat is in range after 25,000 hands.')
    expect(gateCaveat({ ...g, out: 1 }, 100)).toContain('1 of 11 gated stat is out of range')
  })

  it('writes the meta line without middle dots', () => {
    expect(metaLine(RESULT)).toBe('2,000 hands, seed 0, 5.2 s')
  })
})

describe('run controls', () => {
  it('parses typed whole numbers', () => {
    expect(parseWhole('5,000')).toBe(5000)
    expect(parseWhole(' 250 ')).toBe(250)
    expect(parseWhole('')).toBeNull()
    expect(parseWhole('1e3')).toBeNull()
    expect(parseWhole('12.5')).toBeNull()
  })

  it('clamps hands to 100..max, so tiny runs never reach the server (B29)', () => {
    expect(clampHands(1, 25000)).toBe(100)
    expect(clampHands(null, 25000)).toBe(100)
    expect(clampHands(99999, 25000)).toBe(25000)
    expect(clampHands(5000.4, 25000)).toBe(5000)
  })

  it('clamps the seed to a whole, non-negative number', () => {
    expect(clampSeed(-4)).toBe(0)
    expect(clampSeed(null)).toBe(0)
    expect(clampSeed(7.6)).toBe(8)
  })

  it('estimates the wait in words', () => {
    expect(estimateText(1000)).toBe('a few seconds')
    expect(estimateText(5000)).toBe('about 15 s')
    expect(estimateText(25000)).toBe('about a minute')
    expect(estimateText(25000, 4)).toBe('about 2 minutes')
    expect(msPerHand({ hands: 2000, elapsed_ms: 5200 })).toBe(2.6)
    expect(msPerHand({ hands: 100, elapsed_ms: 113 })).toBe(2.9)
    expect(msPerHand(null)).toBe(2.9)
  })

  it('formats durations and the ticking count', () => {
    expect(durationText(5180)).toBe('5.2 s')
    expect(durationText(14600)).toBe('15 s')
    expect(durationText(65400)).toBe('1 min 5 s')
    expect(elapsedText(999)).toBe('0 s')
    expect(elapsedText(64000)).toBe('1 min 4 s')
  })
})

describe('tuning', () => {
  it('never points at an archetype that left the lineup (B34)', () => {
    expect(tuneTarget('tag', ['nit', 'tag'], INFO)).toBe('tag')
    expect(tuneTarget('tag', ['nit', 'lag'], INFO)).toBe('nit')
    expect(tuneTarget('maniac', ['nit', 'tag'], INFO)).toBe('tag')
    expect(tuneTarget(null, ['station'], INFO)).toBe('station')
    expect(tuneTarget(null, [], INFO)).toBeNull()
    expect(seatedKeys(['tag', 'nit', 'tag'], INFO)).toEqual(['nit', 'tag'])
  })

  it('snaps knobs to their step without float dust', () => {
    const tb = INFO.knob_meta[0]
    expect(snapKnob(0.0551, tb)).toBe(0.055)
    expect(snapKnob(0.07000000001, tb)).toBe(0.07)
    expect(snapKnob(2, tb)).toBe(0.15)
    expect(snapKnob(0.31, INFO.knob_meta[2])).toBe(0.3)
  })

  it('shows knobs as shares', () => {
    expect(knobText(INFO.knob_meta[0], 0.055)).toBe('5.5%')
    expect(knobText(INFO.knob_meta[1], 0.68)).toBe('68%')
  })

  it('drops an override that is back at its default', () => {
    let o = withKnob({}, 'tag', 'cbet_freq', 0.8, 0.68)
    expect(o).toEqual({ tag: { cbet_freq: 0.8 } })
    expect(isChanged(o, 'tag', 'cbet_freq', 0.68)).toBe(true)
    expect(changedCount(o, 'tag', INFO.archetypes[1].knobs)).toBe(1)
    o = withKnob(o, 'tag', 'cbet_freq', 0.68, 0.68)
    expect(o).toEqual({})
    expect(withoutArch({ tag: { cbet_freq: 0.8 }, nit: { bet_frac: 0.7 } }, 'tag')).toEqual({ nit: { bet_frac: 0.7 } })
  })

  it('sends only the seated archetypes, and keeps the rest for later', () => {
    const o = { tag: { cbet_freq: 0.8 }, station: { bet_frac: 0.7 } }
    expect(seatedOverrides(o, ['tag', 'nit'])).toEqual({ tag: { cbet_freq: 0.8 } })
    expect(unseatedChanged(o, ['tag', 'nit'])).toEqual(['station'])
  })

  it('echoes what a run changed', () => {
    expect(overrideEcho(RESULT, 'tag', INFO)).toEqual(['C-bet freq 68% to 80%'])
    expect(overrideEcho(RESULT, 'nit', INFO)).toEqual([])
  })

  it('keys a run so a changed setup is noticed, whatever the order of the overrides', () => {
    const a = configKey({ lineup: ['nit'], hands: 100, seed: 0, overrides: { tag: { a: 1, b: 2 }, nit: { c: 3 } } })
    const b = configKey({ lineup: ['nit'], hands: 100, seed: 0, overrides: { nit: { c: 3 }, tag: { b: 2, a: 1 } } })
    expect(a).toBe(b)
    expect(configKey({ lineup: ['nit'], hands: 200, seed: 0, overrides: {} })).not.toBe(a)
  })
})

describe('before any run', () => {
  it('shows each seated archetype once, with its targets and no readings', () => {
    const rows = previewRows(['tag', 'maniac', 'tag'], INFO)
    expect(rows.map((r) => [r.name, r.seats])).toEqual([
      ['TAG', [1, 3]],
      ['Maniac', [2]],
    ])
    expect(rows[0].preview).toBe(true)
    expect(rows[0].cells[0].cell!.band).toEqual([20, 24])
    expect(targetsText(rows[1])).toBe('VPIP 50–65%, PFR none, 3-bet none, AF none, WTSD none')
    expect(rowSpeech(rows[0])).toBe('TAG, seats 1 and 3. Not run yet. Targets: VPIP 20 to 24%, PFR none, 3-bet none, AF none, WTSD none.')
  })
})
