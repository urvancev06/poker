import { useEffect, useState } from 'react'
import { api, type HeroStatLine, type MyStats } from '../api'

// The five core stats, with a per-axis max so the healthy target lands mid-radar.
const AXES: Array<{ key: keyof HeroStatLine; label: string; max: number }> = [
  { key: 'vpip', label: 'VPIP', max: 50 },
  { key: 'pfr', label: 'PFR', max: 40 },
  { key: 'threebet', label: '3-BET', max: 20 },
  { key: 'af', label: 'AF', max: 6 },
  { key: 'wtsd', label: 'WTSD', max: 45 },
]

const ROWS: Array<[keyof HeroStatLine, string]> = [
  ['vpip', 'VPIP'],
  ['pfr', 'PFR'],
  ['threebet', '3-BET'],
  ['ats', 'ATS'],
  ['af', 'AF'],
  ['wtsd', 'WTSD'],
  ['wsd', 'W$SD'],
  ['wwsf', 'WWSF'],
]

const BANDS = [
  { name: 'STRONG', cls: 'text-accent' },
  { name: 'COMPETENT', cls: 'text-muted' },
  { name: 'DEVELOPING', cls: 'text-faint' },
  { name: 'NOVICE', cls: 'text-faint' },
] as const

function inBand(v: number | null, b?: [number, number]): boolean | null {
  if (v == null || !b) return null
  return v >= b[0] && v <= b[1]
}

// Gate 3 is stated over 2,000+ hands. Lifetime-only made that window impossible to
// isolate — early learning hands drag the average forever.
const WINDOWS: Array<{ label: string; last?: number }> = [
  { label: 'Lifetime' },
  { label: 'Last 500', last: 500 },
  { label: 'Last 2000', last: 2000 },
  { label: 'Last 5000', last: 5000 },
]

export function StatsView() {
  const [stats, setStats] = useState<MyStats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [win, setWin] = useState(0)

  useEffect(() => {
    setStats(null)
    api.myStats(undefined, WINDOWS[win].last).then(setStats).catch((e) => setErr((e as Error).message))
  }, [win])

  if (err) return <div className="text-loss">{err}</div>
  if (!stats) return <div className="text-muted">loading your stats…</div>

  const o = stats.overall
  const net = o.net_bb_per_100
  // Competence band = how many of the five core stats sit in their healthy range.
  const coreInBand = AXES.filter((a) => inBand(o[a.key] as number | null, stats.targets[a.key])).length
  const bandIdx = o.hands === 0 ? 3 : coreInBand >= 5 ? 0 : coreInBand >= 3 ? 1 : coreInBand >= 1 ? 2 : 3
  const tier = BANDS[bandIdx]

  return (
    <div className="mx-auto max-w-4xl pb-10">
      {/* editorial headline */}
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
      {o.hands === 0 ? (
        <h2 className="font-display text-3xl font-semibold -tracking-[0.02em] text-ink">
          No hands yet — play a session to build your profile.
        </h2>
      ) : (
        <h2 className="font-display text-3xl font-semibold -tracking-[0.02em] text-ink">
          Over <span className="tabular-nums">{o.hands.toLocaleString()}</span> hands you’re running{' '}
          <span className={`tabular-nums ${net >= 0 ? 'text-accent' : 'text-loss'}`}>
            {net >= 0 ? '+' : ''}
            {net} bb/100
          </span>
          .
        </h2>
      )}
      <div className="mt-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em]">
        <span className={tier.cls}>{tier.name}</span>
        <span className="text-faint">·</span>
        <span className="text-faint">
          {coreInBand}/5 core stats in a healthy range (STRATEGY §5)
        </span>
      </div>

      {stats.decision_time && stats.decision_time.n > 0 && (
        <div className="mt-4 flex items-baseline gap-2 text-sm">
          <span className="text-muted">Median decision time</span>
          <span className="tabular-nums text-ink">{stats.decision_time.median_s}s</span>
          <span className="text-[11px] text-faint">
            over {stats.decision_time.n} decisions · wall clock, so it counts interruptions too
          </span>
        </div>
      )}

      {o.hands < 100 && (
        <div className="mt-5 rounded-lg border border-line bg-bg2/50 px-4 py-2 text-sm text-muted">
          Small sample — VPIP/PFR stabilise ~100 hands, 3-bet ~500, AF/turn stats ~1000+. Don’t
          over-read these yet.
        </div>
      )}

      <div className="mt-8 grid gap-10 md:grid-cols-[300px_1fr]">
        {/* radar skill profile */}
        <div>
          <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-faint">Skill profile</div>
          <Radar overall={o} targets={stats.targets} />
          <div className="mt-3 flex items-center gap-4 text-[10px] uppercase tracking-[0.12em] text-faint">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" /> you
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-3 bg-faint" /> healthy target
            </span>
          </div>
        </div>

        {/* stat rows — borderless, hairline-divided */}
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-faint">Stats</div>
          <div className="divide-y divide-hair">
            {ROWS.map(([key, label]) => {
              const v = o[key] as number | null
              const b = stats.targets[key]
              const ok = inBand(v, b)
              return (
                <div key={key} className="flex items-center justify-between py-3">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</span>
                  <div className="flex items-baseline gap-3">
                    <span className="w-20 text-right text-[10px] uppercase tracking-wider text-faint tabular-nums">
                      {b ? `${b[0]}–${b[1]}` : ''}
                    </span>
                    <span
                      className={`w-12 text-right text-xl font-medium tabular-nums ${
                        ok === null ? 'text-ink' : ok ? 'text-accent' : 'text-loss'
                      }`}
                    >
                      {v == null ? '—' : v}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {stats.trend.length > 1 && (
        <div className="mt-10">
          <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-faint">Trend</div>
          <Trend trend={stats.trend} />
        </div>
      )}
    </div>
  )
}

function Radar({
  overall,
  targets,
}: {
  overall: HeroStatLine
  targets: Record<string, [number, number]>
}) {
  const N = AXES.length
  const cx = 110
  const cy = 102
  const R = 72
  const ang = (i: number) => (-90 + (i * 360) / N) * (Math.PI / 180)
  const pt = (i: number, r: number): [number, number] => [
    cx + Math.cos(ang(i)) * R * r,
    cy + Math.sin(ang(i)) * R * r,
  ]
  const polyStr = (rs: number[]) => rs.map((r, i) => pt(i, r).join(',')).join(' ')
  const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))

  const playerR = AXES.map((a) => clamp(((overall[a.key] as number | null) ?? 0) / a.max, 0.02, 1))
  const targetR = AXES.map((a) => {
    const b = targets[a.key]
    return b ? clamp((b[0] + b[1]) / 2 / a.max) : 0
  })

  return (
    <svg viewBox="0 0 220 200" className="w-full max-w-[300px]">
      {/* web rings */}
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={polyStr(AXES.map(() => r))} fill="none" stroke="var(--color-hair)" />
      ))}
      {/* spokes */}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-hair)" />
      })}
      {/* healthy-target reference pentagon */}
      <polygon
        points={polyStr(targetR)}
        fill="none"
        stroke="var(--color-faint)"
        strokeDasharray="3 3"
      />
      {/* player polygon */}
      <polygon
        points={polyStr(playerR)}
        fill="var(--color-accent-soft)"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
      />
      {AXES.map((_, i) => {
        const [x, y] = pt(i, playerR[i])
        return <circle key={i} cx={x} cy={y} r="2.4" fill="var(--color-accent)" />
      })}
      {/* axis labels */}
      {AXES.map((a, i) => {
        const [x, y] = pt(i, 1.2)
        const anchor = x < cx - 6 ? 'end' : x > cx + 6 ? 'start' : 'middle'
        return (
          <text
            key={a.label}
            x={x}
            y={y + 3}
            textAnchor={anchor}
            fontSize="8.5"
            letterSpacing="0.08em"
            fontFamily="var(--font-mono)"
            fill="var(--color-muted)"
          >
            {a.label}
          </text>
        )
      })}
    </svg>
  )
}

function Trend({ trend }: { trend: HeroStatLine[] }) {
  const keys: Array<[keyof HeroStatLine, string]> = [
    ['vpip', 'VPIP'],
    ['pfr', 'PFR'],
    ['af', 'AF'],
    ['wtsd', 'WTSD'],
  ]
  return (
    <div className="space-y-2.5">
      {keys.map(([k, label]) => {
        const vals = trend.map((t) => (t[k] as number | null) ?? 0)
        const max = Math.max(...vals, 1)
        return (
          <div key={k} className="flex items-center gap-3">
            <div className="w-12 text-[10px] uppercase tracking-wider text-faint">{label}</div>
            <div className="flex h-7 flex-1 items-end gap-1">
              {vals.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-accent/60"
                  style={{ height: `${(v / max) * 100}%` }}
                  title={`${v}`}
                />
              ))}
            </div>
          </div>
        )
      })}
      <p className="text-[10px] uppercase tracking-wider text-faint">earliest → latest</p>
    </div>
  )
}
