/**
 * My stats. One ring for how much of the window can be read, the two facts beside it, then
 * each stat against its target range, grouped by the sample gate that makes it readable,
 * then the trend. Nothing is judged before its gate (inventory §13).
 *
 *   <StatsView onGoToTable={() => navigate('table')} />
 *
 * Props: onGoToTable (optional): the empty state's "Go to the table"; without it the empty
 * state only says what to do.
 *
 * States: loading (tracks and names only, never placeholder bars), error (scoped notice with
 * the backend's detail and Try again; figures already on screen stay), empty (0 hands:
 * an invitation instead of the facts), all unjudged (< 500 hands), some judged, no trend
 * (< 40 hands), window larger than the data (a note under the selector, B24).
 */
import { useState } from 'react'
import type { MyStats } from '../../api'
import type { ApiError } from '../../lib/apiError'
import { decisionFact, resultFact, staleHeadline, windowNote, windowLast, WINDOWS, type WindowId } from '../../lib/stats'
import { BP, useViewportSize } from '../../lib/breakpoints'
import { useSpaceAvoid } from '../../lib/spaceAvoid'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { Segmented } from '../../ui/Segmented'
import { Facts } from './Facts'
import { GateRing } from './GateRing'
import { StatGroups } from './StatGroups'
import { TrendSection } from './TrendSection'
import { useMyStats } from './useMyStats'
import './StatsView.css'

export interface StatsViewProps {
  onGoToTable?: () => void
}

// "Last 500" reads "500" on a phone; the full label stays for screen readers.
const WINDOW_OPTIONS = WINDOWS.map((w) => ({
  value: w.id,
  label:
    w.last === null ? (
      w.label
    ) : (
      <>
        <span className="max-sm:sr-only">Last </span>
        {w.short}
      </>
    ),
}))

/** Keeps stars out from under the column (they drop to a whisper there). Its own
 *  component so a resize re-renders only this. */
function SpaceColumn() {
  const { w, h } = useViewportSize()
  const phone = w < BP.sm
  const col = Math.min(w, 1120) - (phone ? 0 : 56)
  const rect = w > 0 ? (phone ? { x: 0, y: 120, w, h: h - 120 } : { x: (w - col) / 2, y: 0, w: col, h }) : null
  useSpaceAvoid('stats', [rect])
  return null
}

export function StatsView({ onGoToTable }: StatsViewProps) {
  const [win, setWin] = useState<WindowId>('all')
  const { data, error, loading, targets, retry } = useMyStats(win)
  // A notice over figures that are still on screen can be dismissed; each new failure is a
  // new error object, so it shows again.
  const [dismissed, setDismissed] = useState<ApiError | null>(null)
  const showError = error !== null && error !== dismissed

  const last = data?.window?.last ?? windowLast(win)
  const note = data ? windowNote(last, data.overall.hands) : ''

  return (
    <div className="stats mx-auto max-w-[1120px] px-10 pt-[100px] pb-[60px] max-sm:px-4 max-sm:pt-[76px] max-sm:pb-0">
      <SpaceColumn />
      <div className="flex flex-wrap items-end justify-between gap-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-[18px]">
        <h1 className="m-0 text-display font-bold max-sm:text-[40px]">My stats</h1>
        <div className="flex flex-col items-end gap-2 max-sm:items-stretch">
          <Segmented className="stats-window" label="Window" value={win} onChange={setWin} options={WINDOW_OPTIONS} />
          <p className="m-0 min-h-[18px] text-foot text-fog max-sm:text-center" aria-live="polite">
            {note}
          </p>
        </div>
      </div>

      {showError ? (
        <div className="material-sheet squircle mt-7 rounded-[20px] py-3.5 pr-3.5 pl-[18px]">
          <ErrorNotice
            error={error}
            context="stats"
            headline={data ? staleHeadline(error) : undefined}
            onRetry={retry}
            onDismiss={data ? () => setDismissed(error) : undefined}
            busy={loading}
            layout="row"
            className="max-sm:flex-col max-sm:items-start"
          />
        </div>
      ) : null}

      {data ? <Loaded data={data} onGoToTable={onGoToTable} /> : error ? null : <Loading targets={targets} />}
      <p className="sr-only" role="status">
        {!data && !error ? 'Loading your stats' : ''}
      </p>
    </div>
  )
}

function Loading({ targets }: { targets: MyStats['targets'] | null }) {
  return (
    <div aria-busy="true">
      <section aria-label="Sample size" className="mt-14 flex items-center justify-center gap-24 max-lg:gap-14 max-sm:mt-9 max-sm:flex-col max-sm:gap-8">
        <GateRing hands={null} />
        {/* the facts' place, held so nothing jumps when they land */}
        <div className="w-[220px] max-sm:h-10" aria-hidden="true" />
      </section>
      {targets ? <StatGroups overall={null} targets={targets} /> : null}
    </div>
  )
}

function Loaded({ data, onGoToTable }: { data: MyStats; onGoToTable?: () => void }) {
  const n = data.overall.hands
  return (
    <>
      <section aria-label="Sample size" className="mt-14 flex items-center justify-center gap-24 max-lg:gap-14 max-sm:mt-9 max-sm:flex-col max-sm:gap-8">
        <GateRing hands={n} />
        {n > 0 ? (
          <Facts decision={decisionFact(data.decision_time)} result={resultFact(data.overall, data.window)} />
        ) : (
          <div className="grid max-w-[340px] justify-items-start max-sm:justify-items-center max-sm:text-center">
            <p className="m-0 text-headline font-strong">Play a session to build your profile.</p>
            <p className="m-0 mt-2 text-callout text-fog">Decision time and bb/100 show after your first hand. Each stat is read once its sample is big enough.</p>
            {onGoToTable ? (
              <Capsule variant="primary" size="md" className="mt-5" onClick={onGoToTable}>
                Go to the table
              </Capsule>
            ) : null}
          </div>
        )}
      </section>
      <StatGroups overall={data.overall} targets={data.targets} />
      <TrendSection data={data} />
    </>
  )
}
