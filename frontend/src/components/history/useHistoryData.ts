// History's data: the hand list, the leak report and one hand's replay.
//
// - Each answer is shown only for the query it was fetched for: switching scope, window or
//   hand drops the old figures at once (derived during render, not in an effect), so an old
//   window's counts never sit under a new label (B19).
// - The view stays mounted while hidden (<Activity>) and its effects re-run when it is shown
//   again: the same query refetches and updates in place, without a loading flash. A failed
//   refresh keeps what was on screen and reports the error.
// - The leak report's first pass can take a minute. Its request is shared (one per query,
//   module-wide), so hiding the view and coming back joins the request already running
//   instead of starting a second one, and the elapsed time carries on.
// - Replays are cached by hand id (a stored hand never changes). Fast clicks cannot race:
//   every answer lands in the cache under its own id, and only the selected id is shown.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api, type HandRecord, type HandReview, type HandSummary, type LeakSummary } from '../../api'
import { toApiError, type ApiError } from '../../lib/apiError'
import { LIST_LIMIT, queryKey, type Scope } from '../../lib/historyList'

/* ---------- the hand list ---------- */

interface ListSettled {
  key: string
  attempt: number
  hands: HandSummary[] | null
  error: ApiError | null
}

export interface HandListLoad {
  /** Newest first, up to LIST_LIMIT; null until it arrives (or with no session to show). */
  hands: HandSummary[] | null
  error: ApiError | null
  /** Nothing has settled yet for this scope (or for the retry in flight). */
  loading: boolean
  /** "This session" with no game on the table. */
  noSession: boolean
  retry: () => void
}

export function useHandList(scope: Scope, sessionId: string | undefined): HandListLoad {
  const noSession = scope === 'session' && !sessionId
  const id = scope === 'session' ? sessionId : undefined
  const key = scope === 'session' ? `session:${sessionId ?? ''}` : 'all'
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<ListSettled | null>(null)

  useEffect(() => {
    if (noSession) return
    let live = true
    api.listHands(id, LIST_LIMIT).then(
      (hands) => {
        if (live) setSettled({ key, attempt, hands, error: null })
      },
      (e: unknown) => {
        if (live) setSettled((prev) => ({ key, attempt, hands: prev?.key === key ? prev.hands : null, error: toApiError(e) }))
      },
    )
    return () => {
      live = false
    }
  }, [key, id, attempt, noSession])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  const mine = !noSession && settled?.key === key ? settled : null
  return {
    hands: mine?.hands ?? null,
    error: mine?.error ?? null,
    loading: !noSession && (!mine || mine.attempt !== attempt),
    noSession,
    retry,
  }
}

/* ---------- the leak report: one shared request per query ---------- */

interface Pending {
  promise: Promise<LeakSummary>
  startedAt: number
}

const pending = new Map<string, Pending>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function leakRequest(key: string, sessionId: string | undefined, window: number): Pending {
  const running = pending.get(key)
  if (running) return running
  const promise = api.leaks(sessionId, window)
  const p = { promise, startedAt: Date.now() }
  pending.set(key, p)
  const done = () => {
    if (pending.get(key) === p) {
      pending.delete(key)
      emit()
    }
  }
  promise.then(done, done)
  emit()
  return p
}

interface LeakSettled {
  key: string
  attempt: number
  report: LeakSummary | null
  error: ApiError | null
}

export interface LeakReportLoad {
  report: LeakSummary | null
  error: ApiError | null
  loading: boolean
  /** When the request now running started (ms since the epoch), or null. */
  startedAt: number | null
  retry: () => void
}

export function useLeakReport(scope: Scope, sessionId: string | undefined, window: number, enabled: boolean): LeakReportLoad {
  const id = scope === 'session' ? sessionId : undefined
  const key = queryKey(scope, sessionId, window)
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<LeakSettled | null>(null)
  const running = useSyncExternalStore(subscribe, () => pending.get(key) ?? null)

  useEffect(() => {
    if (!enabled) return
    let live = true
    leakRequest(key, id, window).promise.then(
      (report) => {
        if (live) setSettled({ key, attempt, report, error: null })
      },
      (e: unknown) => {
        if (live) setSettled((prev) => ({ key, attempt, report: prev?.key === key ? prev.report : null, error: toApiError(e) }))
      },
    )
    return () => {
      live = false
    }
  }, [key, id, window, attempt, enabled])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  const mine = enabled && settled?.key === key ? settled : null
  return {
    report: mine?.report ?? null,
    error: mine?.error ?? null,
    loading: enabled && (!mine || mine.attempt !== attempt),
    startedAt: running?.startedAt ?? null,
    retry,
  }
}

/* ---------- one hand's replay ---------- */

const reviewRequests = new Map<number, Promise<HandReview>>()
const detailRequests = new Map<number, Promise<HandRecord>>()

function once<T>(map: Map<number, Promise<T>>, id: number, start: () => Promise<T>): Promise<T> {
  const running = map.get(id)
  if (running) return running
  const p = start()
  map.set(id, p)
  const done = () => {
    if (map.get(id) === p) map.delete(id)
  }
  p.then(done, done)
  return p
}

interface ReplayStore {
  reviews: ReadonlyMap<number, HandReview>
  details: ReadonlyMap<number, HandRecord>
  /** The last failure, for the request that made it (hand, pick and retry). */
  error: { id: number; pick: number; attempt: number; error: ApiError } | null
}

export interface ReplayLoad {
  review: HandReview | null
  /** GET /hands/{id}: showdown cards, stacks, names. Null until (or unless) it loads. */
  detail: HandRecord | null
  error: ApiError | null
  loading: boolean
  retry: () => void
}

/** The hand picked, and a counter that moves on every pick (picking a hand again after it
 *  failed asks again). */
export interface Pick {
  id: number
  n: number
}

const EMPTY_STORE: ReplayStore = { reviews: new Map(), details: new Map(), error: null }

export function useReplay(pick: Pick | null): ReplayLoad {
  const [attempt, setAttempt] = useState(0)
  const [store, setStore] = useState<ReplayStore>(EMPTY_STORE)
  const id = pick?.id ?? null
  const n = pick?.n ?? 0
  const have = id != null && store.reviews.has(id)
  const haveDetail = id != null && store.details.has(id)

  useEffect(() => {
    if (id == null || have) return
    once(reviewRequests, id, () => api.handReview(id)).then(
      (review) => setStore((s) => ({ ...s, reviews: new Map(s.reviews).set(id, review) })),
      (e: unknown) => setStore((s) => ({ ...s, error: { id, pick: n, attempt, error: toApiError(e) } })),
    )
  }, [id, n, attempt, have])

  // The stored hand is a quick read. Without it the replay only loses the showdown hands
  // and the all-in marks, so a failure is not shown; the next pick or retry asks again.
  useEffect(() => {
    if (id == null || haveDetail) return
    once(detailRequests, id, () => api.handDetail(id)).then(
      (detail) => setStore((s) => (s.details.has(id) ? s : { ...s, details: new Map(s.details).set(id, detail) })),
      () => {},
    )
  }, [id, n, attempt, haveDetail])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  if (id == null) return { review: null, detail: null, error: null, loading: false, retry }
  const review = store.reviews.get(id) ?? null
  const e = store.error
  const err = !review && e && e.id === id && e.pick === n && e.attempt === attempt ? e.error : null
  return { review, detail: store.details.get(id) ?? null, error: err, loading: !review && !err, retry }
}
