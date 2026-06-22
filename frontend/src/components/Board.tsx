import { Card, CardSlot } from './Card'

export function Board({ board, pot }: { board: string[]; pot: number }) {
  const slots = [...board, ...Array(Math.max(0, 5 - board.length)).fill(null)]
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-full bg-black/40 px-5 py-1.5 text-sm uppercase tracking-[0.22em] text-muted shadow-md ring-1 ring-accent/25">
        pot <span className="ml-1.5 font-bold tabular-nums text-accent">{pot}</span>
      </div>
      <div className="flex gap-2.5">
        {slots.map((c, i) =>
          c ? <Card key={i} card={c} width={72} /> : <CardSlot key={i} width={72} />,
        )}
      </div>
    </div>
  )
}
