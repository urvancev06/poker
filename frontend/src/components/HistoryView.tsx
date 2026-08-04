import { useEffect, useState } from 'react'
import { api, type HandReview, type HandSummary, type LeakSummary } from '../api'
import { Card } from './Card'

const LEAK_LABEL: Record<string, string> = {
  loose_open: 'Opened too loose',
  limp: 'Limped (raise-or-fold)',
  tight_fold: 'Folded too tight',
  call_no_odds: 'Called without odds',
  fold_with_odds: 'Folded with the odds',
  missed_value: 'Missed value',
}

// The study gates count leak flags over 500 hands. A page reload mints a new
// session, so scoping to the current session made that window unobservable —
// all-hands is the default and the session view is the opt-in.
const LEAK_WINDOWS = [200, 500, 1000] as const

export function HistoryView({ sessionId }: { sessionId?: string }) {
  const [hands, setHands] = useState<HandSummary[]>([])
  const [leaks, setLeaks] = useState<LeakSummary | null>(null)
  const [review, setReview] = useState<HandReview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [thisSession, setThisSession] = useState(false)
  const [window_, setWindow] = useState<number>(500)

  const scope = thisSession ? sessionId : undefined

  useEffect(() => {
    api.listHands(scope, 100).then(setHands).catch((e) => setErr((e as Error).message))
    setLeaks(null)
    api.leaks(scope, window_).then(setLeaks).catch(() => {})
  }, [scope, window_])

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[320px_1fr]">
      <div>
        <h2 className="font-display text-2xl text-ink">Hand history</h2>
        {err && <div className="text-loss">{err}</div>}

        <div className="my-4 flex flex-wrap items-center gap-2 text-[11px]">
          <div className="flex overflow-hidden rounded-lg border border-line">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setThisSession(v)}
                disabled={v && !sessionId}
                className={`px-2 py-1 ${thisSession === v ? 'bg-accent/20 text-ink' : 'text-muted'} disabled:opacity-40`}
              >
                {v ? 'This session' : 'All hands'}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {LEAK_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-2 py-1 tabular-nums ${window_ === w ? 'bg-accent/20 text-ink' : 'text-muted'}`}
              >
                last {w}
              </button>
            ))}
          </div>
        </div>

        {leaks && leaks.hands_reviewed > 0 && (
          <div className="my-4 rounded-xl border border-line bg-bg2/70 p-4">
            <h3 className="font-display text-base text-ink">Leak report</h3>
            <p className="mb-2 text-[11px] text-muted">
              {leaks.hands_reviewed} hands{thisSession ? ' · this session' : ' · all sessions'} · computed, candid
            </p>
            {leaks.by_type.length === 0 ? (
              <p className="text-sm text-win">No clear leaks flagged. Clean play.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {leaks.by_type.map((l) => (
                  <li key={l.type} className="flex justify-between">
                    <span className="text-muted">{LEAK_LABEL[l.type] ?? l.type}</span>
                    <span className="tabular-nums text-loss">{l.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {hands.map((h) => (
            <button
              key={h.id}
              onClick={() => api.handReview(h.id).then(setReview)}
              className="flex w-full items-center justify-between rounded-lg border border-line bg-bg2/50 px-3 py-2 text-left text-sm hover:border-muted"
            >
              <span className="text-muted">
                #{h.hand_index} · {h.hero_position} · {h.hero_cards}
              </span>
              <span className={`tabular-nums ${h.hero_net > 0 ? 'text-win' : h.hero_net < 0 ? 'text-loss' : 'text-muted'}`}>
                {h.hero_net > 0 ? '+' : ''}
                {h.hero_net}
              </span>
            </button>
          ))}
          {hands.length === 0 && <p className="text-sm text-muted">No hands yet — play some.</p>}
        </div>
      </div>

      <div>{review ? <Replay review={review} /> : <p className="text-muted">Select a hand to replay it with coaching.</p>}</div>
    </div>
  )
}

function Replay({ review }: { review: HandReview }) {
  return (
    <div className="rounded-2xl border border-line bg-bg2/60 p-5">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex gap-1">
          {review.hero_cards?.map((c, i) => <Card key={i} card={c} width={44} />)}
        </div>
        <div>
          <div className="text-sm text-muted">
            board: {review.board.join(' ') || '—'}
          </div>
          <div className={`font-bold tabular-nums ${review.hero_net > 0 ? 'text-win' : review.hero_net < 0 ? 'text-loss' : 'text-ink'}`}>
            {review.hero_net > 0 ? '+' : ''}
            {review.hero_net}
            {review.went_to_showdown && <span className="ml-2 text-[11px] uppercase text-muted">showdown</span>}
          </div>
        </div>
      </div>

      {review.streets.map((st) => (
        <div key={st.street} className="mb-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            {st.street} {st.board.length > 0 && `· ${st.board.join(' ')}`}
          </div>
          <div className="text-sm text-ink">
            {st.actions.map((a, i) => (
              <span key={i} className={a.is_hero ? 'text-accent' : 'text-muted'}>
                {a.position} {a.action}
                {a.to_amount ? ` ${a.to_amount}` : ''}
                {i < st.actions.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="mb-2 font-display text-base text-ink">Your decisions</h3>
        {review.decisions.map((d, i) => (
          <div key={i} className="mb-2 text-sm">
            <span className="text-muted">[{d.street}] </span>
            <span className="text-ink">
              {d.action}
              {d.to_amount ? ` ${d.to_amount}` : ''} · {d.hand_label}
            </span>
            {d.equity_pct != null && (
              <span className="text-muted tabular-nums">
                {' '}
                · {d.equity_pct}% eq{d.required_pct != null ? ` vs ${d.required_pct}% needed` : ''}
              </span>
            )}
            {d.leaks.map((l, j) => (
              <div key={j} className="mt-0.5 border-l-2 border-loss pl-2 text-loss">
                {l.note}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
