import { Card, CardSlot } from './Card'

export function Board({ board, pot }: { board: string[]; pot: number }) {
  const slots = [...board, ...Array(Math.max(0, 5 - board.length)).fill(null)]
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-full bg-black/30 px-4 py-1 text-sm uppercase tracking-[0.2em] text-muted">
        pot <span className="ml-1 font-bold tabular-nums text-accent">{pot}</span>
      </div>
      <div className="flex gap-2">
        {slots.map((c, i) =>
          c ? <Card key={i} card={c} width={64} /> : <CardSlot key={i} width={64} />,
        )}
      </div>
    </div>
  )
}
