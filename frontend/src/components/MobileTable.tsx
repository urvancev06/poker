import type { Reads, SessionState } from '../api'
import { Board } from './Board'
import { Card, DealtCard } from './Card'
import { seatLabel } from '../lib/seatLabel'
import type { VisibilityMode } from '../lib/prefsContext'

type SeatData = SessionState['state']['seats'][number]

// Portrait layout for phones: opponents in one row across the top, the board in
// the middle, your hand pinned at the bottom with the action buttons directly
// beneath (rendered in App). Large screens use the oval Table instead.
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
  const opponents = Array.from({ length: n - 1 }, (_, i) => i + 1)
  const hero = state.seats[session.hero_seat]

  return (
    <div className="felt flex h-full w-full flex-col justify-between gap-3 rounded-2xl p-3 ring-1 ring-black/30">
      {/* opponents, evenly spaced */}
      <div className="flex items-start justify-between gap-1">
        {opponents.map((player) => {
          const sd = state.seats[playerToSeat[player]]
          if (!sd) return null
          return (
            <Opp
              key={player}
              seat={sd}
              archetype={session.archetypes[player]}
              isButton={player === session.button_player}
              mode={mode}
              read={reads?.[String(player)]}
            />
          )
        })}
      </div>

      {/* board + pot */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Board board={state.board} pot={state.pot} cardWidth={48} />
      </div>

      {/* hero hand, pinned at the bottom */}
      {hero && (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-end gap-2">
            {hero.hole_cards ? (
              hero.hole_cards.map((c) => <DealtCard key={c} card={c} width={60} />)
            ) : (
              <>
                <Card faceDown width={60} />
                <Card faceDown width={60} />
              </>
            )}
          </div>
          {hero.hand_label && (
            <div className="text-xs font-semibold text-accent">{hero.hand_label}</div>
          )}
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
            {session.button_player === 0 && (
              <span className="grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-ink">
                D
              </span>
            )}
            <span className="font-semibold text-muted">{hero.position}</span>
            <span className="text-accent">You</span>
            <span className="text-base font-bold tabular-nums text-ink">{hero.stack}</span>
            {hero.bet > 0 && <span className="tabular-nums text-accent">· bet {hero.bet}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function Opp({
  seat,
  archetype,
  isButton,
  mode,
  read,
}: {
  seat: SeatData
  archetype: string
  isButton: boolean
  mode: VisibilityMode
  read?: Reads[string]
}) {
  const label = seatLabel(false, mode, archetype, read)
  return (
    <div className={`relative flex min-w-0 flex-1 flex-col items-center ${seat.folded ? 'opacity-40' : ''}`}>
      <div
        className={`flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition ${
          seat.is_actor ? 'bg-black/25 ring-1 ring-accent' : ''
        }`}
      >
        {isButton && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-ink ring-2 ring-bg">
            D
          </span>
        )}
        <span className="text-sm font-bold leading-none tabular-nums text-ink">{seat.stack}</span>
        <span className="max-w-full truncate text-[9px] uppercase leading-tight text-muted/90">
          {seat.position}
        </span>
        <span className="max-w-full truncate text-[9px] uppercase leading-tight text-muted">{label}</span>
        {seat.bet > 0 && (
          <span className="mt-0.5 rounded-full bg-black/55 px-1.5 text-[9px] tabular-nums text-accent ring-1 ring-accent/40">
            {seat.bet}
          </span>
        )}
        {/* revealed at showdown */}
        {seat.hole_cards && (
          <div className="mt-1 flex flex-col items-center gap-0.5">
            <div className="flex gap-0.5">
              {seat.hole_cards.map((c, i) => (
                <Card key={i} card={c} width={18} />
              ))}
            </div>
            {seat.hand_label && (
              <span className="max-w-full truncate text-[8px] leading-tight text-muted">{seat.hand_label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
