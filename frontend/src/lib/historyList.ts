// History: the hand list and the leak report, as plain data for the view (inventory 14).
//
// - The list covers the same window as the leak report (B19: it used to stop at 100 while
//   the report read 200 / 500 / 1,000); it shows PAGE_SIZE rows at a time.
// - Hand numbers restart every session, so rows are grouped by session under a date and a
//   time range (B19): "#4" from this morning and "#4" from yesterday never look alike.
// - Hand numbers are shown from 1 (the backend counts from 0).
// - The outcome of a hand comes from two backend fields, hero_net and went_to_showdown:
//   without a showdown a loss (or a zero) can only be a fold, and a win means everyone
//   folded (the table's result uses the same six-way split, B2).

import type { HandSummary, LeakSummary } from '../api'
import { cardLabel, splitCards } from './cards'
import { chips } from './format'

export const LEAK_WINDOWS = [200, 500, 1000] as const
export type LeakWindow = (typeof LEAK_WINDOWS)[number]
export const DEFAULT_WINDOW: LeakWindow = 500
/** Rows shown at a time; "Show more" adds this many. */
export const PAGE_SIZE = 100

export type Scope = 'all' | 'session'

const LEAK_LABEL: Record<string, string> = {
  loose_open: 'Opened too loose',
  limp: 'Limped (raise-or-fold)',
  tight_fold: 'Folded too tight',
  call_no_odds: 'Called without odds',
  fold_with_odds: 'Folded with the odds',
  missed_value: 'Missed value',
}

/** The label for a leak type; an unknown type shows its raw key. */
export function leakLabel(type: string): string {
  return LEAK_LABEL[type] ?? type
}

/** Shown from 1: the backend's per-session counter starts at 0. */
export function handNumber(handIndex: number): number {
  return handIndex + 1
}

/* ---------- dates ---------- */

const ZONED = /(?:z|[+-]\d{2}:?\d{2})$/i

/** The stored timestamp. SQLite drops the zone the backend wrote (UTC), so a bare ISO
 *  string is read as UTC. Null for anything unreadable. */
export function parseStoredDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(ZONED.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Locale and zone for the labels (both default to the viewer's; tests pin them). */
export interface DateFormat {
  locale?: string
  timeZone?: string
}

function dayKey(d: Date, f: DateFormat): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: f.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** "Today", "Yesterday", "Sat, Oct 10", or "Oct 10, 2025" in another year. */
export function dayLabel(d: Date, now: Date, f: DateFormat = {}): string {
  const k = dayKey(d, f)
  if (k === dayKey(now, f)) return 'Today'
  if (k === dayKey(new Date(now.getTime() - 86_400_000), f)) return 'Yesterday'
  const sameYear = k.slice(0, 4) === dayKey(now, f).slice(0, 4)
  return new Intl.DateTimeFormat(f.locale, {
    timeZone: f.timeZone,
    ...(sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }),
  }).format(d)
}

const timeFormat = (f: DateFormat) => new Intl.DateTimeFormat(f.locale, { timeZone: f.timeZone, hour: 'numeric', minute: '2-digit' })

export function timeLabel(d: Date, f: DateFormat = {}): string {
  return timeFormat(f).format(d)
}

/** "03:12 – 03:58" (one time when they are the same minute). */
export function timeRange(from: Date, to: Date, f: DateFormat = {}): string {
  const fmt = timeFormat(f)
  const a = fmt.format(from)
  const b = fmt.format(to)
  return a === b ? a : fmt.formatRange(from, to)
}

/** "Today at 4:02 AM", for the replay's header. Empty when the date is unknown. */
export function whenLabel(iso: string | null | undefined, now: Date, f: DateFormat = {}): string {
  const d = parseStoredDate(iso)
  return d ? `${dayLabel(d, now, f)} at ${timeLabel(d, f)}` : ''
}

/* ---------- the list ---------- */

export interface SessionGroup {
  /** Stable while the group's newest hand is the same. */
  key: string
  sessionId: string
  /** The session at the table right now. */
  current: boolean
  /** "This session", "Today", "Yesterday", "Sat, Oct 10". */
  title: string
  /** "3:12 – 3:58 AM", or "" when the hands carry no dates. */
  range: string
  hands: HandSummary[]
}

/** Consecutive hands of one session (the list is newest first, so a session is one run). */
export function groupBySession(hands: readonly HandSummary[], currentSessionId: string | undefined, now: Date, f: DateFormat = {}): SessionGroup[] {
  const runs: HandSummary[][] = []
  for (const h of hands) {
    const run = runs[runs.length - 1]
    if (run && run[0].session_id === h.session_id) run.push(h)
    else runs.push([h])
  }
  return runs.map((run) => {
    const newest = parseStoredDate(run[0].created_at)
    const oldest = parseStoredDate(run[run.length - 1].created_at)
    const current = !!currentSessionId && run[0].session_id === currentSessionId
    return {
      key: `${run[0].session_id}:${run[0].id}`,
      sessionId: run[0].session_id,
      current,
      title: current ? 'This session' : newest ? dayLabel(newest, now, f) : 'Earlier',
      range: newest && oldest ? timeRange(oldest, newest, f) : '',
      hands: run,
    }
  })
}

export type Tone = 'win' | 'loss' | 'even'

export interface Outcome {
  /** "Won at showdown", "You folded", "Split pot" ... */
  word: string
  /** The row's short form: "Showdown", "Folded", "They folded". */
  short: string
  tone: Tone
}

export function netTone(net: number): Tone {
  const n = Math.round(net)
  return n > 0 ? 'win' : n < 0 ? 'loss' : 'even'
}

/** How the hand ended for you, from hero_net and went_to_showdown only. */
export function outcomeOf(net: number, showdown: boolean): Outcome {
  const tone = netTone(net)
  if (tone === 'win') return showdown ? { word: 'Won at showdown', short: 'Showdown', tone } : { word: 'Won, everyone folded', short: 'They folded', tone }
  if (tone === 'loss') return showdown ? { word: 'Lost at showdown', short: 'Showdown', tone } : { word: 'You folded', short: 'Folded', tone }
  return showdown ? { word: 'Split pot', short: 'Showdown', tone } : { word: 'Folded, it cost nothing', short: 'Folded', tone }
}

/** The row's accessible name: "Hand 132, SB, 4 of diamonds and Ace of hearts, won at
 *  showdown, up 94". */
export function rowLabel(h: HandSummary): string {
  const cards = splitCards(h.hero_cards).map(cardLabel)
  const o = outcomeOf(h.hero_net, h.went_to_showdown)
  const net = Math.round(h.hero_net)
  const money = net > 0 ? `, up ${chips(net)}` : net < 0 ? `, down ${chips(-net)}` : ''
  return `Hand ${handNumber(h.hand_index)}, ${h.hero_position}, ${cards.join(' and ') || 'cards unknown'}, ${o.word.toLowerCase()}${money}`
}

/* ---------- the leak report ---------- */

export interface LeakRow {
  type: string
  label: string
  count: number
  /** count / the largest count (0-1), for the bar. */
  share: number
}

/** One row per leak type in the backend's order (most frequent first). */
export function leakRows(s: LeakSummary): LeakRow[] {
  let max = 0
  for (const t of s.by_type) max = Math.max(max, t.count)
  return s.by_type.map((t) => ({ type: t.type, label: leakLabel(t.type), count: t.count, share: max > 0 ? t.count / max : 0 }))
}

/** Every flag in the window (one decision can carry more than one). */
export function flagCount(s: LeakSummary): number {
  let n = 0
  for (const t of s.by_type) n += t.count
  return n
}

/** The line under the report's title. Says so when the window is bigger than the data. */
export function reportScope(reviewed: number, window: number, scope: Scope): string {
  const hands = `${chips(reviewed)} ${reviewed === 1 ? 'hand' : 'hands'}`
  if (scope === 'session') return reviewed < window ? `All ${hands} this session` : `Last ${hands} this session`
  return reviewed < window ? `All ${hands} you have played` : `Your last ${hands}`
}

/** What the slow first leak pass is doing. */
export function reviewingLine(known: number | null, window: number): string {
  if (known == null) return `Reviewing up to ${chips(window)} hands`
  return `Reviewing ${chips(known)} ${known === 1 ? 'hand' : 'hands'}`
}

/** The query key for one scope and window. */
export function queryKey(scope: Scope, sessionId: string | undefined, window: number): string {
  return `${scope === 'session' ? (sessionId ?? 'none') : 'all'}|${window}`
}
