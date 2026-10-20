import { describe, expect, it } from 'vitest'
import type { LabJob, LabResult } from '../api'
import { ApiError, describeError } from './apiError'
import { canCancel, initialLabJob, isTerminal, reduce, type LabJobState } from './labJob'

type C = { hands: number }

const RESULT = { hands: 1200, seed: 0, lineup: ['tag'], overrides: {}, gate_pass: true, rows: [], elapsed_ms: 900 } as LabResult
const job = (over: Partial<LabJob>): LabJob => ({
  job_id: 'j1',
  kind: 'simulate',
  state: 'running',
  progress: { done: 0, total: 1200 },
  result: null,
  error: null,
  created_at: '2026-10-20T00:00:00Z',
  elapsed_ms: 10,
  ...over,
})

function running(): LabJobState<C> {
  let s = reduce(initialLabJob<C>(), { type: 'started', config: { hands: 1200 }, at: 1000 })
  s = reduce(s, { type: 'created', jobId: 'j1' })
  return s
}

describe('the lab job reducer', () => {
  it('starts a run with the setup and no progress yet', () => {
    const s = running()
    expect(s).toMatchObject({ running: { hands: 1200 }, startedAt: 1000, jobId: 'j1', progress: null, error: null, cancelling: false })
  })

  it('a running poll updates the progress', () => {
    const s = reduce(running(), { type: 'polled', job: job({ progress: { done: 400, total: 1200 } }) })
    expect(s.progress).toEqual({ done: 400, total: 1200 })
    expect(s.running).toEqual({ hands: 1200 })
  })

  it('a done poll stores the result and clears running', () => {
    const s = reduce(running(), { type: 'polled', job: job({ state: 'done', progress: { done: 1200, total: 1200 }, result: RESULT }) })
    expect(s).toMatchObject({ result: RESULT, resultFor: { hands: 1200 }, running: null, jobId: null, progress: null, startedAt: null })
  })

  it('ignores a poll for a job it is not running', () => {
    const s = running()
    expect(reduce(s, { type: 'polled', job: job({ job_id: 'old', state: 'done', result: RESULT }) })).toBe(s)
  })

  it('a lost job (the server restarted) is an error the lab names', () => {
    const s = reduce(running(), { type: 'lost' })
    expect(s.running).toBeNull()
    expect(s.error?.code).toBe('lab_lost')
    const d = describeError(s.error as ApiError, 'lab')
    expect(d.headline).toBe('The lab restarted before this run finished.')
    expect(d.retryable).toBe(true)
  })

  it('a failed job carries the server detail', () => {
    const s = reduce(running(), { type: 'polled', job: job({ state: 'failed', error: 'ValueError: boom' }) })
    expect(s.running).toBeNull()
    expect(s.error?.code).toBe('lab_failed')
    expect(s.error?.detail).toBe('ValueError: boom')
  })

  it('cancelled keeps the last result', () => {
    let s = reduce(running(), { type: 'polled', job: job({ state: 'done', result: RESULT }) })
    s = reduce(s, { type: 'started', config: { hands: 25000 }, at: 2000 })
    s = reduce(s, { type: 'created', jobId: 'j2' })
    s = reduce(s, { type: 'cancelling' })
    expect(s.cancelling).toBe(true)
    s = reduce(s, { type: 'cancelled' })
    expect(s).toMatchObject({ result: RESULT, resultFor: { hands: 1200 }, running: null, jobId: null, cancelling: false, error: null })
  })

  it('a server-side cancel reads the same as ours', () => {
    const s = reduce(running(), { type: 'polled', job: job({ state: 'cancelled' }) })
    expect(s).toMatchObject({ running: null, error: null, jobId: null })
  })

  it('a request that fails stops the run and keeps the last result', () => {
    let s = reduce(running(), { type: 'polled', job: job({ state: 'done', result: RESULT }) })
    s = reduce(s, { type: 'started', config: { hands: 300 }, at: 3000 })
    s = reduce(s, { type: 'failed', error: new ApiError({ status: null, detail: 'Failed to fetch' }) })
    expect(s).toMatchObject({ result: RESULT, running: null })
    expect(s.error?.code).toBe('network')
    expect(reduce(s, { type: 'dismissError' }).error).toBeNull()
  })

  it('knows the terminal states', () => {
    expect(['queued', 'running', 'done', 'cancelled', 'failed'].map((x) => isTerminal(x as LabJob['state']))).toEqual([false, false, true, true, true])
  })

  it('Cancel answers only once the server has the job running (a double-click on Run never cancels it)', () => {
    expect(canCancel(initialLabJob<C>())).toBe(false)
    const started = reduce(initialLabJob<C>(), { type: 'started', config: { hands: 1200 }, at: 1000 })
    expect(canCancel(started)).toBe(false)
    const created = reduce(started, { type: 'created', jobId: 'j1' })
    expect(canCancel(created)).toBe(false)
    const polled = reduce(created, { type: 'polled', job: job({ progress: { done: 0, total: 1200 } }) })
    expect(canCancel(polled)).toBe(true)
    expect(canCancel(reduce(polled, { type: 'cancelling' }))).toBe(false)
    expect(canCancel(reduce(polled, { type: 'polled', job: job({ state: 'done', result: RESULT }) }))).toBe(false)
  })

  it('a cancelled run remembers how far it got, until the next run', () => {
    let s = reduce(running(), { type: 'polled', job: job({ progress: { done: 3000, total: 25000 } }) })
    expect(s.cancelled).toBeNull()
    s = reduce(s, { type: 'cancelling' })
    s = reduce(s, { type: 'cancelled' })
    expect(s.cancelled).toEqual({ done: 3000, total: 25000 })
    s = reduce(s, { type: 'started', config: { hands: 300 }, at: 4000 })
    expect(s.cancelled).toBeNull()
  })

  it('a run cancelled before its first poll got nowhere', () => {
    const s = reduce(running(), { type: 'cancelled' })
    expect(s.cancelled?.done).toBe(0)
  })

  it('a server-side cancel takes the server’s count', () => {
    const s = reduce(running(), { type: 'polled', job: job({ state: 'cancelled', progress: { done: 4000, total: 25000 } }) })
    expect(s.cancelled).toEqual({ done: 4000, total: 25000 })
  })

  it('an error or a result is not a cancel', () => {
    expect(reduce(running(), { type: 'lost' }).cancelled).toBeNull()
    expect(reduce(running(), { type: 'polled', job: job({ state: 'done', result: RESULT }) }).cancelled).toBeNull()
  })
})
