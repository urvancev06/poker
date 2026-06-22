// Renders a single playing card as inline SVG using the user's chosen deck
// (see prefs.tsx). All decks share the same 100x140 viewBox, so every deck fits
// identically — only styling differs. `deckId` overrides the active deck (for
// previews in Preferences). Card strings are like "Ah", "Td", "Kc".

import { useEffect, useId, useState } from 'react'
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

/**
 * A card that flips from back to face-up when it mounts — the "deal" reveal.
 * Key it by the card value so a new card (new hand / next street) remounts and
 * flips, while existing cards stay put. Honours prefers-reduced-motion via the
 * global CSS that zeroes transition durations.
 */
export function DealtCard({ card, width = 64 }: { card: string; width?: number }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const height = Math.round(width * CARD_RATIO)
  return (
    <div className="shrink-0" style={{ width, height, perspective: 800 }}>
      <div
        className="relative h-full w-full transition-transform duration-[450ms] ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: shown ? 'rotateY(0deg)' : 'rotateY(-180deg)',
        }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <Card card={card} width={width} />
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <Card faceDown width={width} />
        </div>
      </div>
    </div>
  )
}

/**
 * A community card that sits face-down until its value is dealt, then flips in
 * place — so the flop/turn/river are physically on the table and turn over,
 * rather than appearing from nowhere. Key it by board POSITION (not value) so
 * the same element persists and animates when `card` goes null -> value.
 */
export function BoardCard({ card, width = 72 }: { card: string | null; width?: number }) {
  const [last, setLast] = useState<string | null>(card)
  useEffect(() => {
    if (card) setLast(card)
  }, [card])
  const height = Math.round(width * CARD_RATIO)
  const faceUp = !!card
  const front = card ?? last // keep showing the last card during a flip-down (board reset)
  return (
    <div className="shrink-0" style={{ width, height, perspective: 800 }}>
      <div
        className="relative h-full w-full transition-transform duration-[450ms] ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: faceUp ? 'rotateY(0deg)' : 'rotateY(-180deg)',
        }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          {front ? <Card card={front} width={width} /> : <Card faceDown width={width} />}
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <Card faceDown width={width} />
        </div>
      </div>
    </div>
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
