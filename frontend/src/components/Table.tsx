import type { Reads, SessionState } from '../api'
import { Board } from './Board'
import { Seat, type VisibilityMode } from './Seat'

// Screen positions for up to 6 players; hero (player 0) sits bottom-centre and
// opponents keep stable seats while the dealer button rotates.
const POSITIONS = [
  { left: '50%', top: '92%' }, // 0 hero
  { left: '10%', top: '71%' }, // 1
  { left: '11%', top: '27%' }, // 2
  { left: '50%', top: '8%' }, // 3
  { left: '89%', top: '27%' }, // 4
  { left: '90%', top: '71%' }, // 5
]

export function Table({
  session,
  mode,
  reads,
}: {
  session: SessionState
  mode: VisibilityMode
  reads?: Reads
}) {
  const { state } = session
  const playerToSeat: number[] = []
  session.seat_to_player.forEach((player, seat) => {
    playerToSeat[player] = seat
  })

  return (
    <div className="relative mx-auto aspect-[16/10] h-full max-h-[620px] w-auto max-w-full">
      {/* felt */}
      <div className="felt absolute inset-0 rounded-[48%] border-[6px] border-[#2a2014]/80 ring-1 ring-black/40">
        <div className="absolute inset-6 rounded-[48%] ring-1 ring-white/5" />
      </div>

      {/* board + pot, centred */}
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
        <Board board={state.board} pot={state.pot} />
      </div>

      {/* seats */}
      {session.archetypes.map((archetype, player) => {
        const seatIdx = playerToSeat[player]
        const seatData = state.seats[seatIdx]
        if (!seatData) return null
        const pos = POSITIONS[player] ?? POSITIONS[0]
        return (
          <div
            key={player}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos.left, top: pos.top }}
          >
            <Seat
              seat={seatData}
              archetype={archetype}
              isHero={player === 0}
              isButton={player === session.button_player}
              mode={mode}
              handOver={session.hand_over}
              read={reads?.[String(player)]}
              cardWidth={player === 0 ? 74 : 50}
            />
          </div>
        )
      })}
    </div>
  )
}
