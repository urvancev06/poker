// Board preferences: card deck + felt colour, persisted in localStorage and
// shared via context. Decks are all drawn as inline SVG on the same 100x140
// viewBox, so every deck fits identically — only the styling differs.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface Parts {
  rank: string
  glyph: string
  suit: string
}

export interface DeckDef {
  id: string
  name: string
  radius: number
  bg: string
  stroke: string
  color: (suit: string) => string
  face: (p: Parts, color: string) => ReactNode
  back: (uid: string) => ReactNode
}

const INK = 'var(--color-card-ink)'
const RED = 'var(--color-card-red)'
const CARD = 'var(--color-card)'
const ACCENT = 'var(--color-accent)'
const FONT = 'var(--font-ui), sans-serif'

const twoColor = (suit: string) => (suit === 'h' || suit === 'd' ? RED : INK)
const fourColor = (suit: string) =>
  ({ s: INK, h: RED, d: '#1f5fa8', c: '#1f7a4d' })[suit] ?? INK
const noirColor = (suit: string) => (suit === 'h' || suit === 'd' ? '#d4756a' : '#ece4d2')

// --- shared face layouts ------------------------------------------------- //
function centerFace(p: Parts, color: string) {
  return (
    <g fontFamily={FONT} fill={color}>
      <text x="26" y="40" fontSize={p.rank.length > 1 ? 28 : 34} fontWeight="800" textAnchor="middle">
        {p.rank}
      </text>
      <text x="50" y="104" fontSize="50" textAnchor="middle">
        {p.glyph}
      </text>
    </g>
  )
}

function classicFace(p: Parts, color: string) {
  const idx = (
    <g>
      <text x="15" y="27" fontSize={p.rank.length > 1 ? 17 : 21} fontWeight="700" textAnchor="middle">
        {p.rank}
      </text>
      <text x="15" y="45" fontSize="15" textAnchor="middle">
        {p.glyph}
      </text>
    </g>
  )
  return (
    <g fontFamily={FONT} fill={color}>
      {idx}
      <g transform="rotate(180 50 70)">{idx}</g>
      <text x="50" y="87" fontSize="40" textAnchor="middle" fillOpacity="0.9">
        {p.glyph}
      </text>
    </g>
  )
}

function boldFace(p: Parts, color: string) {
  const suit = (
    <text x="15" y="26" fontSize="17" textAnchor="middle">
      {p.glyph}
    </text>
  )
  return (
    <g fontFamily={FONT} fill={color}>
      {suit}
      <g transform="rotate(180 50 70)">{suit}</g>
      <text x="50" y="98" fontSize={p.rank.length > 1 ? 58 : 78} fontWeight="800" textAnchor="middle">
        {p.rank}
      </text>
    </g>
  )
}

// --- shared backs -------------------------------------------------------- //
function hatchBack(uid: string, line = 'rgba(28,24,19,0.13)', bg = CARD, radius = 12) {
  return (
    <>
      <defs>
        <pattern id={uid} width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="13" height="13" fill={bg} />
          <rect width="6" height="13" fill={line} />
        </pattern>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx={radius} fill={`url(#${uid})`} stroke="rgba(0,0,0,0.16)" />
    </>
  )
}

function brassBack(bg: string, radius = 10) {
  return (
    <>
      <rect x="1" y="1" width="98" height="138" rx={radius} fill={bg} stroke="rgba(0,0,0,0.18)" />
      <rect x="7" y="7" width="86" height="126" rx={radius - 3} fill="none" stroke={ACCENT} strokeOpacity="0.4" />
      <rect
        x="40"
        y="60"
        width="20"
        height="20"
        transform="rotate(45 50 70)"
        fill="none"
        stroke={ACCENT}
        strokeOpacity="0.55"
        strokeWidth="1.4"
      />
    </>
  )
}

// --- the five decks ------------------------------------------------------ //
export const DECKS: DeckDef[] = [
  {
    id: 'offsuit',
    name: 'Offsuit',
    radius: 12,
    bg: CARD,
    stroke: 'rgba(0,0,0,0.14)',
    color: twoColor,
    face: centerFace,
    back: (uid) => hatchBack(uid),
  },
  {
    id: 'classic',
    name: 'Classic',
    radius: 8,
    bg: CARD,
    stroke: 'rgba(0,0,0,0.16)',
    color: twoColor,
    face: classicFace,
    back: () => brassBack('var(--color-felt-edge)', 8),
  },
  {
    id: 'bold',
    name: 'Bold',
    radius: 10,
    bg: CARD,
    stroke: 'rgba(0,0,0,0.14)',
    color: twoColor,
    face: boldFace,
    back: (uid) => hatchBack(uid, 'rgba(201,164,78,0.16)', CARD, 10),
  },
  {
    id: 'fourcolor',
    name: 'Four-colour',
    radius: 12,
    bg: CARD,
    stroke: 'rgba(0,0,0,0.14)',
    color: fourColor,
    face: centerFace,
    back: (uid) => hatchBack(uid),
  },
  {
    id: 'noir',
    name: 'Noir',
    radius: 12,
    bg: '#221d14',
    stroke: 'rgba(201,164,78,0.5)',
    color: noirColor,
    face: centerFace,
    back: () => brassBack('#221d14', 12),
  },
]

// --- context ------------------------------------------------------------- //
function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

interface PrefsValue {
  deckId: string
  deck: DeckDef
  setDeckId: (id: string) => void
}

const PrefsContext = createContext<PrefsValue>({
  deckId: 'offsuit',
  deck: DECKS[0],
  setDeckId: () => {},
})

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [deckId, setDeckId] = useState(() => load('poker-deck', 'offsuit'))

  useEffect(() => {
    save('poker-deck', deckId)
  }, [deckId])

  const deck = DECKS.find((d) => d.id === deckId) ?? DECKS[0]
  return (
    <PrefsContext.Provider value={{ deckId, deck, setDeckId }}>{children}</PrefsContext.Provider>
  )
}

export const usePrefs = () => useContext(PrefsContext)
export const useDeck = () => useContext(PrefsContext).deck
export const deckById = (id: string) => DECKS.find((d) => d.id === id) ?? DECKS[0]
