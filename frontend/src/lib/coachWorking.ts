// "Show working" in the maths sheet: the derivation, one row per step, each tagged with
// where the number comes from. Pure; MathsSheet renders the rows.
//
//   Exact     arithmetic on the chips in the pot (the price, pot odds), and equity counted
//             over every runout (`equity_method` "exact")
//   Computed  sampled or table equity, or arithmetic on an estimate (Call EV, your hand)
//   Estimate  a rough model (realization, the implied / reverse-implied adjustment, and the
//             Need it produces whenever the price was adjusted)
//
// B18 (render side): draws are never printed as raw enums (backdoor_flush_draw), and the
// win / tie / lose split appears once (none from the preflop table, where it only restates
// the equity: the note says where the number comes from instead).
//
// "Your hand" is the backend's hole-aware label: the made part ("Board two pair, eight
// kicker", "Top pair, good kicker") is the value, the draws ("Nut flush draw and gutshot")
// the note. An older label that is only a draw ("flush draw") falls back to the tier.
//
// Amounts are in big blinds of the hand (`big_blind`, else 2 for an older answer). When a
// side pot caps what a call can win (`winnable` < pot + call), the price says so.

import type { Coaching } from '../api'
import { bb, bigBlindOf, pct, signed } from './format'
import { callEvBB, isPriced, priceAdjustment } from './coachView'
import { equityMethodNote } from './equityMethod'

export type Provenance = 'exact' | 'computed' | 'estimate'

export const PROVENANCE_LABEL: Record<Provenance, string> = { exact: 'Exact', computed: 'Computed', estimate: 'Estimate' }

export interface WorkingRow {
  key: string
  label: string
  value: string
  note: string | null
  kind: Provenance
}

const MINUS = '−'

export function capitalize(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

const TIER: Record<string, string> = {
  HIGH_CARD: 'High card',
  PAIR: 'One pair',
  TWO_PAIR: 'Two pair',
  TRIPS: 'Three of a kind',
  STRAIGHT: 'Straight',
  FLUSH: 'Flush',
  FULL_HOUSE: 'Full house',
  QUADS: 'Four of a kind',
  STRAIGHT_FLUSH: 'Straight flush',
}

/** Any enum-ish token as words: "SOME_NEW_THING" -> "Some new thing". Never snake_case. */
function words(token: string): string {
  return capitalize(token.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase())
}

/** The backend's made-hand tier (MadeTier name) in words. */
export function humanizeTier(tier: string): string {
  return TIER[tier] ?? words(tier)
}

const DRAW: Record<string, string> = {
  flush_draw: 'flush draw',
  open_ended_straight_draw: 'open-ended straight draw',
  gutshot: 'gutshot',
  overcards: 'two overcards',
  backdoor_flush_draw: 'backdoor flush draw',
}
// Stronger draws first, as the backend orders its own hand label.
const DRAW_ORDER = ['flush_draw', 'open_ended_straight_draw', 'gutshot', 'overcards', 'backdoor_flush_draw']

/** One draw enum in words: "backdoor_flush_draw" -> "backdoor flush draw". */
export function humanizeDraw(draw: string): string {
  return DRAW[draw] ?? words(draw).toLowerCase()
}

/** The draws as one phrase, strongest first: "Open-ended straight draw and backdoor flush draw". */
export function humanizeDraws(draws: readonly string[]): string | null {
  const uniq = [...new Set(draws)]
  if (!uniq.length) return null
  const rank = (d: string) => {
    const i = DRAW_ORDER.indexOf(d)
    return i < 0 ? DRAW_ORDER.length : i
  }
  const list = uniq.toSorted((a, b) => rank(a) - rank(b)).map(humanizeDraw)
  const phrase = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
  return capitalize(phrase)
}

const DRAW_WORDS: ReadonlySet<string> = new Set([...Object.values(DRAW), 'nut flush draw'])

/** The hand row: the label's made part as the value, its draws as the note. The draws come
 *  from the enums (never raw), strongest first, so a flush draw leads and keeps the label's
 *  "nut". */
export function handRow(c: Pick<Coaching, 'hand_label' | 'made_tier' | 'draws'>): { value: string; note: string | null } {
  const parts = c.hand_label.split(' + ').map((p) => p.trim())
  const made = parts[0] && !DRAW_WORDS.has(parts[0].toLowerCase()) ? capitalize(parts[0]) : humanizeTier(c.made_tier)
  let note = humanizeDraws(c.draws)
  if (note && parts.some((p) => p.toLowerCase() === 'nut flush draw')) note = note.replace(/^Flush draw/, 'Nut flush draw')
  return { value: made, note }
}

/** The equity row's note: the win / tie / lose split, then how it was computed. */
function equityNote(c: Coaching): string {
  const method = equityMethodNote(c)
  if (c.equity_method === 'preflop_table') return method as string
  const split = `Wins ${pct(c.win_pct)}, ties ${pct(c.tie_pct)}, loses ${pct(c.lose_pct)}`
  return method ? `${split}. ${method}` : split
}

/** Plain words for which way the price moved. */
export function adjustmentNote(delta: number, impliedNote: string): string {
  const why = impliedNote.trim() ? ` ${capitalize(impliedNote)}.` : ''
  return delta < 0
    ? `Cheaper: you should win more later when you hit.${why}`
    : `Dearer: you may lose more later when you are behind.${why}`
}

export function workingRows(c: Coaching): WorkingRow[] {
  const rows: WorkingRow[] = []
  const priced = isPriced(c)
  const big = bigBlindOf(c)
  const u = (n: number) => bb(n, big, { unit: true })
  // what a call can win: everything in the middle plus the call, unless a side pot caps it
  const winnable = typeof c.winnable === 'number' ? c.winnable : c.pot + c.to_call
  const capped = winnable < c.pot + c.to_call

  rows.push({ key: 'hand', label: 'Your hand', ...handRow(c), kind: 'computed' })
  rows.push({
    key: 'equity',
    label: 'Equity',
    value: pct(c.equity_pct),
    note: equityNote(c),
    kind: c.equity_method === 'exact' ? 'exact' : 'computed',
  })

  if (c.action_closed) {
    rows.push({ key: 'realized', label: 'Equity counts in full', value: pct(c.equity_pct), note: 'No more betting after this call', kind: 'exact' })
  } else if (c.realization_pct !== 100) {
    const where = c.in_position ? 'in position' : 'out of position'
    // players_behind is only counted when facing a bet (0 otherwise)
    const behind = !priced ? '' : c.players_behind === 0 ? ', nobody left to act' : `, ${c.players_behind} still to act behind you`
    rows.push({ key: 'realized', label: 'Realized', value: `≈${pct(c.realized_equity_pct)}`, note: `Realizing ~${c.realization_pct}% ${where}${behind}`, kind: 'estimate' })
  }

  if (priced) {
    const direct = c.required_direct_pct ?? (c.required_equity_pct as number)
    const odds = c.pot_odds ? `, pot odds ${c.pot_odds}` : ''
    const cap = capped ? `, you can win ${u(winnable)} of it` : ''
    rows.push({ key: 'price', label: 'Price', value: pct(direct, 1), note: `${u(c.to_call)} to call into ${u(c.pot)}${cap}${odds}`, kind: 'exact' })
    const delta = priceAdjustment(c)
    if (delta != null) {
      const v = `${delta < 0 ? MINUS : '+'}${Math.abs(delta).toFixed(1)} pts`
      rows.push({ key: 'adjust', label: 'Price adjustment', value: v, note: adjustmentNote(delta, c.implied_note), kind: 'estimate' })
    }
    rows.push({
      key: 'need',
      label: 'Need',
      value: pct(c.required_equity_pct, 1),
      note: delta != null ? 'The price after that adjustment' : 'The price: nothing adjusts it',
      kind: delta != null ? 'estimate' : 'exact',
    })
    const ev = callEvBB(c)
    if (ev != null) {
      const before = delta != null ? '. Before implied odds' : ''
      rows.push({
        key: 'ev',
        label: 'Call EV',
        value: `≈${signed(ev, 1)} bb`,
        note: `${pct(c.realized_equity_pct)} of ${u(winnable)}, less the ${u(c.to_call)} call${before}`,
        kind: 'computed',
      })
    }
  }
  return rows
}
