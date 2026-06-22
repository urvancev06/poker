import { useEffect, useState } from 'react'
import { api, type HeroStatLine, type MyStats } from '../api'

const ROWS: Array<[keyof HeroStatLine, string]> = [
  ['vpip', 'VPIP'],
  ['pfr', 'PFR'],
  ['threebet', '3-bet'],
  ['ats', 'ATS'],
  ['af', 'AF'],
  ['wtsd', 'WTSD'],
  ['wsd', 'W$SD'],
  ['wwsf', 'WWSF'],
]

function band(stats: MyStats, key: string): [number, number] | undefined {
  return stats.targets[key]
}

function inBand(v: number | null, b?: [number, number]): boolean | null {
  if (v == null || !b) return null
  return v >= b[0] && v <= b[1]
}

export function StatsView() {
  const [stats, setStats] = useState<MyStats | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.myStats().then(setStats).catch((e) => setErr((e as Error).message))
  }, [])

  if (err) return <div className="text-loss">{err}</div>
  if (!stats) return <div className="text-muted">loading your stats…</div>

  const o = stats.overall

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="font-display text-2xl text-ink">My stats</h2>
      <p className="mb-6 text-sm text-muted">
        {o.hands.toLocaleString()} hands · net{' '}
        <span className={`tabular-nums ${o.net_bb_per_100 >= 0 ? 'text-win' : 'text-loss'}`}>
          {o.net_bb_per_100 >= 0 ? '+' : ''}
          {o.net_bb_per_100} bb/100
        </span>{' '}
        — vs healthy-reg target bands (STRATEGY §5)
      </p>

      {o.hands < 100 && (
        <div className="mb-4 rounded-lg border border-line bg-bg2/60 px-4 py-2 text-sm text-muted">
          Small sample — VPIP/PFR stabilise ~100 hands, 3-bet ~500, AF/turn stats ~1000+.
          Don't over-read these yet.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ROWS.map(([key, label]) => {
          const v = o[key] as number | null
          const b = band(stats, key)
          const ok = inBand(v, b)
          return (
            <div key={key} className="rounded-xl border border-line bg-bg2/70 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  ok === null ? 'text-ink' : ok ? 'text-win' : 'text-loss'
                }`}
              >
                {v == null ? '—' : v}
              </div>
              <div className="text-[11px] text-muted tabular-nums">
                {b ? `target ${b[0]}–${b[1]}` : ''}
              </div>
            </div>
          )
        })}
      </div>

      {stats.trend.length > 1 && (
        <div className="mt-8">
          <h3 className="mb-2 font-display text-lg text-ink">Trend</h3>
          <Trend trend={stats.trend} />
        </div>
      )}
    </div>
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
    <div className="space-y-2">
      {keys.map(([k, label]) => {
        const vals = trend.map((t) => (t[k] as number | null) ?? 0)
        const max = Math.max(...vals, 1)
        return (
          <div key={k} className="flex items-center gap-3">
            <div className="w-12 text-[11px] uppercase text-muted">{label}</div>
            <div className="flex h-8 flex-1 items-end gap-1">
              {vals.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-accent/70"
                  style={{ height: `${(v / max) * 100}%` }}
                  title={`${v}`}
                />
              ))}
            </div>
          </div>
        )
      })}
      <p className="text-[11px] text-muted">earliest → latest (each bar = a slice of your hands)</p>
    </div>
  )
}
