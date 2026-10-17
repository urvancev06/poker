// CFR on Kuhn poker: the headline figures, the two convergence charts and the learned
// strategy against the textbook equilibrium. Pure: no React, no DOM. SVG geometry is in
// user units, rounded to 2 dp.
//
// Kuhn poker: three cards (J < Q < K), one card each, one bet allowed. Player 1 acts
// first. Its equilibria form a family with one free parameter, alpha in [0, 1/3]:
//   player 1  J: bet alpha, then fold to a bet     Q: check, then call alpha + 1/3
//             K: bet 3 alpha, then call
//   player 2  facing a bet: J fold, Q call 1/3, K call
//             checked to:   J bet 1/3, Q check, K bet
// The game is worth -1/18 to player 1 at every one of them (Kuhn 1950).

import type { CfrCheckpoint, CfrResult, CfrStrategyRow } from '../api'
import { count } from './stats'

export const ITER_MIN = 1_000
export const ITER_MAX = 500_000
export const ITER_DEFAULT = 50_000
/** Exploitability under this reads as converged. */
export const EXPLOIT_PASS = 0.02
/** A learned game value this close to the exact one reads as a match. */
export const VALUE_TOL = 0.01
export const EXACT_VALUE = -1 / 18

const MINUS = '−'
const r2 = (n: number) => Math.round(n * 100) / 100

/** Iterations for a run: a whole number in 1,000..500,000. */
export function clampIterations(n: number | null): number {
  if (n === null || !Number.isFinite(n)) return ITER_MIN
  return Math.min(Math.max(Math.round(n), ITER_MIN), ITER_MAX)
}

/** About 0.012 ms per iteration (0.7 s for 50,000, 6 s for 500,000). */
export const MS_PER_ITERATION = 0.012

/** How long training will take, in words. */
export function trainEstimate(iterations: number): string {
  const s = (iterations * MS_PER_ITERATION) / 1000
  if (s < 1) return 'under a second'
  if (s < 2.5) return 'a second or two'
  return `about ${Math.round(s)} s`
}

/** A game value with a true minus: -0.0561 -> "−0.0561". */
export function formatValue(v: number, digits = 4): string {
  const s = Math.abs(v).toFixed(digits)
  if (Number(s) === 0) return (0).toFixed(digits)
  return (v < 0 ? MINUS : '') + s
}

export interface CfrFigure {
  key: 'exploitability' | 'learned' | 'exact'
  value: string
  label: string
  /** true / false for a judged figure, null for the exact value (nothing to judge). */
  pass: boolean | null
  /** The pass state in words (never colour alone). */
  note: string
}

export function cfrFigures(r: Pick<CfrResult, 'game_value' | 'equilibrium_value' | 'exploitability'>): CfrFigure[] {
  const off = Math.abs(r.game_value - r.equilibrium_value)
  const close = off < VALUE_TOL
  const converged = r.exploitability < EXPLOIT_PASS
  return [
    {
      key: 'exploitability',
      value: r.exploitability.toFixed(4),
      label: 'Exploitability',
      pass: converged,
      note: converged ? 'Under 0.02' : 'Above 0.02, train longer',
    },
    {
      key: 'learned',
      value: formatValue(r.game_value),
      label: 'Learned game value',
      pass: close,
      note: close ? 'Within 0.01 of exact' : `${formatValue(off)} from exact`,
    },
    { key: 'exact', value: formatValue(r.equilibrium_value), label: 'Exact game value', pass: null, note: `${MINUS}1/18, worked out by hand` },
  ]
}

/** One line for screen readers and the live region once a run lands. */
export function cfrSummary(r: CfrResult): string {
  const [e, l] = cfrFigures(r)
  return `Trained ${count(r.iterations)} iterations. Exploitability ${e.value}, ${e.note.toLowerCase()}. Learned game value ${l.value}, ${l.note.toLowerCase()}.`
}

/* ---------- the charts ---------- */

export const CHART = {
  /** viewBox 0 0 w h; the right-hand gutter holds the scale's labels. */
  w: 560,
  h: 176,
  gutter: 52,
  /** top and bottom air inside the plot */
  pad: 8,
} as const

export interface ChartLine {
  y: number
  label: string
  /** The line the reading is judged by (0.02, or the band's edges). */
  strong?: boolean
}

export interface ExploitBar {
  i: number
  x: number
  w: number
  y: number
  /** A rounded-top bar path. */
  d: string
  point: CfrCheckpoint
}

export interface ExploitChart {
  bars: ExploitBar[]
  lines: ChartLine[]
  base: number
}

/** Exploitability falls roughly as 1/sqrt(iterations), so the scale is logarithmic and
 *  FIXED, 0.001 to 0.5: every run reads on the same scale, and 0.02 is always in the same
 *  place. Values outside it sit at its ends. */
export const EXPLOIT_SCALE = { min: 0.001, max: 0.5 } as const

export function exploitY(v: number): number {
  const top = CHART.pad
  const base = CHART.h - CHART.pad
  const lo = Math.log10(EXPLOIT_SCALE.min)
  const hi = Math.log10(EXPLOIT_SCALE.max)
  const c = Math.min(Math.max(v, EXPLOIT_SCALE.min), EXPLOIT_SCALE.max)
  const f = (Math.log10(c) - lo) / (hi - lo)
  return r2(base - f * (base - top))
}

function barLayout(n: number): { slot: number; w: number } {
  const plot = CHART.w - CHART.gutter
  const slot = n > 0 ? plot / n : plot
  return { slot, w: Math.max(2, slot * 0.62) }
}

/** The plot-x of a checkpoint's centre. */
export function slotCenter(i: number, n: number): number {
  const { slot } = barLayout(n)
  return r2(slot * i + slot / 2)
}

/** Which checkpoint a plot-x falls in (clamped). */
export function slotAt(x: number, n: number): number {
  if (n <= 0) return -1
  const { slot } = barLayout(n)
  return Math.min(n - 1, Math.max(0, Math.floor(x / slot)))
}

function barPath(x: number, w: number, y: number, base: number): string {
  const h = base - y
  if (h <= 0.5) return `M${r2(x)} ${r2(base - 0.5)}h${r2(w)}v0.5h${r2(-w)}Z`
  const r = Math.min(3, w / 2, h)
  return `M${r2(x)} ${r2(base)}V${r2(y + r)}Q${r2(x)} ${r2(y)} ${r2(x + r)} ${r2(y)}H${r2(x + w - r)}Q${r2(x + w)} ${r2(y)} ${r2(x + w)} ${r2(y + r)}V${r2(base)}Z`
}

export function exploitChart(trend: readonly CfrCheckpoint[]): ExploitChart {
  const base = CHART.h - CHART.pad
  const { slot, w } = barLayout(trend.length)
  const bars = trend.map((point, i) => {
    const x = slot * i + (slot - w) / 2
    const y = exploitY(point.exploitability)
    return { i, x: r2(x), w: r2(w), y, d: barPath(x, w, y, base), point }
  })
  const lines: ChartLine[] = [
    { y: exploitY(0.1), label: '0.1' },
    { y: exploitY(EXPLOIT_PASS), label: '0.02', strong: true },
    { y: exploitY(0.01), label: '' },
    { y: exploitY(0.001), label: '0.001' },
  ]
  return { bars, lines, base }
}

export interface ValueDot {
  i: number
  cx: number
  cy: number
  /** Inside exact ± 0.01. */
  near: boolean
  point: CfrCheckpoint
}

export interface ValueChart {
  dots: ValueDot[]
  /** The band's two edges: exact ± 0.01. */
  band: [ChartLine, ChartLine]
  /** Zero, for orientation. */
  zero: ChartLine
}

/** Game value: a FIXED linear scale from 0 (top) down to −0.12, with the band exact ± 0.01
 *  as two hairlines (the My stats band). Dots, not bars: a value settling onto a target. */
export const VALUE_SCALE = { top: 0, bottom: -0.12 } as const

export function valueY(v: number): number {
  const top = CHART.pad
  const base = CHART.h - CHART.pad
  const c = Math.min(Math.max(v, VALUE_SCALE.bottom), VALUE_SCALE.top)
  const f = (VALUE_SCALE.top - c) / (VALUE_SCALE.top - VALUE_SCALE.bottom)
  return r2(top + f * (base - top))
}

export function valueChart(trend: readonly CfrCheckpoint[], exact: number = EXACT_VALUE): ValueChart {
  const dots = trend.map((point, i) => ({
    i,
    cx: slotCenter(i, trend.length),
    cy: valueY(point.game_value),
    near: Math.abs(point.game_value - exact) < VALUE_TOL,
    point,
  }))
  return {
    dots,
    band: [
      { y: valueY(exact + VALUE_TOL), label: '', strong: true },
      { y: valueY(exact - VALUE_TOL), label: '', strong: true },
    ],
    zero: { y: valueY(0), label: '0' },
  }
}

/** "Checkpoint 5 of 20, 1,250 iterations". */
export function checkpointCaption(i: number, n: number, point: CfrCheckpoint): string {
  return `Checkpoint ${i + 1} of ${n}, ${count(point.iterations)} iterations`
}

/** The x-axis ends: "250" and "5,000 iterations". */
export function axisEnds(trend: readonly CfrCheckpoint[]): [string, string] {
  if (!trend.length) return ['', '']
  return [count(trend[0].iterations), `${count(trend[trend.length - 1].iterations)} iterations`]
}

/* ---------- the learned strategy ---------- */

export type KuhnHistory = '' | 'pb' | 'b' | 'p'

export interface KuhnSpot {
  history: KuhnHistory
  player: 1 | 2
  /** The spot, from the acting player's side. */
  title: string
  /** What the frequency counts: a bet, or a call when facing one. */
  action: 'bets' | 'calls'
}

/** Grouped by who acts, in the order the game reaches them. */
export const SPOTS: readonly KuhnSpot[] = [
  { history: '', player: 1, title: 'Opens', action: 'bets' },
  { history: 'pb', player: 1, title: 'Checked, then faces a bet', action: 'calls' },
  { history: 'b', player: 2, title: 'Faces a bet', action: 'calls' },
  { history: 'p', player: 2, title: 'Checked to', action: 'bets' },
]

export interface KuhnTarget {
  /** The textbook frequency (or range of them), 0-1. */
  lo: number
  hi: number
  text: string
}

const THIRD = 1 / 3

function pctText(p: number): string {
  return `${Math.round(p * 100)}%`
}

/** Player 1's bluff with the J, the family's free parameter, clamped into [0, 1/3]. */
export function kuhnAlpha(strategy: readonly CfrStrategyRow[]): number {
  const j = strategy.find((s) => s.card === 'J' && s.history === '')
  return j ? Math.min(Math.max(j.bet, 0), THIRD) : 0
}

/** The equilibrium frequency for a card at a spot, given the learned alpha. */
export function kuhnTarget(card: string, history: string, alpha: number): KuhnTarget | null {
  const point = (p: number, text: string): KuhnTarget => ({ lo: p, hi: p, text })
  const key = `${history}:${card}`
  switch (key) {
    case ':J':
      return { lo: 0, hi: THIRD, text: 'Any of 0 to ⅓' }
    case ':Q':
      return point(0, 'Never')
    case ':K':
      return point(Math.min(1, 3 * alpha), `3 × its J bluff, ${pctText(Math.min(1, 3 * alpha))}`)
    case 'pb:J':
      return point(0, 'Never')
    case 'pb:Q':
      return point(alpha + THIRD, `J bluff + ⅓, ${pctText(alpha + THIRD)}`)
    case 'pb:K':
      return point(1, 'Always')
    case 'b:J':
      return point(0, 'Never')
    case 'b:Q':
      return point(THIRD, '⅓')
    case 'b:K':
      return point(1, 'Always')
    case 'p:J':
      return point(THIRD, '⅓')
    case 'p:Q':
      return point(0, 'Never')
    case 'p:K':
      return point(1, 'Always')
    default:
      return null
  }
}

export interface StrategyRowView {
  infoset: string
  card: string
  /** Probability of the spot's action (bet, or call facing a bet). */
  p: number
  text: string
  target: KuhnTarget | null
}

export interface StrategyGroup {
  spot: KuhnSpot
  rows: StrategyRowView[]
}

export interface StrategyPlayer {
  player: 1 | 2
  groups: StrategyGroup[]
}

const CARD_ORDER: Record<string, number> = { J: 0, Q: 1, K: 2 }

/** The 12 rows, grouped by the player who acts and then by spot, J Q K within each. */
export function strategyGroups(strategy: readonly CfrStrategyRow[]): StrategyPlayer[] {
  const alpha = kuhnAlpha(strategy)
  const groupFor = (spot: KuhnSpot): StrategyGroup => ({
    spot,
    rows: strategy
      .filter((s) => s.history === spot.history)
      .toSorted((a, b) => (CARD_ORDER[a.card] ?? 9) - (CARD_ORDER[b.card] ?? 9))
      .map((s) => ({ infoset: s.infoset, card: s.card, p: s.bet, text: pctText(s.bet), target: kuhnTarget(s.card, s.history, alpha) })),
  })
  return ([1, 2] as const).map((player) => ({
    player,
    groups: SPOTS.filter((s) => s.player === player)
      .map(groupFor)
      .filter((g) => g.rows.length > 0),
  }))
}
