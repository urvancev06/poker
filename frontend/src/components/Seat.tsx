import type { BotRead, Seat as SeatData } from '../api'
import { Card, DealtCard } from './Card'

// Single definition lives in lib/prefsContext.ts (it is persisted by prefs.tsx).
import type { VisibilityMode } from '../lib/prefsContext'
import { seatLabel } from '../lib/seatLabel'

function ChipStack({ amount }: { amount: number }) {
  if (!amount) return null
  return (
    <div className="animate-rise flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-ink shadow-sm ring-1 ring-accent/55">
      <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_4px_rgba(201,164,78,0.7)]" />
      {amount}
    </div>
  )
}

/**
 * One player's seat. The archetype label / HUD is DISPLAY-gated by `mode`
 * (STRATEGY.md "reads are earned, not given") - it never reaches the bot's
 * behaviour. HUD mode shows live VPIP/PFR/AF once the backend marks that bot's
 * sample big enough, and the observed-hand count until then.
 */
export function Seat({
  seat,
  archetype,
  isHero,
  isButton,
  mode,
  handOver,
  read,
  cardWidth = 44,
}: {
  seat: SeatData
  archetype: string
  isHero: boolean
  isButton: boolean
  mode: VisibilityMode
  handOver: boolean
  read?: BotRead
  cardWidth?: number
}) {
  const showOppCards = handOver && !!seat.hole_cards
  const cards = isHero || showOppCards ? seat.hole_cards : null
  const faceDown = !cards && !seat.folded

  const label = seatLabel(isHero, mode, archetype, read)

  return (
    <div
      className={[
        'relative flex flex-col items-center gap-1.5 rounded-lg px-3 py-2.5 transition',
        isHero ? 'w-44' : 'w-36',
        // Flat surface, defined by a hairline (no fills/shadows). Accent only for
        // the active seat and the hero.
        'bg-bg2/60 border',
        seat.is_actor ? 'border-accent' : isHero ? 'border-accent/40' : 'border-line',
        seat.folded ? 'opacity-40' : 'opacity-100',
      ].join(' ')}
    >
      {isButton && (
        <div className="absolute -right-2 -top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-ink shadow-md ring-2 ring-bg">
          D
        </div>
      )}

      <div className="flex min-h-[1.5rem] items-end justify-center gap-1">
        {cards ? (
          cards.map((c) => <DealtCard key={c} card={c} width={cardWidth} />)
        ) : faceDown ? (
          <>
            <Card faceDown width={cardWidth} />
            <Card faceDown width={cardWidth} />
          </>
        ) : (
          <span className="py-2 text-xs uppercase tracking-wider text-muted/70">folded</span>
        )}
      </div>

      {seat.hand_label && (
        <div
          className={`max-w-full text-center leading-tight ${
            isHero ? 'text-xs font-semibold text-accent' : 'truncate text-[10px] text-muted'
          }`}
        >
          {seat.hand_label}
        </div>
      )}

      <div className="flex w-full items-center justify-between text-[11px] uppercase tracking-wide">
        <span className="font-semibold text-muted">{seat.position}</span>
        {label}
      </div>
      <div className="flex w-full items-center justify-between">
        <span className="text-lg font-bold tabular-nums text-ink">{seat.stack}</span>
        {seat.all_in && !seat.folded && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-loss">all-in</span>
        )}
      </div>
      {seat.bet > 0 && (
        <div className="absolute -bottom-3.5">
          <ChipStack amount={seat.bet} />
        </div>
      )}
    </div>
  )
}
