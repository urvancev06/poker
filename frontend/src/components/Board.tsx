import { BoardCard } from './Card'

export function Board({
  board,
  pot,
  cardWidth = 72,
}: {
  board: string[]
  pot: number
  cardWidth?: number
}) {
  // Show the NEXT street's cards face-down, pre-placed on the table, so they flip
  // in: preflop = 3 down (flop); flop = +1 down (turn); turn = +1 down (river).
  const n = board.length
  const incoming = n === 0 ? 3 : n < 5 ? 1 : 0
  const positions = n + incoming
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-full bg-black/40 px-5 py-1.5 text-sm uppercase tracking-[0.22em] text-muted shadow-md ring-1 ring-accent/25">
        pot <span className="ml-1.5 font-bold tabular-nums text-accent">{pot}</span>
      </div>
      <div className="flex gap-2.5">
        {Array.from({ length: positions }, (_, i) => (
          <BoardCard key={i} card={board[i] ?? null} width={cardWidth} />
        ))}
      </div>
    </div>
  )
}
