import { useEffect, useState } from 'react'
import { api, type HeroStatLine, type MyStats } from '../api'

// Stat rows, with the sample size at which each becomes worth reading. Below its
// threshold a stat is shown greyed and unjudged rather than coloured pass/fail:
// VPIP at 30 hands has a 95% CI of +/-15 points, which is wider than its whole band.
// (The banner used to vanish at 100 hands while its own text demanded 500-1000+,
// and every row was coloured from hand one — audit F-50.)
const ROWS: Array<{ key: keyof HeroStatLine; label: string; stable: number; note: string }> = [
  { key: 'vpip', label: 'VPIP', stable: 500, note: 'stabilises ~500 hands' },
  { key: 'pfr', label: 'PFR', stable: 500, note: 'stabilises ~500 hands' },
  { key: 'threebet', label: '3-BET', stable: 3000, note: 'measured per opportunity (~0.42/hand) — needs ~3,000 hands' },
  { key: 'ats', label: 'ATS', stable: 2000, note: 'steal spots are ~15% of hands' },
  { key: 'af', label: 'AF', stable: 2000, note: 'postflop only — slow to settle' },
  { key: 'wtsd', label: 'WTSD', stable: 2000, note: 'measured per flop seen, not per hand' },
  { key: 'wsd', label: 'W$SD', stable: 3000, note: 'showdowns are a fraction of flops' },
  { key: 'wwsf', label: 'WWSF', stable: 2000, note: 'measured per flop seen' },
  { key: 'cbet', label: 'C-BET', stable: 2000, note: 'measured per c-bet opportunity — board-dependent' },
]

// Gate 3 is stated over 2,000+ hands. Lifetime-only made that window impossible to
// isolate — early learning hands drag the average forever (audit F-37).
const WINDOWS: Array<{ label: string; last?: number }> = [
  { label: 'Lifetime' },
  { label: 'Last 500', last: 500 },
  { label: 'Last 2000', last: 2000 },
  { label: 'Last 5000', last: 5000 },
]

function inBand(v: number | null, b?: [number, number]): boolean | null {
  if (v == null || !b) return null
  return v >= b[0] && v <= b[1]
}

export function StatsView() {
  const [stats, setStats] = useState<MyStats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [win, setWin] = useState(0)

  useEffect(() => {
    setStats(null)
    api
      .myStats(undefined, WINDOWS[win].last)
      .then(setStats)
      .catch((e) => setErr((e as Error).message))
  }, [win])

  if (err) return <div className="text-loss">{err}</div>
  if (!stats) return <div className="text-muted">loading your stats…</div>

  const o = stats.overall
  const net = o.net_bb_per_100
  const n = o.hands

  return (
    <div className="mx-auto max-w-4xl pb-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Your profile</div>
        <div className="flex overflow-hidden rounded-lg border border-line text-[11px]">
          {WINDOWS.map((w, i) => (
            <button
              key={w.label}
              onClick={() => setWin(i)}
              className={`px-2 py-1 ${win === i ? 'bg-accent/20 text-ink' : 'text-muted'}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {n === 0 ? (
        <h2 className="font-display text-3xl font-semibold -tracking-[0.02em] text-ink">
          No hands yet — play a session to build your profile.
        </h2>
      ) : (
        <h2 className="font-display text-3xl font-semibold -tracking-[0.02em] text-ink">
          Over <span className="tabular-nums">{n.toLocaleString()}</span> hands you’re running{' '}
          <span className={`tabular-nums ${net >= 0 ? 'text-accent' : 'text-loss'}`}>
            {net >= 0 ? '+' : ''}
            {net} bb/100
          </span>
          .
        </h2>
      )}

      {n > 0 && (
        <p className="mt-2 text-[11px] text-faint">
          bb/100 is the noisiest number here — it needs tens of thousands of hands before it
          means much. Judge the decisions, not this.
        </p>
      )}

      {stats.decision_time && stats.decision_time.n > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline gap-2 text-sm">
          <span className="text-muted">Median decision time</span>
          <span className="tabular-nums text-ink">{stats.decision_time.median_s}s</span>
          <span className="text-[11px] text-faint">
            over {stats.decision_time.n} decisions · wall clock, so it counts interruptions too
          </span>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-[11px] uppercase tracking-[0.14em] text-faint">Stats</div>
          <div className="text-[10px] text-faint">band ▮ · your value ●</div>
        </div>
        <div className="divide-y divide-hair">
          {ROWS.map((row) => (
            <StatRow
              key={row.key}
              row={row}
              value={o[row.key] as number | null}
              band={stats.targets[row.key]}
              hands={n}
            />
          ))}
        </div>
      </div>

      {stats.trend.length > 1 && (
        <div className="mt-10">
          <div className="mb-1 flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-[0.14em] text-faint">Trend</div>
            <div className="text-[10px] text-faint">
              {stats.trend.length} buckets of ~{Math.floor(n / stats.trend.length).toLocaleString()}{' '}
              hands
            </div>
          </div>
          <Trend trend={stats.trend} targets={stats.targets} />
        </div>
      )}
    </div>
  )
}

/** One stat, with its band drawn as an interval and the value placed on it.
 *
 * This replaces a radar chart. A radar plots "further from centre = more", which
 * cannot express "inside an interval is good": four of its five axes read backwards,
 * so a VPIP of 40 sat outside the target polygon and looked like a strength while the
 * row beneath it was red. It also drew the target at the band MIDPOINT, a number the
 * API never returns (audit F-38). An interval is the honest shape for a band. */
function StatRow({
  row,
  value,
  band,
  hands,
}: {
  row: { key: keyof HeroStatLine; label: string; stable: number; note: string }
  value: number | null
  band?: [number, number]
  hands: number
}) {
  const enough = hands >= row.stable
  const ok = enough ? inBand(value, band) : null
  // Scale the track so the band occupies the middle half — enough room to show
  // being outside it without the marker leaving the rail.
  const lo = band ? band[0] : 0
  const hi = band ? band[1] : 100
  const span = Math.max(hi - lo, 1)
  const min = lo - span
  const max = hi + span
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="w-16 shrink-0">
        <div className="text-[11px] uppercase tracking-[0.12em] text-faint">{row.label}</div>
      </div>

      <div className="relative h-1.5 flex-1 rounded-full bg-bg2">
        {band && (
          <div
            className={`absolute h-full rounded-full ${enough ? 'bg-accent/25' : 'bg-line'}`}
            style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }}
          />
        )}
        {value != null && (
          <div
            className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              ok === null ? 'bg-muted' : ok ? 'bg-accent' : 'bg-loss'
            }`}
            style={{ left: `${pos(value)}%` }}
            title={`${value}`}
          />
        )}
      </div>

      <div className="flex w-32 shrink-0 items-baseline justify-end gap-2">
        <span className="text-[10px] uppercase tracking-wider text-faint tabular-nums">
          {band ? `${band[0]}–${band[1]}` : ''}
        </span>
        <span
          className={`w-12 text-right text-xl font-medium tabular-nums ${
            ok === null ? 'text-muted' : ok ? 'text-accent' : 'text-loss'
          }`}
          title={enough ? undefined : `Too few hands to read — ${row.note}`}
        >
          {value == null ? '—' : value}
        </span>
      </div>
    </div>
  )
}

/** Trend on a FIXED per-stat scale with the target band drawn behind the bars.
 *
 * Each row used to be rescaled by its own maximum, so every row's peak was full
 * height and nothing was comparable to anything — including to its own band, which
 * was not drawn at all (audit F-51). */
function Trend({
  trend,
  targets,
}: {
  trend: HeroStatLine[]
  targets: Record<string, [number, number]>
}) {
  const keys: Array<[keyof HeroStatLine, string, number]> = [
    ['vpip', 'VPIP', 50],
    ['pfr', 'PFR', 40],
    ['af', 'AF', 6],
    ['wtsd', 'WTSD', 50],
  ]
  return (
    <div className="space-y-2.5">
      {keys.map(([k, label, scaleMax]) => {
        const band = targets[k]
        const pct = (v: number) => Math.max(0, Math.min(100, (v / scaleMax) * 100))
        return (
          <div key={k} className="flex items-center gap-3">
            <div className="w-12 text-[10px] uppercase tracking-wider text-faint">{label}</div>
            <div className="relative h-7 flex-1">
              {band && (
                <div
                  className="absolute inset-x-0 bg-accent/12"
                  style={{ bottom: `${pct(band[0])}%`, height: `${pct(band[1]) - pct(band[0])}%` }}
                />
              )}
              <div className="absolute inset-0 flex items-end gap-1">
                {trend.map((t, i) => {
                  const v = (t[k] as number | null) ?? 0
                  const good = band ? v >= band[0] && v <= band[1] : true
                  return (
                    <div
                      key={i}
                      className={good ? 'flex-1 bg-accent/60' : 'flex-1 bg-loss/50'}
                      style={{ height: `${pct(v)}%` }}
                      title={`${v}`}
                    />
                  )
                })}
              </div>
            </div>
            <div className="w-8 text-right text-[10px] text-faint tabular-nums">{scaleMax}</div>
          </div>
        )
      })}
    </div>
  )
}
