import { describe, expect, it } from 'vitest'
import type { CfrResult } from '../api'
import {
  CHART,
  EXACT_VALUE,
  axisEnds,
  cfrFigures,
  cfrSummary,
  checkpointCaption,
  clampIterations,
  exploitChart,
  exploitY,
  formatValue,
  kuhnAlpha,
  kuhnTarget,
  slotAt,
  slotCenter,
  strategyGroups,
  trainEstimate,
  valueChart,
  valueY,
} from './labCfr'

// samples/lab_cfr_5000.json (real API output), trend trimmed to its first and last points.
const STRATEGY: CfrResult['strategy'] = [
  { infoset: '0:', card: 'J', history: '', label: 'J — open', pass: 0.771, bet: 0.229 },
  { infoset: '1:', card: 'Q', history: '', label: 'Q — open', pass: 0.99, bet: 0.01 },
  { infoset: '2:', card: 'K', history: '', label: 'K — open', pass: 0.32, bet: 0.68 },
  { infoset: '0:b', card: 'J', history: 'b', label: 'J — facing a bet', pass: 0.999, bet: 0.001 },
  { infoset: '1:b', card: 'Q', history: 'b', label: 'Q — facing a bet', pass: 0.647, bet: 0.353 },
  { infoset: '2:b', card: 'K', history: 'b', label: 'K — facing a bet', pass: 0, bet: 1 },
  { infoset: '0:p', card: 'J', history: 'p', label: 'J — checked to', pass: 0.685, bet: 0.315 },
  { infoset: '1:p', card: 'Q', history: 'p', label: 'Q — checked to', pass: 0.997, bet: 0.003 },
  { infoset: '2:p', card: 'K', history: 'p', label: 'K — checked to', pass: 0, bet: 1 },
  { infoset: '0:pb', card: 'J', history: 'pb', label: 'J — checked, facing a bet', pass: 1, bet: 0 },
  { infoset: '1:pb', card: 'Q', history: 'pb', label: 'Q — checked, facing a bet', pass: 0.408, bet: 0.592 },
  { infoset: '2:pb', card: 'K', history: 'pb', label: 'K — checked, facing a bet', pass: 0, bet: 1 },
]
const RESULT: CfrResult = {
  iterations: 5000,
  game_value: -0.0561,
  equilibrium_value: -0.0556,
  exploitability: 0.0162,
  trend: [
    { iterations: 250, game_value: -0.0583, exploitability: 0.0758 },
    { iterations: 500, game_value: -0.0615, exploitability: 0.0673 },
    { iterations: 5000, game_value: -0.0561, exploitability: 0.0162 },
  ],
  strategy: STRATEGY,
}

describe('figures', () => {
  it('judges exploitability under 0.02 and the learned value within 0.01, in words', () => {
    const [e, l, x] = cfrFigures(RESULT)
    expect(e).toMatchObject({ value: '0.0162', pass: true, note: 'Under 0.02' })
    expect(l).toMatchObject({ value: '−0.0561', pass: true, note: 'Within 0.01 of exact' })
    expect(x).toMatchObject({ value: '−0.0556', pass: null })
    const early = cfrFigures({ game_value: -0.0981, equilibrium_value: -0.0556, exploitability: 0.3874 })
    expect(early[0]).toMatchObject({ pass: false, note: 'Above 0.02, train longer' })
    expect(early[1]).toMatchObject({ pass: false, note: '0.0425 from exact' })
  })

  it('summarises a run for the live region', () => {
    expect(cfrSummary(RESULT)).toBe('Trained 5,000 iterations. Exploitability 0.0162, under 0.02. Learned game value −0.0561, within 0.01 of exact.')
  })

  it('uses a true minus and no negative zero', () => {
    expect(formatValue(-0.0556)).toBe('−0.0556')
    expect(formatValue(-0.00001)).toBe('0.0000')
    expect(EXACT_VALUE).toBeCloseTo(-0.0556, 4)
  })

  it('estimates training time in words', () => {
    expect(trainEstimate(50000)).toBe('under a second')
    expect(trainEstimate(150000)).toBe('a second or two')
    expect(trainEstimate(500000)).toBe('about 6 s')
  })

  it('clamps iterations to 1,000..500,000 (a larger number used to show "[object Object]", B30)', () => {
    expect(clampIterations(600000)).toBe(500000)
    expect(clampIterations(12)).toBe(1000)
    expect(clampIterations(null)).toBe(1000)
    expect(clampIterations(20000.4)).toBe(20000)
  })
})

describe('charts', () => {
  it('puts exploitability on a fixed log scale, so 0.02 always sits in one place', () => {
    const base = CHART.h - CHART.pad
    expect(exploitY(0.001)).toBe(base)
    expect(exploitY(0.5)).toBe(CHART.pad)
    expect(exploitY(10)).toBe(CHART.pad)
    expect(exploitY(0.0001)).toBe(base)
    // a decade is the same height wherever it is
    expect(exploitY(0.01) - exploitY(0.1)).toBeCloseTo(exploitY(0.001) - exploitY(0.01), 1)
    const c = exploitChart(RESULT.trend)
    expect(c.bars).toHaveLength(3)
    expect(c.lines.find((l) => l.strong)!.label).toBe('0.02')
    expect(c.bars[0].y).toBeLessThan(c.bars[2].y)
    for (const b of c.bars) expect(b.x + b.w).toBeLessThanOrEqual(CHART.w - CHART.gutter)
  })

  it('draws game value as dots on a fixed linear scale with the exact ± 0.01 band', () => {
    expect(valueY(0)).toBe(CHART.pad)
    expect(valueY(-0.12)).toBe(CHART.h - CHART.pad)
    expect(valueY(-1)).toBe(CHART.h - CHART.pad)
    const v = valueChart(RESULT.trend)
    expect(v.dots.map((d) => d.near)).toEqual([true, true, true])
    expect(v.band[0].y).toBeLessThan(v.band[1].y)
    expect(valueChart([{ iterations: 50, game_value: -0.0981, exploitability: 0.38 }]).dots[0].near).toBe(false)
  })

  it('maps pointer x to a checkpoint and back', () => {
    const n = 20
    for (const i of [0, 7, 19]) expect(slotAt(slotCenter(i, n), n)).toBe(i)
    expect(slotAt(-50, n)).toBe(0)
    expect(slotAt(9999, n)).toBe(19)
    expect(slotAt(10, 0)).toBe(-1)
  })

  it('labels checkpoints and the axis ends', () => {
    expect(checkpointCaption(1, 20, RESULT.trend[1])).toBe('Checkpoint 2 of 20, 500 iterations')
    expect(axisEnds(RESULT.trend)).toEqual(['250', '5,000 iterations'])
    expect(axisEnds([])).toEqual(['', ''])
  })
})

describe('the learned strategy', () => {
  it('groups the 12 rows by the player who acts', () => {
    const players = strategyGroups(STRATEGY)
    expect(players.map((p) => p.player)).toEqual([1, 2])
    expect(players[0].groups.map((g) => g.spot.title)).toEqual(['Opens', 'Checked, then faces a bet'])
    expect(players[1].groups.map((g) => g.spot.title)).toEqual(['Faces a bet', 'Checked to'])
    expect(players.flatMap((p) => p.groups.flatMap((g) => g.rows))).toHaveLength(12)
    expect(players[0].groups[0].rows.map((r) => `${r.card} ${r.text}`)).toEqual(['J 23%', 'Q 1%', 'K 68%'])
  })

  it('holds each frequency against the textbook equilibrium, tied to the learned J bluff', () => {
    const a = kuhnAlpha(STRATEGY)
    expect(a).toBeCloseTo(0.229, 5)
    expect(kuhnTarget('J', '', a)).toMatchObject({ lo: 0, text: 'Any of 0 to ⅓' })
    expect(kuhnTarget('K', '', a)).toMatchObject({ text: '3 × its J bluff, 69%' })
    expect(kuhnTarget('Q', 'pb', a)!.lo).toBeCloseTo(0.229 + 1 / 3, 5)
    expect(kuhnTarget('Q', 'b', a)!.text).toBe('⅓')
    expect(kuhnTarget('J', 'p', a)!.lo).toBeCloseTo(1 / 3, 5)
    expect(kuhnTarget('K', 'b', a)!.text).toBe('Always')
    expect(kuhnTarget('A', '', a)).toBeNull()
    // alpha is clamped into the equilibrium family's range
    expect(kuhnAlpha([{ ...STRATEGY[0], bet: 0.9 }])).toBeCloseTo(1 / 3, 5)
    expect(kuhnAlpha([])).toBe(0)
  })
})
