// Playing cards as inline SVG on one 100 x 140 viewBox, drawn with the deck the player
// picked (lib/decks.tsx). Card codes look like "Ah", "Td", "Kc".
//
//   <Card card="Ah" width={64} />          a face (aria-label "Ace of hearts")
//   <Card faceDown width={40} />           the back (aria-label "Face-down card")
//   <Card card="Ks" deckId="four" />       a specific deck (the Preferences previews)
// (A card that turns over on the table is FlipCard, components/table/Felt.tsx.)
//
// Shadows belong to the context (felt, hero hand), via className: the element's radius
// follows the card's corner.

import { useId } from 'react'
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

/** The limb as fine engraved orbits: arcs of one circle family centred below the card. */
const BACK_ORBITS = Array.from({ length: 15 }, (_, i) => 86 + i * 7.5)

/** The back, the same for every deck: deep navy graphite with the limb engraved as fine
 * orbits inside a thin frame, the mark small at the centre, and a thin light rim that is
 * brightest along the bottom edge (the light comes from the planet below). Quiet, so a
 * table of backs never outshouts the board; the rim is what reads against the obsidian. */
function CardBack({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#25375a" />
          <stop offset=".6" stopColor="#1a2843" />
          <stop offset="1" stopColor="#1f3963" />
        </linearGradient>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6e4f7" stopOpacity=".42" />
          <stop offset=".7" stopColor="#bcd8fb" stopOpacity=".55" />
          <stop offset="1" stopColor="#a8d4ff" stopOpacity=".95" />
        </linearGradient>
        <clipPath id={`${uid}c`}>
          <path d={CARD_OUTLINE} />
        </clipPath>
        <clipPath id={`${uid}f`}>
          <rect x="9" y="9" width="82" height="122" rx="8" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}c)`}>
        <rect width="100" height="140" fill={`url(#${uid}s)`} />
      </g>
      <g clipPath={`url(#${uid}f)`} fill="none" stroke="#a9cbff" strokeWidth="1.1">
        {BACK_ORBITS.map((r, i) => (
          <circle key={r} cx="50" cy="214" r={r} strokeOpacity={0.17 - (i / BACK_ORBITS.length) * 0.1} />
        ))}
      </g>
      <rect x="9" y="9" width="82" height="122" rx="8" fill="none" stroke="#cfe0f7" strokeOpacity=".2" strokeWidth="1.3" />
      <g fill="none" stroke="#dbe8fb" strokeLinecap="square" transform="translate(40.8 60.5) scale(.036)">
        <path d="M61 41L61 318Q61 482 256 482Q451 482 451 318L451 41" strokeWidth="30" strokeOpacity=".16" />
        <path d="M123 72L123 307Q123 431 256 431Q389 431 389 307L389 72" strokeWidth="34" strokeOpacity=".26" />
        <path d="M194 102L194 287Q194 369 256 369Q318 369 318 287L318 102" strokeWidth="40" strokeOpacity=".42" />
      </g>
      {/* the rim is a screen-px hairline at any size, so it stays crisp on a phone's small backs */}
      <path d={CARD_INSET} fill="none" stroke={`url(#${uid}r)`} strokeWidth="1.15" vectorEffect="non-scaling-stroke" />
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
