/**
 * SeatSample: one opponent as the table shows it in a visibility mode, in the table's own
 * floating type (name and stack; the HUD read; the position and the action). The seat is
 * the Maniac in the small blind with a real read after 40 hands (samples/reads.json), run
 * through the same identityOf() the table uses, so the sample cannot drift from the seat.
 * Decorative: the row it sits in already says what the mode does.
 */
import type { BotRead } from '../../api'
import { chips } from '../../lib/format'
import type { VisibilityMode } from '../../lib/prefsSchema'
import { identityOf } from '../../lib/tableModel'

const SEAT = { player: 5, position: 'SB', archetype: 'Maniac' } as const
const READ: BotRead = { hands: 40, min_hands: 30, ready: true, stats: { vpip: 60, pfr: 37.5, threebet: 25, af: 1.8, wtsd: 73.7 } }
const STACK = 1168
const ACTION = '3-bet 15'

export function SeatSample({ mode }: { mode: VisibilityMode }) {
  const id = identityOf(SEAT, mode, READ)
  return (
    <span className="seat-sample">
      <span className="flex items-baseline gap-2">
        <span className="text-[17px] font-strong tracking-[-0.02em] text-ink">{id.name}</span>
        <span className="text-callout font-medium text-fog tabular-nums">{chips(STACK)}</span>
      </span>
      {id.hud ? (
        <span className="flex gap-2 text-foot font-semibold text-fog tabular-nums">
          {id.hud.map((h, i) => (
            <span key={h} className={i > 0 ? 'text-dust' : undefined}>
              {h}
            </span>
          ))}
        </span>
      ) : null}
      {/* no tabular figures here: Inter's tabular set widens the hyphen in "3-bet" */}
      <span className="flex gap-1.5 text-foot font-medium text-fog">
        {id.pos ? <span className="font-semibold text-dust-sheet">{id.pos}</span> : null}
        <span>{ACTION}</span>
      </span>
    </span>
  )
}
