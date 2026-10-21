// History: one hand's replay as plain data (inventory 14, "Replay / detail").
//
// Sources: GET /hands/{id}/review (streets, the hero's decisions, leak notes) and, when it
// loads, GET /hands/{id} (who showed what at showdown, each player's result, the seats,
// the starting stacks and the blinds, B19). Without the second the replay still reads;
// it only loses the showdown hands, the cap on an all-in call and the all-in marks.
//
// Amounts are shown in big blinds of the hand: its stored blinds, else the review's
// big_blind, else 2 (every hand before the 5/10 chip unit was at 1/2).
//
// What is derived here, for display only (the backend's figures stay the backend's):
// - a call's amount: the stored ledger's street total when the hand has one, else the
//   street level, capped by what the caller had left. Amounts are street totals, as on the
//   table: "raises to 7.5 bb", "calls 7.5 bb";
// - the all-in mark, when a player has nothing left behind;
// - streets dealt with no betting (an all-in runout), which /review leaves out;
// - the board at each street: the cards dealt on it, and those already out.
// Each hero action in the streets is one decision, in order (review.py builds one per hero
// action); the decisions are attached to the hero's rows, or listed on their own when the
// two ever disagree.

import type { ActionType, HandRecord, HandReview, ReviewDecision } from '../api'
import { cardLabel, splitCards } from './cards'
import { bb, bigBlindOf, LEGACY_BIG_BLIND, pct } from './format'
import { leakLabel } from './historyList'
import { STREET_LABEL, capitalize, streetVerb, type Street } from './tableModel'
import { equityMethodSpoken, equityMethodTag } from './equityMethod'

const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river']
const BOARD_LEN: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 }

function streetLabel(s: string): string {
  return STREET_LABEL[s as Street] ?? capitalize(s)
}

/* ---------- the stored hand (GET /hands/{id}), read defensively ---------- */

interface StoredAction {
  player: number
  seat: number
  position: string
  /** The ledger's street total after the action (hands stored since the ledger). */
  streetTotal: number | null
}

function storedActions(detail: HandRecord | null | undefined): StoredAction[] {
  const raw = detail?.data?.actions
  if (!Array.isArray(raw)) return []
  const out: StoredAction[] = []
  for (const a of raw) {
    const r = a as Record<string, unknown>
    if (typeof r.seat === 'number' && typeof r.player === 'number' && typeof r.position === 'string')
      out.push({ seat: r.seat, player: r.player, position: r.position, streetTotal: typeof r.street_total === 'number' ? r.street_total : null })
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
  /** "Call", "Raise to 100 bb", "Bet 6.5 bb", "Check", "Fold". */
  action: string
  /** "A pair + backdoor flush draw". */
  handLabel: string
  /** "24 bb to call into 47.5 bb", or "Nothing to call, pot 10.5 bb"; when a side pot caps
   *  what a call can win, ", you can win 10.5 bb of it". */
  price: string
  /** The headline figure: realized equity when the review has it, else raw equity. Null
   *  preflop (the review scores equity only postflop, against live villains). */
  eq: { label: 'Realized' | 'Equity'; value: number } | null
  /** Raw equity, shown beside realized. */
  raw: number | null
  /** The price a call or fold was judged against (after any adjustment). Null for a bet,
   *  raise or check, and preflop (no equity to hold it against). */
  need: number | null
  /** Pot odds alone, when the adjustment moved the price away from them. */
  direct: number | null
  /** Which way the adjustment moved the price. */
  adjust: 'dearer' | 'cheaper' | null
  leaks: DecisionLeak[]
  /** Any leak on this decision. */
  flagged: boolean
  /** A leak about the price itself (called without odds, folded with them): the realized
   *  figure is the one that was judged, so it carries the leak's tone. */
  priceFlag: boolean
  /** How the equity was computed, as a tag ("Exact", "±1.0 pp", "Table"), and in words for
   *  a screen reader; null without an equity or on a review from before phase 2. */
  method: string | null
  methodSpoken: string | null
}

/** The leaks judged on realized equity against the price (review.py:123-153). */
const PRICE_LEAKS: ReadonlySet<string> = new Set(['call_no_odds', 'fold_with_odds'])

/** The decisions a call price applies to: a call or a fold. A bet, raise or check is not
 *  judged on what calling would have cost. */
const PRICED_ACTIONS: ReadonlySet<string> = new Set(['call', 'fold'])

function actionWord(d: Pick<ReviewDecision, 'action' | 'to_amount' | 'street'>, big: number): string {
  const n = d.to_amount != null ? ` ${bb(d.to_amount, big, { unit: true })}` : ''
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

function priceText(d: Pick<ReviewDecision, 'to_call' | 'pot' | 'winnable'>, big: number): string {
  const u = (n: number) => bb(n, big, { unit: true })
  if (d.to_call <= 0) return `Nothing to call, pot ${u(d.pot)}`
  const capped = typeof d.winnable === 'number' && d.winnable < d.pot + d.to_call
  return `${u(d.to_call)} to call into ${u(d.pot)}${capped ? `, you can win ${u(d.winnable as number)} of it` : ''}`
}

/** One hero decision for the replay, its amounts in big blinds of `bigBlind`. */
export function decisionView(d: ReviewDecision, key: string, bigBlind: number): DecisionView {
  const realized = d.realized_pct ?? null
  const raw = d.equity_pct
  // the price only beside an equity to hold it against (postflop: the review scores no
  // preflop equity, and a price alone judges nothing)
  const need = (realized ?? raw) != null && d.to_call > 0 && PRICED_ACTIONS.has(d.action) ? (d.required_pct ?? null) : null
  const directRaw = d.required_direct_pct ?? null
  const moved = need != null && directRaw != null && Math.abs(need - directRaw) >= 0.05
  const leaks = d.leaks.map((l) => ({ type: l.type, label: leakLabel(l.type), note: l.note }))
  return {
    key,
    street: streetLabel(d.street),
    action: actionWord(d, bigBlind),
    handLabel: capitalize(d.hand_label),
    price: priceText(d, bigBlind),
    eq: realized != null ? { label: 'Realized', value: realized } : raw != null ? { label: 'Equity', value: raw } : null,
    raw: realized != null ? raw : null,
    need,
    direct: moved ? directRaw : null,
    adjust: moved ? (need > directRaw ? 'dearer' : 'cheaper') : null,
    leaks,
    flagged: leaks.length > 0,
    priceFlag: leaks.some((l) => PRICE_LEAKS.has(l.type)),
    method: raw != null ? equityMethodTag(d) : null,
    methodSpoken: raw != null ? equityMethodSpoken(d) : null,
  }
}

/** The plain-words note on the price, or "" when there is nothing to add: the direct price
 *  (pot odds) against the one the call was judged at (adjusted for what comes later). */
export function priceNote(v: Pick<DecisionView, 'direct' | 'adjust' | 'need'>): string {
  if (v.need == null || v.direct == null || !v.adjust) return ''
  return v.adjust === 'dearer'
    ? `Pot odds alone ask ${pct(v.direct, 1)}. The price is raised to ${pct(v.need, 1)} for what you may lose on later streets when you are behind.`
    : `Pot odds alone ask ${pct(v.direct, 1)}. The price is lowered to ${pct(v.need, 1)} for what you can win on later streets when you hit.`
}

/** One sentence for assistive tech: "Realized 7.8%, need 45.7%, raw equity 8.4%". */
export function figuresLabel(v: Pick<DecisionView, 'eq' | 'need' | 'raw'> & Partial<Pick<DecisionView, 'methodSpoken'>>): string {
  const parts: string[] = []
  if (v.eq) parts.push(`${v.eq.label} ${pct(v.eq.value, 1)}`)
  if (v.need != null) parts.push(`need ${pct(v.need, 1)}`)
  if (v.raw != null) parts.push(`raw equity ${pct(v.raw, 1)}`)
  if (v.eq && v.methodSpoken) parts.push(v.methodSpoken)
  return parts.join(', ')
}

/* ---------- the streets ---------- */

export interface TimelineRow {
  key: string
  /** "You" or the position. */
  who: string
  /** "raises to 7.5 bb", "calls 7.5 bb", "folds"; the hero's in the first person. */
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
  /** The hand's big blind: every amount above is in big blinds of it. */
  bigBlind: number
}

/** A stored hand's big blind: its blinds, else the review's, else the legacy 2. */
export function handBigBlind(review: Pick<HandReview, 'big_blind'> | null | undefined, detail?: HandRecord | null): number {
  if (Array.isArray(detail?.data?.blinds)) return bigBlindOf(detail.data)
  return review ? bigBlindOf(review) : LEGACY_BIG_BLIND
}

export function buildTimeline(review: HandReview, detail?: HandRecord | null): Timeline {
  const data = detail?.data
  const big = handBigBlind(review, detail)
  const blinds = Array.isArray(data?.blinds) && data.blinds.length === 2 ? data.blinds : [big / 2, big]
  // the stored actions run in the same order as the review's streets; their ledger street
  // totals are used when every action lines up (hands stored since the ledger)
  const stored = storedActions(detail)
  const flat = review.streets.flatMap((s) => s.actions)
  const aligned = stored.length === flat.length && stored.every((a, i) => a.position === flat[i].position)
  let flatIndex = 0
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

  const decisions = review.decisions.map((d, i) => decisionView(d, `d${i}`, big))
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
        put(a.position, Math.max(0, level - (bet.get(a.position) ?? 0)))
        amount = bet.get(a.position) ?? null
      } else if ((a.action === 'bet' || a.action === 'raise') && a.to_amount != null) {
        put(a.position, Math.max(0, a.to_amount - (bet.get(a.position) ?? 0)))
        level = Math.max(level, a.to_amount)
        amount = a.to_amount
      }
      const total = aligned ? stored[flatIndex].streetTotal : null
      flatIndex++
      if (total != null && (a.action === 'call' || a.action === 'bet' || a.action === 'raise')) {
        amount = total
        bet.set(a.position, total)
      }
      const moved = a.action === 'call' || a.action === 'bet' || a.action === 'raise'
      if (a.is_hero && a.action === 'fold') heroFolded = true
      return {
        key: `${s.street}-${ai}`,
        who: a.is_hero ? 'You' : a.position,
        what: streetVerb({ action: a.action as ActionType, street: s.street, to_amount: a.to_amount }, amount, a.is_hero, big),
        you: a.is_hero,
        fold: a.action === 'fold',
        allIn: known && moved && left.get(a.position) === 0,
        decision: a.is_hero && inline ? (decisions[next++] ?? null) : null,
      }
    })
    return { street: s.street, label: streetLabel(s.street), board: s.board, newFrom: Math.min(prev, s.board.length), rows, dealtOnly: false }
  })

  // An all-in runout: the streets dealt after the betting stopped.
  const last = streets.length ? STREETS.indexOf(streets[streets.length - 1].street as Street) : -1
  for (let i = Math.max(1, last + 1); i < STREETS.length; i++) {
    const st = STREETS[i]
    if (review.board.length < BOARD_LEN[st]) break
    streets.push({ street: st, label: STREET_LABEL[st], board: review.board.slice(0, BOARD_LEN[st]), newFrom: BOARD_LEN[STREETS[i - 1]], rows: [], dealtOnly: true })
  }

  let flagged = 0
  for (const d of decisions) if (d.flagged) flagged++
  return { streets, loose: inline ? [] : decisions, decisionCount: decisions.length, flagged, heroFolded, bigBlind: big }
}

/** "4 decisions, 1 flagged", "1 decision, none flagged", "No decisions to score". */
export function decisionsLine(t: Pick<Timeline, 'decisionCount' | 'flagged'>): string {
  if (t.decisionCount === 0) return 'No decisions to score'
  const n = `${t.decisionCount} ${t.decisionCount === 1 ? 'decision' : 'decisions'}`
  return `${n}, ${t.flagged === 0 ? 'none' : t.flagged} flagged`
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

const SEAT_POSITION = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'] // the 6-max convention, a fallback only

/** The opponents' cards turned up at showdown (never the hero's), winners first. */
export function shownHands(detail: HandRecord | null | undefined, opts: { labeled: boolean }): ShownHand[] {
  const data = detail?.data
  const shown = data?.shown_cards
  if (!shown || typeof shown !== 'object') return []
  const { position, player } = seatMaps(detail)
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
