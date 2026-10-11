import { describe, expect, it } from 'vitest'
import { ApiError, codeForStatus, describeError, detailText, errorFromResponse, toApiError } from './apiError'

// Real bodies captured from the backend (scratchpad/samples/errors.json and a live 422).
const CFR_422 = {
  detail: [
    {
      type: 'less_than_equal',
      loc: ['body', 'iterations'],
      msg: 'Input should be less than or equal to 500000',
      input: 600000,
      ctx: { le: 500000 },
    },
  ],
}

describe('detailText', () => {
  it('keeps a FastAPI string detail', () => {
    expect(detailText({ detail: "it is not the hero's turn" }, 409)).toBe("it is not the hero's turn")
  })

  it('turns a 422 detail array into readable text (B30)', () => {
    expect(detailText(CFR_422, 422)).toBe('iterations: Input should be less than or equal to 500000')
  })

  it('joins several validation items and keeps nested field paths', () => {
    const body = {
      detail: [
        { loc: ['body', 'auto_advance'], msg: 'Input should be a valid boolean' },
        { loc: ['body', 'villains', 2], msg: 'Field required' },
      ],
    }
    expect(detailText(body, 422)).toBe('auto_advance: Input should be a valid boolean; villains.2: Field required')
  })

  it('falls back to HTTP <status> for empty or odd bodies', () => {
    expect(detailText(null, 500)).toBe('HTTP 500')
    expect(detailText({}, 502)).toBe('HTTP 502')
    expect(detailText({ detail: [] }, 422)).toBe('HTTP 422')
    expect(detailText({ detail: '   ' }, 400)).toBe('HTTP 400')
  })

  it('uses a plain-text body when the server sent one', () => {
    expect(detailText('Internal Server Error', 500)).toBe('Internal Server Error')
  })
})

describe('codeForStatus', () => {
  it('maps statuses to codes', () => {
    expect(codeForStatus(null)).toBe('network')
    expect(codeForStatus(400)).toBe('bad_request')
    expect(codeForStatus(404)).toBe('not_found')
    expect(codeForStatus(409)).toBe('conflict')
    expect(codeForStatus(422)).toBe('validation')
    expect(codeForStatus(500)).toBe('server')
    expect(codeForStatus(503)).toBe('server')
    expect(codeForStatus(418)).toBe('http')
  })
})

describe('errorFromResponse', () => {
  it('reads status, detail and path from a Response', async () => {
    const res = new Response(JSON.stringify(CFR_422), { status: 422 })
    const err = await errorFromResponse(res, '/lab/cfr')
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(422)
    expect(err.code).toBe('validation')
    expect(err.path).toBe('/lab/cfr')
    expect(err.message).toBe('iterations: Input should be less than or equal to 500000')
  })

  it('survives a non-JSON body', async () => {
    const err = await errorFromResponse(new Response('Bad Gateway', { status: 502 }))
    expect(err.code).toBe('server')
    expect(err.detail).toBe('Bad Gateway')
  })
})

describe('toApiError', () => {
  it('passes an ApiError through', () => {
    const e = new ApiError({ status: 409, detail: 'x' })
    expect(toApiError(e)).toBe(e)
  })

  it('treats a fetch TypeError as a network error', () => {
    const err = toApiError(new TypeError('Failed to fetch'), '/session', 'http://localhost:8000')
    expect(err.status).toBeNull()
    expect(err.code).toBe('network')
    expect(err.detail).toBe('No response from http://localhost:8000 (Failed to fetch).')
  })
})

describe('describeError', () => {
  const e = (status: number | null, detail = 'd') => new ApiError({ status, detail })

  it('chooses copy by status and context, never by the detail text', () => {
    expect(describeError(e(409), 'action').headline).toBe('Not your turn yet.')
    expect(describeError(e(409), 'coach').headline).toBe('The coach speaks on your turn.')
    expect(describeError(e(409), 'nextHand').headline).toBe('This hand isn’t over yet.')
    expect(describeError(e(400), 'action').headline).toBe('That move isn’t allowed.')
    expect(describeError(e(null), 'boot').headline).toBe('Can’t reach the table.')
    expect(describeError(e(null), 'stats').headline).toBe('Can’t reach the server.')
    expect(describeError(e(422), 'cfr').headline).toBe('A value is out of range.')
    expect(describeError(e(500)).headline).toBe('The server hit an error.')
  })

  it('always carries the backend detail', () => {
    expect(describeError(e(409, "it is not the hero's turn"), 'action').detail).toBe("it is not the hero's turn")
  })

  it('says what can be retried and what needs a new game', () => {
    expect(describeError(e(null), 'advance')).toMatchObject({ retryable: true, needsNewGame: false })
    expect(describeError(e(409), 'action')).toMatchObject({ retryable: true })
    expect(describeError(e(400), 'action')).toMatchObject({ retryable: false })
    expect(describeError(e(422), 'cfr')).toMatchObject({ retryable: false })
    expect(describeError(e(404), 'action')).toMatchObject({ retryable: false, needsNewGame: true })
    expect(describeError(e(404), 'review')).toMatchObject({ needsNewGame: false })
  })
})
