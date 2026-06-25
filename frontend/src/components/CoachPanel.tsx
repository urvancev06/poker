import type { Coaching } from '../api'

const verdictTone = (verdict: string) =>
  verdict.toLowerCase().startsWith('fold') ? 'loss' : 'accent'

/** A one-line coach summary for the phone layout (the full panel is desktop). */
export function CoachStrip({ coaching, loading }: { coaching: Coaching | null; loading: boolean }) {
  if (loading) return <div className="text-center text-xs text-muted">computing…</div>
  if (!coaching) return null
  const tone = verdictTone(coaching.verdict)
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-1.5 text-xs">
      <span className={`font-semibold uppercase tracking-wide ${tone === 'loss' ? 'text-loss' : 'text-accent'}`}>
        {coaching.verdict.replace(/\.$/, '')}
      </span>
      <span className="tabular-nums text-ink">{coaching.equity_pct}% eq</span>
      {coaching.required_equity_pct != null && (
        <span className="tabular-nums text-faint">need {coaching.required_equity_pct}%</span>
      )}
      <span className="text-muted">{coaching.hand_label}</span>
    </div>
  )
}

/** Thin 2px equity track with a required-equity tick (DESIGN.md: thin bars, no radius). */
function EquityBar({ equity, required }: { equity: number; required: number | null }) {
  return (
    <div className="relative mt-2 h-0.5 w-full bg-hair">
      <div className="h-full bg-accent" style={{ width: `${Math.min(100, equity)}%` }} />
      {required != null && (
        <div
          className="absolute -top-1 h-[10px] w-px bg-faint"
          style={{ left: `calc(${Math.min(100, required)}% - 0.5px)` }}
          title={`required ${required}%`}
        />
      )}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'win' | 'loss' }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-faint">{label}</span>
      <span
        className={`text-sm font-medium tabular-nums ${
          tone === 'win' ? 'text-accent' : tone === 'loss' ? 'text-loss' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

export function CoachPanel({ coaching, loading }: { coaching: Coaching | null; loading: boolean }) {
  const tone = coaching ? verdictTone(coaching.verdict) : 'accent'
  return (
    <aside className="w-full rounded-lg border border-line p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.16em] text-faint">Coach</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-faint">computed · not solved</span>
      </div>

      {loading && <p className="mt-4 text-sm text-muted">computing equity…</p>}
      {!loading && !coaching && (
        <p className="mt-4 text-sm text-muted">Your turn? Hit “Ask the coach”.</p>
      )}

      {!loading && coaching && (
        <div className="mt-4 space-y-5">
          {/* the live figure */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[0.14em] text-faint">Equity</span>
              <span className="text-sm text-muted">{coaching.hand_label}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-[40px] font-light leading-none text-accent tabular-nums">
                {coaching.equity_pct}
              </span>
              <span className="font-mono text-lg font-light text-faint">%</span>
            </div>
            <EquityBar equity={coaching.equity_pct} required={coaching.required_equity_pct} />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-faint tabular-nums">
              <span>win {coaching.win_pct} · tie {coaching.tie_pct}</span>
              {coaching.required_equity_pct != null && <span>need {coaching.required_equity_pct}%</span>}
            </div>
          </div>

          {/* price readout */}
          {coaching.to_call > 0 && (
            <div className="divide-y divide-hair border-y border-hair">
              <Row label="To call" value={String(coaching.to_call)} />
              <Row label="Pot odds" value={coaching.pot_odds ?? '—'} />
              <Row label="Required" value={`${coaching.required_equity_pct}%`} />
              <Row
                label="Call EV"
                value={coaching.call_ev == null ? '—' : `${coaching.call_ev > 0 ? '+' : ''}${coaching.call_ev}`}
                tone={coaching.call_ev != null ? (coaching.call_ev >= 0 ? 'win' : 'loss') : undefined}
              />
            </div>
          )}

          {/* verdict as a band pill + rationale */}
          <div>
            <span
              className={`inline-block rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${
                tone === 'loss'
                  ? 'border-loss/50 bg-loss/10 text-loss'
                  : 'border-accent/50 bg-accent-soft text-accent'
              }`}
            >
              {coaching.verdict.replace(/\.$/, '')}
            </span>
            <p className="mt-2 text-sm text-muted">{coaching.rationale}</p>
          </div>

          {coaching.villains.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-faint">vs modelled ranges</div>
              <div className="mt-1 space-y-0.5 text-xs text-muted tabular-nums">
                {coaching.villains.map((v) => (
                  <div key={v.seat} className="flex justify-between">
                    <span>seat {v.seat}</span>
                    <span>top {v.range_pct}% · {v.combos} combos</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <details className="text-[11px] text-faint">
            <summary className="cursor-pointer uppercase tracking-[0.12em]">basis</summary>
            <ul className="mt-1 list-disc pl-4 normal-case">
              {coaching.basis.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </aside>
  )
}
