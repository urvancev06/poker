// A Lab simulation as a background job (B33): POST /lab/jobs, then poll GET /lab/jobs/{id}
// every 400 ms until it is done, cancelled or failed. The table keeps playing meanwhile:
// the server runs the hands in other processes.
//
// - The run starts from the click, not from an effect; the state lives in lib/labJob.ts and
//   the request loop in a small controller made once per mount.
// - A hidden view (App keeps every view mounted under <Activity>) runs its effects'
//   cleanup: that marks the controller disposed and stops the timer, and coming back into
//   sight resumes polling the job in flight, so no result is lost and a hidden view costs
//   nothing.
// - Cancel sends DELETE; if the job finished first, the next poll brings its result.
// - A 404 while polling means the server restarted and forgot the job ('lab_lost'). A few
//   network misses in a row are tolerated before the run is called failed.
// - A second Run while one is in flight does nothing.

import { useEffect, useReducer, useState, type Dispatch } from 'react'
import { api, type LabJobBody, type LabResult } from '../../api'
import { toApiError, type ApiError } from '../../lib/apiError'
import { initialLabJob, isTerminal, reduce, type LabJobEvent } from '../../lib/labJob'

export const POLL_MS = 400
/** Consecutive network failures tolerated while polling. */
const NETWORK_MISSES = 5

export interface LabJobRun<C> {
  result: LabResult | null
  resultFor: C | null
  running: C | null
  startedAt: number | null
  progress: { done: number; total: number } | null
  cancelling: boolean
  error: ApiError | null
  run: (config: C) => void
  cancel: () => void
  dismissError: () => void
}

interface Controller<C> {
  run: (config: C, body: LabJobBody) => void
  cancel: () => void
  pause: () => void
  resume: () => void
}

function createController<C>(dispatch: Dispatch<LabJobEvent<C>>): Controller<C> {
  // Every run gets a token; a late answer from an older run (or after a cancel) is dropped.
  let token = 0
  let jobId: string | null = null
  let inFlight = false
  let cancelling = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const stopTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const finish = () => {
    inFlight = false
    cancelling = false
    jobId = null
    stopTimer()
  }
  const poll = (id: string, t: number, misses: number) => {
    stopTimer()
    timer = setTimeout(() => {
      timer = null
      if (disposed || t !== token) return
      api.labJobGet(id).then(
        (job) => {
          if (t !== token) return
          dispatch({ type: 'polled', job })
          if (isTerminal(job.state)) finish()
          else if (!disposed) poll(id, t, 0)
        },
        (e: unknown) => {
          if (t !== token) return
          const err = toApiError(e)
          if (err.code === 'not_found') {
            dispatch({ type: 'lost' })
            finish()
          } else if (err.code === 'network' && misses < NETWORK_MISSES) {
            if (!disposed) poll(id, t, misses + 1)
          } else {
            dispatch({ type: 'failed', error: err })
            finish()
          }
        },
      )
    }, POLL_MS)
  }

  return {
    run(config, body) {
      if (inFlight) return
      inFlight = true
      const t = ++token
      dispatch({ type: 'started', config, at: Date.now() })
      api.labJobCreate(body).then(
        ({ job_id }) => {
          if (t !== token) return
          jobId = job_id
          dispatch({ type: 'created', jobId: job_id })
          if (!disposed) poll(job_id, t, 0)
        },
        (e: unknown) => {
          if (t !== token) return
          dispatch({ type: 'failed', error: toApiError(e) })
          finish()
        },
      )
    },
    cancel() {
      const id = jobId
      if (!inFlight || !id || cancelling) return
      cancelling = true
      const t = token
      dispatch({ type: 'cancelling' })
      api.labJobCancel(id).then(
        ({ state }) => {
          if (t !== token) return
          // it finished before the cancel landed: the next poll brings the result
          if (state === 'done') return
          token++
          dispatch({ type: 'cancelled' })
          finish()
        },
        (e: unknown) => {
          if (t !== token) return
          const err = toApiError(e)
          token++
          dispatch(err.code === 'not_found' ? { type: 'lost' } : { type: 'failed', error: err })
          finish()
        },
      )
    },
    pause() {
      disposed = true
      stopTimer()
    },
    resume() {
      disposed = false
      if (inFlight && jobId && !timer) poll(jobId, token, 0)
    },
  }
}

/** `toBody` must be stable (a module-level function). */
export function useLabJob<C>(toBody: (c: C) => LabJobBody): LabJobRun<C> {
  const [s, dispatch] = useReducer(reduce<C>, undefined, initialLabJob<C>)
  const [ctl] = useState(() => createController<C>(dispatch))

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
    error: s.error,
    run: (config: C) => ctl.run(config, toBody(config)),
    cancel: ctl.cancel,
    dismissError: () => dispatch({ type: 'dismissError' }),
  }
}
