/**
 * BotResults: the gate verdict and one row per archetype.
 *
 * The status line, in the coach's register:
 *   not run yet    "Not run yet." and how long a run takes
 *   simulating     "Simulating 5,000 hands." the hands done so far on a hairline track, the
 *                  seconds so far and the estimate; the run is a background job, so the
 *                  table keeps playing and Cancel (in the dock) stops it; the last result
 *                  stays below, marked as the last run
 *   result         "Passes the gate." / "Fails the gate." with its caveat ("indicative, not
 *                  the gate") and the meta line; a note when the setup has changed since
 *
 * The rows: before any run, each seated archetype's targets on bare rails; after, the
 * readings. One row per archetype in the server's order (Nit, TAG, LAG, Station, Maniac);
 * a doubled archetype is one pooled row that says so.
 */
import { useId, type Ref } from 'react'
import type { LabArchetypesInfo, LabResult } from '../../api'
import { LAB_STATS, gateCaveat, gateHeadline, gateSummary, metaLine, progressShare, progressText, type ResultRowView, type RunConfig } from '../../lib/lab'
import { count } from '../../lib/stats'
import { Elapsed, LabProgress } from './LabParts'
import { ResultRow } from './ResultRow'

export interface BotResultsProps {
  ref?: Ref<HTMLElement>
  info: LabArchetypesInfo
  rows: ResultRowView[]
  result: LabResult | null
  /** The controls no longer match the run on screen. */
  stale: boolean
  running: RunConfig | null
  startedAt: number | null
  /** Hands done so far in the run in flight (null until the first poll answers). */
  progress?: { done: number; total: number } | null
  /** How long a run of the current hands takes, in words. */
  estimate: string
}

export function BotResults({ ref, info, rows, result, stale, running, startedAt, progress = null, estimate }: BotResultsProps) {
  const headId = useId()
  const gate = result ? gateSummary(result, rows) : null
  const busy = running !== null

  let headline: string
  let tone: 'idle' | 'pass' | 'fail' | 'busy'
  if (busy) {
    headline = `Simulating ${count(running.hands)} hands.`
    tone = 'busy'
  } else if (gate && result) {
    headline = gateHeadline(gate)
    tone = gate.pass ? 'pass' : 'fail'
  } else {
    headline = 'Not run yet.'
    tone = 'idle'
  }

  return (
    <section ref={ref} aria-labelledby={headId} className="lab-results mt-20 scroll-mt-[calc(var(--bar-h)+24px)] max-sm:mt-14" aria-busy={busy}>
      <h2 id={headId} className="lab-verdict m-0 text-verdict font-strong max-sm:text-[26px]" data-tone={tone} aria-live="polite">
        {headline}
      </h2>
      <div className="mt-2.5 grid gap-1 text-callout text-fog">
        {busy && startedAt !== null ? (
          <>
            <LabProgress share={progress ? progressShare(progress.done, progress.total) : 0} label={progress ? progressText(progress.done, progress.total) : 'Starting'} />
            <p className="m-0 tabular-nums">
              {progress ? `${progressText(progress.done, progress.total)}. ` : ''}Usually {estimate} for this many hands; <Elapsed since={startedAt} /> so far.
            </p>
            <p className="m-0">It runs in the background, so the table keeps playing. Cancel in the dock stops it.</p>
            {result ? <p className="m-0 text-dust">Below is the last run, until this one lands.</p> : null}
          </>
        ) : gate && result ? (
          <>
            <p className="m-0">{gateCaveat(gate, result.hands)}</p>
            <p className="m-0 text-foot text-dust tabular-nums">{metaLine(result)}</p>
            {stale ? <p className="m-0 mt-1 text-ink">The setup has changed since this run. Run again to measure it.</p> : null}
          </>
        ) : (
          <>
            <p className="m-0">Each archetype’s targets are on the rails below; a run puts its readings on them.</p>
            <p className="m-0">
              This one takes {estimate}. It runs in the background, so the table keeps playing meanwhile.
            </p>
          </>
        )}
      </div>

      <div className={`lab-matrix mt-10 max-sm:mt-8 ${busy && result ? 'is-waiting' : ''}`}>
        <div className="lab-matrix__head text-callout text-fog" aria-hidden="true">
          <span />
          {LAB_STATS.map((d) => (
            <span key={d.key}>{d.name}</span>
          ))}
          <span className="text-right">bb/100</span>
        </div>
        <ul className="m-0 list-none p-0">
          {rows.map((r) => (
            <ResultRow key={r.name} row={r} result={result} info={info} />
          ))}
        </ul>
      </div>
    </section>
  )
}
