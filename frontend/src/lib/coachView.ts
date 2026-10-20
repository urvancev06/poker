// What the coach glance shows, derived from one backend answer (`Coaching`). Pure: no
// React, no DOM. CoachGlance and MathsSheet render these; the tests drive them with the
// real captured answers (lib/coachSamples.ts).
//
// Rules carried from the inventory (section 9.2) and the Stage prototype:
//   - the headline equity is realized equity, or raw equity once the action is closed
//     (`action_closed`), and its label switches with it: "Realized" / "Equity";
//   - a spot is "priced" when there is something to call and a required equity: then the
//     ring, Need and Call EV show; a bet/check spot shows the verdict and one figure;
//   - tone always comes from the backend `tone` (unknown -> neutral), never from the words;
//   - B8: Call EV leaves out the implied-odds adjustment, so its sign can argue with the
//     verdict ("Call." next to a red -1.0). When it does, EV renders neutral and says
//     "before implied" instead of being coloured as a gain or a loss.
//   - Call EV is in big blinds of the hand (`big_blind`, else 2 for an older answer), with
//     one fixed decimal: "+4.0", "−0.5".

import type { Coaching } from '../api'
import { bigBlindOf, pct, signed } from './format'
import { normalizeTone, type Tone } from './ring'

export type EqLabel = 'Realized' | 'Equity'

/** There is a price to pay: something to call and a required equity to beat. */
export function isPriced(c: Pick<Coaching, 'to_call' | 'required_equity_pct'>): boolean {
  return c.to_call > 0 && c.required_equity_pct != null
}

/** The headline equity and its label: raw equity once the action is closed, else realized. */
export function headlineEquity(c: Pick<Coaching, 'action_closed' | 'equity_pct' | 'realized_equity_pct'>): { pct: number; label: EqLabel } {
  return c.action_closed ? { pct: c.equity_pct, label: 'Equity' } : { pct: c.realized_equity_pct, label: 'Realized' }
}

/** The implied / reverse-implied adjustment moved the price away from the raw pot odds. */
export function isPriceAdjusted(c: Pick<Coaching, 'to_call' | 'required_equity_pct' | 'required_direct_pct'>): boolean {
  return isPriced(c) && c.required_direct_pct != null && c.required_equity_pct !== c.required_direct_pct
}

/** Required equity minus the raw pot-odds price, in points (negative = cheaper), or null. */
export function priceAdjustment(c: Pick<Coaching, 'to_call' | 'required_equity_pct' | 'required_direct_pct'>): number | null {
  if (!isPriceAdjusted(c)) return null
  return Math.round(((c.required_equity_pct as number) - (c.required_direct_pct as number)) * 10) / 10
}

export type EvTone = 'win' | 'loss' | 'neutral'

export interface EvView {
  /** "+8.0", "−1.0", "0.0" */
  text: string
  tone: EvTone
  /** B8: the sign argues with the verdict, so it is shown neutral. */
  disagrees: boolean
  /** "before implied" when the disagreement comes from the implied adjustment. */
  note: string | null
}

/**
 * Call EV as the glance shows it, or null when there is no price (bet/check spots).
 * The sign agrees with the verdict when a "good" verdict has EV >= 0 and a "fold" verdict
 * EV <= 0. A "close" verdict on an adjusted price is close only because of the adjustment,
 * so a coloured EV would argue one way: it reads neutral too.
 */
/** Call EV in big blinds, rounded half away from zero to one decimal. */
export function callEvBB(c: Pick<Coaching, 'call_ev' | 'big_blind'>): number | null {
  if (c.call_ev == null || !Number.isFinite(c.call_ev)) return null
  const v = c.call_ev / bigBlindOf(c)
  return (Math.sign(v) * Math.round(Math.abs(v) * 10)) / 10
}

export function evView(c: Coaching): EvView | null {
  const ev = callEvBB(c)
  if (!isPriced(c) || ev == null) return null
  const text = signed(ev, 1)
  const sign = Number(text.replace('−', '-')) // the shown value: "0.0" has no sign
  const tone = normalizeTone(c.tone)
  const adjusted = isPriceAdjusted(c)
  const disagrees = sign !== 0 && ((tone === 'good' && sign < 0) || (tone === 'fold' && sign > 0) || (tone === 'close' && adjusted))
  return {
    text,
    tone: disagrees || sign === 0 ? 'neutral' : sign > 0 ? 'win' : 'loss',
    disagrees,
    note: disagrees && adjusted ? 'before implied' : null,
  }
}

export type FigureKind = 'eq' | 'need' | 'ev'

export interface Figure {
  kind: FigureKind
  /** "39%", "22%", "+8.0": whole percents at a glance (the maths has the decimals). */
  value: string
  /** A quiet unit after the value ("bb" for Call EV). */
  unit?: string
  label: string
  /** eq takes the verdict's tone; need is the price grey; ev is win / loss / neutral. */
  tone: Tone | 'need' | EvTone
  note: string | null
}

export interface GlanceView {
  tone: Tone
  verdict: string
  priced: boolean
  eq: number
  eqLabel: EqLabel
  raw: number
  need: number | null
  adjusted: boolean
  figures: Figure[]
  ev: EvView | null
  /** The accessible name of the glance button (and what a screen reader announces). */
  spoken: string
}

export function glanceView(c: Coaching): GlanceView {
  const tone = normalizeTone(c.tone)
  const priced = isPriced(c)
  const { pct: eq, label: eqLabel } = headlineEquity(c)
  const need = priced ? (c.required_equity_pct as number) : null
  const ev = evView(c)
  const figures: Figure[] = [{ kind: 'eq', value: pct(eq), label: eqLabel, tone, note: null }]
  if (need != null) figures.push({ kind: 'need', value: pct(need), label: 'Need', tone: 'need', note: null })
  if (ev) figures.push({ kind: 'ev', value: ev.text, unit: 'bb', label: 'Call EV', tone: ev.tone, note: ev.note })
  const parts = [`${eqLabel} ${pct(eq)}`]
  if (need != null) parts.push(`need ${pct(need)}`)
  if (ev) parts.push(`call EV ${ev.text} big blinds${ev.note ? ` ${ev.note}` : ''}`)
  const verdict = c.verdict.trim() || 'No verdict'
  return {
    tone,
    verdict,
    priced,
    eq,
    eqLabel,
    raw: c.equity_pct,
    need,
    adjusted: isPriceAdjusted(c),
    figures,
    ev,
    spoken: `${verdict} ${parts.join(', ')}.`,
  }
}
