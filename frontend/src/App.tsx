import { useCallback, useEffect, useState } from 'react'
import { api, type ActionType, type Coaching, type Reads, type SessionState } from './api'
import { CoachPanel, CoachStrip } from './components/CoachPanel'
import { Table } from './components/Table'
import { MobileTable } from './components/MobileTable'
import { ActionBar } from './components/ActionBar'
import { StatsView } from './components/StatsView'
import { HistoryView } from './components/HistoryView'
import { LabView } from './components/LabView'
import { StudyView } from './components/StudyView'
import { ActionLog, actionText } from './components/ActionLog'
import { PreferencesView } from './components/PreferencesView'
import type { VisibilityMode } from './components/Seat'

// Pause between bot actions when watching a hand unfold (ms).
const STEP_MS = 650

const MODES: Array<[VisibilityMode, string, string]> = [
  ['labeled', 'Labeled', 'archetype shown'],
  ['hud', 'HUD', 'stats after a sample'],
  ['live', 'Live', 'read it yourself'],
]
type View = 'table' | 'study' | 'stats' | 'history' | 'lab' | 'prefs'

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
  const [showLog, setShowLog] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <img src="/brand/urvancev-logo-white.svg" alt="" className="h-7 w-7 opacity-90" />
            <span className="font-display text-xl -tracking-[0.02em] text-ink">Poker</span>
          </div>
          <nav className="flex max-w-full gap-1 overflow-x-auto text-xs lowercase tracking-wide">
            {(['table', 'study', 'stats', 'history', 'lab'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`shrink-0 rounded-md px-3 py-1.5 transition ${
                  view === v ? 'bg-bg2 text-ink ring-1 ring-inset ring-line' : 'text-muted hover:text-ink'
                }`}
              >
                {v === 'stats' ? 'my stats' : v}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {/* desktop controls */}
          <div className="hidden items-center gap-3 lg:flex">
            {view === 'table' && (
              <>
                <button
                  onClick={() => setStudy((s) => !s)}
                  title="Coach shows live advice on your turn; Play hides it until review"
                  className={`rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition ${
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
                      className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition ${
                        mode === m ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowLog((s) => !s)}
                  title="Show the action log (who folded/called/raised)"
                  className={`rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition ${
                    showLog ? 'bg-accent text-accent-ink' : 'border border-line text-muted hover:text-ink'
                  }`}
                >
                  Log
                </button>
              </>
            )}
            <button
              onClick={() => setView('prefs')}
              title="Preferences — deck & felt"
              className="rounded-lg border border-line px-3 py-1.5 text-sm leading-none text-muted hover:text-ink"
            >
              ⚙
            </button>
            <button
              onClick={newSession}
              className="rounded-lg border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted hover:text-ink"
            >
              New game
            </button>
          </div>

          {/* phone menu */}
          <div className="relative lg:hidden">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
              className="rounded-lg border border-line px-3 py-1.5 text-lg leading-none text-muted hover:text-ink"
            >
              ☰
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="fixed right-3 top-16 z-50 w-56 rounded-xl border border-line bg-bg p-2 shadow-2xl">
                  {view === 'table' && (
                    <>
                      <button
                        onClick={() => setStudy((s) => !s)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm text-ink hover:bg-bg2"
                      >
                        <span>Live coach</span>
                        <span className={study ? 'text-accent' : 'text-muted'}>{study ? 'on' : 'off'}</span>
                      </button>
                      <div className="px-2 py-1.5">
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Opponents</div>
                        <div className="flex overflow-hidden rounded-lg border border-line">
                          {MODES.map(([m, label]) => (
                            <button
                              key={m}
                              onClick={() => setMode(m)}
                              className={`flex-1 px-2 py-1.5 font-mono text-xs uppercase tracking-wide ${
                                mode === m ? 'bg-accent text-accent-ink' : 'text-muted'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowLog((s) => !s)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm text-ink hover:bg-bg2"
                      >
                        <span>Action log</span>
                        <span className={showLog ? 'text-accent' : 'text-muted'}>{showLog ? 'on' : 'off'}</span>
                      </button>
                      <div className="my-1 border-t border-line" />
                    </>
                  )}
                  <button
                    onClick={() => { setView('prefs'); setMenuOpen(false) }}
                    className="block w-full rounded-md px-2 py-2 text-left text-sm text-ink hover:bg-bg2"
                  >
                    Preferences · deck &amp; felt
                  </button>
                  <button
                    onClick={() => { void newSession(); setMenuOpen(false) }}
                    className="block w-full rounded-md px-2 py-2 text-left text-sm text-accent hover:bg-bg2"
                  >
                    New game
                  </button>
                </div>
              </>
            )}
          </div>
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
          {view === 'prefs' && <PreferencesView />}
        </div>
      )}

      {view === 'table' && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          {/* left spacer balances the right panel so the table stays centred (desktop only) */}
          <div className="hidden w-80 shrink-0 lg:block" />
          <main className="flex min-h-0 flex-1 flex-col">
            {session ? (
              <>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  {/* desktop oval */}
                  <div className="hidden h-full w-full items-center justify-center lg:flex">
                    <Table session={session} mode={mode} reads={reads} />
                  </div>
                  {/* phone portrait */}
                  <div className="flex h-full w-full lg:hidden">
                    <MobileTable session={session} mode={mode} reads={reads} />
                  </div>
                </div>

                {/* compact coach line on phones (full panel is the desktop aside) */}
                {(study || coaching || coachLoading) && (
                  <div className="mt-2 shrink-0 lg:hidden">
                    <CoachStrip coaching={coaching} loading={coachLoading} />
                  </div>
                )}

                <div className="mt-3 flex h-[128px] shrink-0 flex-col items-center justify-center gap-3 overflow-y-auto">
                  {session.hand_over ? (
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className={`animate-rise flex items-center gap-2.5 rounded-xl px-6 py-2.5 text-lg font-bold uppercase tracking-wide ring-1 ${
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
                          onClick={() =>
                            coaching || coachLoading
                              ? setCoaching(null)
                              : askCoach(session.session_id)
                          }
                          className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint underline-offset-4 hover:text-accent hover:underline"
                        >
                          {coaching || coachLoading ? 'hide coach ✕' : 'ask the coach →'}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="font-mono text-xs uppercase tracking-[0.12em] text-faint">
                      {(() => {
                        const h = session.state.history
                        const last = h && h.length ? h[h.length - 1] : null
                        if (!last) return 'dealing…'
                        const who = last.seat === session.hero_seat ? 'You' : last.position
                        return `${who} ${actionText(last)}…`
                      })()}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-muted">Dealing you in…</div>
            )}
          </main>

          {/* desktop side panel — always reserved (balanced by the left spacer) so the
              table stays centred and the same size whether or not the coach/log shows */}
          <aside className="hidden min-h-0 w-80 shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden lg:flex">
            {(study || coaching || coachLoading) && (
              <CoachPanel coaching={coaching} loading={coachLoading} />
            )}
            {showLog && session && (
              <ActionLog history={session.state.history} heroSeat={session.hero_seat} />
            )}
          </aside>

          {/* phone: action log as a dismissible bottom sheet */}
          {showLog && session && (
            <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden">
              <div className="mx-auto max-w-md rounded-2xl border border-line bg-bg p-3 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-wider text-muted">Action log</span>
                  <button
                    onClick={() => setShowLog(false)}
                    className="text-lg leading-none text-muted hover:text-ink"
                  >
                    ×
                  </button>
                </div>
                <ActionLog history={session.state.history} heroSeat={session.hero_seat} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
