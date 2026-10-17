// History: one hand's replay as plain data (inventory 14, "Replay / detail").
//
// Sources: GET /hands/{id}/review (streets, the hero's decisions, leak notes) and, when it
// loads, GET /hands/{id} (who showed what at showdown, each player's result, the seats,
// the starting stacks and the blinds, B19). Without the second the replay still reads;
// it only loses the showdown hands, the cap on an all-in call and the all-in marks.
//
// What is derived here, for display only (the backend's figures stay the backend's):
// - a call's amount (the history leaves it out): the street level, capped by what the
//   caller had left. Amounts are street totals, as on the table: "raises to 15", "calls 15";
// - the all-in mark, when a player has nothing left behind;
// - streets dealt with no betting (an all-in runout), which /review leaves out;
// - the board at each street: the cards dealt on it, and those already out.
// Each hero action in the streets is one decision, in order (review.py builds one per hero
// action); the decisions are attached to the hero's rows, or listed on their own when the
// two ever disagree.

import type { HandRecord, HandReview, ReviewDecision } from '../api'
import { cardLabel, splitCards } from './cards'
import { chips, pct } from './format'
import { leakLabel } from './historyList'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'
const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river']
export const STREET_LABEL: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' }
const BOARD_LEN: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 }

/** Street from the number of board cards (B12: never from a stale `street` field). */
export function streetOfBoard(n: number): Street {
  if (n >= 5) return 'river'
  if (n === 4) return 'turn'
  if (n >= 3) return 'flop'
  return 'preflop'
}

function streetLabel(s: string): string {
  return STREET_LABEL[s as Street] ?? s.charAt(0).toUpperCase() + s.slice(1)
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/* ---------- the stored hand (GET /hands/{id}), read defensively ---------- */

interface StoredAction {
  player: number
  seat: number
  position: string
}

function storedActions(detail: HandRecord | null | undefined): StoredAction[] {
  const raw = detail?.data?.actions
  if (!Array.isArray(raw)) return []
  const out: StoredAction[] = []
  for (const a of raw) {
    const r = a as Record<string, unknown>
    if (typeof r.seat === 'number' && typeof r.player === 'number' && typeof r.position === 'string') out.push({ seat: r.seat, player: r.player, position: r.position })
  }
  return out
}

/** Seat -> position and seat -> player, from the stored actions (every seat that showed acted). */
function seatMaps(detail: HandRecord | null | undefined) {
  const position = new Map<number, string>()
  const player = new Map<number, number>()
  for (const a of storedActions(detail)) {
    position.set(a.seat, a.position)
    player.set(a.seat, a.player)
  }
  return { position, player }
}

/* ---------- the decision ---------- */

export interface DecisionLeak {
  type: string
  label: string
  note: string
}

export interface DecisionView {
  key: string
  street: string
  /** "Call", "Raise to 200", "Bet 13", "Check", "Fold". */
  action: string
  /** "A pair + backdoor flush draw". */
  handLabel: string
  /** "48 to call into 95", or "Pot 21" with nothing to call. */
  price: string
  /** The bar: realized equity when the review has it, else raw equity. Null preflop. */
  eq: { label: 'Realized' | 'Equity'; value: number } | null
  /** Raw equity, shown beside realized. */
  raw: number | null
  /** The price the call was judged against (after any adjustment). */
  need: number | null
  /** Pot odds alone, when the adjustment moved the price away from it. */
  direct: number | null
  /** Which way the adjustment moved the price. */
  adjust: 'dearer' | 'cheaper' | null
  leaks: DecisionLeak[]
}

function actionWord(d: Pick<ReviewDecision, 'action' | 'to_amount' | 'street'>): string {
  const n = d.to_amount != null ? ` ${chips(d.to_amount)}` : ''
  switch (d.action) {
    case 'raise':
      return `Raise to${n}`
    case 'bet':
      // preflop, the engine calls the big blind's raise over limps a "bet" (B26)
      return d.street === 'preflop' ? `Raise to${n}` : `Bet${n}`
    default:
      return capitalize(d.action)
  }
}

export function decisionView(d: ReviewDecision, key: string): DecisionView {
  const realized = d.realized_pct ?? null
  const raw = d.equity_pct
  const need = raw != null ? d.required_pct : null
  const directRaw = d.required_direct_pct ?? null
  const moved = need != null && directRaw != null && Math.abs(need - directRaw) >= 0.05
  return {
    key,
    street: streetLabel(d.street),
    action: actionWord(d),
    handLabel: capitalize(d.hand_label),
    price: d.to_call > 0 ? `${chips(d.to_call)} to call into ${chips(d.pot)}` : `Pot ${chips(d.pot)}`,
    eq: realized != null ? { label: 'Realized', value: realized } : raw != null ? { label: 'Equity', value: raw } : null,
    raw: realized != null ? raw : null,
    need,
    direct: moved ? directRaw : null,
    adjust: moved ? (need > directRaw ? 'dearer' : 'cheaper') : null,
    leaks: d.leaks.map((l) => ({ type: l.type, label: leakLabel(l.type), note: l.note })),
  }
}

/** The plain-words note under the bars, or "" when there is nothing to add. */
export function priceNote(v: Pick<DecisionView, 'direct' | 'adjust'>): string {
  if (v.direct == null || !v.adjust) return ''
  const why = v.adjust === 'dearer' ? 'Dearer: you may lose more later when you are behind.' : 'Cheaper: you should win more later when you hit.'
  return `Pot odds alone ${pct(v.direct, 1)}. ${why}`
}

/** One sentence for assistive tech: "Realized 7.8%, need 45.7%, raw equity 8.4%". */
export function barsLabel(v: Pick<DecisionView, 'eq' | 'need' | 'raw'>): string {
  if (!v.eq) return ''
  const parts = [`${v.eq.label} ${pct(v.eq.value, 1)}`]
  if (v.need != null) parts.push(`need ${pct(v.need, 1)}`)
  if (v.raw != null) parts.push(`raw equity ${pct(v.raw, 1)}`)
  return parts.join(', ')
}

/* ---------- the streets ---------- */

export interface TimelineRow {
  key: string
  /** "You" or the position. */
  who: string
  /** "raises to 15", "calls 15", "folds"; the hero's in the first person ("call 15"). */
  what: string
  you: boolean
  fold: boolean
  allIn: boolean
  decision: DecisionView | null
}

export interface TimelineStreet {
  street: string
  label: string
  /** The board as it stood on this street. */
  board: string[]
  /** board[newFrom..] were dealt on this street. */
  newFrom: number
  rows: TimelineRow[]
  /** Dealt with no betting (everyone left was all in). */
  dealtOnly: boolean
}

export interface Timeline {
  streets: TimelineStreet[]
  /** Decisions not attached to a row (only when rows and decisions disagree). */
  loose: DecisionView[]
  decisionCount: number
  flagged: number
  heroFolded: boolean
}

function verb(action: string, street: string, amount: number | null, you: boolean): string {
  const n = amount != null ? ` ${chips(amount)}` : ''
  switch (action) {
    case 'fold':
      return you ? 'fold' : 'folds'
    case 'check':
      return you ? 'check' : 'checks'
    case 'call':
      return (you ? 'call' : 'calls') + n
    case 'bet':
      if (street === 'preflop') return (you ? 'raise to' : 'raises to') + n // B26
      return (you ? 'bet' : 'bets') + n
    case 'raise':
      return (you ? 'raise to' : 'raises to') + n
    default:
      return action
  }
}

export function buildTimeline(review: HandReview, detail?: HandRecord | null): Timeline {
  const data = detail?.data
  const blinds = Array.isArray(data?.blinds) && data.blinds.length === 2 ? data.blinds : [1, 2]
  // stacks behind, by position (positions are unique within a hand)
  const left = new Map<string, number>()
  const { position } = seatMaps(detail)
  const starts = data?.start_stacks
  if (Array.isArray(starts)) position.forEach((pos, seat) => typeof starts[seat] === 'number' && left.set(pos, starts[seat]))
  const known = left.size > 0
  const bet = new Map<string, number>()
  const put = (pos: string, amount: number) => {
    const have = left.get(pos)
    const a = have != null ? Math.min(amount, have) : amount
    bet.set(pos, (bet.get(pos) ?? 0) + a)
    if (have != null) left.set(pos, have - a)
  }
  put('SB', blinds[0])
  put('BB', blinds[1])
  let level = blinds[1]

  const decisions = review.decisions.map((d, i) => decisionView(d, `d${i}`))
  const heroActions = review.streets.reduce((n, s) => n + s.actions.filter((a) => a.is_hero).length, 0)
  const inline = heroActions === decisions.length
  let next = 0
  let heroFolded = false

  const streets: TimelineStreet[] = review.streets.map((s, si) => {
    if (si > 0) {
      bet.clear()
      level = 0
    }
    const prev = si > 0 ? review.streets[si - 1].board.length : 0
    const rows = s.actions.map((a, ai): TimelineRow => {
      let amount: number | null = null
      if (a.action === 'call') {
        const owed = Math.max(0, level - (bet.get(a.position) ?? 0))
        put(a.position, owed)
        amount = bet.get(a.position) ?? null
      } else if ((a.action === 'bet' || a.action === 'raise') && a.to_amount != null) {
        put(a.position, Math.max(0, a.to_amount - (bet.get(a.position) ?? 0)))
        level = Math.max(level, a.to_amount)
        amount = a.to_amount
      }
      const moved = a.action === 'call' || a.action === 'bet' || a.action === 'raise'
      if (a.is_hero && a.action === 'fold') heroFolded = true
      return {
        key: `${s.street}-${ai}`,
        who: a.is_hero ? 'You' : a.position,
        what: verb(a.action, s.street, amount, a.is_hero),
        you: a.is_hero,
        fold: a.action === 'fold',
        allIn: known && moved && left.get(a.position) === 0,
        decision: a.is_hero && inline ? (decisions[next++] ?? null) : null,
      }
    })
    return { street: s.street, label: streetLabel(s.street), board: s.board, newFrom: Math.min(prev, s.board.length), rows, dealtOnly: false }
  })

  // An all-in runout: the streets dealt after the betting stopped.
  const last = streets.length ? (STREETS.indexOf(streets[streets.length - 1].street as Street) ?? -1) : -1
  for (let i = Math.max(1, last + 1); i < STREETS.length; i++) {
    const st = STREETS[i]
    if (review.board.length < BOARD_LEN[st]) break
    const board = review.board.slice(0, BOARD_LEN[st])
    streets.push({ street: st, label: STREET_LABEL[st], board, newFrom: BOARD_LEN[STREETS[i - 1]], rows: [], dealtOnly: true })
  }

  let flagged = 0
  for (const d of decisions) if (d.leaks.length > 0) flagged++
  return { streets, loose: inline ? [] : decisions, decisionCount: decisions.length, flagged, heroFolded }
}

/** "Board 10 of spades, 8 of clubs, Queen of clubs; dealt now: Queen of hearts". */
export function boardSpeech(board: readonly string[], newFrom = 0): string {
  if (board.length === 0) return 'No board'
  const old = board.slice(0, newFrom).map(cardLabel)
  const fresh = board.slice(newFrom).map(cardLabel)
  if (old.length === 0) return `Board ${fresh.join(', ')}`
  return `Board ${old.join(', ')}; dealt now: ${fresh.join(', ')}`
}

/* ---------- the showdown ---------- */

export interface ShownHand {
  seat: number
  position: string
  cards: string[]
  /** The archetype, only when opponents are labeled (B16: HUD and Live never name them). */
  name: string | null
  /** Their result for the hand, in chips. */
  net: number | null
}

/** The opponents' cards turned up at showdown (never the hero's), winners first. */
export function shownHands(detail: HandRecord | null | undefined, opts: { labeled: boolean }): ShownHand[] {
  const data = detail?.data
  const shown = data?.shown_cards
  if (!shown || typeof shown !== 'object') return []
  const { position, player } = seatMaps(detail)
  const SEAT_POSITION = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'] // the 6-max convention, a fallback only
  const out: ShownHand[] = []
  for (const [k, joined] of Object.entries(shown)) {
    const seat = Number(k)
    if (!Number.isInteger(seat) || seat === data?.hero_seat) continue
    const cards = splitCards(joined)
    if (cards.length !== 2) continue
    const p = player.get(seat)
    const name = opts.labeled && p != null && Array.isArray(data?.lineup) ? (data.lineup[p] ?? null) : null
    const r = p != null ? data?.results_by_player?.[String(p)] : undefined
    out.push({ seat, position: position.get(seat) ?? SEAT_POSITION[seat] ?? `Seat ${seat + 1}`, cards, name, net: typeof r === 'number' ? r : null })
  }
  return out.sort((a, b) => (b.net ?? 0) - (a.net ?? 0) || a.seat - b.seat)
}
