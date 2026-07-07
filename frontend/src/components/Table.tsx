import type { Reads, SessionState } from '../api'
import { Board } from './Board'
import { Seat, type VisibilityMode } from './Seat'

// Screen positions for up to 6 players; hero (player 0) sits bottom-centre and
// opponents keep stable seats while the dealer button rotates.
// Seats are centred on their point (-translate 50/50), so each point is inset
// from the oval edge by roughly half the seat's size — otherwise the extreme
// seats (top-centre, upper sides) poke past the felt rim and the dealer badge
// clips. Verified against measured bounding boxes: every seat now sits inside.
const POSITIONS = [
  { left: '50%', top: '85%' }, // 0 hero (kept clear of the action bar below)
  { left: '13%', top: '71%' }, // 1
  { left: '14%', top: '28%' }, // 2
  { left: '50%', top: '14%' }, // 3 top-centre (was 8% — cards + button badge overflowed)
  { left: '86%', top: '28%' }, // 4
  { left: '87%', top: '71%' }, // 5
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
      {/* felt — flat dark, defined by a hairline, not fills/shadows */}
      <div className="felt absolute inset-0 rounded-[48%] border border-line">
        <div className="absolute inset-5 rounded-[48%] border border-hair" />
      </div>

      {/* board + pot, centred */}
      <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2">
        <Board board={state.board} pot={state.pot} cardWidth={58} />
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
              cardWidth={player === 0 ? 54 : 44}
            />
          </div>
        )
      })}
    </div>
  )
}
