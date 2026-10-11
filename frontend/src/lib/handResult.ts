// What the hand-over result says (B2): six outcomes kept apart, from backend fields only:
// last_result.hero_net, last_result.went_to_showdown and the hero seat's `folded`.
//
//   won-showdown     You won  +14   At showdown
//   won-uncontested  You won  +3    Everyone folded
//   lost-showdown    You lost −191  At showdown
//   folded-cost      You folded −2  From the big blind   (or "On the flop" after more went in)
//   folded-free      You folded     It cost nothing      (no grey 0)
//   split            Split pot      At showdown

import type { SessionState } from '../api'
import { STREET_LABEL, streetOfBoard, type Street } from './tableModel'

export type ResultKind = 'won-showdown' | 'won-uncontested' | 'lost-showdown' | 'folded-cost' | 'folded-free' | 'split' | 'even'
export type ResultTone = 'win' | 'loss' | 'neutral'

export interface HandOutcome {
  kind: ResultKind
  /** "You won", "You lost", "You folded", "Split pot". */
  word: string
  /** Chips won or lost; null when there is nothing to show (net 0). */
  net: number | null
  tone: ResultTone
  /** The second line: how it ended. */
  sub: string
}

const BLIND_NAME: Record<string, string> = { SB: 'small blind', BB: 'big blind' }

/** Where the hero folded: "From the big blind" for a blind given up, else "On the flop". */
function foldedWhere(s: SessionState): string {
  const hero = s.hero_seat
  const mine = s.state.history.filter((h) => h.seat === hero)
  const fold = mine.find((h) => h.action === 'fold')
  const street = (fold?.street as Street | undefined) ?? streetOfBoard(s.state.board.length)
  const position = s.state.seats[hero]?.position ?? ''
  // the only chips in were a forced blind: the fold was the hero's first action, preflop
  if (street === 'preflop' && mine[0]?.action === 'fold' && BLIND_NAME[position]) return `From the ${BLIND_NAME[position]}`
  return `On the ${STREET_LABEL[street]?.toLowerCase() ?? street}`
}

export function classifyResult(s: SessionState): HandOutcome | null {
  if (!s.hand_over || !s.last_result) return null
  const net = Math.round(s.last_result.hero_net)
  const showdown = !!s.last_result.went_to_showdown
  const folded = !!s.state.seats[s.hero_seat]?.folded
  if (folded) {
    if (net < 0) return { kind: 'folded-cost', word: 'You folded', net, tone: 'loss', sub: foldedWhere(s) }
    return { kind: 'folded-free', word: 'You folded', net: null, tone: 'neutral', sub: 'It cost nothing' }
  }
  if (net > 0) return { kind: showdown ? 'won-showdown' : 'won-uncontested', word: 'You won', net, tone: 'win', sub: showdown ? 'At showdown' : 'Everyone folded' }
  if (net < 0) return { kind: 'lost-showdown', word: 'You lost', net, tone: 'loss', sub: showdown ? 'At showdown' : 'Hand over' }
  if (showdown) return { kind: 'split', word: 'Split pot', net: null, tone: 'neutral', sub: 'At showdown' }
  return { kind: 'even', word: 'Hand over', net: null, tone: 'neutral', sub: 'You broke even' }
}
