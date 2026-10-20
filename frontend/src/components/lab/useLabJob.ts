// A Lab simulation as a background job (B33), for React: the state is the lib/labJob.ts
// reducer and the requests are the lib/labJobController.ts loop (POST, a poll every
// 400 ms, DELETE to cancel). The table keeps playing meanwhile: the server runs the hands
// in other processes.
//
// - The run starts from the click (run), never from an effect.
// - One controller per mount (lazy useState). The one effect only pauses and resumes it:
//   a hidden view (App and LabView keep views mounted under <Activity>) runs its effects'
//   cleanup, which stops the polling; coming back into sight polls the job in flight again,
//   so no result is lost and a hidden or unmounted view never polls.
// - While a job runs, leaving the page cancels it (a keepalive DELETE on 'pagehide').

import { useEffect, useReducer, useState } from 'react'
import { api, type LabJobBody, type LabResult } from '../../api'
import type { ApiError } from '../../lib/apiError'
import { canCancel, initialLabJob, reduce } from '../../lib/labJob'
import { createLabJobController, type LabJobTransport } from '../../lib/labJobController'

export interface LabJobRun<C> {
  result: LabResult | null
  resultFor: C | null
  running: C | null
  startedAt: number | null
  progress: { done: number; total: number } | null
  cancelling: boolean
  /** Cancel would do something now (see lib/labJob canCancel). */
  canCancel: boolean
  /** How far the last run got, when it was cancelled. */
  cancelled: { done: number; total: number } | null
  error: ApiError | null
  run: (config: C) => void
  cancel: () => void
  dismissError: () => void
}

const transport: LabJobTransport = {
  create: (body) => api.labJobCreate(body),
  get: (id) => api.labJobGet(id),
  cancel: (id, opts) => api.labJobCancel(id, opts?.keepalive ? { keepalive: true } : undefined),
}

/** `toBody` must be stable (a module-level function). */
export function useLabJob<C>(toBody: (c: C) => LabJobBody): LabJobRun<C> {
  const [s, dispatch] = useReducer(reduce<C>, undefined, initialLabJob<C>)
  const [ctl] = useState(() => createLabJobController<C>(transport, dispatch, { page: typeof window === 'undefined' ? null : window }))

  // Hidden or unmounted: stop polling. Back in sight: pick the job in flight up again.
  useEffect(() => {
    ctl.resume()
    return () => ctl.pause()
  }, [ctl])

  return {
    result: s.result,
    resultFor: s.resultFor,
    running: s.running,
    startedAt: s.startedAt,
    progress: s.progress,
    cancelling: s.cancelling,
    canCancel: canCancel(s),
    cancelled: s.cancelled,
    error: s.error,
    run: (config: C) => ctl.run(config, toBody(config)),
    cancel: ctl.cancel,
    dismissError: () => dispatch({ type: 'dismissError' }),
  }
}
