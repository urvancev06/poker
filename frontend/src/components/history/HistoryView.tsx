/**
 * History: every stored hand, replayed street by street with each of your decisions
 * re-scored (realized equity against the price), and the leaks those decisions add up to
 * over a window (inventory 14).
 *
 *   <HistoryView sessionId={table.session?.session_id} onGoToTable={() => navigate('table')} />
 *
 * Props: sessionId (optional): the game on the table, for "This session" and to name its
 * group; onGoToTable (optional): the empty state's "Go to the table".
 *
 * Layout: the title with the scope and window; then, on a desk, two columns: the leak report
 * and the hand list on the left, the replay on a #1c1c1e sheet on the right that stays in
 * view while the list scrolls. On a phone or tablet: one column, and the replay opens as a
 * bottom sheet.
 *
 * States: list loading / error (scoped, never "No hands yet") / empty (per scope) / no game
 * for "This session"; leak report loading (the slow first pass, with progress) / error /
 * clean / counts; replay placeholder / loading (the row's summary is shown at once) / error
 * / loaded; a failed refresh keeps what is on screen and says so.
 */
import { useMemo, useState, type ReactNode } from 'react'
import type { HandSummary } from '../../api'
import { describeError, type ApiError } from '../../lib/apiError'
import { BP, useLayoutKind, useViewportSize } from '../../lib/breakpoints'
import { DEFAULT_WINDOW, LEAK_WINDOWS, handNumber, inWindow, reportScope, type LeakWindow, type Scope } from '../../lib/historyList'
import { chips } from '../../lib/format'
import { useSpaceAvoid } from '../../lib/spaceAvoid'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { HandList } from './HandList'
import { LeakReport } from './LeakReport'
import { ReplayBody, ReplayPanel } from './Replay'
import { useHandList, useLeakReport, useReplay, type Pick } from './useHistoryData'
import './HistoryView.css'

export interface HistoryViewProps {
  sessionId?: string
  onGoToTable?: () => void
}

const SCOPE_OPTIONS = [
  { value: 'all' as const, label: 'All hands' },
  { value: 'session' as const, label: 'This session' },
]

// "Last 500" reads "500" on a phone; the full label stays for screen readers.
type WindowValue = `${LeakWindow}`
const WINDOW_OPTIONS = LEAK_WINDOWS.map((w) => ({
  value: String(w) as WindowValue,
  label: (
    <>
      <span className="max-sm:sr-only">Last </span>
      {chips(w)}
    </>
  ),
}))

/** Keeps stars out from under the column. Its own component so a resize re-renders only this. */
function SpaceColumn() {
  const { w, h } = useViewportSize()
  const phone = w < BP.sm
  const col = Math.min(w, 1120) - (phone ? 0 : 56)
  const rect = w > 0 ? (phone ? { x: 0, y: 120, w, h: h - 120 } : { x: (w - col) / 2, y: 0, w: col, h }) : null
  useSpaceAvoid('history', [rect])
  return null
}

/** The picked hand, with the row's summary so the replay's header shows at once. */
interface Picked extends Pick {
  summary: HandSummary
}

export function HistoryView({ sessionId, onGoToTable }: HistoryViewProps) {
  const [scope, setScope] = useState<Scope>('all')
  const [win, setWin] = useState<LeakWindow>(DEFAULT_WINDOW)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const desk = useLayoutKind() === 'desk'

  const list = useHandList(scope, sessionId)
  const hands = useMemo(() => (list.hands ? inWindow(list.hands, win) : null), [list.hands, win])
  const leaks = useLeakReport(scope, sessionId, win, !list.noSession)
  const replay = useReplay(picked)

  // A notice over hands still on screen can be dismissed; each new failure shows again.
  const [dismissed, setDismissed] = useState<ApiError | null>(null)
  const staleList = hands !== null && list.error !== null && list.error !== dismissed

  const choose = (h: HandSummary) => {
    setPicked((p) => ({ id: h.id, n: (p?.n ?? 0) + 1, summary: h }))
    if (!desk) setSheetOpen(true)
  }

  const note = hands ? reportScope(hands.length, win, scope) : ''
  const hasHands = hands !== null && hands.length > 0

  return (
    <div className="history mx-auto max-w-[1120px] px-10 pt-[100px] pb-[60px] max-sm:px-4 max-sm:pt-[76px] max-sm:pb-0">
      <SpaceColumn />
      <PageHeader
        title="History"
        controls={
          <div className="flex flex-wrap justify-end gap-3 max-sm:flex-col max-sm:gap-2.5">
            <Segmented className="history-scope" label="Hands" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
            <Segmented
              className="history-window"
              label="Window"
              value={String(win) as WindowValue}
              onChange={(v) => setWin(Number(v) as LeakWindow)}
              options={WINDOW_OPTIONS}
            />
          </div>
        }
        note={note}
      />

      {staleList ? (
        <div className="material-sheet squircle mt-7 max-w-[640px] rounded-[20px] py-3.5 pr-3.5 pl-[18px]">
          <ErrorNotice
            error={list.error!}
            context="history"
            headline={`${describeError(list.error!, 'history').headline} These hands may be out of date.`}
            onRetry={
              describeError(list.error!, 'history').retryable
                ? () => {
                    list.retry()
                    leaks.retry()
                  }
                : undefined
            }
            onDismiss={() => setDismissed(list.error)}
            busy={list.loading}
            layout="row"
            className="max-sm:flex-col max-sm:items-start"
          />
        </div>
      ) : null}

      {list.noSession ? (
        <Invite title="No game is on the table yet." body="This session’s hands show here once you play one." className="mt-16">
          <Capsule variant="quiet" size="md" onClick={() => setScope('all')}>
            Show all hands
          </Capsule>
        </Invite>
      ) : hands === null ? (
        list.error ? (
          <div className="material-sheet squircle mt-12 max-w-[640px] rounded-[20px] py-3.5 pr-3.5 pl-[18px]">
            <ErrorNotice error={list.error} context="history" headline="Your hands didn’t load." onRetry={describeError(list.error, 'history').retryable ? list.retry : undefined} busy={list.loading} layout="row" className="max-sm:flex-col max-sm:items-start" />
          </div>
        ) : (
          <p className="history-wait mt-16 text-callout text-fog" aria-busy="true">
            Loading your hands
          </p>
        )
      ) : !hasHands ? (
        <Invite
          title={scope === 'session' ? 'No hands this session yet.' : 'No hands yet.'}
          body="Every hand you finish at the table lands here, with each of your decisions re-scored against the price you were offered."
          className="mt-16"
        >
          <div className="flex flex-wrap gap-3 max-sm:justify-center">
            {onGoToTable ? (
              <Capsule variant="primary" size="md" onClick={onGoToTable}>
                Go to the table
              </Capsule>
            ) : null}
            {scope === 'session' ? (
              <Capsule variant="quiet" size="md" onClick={() => setScope('all')}>
                Show all hands
              </Capsule>
            ) : null}
          </div>
        </Invite>
      ) : (
        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[400px_minmax(0,1fr)] max-lg:mx-auto max-lg:max-w-[640px] max-sm:mt-9 max-sm:gap-10">
          <div className="grid min-w-0 gap-12 max-sm:gap-10">
            <LeakReport load={leaks} known={hands.length} window={win} quietStale={list.error !== null} />
            <HandList key={`${scope}|${win}`} hands={hands} sessionId={sessionId} selectedId={picked?.id ?? null} onSelect={choose} />
          </div>
          {desk ? <ReplayPanel picked={picked?.summary ?? null} load={replay} onLatest={() => choose(hands[0])} /> : null}
        </div>
      )}

      {!desk && picked ? (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`Hand ${handNumber(picked.summary.hand_index)}`} layout="bottom">
          <ReplayBody summary={picked.summary} load={replay} />
        </Sheet>
      ) : null}
      <p className="sr-only" role="status">
        {list.loading && hands === null && !list.noSession ? 'Loading your hands' : ''}
      </p>
    </div>
  )
}

function Invite({ title, body, className = '', children }: { title: string; body: string; className?: string; children?: ReactNode }) {
  return (
    <div className={`grid max-w-[460px] justify-items-start max-sm:mx-auto max-sm:justify-items-center max-sm:text-center ${className}`}>
      <p className="m-0 text-headline font-strong">{title}</p>
      <p className="m-0 mt-2 text-callout text-fog">{body}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}
