// Typed API errors (fixes B30) and the human copy for them.
//
// api.ts throws an ApiError for every failure: a network failure (no response), an HTTP
// error status, or a body that is not JSON. FastAPI sends `detail` either as a string
// (our HTTPExceptions) or, for request validation (422), as an array of
// { loc, msg, type } objects; both become one readable `detail` string here, so nothing
// ever renders as "[object Object]".
//
// Copy is chosen from the HTTP status (`code`) and where the error happened (`context`),
// never by matching the backend's English. The backend's own `detail` is always shown
// too, as the second line (ErrorNotice).

export type ApiErrorCode =
  | 'network' // no response at all: the backend is down, or the connection dropped
  | 'bad_request' // 400: the engine refused (an illegal action, an unknown archetype)
  | 'not_found' // 404: e.g. the session is gone after a backend restart
  | 'conflict' // 409: a valid request at the wrong moment (not the hero's turn)
  | 'validation' // 422: FastAPI request validation
  | 'server' // 5xx
  | 'bad_response' // 2xx whose body is not the JSON we expected
  | 'http' // any other status

export interface ApiErrorInit {
  status: number | null
  detail: string
  code?: ApiErrorCode
  path?: string | null
}

export class ApiError extends Error {
  /** HTTP status, or null when no response arrived. */
  readonly status: number | null
  readonly code: ApiErrorCode
  /** Readable backend detail (or what the browser said for a network failure). */
  readonly detail: string
  /** The API path that failed, e.g. "/session/abc/action". */
  readonly path: string | null

  constructor({ status, detail, code, path = null }: ApiErrorInit) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.code = code ?? codeForStatus(status)
    this.detail = detail
    this.path = path
  }
}

export function codeForStatus(status: number | null): ApiErrorCode {
  if (status === null) return 'network'
  if (status === 400) return 'bad_request'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation'
  if (status >= 500) return 'server'
  return 'http'
}

interface ValidationItem {
  loc?: unknown
  msg?: unknown
}

// Where the bad value was: drop FastAPI's "body"/"query"/"path" prefix, keep the field path.
function locText(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  const parts = loc.filter((p) => p !== 'body' && p !== 'query' && p !== 'path' && p !== 'header')
  return parts.map(String).join('.')
}

function validationLine(item: unknown): string {
  if (typeof item === 'string') return item
  if (!item || typeof item !== 'object') return ''
  const { loc, msg } = item as ValidationItem
  const where = locText(loc)
  const what = typeof msg === 'string' ? msg : ''
  if (where && what) return `${where}: ${what}`
  return what || where
}

/** The readable detail of an error body (FastAPI string or 422 array), or `HTTP <status>`. */
export function detailText(body: unknown, status: number | null): string {
  const fallback = status === null ? 'No response' : `HTTP ${status}`
  if (!body || typeof body !== 'object') return typeof body === 'string' && body.trim() ? body.trim() : fallback
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail.trim() || fallback
  if (Array.isArray(detail)) {
    const lines = detail.map(validationLine).filter(Boolean)
    return lines.length ? lines.join('; ') : fallback
  }
  if (detail && typeof detail === 'object') {
    const line = validationLine(detail)
    if (line) return line
  }
  return fallback
}

/** Build the ApiError for a non-OK response (reads its body once). */
export async function errorFromResponse(res: Response, path: string | null = null): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return new ApiError({ status: res.status, detail: detailText(body, res.status), path })
}

/** Any thrown value as an ApiError. A fetch TypeError ("Failed to fetch") is a network error. */
export function toApiError(e: unknown, path: string | null = null, base?: string): ApiError {
  if (e instanceof ApiError) return e
  if (e instanceof TypeError || (e instanceof Error && e.name === 'TypeError')) {
    const where = base ? `No response from ${base}` : 'No response from the server'
    return new ApiError({ status: null, code: 'network', detail: `${where} (${e.message}).`, path })
  }
  if (e instanceof Error) return new ApiError({ status: null, code: 'http', detail: e.message || 'Unknown error', path })
  return new ApiError({ status: null, code: 'http', detail: String(e), path })
}

/** Where an error happened; the copy depends on it. */
export type ErrorContext =
  | 'boot' // creating the first session
  | 'newGame'
  | 'action' // submitting the hero's action
  | 'advance' // stepping a bot
  | 'nextHand'
  | 'coach'
  | 'reads'
  | 'stats'
  | 'history'
  | 'review'
  | 'lab'
  | 'cfr'
  | 'generic'

const TABLE_CONTEXTS: ReadonlySet<ErrorContext> = new Set(['boot', 'newGame', 'action', 'advance', 'nextHand', 'coach', 'reads'])

export interface ErrorDescription {
  /** Short human headline, chosen by status code and context. */
  headline: string
  /** The backend's readable detail, shown visibly under the headline. */
  detail: string
  /** Trying the same request again can succeed (network, server, conflict). */
  retryable: boolean
  /** Only a new session recovers (the server lost this one). */
  needsNewGame: boolean
}

function headlineFor(err: ApiError, context: ErrorContext): string {
  const table = TABLE_CONTEXTS.has(context)
  switch (err.code) {
    case 'network':
      return table ? 'Can’t reach the table.' : 'Can’t reach the server.'
    case 'conflict':
      if (context === 'action') return 'Not your turn yet.'
      if (context === 'coach') return 'The coach speaks on your turn.'
      if (context === 'nextHand') return 'This hand isn’t over yet.'
      if (context === 'advance') return 'The table moved on.'
      return 'That can’t happen right now.'
    case 'not_found':
      if (table) return 'This game is no longer on the server.'
      if (context === 'review') return 'That hand wasn’t found.'
      return 'Nothing was found there.'
    case 'bad_request':
      if (context === 'action') return 'That move isn’t allowed.'
      if (context === 'lab' || context === 'cfr') return 'The lab can’t run that setup.'
      return 'The server refused that request.'
    case 'validation':
      if (context === 'lab' || context === 'cfr') return 'A value is out of range.'
      return 'That request wasn’t valid.'
    case 'server':
      return 'The server hit an error.'
    case 'bad_response':
      return 'The server sent something unexpected.'
    default:
      return 'Something went wrong.'
  }
}

export function describeError(err: ApiError, context: ErrorContext = 'generic'): ErrorDescription {
  const needsNewGame = err.code === 'not_found' && TABLE_CONTEXTS.has(context)
  const retryable = !needsNewGame && (err.code === 'network' || err.code === 'server' || err.code === 'conflict' || err.code === 'bad_response')
  return { headline: headlineFor(err, context), detail: err.detail, retryable, needsNewGame }
}
