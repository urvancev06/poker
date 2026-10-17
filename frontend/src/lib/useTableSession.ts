// The table session: every piece of game state and every effect the table needs, kept
// above the views so the session keeps running while another view is open (bots keep
// stepping, the coach keeps fetching in Coach mode; inventory 5.1).
//
// Errors are typed (ApiError) and scoped to where they happened (boot, newGame, action,
// advance, nextHand, coach), each dismissible and retryable (B4). Coach mode is a
// persisted preference (B21): on (auto on every hero turn), think (fetched in the
// background, shown when you ask), off (on demand).
//
// Fixed here:
//   B10  a failed bot step stops with a scoped error and Try again resumes it
//   B11  Next hand has a busy guard and reports its errors
//   B14  a coach answer is tied to the decision it was asked for: one that arrives after
//        you acted, after Hide, or for an older decision is dropped (a ticket per request)
//   B15  the coach status is right from the first frame of a turn: "loading" while an
//        automatic answer is on its way, never a stray "Ask the coach" in Coach mode, and
//        an error belongs to its own decision only
//   B17  skipToResult(): after you fold, the bots play the hand out without the pause
//   B23  a rejected action keeps the decision clock running from when the turn began
//   B25  Hide during loading cancels the request (its answer is dropped)
//   409  Try again after a conflict (not your turn, hand not over, table moved on)
//        reloads the state instead of resubmitting

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ActionType, type Coaching, type Reads, type SessionState } from '../api'
import { toApiError, type ApiError } from './apiError'
import { deriveCoachStatus, type CoachStatus } from './coachStatus'
import { usePrefs } from './prefsContext'
import type { CoachMode } from './prefsSchema'

/** Pause between bot actions while a hand unfolds (ms). */
export const STEP_MS = 650
/** The first bot action of a hand waits for the deal to land (the deal takes about 1 s). */
export const FIRST_STEP_MS = 1000

export type SessionErrorScope = 'boot' | 'newGame' | 'action' | 'advance' | 'nextHand' | 'coach'
export type SessionErrors = Partial<Record<SessionErrorScope, ApiError>>

export interface TableSession {
  /** The latest snapshot from the backend; null until the first deal. */
  session: SessionState | null
  /** HUD reads keyed by player ("1".."5"); refreshed after each hand and hero action. */
  reads: Reads | undefined
  /** No session yet and no boot error: "Dealing you in". */
  booting: boolean
  /** A hero action or a deal is in flight: disable every control. */
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
  /** Hide the coach again (modes off / think); cancels a request in flight. */
  hideCoach: () => void

  /** Errors by where they happened. */
  errors: SessionErrors
  dismissError: (scope: SessionErrorScope) => void
  /** Try the failed thing again: boot/newGame start a game, advance resumes the bots,
   * nextHand deals, coach asks again, action resubmits; a 409 reloads the state. */
  retry: (scope: SessionErrorScope) => void

  /** Submit the hero's action. Raise and bet amounts are street totals (integers). */
  act: (type: ActionType, toAmount?: number) => Promise<void>
  /** Deal the next hand (when hand_over). Ignored while a deal is in flight. */
  nextHand: () => Promise<void>
  /** Start a fresh session: stacks back to 200, hand 0, HUD reads reset. */
  newGame: () => Promise<void>

  /** You folded and the bots are still playing: they can be fast-forwarded. */
  canSkip: boolean
  /** Fast-forwarding to the result now. */
  skipping: boolean
  /** Play the rest of this hand without the 650 ms pause between bot actions (B17). */
  skipToResult: () => void
}

function decisionKeyOf(s: SessionState | null): string | null {
  return s?.hero_to_act ? `${s.session_id}:${s.hand_index}:${s.state.history.length}` : null
}

/** This hand, while it runs (hand_index moves on at hand end, which ends a skip). */
function runningHandKey(s: SessionState | null): string | null {
  return s && !s.hand_over ? `${s.session_id}:${s.hand_index}` : null
}

export function useTableSession(): TableSession {
  const { coachMode, setCoachMode: savePrefMode } = usePrefs()
  const [session, setSession] = useState<SessionState | null>(null)
  const [reads, setReads] = useState<Reads>()
  // The coach's answer and the decision it answers; an error and the decision it was for.
  const [coach, setCoach] = useState<{ key: string; coaching: Coaching } | null>(null)
  const [coachErr, setCoachErr] = useState<{ key: string; error: ApiError } | null>(null)
  const [acting, setActing] = useState(false)
  const [dealing, setDealing] = useState(false)
  const [errors, setErrors] = useState<Omit<SessionErrors, 'coach'>>({})
  // The decision the player asked the coach about (modes off / think).
  const [askedFor, setAskedFor] = useState<string | null>(null)
  // Bumped to re-run the bot step after a failed /advance.
  const [stepNonce, setStepNonce] = useState(0)
  // The hand being fast-forwarded (B17).
  const [skipFor, setSkipFor] = useState<string | null>(null)
  const lastAction = useRef<{ type: ActionType; toAmount?: number } | null>(null)
  // Every coach request takes a ticket; only the latest ticket's answer is applied.
  const coachTicket = useRef(0)
  const dealingRef = useRef(false)

  const setError = useCallback((scope: Exclude<SessionErrorScope, 'coach'>, e: unknown) => {
    setErrors((prev) => ({ ...prev, [scope]: toApiError(e) }))
  }, [])
  const dismissScoped = useCallback((scope: Exclude<SessionErrorScope, 'coach'>) => {
    setErrors((prev) => {
      if (!prev[scope]) return prev
      const next = { ...prev }
      delete next[scope]
      return next
    })
  }, [])
  const dismissError = useCallback(
    (scope: SessionErrorScope) => {
      if (scope === 'coach') setCoachErr(null)
      else dismissScoped(scope)
    },
    [dismissScoped],
  )

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
    coachTicket.current++
    setErrors({})
    setCoach(null)
    setCoachErr(null)
    setSkipFor(null)
    await startSession('newGame')
  }, [startSession])

  useEffect(() => {
    void startSession('boot')
  }, [startSession])

  const handKey = runningHandKey(session)
  const skipping = !!handKey && skipFor === handKey
  // While a bot is to act, step one action after a short pause (none while skipping). The
  // effect re-runs on each new state, which paces out the whole street.
  useEffect(() => {
    if (!session || session.hand_over || session.hero_to_act) return
    let cancelled = false
    const t = setTimeout(
      async () => {
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
      },
      skipping ? 0 : session.state.history.length === 0 ? FIRST_STEP_MS : STEP_MS,
    )
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [session, refreshReads, setError, stepNonce, skipping])

  const decisionKey = decisionKeyOf(session)
  const heroTurn = !!session?.hero_to_act
  const sessionId = session?.session_id ?? null

  /** Ask the backend; the answer counts only if no newer request (or a cancel) came since. */
  const fetchCoach = useCallback((id: string, key: string) => {
    const ticket = ++coachTicket.current
    api.coach(id).then(
      (c) => {
        if (ticket !== coachTicket.current) return
        setCoach({ key, coaching: c })
        setCoachErr(null)
      },
      (e: unknown) => {
        if (ticket !== coachTicket.current) return
        setCoachErr({ key, error: toApiError(e) })
      },
    )
  }, [])

  // Coach modes on and think: ask about every hero turn as it arrives (primitive deps:
  // a refetched state for the same decision does not ask again).
  useEffect(() => {
    if (coachMode === 'off' || !sessionId || !decisionKey) return
    fetchCoach(sessionId, decisionKey)
  }, [coachMode, sessionId, decisionKey, fetchCoach])

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

  const answered = !!decisionKey && coach?.key === decisionKey
  const coachError = decisionKey && coachErr?.key === decisionKey ? coachErr.error : undefined

  const act = useCallback(
    async (type: ActionType, toAmount?: number) => {
      if (!session || acting) return
      lastAction.current = { type, toAmount }
      setActing(true)
      // an answer still on its way is for a spot that is about to be gone (B14)
      const pendingCoach = !answered && !coachError
      coachTicket.current++
      const started = decisionStart.current
      try {
        const elapsedMs = started === null ? undefined : Math.round(performance.now() - started)
        decisionStart.current = null
        const s = await api.submitAction(session.session_id, type, toAmount, elapsedMs)
        setSession(s)
        refreshReads(s)
        dismissScoped('action')
      } catch (e) {
        // still your decision: the clock keeps running from when the turn began (B23),
        // and the coach is asked again if it was cut off
        if (decisionStart.current === null) decisionStart.current = started ?? performance.now()
        setError('action', e)
        if (pendingCoach && decisionKey && (coachMode !== 'off' || askedFor === decisionKey)) fetchCoach(session.session_id, decisionKey)
      } finally {
        setActing(false)
      }
    },
    [session, acting, answered, coachError, decisionKey, coachMode, askedFor, refreshReads, dismissScoped, setError, fetchCoach],
  )

  const nextHand = useCallback(async () => {
    if (!session || dealingRef.current) return
    dealingRef.current = true
    setDealing(true)
    coachTicket.current++
    try {
      const s = await api.nextHand(session.session_id)
      setSession(s)
      refreshReads(s)
      dismissScoped('nextHand')
    } catch (e) {
      setError('nextHand', e)
    } finally {
      dealingRef.current = false
      setDealing(false)
    }
  }, [session, refreshReads, dismissScoped, setError])

  const askCoach = useCallback(() => {
    if (!session || !decisionKey) return
    setAskedFor(decisionKey)
    // think-first already has (or is fetching) the answer; off asks now
    const inFlight = coachMode !== 'off' && !answered && !coachError
    if (!answered && !inFlight) fetchCoach(session.session_id, decisionKey)
  }, [session, decisionKey, coachMode, answered, coachError, fetchCoach])

  const hideCoach = useCallback(() => {
    // think-first: the answer is put away again ("Show the coach")
    setAskedFor(null)
    if (coachMode === 'off') {
      // B25: cancel what is on its way and forget what was shown
      coachTicket.current++
      setCoach(null)
      setCoachErr(null)
    }
  }, [coachMode])

  const setCoachMode = useCallback(
    (mode: CoachMode) => {
      if (mode === 'off') {
        coachTicket.current++
        setCoach(null)
        setCoachErr(null)
      }
      setAskedFor(null)
      savePrefMode(mode)
    },
    [savePrefMode],
  )

  const canSkip = !!session && !session.hand_over && !!session.state.seats[session.hero_seat]?.folded
  const skipToResult = useCallback(() => {
    if (canSkip && handKey) setSkipFor(handKey)
  }, [canSkip, handKey])

  /** A 409 means the screen is behind the server: load the state rather than resubmit. */
  const reload = useCallback(
    (scope: Exclude<SessionErrorScope, 'coach'>) => {
      dismissScoped(scope)
      if (!session) return
      api.getState(session.session_id).then(setSession, (e: unknown) => setError(scope, e))
    },
    [session, dismissScoped, setError],
  )

  const retry = useCallback(
    (scope: SessionErrorScope) => {
      if (scope !== 'coach' && scope !== 'boot' && scope !== 'newGame' && errors[scope]?.code === 'conflict') {
        reload(scope)
        return
      }
      switch (scope) {
        case 'boot':
        case 'newGame':
          void newGame()
          return
        case 'advance':
          dismissScoped('advance')
          setStepNonce((n) => n + 1)
          return
        case 'nextHand':
          dismissScoped('nextHand')
          void nextHand()
          return
        case 'coach':
          setCoachErr(null)
          if (session && decisionKey) fetchCoach(session.session_id, decisionKey)
          return
        case 'action':
          dismissScoped('action')
          if (lastAction.current) void act(lastAction.current.type, lastAction.current.toAmount)
          return
      }
    },
    [errors, reload, newGame, nextHand, dismissScoped, fetchCoach, session, decisionKey, act],
  )

  // The automatic answer (modes on / think) is on its way from the first frame of a turn.
  const requested = heroTurn && (coachMode !== 'off' || askedFor === decisionKey)
  const coachStatus = deriveCoachStatus({
    heroToAct: heroTurn,
    mode: coachMode,
    asked: askedFor !== null && askedFor === decisionKey,
    loading: requested && !answered && !coachError,
    hasCoaching: answered,
    hasError: !!coachError,
  })

  const allErrors: SessionErrors = coachError ? { ...errors, coach: coachError } : errors

  return {
    session,
    reads,
    booting: !session && !errors.boot,
    busy: acting || dealing,
    heroTurn,
    decisionKey,
    coachMode,
    setCoachMode,
    coaching: coachStatus === 'ready' && coach ? coach.coaching : null,
    coachStatus,
    askCoach,
    hideCoach,
    errors: allErrors,
    dismissError,
    retry,
    act,
    nextHand,
    newGame,
    canSkip,
    skipping,
    skipToResult,
  }
}
