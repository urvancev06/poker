// A Lab simulation as a background job (B33): the state of one run, as a pure reducer.
// components/lab/useLabJob.ts starts the job, polls it and dispatches what it sees.
//
// - The last result stays on screen while a new run is in flight; `resultFor` is the
//   setup that produced it, so the view can say when the controls no longer match it.
// - A poll for any job but the one in flight is ignored (a late answer from a run that
//   was cancelled or replaced).
// - Cancelled (by us or by the server) keeps the last result and shows no error.
// - Lost (a 404: the server restarted and forgot its jobs) and failed (the job raised)
//   are errors with their own copy (lib/apiError: 'lab_lost', 'lab_failed').

import type { LabJob, LabJobState as JobState, LabResult } from '../api'
import { ApiError } from './apiError'

export interface LabJobState<C> {
  result: LabResult | null
  /** The setup the result came from. */
  resultFor: C | null
  /** The setup being run now, or null when idle. */
  running: C | null
  /** Date.now() when the current run started (for the elapsed count). */
  startedAt: number | null
  /** The job in flight, once the server has given it an id. */
  jobId: string | null
  /** Hands merged so far, from the last poll. */
  progress: { done: number; total: number } | null
  /** Cancel was pressed and the server has not answered yet. */
  cancelling: boolean
  error: ApiError | null
}

export type LabJobEvent<C> =
  | { type: 'started'; config: C; at: number }
  | { type: 'created'; jobId: string }
  | { type: 'polled'; job: LabJob }
  | { type: 'cancelling' }
  | { type: 'cancelled' }
  | { type: 'failed'; error: ApiError }
  | { type: 'lost' }
  | { type: 'dismissError' }

export function initialLabJob<C>(): LabJobState<C> {
  return { result: null, resultFor: null, running: null, startedAt: null, jobId: null, progress: null, cancelling: false, error: null }
}

export function isTerminal(state: JobState): boolean {
  return state === 'done' || state === 'cancelled' || state === 'failed'
}

export const LAB_LOST_DETAIL = 'The server no longer knows this run, so its result is gone. Run it again.'

function stopped<C>(s: LabJobState<C>, error: ApiError | null): LabJobState<C> {
  return { ...s, running: null, startedAt: null, jobId: null, progress: null, cancelling: false, error }
}

export function reduce<C>(s: LabJobState<C>, e: LabJobEvent<C>): LabJobState<C> {
  switch (e.type) {
    case 'started':
      return { ...s, running: e.config, startedAt: e.at, jobId: null, progress: null, cancelling: false, error: null }
    case 'created':
      return s.running === null ? s : { ...s, jobId: e.jobId }
    case 'polled': {
      const j = e.job
      if (s.running === null || j.job_id !== s.jobId) return s
      if (j.state === 'done' && j.result) {
        return { ...stopped(s, null), result: j.result, resultFor: s.running }
      }
      if (j.state === 'cancelled') return stopped(s, null)
      if (j.state === 'failed' || j.state === 'done') {
        return stopped(s, new ApiError({ status: 500, code: 'lab_failed', detail: j.error || 'The simulation stopped without a result.', path: `/lab/jobs/${j.job_id}` }))
      }
      return { ...s, progress: { done: j.progress.done, total: j.progress.total } }
    }
    case 'cancelling':
      return s.running === null ? s : { ...s, cancelling: true }
    case 'cancelled':
      return stopped(s, null)
    case 'failed':
      return stopped(s, e.error)
    case 'lost':
      return stopped(s, new ApiError({ status: 404, code: 'lab_lost', detail: LAB_LOST_DETAIL, path: s.jobId ? `/lab/jobs/${s.jobId}` : null }))
    case 'dismissError':
      return s.error ? { ...s, error: null } : s
  }
}
