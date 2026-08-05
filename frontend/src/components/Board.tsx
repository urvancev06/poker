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
    <div className="flex flex-col items-center gap-3">
      {/* The pot reads 0 once the chips are pushed; hide it then, but keep the
          space reserved so the board doesn't jump. */}
      <div className={`text-center leading-none ${pot > 0 ? '' : 'invisible'}`}>
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">Pot</div>
        <div className="mt-1 text-[28px] font-light tabular-nums text-ink">{pot}</div>
      </div>
      <div className="flex gap-2.5">
        {Array.from({ length: positions }, (_, i) => (
          <BoardCard key={i} card={board[i] ?? null} width={cardWidth} />
        ))}
      </div>
    </div>
  )
}
