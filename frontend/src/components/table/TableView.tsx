/**
 * TableView: the play screen. OWNED BY THE TABLE BUILDER (everything under
 * components/table/): this is the agreed contract with a minimal working implementation
 * that still uses the pre-Stage internals (Table, MobileTable, ActionBar, ActionLog), set
 * in the Stage layout: the stage, the coach beside it (desk) or above the dock (phone),
 * one glass dock, the log and maths sheets.
 *
 * Contract:
 *   table            the session hook's result (lib/useTableSession.ts): state, reads,
 *                    coach state, scoped errors, act / nextHand / newGame / askCoach ...
 *   logOpen          whether the hand log is open (the top bar's log button and the L key
 *                    live in the shell)
 *   onLogOpenChange  open / close the log (Done, Escape, drag down)
 *
 * It is mounted once and kept alive (hidden) while another view is open, so its own
 * state survives; effects pause while hidden. Opponent visibility comes from usePrefs().
 */
import { useState } from 'react'
import type { TableSession } from '../../lib/useTableSession'
import { usePrefs } from '../../lib/prefsContext'
import { useLayoutKind } from '../../lib/breakpoints'
import { signedChips } from '../../lib/format'
import { actionText } from '../../lib/actionText'
import { Glass } from '../../ui/Glass'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { describeError } from '../../lib/apiError'
import { Sheet } from '../../ui/Sheet'
import { CoachGlance } from '../coach/CoachGlance'
import { MathsSheet } from '../coach/MathsSheet'
import { Table } from './Table'
import { MobileTable } from './MobileTable'
import { ActionBar } from './ActionBar'
import { ActionLog } from './ActionLog'

export interface TableViewProps {
  table: TableSession
  logOpen: boolean
  onLogOpenChange: (open: boolean) => void
}

const DOCK_ERRORS = ['boot', 'newGame', 'action', 'advance', 'nextHand'] as const

export function TableView({ table, logOpen, onLogOpenChange }: TableViewProps) {
  const { session, reads, coaching, coachStatus, errors } = table
  const { visibility } = usePrefs()
  const kind = useLayoutKind()
  const desk = kind === 'desk'
  const [mathsOpen, setMathsOpen] = useState(false)
  const scope = DOCK_ERRORS.find((s) => errors[s])
  const dockError = scope ? errors[scope] : undefined

  // the maths explains one decision: it closes when the coach leaves 'ready' (you acted)
  if (mathsOpen && coachStatus !== 'ready') setMathsOpen(false)

  const openMaths = () => {
    onLogOpenChange(false)
    setMathsOpen(true)
  }

  let dock
  if (dockError && scope) {
    // the server lost this session (a backend restart): only a new game recovers
    const lost = describeError(dockError, scope).needsNewGame
    dock = (
      <ErrorNotice
        error={dockError}
        context={scope}
        layout="row"
        onRetry={lost ? () => void table.newGame() : () => table.retry(scope)}
        retryLabel={lost ? 'New game' : 'Try again'}
        onDismiss={scope === 'boot' ? undefined : () => table.dismissError(scope)}
        className="py-2 pl-4 pr-2"
      />
    )
  } else if (!session) {
    dock = (
      <p role="status" className="px-6 py-3 text-callout font-medium text-fog">
        Dealing you in
      </p>
    )
  } else if (session.hand_over) {
    const net = session.last_result?.hero_net ?? 0
    dock = (
      <div className="flex items-center gap-3.5 py-2 pl-6 pr-2">
        <span className="text-headline font-strong">{net > 0 ? 'You won' : net < 0 ? 'You lost' : 'Hand over'}</span>
        {net !== 0 && <span className={`text-headline font-strong tabular-nums ${net > 0 ? 'text-win' : 'text-loss'}`}>{signedChips(net)}</span>}
        <Capsule variant="primary" size="lg" onClick={() => void table.nextHand()}>
          Next hand
        </Capsule>
      </div>
    )
  } else if (session.hero_to_act && session.state.legal_actions) {
    const hero = session.state.seats[session.hero_seat]
    dock = (
      <div className="w-[min(560px,calc(100vw-16px))] p-3">
        <ActionBar legal={session.state.legal_actions} pot={session.state.pot} heroBet={hero.bet} onAction={table.act} disabled={table.busy} />
      </div>
    )
  } else {
    const h = session.state.history
    const last = h.length ? h[h.length - 1] : null
    const who = last ? (last.seat === session.hero_seat ? 'You' : last.position) : null
    dock = (
      <p role="status" className="px-6 py-3 text-callout font-medium text-fog">
        {last ? `${who} ${actionText(last)}` : 'Dealing'}
      </p>
    )
  }

  const coach = (
    <CoachGlance
      coaching={coaching}
      status={coachStatus}
      error={errors.coach}
      layout={desk ? 'side' : 'row'}
      onAsk={table.askCoach}
      onRetry={() => table.retry('coach')}
      onDismissError={() => table.dismissError('coach')}
      onOpenMaths={openMaths}
      onHide={table.hideCoach}
      mathsOpen={mathsOpen}
    />
  )

  return (
    <main className="fixed inset-x-0 bottom-0 top-[var(--bar-h)] z-[1] flex flex-col">
      <h1 className="sr-only">Table</h1>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-8 px-4">
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          {session ? (
            desk ? (
              <Table session={session} mode={visibility} reads={reads} />
            ) : (
              <MobileTable session={session} mode={visibility} reads={reads} />
            )
          ) : null}
        </div>
        {desk && <div className="w-[380px] shrink-0">{coach}</div>}
      </div>
      {!desk && <div className="flex justify-center px-2 pb-2">{coach}</div>}
      <div className="flex justify-center px-2 pb-[calc(var(--sab)+64px)]">
        <Glass className="flex min-h-16 items-center">{dock}</Glass>
      </div>

      <Sheet open={logOpen && !!session} onClose={() => onLogOpenChange(false)} title="This hand" bottomInset={desk ? 16 : undefined}>
        {session && <ActionLog history={session.state.history} heroSeat={session.hero_seat} />}
      </Sheet>
      <MathsSheet
        coaching={coaching}
        open={mathsOpen && coachStatus === 'ready'}
        onClose={() => setMathsOpen(false)}
        bottomInset={desk ? 16 : undefined}
        positions={session?.state.seats.map((s) => s.position)}
      />
    </main>
  )
}
