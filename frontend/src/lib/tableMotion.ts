// What changed between two snapshots, as the events the table animates. Motion only ever
// describes a real event: the backend sends one snapshot per bot action (650 ms apart),
// and the screen always already shows the new state; these say how it got there.

import type { TableModel } from './tableModel'

export interface CollectedBet {
  /** Player (0 hero, 1..5 bots). */
  player: number
  amount: number
}

export interface TableEvents {
  /** A new hand was dealt (or the first one): cards come off the deck. */
  deal: boolean
  /** Bots whose cards just went into the muck. */
  folds: number[]
  /** Players whose bet went up (chips slide in from in front of them). */
  chipIns: number[]
  /** A street was dealt: last street's bets glide into the pot, the new cards land. */
  street: { from: number; to: number; collected: CollectedBet[] } | null
  /** Bots whose cards just turned face up (a showdown). */
  reveals: number[]
  /** The hero's turn began / ended. */
  turnOn: boolean
  turnOff: boolean
  /** The hand just ended. */
  handOver: boolean
  /** The player whose action is the newest in the history, when one was just added. */
  acted: number | null
}

export const NO_EVENTS: TableEvents = { deal: false, folds: [], chipIns: [], street: null, reveals: [], turnOn: false, turnOff: false, handOver: false, acted: null }

/** Did `next` start a new hand after `prev`? (hand_index counts finished hands, so it
 * moves at hand end, not at the deal: the history and the hand-over flag tell instead.) */
export function isNewHand(prev: Pick<TableModel, 'sessionId' | 'handOver' | 'history' | 'boardLen'> | null, next: Pick<TableModel, 'sessionId' | 'handOver' | 'history' | 'boardLen'>): boolean {
  if (!prev) return true
  if (prev.sessionId !== next.sessionId) return true
  if (prev.handOver && !next.handOver) return true
  return next.history.length < prev.history.length || next.boardLen < prev.boardLen
}

export function diffTable(prev: TableModel | null, next: TableModel): TableEvents {
  if (isNewHand(prev, next)) {
    return {
      ...NO_EVENTS,
      deal: true,
      chipIns: [next.hero, ...next.villains].filter((s) => s.bet > 0).map((s) => s.player),
      turnOn: next.heroTurn,
    }
  }
  const p = prev as TableModel
  const before = [p.hero, ...p.villains]
  const after = [next.hero, ...next.villains]
  const streetMoved = next.boardLen > p.boardLen
  const folds: number[] = []
  const chipIns: number[] = []
  const reveals: number[] = []
  for (let i = 0; i < after.length; i++) {
    const a = before[i]
    const b = after[i]
    if (b.player !== 0 && b.folded && !a.folded) folds.push(b.player)
    // a new street resets every bet: only a bet made on it counts as chips going in
    if (b.bet > (streetMoved ? 0 : a.bet)) chipIns.push(b.player)
    if (b.player !== 0 && b.cards && !a.cards) reveals.push(b.player)
  }
  // the hand ending also takes the bets in front into the pot (it is pushed to the winner)
  const collecting = streetMoved || (next.handOver && !p.handOver)
  const collected = collecting ? before.filter((s) => s.bet > 0).map((s) => ({ player: s.player, amount: s.bet })) : []
  const last = next.history.length > p.history.length ? next.history[next.history.length - 1] : null
  const acted = last ? (after.find((s) => s.seat === last.seat)?.player ?? null) : null
  return {
    deal: false,
    folds,
    chipIns,
    street: streetMoved || collected.length ? { from: p.boardLen, to: next.boardLen, collected } : null,
    reveals,
    turnOn: next.heroTurn && !p.heroTurn,
    turnOff: !next.heroTurn && p.heroTurn,
    handOver: next.handOver && !p.handOver,
    acted,
  }
}
