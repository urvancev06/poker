import { describe, expect, it } from 'vitest'
import type { HeroStatLine } from '../api'
import {
  CHART,
  GATE_RING,
  TREND_STATS,
  arcPath,
  barPath,
  chartY,
  gateArcs,
  ringPoint,
  showTrend,
  sliceAt,
  sliceCaption,
  sliceLabel,
  sliceValue,
  trendCaption,
  trendChart,
  trendWaiting,
} from './statsCharts'

const VPIP = TREND_STATS.find((d) => d.key === 'vpip')!
const AF = TREND_STATS.find((d) => d.key === 'af')!
const WTSD = TREND_STATS.find((d) => d.key === 'wtsd')!

function slice(hands: number, over: Partial<HeroStatLine> = {}): HeroStatLine {
  return { hands, vpip: 50, pfr: 20, threebet: 8, ats: 30, af: 2, wtsd: 28, wsd: 50, wwsf: 50, cbet: 60, net_bb_per_100: 0, ...over }
}

describe('the readiness ring', () => {
  it('starts at twelve o’clock and runs clockwise', () => {
    expect(ringPoint(0)).toEqual([160, 28])
    expect(ringPoint(90)).toEqual([292, 160])
    expect(arcPath(0, 90)).toBe('M160 28A132 132 0 0 1 292 160')
    expect(arcPath(0, 200)).toContain(' 0 1 1 ')
  })

  it('has one arc per gate with air between them, labelled where each ends', () => {
    const arcs = gateArcs(234)
    expect(arcs.map((a) => [a.lo, a.hi])).toEqual([
      [0, 500],
      [500, 2000],
      [2000, 3000],
    ])
    expect(arcs.map((a) => a.label.text)).toEqual(['500', '2,000', '3,000'])
    // the 3,000 label sits at the top, 500 lower right, 2,000 lower left
    expect(arcs[2].label.x).toBeCloseTo(GATE_RING.c, 1)
    expect(arcs[0].label.x).toBeGreaterThan(GATE_RING.c)
    expect(arcs[1].label.x).toBeLessThan(GATE_RING.c)
  })

  it('fills the arc being worked on and marks it next', () => {
    const arcs = gateArcs(234)
    expect(arcs[0].fraction).toBeCloseTo(0.468, 3)
    expect(arcs[0].fill).not.toBeNull()
    expect(arcs[1].fill).toBeNull()
    expect(arcs.map((a) => a.next)).toEqual([true, false, false])
    expect(gateArcs(2500).map((a) => a.next)).toEqual([false, false, true])
    expect(gateArcs(2500).map((a) => a.fraction)).toEqual([1, 1, 0.5])
  })

  it('draws no fill and marks the first gate at 0 hands; none is next past 3,000', () => {
    expect(gateArcs(0).every((a) => a.fill === null)).toBe(true)
    expect(gateArcs(0)[0].next).toBe(true)
    expect(gateArcs(5000).some((a) => a.next)).toBe(false)
  })
})

describe('the trend', () => {
  it('appears from 40 hands with more than one slice', () => {
    expect(showTrend(39, [1, 2])).toBe(false)
    expect(showTrend(40, [1, 2, 3])).toBe(true)
    expect(showTrend(234, [])).toBe(false)
    expect(trendCaption(234, 8)).toBe('8 slices of about 29 hands, oldest first')
    expect(trendWaiting(34)).toBe('Shows from 40 hands, 6 to go')
    expect(trendWaiting(0)).toBe('Shows from 40 hands, 40 to go')
  })

  it('uses fixed scales so slices compare', () => {
    expect(chartY(VPIP, 0)).toBe(CHART.base)
    expect(chartY(VPIP, 100)).toBe(CHART.top)
    expect(chartY(AF, 6)).toBe(CHART.top)
    expect(chartY(AF, 60)).toBe(CHART.top)
  })

  it('draws a null slice as a hollow marker, never a zero bar (B31)', () => {
    const chart = trendChart([slice(29, { af: 0.32 }), slice(29, { af: 0 }), slice(29, { af: null })], AF, [2.5, 3.5])
    const [a, zero, none] = chart.marks
    expect(a.kind).toBe('bar')
    expect(zero.kind).toBe('bar')
    expect(zero.value).toBe(0)
    expect(zero.y).toBe(CHART.base - 2)
    expect(none.kind).toBe('none')
    expect(none.value).toBeNull()
    expect(none.d).toBe('')
    expect(none.inBand).toBe(false)
  })

  it('never judges a slice below its gate, even inside the band', () => {
    const small = trendChart([slice(29, { vpip: 24 }), slice(31, { vpip: 24 })], VPIP, [22, 26])
    expect(small.marks.every((m) => !m.judged && !m.inBand)).toBe(true)
    const big = trendChart([slice(600, { vpip: 24 }), slice(600, { vpip: 40 })], VPIP, [22, 26])
    expect(big.marks.map((m) => m.inBand)).toEqual([true, false])
    const wtsd = trendChart([slice(600, { wtsd: 28 })], WTSD, [25, 30])
    expect(wtsd.marks[0].judged).toBe(false)
  })

  it('keeps the band as two crisp edges', () => {
    const chart = trendChart([slice(29), slice(29)], AF, [2.5, 3.5])
    expect(chart.bandY).toEqual([Math.round(chartY(AF, 3.5)) + 0.5, Math.round(chartY(AF, 2.5)) + 0.5])
    expect(trendChart([slice(29), slice(29)], AF, null).bandY).toBeNull()
  })

  it('spreads 8 slices across the chart width', () => {
    const chart = trendChart(Array.from({ length: 8 }, () => slice(29)), VPIP, [22, 26])
    expect(chart.marks[0].x).toBe(0)
    expect(chart.marks[7].x + CHART.bar).toBeCloseTo(CHART.w, 1)
    expect(sliceAt(0, chart)).toBe(0)
    expect(sliceAt(CHART.w, chart)).toBe(7)
    expect(sliceAt(chart.marks[3].cx + 1, chart)).toBe(3)
    expect(sliceAt(-50, chart)).toBe(0)
  })

  it('rounds bar corners and keeps a flat zero bar', () => {
    expect(barPath(0, 40)).toBe('M0 118V82Q0 78 4 78H12Q16 78 16 82V118Z')
    expect(barPath(10, 2)).toBe('M10 118V118Q10 116 12 116H24Q26 116 26 118V118Z')
  })

  it('reads slices out', () => {
    const chart = trendChart([slice(29, { af: null }), slice(31, { af: 0 })], AF, [2.5, 3.5])
    expect(sliceValue(AF, chart.marks[0])).toBe('No postflop calls')
    expect(sliceValue(AF, chart.marks[1])).toBe('0.00')
    expect(sliceCaption(chart.marks[1], 8)).toBe('Slice 2 of 8, 31 hands')
    expect(sliceLabel(AF, chart.marks[0], 8)).toBe('Slice 1 of 8, 29 hands: No postflop calls in this slice.')
    expect(sliceLabel(AF, chart.marks[1], 8)).toBe('Slice 2 of 8, 31 hands: AF 0.00.')
  })
})
