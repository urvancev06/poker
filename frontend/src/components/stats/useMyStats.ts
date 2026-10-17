// Loads GET /stats/me for the chosen window.
//
// - Figures are only ever shown for the window they were fetched for: switching windows
//   drops them at once (derived during render, not in an effect), so an old window's
//   numbers never sit under a new label.
// - The view stays mounted while hidden (<Activity>), and its effects re-run when it is
//   shown again: the same window refetches and its figures update in place, without a
//   loading flash. A failed refresh keeps the figures it had and reports the error.
// - Errors are scoped to this view and retryable. A retry keeps the notice up, busy,
//   until the answer lands.

import { useCallback, useEffect, useState } from 'react'
import { api, type MyStats } from '../../api'
import { toApiError, type ApiError } from '../../lib/apiError'
import { windowLast, type WindowId } from '../../lib/stats'

interface Settled {
  win: WindowId
  attempt: number
  data: MyStats | null
  error: ApiError | null
}

export interface MyStatsLoad {
  /** The chosen window's report, or null until it arrives. */
  data: MyStats | null
  /** The chosen window's latest failure. */
  error: ApiError | null
  /** Nothing has settled yet for the chosen window (or for the retry in flight). A silent
   *  refresh on re-show does not count: its figures stay up until the new ones land. */
  loading: boolean
  /** The target bands from any report (they do not depend on the window), for the loading layout. */
  targets: MyStats['targets'] | null
  retry: () => void
}

export function useMyStats(win: WindowId): MyStatsLoad {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    let live = true
    api.myStats(undefined, windowLast(win) ?? undefined).then(
      (data) => {
        if (live) setSettled({ win, attempt, data, error: null })
      },
      (e: unknown) => {
        if (!live) return
        const error = toApiError(e)
        setSettled((prev) => ({ win, attempt, data: prev?.win === win ? prev.data : null, error }))
      },
    )
    return () => {
      live = false
    }
  }, [win, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  const mine = settled?.win === win ? settled : null
  return {
    data: mine?.data ?? null,
    error: mine?.error ?? null,
    loading: !mine || mine.attempt !== attempt,
    targets: settled?.data?.targets ?? null,
    retry,
  }
}
