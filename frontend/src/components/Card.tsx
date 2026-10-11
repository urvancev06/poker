// Playing cards as inline SVG on one 100 x 140 viewBox, drawn with the deck the player
// picked (lib/decks.tsx). Card codes look like "Ah", "Td", "Kc".
//
//   <Card card="Ah" width={64} />          a face (aria-label "Ace of hearts")
//   <Card faceDown width={40} />           the back (aria-label "Face-down card")
//   <Card card="Ks" deckId="four" />       a specific deck (the Preferences previews)
//   <DealtCard card="Ah" />                mounts face down and turns over (the deal)
//   <BoardCard card={board[i] ?? null} />  face down until its value arrives, then turns
//
// Shadows belong to the context (felt, hero hand), via className: the element's radius
// follows the card's corner.

import { useEffect, useId, useState } from 'react'
import { CARD_INSET, CARD_OUTLINE, deckById, type DeckDef } from '../lib/decks'
import { cardLabel, parseCard, type ParsedCard } from '../lib/cards'
import { useDeck } from '../lib/prefsContext'
import './Card.css'

const RATIO = 1.4

function CardFace({ card, deck, uid }: { card: ParsedCard; deck: DeckDef; uid: string }) {
  return (
    <>
      {!deck.flat && (
        <defs>
          <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ebebf0" />
          </linearGradient>
        </defs>
      )}
      <path d={CARD_OUTLINE} fill={deck.flat ? '#ffffff' : `url(#${uid}f)`} />
      {deck.face(card, deck.colors[card.suit])}
    </>
  )
}

/** The back, the same for every deck: the scene in miniature. Deliberately lit (not
 * near-black), so a live opponent's cards read at >= 3:1 against the obsidian table. */
function CardBack({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#224a8c" />
          <stop offset=".5" stopColor="#3374d0" />
          <stop offset=".71" stopColor="#5aa2f6" />
          <stop offset=".74" stopColor="#a8d6ff" />
        </linearGradient>
        <clipPath id={`${uid}c`}>
          <path d={CARD_OUTLINE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}c)`}>
        <rect width="100" height="140" fill={`url(#${uid}s)`} />
        <circle cx="50" cy="268" r="166" fill="#04060b" />
        <circle cx="50" cy="268" r="166" fill="none" stroke="#e4f1ff" strokeWidth="1.3" />
        <circle cx="50" cy="268" r="168.5" fill="none" stroke="#9fd0ff" strokeOpacity=".35" strokeWidth="3" />
        <circle cx="20" cy="18" r=".8" fill="#fff" fillOpacity=".8" />
        <circle cx="81" cy="27" r=".6" fill="#fff" fillOpacity=".7" />
        <circle cx="67" cy="12" r=".5" fill="#fff" fillOpacity=".6" />
        <circle cx="12" cy="60" r=".55" fill="#fff" fillOpacity=".5" />
        <circle cx="88" cy="66" r=".5" fill="#fff" fillOpacity=".45" />
        <g fill="none" stroke="#fff" strokeLinecap="square" transform="translate(33 31) scale(.066)">
          <path d="M61 41L61 318Q61 482 256 482Q451 482 451 318L451 41" strokeWidth="22" strokeOpacity=".3" />
          <path d="M123 72L123 307Q123 431 256 431Q389 431 389 307L389 72" strokeWidth="27" strokeOpacity=".55" />
          <path d="M194 102L194 287Q194 369 256 369Q318 369 318 287L318 102" strokeWidth="32" strokeOpacity=".92" />
        </g>
      </g>
      <path d={CARD_INSET} fill="none" stroke="#fff" strokeOpacity=".62" strokeWidth="2.2" />
    </>
  )
}

export interface CardProps {
  card?: string | null
  faceDown?: boolean
  /** Width in px; the height is 1.4 x. */
  width?: number
  /** A specific deck instead of the player's (the Preferences previews). */
  deckId?: string
  className?: string
  /** Hide from assistive tech (e.g. the hidden side of a turning card). */
  decorative?: boolean
}

export function Card({ card, faceDown = false, width = 64, deckId, className = '', decorative = false }: CardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const active = useDeck()
  const deck = deckId ? deckById(deckId) : active
  const parsed = faceDown ? null : parseCard(card)
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': parsed ? cardLabel(card) : 'Face-down card' }
  return (
    <svg viewBox="0 0 100 140" width={width} height={Math.round(width * RATIO)} className={`card ${className}`} focusable="false" {...a11y}>
      {parsed ? <CardFace card={parsed} deck={deck} uid={uid} /> : <CardBack uid={uid} />}
    </svg>
  )
}

/**
 * Mounts face down and turns face up on the next frame: the deal reveal. Key it by card
 * value, so a new card remounts and turns while unchanged cards stay still. Reduced
 * motion: the global rule makes the turn instant.
 */
export function DealtCard({ card, width = 64, className = '' }: { card: string; width?: number; className?: string }) {
  const [up, setUp] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setUp(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className={`card-flip ${up ? 'is-up' : ''} ${className}`} style={{ width, height: Math.round(width * RATIO) }}>
      <div className="card-flip__inner">
        <div className="card-flip__side">
          <Card card={card} width={width} decorative={!up} />
        </div>
        <div className="card-flip__side card-flip__side--back">
          <Card faceDown width={width} decorative />
        </div>
      </div>
    </div>
  )
}

/**
 * A community card that sits face down until its value arrives, then turns in place. Key
 * it by board POSITION, so the same element persists and animates when `card` goes from
 * null to a value. While face down it exposes no face to assistive tech.
 */
export function BoardCard({ card, width = 72, className = '' }: { card: string | null; width?: number; className?: string }) {
  const [last, setLast] = useState<string | null>(card)
  // Adjusted during render: `last` is only read while `card` is null (a flip back down).
  if (card && card !== last) setLast(card)
  const front = card ?? last
  return (
    <div className={`card-flip ${card ? 'is-up' : ''} ${className}`} style={{ width, height: Math.round(width * RATIO) }}>
      <div className="card-flip__inner">
        <div className="card-flip__side">{front ? <Card card={front} width={width} decorative={!card} /> : <Card faceDown width={width} decorative />}</div>
        <div className="card-flip__side card-flip__side--back">
          <Card faceDown width={width} decorative={!!card} />
        </div>
      </div>
    </div>
  )
}
