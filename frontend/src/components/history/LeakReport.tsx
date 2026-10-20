/**
 * LeakReport: what the review flagged over the window, one row per leak type, most frequent
 * first, each with a bar scaled to the largest count. A row is a disclosure: it opens the
 * rule behind the flag. No flags reads as a positive state in words ("Clean play.").
 *
 * The first pass over a window is slow (about a minute for 240 hands, cached afterwards
 * until the backend restarts): while it runs the report says how many hands it is
 * reviewing, how long it has taken, and, after a moment, what the wait is.
 *
 * Errors: scoped here, with the backend's detail and Try again. A failed refresh keeps the
 * counts on screen and says they may be out of date.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { describeError, type ApiError } from '../../lib/apiError'
import { count } from '../../lib/format'
import { elapsedLabel, firstPassNote, handsCount, leakRows, reviewingLine, type LeakRow } from '../../lib/historyList'
import { play } from '../../lib/motion'
import { ErrorNotice } from '../../ui/ErrorNotice'
import type { LeakReportLoad } from './useHistoryData'

export interface LeakReportProps {
  load: LeakReportLoad
  /** Hands in the window, from the list (null before it loads). */
  known: number | null
  window: number
  /** The list's own failure is already on screen (the same backend): say nothing twice. */
  quietStale?: boolean
}

export function LeakReport({ load, known, window, quietStale = false }: LeakReportProps) {
  const headId = useId()
  const { report, error, loading, startedAt, retry } = load
  const [dismissed, setDismissed] = useState<ApiError | null>(null)
  const rows = report ? leakRows(report) : []
  const reviewed = report?.hands_reviewed ?? 0

  return (
    <section aria-labelledby={headId} aria-busy={loading && !report}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headId} className="m-0 text-headline font-strong">
          Leaks
        </h2>
        <span className="text-callout text-fog tabular-nums">{report && reviewed > 0 ? `${handsCount(reviewed)} reviewed` : ''}</span>
      </div>

      {report && error && error !== dismissed && !quietStale ? (
        <ErrorNotice
          error={error}
          context="history"
          headline={`${describeError(error, 'history').headline} These counts may be out of date.`}
          onRetry={describeError(error, 'history').retryable ? retry : undefined}
          onDismiss={() => setDismissed(error)}
          busy={loading}
          className="mt-4"
        />
      ) : null}

      {report ? (
        reviewed === 0 ? (
          <p className="m-0 mt-3 text-callout text-fog">No hands to review in this window yet.</p>
        ) : rows.length === 0 ? (
          <p className="m-0 mt-3 text-body">
            <b className="font-semibold text-win">Clean play.</b> <span className="text-fog">Nothing was flagged in these hands.</span>
          </p>
        ) : (
          <ul className="m-0 mt-2 -mx-3 list-none p-0">
            {rows.map((r) => (
              <LeakItem key={r.type} row={r} />
            ))}
          </ul>
        )
      ) : error ? (
        <ErrorNotice error={error} context="history" headline="The leak report didn’t load." onRetry={describeError(error, 'history').retryable ? retry : undefined} busy={loading} className="mt-4" />
      ) : (
        <Reviewing since={startedAt} known={known} window={window} />
      )}
    </section>
  )
}

function LeakItem({ row }: { row: LeakRow }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const panel = useRef<HTMLParagraphElement>(null)
  const toggled = useRef(false)
  useLayoutEffect(() => {
    if (!open || !toggled.current) return
    toggled.current = false
    play(panel.current, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 300 })
  }, [open])
  const rule = row.rule
  return (
    <li>
      <button
        type="button"
        className="leak-row group"
        aria-expanded={rule ? open : undefined}
        aria-controls={rule ? id : undefined}
        disabled={!rule}
        onClick={() => {
          toggled.current = true
          setOpen((o) => !o)
        }}
      >
        <span className="min-w-0 text-body font-semibold">{row.label}</span>
        <span className="text-headline font-strong tabular-nums">{count(row.count)}</span>
        <span className="leak-row__rail" aria-hidden="true">
          <i style={{ width: `${Math.max(2, row.share * 100)}%` }} />
        </span>
      </button>
      {rule ? (
        <p id={id} ref={panel} hidden={!open} className="m-0 mx-3 mt-1 mb-3 max-w-[52ch] text-callout text-fog">
          {rule}
        </p>
      ) : null}
    </li>
  )
}

/** The slow first pass: what it reviews, how long it has run, and (after a moment) why. */
function Reviewing({ since, known, window }: { since: number | null; known: number | null; window: number }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])
  const elapsed = since != null && now != null ? now - since : 0
  return (
    <div className="history-wait mt-4">
      <div className="leak-progress" role="progressbar" aria-label={reviewingLine(known, window)} />
      <p className="m-0 mt-3 flex items-baseline justify-between gap-4 text-callout">
        <span role="status">{reviewingLine(known, window)}</span>
        <span className="text-fog tabular-nums" aria-hidden="true">
          {elapsedLabel(elapsed)}
        </span>
      </p>
      <p className={`m-0 mt-1 max-w-[46ch] text-foot text-fog transition-opacity duration-500 ${elapsed > 2500 ? 'opacity-100' : 'opacity-0'}`}>{firstPassNote(known)}</p>
    </div>
  )
}
