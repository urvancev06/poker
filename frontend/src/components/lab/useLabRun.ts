// One synchronous lab request at a time (a simulation, a CFR training run), started by a
// click. The request lives outside any effect, so hiding the view or switching tools never
// drops its answer.
//
// - The last result stays on screen while a new run is in flight; `resultFor` is the setup
//   that produced it, so the view can say when the controls no longer match it.
// - A second click while running does nothing (the server can only do one thing at once).
// - Errors are kept until the next run or a dismiss; the last good result stays.

import { useCallback, useRef, useState } from 'react'
import { toApiError, type ApiError } from '../../lib/apiError'

export interface LabRun<C, R> {
  result: R | null
  /** The setup the result came from. */
  resultFor: C | null
  /** The setup being run now, or null when idle. */
  running: C | null
  /** Date.now() when the current run started (for the elapsed count). */
  startedAt: number | null
  error: ApiError | null
  run: (config: C) => void
  dismissError: () => void
}

interface State<C, R> {
  result: R | null
  resultFor: C | null
  running: C | null
  startedAt: number | null
  error: ApiError | null
}

/** `request` must be stable (a module-level function). */
export function useLabRun<C, R>(request: (config: C) => Promise<R>): LabRun<C, R> {
  const [s, setS] = useState<State<C, R>>({ result: null, resultFor: null, running: null, startedAt: null, error: null })
  const inFlight = useRef(false)

  const run = useCallback((config: C) => {
    if (inFlight.current) return
    inFlight.current = true
    const startedAt = Date.now()
    setS((p) => ({ ...p, running: config, startedAt, error: null }))
    request(config).then(
      (result) => {
        inFlight.current = false
        setS({ result, resultFor: config, running: null, startedAt: null, error: null })
      },
      (e: unknown) => {
        inFlight.current = false
        setS((p) => ({ ...p, running: null, startedAt: null, error: toApiError(e) }))
      },
    )
  }, [request])

  const dismissError = useCallback(() => setS((p) => (p.error ? { ...p, error: null } : p)), [])

  return { ...s, run, dismissError }
}
