import { useCallback, useEffect, useState } from 'react'
import { api, type ActionType, type Coaching, type Reads, type SessionState } from './api'
import { CoachPanel } from './components/CoachPanel'
import { Table } from './components/Table'
import { ActionBar } from './components/ActionBar'
import { StatsView } from './components/StatsView'
import { HistoryView } from './components/HistoryView'
import { LabView } from './components/LabView'
import { StudyView } from './components/StudyView'
import { ActionLog } from './components/ActionLog'
import { StylePreview, applyTypeStyle, loadTypeStyle, type TypeStyle } from './components/StylePreview'
import type { VisibilityMode } from './components/Seat'

// Pause between bot actions when watching a hand unfold (ms).
const STEP_MS = 650

const MODES: Array<[VisibilityMode, string, string]> = [
  ['labeled', 'Labeled', 'archetype shown'],
  ['hud', 'HUD', 'stats after a sample'],
  ['live', 'Live', 'read it yourself'],
]
type View = 'table' | 'study' | 'stats' | 'history' | 'lab' | 'type'

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [reads, setReads] = useState<Reads>()
  const [coaching, setCoaching] = useState<Coaching | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<VisibilityMode>('labeled')
  const [view, setView] = useState<View>('table')
  const [study, setStudy] = useState(false)
  const [typeStyle, setTypeStyle] = useState<TypeStyle>(loadTypeStyle())

  useEffect(() => {
    applyTypeStyle(typeStyle)
  }, [typeStyle])

  const refreshReads = useCallback((s: SessionState) => {
    api.reads(s.session_id).then(setReads).catch(() => {})
  }, [])

  const newSession = useCallback(async () => {
    setError(null)
    setCoaching(null)
    try {
      // Step mode: bots don't pre-act, so we can watch the whole hand unfold.
      const s = await api.createSession({ auto_advance: false })
      setSession(s)
      refreshReads(s)
    } catch (e) {
      setError(`Can't reach the backend — is it running on :8000? (${(e as Error).message})`)
    }
  }, [refreshReads])

  useEffect(() => {
    void newSession()
  }, [newSession])

  // Watch-the-hand: while a bot is to act, step one action after a short pause.
  // The effect re-runs on each new session, naturally pacing the whole street.
  useEffect(() => {
    if (!session || session.hand_over || session.hero_to_act) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const s = await api.advance(session.session_id)
        if (!cancelled) {
          setSession(s)
          if (s.hand_over) refreshReads(s)
        }
      } catch {
        /* a transient error just stops the auto-step; the user can act/retry */
      }
    }, STEP_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [session, refreshReads])

  const askCoach = useCallback(async (id: string) => {
    setCoachLoading(true)
    try {
      setCoaching(await api.coach(id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCoachLoading(false)
    }
  }, [])

  // Study Mode: surface the coach automatically on the hero's turn.
  useEffect(() => {
    if (!session) return
    if (study && session.hero_to_act) void askCoach(session.session_id)
    if (!study) setCoaching(null)
  }, [study, session, askCoach])

  const act = async (type: ActionType, toAmount?: number) => {
    if (!session) return
    setBusy(true)
    setCoaching(null)
    try {
      const s = await api.submitAction(session.session_id, type, toAmount)
      setSession(s)
      refreshReads(s)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const nextHand = async () => {
    if (!session) return
    setCoaching(null)
    const s = await api.nextHand(session.session_id)
    setSession(s)
    refreshReads(s)
  }

  const heroNet = session?.last_result?.hero_net ?? 0
  const heroSeatData = session?.state.seats[session.hero_seat]

  return (
    <div className="mx-auto flex h-[100dvh] max-w-7xl flex-col overflow-hidden px-6 py-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <img src="/brand/urvancev-logo-white.svg" alt="" className="h-7 w-7 opacity-90" />
            <span className="font-display text-xl text-ink">Poker</span>
          </div>
          <nav className="flex gap-1 text-xs uppercase tracking-wide">
            {(['table', 'study', 'stats', 'history', 'lab'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 transition ${
                  view === v ? 'bg-bg2 text-ink ring-1 ring-line' : 'text-muted hover:text-ink'
                }`}
              >
                {v === 'stats' ? 'My stats' : v}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {view === 'table' && (
            <>
              <button
                onClick={() => setStudy((s) => !s)}
                title="Coach shows live advice on your turn; Play hides it until review"
                className={`rounded-lg px-3 py-1.5 text-xs uppercase tracking-wide transition ${
                  study ? 'bg-accent text-accent-ink' : 'border border-line text-muted hover:text-ink'
                }`}
              >
                {study ? 'Coach' : 'Play'}
              </button>
              <div className="flex overflow-hidden rounded-lg border border-line">
                {MODES.map(([m, label, hint]) => (
                  <button
                    key={m}
                    title={hint}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-xs uppercase tracking-wide transition ${
                      mode === m ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => setView('type')}
            title="Type & feel — compare heading styles"
            className="rounded-lg border border-line px-3 py-1.5 font-display text-sm leading-none text-muted hover:text-ink"
          >
            Aa
          </button>
          <button
            onClick={newSession}
            className="rounded-lg border border-line px-3 py-1.5 text-xs uppercase tracking-wide text-muted hover:text-ink"
          >
            New game
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-loss/50 bg-loss/10 px-4 py-2 text-sm text-loss">
          {error}
        </div>
      )}

      {view !== 'table' && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {view === 'study' && <StudyView />}
          {view === 'stats' && <StatsView />}
          {view === 'history' && <HistoryView sessionId={session?.session_id} />}
          {view === 'lab' && <LabView />}
          {view === 'type' && <StylePreview active={typeStyle} onApply={setTypeStyle} />}
        </div>
      )}

      {view === 'table' && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <main className="flex min-h-0 flex-1 flex-col">
            {session ? (
              <>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <Table session={session} mode={mode} reads={reads} />
                </div>

                <div className="mt-3 flex min-h-[72px] flex-col items-center justify-center gap-3">
                  {session.hand_over ? (
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className={`flex items-center gap-2.5 rounded-xl px-6 py-2.5 text-lg font-bold uppercase tracking-wide ring-1 ${
                          heroNet > 0
                            ? 'bg-win/15 text-win ring-win/40'
                            : heroNet < 0
                              ? 'bg-loss/15 text-loss ring-loss/40'
                              : 'bg-bg2 text-ink ring-line'
                        }`}
                      >
                        <span>{heroNet > 0 ? 'You won' : heroNet < 0 ? 'You lost' : 'Chop'}</span>
                        <span className="tabular-nums">
                          {heroNet > 0 ? '+' : ''}
                          {heroNet}
                        </span>
                      </div>
                      <button
                        onClick={nextHand}
                        className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-accent-ink hover:brightness-110"
                      >
                        Next hand
                      </button>
                    </div>
                  ) : session.hero_to_act && session.state.legal_actions && heroSeatData ? (
                    <>
                      <ActionBar
                        legal={session.state.legal_actions}
                        pot={session.state.pot}
                        heroBet={heroSeatData.bet}
                        onAction={act}
                        disabled={busy}
                      />
                      {!study && (
                        <button
                          onClick={() => askCoach(session.session_id)}
                          className="text-xs uppercase tracking-wider text-muted underline-offset-4 hover:text-accent hover:underline"
                        >
                          Ask the coach
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-muted">bots acting…</div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-muted">Dealing you in…</div>
            )}
          </main>

          <aside className="flex min-h-0 w-full flex-col gap-4 lg:w-72">
            {(study || coaching || coachLoading) && (
              <CoachPanel coaching={coaching} loading={coachLoading} />
            )}
            {session && (
              <div className="min-h-0 flex-1">
                <ActionLog history={session.state.history} heroSeat={session.hero_seat} />
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
