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

/** The coach's raw state for the decision on screen, as the session hook holds it. */
export interface CoachSlotInput {
  /** The decision on screen; null when it is not the hero's turn. */
  decisionKey: string | null
  mode: CoachMode
  /** The decision the player asked about (Ask the coach / Show the coach). */
  askedFor: string | null
  /** The decision the answer held is for. */
  answerFor: string | null
  /** The decision the last error is for, and whether the player dismissed it. */
  error: { key: string; dismissed: boolean } | null
}

export interface CoachSlot {
  status: CoachStatus
  /** The answer held is for this decision. */
  answered: boolean
  /** An error for this decision is on screen (not dismissed). */
  showError: boolean
  /** A request for this decision came back (an answer, or an error even if dismissed):
   * nothing is on its way, so asking again has to send a request. */
  settled: boolean
}

/**
 * What the coach area shows for this decision. An automatic answer (modes on / think) is
 * "loading" from the first frame of the turn until it lands; a dismissed error is settled,
 * so it offers the coach again ("off") rather than a spinner nothing is behind (F2).
 */
export function coachSlot({ decisionKey, mode, askedFor, answerFor, error }: CoachSlotInput): CoachSlot {
  const answered = !!decisionKey && answerFor === decisionKey
  const failed = !!decisionKey && error?.key === decisionKey
  const showError = failed && !error?.dismissed
  const asked = askedFor !== null && askedFor === decisionKey
  const requested = !!decisionKey && (mode !== 'off' || asked)
  const status = deriveCoachStatus({
    heroToAct: !!decisionKey,
    mode,
    asked,
    loading: requested && !answered && !failed,
    hasCoaching: answered,
    hasError: showError,
  })
  return { status, answered, showError, settled: answered || failed }
}
