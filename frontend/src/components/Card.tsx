// Custom minimal playing cards, drawn as inline SVG (no image deck): a large
// corner rank+suit, one centred suit glyph, nothing busy. Tiny, crisp, and fully
// themeable in Felt & Brass. Card strings are like "Ah", "Td", "Kc".

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
  const height = Math.round(width * CARD_RATIO)
  const shadow = 'drop-shadow(0 3px 6px rgba(0,0,0,0.55))'

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
        <rect x="1" y="1" width="98" height="138" rx="7" fill="var(--color-felt-edge)" />
        <rect
          x="6.5"
          y="6.5"
          width="87"
          height="127"
          rx="5"
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity="0.45"
        />
        <rect
          x="40"
          y="60"
          width="20"
          height="20"
          transform="rotate(45 50 70)"
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
      </svg>
    )
  }

  const { rank, glyph, red } = parts(card)
  const color = red ? 'var(--color-card-red)' : 'var(--color-card-ink)'
  const rankSize = rank.length > 1 ? 24 : 30 // "10" is wider

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 140"
      className="select-none"
      style={{ filter: shadow }}
      aria-label={card}
    >
      <rect x="1" y="1" width="98" height="138" rx="7" fill="var(--color-card)" stroke="rgba(0,0,0,0.16)" />
      {/* centred suit */}
      <text
        x="50"
        y="86"
        fontSize="56"
        fill={color}
        fillOpacity="0.92"
        textAnchor="middle"
        fontFamily="var(--font-ui), sans-serif"
      >
        {glyph}
      </text>
      {/* top-left index */}
      <g fontFamily="var(--font-ui), sans-serif" fill={color}>
        <text x="11" y="30" fontSize={rankSize} fontWeight="700" textAnchor="middle">
          {rank}
        </text>
        <text x="11" y="50" fontSize="18" textAnchor="middle">
          {glyph}
        </text>
      </g>
      {/* bottom-right index (rotated) */}
      <g fontFamily="var(--font-ui), sans-serif" fill={color} transform="rotate(180 50 70)">
        <text x="11" y="30" fontSize={rankSize} fontWeight="700" textAnchor="middle">
          {rank}
        </text>
        <text x="11" y="50" fontSize="18" textAnchor="middle">
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
      className="rounded-md border border-dashed border-line/60"
      style={{ width, height: Math.round(width * CARD_RATIO), background: 'rgba(0,0,0,0.15)' }}
    />
  )
}
