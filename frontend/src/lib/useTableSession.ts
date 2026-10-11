// The table session: every piece of game state and every effect the table needs, moved
// out of App.tsx so the session keeps running while another view is open (bots keep
// stepping, the coach keeps fetching in Coach mode; inventory 5.1).
//
// Behaviour is the same as the pre-Stage App.tsx, with two changes:
//   - errors are typed (ApiError) and scoped to where they happened (boot, newGame,
//     action, advance, nextHand, coach) instead of one shared string (B4); each can be
//     dismissed or retried. A failed bot step and a failed Next hand are now reported
//     (they used to be swallowed / unhandled: B10, B11).
//   - coach mode is a persisted preference (B21) with three values: on (auto on every
//     hero turn), think (fetched in the background, shown when you ask), off (on demand).
//
// Known bugs deliberately left for the table builder (behaviour unchanged here): B14 / B25
// (no staleness guard or cancel on coach requests), B23 (the decision clock is not
// restarted after a rejected action), B11's busy guard on Next hand, B17 (the 650 ms
// pacing has no skip after the hero folds), and a 409 on retry only refetches the state.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ActionType, type Coaching, type Reads, type SessionState } from '../api'
import { toApiError, type ApiError } from './apiError'
import { deriveCoachStatus, type CoachStatus } from './coachStatus'
import { usePrefs } from './prefsContext'
import type { CoachMode } from './prefsSchema'

/** Pause between bot actions while a hand unfolds (ms). */
export const STEP_MS = 650

export type SessionErrorScope = 'boot' | 'newGame' | 'action' | 'advance' | 'nextHand' | 'coach'
export type SessionErrors = Partial<Record<SessionErrorScope, ApiError>>

export interface TableSession {
  /** The latest snapshot from the backend; null until the first deal. */
  session: SessionState | null
  /** HUD reads keyed by player ("1".."5"); refreshed after each hand and hero action. */
  reads: Reads | undefined
  /** No session yet and no boot error: "Dealing you in". */
  booting: boolean
  /** A hero action is in flight: disable every control. */
  busy: boolean
  /** session.hero_to_act, false without a session. */
  heroTurn: boolean
  /** Identity of the current hero decision ("<session>:<hand>:<history length>"), or null
   * when it is not the hero's turn. Changes exactly when a new decision starts. */
  decisionKey: string | null

  /** The coach mode preference (persisted). Switching to off clears what it showed. */
  coachMode: CoachMode
  setCoachMode: (mode: CoachMode) => void
  /** The coach's answer for this decision, when there is one. */
  coaching: Coaching | null
  /** What the coach area should show (lib/coachStatus.ts). */
  coachStatus: CoachStatus
  /** Ask (mode off), or reveal (think-first) the coach for this decision. */
  askCoach: () => void
  /** Hide the coach again (modes off / think). */
  hideCoach: () => void

  /** Errors by where they happened. */
  errors: SessionErrors
  dismissError: (scope: SessionErrorScope) => void
  /** Try the failed thing again: boot/newGame start a game, advance resumes the bots,
   * nextHand deals, coach asks again, action resubmits (a 409 refetches the state). */
  retry: (scope: SessionErrorScope) => void

  /** Submit the hero's action. Raise and bet amounts are street totals (integers). */
  act: (type: ActionType, toAmount?: number) => Promise<void>
  /** Deal the next hand (when hand_over). */
  nextHand: () => Promise<void>
  /** Start a fresh session: stacks back to 200, hand 0, HUD reads reset. */
  newGame: () => Promise<void>
}

function decisionKeyOf(s: SessionState | null): string | null {
  return s?.hero_to_act ? `${s.session_id}:${s.hand_index}:${s.state.history.length}` : null
}

export function useTableSession(): TableSession {
  const { coachMode, setCoachMode: savePrefMode } = usePrefs()
  const [session, setSession] = useState<SessionState | null>(null)
  const [reads, setReads] = useState<Reads>()
  const [coaching, setCoaching] = useState<Coaching | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<SessionErrors>({})
  // The decision the player asked the coach about (modes off / think).
  const [askedFor, setAskedFor] = useState<string | null>(null)
  // Bumped to re-run the bot step after a failed /advance.
  const [stepNonce, setStepNonce] = useState(0)
  const lastAction = useRef<{ type: ActionType; toAmount?: number } | null>(null)

  const setError = useCallback((scope: SessionErrorScope, e: unknown) => {
    setErrors((prev) => ({ ...prev, [scope]: toApiError(e) }))
  }, [])
  const dismissError = useCallback((scope: SessionErrorScope) => {
    setErrors((prev) => {
      if (!prev[scope]) return prev
      const next = { ...prev }
      delete next[scope]
      return next
    })
  }, [])

  const refreshReads = useCallback((s: SessionState) => {
    api.reads(s.session_id).then(setReads).catch(() => {})
  }, [])

  // Step mode: bots don't pre-act, so the whole hand can be watched. The result is
  // applied in callbacks, so the mount effect stays free of synchronous state updates.
  const startSession = useCallback(
    (scope: 'boot' | 'newGame') =>
      api
        .createSession({ auto_advance: false })
        .then((s) => {
          setSession(s)
          refreshReads(s)
        })
        .catch((e: unknown) => setError(scope, e)),
    [refreshReads, setError],
  )

  // New game clears what the last session left on screen.
  const newGame = useCallback(async () => {
    setErrors({})
    setCoaching(null)
    await startSession('newGame')
  }, [startSession])

  useEffect(() => {
    void startSession('boot')
  }, [startSession])

  // While a bot is to act, step one action after a short pause. The effect re-runs on
  // each new state, which paces out the whole street.
  useEffect(() => {
    if (!session || session.hand_over || session.hero_to_act) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const s = await api.advance(session.session_id)
        if (!cancelled) {
          setSession(s)
          if (s.hand_over) refreshReads(s)
        }
      } catch (e) {
        // stepping stops here until retry('advance')
        if (!cancelled) setError('advance', e)
      }
    }, STEP_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [session, refreshReads, setError, stepNonce])

  const fetchCoach = useCallback(
    async (id: string) => {
      setCoachLoading(true)
      try {
        const c = await api.coach(id)
        setCoaching(c)
        dismissError('coach')
      } catch (e) {
        setError('coach', e)
      } finally {
        setCoachLoading(false)
      }
    },
    [dismissError, setError],
  )

  // Coach modes on and think: ask about every hero turn as it arrives. The loading flag
  // has to be raised on the frame the turn arrives, so this sets state from the effect.
  useEffect(() => {
    if (coachMode === 'off' || !session || !session.hero_to_act) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCoach(session.session_id)
  }, [coachMode, session, fetchCoach])

  // Decision clock: starts when the hero becomes the actor, read when they act. Wall
  // clock on purpose (it includes thinking and interruptions); only ever a median.
  const decisionStart = useRef<number | null>(null)
  useEffect(() => {
    if (session?.hero_to_act) {
      if (decisionStart.current === null) decisionStart.current = performance.now()
    } else {
      decisionStart.current = null
    }
  }, [session?.hero_to_act, session?.hand_index])

  const act = useCallback(
    async (type: ActionType, toAmount?: number) => {
      if (!session) return
      lastAction.current = { type, toAmount }
      setBusy(true)
      setCoaching(null)
      try {
        const started = decisionStart.current
        const elapsedMs = started === null ? undefined : Math.round(performance.now() - started)
        decisionStart.current = null
        const s = await api.submitAction(session.session_id, type, toAmount, elapsedMs)
        setSession(s)
        refreshReads(s)
        dismissError('action')
      } catch (e) {
        setError('action', e)
      } finally {
        setBusy(false)
      }
    },
    [session, refreshReads, dismissError, setError],
  )

  const nextHand = useCallback(async () => {
    if (!session) return
    setCoaching(null)
    try {
      const s = await api.nextHand(session.session_id)
      setSession(s)
      refreshReads(s)
      dismissError('nextHand')
    } catch (e) {
      setError('nextHand', e)
    }
  }, [session, refreshReads, dismissError, setError])

  const decisionKey = decisionKeyOf(session)
  const heroTurn = !!session?.hero_to_act

  const askCoach = useCallback(() => {
    if (!session || !decisionKey) return
    setAskedFor(decisionKey)
    // think-first already has (or is fetching) the answer; off asks now
    if (coachMode === 'off' || (!coaching && !coachLoading)) void fetchCoach(session.session_id)
  }, [session, decisionKey, coachMode, coaching, coachLoading, fetchCoach])

  const hideCoach = useCallback(() => {
    setAskedFor(null)
    if (coachMode === 'off') setCoaching(null)
  }, [coachMode])

  const setCoachMode = useCallback(
    (mode: CoachMode) => {
      if (mode === 'off') setCoaching(null)
      setAskedFor(null)
      savePrefMode(mode)
    },
    [savePrefMode],
  )

  const actionError = errors.action
  const resubmit = useCallback(() => {
    dismissError('action')
    if (actionError?.code === 'conflict' && session) {
      api.getState(session.session_id).then(setSession, (e: unknown) => setError('action', e))
      return
    }
    if (lastAction.current) void act(lastAction.current.type, lastAction.current.toAmount)
  }, [actionError, session, act, dismissError, setError])

  const retry = useCallback(
    (scope: SessionErrorScope) => {
      switch (scope) {
        case 'boot':
        case 'newGame':
          void newGame()
          return
        case 'advance':
          dismissError('advance')
          setStepNonce((n) => n + 1)
          return
        case 'nextHand':
          dismissError('nextHand')
          void nextHand()
          return
        case 'coach':
          dismissError('coach')
          if (session) void fetchCoach(session.session_id)
          return
        case 'action':
          resubmit()
          return
      }
    },
    [newGame, nextHand, dismissError, fetchCoach, session, resubmit],
  )

  const coachStatus = deriveCoachStatus({
    heroToAct: heroTurn,
    mode: coachMode,
    asked: askedFor !== null && askedFor === decisionKey,
    loading: coachLoading,
    hasCoaching: !!coaching,
    hasError: !!errors.coach,
  })

  return {
    session,
    reads,
    booting: !session && !errors.boot,
    busy,
    heroTurn,
    decisionKey,
    coachMode,
    setCoachMode,
    coaching: coachStatus === 'ready' ? coaching : null,
    coachStatus,
    askCoach,
    hideCoach,
    errors,
    dismissError,
    retry,
    act,
    nextHand,
    newGame,
  }
}
