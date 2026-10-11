// Card codes: rank 2-9 T J Q K A plus suit s h d c, e.g. "Ah", "Td". "T" reads as "10".

export type Suit = 's' | 'h' | 'd' | 'c'

export interface ParsedCard {
  /** As printed on the card: "A", "10", "7". */
  rank: string
  suit: Suit
}

const RANKS = new Set(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'])
const SUITS = new Set(['s', 'h', 'd', 'c'])
const RANK_NAME: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' }
const SUIT_NAME: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

/** The card, or null for anything that is not a valid code. */
export function parseCard(code: string | null | undefined): ParsedCard | null {
  if (!code || code.length !== 2) return null
  const r = code[0].toUpperCase()
  const s = code[1].toLowerCase()
  if (!RANKS.has(r) || !SUITS.has(s)) return null
  return { rank: r === 'T' ? '10' : r, suit: s as Suit }
}

/** Speech-friendly name: "Ace of spades", "10 of hearts". */
export function cardLabel(code: string | null | undefined): string {
  const c = parseCard(code)
  if (!c) return 'Unknown card'
  const r = code![0].toUpperCase()
  return `${RANK_NAME[r] ?? r} of ${SUIT_NAME[c.suit]}`
}

/** "Tc3h" (how History joins hole cards) -> ["Tc", "3h"]. */
export function splitCards(joined: string | null | undefined): string[] {
  if (!joined) return []
  const s = joined.replace(/\s+/g, '')
  const out: string[] = []
  for (let i = 0; i + 1 < s.length; i += 2) out.push(s.slice(i, i + 2))
  return out
}
