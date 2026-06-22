// Renders a single playing card as inline SVG using the user's chosen deck
// (see prefs.tsx). All decks share the same 100x140 viewBox, so every deck fits
// identically — only styling differs. `deckId` overrides the active deck (for
// previews in Preferences). Card strings are like "Ah", "Td", "Kc".

import { useId } from 'react'
import { deckById, useDeck, type Parts } from '../prefs'

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const CARD_RATIO = 1.4

function parts(card: string): Parts {
  const rank = card[0] === 'T' ? '10' : card[0].toUpperCase()
  const suit = card[1].toLowerCase()
  return { rank, glyph: SUIT_GLYPH[suit] ?? '?', suit }
}

export function Card({
  card,
  faceDown = false,
  width = 64,
  deckId,
}: {
  card?: string | null
  faceDown?: boolean
  width?: number
  deckId?: string
}) {
  const uid = useId()
  const active = useDeck()
  const deck = deckId ? deckById(deckId) : active
  const height = Math.round(width * CARD_RATIO)
  const shadow = 'drop-shadow(0 4px 9px rgba(0,0,0,0.45))'

  const svgProps = {
    width,
    height,
    viewBox: '0 0 100 140',
    className: 'select-none',
    style: { filter: shadow },
  }

  if (faceDown || !card) {
    return (
      <svg {...svgProps} aria-label="face-down card">
        {deck.back(`back-${uid}`)}
      </svg>
    )
  }

  const p = parts(card)
  return (
    <svg {...svgProps} aria-label={card}>
      <rect x="1" y="1" width="98" height="138" rx={deck.radius} fill={deck.bg} stroke={deck.stroke} />
      {deck.face(p, deck.color(p.suit))}
    </svg>
  )
}

/** An empty card slot (e.g. an undealt board position). Softer than a real card. */
export function CardSlot({ width = 64 }: { width?: number }) {
  return (
    <div
      className="rounded-xl border border-dashed border-line/60"
      style={{ width, height: Math.round(width * CARD_RATIO), background: 'rgba(0,0,0,0.15)' }}
    />
  )
}
