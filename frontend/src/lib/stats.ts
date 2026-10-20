// My stats: the nine stats, the sample gates that make each one readable, and how a
// value reads against its target band. Pure: no React, no DOM.
//
// Rules carried over from the old view and the inventory (§13):
// - A target is a RANGE, never a point. The band is always drawn; only the value moves.
// - Nothing is judged until the window holds enough hands for that stat (its gate).
//   Gating uses the window's hands, not the stat's own denominator.
// - null means "never measured" (an empty denominator; for AF, no postflop calls, which
//   the backend sends as null for infinity). It is never 0, never placed on a rail.

import type { DecisionTime, HeroStatLine, StatsWindow } from '../api'
import { describeError, type ApiError } from './apiError'
import { count } from './format'

export { count }

export const GATES = [500, 2000, 3000] as const
export type Gate = (typeof GATES)[number]

export type StatKey = 'vpip' | 'pfr' | 'threebet' | 'ats' | 'af' | 'wtsd' | 'wsd' | 'wwsf' | 'cbet'

export interface StatDef {
  key: StatKey
  name: string
  /** Hands in the window before the stat is judged. */
  gate: Gate
  /** What it measures (one clause, no full stop). */
  what: string
  /** Why it can have no value yet (shown instead of a number's meaning when null). */
  none: string
  /** AF is a ratio: 2 dp, no %, a 0-6 rail. Everything else is a percentage on 0-100. */
  ratio?: boolean
}

/** The nine, in the order they are read within their gate. */
export const STATS: readonly StatDef[] = [
  { key: 'vpip', name: 'VPIP', gate: 500, what: 'Hands you put money in', none: 'No hands yet' },
  { key: 'pfr', name: 'PFR', gate: 500, what: 'Hands you raise before the flop', none: 'No hands yet' },
  { key: 'threebet', name: '3-bet', gate: 3000, what: 'Re-raises before the flop, counted per chance (about 0.4 a hand)', none: 'No raises faced yet' },
  { key: 'ats', name: 'ATS', gate: 2000, what: 'Steals from late position; steal spots are about 15% of hands', none: 'No steal spots yet' },
  { key: 'af', name: 'AF', gate: 2000, what: 'Bets and raises per call, postflop only', none: 'No postflop calls yet, so there is nothing to divide by', ratio: true },
  { key: 'wtsd', name: 'WTSD', gate: 2000, what: 'Flops you take to showdown, per flop seen', none: 'No flops seen yet' },
  { key: 'wsd', name: 'W$SD', gate: 3000, what: 'Showdowns you win', none: 'No showdowns yet' },
  { key: 'wwsf', name: 'WWSF', gate: 2000, what: 'Flops you go on to win, per flop seen', none: 'No flops seen yet' },
  { key: 'cbet', name: 'C-bet', gate: 2000, what: 'Follow-up bets on the flop, per chance', none: 'No c-bet chances yet' },
]

/** The window selector. `last: null` is lifetime. */
export const WINDOWS = [
  { id: 'all', last: null, label: 'Lifetime', short: 'Lifetime' },
  { id: '500', last: 500, label: 'Last 500', short: '500' },
  { id: '2000', last: 2000, label: 'Last 2,000', short: '2,000' },
  { id: '5000', last: 5000, label: 'Last 5,000', short: '5,000' },
] as const
export type WindowId = (typeof WINDOWS)[number]['id']

export function windowLast(id: WindowId): number | null {
  return WINDOWS.find((w) => w.id === id)?.last ?? null
}

export type Band = readonly [number, number]

/** The target band for a stat from the API's `targets`, or null when it is missing or malformed. */
export function bandFor(targets: Readonly<Record<string, unknown>> | null | undefined, key: string): Band | null {
  const b = targets?.[key]
  if (!Array.isArray(b) || b.length !== 2) return null
  const [lo, hi] = b as unknown[]
  return typeof lo === 'number' && typeof hi === 'number' && Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? [lo, hi] : null
}

const MINUS = '−'

/** "1 hand", "234 hands". */
export function hands(n: number): string {
  return `${count(n)} ${n === 1 ? 'hand' : 'hands'}`
}

const fixed = new Map<number, Intl.NumberFormat>()
function fixedFormat(digits: number): Intl.NumberFormat {
  let f = fixed.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    fixed.set(digits, f)
  }
  return f
}

/** Fixed precision with a sign and thousands separators; U+2212 for minus, no sign on zero. */
export function signedFixed(n: number, digits: number): string {
  if (Number(Math.abs(n).toFixed(digits)) === 0) return (0).toFixed(digits)
  return (n > 0 ? '+' : MINUS) + fixedFormat(digits).format(Math.abs(n))
}

export function unit(def: Pick<StatDef, 'ratio'>): string {
  return def.ratio ? '' : '%'
}

/** 85.9 -> "85.9%", AF 0.04 -> "0.04", null -> "—". */
export function formatValue(def: Pick<StatDef, 'ratio'>, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return def.ratio ? v.toFixed(2) : `${v.toFixed(1)}%`
}

/** [22, 26] -> "22–26%", AF [2.5, 3.5] -> "2.5–3.5". */
export function formatBand(def: Pick<StatDef, 'ratio'>, band: Band): string {
  return `${band[0]}–${band[1]}${unit(def)}`
}

/** The same band for a screen reader: "22 to 26%". */
export function speakBand(def: Pick<StatDef, 'ratio'>, band: Band): string {
  return `${band[0]} to ${band[1]}${unit(def)}`
}

/** The rail's scale maximum: fixed per stat so a value always sits in the same place. */
export function scaleMax(def: Pick<StatDef, 'ratio'>): number {
  return def.ratio ? 6 : 100
}

/** A value's place on its rail, 0-100 (%), clamped to the rail's ends. */
export function railPct(def: Pick<StatDef, 'ratio'>, v: number): number {
  const max = scaleMax(def)
  const p = (Math.min(Math.max(v, 0), max) / max) * 100
  return Math.round(p * 100) / 100
}

export type Judgement =
  /** Too few hands for this stat, or no band to hold it against. */
  | { state: 'unjudged'; reason: 'sample' | 'band' }
  /** Enough hands, but never measured (null). */
  | { state: 'none' }
  | { state: 'in' }
  /** Outside the band by `by` (signed: below is negative, above positive). */
  | { state: 'out'; by: number }

export function judge(value: number | null | undefined, band: Band | null | undefined, windowHands: number, gate: number): Judgement {
  if (windowHands < gate) return { state: 'unjudged', reason: 'sample' }
  if (value == null || !Number.isFinite(value)) return { state: 'none' }
  if (!band) return { state: 'unjudged', reason: 'band' }
  if (value < band[0]) return { state: 'out', by: value - band[0] }
  if (value > band[1]) return { state: 'out', by: value - band[1] }
  return { state: 'in' }
}

/** The right-hand state text of a judged row: "In range", "+59.9", "Not measured". */
export function stateText(def: Pick<StatDef, 'ratio'>, j: Judgement): string {
  switch (j.state) {
    case 'in':
      return 'In range'
    case 'out':
      return signedFixed(j.by, def.ratio ? 2 : 1)
    case 'none':
      return 'Not measured'
    default:
      return ''
  }
}

/** A row's accessible name: value, target, and how it reads. */
export function rowLabel(def: StatDef, value: number | null | undefined, band: Band | null | undefined, j: Judgement): string {
  const parts = [`${def.name}: ${value == null ? def.none : formatValue(def, value)}.`]
  if (band) parts.push(`Target ${speakBand(def, band)}.`)
  switch (j.state) {
    case 'in':
      parts.push('In range.')
      break
    case 'out':
      parts.push(`Out of range by ${signedFixed(j.by, def.ratio ? 2 : 1)}.`)
      break
    case 'none':
      parts.push('Not measured yet.')
      break
    default:
      parts.push(j.reason === 'band' ? 'No target to judge it against.' : `Not read yet, readable at ${count(def.gate)} hands.`)
  }
  return parts.join(' ')
}

/** The row's definition, shown when it is opened. `value` undefined: not known yet (loading). */
export function rowDefinition(def: StatDef, value: number | null | undefined, band: Band | null | undefined): string {
  const lines = [`${def.what}.`]
  if (band) lines.push(`Target ${formatBand(def, band)}.`)
  lines.push(`Read from ${count(def.gate)} hands.`)
  if (value === null) lines.push(`${def.none}.`)
  return lines.join(' ')
}

export interface StatGroup {
  gate: Gate
  /** Hands still needed (0 once ready). */
  left: number
  ready: boolean
  stats: StatDef[]
}

/** The nine grouped by the gate that makes them readable, nearest gate first. */
export function groupStats(windowHands: number): StatGroup[] {
  return GATES.map((gate) => {
    const left = Math.max(0, gate - windowHands)
    return { gate, left, ready: left === 0, stats: STATS.filter((s) => s.gate === gate) }
  })
}

/** "266 to go" or "Ready". */
export function groupStatus(g: Pick<StatGroup, 'left'>): string {
  return g.left > 0 ? `${count(g.left)} to go` : 'Ready'
}

/** B24: a "Last N" window larger than the hands on record says so. */
export function windowNote(last: number | null | undefined, windowHands: number): string {
  if (!last || windowHands <= 0 || windowHands >= last) return ''
  return windowHands === 1 ? 'Showing your only hand' : `Showing all ${count(windowHands)} hands`
}

/** A refresh failed while the last figures are still on screen: the status-chosen headline
 *  ("Can't reach the server.") plus a warning that they may be old. */
export function staleHeadline(err: ApiError): string {
  return `${describeError(err, 'stats').headline} These figures may be out of date.`
}

/** The readiness ring's accessible name. */
export function ringLabel(windowHands: number): string {
  const next = GATES.find((g) => windowHands < g)
  const lead = `${hands(windowHands)}.`
  if (next === undefined) return `${lead} Every stat can be read.`
  return `${lead} ${count(next - windowHands)} more until the stats readable at ${count(next)} hands.`
}

export interface DecisionFact {
  value: string
  note: string
}

/** "8.3" s per decision, with its note; null when nothing was timed. */
export function decisionFact(dt: DecisionTime | null | undefined): DecisionFact | null {
  if (!dt || dt.n <= 0 || dt.median_s == null || !Number.isFinite(dt.median_s)) return null
  const of = dt.n === 1 ? 'your one timed decision' : `${count(dt.n)} decisions`
  return {
    value: dt.median_s.toFixed(1),
    note: `Median of ${of}. Wall clock, so pauses count too.`,
  }
}

export interface ResultFact {
  /** "−979.9" */
  value: string
  /** The variance caveat, behind the info button. */
  note: string
  /** Shown under the figure only when the blinds changed inside the window. */
  mixed: string | null
}

/** bb/100, deliberately subordinate. bb/100 is measured at the most recent blind level. */
export function resultFact(overall: Pick<HeroStatLine, 'hands' | 'net_bb_per_100'>, win: StatsWindow | null | undefined): ResultFact | null {
  if (overall.hands <= 0 || !Number.isFinite(overall.net_bb_per_100)) return null
  const bb = win?.big_blind
  const atLevel = win?.hands_at_this_blind
  const where = bb ? `, measured at big blind ${count(bb)}` : ''
  const note = `Big blinds won per 100 hands${where}. Noisy until tens of thousands of hands, so judge the decisions, not this.`
  const mixed =
    bb && atLevel != null && atLevel < overall.hands ? `${count(atLevel)} of ${hands(overall.hands)} at big blind ${count(bb)}` : null
  return { value: signedFixed(overall.net_bb_per_100, 1), note, mixed }
}

/** Fold to steal: returned without a target band, so shown quietly and never judged.
 *  null: the API did not send it; `value` null: no steal faced yet. */
export function foldToSteal(overall: Pick<HeroStatLine, 'fold_to_steal'>): { value: string | null } | null {
  if (overall.fold_to_steal === undefined) return null
  const v = overall.fold_to_steal
  return { value: v == null || !Number.isFinite(v) ? null : formatValue({}, v) }
}

/** How big the ring's count can be and still clear the ring: "239" large, "2,400" medium,
 *  "12,345" small. */
export function countSize(n: number): 'lg' | 'md' | 'sm' {
  const len = count(n).length
  return len <= 3 ? 'lg' : len <= 5 ? 'md' : 'sm'
}
