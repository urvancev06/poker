import type { Coaching } from '../api'

/** A one-line coach summary for the phone layout (the full panel is desktop). */
export function CoachStrip({ coaching, loading }: { coaching: Coaching | null; loading: boolean }) {
  if (loading) return <div className="text-center text-xs text-muted">computing…</div>
  if (!coaching) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-line bg-bg2/80 px-3 py-1.5 text-xs">
      <span className="font-bold text-ink">{coaching.verdict}</span>
      <span className="tabular-nums text-accent">{coaching.equity_pct}% eq</span>
      {coaching.required_equity_pct != null && (
        <span className="tabular-nums text-muted">need {coaching.required_equity_pct}%</span>
      )}
      <span className="text-muted">{coaching.hand_label}</span>
    </div>
  )
}

function EquityBar({ equity, required }: { equity: number; required: number | null }) {
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-line">
      <div className="h-full rounded-full bg-accent" style={{ width: `${equity}%` }} />
      {required != null && (
        <div
          className="absolute top-[-3px] h-[18px] w-[2px] bg-ink"
          style={{ left: `calc(${required}% - 1px)` }}
          title={`required equity ${required}%`}
        />
      )}
    </div>
  )
}

export function CoachPanel({
  coaching,
  loading,
}: {
  coaching: Coaching | null
  loading: boolean
}) {
  return (
    <aside className="w-full rounded-2xl border border-line bg-bg2/80 p-5">
      <h2 className="font-display text-lg text-ink">Coach</h2>
      <p className="mb-4 text-[11px] uppercase tracking-wider text-muted">computed, not solved</p>

      {loading && <p className="text-sm text-muted">computing equity…</p>}

      {!loading && !coaching && (
        <p className="text-sm text-muted">Your turn? Hit “Ask the coach”.</p>
      )}

      {!loading && coaching && (
        <div className="space-y-4">
          <div>
            <div className="font-display text-base text-ink">{coaching.hand_label}</div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>equity</span>
              <span className="tabular-nums text-accent">{coaching.equity_pct}%</span>
            </div>
            <EquityBar equity={coaching.equity_pct} required={coaching.required_equity_pct} />
            <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums">
              <span>win {coaching.win_pct}% · tie {coaching.tie_pct}%</span>
              {coaching.required_equity_pct != null && (
                <span>need {coaching.required_equity_pct}%</span>
              )}
            </div>
          </div>

          {coaching.to_call > 0 && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Readout label="to call" value={String(coaching.to_call)} />
              <Readout label="pot odds" value={coaching.pot_odds ?? '—'} />
              <Readout label="required" value={`${coaching.required_equity_pct}%`} />
              <Readout
                label="call EV"
                value={coaching.call_ev == null ? '—' : `${coaching.call_ev > 0 ? '+' : ''}${coaching.call_ev}`}
                tone={coaching.call_ev != null ? (coaching.call_ev >= 0 ? 'win' : 'loss') : undefined}
              />
            </div>
          )}

          <div className="border-l-2 border-accent pl-3">
            <div className="font-bold text-ink">{coaching.verdict}</div>
            <div className="text-sm text-muted">{coaching.rationale}</div>
          </div>

          {coaching.villains.length > 0 && (
            <div className="text-[11px] text-muted">
              <div className="uppercase tracking-wider">vs modelled ranges</div>
              {coaching.villains.map((v) => (
                <div key={v.seat} className="tabular-nums">
                  seat {v.seat}: top {v.range_pct}% ({v.combos} combos)
                </div>
              ))}
            </div>
          )}

          <details className="text-[11px] text-muted/80">
            <summary className="cursor-pointer">basis</summary>
            <ul className="mt-1 list-disc pl-4">
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

function Readout({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'win' | 'loss'
}) {
  return (
    <div className="rounded-lg bg-black/25 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div
        className={`tabular-nums font-bold ${tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : 'text-ink'}`}
      >
        {value}
      </div>
    </div>
  )
}
