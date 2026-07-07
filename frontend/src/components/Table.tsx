import { useLayoutEffect, useRef, useState } from 'react'
import type { Reads, SessionState } from '../api'
import { Board } from './Board'
import { Seat, type VisibilityMode } from './Seat'

// The table is laid out ONCE at this fixed design size (px), then scaled as a
// single unit to fit whatever space it's given (see useFitScale). Because the
// scale is uniform, every seat / card / chip / the pot keep their exact
// relationship at any window size — the geometry can never compress or collide.
const DESIGN_W = 560
const DESIGN_H = 664 // a touch of extra height spreads the seat ring off the
// fixed-size board/pot for comfortable clearance (verified: min gap ~15px+).

// Screen positions for up to 6 players; hero (player 0) sits bottom-centre and
// opponents keep stable seats while the dealer button rotates. Percentages are
// of the fixed design box above, tuned so no seat rides outside the oval.
const POSITIONS = [
  { left: '50%', top: '85%' }, // 0 hero (kept clear of the action bar below)
  { left: '13%', top: '71%' }, // 1
  { left: '14%', top: '28%' }, // 2
  { left: '50%', top: '14%' }, // 3 top-centre
  { left: '86%', top: '28%' }, // 4
  { left: '87%', top: '71%' }, // 5
]

/** Fit a fixed DESIGN_W×DESIGN_H box into the observed parent, uniformly.
 * scale = min(availW/DESIGN_W, availH/DESIGN_H), capped at 1 so we never
 * upscale past the crisp design size. */
function useFitScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (!width || !height) return
      setScale(Math.min(width / DESIGN_W, height / DESIGN_H, 1))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return scale
}

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
  const outer = useRef<HTMLDivElement>(null)
  const scale = useFitScale(outer)

  const playerToSeat: number[] = []
  session.seat_to_player.forEach((player, seat) => {
    playerToSeat[player] = seat
  })

  return (
    // Measured viewport: the table scales to fit this box, centred.
    <div ref={outer} className="relative h-full w-full">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
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
    </div>
  )
}
