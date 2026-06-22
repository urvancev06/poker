import { useCallback, useEffect, useState } from 'react'
import { api, type ActionType, type Coaching, type SessionState } from './api'
import { CoachPanel } from './components/CoachPanel'
import { Table } from './components/Table'
import { ActionBar } from './components/ActionBar'
import type { VisibilityMode } from './components/Seat'

const MODES: Array<[VisibilityMode, string, string]> = [
  ['labeled', 'Labeled', 'archetype shown'],
  ['hud', 'HUD', 'stats after a sample'],
  ['live', 'Live', 'read it yourself'],
]

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [coaching, setCoaching] = useState<Coaching | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<VisibilityMode>('labeled')

  const newSession = useCallback(async () => {
    setError(null)
    setCoaching(null)
    try {
      setSession(await api.createSession())
    } catch (e) {
      setError(`Can't reach the backend — is it running on :8000? (${(e as Error).message})`)
    }
  }, [])

  useEffect(() => {
    void newSession()
  }, [newSession])

  const act = async (type: ActionType, toAmount?: number) => {
    if (!session) return
    setBusy(true)
    setCoaching(null)
    try {
      setSession(await api.submitAction(session.session_id, type, toAmount))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const nextHand = async () => {
    if (!session) return
    setCoaching(null)
    setSession(await api.nextHand(session.session_id))
  }

  const askCoach = async () => {
    if (!session) return
    setCoachLoading(true)
    try {
      setCoaching(await api.coach(session.session_id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCoachLoading(false)
    }
  }

  const heroNet = session?.last_result?.hero_net ?? 0
  const heroSeatData = session?.state.seats[session.hero_seat]

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-5">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/brand/urvancev-logo-white.svg" alt="" className="h-7 w-7 opacity-90" />
          <span className="font-display text-xl text-ink">Poker</span>
        </div>
        <div className="flex items-center gap-4">
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

      <div className="flex flex-1 flex-col gap-6 lg:flex-row">
        <main className="flex flex-1 flex-col">
          {session ? (
            <>
              <Table session={session} mode={mode} />

              <div className="mt-8 flex min-h-[72px] flex-col items-center justify-center gap-3">
                {session.hand_over ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-sm text-muted">
                      Hand over —{' '}
                      <span
                        className={`font-bold tabular-nums ${heroNet > 0 ? 'text-win' : heroNet < 0 ? 'text-loss' : 'text-ink'}`}
                      >
                        {heroNet > 0 ? '+' : ''}
                        {heroNet}
                      </span>{' '}
                      for you
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
                    <button
                      onClick={askCoach}
                      className="text-xs uppercase tracking-wider text-muted underline-offset-4 hover:text-accent hover:underline"
                    >
                      Ask the coach
                    </button>
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

        <CoachPanel coaching={coaching} loading={coachLoading} />
      </div>
    </div>
  )
}
