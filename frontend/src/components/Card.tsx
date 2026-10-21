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
import { LIMB_LIGHT } from '../lib/slabLight'
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

/** The back, the same for every deck: deep navy graphite with the limb's light lifting it
 * softly from the bottom edge (a smooth glow, no fine pattern: on a 20-40 px back any
 * engraving reads as ribbing), a thin frame, and a thin rim lit only along the near
 * (bottom) edge, where the planet's light catches it, as it catches a chip's. Quiet, so a
 * table of backs never outshouts the board. `.card__shade` darkens the under card of a
 * pair (Stage.css), so the pair reads as two cards, the front one lying on the other;
 * `.card__lift` and `.card__edge` (off by default) lift a phone's small backs a step and
 * edge them all round, so they read as cards rather than dark squares. */
function CardBack({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#223558" />
          <stop offset="1" stopColor="#17233a" />
        </linearGradient>
        <radialGradient id={`${uid}l`} cx=".5" cy="1.08" r=".78" gradientTransform="translate(.5 1.08) scale(1 .72) translate(-.5 -1.08)">
          <stop offset="0" stopColor={LIMB_LIGHT} stopOpacity=".22" />
          <stop offset=".55" stopColor={LIMB_LIGHT} stopOpacity=".07" />
          <stop offset="1" stopColor={LIMB_LIGHT} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={LIMB_LIGHT} stopOpacity=".16" />
          <stop offset=".6" stopColor={LIMB_LIGHT} stopOpacity=".35" />
          <stop offset="1" stopColor={LIMB_LIGHT} stopOpacity=".9" />
        </linearGradient>
      </defs>
      <path d={CARD_OUTLINE} fill={`url(#${uid}s)`} />
      <path d={CARD_OUTLINE} fill={`url(#${uid}l)`} />
      <path className="card__lift" d={CARD_OUTLINE} />
      <rect x="9" y="9" width="82" height="122" rx="8" fill="none" stroke={LIMB_LIGHT} strokeOpacity=".14" strokeWidth="1.3" />
      {/* the rim is a screen-px hairline at any size, so it stays crisp on a phone's small backs */}
      <path d={CARD_INSET} fill="none" stroke={`url(#${uid}r)`} strokeWidth="1.15" vectorEffect="non-scaling-stroke" />
      <path className="card__edge" d={CARD_INSET} vectorEffect="non-scaling-stroke" />
      <path className="card__shade" d={CARD_OUTLINE} />
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
