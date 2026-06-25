import type { Coaching } from '../api'

type Tone = 'loss' | 'accent' | 'close'
const verdictTone = (verdict: string): Tone => {
  const v = verdict.toLowerCase()
  if (v.startsWith('fold')) return 'loss'
  if (v.startsWith('close')) return 'close'
  return 'accent'
}
const toneText = (t: Tone) => (t === 'loss' ? 'text-loss' : t === 'close' ? 'text-muted' : 'text-accent')

/** A one-line coach summary for the phone layout (the full panel is desktop). */
export function CoachStrip({ coaching, loading }: { coaching: Coaching | null; loading: boolean }) {
  if (loading) return <div className="text-center text-xs text-muted">computing…</div>
  if (!coaching) return null
  const tone = verdictTone(coaching.verdict)
  // Money behind -> the decision turns on *realized* equity; river/all-in -> raw.
  const eq = coaching.action_closed ? coaching.equity_pct : coaching.realized_equity_pct
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-1.5 text-xs">
      <span className={`font-semibold uppercase tracking-wide ${toneText(tone)}`}>
        {coaching.verdict.replace(/\.$/, '')}
      </span>
      <span className="tabular-nums text-ink">{eq}% eq</span>
      {coaching.required_equity_pct != null && (
        <span className="tabular-nums text-faint">need {coaching.required_equity_pct}%</span>
      )}
      <span className="text-muted">{coaching.hand_label}</span>
    </div>
  )
}

/** Thin 2px equity track with a required-equity tick (DESIGN.md: thin bars, no radius).
 * The fill is realized equity; a faint hollow tick marks raw equity when they differ. */
function EquityBar({ equity, required, raw }: { equity: number; required: number | null; raw?: number }) {
  return (
    <div className="relative mt-2 h-0.5 w-full bg-hair">
      <div className="h-full bg-accent" style={{ width: `${Math.min(100, equity)}%` }} />
      {raw != null && Math.abs(raw - equity) >= 1 && (
        <div
          className="absolute -top-0.5 h-[6px] w-px bg-accent/40"
          style={{ left: `calc(${Math.min(100, raw)}% - 0.5px)` }}
          title={`raw ${raw}%`}
        />
      )}
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
          {/* the live figure — realized equity drives the call when money's behind;
              on the river / all-in raw equity is fully realized, so show that. */}
          {(() => {
            const closed = coaching.action_closed
            const headline = closed ? coaching.equity_pct : coaching.realized_equity_pct
            const discounted = !closed && Math.abs(coaching.realized_equity_pct - coaching.equity_pct) >= 1
            return (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-faint">
                    {closed ? 'Equity' : 'Realized equity'}
                  </span>
                  <span className="text-sm text-muted">{coaching.hand_label}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[40px] font-light leading-none text-accent tabular-nums">
                    {headline}
                  </span>
                  <span className="font-mono text-lg font-light text-faint">%</span>
                </div>
                <EquityBar
                  equity={headline}
                  required={coaching.required_equity_pct}
                  raw={discounted ? coaching.equity_pct : undefined}
                />
                <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-faint tabular-nums">
                  <span>win {coaching.win_pct} · tie {coaching.tie_pct}</span>
                  {coaching.required_equity_pct != null && <span>need {coaching.required_equity_pct}%</span>}
                </div>
                {discounted && (
                  <p className="mt-1.5 text-[10px] normal-case leading-snug text-faint">
                    {coaching.equity_pct}% raw, realizing ~{coaching.realization_pct}%{' '}
                    {coaching.in_position ? 'in position' : 'out of position'}
                    {coaching.players_behind > 0 && ` · ${coaching.players_behind} still to act behind`}
                  </p>
                )}
              </div>
            )
          })()}

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
                  : tone === 'close'
                    ? 'border-line bg-bg2 text-muted'
                    : 'border-accent/50 bg-accent-soft text-accent'
              }`}
            >
              {coaching.verdict.replace(/\.$/, '')}
            </span>
            <p className="mt-2 text-sm text-muted">{coaching.rationale}</p>
          </div>

          {coaching.villains.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-faint">the read · their range</div>
              <div className="mt-1 space-y-1.5 text-xs text-muted">
                {coaching.villains.map((v) => (
                  <div key={v.seat}>
                    <div className="leading-snug">{v.description}</div>
                    {v.bluff_pct > 0 && (
                      <div className="text-[10px] tabular-nums text-faint">
                        ~{v.bluff_pct}% of this betting range is air (the bluff-catch threshold)
                      </div>
                    )}
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
