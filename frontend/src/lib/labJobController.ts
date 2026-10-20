// The request loop of a background Lab run (B33): POST /lab/jobs, then GET /lab/jobs/{id}
// every 400 ms until the job is done, cancelled or failed; DELETE to cancel. It dispatches
// what it sees to the lib/labJob.ts reducer. The transport, the timers (setTimeout, so
// fake timers drive it in tests) and the page are injected, so it has no React in it.
//
// - Every run gets a token. An answer for an older token (a run that finished, was
//   cancelled or was replaced) is dropped, so a late poll never touches the run on screen.
// - One poll at a time: the next is scheduled only when the last has answered, and pause /
//   resume (the view hidden and shown again) never adds a second timer or request.
// - Paused, it keeps the job and polls nothing; resumed, it polls the same job again, so a
//   result that landed meanwhile shows on return and a hidden view costs nothing.
// - Cancel sends one DELETE. If the job finished before it landed, the next poll brings the
//   result. A 404 (on a poll or the cancel) means the server restarted and forgot the job.
// - A few network misses in a row are ridden out before the run is called failed.
// - While a job runs, leaving the page ('pagehide') cancels it with a keepalive request, so
//   a reload does not leave a run the next one would queue behind.

import type { LabJob, LabJobBody, LabJobState } from '../api'
import { toApiError } from './apiError'
import { isTerminal, type LabJobEvent } from './labJob'

export const POLL_MS = 400
/** Consecutive network failures ridden out while polling. */
export const NETWORK_MISSES = 5

export interface LabJobTransport {
  create: (body: LabJobBody) => Promise<{ job_id: string; state: LabJobState }>
  get: (id: string) => Promise<LabJob>
  cancel: (id: string, opts?: { keepalive?: boolean }) => Promise<{ job_id: string; state: LabJobState }>
}

export interface LabJobControllerOptions {
  pollMs?: number
  networkMisses?: number
  /** Where 'pagehide' is heard (window in the app); null for none. */
  page?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null
  now?: () => number
}

export interface LabJobController<C> {
  /** Start a run; does nothing while one is in flight. */
  run: (config: C, body: LabJobBody) => void
  /** Cancel the run in flight; does nothing before the server has named the job. */
  cancel: () => void
  /** Stop polling (the view is hidden or gone); the job keeps running on the server. */
  pause: () => void
  /** Poll the job in flight again (the view is back). */
  resume: () => void
}

export function createLabJobController<C>(
  transport: LabJobTransport,
  dispatch: (e: LabJobEvent<C>) => void,
  { pollMs = POLL_MS, networkMisses = NETWORK_MISSES, page = null, now = Date.now }: LabJobControllerOptions = {},
): LabJobController<C> {
  let token = 0
  let active = false // a run is in flight (from run() until it ends)
  let jobId: string | null = null
  let paused = false
  let polling = false // a GET is out
  let cancelling = false
  let misses = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const onPageHide = () => {
    if (jobId) transport.cancel(jobId, { keepalive: true }).catch(() => {})
  }

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  /** The run is over: forget it, and drop any answer still on its way. */
  const finish = () => {
    token++
    active = false
    jobId = null
    polling = false
    cancelling = false
    misses = 0
    stopTimer()
    page?.removeEventListener('pagehide', onPageHide)
  }

  const schedule = () => {
    if (!active || paused || jobId === null || polling || timer !== null) return
    timer = setTimeout(poll, pollMs)
  }

  const poll = () => {
    timer = null
    const id = jobId
    if (!active || paused || id === null || polling) return
    const t = token
    polling = true
    transport.get(id).then(
      (job) => {
        if (t !== token) return
        polling = false
        misses = 0
        dispatch({ type: 'polled', job })
        if (isTerminal(job.state)) finish()
        else schedule()
      },
      (e: unknown) => {
        if (t !== token) return
        polling = false
        const err = toApiError(e)
        if (err.code === 'not_found') {
          dispatch({ type: 'lost' })
          finish()
        } else if (err.code === 'network' && misses < networkMisses) {
          misses++
          schedule()
        } else {
          dispatch({ type: 'failed', error: err })
          finish()
        }
      },
    )
  }

  return {
    run(config, body) {
      if (active) return
      active = true
      const t = ++token
      dispatch({ type: 'started', config, at: now() })
      transport.create(body).then(
        ({ job_id }) => {
          if (t !== token) return
          jobId = job_id
          page?.addEventListener('pagehide', onPageHide)
          dispatch({ type: 'created', jobId: job_id })
          schedule()
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
      if (!active || id === null || cancelling) return
      cancelling = true
      const t = token
      dispatch({ type: 'cancelling' })
      transport.cancel(id).then(
        ({ state }) => {
          if (t !== token) return
          if (state === 'cancelled') {
            dispatch({ type: 'cancelled' })
            finish()
          } else {
            // it ended first (done or failed): the poll loop brings what it ended with
            cancelling = false
          }
        },
        (e: unknown) => {
          if (t !== token) return
          const err = toApiError(e)
          dispatch(err.code === 'not_found' ? { type: 'lost' } : { type: 'failed', error: err })
          finish()
        },
      )
    },

    pause() {
      paused = true
      stopTimer()
    },

    resume() {
      paused = false
      schedule()
    },
  }
}
