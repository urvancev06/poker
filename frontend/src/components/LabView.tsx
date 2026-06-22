import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type CfrResult,
  type LabArchetypesInfo,
  type LabResult,
  type LabRow,
} from '../api'

type Tab = 'sim' | 'cfr'

// The stats we surface in the lab table — the gate-relevant ones (have bands)
// plus the headline win rate. Stats are OUTPUTS of the knobs (PROJECT.md §3).
const STAT_COLS: Array<[string, string]> = [
  ['vpip', 'VPIP'],
  ['pfr', 'PFR'],
  ['threebet', '3-bet'],
  ['af', 'AF'],
  ['wtsd', 'WTSD'],
]

export function LabView() {
  const [tab, setTab] = useState<Tab>('sim')
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center gap-4">
        <h2 className="font-display text-2xl text-ink">Lab</h2>
        <div className="flex overflow-hidden rounded-lg border border-line text-xs uppercase tracking-wide">
          {(
            [
              ['sim', 'Bot lab'],
              ['cfr', 'CFR · Kuhn'],
            ] as Array<[Tab, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 transition ${
                tab === t ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'sim' ? <BotLab /> : <CfrLab />}
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Bot lab
// --------------------------------------------------------------------------- //
function BotLab() {
  const [info, setInfo] = useState<LabArchetypesInfo | null>(null)
  const [lineup, setLineup] = useState<string[]>([])
  const [hands, setHands] = useState(5000)
  const [seed, setSeed] = useState(0)
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({})
  const [tuning, setTuning] = useState<string>('tag')
  const [result, setResult] = useState<LabResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api
      .labArchetypes()
      .then((i) => {
        setInfo(i)
        setLineup(i.default_lineup)
        setHands(i.default_hands)
      })
      .catch((e) => setErr((e as Error).message))
  }, [])

  const defaultsFor = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    info?.archetypes.forEach((a) => (m[a.key] = a.knobs))
    return m
  }, [info])

  const uniqueLineup = useMemo(() => Array.from(new Set(lineup)), [lineup])

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      setResult(await api.labSimulate({ lineup, hands, seed, overrides }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setKnob = (arch: string, knob: string, value: number) =>
    setOverrides((o) => ({ ...o, [arch]: { ...(o[arch] ?? {}), [knob]: value } }))

  const resetKnobs = (arch: string) =>
    setOverrides((o) => {
      const next = { ...o }
      delete next[arch]
      return next
    })

  if (err && !info) return <div className="text-loss">{err}</div>
  if (!info) return <div className="text-muted">loading the lab…</div>

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        You never set a bot's VPIP — you set a <em>strategy</em> and measure what comes out
        (PROJECT.md §3). Pick a lineup, nudge a knob, run the sim, and watch the stats land in
        (or fall out of) their target bands. This is the Phase-3 tuning loop, live.
      </p>

      {/* lineup + run controls */}
      <div className="rounded-xl border border-line bg-bg2/60 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wider text-muted">Lineup (6 seats)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {lineup.map((key, i) => (
            <select
              key={i}
              value={key}
              onChange={(e) =>
                setLineup((l) => l.map((v, j) => (j === i ? e.target.value : v)))
              }
              className="rounded-md border border-line bg-bg2 px-2 py-1.5 text-sm text-ink"
            >
              {info.archetypes.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm text-muted">
            <span className="mr-2">Hands</span>
            <input
              type="number"
              value={hands}
              min={100}
              max={info.max_hands}
              step={500}
              onChange={(e) => setHands(Math.min(info.max_hands, Number(e.target.value)))}
              className="w-28 rounded-md border border-line bg-bg2 px-2 py-1.5 text-ink tabular-nums"
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mr-2">Seed</span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-20 rounded-md border border-line bg-bg2 px-2 py-1.5 text-ink tabular-nums"
            />
          </label>
          <button
            onClick={run}
            disabled={busy}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-bold uppercase tracking-wide text-accent-ink hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Simulating…' : 'Run simulation'}
          </button>
          <span className="text-[11px] text-muted">
            capped at {info.max_hands.toLocaleString()} hands (the full ≥100k gate runs offline)
          </span>
        </div>
      </div>

      {/* knob tuning */}
      <div className="rounded-xl border border-line bg-bg2/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted">Tune knobs</div>
          <select
            value={tuning}
            onChange={(e) => setTuning(e.target.value)}
            className="rounded-md border border-line bg-bg2 px-2 py-1 text-sm text-ink"
          >
            {uniqueLineup.map((k) => (
              <option key={k} value={k}>
                {info.archetypes.find((a) => a.key === k)?.name ?? k}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {info.knob_meta.map((kb) => {
            const def = defaultsFor[tuning]?.[kb.key] ?? 0
            const val = overrides[tuning]?.[kb.key] ?? def
            const changed = overrides[tuning]?.[kb.key] != null && overrides[tuning][kb.key] !== def
            return (
              <div key={kb.key}>
                <div className="flex justify-between text-xs">
                  <span className={changed ? 'text-accent' : 'text-muted'}>{kb.label}</span>
                  <span className={`tabular-nums ${changed ? 'text-accent' : 'text-muted'}`}>
                    {val.toFixed(kb.step < 0.01 ? 3 : 2)}
                    {changed && <span className="text-muted"> (def {def.toFixed(2)})</span>}
                  </span>
                </div>
                <input
                  type="range"
                  min={kb.min}
                  max={kb.max}
                  step={kb.step}
                  value={val}
                  onChange={(e) => setKnob(tuning, kb.key, Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            )
          })}
        </div>
        {overrides[tuning] && (
          <button
            onClick={() => resetKnobs(tuning)}
            className="mt-3 text-[11px] uppercase tracking-wider text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Reset {info.archetypes.find((a) => a.key === tuning)?.name} to defaults
          </button>
        )}
      </div>

      {err && <div className="text-loss">{err}</div>}

      {result && <LabResults result={result} />}
    </div>
  )
}

function LabResults({ result }: { result: LabResult }) {
  return (
    <div className="rounded-xl border border-line bg-bg2/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide ${
            result.gate_pass ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'
          }`}
        >
          {result.gate_pass ? 'Gate ✓ pass' : 'Gate ✗ fail'}
        </span>
        <span className="text-[11px] text-muted">
          {result.hands.toLocaleString()} hands · seed {result.seed} · {result.elapsed_ms} ms
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-2 pr-4">Archetype</th>
              {STAT_COLS.map(([, label]) => (
                <th key={label} className="pb-2 pr-4 text-right">
                  {label}
                </th>
              ))}
              <th className="pb-2 text-right">bb/100</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <LabStatRow key={row.archetype} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Green = inside the STRATEGY §4 target band; red = out. The gate is VPIP, PFR and AF in band
        for every archetype. Small samples wobble — bump hands to tighten.
      </p>
    </div>
  )
}

function LabStatRow({ row }: { row: LabRow }) {
  return (
    <tr className="border-t border-line/60">
      <td className="py-2 pr-4 text-ink">{row.archetype}</td>
      {STAT_COLS.map(([key]) => {
        const cell = row.stats[key]
        const color = cell?.ok == null ? 'text-ink' : cell.ok ? 'text-win' : 'text-loss'
        return (
          <td key={key} className="py-2 pr-4 text-right tabular-nums">
            <span className={color}>{cell?.value == null ? '∞' : cell.value}</span>
            {cell?.band && (
              <div className="text-[10px] text-muted">
                {cell.band[0]}–{cell.band[1] >= 99 ? '+' : cell.band[1]}
              </div>
            )}
          </td>
        )
      })}
      <td className="py-2 text-right tabular-nums">
        <span className={row.net_bb_per_100 >= 0 ? 'text-win' : 'text-loss'}>
          {row.net_bb_per_100 >= 0 ? '+' : ''}
          {row.net_bb_per_100}
        </span>
      </td>
    </tr>
  )
}

// --------------------------------------------------------------------------- //
// CFR · Kuhn poker
// --------------------------------------------------------------------------- //
function CfrLab() {
  const [iterations, setIterations] = useState(50000)
  const [result, setResult] = useState<CfrResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      setResult(await api.cfr(iterations))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm text-muted">
        <p>
          <span className="text-ink">Counterfactual Regret Minimization</span> teaches itself a
          GTO strategy by playing against itself and minimizing regret. We run it on{' '}
          <span className="text-ink">Kuhn poker</span> — a 3-card toy (J&lt;Q&lt;K, one bet allowed)
          small enough that its equilibrium is known in <em>closed form</em>. So this isn't a
          fabricated solver output: it's a real solver we can check against the analytic answer.
        </p>
        <p>
          The known game value to the first player is <span className="text-ink">−1/18 ≈ −0.056</span>{' '}
          (acting first is a disadvantage). <span className="text-ink">Exploitability</span> measures
          how much a perfect counter-strategy would beat ours — it should fall toward 0 as training
          runs.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-bg2/60 p-4">
        <label className="text-sm text-muted">
          <span className="mr-2">Iterations</span>
          <input
            type="number"
            value={iterations}
            min={1000}
            max={500000}
            step={1000}
            onChange={(e) => setIterations(Number(e.target.value))}
            className="w-32 rounded-md border border-line bg-bg2 px-2 py-1.5 text-ink tabular-nums"
          />
        </label>
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-bold uppercase tracking-wide text-accent-ink hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Training…' : 'Train CFR'}
        </button>
      </div>

      {err && <div className="text-loss">{err}</div>}

      {result && <CfrResults result={result} />}
    </div>
  )
}

function CfrResults({ result }: { result: CfrResult }) {
  const gvErr = Math.abs(result.game_value - result.equilibrium_value)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Game value (learned)" value={result.game_value.toFixed(4)} ok={gvErr < 0.01} />
        <Stat label="Equilibrium (exact)" value={result.equilibrium_value.toFixed(4)} />
        <Stat
          label="Exploitability"
          value={result.exploitability.toFixed(4)}
          ok={result.exploitability < 0.02}
        />
      </div>

      <div className="rounded-xl border border-line bg-bg2/60 p-4">
        <h3 className="mb-3 font-display text-base text-ink">Exploitability over training</h3>
        <ConvergenceBars trend={result.trend} />
      </div>

      <div className="rounded-xl border border-line bg-bg2/60 p-4">
        <h3 className="mb-1 font-display text-base text-ink">Learned strategy</h3>
        <p className="mb-3 text-[11px] text-muted">
          bet/call frequency per information set (your card + the action so far). The textbook
          equilibrium emerges: never open the Q, always call a bet with the K, fold the J, and bluff
          the J at ~⅓ — with the K bet ~3× as often as the J bluff.
        </p>
        <div className="space-y-1.5">
          {result.strategy.map((s) => (
            <div key={s.infoset} className="flex items-center gap-3 text-sm">
              <span className="w-52 shrink-0 text-muted">{s.label}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-bg">
                <div
                  className="h-full bg-accent/70"
                  style={{ width: `${Math.round(s.bet * 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right tabular-nums text-ink">
                {Math.round(s.bet * 100)}%
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">bar = probability of bet/call · rest = check/fold</p>
      </div>
    </div>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-bg2/70 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div
        className={`text-2xl font-bold tabular-nums ${
          ok == null ? 'text-ink' : ok ? 'text-win' : 'text-loss'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function ConvergenceBars({ trend }: { trend: CfrResult['trend'] }) {
  const max = Math.max(...trend.map((t) => t.exploitability), 0.0001)
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {trend.map((t, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-accent/60"
            style={{ height: `${Math.max(2, (t.exploitability / max) * 100)}%` }}
            title={`${t.iterations.toLocaleString()} iters · exploit ${t.exploitability}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums">
        <span>{trend[0]?.iterations.toLocaleString()}</span>
        <span>iterations →</span>
        <span>{trend[trend.length - 1]?.iterations.toLocaleString()}</span>
      </div>
    </div>
  )
}
