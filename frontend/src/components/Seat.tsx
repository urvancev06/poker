import type { BotRead, Seat as SeatData } from '../api'
import { Card } from './Card'

export type VisibilityMode = 'labeled' | 'hud' | 'live'

const ARCH_LABEL: Record<string, string> = {
  Nit: 'Nit',
  TAG: 'TAG',
  LAG: 'LAG',
  'Calling Station': 'Station',
  Maniac: 'Maniac',
}

function ChipStack({ amount }: { amount: number }) {
  if (!amount) return null
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-xs tabular-nums text-ink ring-1 ring-accent/40">
      <span className="inline-block h-2 w-2 rounded-full bg-accent" />
      {amount}
    </div>
  )
}

/**
 * One player's seat. The archetype label / HUD is DISPLAY-gated by `mode`
 * (STRATEGY.md "reads are earned") — never the bot's behaviour. Per-bot stats
 * for HUD mode arrive in Phase 6; until then HUD shows a "read forming" hint.
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

  let label: React.ReactNode = null
  if (isHero) {
    label = <span className="text-accent">You</span>
  } else if (mode === 'labeled') {
    label = <span className="text-muted">{ARCH_LABEL[archetype] ?? archetype}</span>
  } else if (mode === 'hud') {
    label =
      read?.ready && read.stats ? (
        <span className="tabular-nums text-muted">
          {read.stats.vpip}/{read.stats.pfr}
          {read.stats.af != null && <span className="text-muted/70"> · AF {read.stats.af}</span>}
        </span>
      ) : (
        <span className="italic text-muted/60">read {read?.hands ?? 0}/{read?.min_hands ?? 30}</span>
      )
  }

  return (
    <div
      className={[
        'relative flex w-36 flex-col items-center gap-1 rounded-xl px-3 py-2 transition',
        'bg-bg2/90 ring-1',
        seat.is_actor ? 'ring-accent shadow-[0_0_0_2px_rgba(201,164,78,0.35)]' : 'ring-line',
        seat.folded ? 'opacity-40' : 'opacity-100',
      ].join(' ')}
    >
      {isButton && (
        <div className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-ink ring-2 ring-bg">
          D
        </div>
      )}

      <div className="flex h-12 items-end gap-1">
        {cards ? (
          cards.map((c, i) => <Card key={i} card={c} width={cardWidth} />)
        ) : faceDown ? (
          <>
            <Card faceDown width={cardWidth} />
            <Card faceDown width={cardWidth} />
          </>
        ) : (
          <span className="text-xs text-muted">folded</span>
        )}
      </div>

      <div className="flex w-full items-center justify-between text-[11px] uppercase tracking-wide">
        <span className="text-muted/80">{seat.position}</span>
        {label}
      </div>
      <div className="flex w-full items-center justify-between">
        <span className="text-base font-bold tabular-nums text-ink">{seat.stack}</span>
        {seat.all_in && !seat.folded && (
          <span className="text-[10px] uppercase tracking-wider text-loss">all-in</span>
        )}
      </div>
      {seat.bet > 0 && (
        <div className="absolute -bottom-3">
          <ChipStack amount={seat.bet} />
        </div>
      )}
    </div>
  )
}
