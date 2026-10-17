// The coach's own error copy, chosen by the error's status code (never by the backend's
// English). The backend detail is still shown under it (ui/ErrorNotice). Whether "Try
// again" is offered depends on whether asking again can help.

import type { ApiError } from './apiError'

export interface CoachErrorCopy {
  headline: string
  /** Asking again can succeed (a network blip, a server error, a 409 that went stale). */
  canRetry: boolean
}

export function coachErrorCopy(err: Pick<ApiError, 'code'>): CoachErrorCopy {
  switch (err.code) {
    case 'network':
      return { headline: 'Can’t reach the coach.', canRetry: true }
    case 'conflict':
      return { headline: 'The coach speaks on your turn.', canRetry: true }
    case 'not_found':
      // the server lost the session: only New game (in the dock) recovers
      return { headline: 'This game is no longer on the server.', canRetry: false }
    case 'server':
      return { headline: 'The coach hit an error.', canRetry: true }
    case 'bad_response':
      return { headline: 'The coach sent something unexpected.', canRetry: true }
    case 'bad_request':
    case 'validation':
      return { headline: 'The coach can’t read this spot.', canRetry: false }
    default:
      return { headline: 'The coach couldn’t answer.', canRetry: true }
  }
}
