// Custom minimal playing cards, drawn as inline SVG (no image deck), styled
// after the Offsuit look the user likes: a bold rank in the top-left, one suit
// centred below it, generously rounded corners, soft shadow. Face-down = a clean
// diagonal hatch. Card strings are like "Ah", "Td", "Kc".

import { useId } from 'react'

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const RED = new Set(['h', 'd'])
const CARD_RATIO = 1.4 // height / width, standard playing-card proportion

function parts(card: string) {
  const rank = card[0] === 'T' ? '10' : card[0].toUpperCase()
  const suit = card[1].toLowerCase()
  return { rank, glyph: SUIT_GLYPH[suit] ?? '?', red: RED.has(suit) }
}

export function Card({
  card,
  faceDown = false,
  width = 64,
}: {
  card?: string | null
  faceDown?: boolean
  width?: number
}) {
  const id = useId()
  const height = Math.round(width * CARD_RATIO)
  const shadow = 'drop-shadow(0 4px 9px rgba(0,0,0,0.45))'

  if (faceDown || !card) {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 100 140"
        className="select-none"
        style={{ filter: shadow }}
        aria-label="face-down card"
      >
        <defs>
          <pattern
            id={`hatch-${id}`}
            width="13"
            height="13"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="13" height="13" fill="var(--color-card)" />
            <rect width="6" height="13" fill="rgba(28,24,19,0.13)" />
          </pattern>
        </defs>
        <rect
          x="1"
          y="1"
          width="98"
          height="138"
          rx="12"
          fill={`url(#hatch-${id})`}
          stroke="rgba(0,0,0,0.16)"
        />
      </svg>
    )
  }

  const { rank, glyph, red } = parts(card)
  const color = red ? 'var(--color-card-red)' : 'var(--color-card-ink)'
  const rankSize = rank.length > 1 ? 28 : 34 // "10" is wider

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 140"
      className="select-none"
      style={{ filter: shadow }}
      aria-label={card}
    >
      <rect x="1" y="1" width="98" height="138" rx="12" fill="var(--color-card)" stroke="rgba(0,0,0,0.14)" />
      <g fontFamily="var(--font-ui), sans-serif" fill={color}>
        {/* bold rank, top-left */}
        <text x="26" y="40" fontSize={rankSize} fontWeight="800" textAnchor="middle">
          {rank}
        </text>
        {/* one suit, centred below */}
        <text x="50" y="104" fontSize="50" textAnchor="middle">
          {glyph}
        </text>
      </g>
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
