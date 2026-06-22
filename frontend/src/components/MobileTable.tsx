import type { Reads, SessionState } from '../api'
import { Board } from './Board'
import { Card, DealtCard } from './Card'
import { seatLabel, type VisibilityMode } from './Seat'

// Portrait, Offsuit-style layout for phones: opponents across the top, the board
// in the middle, your hand at the bottom (the big action buttons live in App,
// directly below). The desktop oval table is used on large screens instead.
export function MobileTable({
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
  const n = session.archetypes.length
  const opponents = Array.from({ length: n - 1 }, (_, i) => i + 1) // players 1..n-1
  const heroSeat = state.seats[session.hero_seat]

  return (
    <div className="felt flex h-full w-full flex-col gap-2 rounded-3xl border-4 border-[#2a2014]/70 p-3 ring-1 ring-black/40">
      {/* opponents */}
      <div className="flex flex-wrap items-start justify-center gap-1.5">
        {opponents.map((player) => {
          const sd = state.seats[playerToSeat[player]]
          if (!sd) return null
          return (
            <OppSeat
              key={player}
              seat={sd}
              archetype={session.archetypes[player]}
              isButton={player === session.button_player}
              mode={mode}
              handOver={session.hand_over}
              read={reads?.[String(player)]}
            />
          )
        })}
      </div>

      {/* board + pot */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Board board={state.board} pot={state.pot} cardWidth={44} />
      </div>

      {/* hero */}
      {heroSeat && (
        <div className="relative flex flex-col items-center gap-1">
          {session.button_player === 0 && (
            <div className="absolute right-1/2 top-0 grid h-5 w-5 translate-x-10 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-ink ring-2 ring-bg">
              D
            </div>
          )}
          <div className="flex items-end gap-1.5">
            {heroSeat.hole_cards ? (
              heroSeat.hole_cards.map((c) => <DealtCard key={c} card={c} width={54} />)
            ) : (
              <>
                <Card faceDown width={54} />
                <Card faceDown width={54} />
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <span className="font-semibold text-muted">{heroSeat.position}</span>
            <span className="text-accent">You</span>
            <span className="text-base font-bold tabular-nums text-ink">{heroSeat.stack}</span>
            {heroSeat.bet > 0 && <span className="tabular-nums text-accent">· bet {heroSeat.bet}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function OppSeat({
  seat,
  archetype,
  isButton,
  mode,
  handOver,
  read,
}: {
  seat: SessionState['state']['seats'][number]
  archetype: string
  isButton: boolean
  mode: VisibilityMode
  handOver: boolean
  read?: Reads[string]
}) {
  const showCards = handOver && !!seat.hole_cards
  const cards = showCards ? seat.hole_cards : null
  const faceDown = !cards && !seat.folded
  const label = seatLabel(false, mode, archetype, read)

  return (
    <div
      className={`relative flex w-[72px] flex-col items-center gap-0.5 rounded-lg bg-bg2 px-1.5 py-1.5 shadow-md ${
        seat.is_actor ? 'ring-2 ring-accent' : 'ring-1 ring-line'
      } ${seat.folded ? 'opacity-45' : ''}`}
    >
      {isButton && (
        <div className="absolute -right-1 -top-1 z-10 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-ink ring-1 ring-bg">
          D
        </div>
      )}
      <div className="flex h-9 items-end justify-center gap-0.5">
        {cards ? (
          cards.map((c, i) => <Card key={i} card={c} width={24} />)
        ) : faceDown ? (
          <>
            <Card faceDown width={24} />
            <Card faceDown width={24} />
          </>
        ) : (
          <span className="text-[9px] uppercase tracking-wide text-muted/70">folded</span>
        )}
      </div>
      <div className="max-w-full truncate text-[9px] uppercase tracking-wide">
        <span className="text-muted/80">{seat.position}</span>{' '}
        <span className="text-muted">{label}</span>
      </div>
      <div className="text-sm font-bold leading-none tabular-nums text-ink">{seat.stack}</div>
      {seat.bet > 0 && <div className="text-[10px] tabular-nums text-accent">{seat.bet}</div>}
    </div>
  )
}
