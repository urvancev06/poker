// My stats geometry: the readiness ring and the trend charts. Pure functions of the data,
// in SVG user units, rounded to 2 dp (rendering-svg-precision).

import type { HeroStatLine } from '../api'
import { GATES, count, formatValue, type Band } from './stats'

const r2 = (n: number) => Math.round(n * 100) / 100

/* ---------- the readiness ring: one arc per gate, labelled where each ends ---------- */

export const GATE_RING = {
  /** viewBox 0 0 320 320 */
  size: 320,
  c: 160,
  r: 132,
  stroke: 16,
  /** degrees of air between arcs (the caps are round) */
  gap: 7,
  /** gate numbers sit just outside the gap where their arc ends */
  labelR: 156,
} as const

/** The point at `deg` (0 = twelve o'clock, clockwise) on a circle of radius r. */
export function ringPoint(deg: number, r: number = GATE_RING.r): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [r2(GATE_RING.c + r * Math.cos(a)), r2(GATE_RING.c + r * Math.sin(a))]
}

/** A clockwise arc path from a0 to a1 degrees. */
export function arcPath(a0: number, a1: number, r: number = GATE_RING.r): string {
  const [x0, y0] = ringPoint(a0, r)
  const [x1, y1] = ringPoint(a1, r)
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

export interface GateArc {
  gate: number
  /** The hands range this arc covers. */
  lo: number
  hi: number
  track: string
  /** null when nothing of this arc is filled yet. */
  fill: string | null
  fraction: number
  label: { x: number; y: number; text: string }
  /** The gate the window is working towards now (its number reads brighter). */
  next: boolean
}

export function gateArcs(windowHands: number): GateArc[] {
  const n = Math.max(0, windowHands)
  const span = 360 / GATES.length
  return GATES.map((hi, i) => {
    const lo = i === 0 ? 0 : GATES[i - 1]
    const a0 = i * span + GATE_RING.gap / 2
    const a1 = (i + 1) * span - GATE_RING.gap / 2
    const fraction = Math.max(0, Math.min(1, (n - lo) / (hi - lo)))
    const fill = fraction > 0 ? arcPath(a0, a0 + Math.max(0.5, (a1 - a0) * fraction)) : null
    const [x, y] = ringPoint((i + 1) * span, GATE_RING.labelR)
    return {
      gate: hi,
      lo,
      hi,
      track: arcPath(a0, a1),
      fill,
      fraction,
      label: { x, y: r2(y + 4), text: count(hi) },
      next: n < hi && n >= lo,
    }
  })
}

/* ---------- the trend: 8 slices on fixed scales ---------- */

export interface TrendDef {
  key: 'vpip' | 'pfr' | 'af' | 'wtsd'
  name: string
  /** Fixed scale maximum, so peaks compare across slices and windows. */
  max: number
  ratio?: boolean
  /** A slice is judged only once it holds this many hands (the same gate as its row). */
  gate: number
  /** What a slice with no value means, short enough for the figure's place. */
  none: string
}

export const TREND_STATS: readonly TrendDef[] = [
  { key: 'vpip', name: 'VPIP', max: 100, gate: 500, none: 'No hands' },
  { key: 'pfr', name: 'PFR', max: 100, gate: 500, none: 'No hands' },
  { key: 'af', name: 'AF', max: 6, ratio: true, gate: 2000, none: 'No postflop calls' },
  { key: 'wtsd', name: 'WTSD', max: 100, gate: 2000, none: 'No flops seen' },
]

/** The trend appears from 40 hands (the backend fills it from 8 x 5). */
export const TREND_MIN_HANDS = 40

export function showTrend(windowHands: number, trend: readonly unknown[] | null | undefined): boolean {
  return windowHands >= TREND_MIN_HANDS && !!trend && trend.length > 1
}

/** "8 slices of about 29 hands, oldest first". */
export function trendCaption(windowHands: number, slices: number): string {
  if (slices <= 0) return ''
  return `${slices} slices of about ${count(Math.floor(windowHands / slices))} hands, oldest first`
}

/** Below 40 hands: "Shows from 40 hands, 6 to go". */
export function trendWaiting(windowHands: number): string {
  return `Shows from ${TREND_MIN_HANDS} hands, ${count(Math.max(0, TREND_MIN_HANDS - windowHands))} to go`
}

export const CHART = { w: 248, h: 120, top: 6, base: 118, bar: 16 } as const

export interface TrendMark {
  i: number
  hands: number
  value: number | null
  /** Left edge of the slice's bar. */
  x: number
  /** The slot this slice owns, for pointing at it (centre +/- half a pitch). */
  cx: number
  /** 'bar' has a value (a real 0 is a flat 2-unit bar); 'none' is a hollow marker, never a bar (B31). */
  kind: 'bar' | 'none'
  /** Bar outline (rounded top corners); '' for 'none'. */
  d: string
  /** Top of the bar (y). */
  y: number
  /** Judged only when the slice alone holds enough hands for the stat. */
  judged: boolean
  inBand: boolean
}

export interface TrendChart {
  def: TrendDef
  marks: TrendMark[]
  /** The band's two edges as y (hi edge first), or null with no band. */
  bandY: readonly [number, number] | null
  /** Distance between slot centres. */
  pitch: number
}

export function chartY(def: Pick<TrendDef, 'max'>, v: number): number {
  const { top, base } = CHART
  return r2(base - (Math.max(0, Math.min(def.max, v)) / def.max) * (base - top))
}

/** A bar from the baseline up to height h with rounded top corners. */
export function barPath(x: number, h: number): string {
  const { base, bar } = CHART
  const r = Math.min(4, h)
  const t = r2(base - h)
  return `M${r2(x)} ${base}V${r2(t + r)}Q${r2(x)} ${t} ${r2(x + r)} ${t}H${r2(x + bar - r)}Q${r2(x + bar)} ${t} ${r2(x + bar)} ${r2(t + r)}V${base}Z`
}

export function trendChart(trend: readonly HeroStatLine[], def: TrendDef, band: Band | null | undefined): TrendChart {
  const n = trend.length
  const { w, base, bar } = CHART
  const gap = n > 1 ? (w - n * bar) / (n - 1) : 0
  const pitch = r2(bar + gap)
  const marks = trend.map((slice, i): TrendMark => {
    const raw = slice[def.key]
    const value = raw == null || !Number.isFinite(raw) ? null : raw
    const x = r2(i * (bar + gap))
    const cx = r2(x + bar / 2)
    const judged = slice.hands >= def.gate
    if (value === null) return { i, hands: slice.hands, value, x, cx, kind: 'none', d: '', y: base, judged, inBand: false }
    const y = chartY(def, value)
    const h = Math.max(2, base - y)
    const inBand = judged && !!band && value >= band[0] && value <= band[1]
    return { i, hands: slice.hands, value, x, cx, kind: 'bar', d: barPath(x, h), y: r2(base - h), judged, inBand }
  })
  const bandY = band ? ([Math.round(chartY(def, band[1])) + 0.5, Math.round(chartY(def, band[0])) + 0.5] as const) : null
  return { def, marks, bandY, pitch }
}

/** Which slice a horizontal position (in chart units) points at. */
export function sliceAt(xUnits: number, chart: Pick<TrendChart, 'marks' | 'pitch'>): number {
  const n = chart.marks.length
  if (n === 0) return -1
  if (n === 1 || chart.pitch <= 0) return 0
  const i = Math.round((xUnits - CHART.bar / 2) / chart.pitch)
  return Math.max(0, Math.min(n - 1, i))
}

/** The value of a slice as text: "93.5%", "0.00", or, with no value, the stat's words for
 *  why ("No postflop calls"), never a dash in the figure's place. */
export function sliceValue(def: TrendDef, mark: Pick<TrendMark, 'value'>): string {
  return mark.value == null ? def.none : formatValue(def, mark.value)
}

/** "Slice 3 of 8, 29 hands" */
export function sliceCaption(mark: Pick<TrendMark, 'i' | 'hands'>, slices: number): string {
  return `Slice ${mark.i + 1} of ${slices}, ${count(mark.hands)} ${mark.hands === 1 ? 'hand' : 'hands'}`
}

/** One slice for a screen reader. */
export function sliceLabel(def: TrendDef, mark: TrendMark, slices: number): string {
  const v = mark.value == null ? `${def.none} in this slice` : `${def.name} ${formatValue(def, mark.value)}`
  return `${sliceCaption(mark, slices)}: ${v}${mark.inBand ? ', in range' : ''}.`
}
