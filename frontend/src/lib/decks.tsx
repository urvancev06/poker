// The five decks, all in the Stage language: white continuous-corner faces with a soft
// top-to-bottom fall-off, suits drawn as paths (not font glyphs), the rank in the app's
// own type (650 weight), and one back: the scene in miniature (a sky of the atmosphere's
// blue rising to a bright limb, the planet's black body, the owner's mark as fine orbits).
// Every deck draws on the same 100 x 140 viewBox, so decks swap at any card size.
//
//   Standard     two-colour, rank + small suit top left, a large pip bottom right (default)
//   Four-color   the same face, each suit its own colour (spades ink, hearts red,
//                diamonds blue, clubs green): suits told apart at a glance
//   Large index  an oversized rank and suit for small cards (phones, showdown reveals)
//   Minimal      just the corner index on a flat face
//   Classic      indices in opposite corners plus a centre pip
//
// Ids and names live in lib/deckIds.ts (with the migration from the old ids).

import type { ReactNode } from 'react'
import type { ParsedCard, Suit } from './cards'
import { DECK_IDS, DECK_NAMES, normalizeDeckId, type DeckId } from './deckIds'

/** Continuous-corner outline (corner length 16, short handles: squircle-like). */
export const CARD_OUTLINE = 'M16 0H84C96.5 0 100 3.5 100 16V124C100 136.5 96.5 140 84 140H16C3.5 140 0 136.5 0 124V16C0 3.5 3.5 0 16 0Z'
export const CARD_INSET = 'M16 1.2H84C95.6 1.2 98.8 4.4 98.8 16V124C98.8 135.6 95.6 138.8 84 138.8H16C4.4 138.8 1.2 135.6 1.2 124V16C1.2 4.4 4.4 1.2 16 1.2Z'

/** Suits in a 100 x 100 box. */
function suitPath(suit: Suit): ReactNode {
  switch (suit) {
    case 's':
      return <path d="M50 3C59 20 95 37 95 62C95 77 83 86 70 86C62 86 56 82 52.5 76.5C53.5 86 57.5 93 66 98H34C42.5 93 46.5 86 47.5 76.5C44 82 38 86 30 86C17 86 5 77 5 62C5 37 41 20 50 3Z" />
    case 'h':
      return <path d="M50 94C43 85 3 61 3 32C3 16.5 14.5 5 29 5C39 5 46 11 50 20C54 11 61 5 71 5C85.5 5 97 16.5 97 32C97 61 57 85 50 94Z" />
    case 'd':
      return <path d="M50 2C59 19 73 36 90 50C73 64 59 81 50 98C41 81 27 64 10 50C27 36 41 19 50 2Z" />
    case 'c':
      return (
        <>
          <circle cx="50" cy="27" r="21" />
          <circle cx="26" cy="59" r="21" />
          <circle cx="74" cy="59" r="21" />
          <circle cx="50" cy="52" r="13" />
          <path d="M45 56C45 76 41 88 32 98H68C59 88 55 76 55 56Z" />
        </>
      )
  }
}

function pip(suit: Suit, color: string, x: number, y: number, scale: number): ReactNode {
  return (
    <g fill={color} transform={`translate(${x} ${y}) scale(${scale})`}>
      {suitPath(suit)}
    </g>
  )
}

/** The corner index: rank, and a small suit under it. */
function index(card: ParsedCard, color: string, size = 38): ReactNode {
  const ten = card.rank.length > 1
  const k = size / 38
  const fs = (ten ? 33 : 38) * k
  return (
    <>
      <text x={ten ? 8 : 11} y={3 + 38 * k} fontSize={fs} letterSpacing={ten ? -3 * k : -1 * k} fill={color}>
        {card.rank}
      </text>
      {pip(card.suit, color, ten ? 10 : 12.5, 11 + 38 * k, 0.19 * k)}
    </>
  )
}

export interface DeckDef {
  id: DeckId
  name: string
  /** Suit colours on the white face (each >= 4.5:1). */
  colors: Record<Suit, string>
  /** Flat white face instead of the soft fall-off. */
  flat?: boolean
  face: (card: ParsedCard, color: string) => ReactNode
}

const INK = '#1d1d1f'
const RED = '#d70015'
const TWO: Record<Suit, string> = { s: INK, c: INK, h: RED, d: RED }
const FOUR: Record<Suit, string> = { s: INK, h: RED, d: '#0057c8', c: '#167a33' }

const standardFace = (c: ParsedCard, color: string) => (
  <>
    {index(c, color)}
    {pip(c.suit, color, 41, 79, 0.5)}
  </>
)

export const DECKS: readonly DeckDef[] = [
  { id: 'standard', name: DECK_NAMES.standard, colors: TWO, face: standardFace },
  { id: 'four', name: DECK_NAMES.four, colors: FOUR, face: standardFace },
  {
    id: 'large',
    name: DECK_NAMES.large,
    colors: TWO,
    face: (c, color) => (
      <>
        {index(c, color, 60)}
        {pip(c.suit, color, 56, 92, 0.36)}
      </>
    ),
  },
  { id: 'minimal', name: DECK_NAMES.minimal, colors: TWO, flat: true, face: (c, color) => index(c, color) },
  {
    id: 'classic',
    name: DECK_NAMES.classic,
    colors: TWO,
    face: (c, color) => (
      <>
        {index(c, color, 30)}
        <g transform="rotate(180 50 70)">{index(c, color, 30)}</g>
        {pip(c.suit, color, 30, 50, 0.4)}
      </>
    ),
  },
]

if (DECKS.length !== DECK_IDS.length) throw new Error('every deck id needs a deck')

export const deckById = (id: string | null | undefined): DeckDef => {
  const want = normalizeDeckId(id)
  return DECKS.find((d) => d.id === want) ?? DECKS[0]
}
