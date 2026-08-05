// The mode-gated seat label, shared by the desktop and mobile tables. It lives
// outside Seat.tsx so that file exports only its component (Fast Refresh needs
// component-only modules).

import type { BotRead } from '../api'
import type { VisibilityMode } from './prefsContext'

const ARCH_LABEL: Record<string, string> = {
  Nit: 'Nit',
  TAG: 'TAG',
  LAG: 'LAG',
  'Calling Station': 'Station',
  Maniac: 'Maniac',
}

/** The mode-gated seat label (archetype / HUD stats / nothing), shared by the
 * desktop and mobile tables. Display only — never affects bot behaviour. */
export function seatLabel(
  isHero: boolean,
  mode: VisibilityMode,
  archetype: string,
  read?: BotRead,
): React.ReactNode {
  if (isHero) return <span className="text-accent">You</span>
  if (mode === 'labeled') return <span className="text-muted">{ARCH_LABEL[archetype] ?? archetype}</span>
  if (mode === 'hud') {
    return read?.ready && read.stats ? (
      <span className="tabular-nums text-muted">
        {read.stats.vpip ?? '—'}/{read.stats.pfr ?? '—'}
        {read.stats.af != null && <span className="text-muted/70"> · AF {read.stats.af}</span>}
      </span>
    ) : (
      <span className="italic text-muted/60">
        read {read?.hands ?? 0}/{read?.min_hands ?? 30}
      </span>
    )
  }
  return null
}
