/**
 * ErrorNotice: an error shown where it happened (the dock, the coach, a view), never as a
 * page-wide banner. A human headline chosen by status code and context, the backend's own
 * detail visibly under it, and optional Dismiss and Try again. role="alert".
 *
 *   <ErrorNotice error={errors.coach} context="coach" onRetry={retry} onDismiss={dismiss} />
 *
 * Props: error (ApiError); context (ErrorContext: picks the copy, e.g. 'action' 409 ->
 * "Not your turn yet."); headline (override); onRetry + retryLabel ('Try again');
 * onDismiss + dismissLabel ('Dismiss'); compactDismiss (Dismiss as a 44 px close button,
 * where a second capsule leaves the text no room: the phone dock); busy (disables the
 * buttons while a retry runs); layout 'stack' (text over buttons, default) | 'row' (one
 * line, e.g. in a capsule); className. Copy: lib/apiError.ts describeError().
 */
import { describeError, type ApiError, type ErrorContext } from '../lib/apiError'
import { Capsule } from './Capsule'
import { IconButton } from './IconButton'
import { IconAlert, IconClose } from './Icons'

export interface ErrorNoticeProps {
  error: ApiError
  context?: ErrorContext
  headline?: string
  onRetry?: () => void
  retryLabel?: string
  onDismiss?: () => void
  dismissLabel?: string
  compactDismiss?: boolean
  busy?: boolean
  layout?: 'stack' | 'row'
  className?: string
}

export function ErrorNotice({
  error,
  context = 'generic',
  headline,
  onRetry,
  retryLabel = 'Try again',
  onDismiss,
  dismissLabel = 'Dismiss',
  compactDismiss = false,
  busy = false,
  layout = 'stack',
  className = '',
}: ErrorNoticeProps) {
  const d = describeError(error, context)
  const row = layout === 'row'
  return (
    <div role="alert" className={`flex ${row ? 'items-center gap-3' : 'flex-col items-start gap-3'} ${className}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <IconAlert className="mt-px size-6 shrink-0 text-close" />
        <div className="flex min-w-0 flex-col gap-px">
          <b className="text-callout font-semibold">{headline ?? d.headline}</b>
          <span className="text-foot text-fog [overflow-wrap:anywhere]">{d.detail}</span>
        </div>
      </div>
      {(onRetry || onDismiss) && (
        <div className={`flex shrink-0 gap-2 ${row ? 'ml-auto' : ''}`}>
          {onDismiss &&
            (compactDismiss ? (
              <IconButton label={dismissLabel} size="md" onClick={onDismiss} disabled={busy}>
                <IconClose />
              </IconButton>
            ) : (
              <Capsule variant="quiet" size="md" onClick={onDismiss} disabled={busy}>
                {dismissLabel}
              </Capsule>
            ))}
          {onRetry && (
            <Capsule variant="primary" size="md" onClick={onRetry} disabled={busy}>
              {retryLabel}
            </Capsule>
          )}
        </div>
      )}
    </div>
  )
}
