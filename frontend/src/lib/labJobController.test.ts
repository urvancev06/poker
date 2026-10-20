import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LabJob, LabJobBody, LabJobState, LabResult } from '../api'
import { ApiError } from './apiError'
import type { LabJobEvent } from './labJob'
import { createLabJobController, type LabJobTransport } from './labJobController'

type C = { hands: number }

const BODY: LabJobBody = { kind: 'simulate', lineup: ['tag'], hands: 2000, seed: 0 }
const RESULT = { hands: 2000, seed: 0, lineup: ['tag'], overrides: {}, gate_pass: true, rows: [], elapsed_ms: 900 } as LabResult

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A server with one job, j1, that answers at once unless a test holds an answer back. */
function fakeServer() {
  let job: LabJob = {
    job_id: 'j1',
    kind: 'simulate',
    state: 'running',
    progress: { done: 0, total: 2000 },
    result: null,
    error: null,
    created_at: '2026-10-20T00:00:00Z',
    elapsed_ms: 0,
  }
  const transport = {
    create: vi.fn((): Promise<{ job_id: string; state: LabJobState }> => Promise.resolve({ job_id: job.job_id, state: 'queued' })),
    get: vi.fn((): Promise<LabJob> => Promise.resolve({ ...job, progress: { ...job.progress } })),
    cancel: vi.fn((id: string): Promise<{ job_id: string; state: LabJobState }> => {
      void id
      if (job.state === 'running' || job.state === 'queued') job = { ...job, state: 'cancelled' }
      return Promise.resolve({ job_id: job.job_id, state: job.state })
    }),
  } satisfies LabJobTransport
  return {
    transport,
    set: (over: Partial<LabJob>) => {
      job = { ...job, ...over }
    },
    snapshot: (): LabJob => ({ ...job, progress: { ...job.progress } }),
  }
}

const notFound = () => new ApiError({ status: 404, detail: 'lab job not found (the server may have restarted)' })
const offline = () => new ApiError({ status: null, detail: 'Failed to fetch' })

function setup(opts: { networkMisses?: number; page?: EventTarget } = {}) {
  const server = fakeServer()
  const events: LabJobEvent<C>[] = []
  const ctl = createLabJobController<C>(server.transport, (e) => events.push(e), { pollMs: 400, ...opts })
  const types = () => events.map((e) => e.type)
  return { ...server, ctl, events, types }
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the lab job controller', () => {
  it('starts the job from run and polls every 400 ms until it is done', async () => {
    const { ctl, transport, set, events, types } = setup()
    ctl.run({ hands: 2000 }, BODY)
    expect(types()).toEqual(['started'])
    expect(transport.create).toHaveBeenCalledTimes(1)
    expect(transport.create).toHaveBeenCalledWith(BODY)

    await tick(0)
    expect(types()).toEqual(['started', 'created'])
    expect(transport.get).not.toHaveBeenCalled()

    await tick(399)
    expect(transport.get).not.toHaveBeenCalled()
    await tick(1)
    expect(transport.get).toHaveBeenCalledTimes(1)
    expect(transport.get).toHaveBeenCalledWith('j1')
    expect(types()).toEqual(['started', 'created', 'polled'])

    set({ progress: { done: 1000, total: 2000 } })
    await tick(400)
    expect(events.at(-1)).toMatchObject({ type: 'polled', job: { state: 'running', progress: { done: 1000 } } })

    set({ state: 'done', progress: { done: 2000, total: 2000 }, result: RESULT })
    await tick(400)
    expect(events.at(-1)).toMatchObject({ type: 'polled', job: { state: 'done', result: RESULT } })
    expect(transport.get).toHaveBeenCalledTimes(3)

    // a terminal state ends the loop
    await tick(4000)
    expect(transport.get).toHaveBeenCalledTimes(3)
  })

  it('a second run while one is in flight does nothing', async () => {
    const { ctl, transport, types } = setup()
    ctl.run({ hands: 2000 }, BODY)
    ctl.run({ hands: 9000 }, { ...BODY, hands: 9000 })
    await tick(0)
    ctl.run({ hands: 9000 }, { ...BODY, hands: 9000 })
    expect(transport.create).toHaveBeenCalledTimes(1)
    expect(types().filter((t) => t === 'started')).toHaveLength(1)
  })

  it('pausing stops the polling; resuming picks the same job up again', async () => {
    const { ctl, transport } = setup()
    ctl.run({ hands: 2000 }, BODY)
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(1)

    ctl.pause()
    await tick(5000)
    expect(transport.get).toHaveBeenCalledTimes(1)

    ctl.resume()
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(2)
    expect(transport.get).toHaveBeenLastCalledWith('j1')
    expect(transport.create).toHaveBeenCalledTimes(1)
  })

  it('paused before the server named the job, it polls only once resumed', async () => {
    const { ctl, transport, types } = setup()
    const made = deferred<{ job_id: string; state: LabJobState }>()
    transport.create.mockImplementationOnce(() => made.promise)
    ctl.run({ hands: 2000 }, BODY)
    ctl.pause()
    made.resolve({ job_id: 'j1', state: 'queued' })
    await tick(3000)
    expect(types()).toEqual(['started', 'created'])
    expect(transport.get).not.toHaveBeenCalled()

    ctl.resume()
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(1)
  })

  it('never has two polls in the air, however often it is hidden and shown', async () => {
    const { ctl, transport, snapshot } = setup()
    const slow = deferred<LabJob>()
    ctl.run({ hands: 2000 }, BODY)
    await tick(0)
    transport.get.mockImplementationOnce(() => slow.promise)
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(1)

    // a slow answer: hide and show the view a few times while it is out
    ctl.pause()
    ctl.resume()
    ctl.resume()
    ctl.pause()
    ctl.resume()
    await tick(3000)
    expect(transport.get).toHaveBeenCalledTimes(1)

    slow.resolve(snapshot())
    await tick(0)
    await tick(399)
    expect(transport.get).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(transport.get).toHaveBeenCalledTimes(2)
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(3)
  })

  it('a 404 while polling means the server forgot the job', async () => {
    const { ctl, transport, types } = setup()
    ctl.run({ hands: 2000 }, BODY)
    await tick(0)
    transport.get.mockImplementationOnce(() => Promise.reject(notFound()))
    await tick(400)
    expect(types().at(-1)).toBe('lost')
    await tick(4000)
    expect(transport.get).toHaveBeenCalledTimes(1)
  })

  it('rides out a few network misses, then calls the run failed', async () => {
    const { ctl, transport, events, types } = setup({ networkMisses: 2 })
    ctl.run({ hands: 2000 }, BODY)
    await tick(0)
    transport.get.mockImplementation(() => Promise.reject(offline()))
    await tick(800)
    expect(transport.get).toHaveBeenCalledTimes(2)
    expect(types()).toEqual(['started', 'created'])
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(3)
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'network' } })
    await tick(4000)
    expect(transport.get).toHaveBeenCalledTimes(3)
  })

  it('an answer between misses starts the count again', async () => {
    const { ctl, transport, types } = setup({ networkMisses: 1 })
    ctl.run({ hands: 2000 }, BODY)
    await tick(0)
    transport.get.mockImplementationOnce(() => Promise.reject(offline()))
    await tick(400) // a miss (tolerated)
    await tick(400) // an answer
    transport.get.mockImplementationOnce(() => Promise.reject(offline()))
    await tick(400) // a miss again: one in a row, still tolerated
    expect(transport.get).toHaveBeenCalledTimes(3)
    expect(types()).not.toContain('failed')
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(4)
  })

  it('cancel sends one DELETE, and a poll answered after it is dropped', async () => {
    const { ctl, transport, snapshot, types } = setup()
    ctl.run({ hands: 2000 }, BODY)
    await tick(400)
    const late = deferred<LabJob>()
    transport.get.mockImplementationOnce(() => late.promise)
    await tick(400)
    expect(transport.get).toHaveBeenCalledTimes(2)

    ctl.cancel()
    ctl.cancel()
    expect(transport.cancel).toHaveBeenCalledTimes(1)
    expect(transport.cancel.mock.calls[0][0]).toBe('j1')
    expect(types().at(-1)).toBe('cancelling')
    await tick(0)
    expect(types().at(-1)).toBe('cancelled')

    late.resolve({ ...snapshot(), state: 'running' })
    await tick(4000)
    expect(types().at(-1)).toBe('cancelled')
    expect(transport.get).toHaveBeenCalledTimes(2)
  })

  it('a cancel that loses the race to the finish lets the result land', async () => {
    const { ctl, transport, set, events, types } = setup()
    ctl.run({ hands: 2000 }, BODY)
    await tick(400)
    set({ state: 'done', progress: { done: 2000, total: 2000 }, result: RESULT })
    ctl.cancel()
    await tick(0)
    expect(types()).not.toContain('cancelled')
    await tick(400)
    expect(events.at(-1)).toMatchObject({ type: 'polled', job: { state: 'done' } })
    expect(transport.cancel).toHaveBeenCalledTimes(1)
  })

  it('a cancel the server no longer knows reads as lost', async () => {
    const { ctl, transport, types } = setup()
    ctl.run({ hands: 2000 }, BODY)
    await tick(400)
    transport.cancel.mockImplementationOnce(() => Promise.reject(notFound()))
    ctl.cancel()
    await tick(0)
    expect(types().at(-1)).toBe('lost')
    await tick(2000)
    expect(transport.get).toHaveBeenCalledTimes(1)
  })

  it('cancel before the server has named the job does nothing', () => {
    const { ctl, transport, types } = setup()
    transport.create.mockImplementationOnce(() => new Promise(() => {}))
    ctl.run({ hands: 2000 }, BODY)
    ctl.cancel()
    expect(transport.cancel).not.toHaveBeenCalled()
    expect(types()).toEqual(['started'])
  })

  it('a start that fails reports it, and the next run starts afresh', async () => {
    const { ctl, transport, events } = setup()
    transport.create.mockImplementationOnce(() => Promise.reject(new ApiError({ status: 500, detail: 'boom' })))
    ctl.run({ hands: 2000 }, BODY)
    await tick(0)
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'server' } })
    await tick(2000)
    expect(transport.get).not.toHaveBeenCalled()

    ctl.run({ hands: 2000 }, BODY)
    expect(transport.create).toHaveBeenCalledTimes(2)
  })

  it('a run after a cancel is a new job', async () => {
    const { ctl, transport, set, types } = setup()
    ctl.run({ hands: 2000 }, BODY)
    await tick(400)
    ctl.cancel()
    await tick(0)
    set({ job_id: 'j2', state: 'running' })
    ctl.run({ hands: 3000 }, { ...BODY, hands: 3000 })
    await tick(400)
    expect(transport.create).toHaveBeenCalledTimes(2)
    expect(transport.get).toHaveBeenLastCalledWith('j2')
    expect(types().slice(-3)).toEqual(['started', 'created', 'polled'])
  })

  it('leaving the page cancels the job in flight with a keepalive request, and only that one', async () => {
    const page = new EventTarget()
    const { ctl, transport, set } = setup({ page })
    page.dispatchEvent(new Event('pagehide'))
    expect(transport.cancel).not.toHaveBeenCalled()

    ctl.run({ hands: 2000 }, BODY)
    await tick(0)
    page.dispatchEvent(new Event('pagehide'))
    expect(transport.cancel).toHaveBeenCalledTimes(1)
    expect(transport.cancel).toHaveBeenLastCalledWith('j1', { keepalive: true })

    // once the run is over, leaving costs nothing
    set({ state: 'done', result: RESULT })
    await tick(400)
    page.dispatchEvent(new Event('pagehide'))
    expect(transport.cancel).toHaveBeenCalledTimes(1)
  })
})
