// Renders a single playing card from the bundled Byron Knoll SVG deck.
// Card strings are like "Ah", "Td", "Kc"; deck files are "AH.svg", "10D.svg".

function cardCode(card: string): string {
  const rank = card[0] === 'T' ? '10' : card[0]
  return `${rank}${card[1].toUpperCase()}`
}

export function Card({
  card,
  faceDown = false,
  width = 60,
}: {
  card?: string | null
  faceDown?: boolean
  width?: number
}) {
  const src = faceDown || !card ? '/cards/back.svg' : `/cards/${cardCode(card)}.svg`
  return (
    <img
      src={src}
      alt={faceDown || !card ? 'face-down card' : card}
      loading="lazy"
      draggable={false}
      className="select-none rounded-[7%]"
      style={{
        width,
        height: 'auto',
        filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))',
      }}
    />
  )
}

/** An empty card slot (e.g. an undealt board position). */
export function CardSlot({ width = 60 }: { width?: number }) {
  return (
    <div
      className="rounded-md border border-line/60"
      style={{ width, height: width * 1.452, background: 'rgba(0,0,0,0.18)' }}
    />
  )
}
