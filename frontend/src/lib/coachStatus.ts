// What the coach area shows, derived during render from the session hook's raw state.

import type { CoachMode } from './prefsSchema'

/**
 * off      the hero's turn, the coach is not shown yet: offer "Ask the coach"
 *          (mode off, or think-first before you ask)
 * idle     not the hero's turn: nothing to show
 * loading  asked (or auto) and waiting for the answer
 * ready    coaching is on screen
 * error    the request failed (scoped to the coach, with retry and dismiss)
 */
export type CoachStatus = 'off' | 'idle' | 'loading' | 'ready' | 'error'

export interface CoachStatusInput {
  heroToAct: boolean
  mode: CoachMode
  /** The player asked for it this decision (Ask the coach / Show the coach). */
  asked: boolean
  loading: boolean
  hasCoaching: boolean
  hasError: boolean
}

export function deriveCoachStatus({ heroToAct, mode, asked, loading, hasCoaching, hasError }: CoachStatusInput): CoachStatus {
  if (!heroToAct) return 'idle'
  const shown = mode === 'on' || asked
  if (!shown) return 'off'
  if (hasError) return 'error'
  if (hasCoaching) return 'ready'
  if (loading) return 'loading'
  return 'off'
}
