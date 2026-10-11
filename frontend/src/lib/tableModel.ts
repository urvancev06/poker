// The table's view model: one backend snapshot -> what each place at the table shows.
// Pure: no React, no DOM. Everything shown comes from backend fields; the only thing
// derived here is wording (a seat's line, the status line), from the action history.
//
// Places: the hero is player 0 at the bottom; players 1..5 (Nit, TAG, LAG, Calling
// Station, Maniac) keep one place each, clockwise from the hero (inventory 6.1).
//
// Fixes carried here:
//   B3   a villain's cards show only if the backend says they were shown at a showdown
//        (last_result.shown_cards), never from the reveal-all hand-end snapshot
//   B12  the street comes from the board length, never from state.street
//   B17  the status line reads "You fold", and names the latest action (with amounts)
//   B20  no "all-in" tag once the hand is over (a busted seat just shows 0)

import type { ActionLogEntry, BotRead, LegalActions, Reads, SessionState } from '../api'
import { chips } from './format'
import type { VisibilityMode } from './prefsSchema'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

/** B12: state.street goes stale after an all-in runout; the board length never does. */
export function streetOfBoard(boardLen: number): Street {
  if (boardLen >= 5) return 'river'
  if (boardLen === 4) return 'turn'
  if (boardLen >= 3) return 'flop'
  return 'preflop'
}

export const STREET_LABEL: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' }

const SHORT_ARCHETYPE: Record<string, string> = { 'Calling Station': 'Station' }

/** "Calling Station" -> "Station"; anything else as the backend sent it. */
export function shortArchetype(name: string): string {
  return SHORT_ARCHETYPE[name] ?? name
}

export function capitalize(s: string | null | undefined): string {
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

/* ---------- replaying the history: amounts and each seat's line ---------- */

export interface Replay {
  /** By history index: the street total after the action (a call's amount is derived). */
  amounts: (number | null)[]
  /** By engine seat: the preflop role, then this street's action ("3-bet 15", "bets 26"). */
  tags: string[][]
}

const STREET_ORDER: readonly Street[] = ['preflop', 'flop', 'turn', 'river']

function startStacks(s: SessionState): number[] {
  const seats = s.state.seats
  const fromResult = s.hand_over ? s.last_result?.start_stacks : undefined
  if (fromResult && fromResult.length === seats.length) return fromResult
  // mid-hand, stacks_by_player holds each player's stack at the start of the hand
  return seats.map((x, seat) => s.stacks_by_player[s.seat_to_player[seat]] ?? x.stack + x.bet)
}

/**
 * Replays the hand's history from the start-of-hand stacks, to word each action ("calls
 * 15": a call carries no amount in the history) and each seat's line. Display only: the
 * stacks, bets and pot on screen are the backend's own.
 */
export function replayHand(s: SessionState): Replay {
  const g = s.state
  const n = g.seats.length
  const stack = startStacks(s).slice()
  const bet = new Array<number>(n).fill(0)
  const tags: string[][] = Array.from({ length: n }, () => [])
  const amounts: (number | null)[] = []
  const post = (seat: number, amt: number) => {
    if (seat < 0) return
    const a = Math.min(amt, stack[seat])
    stack[seat] -= a
    bet[seat] += a
  }
  // blinds by position, not by seat index
  post(
    g.seats.findIndex((x) => x.position === 'SB'),
    g.blinds[0],
  )
  post(
    g.seats.findIndex((x) => x.position === 'BB'),
    g.blinds[1],
  )
  let level = g.blinds[1]
  let street: Street = 'preflop'
  let raises = 1 // the big blind is the first "bet" preflop
  let limped = false
  const collect = (next: Street) => {
    for (let i = 0; i < n; i++) {
      bet[i] = 0
      tags[i] = tags[i].slice(0, 1)
    }
    level = 0
    street = next
  }
  for (const h of g.history) {
    const hs = (STREET_ORDER.includes(h.street as Street) ? h.street : street) as Street
    if (hs !== street) collect(hs)
    const i = h.seat
    let amount: number | null = null
    if (h.action === 'call') {
      const need = Math.max(0, Math.min(level - bet[i], stack[i]))
      stack[i] -= need
      bet[i] += need
      amount = bet[i]
    } else if ((h.action === 'bet' || h.action === 'raise') && h.to_amount != null) {
      stack[i] -= Math.max(0, h.to_amount - bet[i])
      bet[i] = h.to_amount
      level = Math.max(level, h.to_amount)
      amount = h.to_amount
    }
    amounts.push(amount)
    if (street === 'preflop') {
      if ((h.action === 'raise' || h.action === 'bet') && amount != null) {
        raises++
        const role = raises === 2 ? (limped ? 'Raise' : 'Open') : `${raises}-bet`
        tags[i] = [`${role} ${chips(amount)}`]
      } else if (h.action === 'call' && amount != null) {
        if (raises === 1) limped = true
        tags[i] = [`${raises === 1 ? 'Limp' : 'Call'} ${chips(amount)}`]
      } else if (h.action === 'check') tags[i] = ['Check']
    } else {
      const verb = streetVerb(h, amount, false)
      if (verb) tags[i] = [tags[i][0] ?? '', verb]
    }
  }
  // a new street with no action on it yet: only the preflop roles remain
  const now = streetOfBoard(g.board.length)
  if (!s.hand_over && STREET_ORDER.indexOf(now) > STREET_ORDER.indexOf(street)) collect(now)
  return { amounts, tags: tags.map((t) => t.filter(Boolean)) }
}

/** One action in words. `you`: first person ("You call 15"), else third ("calls 15"). */
export function streetVerb(h: Pick<ActionLogEntry, 'action' | 'street' | 'to_amount'>, amount: number | null, you: boolean): string {
  const amt = amount ?? h.to_amount
  const n = amt != null ? ` ${chips(amt)}` : ''
  switch (h.action) {
    case 'fold':
      return you ? 'fold' : 'folds'
    case 'check':
      return you ? 'check' : 'checks'
    case 'call':
      return (you ? 'call' : 'calls') + n
    case 'bet':
      // preflop, the engine calls the big blind's raise over limps a "bet" (B26)
      if (h.street === 'preflop') return (you ? 'raise to' : 'raises to') + n
      return (you ? 'bet' : 'bets') + n
    case 'raise':
      return (you ? 'raise to' : 'raises to') + n
    default:
      return h.action
  }
}

/* ---------- places at the table ---------- */

export interface SeatModel {
  /** Persistent identity: 0 is the hero, 1..5 the bots (also their place). */
  player: number
  /** Engine seat for this hand. */
  seat: number
  position: string
  archetype: string
  stack: number
  /** Chips in front this street. */
  bet: number
  folded: boolean
  /** All-in while the hand runs (B20: never after it ends). */
  allIn: boolean
  /** A bot whose turn it is (it thinks for 650 ms). */
  actor: boolean
  button: boolean
  /** Hero: hole cards (null while a hand you folded runs on). Villain: only cards shown at
   * a showdown (B3). */
  cards: string[] | null
  /** The hand label when cards are shown. */
  label: string | null
  /** Hand over: chips won or lost this hand. */
  net: number | null
  /** The seat's line: preflop role, then this street's action. */
  tags: string[]
}

export interface Identity {
  /** The big name: "You", the archetype (Labeled) or the position (HUD, Live). */
  name: string
  /** The position on the sub-line (Labeled only: HUD and Live put it in the name). */
  pos: string | null
  /** HUD reads: ["20.0/15.0", "AF 5.5"] or ["Read 7/30"]. */
  hud: string[] | null
}

const hudNum = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(1))

/** The identity label for the visibility mode (display only; inventory 6.3). */
export function identityOf(seat: Pick<SeatModel, 'player' | 'position' | 'archetype'>, mode: VisibilityMode, read?: BotRead): Identity {
  if (seat.player === 0) return { name: 'You', pos: seat.position, hud: null }
  if (mode === 'labeled') return { name: shortArchetype(seat.archetype), pos: seat.position, hud: null }
  if (mode === 'hud') {
    if (!read || !read.ready || !read.stats) return { name: seat.position, pos: null, hud: [`Read ${read?.hands ?? 0}/${read?.min_hands ?? 30}`] }
    const hud = [`${hudNum(read.stats.vpip)}/${hudNum(read.stats.pfr)}`]
    if (read.stats.af != null) hud.push(`AF ${read.stats.af.toFixed(1)}`)
    return { name: seat.position, pos: null, hud }
  }
  return { name: seat.position, pos: null, hud: null }
}

export interface TableModel {
  sessionId: string
  handOver: boolean
  heroTurn: boolean
  boardLen: number
  board: string[]
  street: Street
  /** The pot, including every chip in front of the seats (state.pot). 0 at hand end. */
  pot: number
  /** How much of the pot is still in front of the seats this street. */
  inBets: number
  /** Bots by place: villains[0] is player 1 ... villains[4] is player 5. */
  villains: SeatModel[]
  hero: SeatModel
  legal: LegalActions | null
  history: ActionLogEntry[]
  replay: Replay
  /** Who to name in words: engine seat -> "You" / the identity name. */
  nameOfSeat: (seat: number) => string
}

export function buildTableModel(s: SessionState, reads: Reads | undefined, mode: VisibilityMode): TableModel {
  const g = s.state
  const replay = replayHand(s)
  const shown = s.hand_over ? (s.last_result?.shown_cards ?? {}) : {}
  const seatOfPlayer = (p: number) => s.seat_to_player.indexOf(p)
  const seatModel = (player: number): SeatModel => {
    const seat = seatOfPlayer(player)
    const b = g.seats[seat]
    const hero = player === 0
    const shownCode = shown[String(seat)]
    const shownCards = !hero && shownCode && shownCode.length >= 4 ? [shownCode.slice(0, 2), shownCode.slice(2, 4)] : null
    const cards = hero ? (b.hole_cards ?? null) : shownCards
    return {
      player,
      seat,
      position: b.position,
      archetype: s.archetypes[player] ?? '',
      stack: b.stack,
      bet: s.hand_over ? 0 : b.bet,
      folded: b.folded,
      allIn: !s.hand_over && !b.folded && b.all_in,
      actor: !s.hand_over && b.is_actor && !hero,
      button: s.button_player === player,
      cards,
      label: cards ? (b.hand_label ?? null) : null,
      net: s.hand_over && g.results ? (g.results[seat] ?? null) : null,
      tags: replay.tags[seat] ?? [],
    }
  }
  const villains = [1, 2, 3, 4, 5].map(seatModel)
  const hero = seatModel(0)
  const byPlayer = [hero, ...villains]
  const nameOfSeat = (seat: number) => {
    const p = s.seat_to_player[seat]
    const m = byPlayer[p]
    return m ? identityOf(m, mode, reads?.[String(p)]).name : (g.seats[seat]?.position ?? '')
  }
  const inBets = s.hand_over ? 0 : g.seats.reduce((a, x) => a + x.bet, 0)
  return {
    sessionId: s.session_id,
    handOver: s.hand_over,
    heroTurn: s.hero_to_act && !s.hand_over,
    boardLen: g.board.length,
    board: g.board,
    street: streetOfBoard(g.board.length),
    pot: g.pot,
    inBets,
    villains,
    hero,
    legal: s.hero_to_act ? g.legal_actions : null,
    history: g.history,
    replay,
    nameOfSeat,
  }
}

/**
 * The dock's line while the bots act (B17): the latest action, in words, with its amount:
 * "You fold", "Maniac bets 26", "SB calls 15". A street that has just been dealt is named
 * until someone acts on it; before any action, "Dealing".
 */
export function statusLine(m: Pick<TableModel, 'history' | 'replay' | 'street' | 'hero' | 'nameOfSeat'>): string {
  const i = m.history.length - 1
  const last = m.history[i]
  if (!last) return 'Dealing'
  if (last.street !== m.street) return STREET_LABEL[m.street]
  const you = last.seat === m.hero.seat
  return `${you ? 'You' : m.nameOfSeat(last.seat)} ${streetVerb(last, m.replay.amounts[i] ?? null, you)}`
}

/** The hero folded and the bots are still playing the hand out (B17: offer a skip). */
export function heroFoldedLive(m: Pick<TableModel, 'handOver' | 'hero'>): boolean {
  return !m.handOver && m.hero.folded
}

/** "Board: 2 of diamonds, 7 of spades, Queen of diamonds" for assistive tech. */
export function boardSpeech(board: readonly string[], label: (c: string) => string): string {
  return board.length ? `Board: ${board.map(label).join(', ')}` : 'Board: no cards yet'
}
