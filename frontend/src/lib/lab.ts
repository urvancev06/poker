// Bot lab: how a simulated archetype reads against its target bands, the lineup and run
// controls, and the knob overrides. Pure: no React, no DOM.
//
// Rules (inventory §15.1, bugs B24, B29, B34):
// - A target is a RANGE drawn on a fixed scale per stat, so every archetype's dot for a
//   stat sits on the same rail and compares down the column.
// - A stat with no band is never a pass. The backend answers `ok: true` for the Maniac's
//   unbanded WTSD; here it reads "No target" (B24).
// - null is "no sample" (an empty denominator), never 0. For AF, null is infinity: no
//   postflop calls to divide by. Both fail the server's gate.
// - Rows come one per DISTINCT archetype. Two TAG seats are pooled into one row, and the
//   row says so (B24).
// - Hands are clamped to 100-25,000 before a run: tiny runs crash the server (B29).
// - The "tune" choice is derived from the lineup, so it can never point at an archetype
//   that is no longer seated (B34).

import type { LabArchetypesInfo, LabKnob, LabResult, LabRow, LabStatCell } from '../api'
import { count, signedFixed } from './stats'

/* ---------- the five banded stats ---------- */

export type LabStatKey = 'vpip' | 'pfr' | 'threebet' | 'af' | 'wtsd'

export interface LabStatDef {
  key: LabStatKey
  name: string
  /** The fixed scale's maximum (the minimum is 0). Values beyond it sit at the end. */
  max: number
  /** AF is a ratio (2 dp, no %); the rest are percentages (1 dp). */
  ratio?: boolean
  /** Part of the gate (VPIP, PFR, AF, WTSD). 3-bet is banded and shown, not gated. */
  gated: boolean
  /** What it measures, for the row's details. */
  what: string
}

export const LAB_STATS: readonly LabStatDef[] = [
  { key: 'vpip', name: 'VPIP', max: 70, gated: true, what: 'Hands it puts money in' },
  { key: 'pfr', name: 'PFR', max: 55, gated: true, what: 'Hands it raises before the flop' },
  { key: 'threebet', name: '3-bet', max: 25, gated: false, what: 'Re-raises before the flop, per chance' },
  { key: 'af', name: 'AF', max: 6, ratio: true, gated: true, what: 'Bets and raises per call, after the flop' },
  { key: 'wtsd', name: 'WTSD', max: 60, gated: true, what: 'Flops it takes to showdown, per flop seen' },
]

/** Returned for every archetype but without targets: shown in a row's details, never judged. */
export const EXTRA_STATS: ReadonlyArray<{ key: string; name: string }> = [
  { key: 'ats', name: 'ATS' },
  { key: 'fold_to_steal', name: 'Fold to steal' },
  { key: 'wsd', name: 'W$SD' },
  { key: 'wwsf', name: 'WWSF' },
  { key: 'cbet', name: 'C-bet' },
]

export type Band = readonly [number, number]

/** A cell's band, or null when it is missing or malformed. */
export function cellBand(cell: LabStatCell | null | undefined): Band | null {
  const b = cell?.band
  if (!Array.isArray(b) || b.length !== 2) return null
  const [lo, hi] = b
  return typeof lo === 'number' && typeof hi === 'number' && Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? [lo, hi] : null
}

export type CellJudgement =
  | { state: 'in' }
  /** Out of its band by `by` (signed: below is negative). `by` is null for an infinite AF. */
  | { state: 'out'; by: number | null }
  /** A value but no target to hold it against: shown, never a pass (B24). */
  | { state: 'unbanded' }
  /** Never measured (no sample). The server's gate counts it as a fail. */
  | { state: 'none' }

/** An infinite AF (no postflop calls): the backend sends null. */
export function isInfinite(def: Pick<LabStatDef, 'ratio'>, cell: LabStatCell | null | undefined): boolean {
  return !!def.ratio && !!cell && cell.value === null
}

export function judgeCell(def: Pick<LabStatDef, 'ratio'>, cell: LabStatCell | null | undefined): CellJudgement {
  if (!cell) return { state: 'none' }
  const band = cellBand(cell)
  const v = cell.value
  if (v === null || !Number.isFinite(v)) {
    if (!isInfinite(def, cell)) return { state: 'none' }
    if (!band) return { state: 'unbanded' }
    // Infinity is above any finite band; the server fails it even against "4+".
    const ok = typeof cell.ok === 'boolean' ? cell.ok : band[1] >= 99
    return ok ? { state: 'in' } : { state: 'out', by: null }
  }
  if (!band) return { state: 'unbanded' }
  // The server judged the unrounded value; trust its verdict at the band's edges, and
  // fall back to the band itself if it sent none.
  const inBand = typeof cell.ok === 'boolean' ? cell.ok : v >= band[0] && v <= band[1]
  if (inBand) return { state: 'in' }
  const by = v < band[0] ? v - band[0] : v > band[1] ? v - band[1] : 0
  return { state: 'out', by }
}

/** 12.4 -> "12.4%", AF 2.71 -> "2.71", AF null -> "∞", other null -> "No sample". */
export function formatStat(def: Pick<LabStatDef, 'ratio'>, cell: LabStatCell | null | undefined): string {
  if (isInfinite(def, cell)) return '∞'
  const v = cell?.value
  if (v == null || !Number.isFinite(v)) return 'No sample'
  return def.ratio ? v.toFixed(2) : `${v.toFixed(1)}%`
}

/** [10, 15] -> "10–15%", AF [2.5, 3.5] -> "2.5–3.5", AF [4, 99] -> "4+". */
export function formatBand(def: Pick<LabStatDef, 'ratio'>, band: Band): string {
  const u = def.ratio ? '' : '%'
  return band[1] >= 99 ? `${band[0]}${u}+` : `${band[0]}–${band[1]}${u}`
}

/** The same band for a screen reader: "10 to 15%", "4 or more". */
export function speakBand(def: Pick<LabStatDef, 'ratio'>, band: Band): string {
  const u = def.ratio ? '' : '%'
  return band[1] >= 99 ? `${band[0]}${u} or more` : `${band[0]} to ${band[1]}${u}`
}

/** "−0.4", "+0.02" (an extra digit when one would round to zero), "∞" for an infinite AF. */
export function formatDistance(def: Pick<LabStatDef, 'ratio'>, by: number | null): string {
  if (by === null) return '∞'
  const digits = def.ratio ? 2 : 1
  const shown = Number(Math.abs(by).toFixed(digits)) === 0 && by !== 0 ? digits + 1 : digits
  return signedFixed(by, shown)
}

/** A value's place on its rail, 0-1, clamped to the rail's ends. */
export function railFraction(def: Pick<LabStatDef, 'max'>, v: number): number {
  const f = Math.min(Math.max(v, 0), def.max) / def.max
  return Math.round(f * 10000) / 10000
}

/** The band on the rail as fractions; `open` when it runs off the scale's end ("4+"). */
export function bandFractions(def: Pick<LabStatDef, 'max'>, band: Band): { lo: number; hi: number; open: boolean } {
  return { lo: railFraction(def, band[0]), hi: railFraction(def, band[1]), open: band[1] > def.max }
}

/** Where a cell's dot sits (0-1), or null when it has no dot (no sample). */
export function dotFraction(def: LabStatDef, cell: LabStatCell | null | undefined): number | null {
  if (isInfinite(def, cell)) return 1
  const v = cell?.value
  return v == null || !Number.isFinite(v) ? null : railFraction(def, v)
}

/** The cell's state in words, for the row's accessible name and its details. */
export function cellSpeech(def: LabStatDef, cell: LabStatCell | null | undefined): string {
  const j = judgeCell(def, cell)
  const band = cellBand(cell)
  const value = isInfinite(def, cell) ? 'infinite, no calls to divide by' : formatStat(def, cell)
  const target = band ? `, target ${speakBand(def, band)}` : ''
  switch (j.state) {
    case 'in':
      return `${def.name} ${value}${target}, in range`
    case 'out':
      return `${def.name} ${value}${target}, out of range${j.by === null ? '' : ` by ${formatDistance(def, j.by)}`}`
    case 'unbanded':
      return `${def.name} ${value}, no target, not judged`
    case 'none':
      return `${def.name}: no sample`
  }
}

/* ---------- seats and rows ---------- */

/** The 1-based seats an archetype holds in a lineup. */
export function seatsOf(lineup: readonly string[], key: string): number[] {
  const out: number[] = []
  lineup.forEach((k, i) => {
    if (k === key) out.push(i + 1)
  })
  return out
}

const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six']

/** [2] -> "Seat 2", [2, 6] -> "Seats 2 and 6", [1, 3, 5] -> "Seats 1, 3 and 5", all six -> "All six seats". */
export function seatPhrase(seats: readonly number[], tableSize = 6): string {
  if (seats.length === 0) return 'No seats'
  if (seats.length === 1) return `Seat ${seats[0]}`
  if (seats.length === tableSize && tableSize <= 6) return `All ${WORD[tableSize]} seats`
  return `Seats ${seats.slice(0, -1).join(', ')} and ${seats[seats.length - 1]}`
}

/** Under the archetype's name: "Seat 3, 2,000 hands" or, pooled, "Seats 2 and 6, read together over 4,000 hands". */
export function rowContext(seats: readonly number[], hands: number): string {
  if (seats.length > 1) return `${seatPhrase(seats)}, read together over ${count(hands)} hands`
  return `${seatPhrase(seats)}, ${count(hands)} hands`
}

export interface CellView {
  def: LabStatDef
  cell: LabStatCell | null
  judgement: CellJudgement
}

export interface ResultRowView {
  /** The archetype's key ("tag"), or null when the name is unknown to the metadata. */
  key: string | null
  name: string
  seats: number[]
  hands: number
  bb100: number
  cells: CellView[]
  /** Gated stats out of range (or with no sample) in this row. */
  gatedOut: number
  /** The five unbanded extras, as text. */
  extras: Array<{ name: string; text: string }>
  /** Before any run: the targets only, no readings. */
  preview?: boolean
}

function extraText(cell: LabStatCell | undefined): string {
  const v = cell?.value
  return v == null || !Number.isFinite(v) ? 'no sample' : `${v.toFixed(1)}%`
}

export function rowView(row: LabRow, lineup: readonly string[], info: Pick<LabArchetypesInfo, 'archetypes'> | null): ResultRowView {
  const key = info?.archetypes.find((a) => a.name === row.archetype)?.key ?? null
  const cells = LAB_STATS.map((def) => {
    const cell = row.stats?.[def.key] ?? null
    return { def, cell, judgement: judgeCell(def, cell) }
  })
  const gatedOut = cells.filter((c) => c.def.gated && (c.judgement.state === 'out' || c.judgement.state === 'none')).length
  return {
    key,
    name: row.archetype,
    seats: key ? seatsOf(lineup, key) : [],
    hands: row.hands,
    bb100: row.net_bb_per_100,
    cells,
    gatedOut,
    extras: EXTRA_STATS.map((s) => ({ name: s.name, text: extraText(row.stats?.[s.key]) })),
  }
}

export function resultRows(result: LabResult, info: Pick<LabArchetypesInfo, 'archetypes'> | null): ResultRowView[] {
  return result.rows.map((r) => rowView(r, result.lineup, info))
}

/** Before any run: one row per seated archetype, its targets on the rails and no readings. */
export function previewRows(lineup: readonly string[], info: Pick<LabArchetypesInfo, 'archetypes'>): ResultRowView[] {
  return seatedKeys(lineup, info).map((key) => {
    const a = info.archetypes.find((x) => x.key === key)!
    const cells = LAB_STATS.map((def) => {
      const t = a.targets?.[def.key]
      const band: [number, number] | null = Array.isArray(t) && t.length === 2 ? [t[0], t[1]] : null
      const cell: LabStatCell = { value: null, band, ok: null }
      return { def, cell, judgement: { state: 'none' } as CellJudgement }
    })
    return { key, name: a.name, seats: seatsOf(lineup, key), hands: 0, bb100: 0, cells, gatedOut: 0, extras: [], preview: true }
  })
}

/** The targets in words: "VPIP 20–24%, PFR 17–21%, … WTSD none". */
export function targetsText(v: ResultRowView): string {
  return v.cells
    .map((c) => {
      const b = cellBand(c.cell)
      return `${c.def.name} ${b ? formatBand(c.def, b) : 'none'}`
    })
    .join(', ')
}

/** bb/100 with its sign: "+52.6", "−77.5". */
export function formatBb(n: number): string {
  return signedFixed(n, 1)
}

/** The row's accessible name: who, how many hands, each stat against its band, bb/100. */
export function rowSpeech(v: ResultRowView): string {
  if (v.preview) {
    const targets = v.cells
      .map((c) => {
        const b = cellBand(c.cell)
        return `${c.def.name} ${b ? speakBand(c.def, b) : 'none'}`
      })
      .join(', ')
    return `${v.name}, ${seatPhrase(v.seats).toLowerCase()}. Not run yet. Targets: ${targets}.`
  }
  const cells = v.cells.map((c) => cellSpeech(c.def, c.cell)).join('. ')
  return `${v.name}, ${rowContext(v.seats, v.hands).toLowerCase()}. ${cells}. ${formatBb(v.bb100)} big blinds per 100 hands.`
}

/* ---------- the gate ---------- */

export interface GateSummary {
  pass: boolean
  /** Gated readings with a target (VPIP, PFR, AF, WTSD per archetype). */
  gated: number
  /** Of those, out of range or never measured. */
  out: number
  /** Gated stats with no target, e.g. "Maniac WTSD": not judged here. */
  unbanded: string[]
}

export function gateSummary(result: LabResult, rows: readonly ResultRowView[]): GateSummary {
  let gated = 0
  let out = 0
  const unbanded: string[] = []
  for (const r of rows) {
    for (const c of r.cells) {
      if (!c.def.gated) continue
      if (c.judgement.state === 'unbanded') {
        unbanded.push(`${r.name} ${c.def.name}`)
        continue
      }
      gated++
      if (c.judgement.state === 'out' || c.judgement.state === 'none') out++
    }
  }
  return { pass: result.gate_pass, gated, out, unbanded }
}

/** The verdict, in the coach's register. */
export function gateHeadline(g: GateSummary): string {
  return g.pass ? 'Passes the gate.' : 'Fails the gate.'
}

/** The caveat that must sit with the verdict, with the count that explains it. */
export function gateCaveat(g: GateSummary, hands: number): string {
  const after = `after ${count(hands)} hands`
  if (g.pass || g.out === 0) return `Indicative, not the gate: every gated stat is in range ${after}.`
  const what = g.out === 1 ? 'gated stat is' : 'gated stats are'
  return `Indicative, not the gate: ${g.out} of ${g.gated} ${what} out of range ${after}.`
}

/** "2,000 hands, seed 0, 5.2 s". */
export function metaLine(result: Pick<LabResult, 'hands' | 'seed' | 'elapsed_ms'>): string {
  return `${count(result.hands)} hands, seed ${result.seed}, ${durationText(result.elapsed_ms)}`
}

/* ---------- run length ---------- */

export const HANDS_MIN = 100
/** About 2.9 ms per simulated hand (14.6 s for 5,000 on the reference machine). */
export const MS_PER_HAND = 2.9

/** Whole number from a typed field ("5,000" -> 5000), or null when it is not one. */
export function parseWhole(text: string): number | null {
  const t = text.replace(/[\s,_]/g, '')
  if (!/^[-+]?\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isSafeInteger(n) ? n : null
}

/** Hands for a run: a whole number in 100..max (tiny runs crash the server, B29). */
export function clampHands(n: number | null, max: number): number {
  if (n === null || !Number.isFinite(n)) return HANDS_MIN
  return Math.min(Math.max(Math.round(n), HANDS_MIN), Math.max(HANDS_MIN, max))
}

export const SEED_MAX = 2 ** 31 - 1

export function clampSeed(n: number | null): number {
  if (n === null || !Number.isFinite(n)) return 0
  return Math.min(Math.max(Math.round(n), 0), SEED_MAX)
}

/** The measured speed of the last run (ms per hand), or the reference speed. Runs under
 *  500 hands are mostly start-up cost, so they do not count. */
export function msPerHand(last: Pick<LabResult, 'hands' | 'elapsed_ms'> | null | undefined): number {
  if (!last || last.hands < 500 || !(last.elapsed_ms > 0)) return MS_PER_HAND
  return last.elapsed_ms / last.hands
}

/** How long a run will take, in words: "a few seconds", "about 15 s", "about a minute". */
export function estimateText(hands: number, rate: number = MS_PER_HAND): string {
  const s = (hands * rate) / 1000
  if (s < 8) return 'a few seconds'
  if (s < 57.5) return `about ${Math.max(10, Math.round(s / 5) * 5)} s`
  if (s < 90) return 'about a minute'
  return `about ${Math.round(s / 60)} minutes`
}

/** 5180 -> "5.2 s", 65400 -> "1 min 5 s", 800 -> "0.8 s". */
export function durationText(ms: number): string {
  const s = Math.max(0, ms) / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`
  const whole = Math.round(s)
  const m = Math.floor(whole / 60)
  const r = whole % 60
  return r ? `${m} min ${r} s` : `${m} min`
}

/** The ticking count while a run is in flight: "0 s", "12 s", "1 min 4 s". */
export function elapsedText(ms: number): string {
  const whole = Math.floor(Math.max(0, ms) / 1000)
  if (whole < 60) return `${whole} s`
  const m = Math.floor(whole / 60)
  const r = whole % 60
  return r ? `${m} min ${r} s` : `${m} min`
}

/* ---------- lineup and tuning ---------- */

/** Archetypes seated at least once, in the metadata's order (Nit, TAG, LAG, Station, Maniac). */
export function seatedKeys(lineup: readonly string[], info: Pick<LabArchetypesInfo, 'archetypes'>): string[] {
  const seated = new Set(lineup)
  return info.archetypes.map((a) => a.key).filter((k) => seated.has(k))
}

/** Which archetype the knobs tune. Derived, never stored stale (B34): the pick while it is
 *  seated, else TAG if seated, else the first seated archetype. */
export function tuneTarget(picked: string | null, lineup: readonly string[], info: Pick<LabArchetypesInfo, 'archetypes'>): string | null {
  const seated = seatedKeys(lineup, info)
  if (picked && seated.includes(picked)) return picked
  if (seated.includes('tag')) return 'tag'
  return seated[0] ?? null
}

export function archetypeName(info: Pick<LabArchetypesInfo, 'archetypes'> | null, key: string): string {
  return info?.archetypes.find((a) => a.key === key)?.name ?? key
}

/** "Calling Station" -> "Station" where room is tight (the table's own seat label). */
export function shortName(name: string): string {
  return name === 'Calling Station' ? 'Station' : name
}

/* ---------- knobs ---------- */

export type Overrides = Readonly<Record<string, Readonly<Record<string, number>>>>

export const KNOB_HELP: Readonly<Record<string, string>> = {
  threebet_value: 'Facing an open, it 3-bets for value with this top share of hands.',
  threebet_bluff_freq: 'How often it turns a hand it would flat into a 3-bet bluff.',
  call_open: 'Facing an open outside the big blind, it flat-calls with this top share of hands.',
  bb_defend_call: 'In the big blind, it flat-calls an open with this top share of hands.',
  cbet_freq: 'As the preflop raiser with nothing, how often it bets the flop.',
  barrel_freq: 'Of those c-bets, how often it keeps betting the turn and river.',
  value_bet_freq: 'With a made hand and no bet to face, how often it bets.',
  semibluff_freq: 'With a flush draw or open-ender and no bet to face, how often it bets.',
  calldown_freq: 'Facing a bet with a medium or weak pair, how often it calls.',
  float_freq: 'Facing a bet with nothing, how often it calls anyway.',
  raise_value_freq: 'Facing a bet with a strong made hand, how often it raises.',
  stab_freq: 'Not the preflop raiser and checked to with nothing, how often it bets.',
  bet_frac: 'Bet and raise size, as a share of the pot.',
}

function decimals(step: number): number {
  const s = String(step)
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

type KnobGrid = Pick<LabKnob, 'min' | 'max' | 'step'>

const onGrid = (n: number, meta: KnobGrid): number =>
  Number(Math.min(meta.max, Math.max(meta.min, meta.min + n * meta.step)).toFixed(decimals(meta.step) + 1))

/** A slider value on its knob's grid: clamped, snapped to the step, without float dust.
 *  With `def`, the default is a stop too: the backend's defaults need not sit on the step
 *  (TAG's c-bet 0.68 on a 0.05 grid), and the value nearer to it than to the grid is it. */
export function snapKnob(v: number, meta: KnobGrid, def?: number): number {
  const clamped = Math.min(Math.max(v, meta.min), meta.max)
  const grid = onGrid(Math.round((clamped - meta.min) / meta.step), meta)
  return def !== undefined && Math.abs(clamped - def) < Math.abs(clamped - grid) ? def : grid
}

/** One arrow-key step: the next stop past `v` in `dir`, a grid point or the default
 *  between, so 0.65 -> 0.68 -> 0.70 when the default is 0.68. Clamped at the ends. */
export function stepKnob(v: number, meta: KnobGrid, dir: 1 | -1, def?: number): number {
  const k = (v - meta.min) / meta.step
  const next = onGrid(dir > 0 ? Math.floor(k + EPS) + 1 : Math.ceil(k - EPS) - 1, meta)
  const between = def !== undefined && (def - v) * dir > EPS && (next - def) * dir > EPS
  return between ? def : next
}

/** A knob's value as a share: 0.055 -> "5.5%", 0.68 -> "68%" (one decimal when the step is under 1%). */
export function knobText(meta: Pick<LabKnob, 'step'>, v: number): string {
  const digits = meta.step * 100 < 1 ? 1 : 0
  return `${(v * 100).toFixed(digits)}%`
}

const EPS = 1e-9

export function knobValue(overrides: Overrides, arch: string, key: string, def: number): number {
  return overrides[arch]?.[key] ?? def
}

export function isChanged(overrides: Overrides, arch: string, key: string, def: number): boolean {
  const v = overrides[arch]?.[key]
  return v !== undefined && Math.abs(v - def) > EPS
}

/** Set one knob. Back at its default, the override is dropped (and an empty archetype with it). */
export function withKnob(overrides: Overrides, arch: string, key: string, value: number, def: number): Overrides {
  const mine = { ...(overrides[arch] ?? {}) }
  if (Math.abs(value - def) <= EPS) delete mine[key]
  else mine[key] = value
  const next: Record<string, Readonly<Record<string, number>>> = { ...overrides }
  if (Object.keys(mine).length) next[arch] = mine
  else delete next[arch]
  return next
}

export function withoutArch(overrides: Overrides, arch: string): Overrides {
  if (!(arch in overrides)) return overrides
  const next: Record<string, Readonly<Record<string, number>>> = { ...overrides }
  delete next[arch]
  return next
}

/** How many of an archetype's knobs differ from its defaults. */
export function changedCount(overrides: Overrides, arch: string, defaults: Readonly<Record<string, number>> | undefined): number {
  const mine = overrides[arch]
  if (!mine) return 0
  return Object.entries(mine).filter(([k, v]) => {
    const d = defaults?.[k]
    return d === undefined || Math.abs(v - d) > EPS
  }).length
}

/** Only the seated archetypes' overrides go with a run: the rest stay, unused, for later. */
export function seatedOverrides(overrides: Overrides, lineup: readonly string[]): Overrides {
  const seated = new Set(lineup)
  const out: Record<string, Readonly<Record<string, number>>> = {}
  for (const [k, v] of Object.entries(overrides)) if (seated.has(k) && Object.keys(v).length) out[k] = v
  return out
}

/** Archetypes with changes kept although nobody plays them. */
export function unseatedChanged(overrides: Overrides, lineup: readonly string[]): string[] {
  const seated = new Set(lineup)
  return Object.keys(overrides).filter((k) => !seated.has(k) && Object.keys(overrides[k]).length > 0)
}

/** What a run changed for one archetype: "C-bet freq 68% to 80%". */
export function overrideEcho(result: Pick<LabResult, 'overrides'>, key: string | null, info: LabArchetypesInfo | null): string[] {
  if (!key || !info) return []
  const mine = result.overrides?.[key]
  if (!mine) return []
  const defaults = info.archetypes.find((a) => a.key === key)?.knobs ?? {}
  return info.knob_meta
    .filter((m) => mine[m.key] !== undefined)
    .map((m) => {
      const from = defaults[m.key]
      const to = knobText(m, mine[m.key])
      return from === undefined ? `${m.label} ${to}` : `${m.label} ${knobText(m, from)} to ${to}`
    })
}

/* ---------- a run's settings ---------- */

export interface RunConfig {
  lineup: readonly string[]
  hands: number
  seed: number
  overrides: Overrides
}

/** A stable key for a run's settings (overrides in a fixed order), to tell when the
 *  results on screen no longer match the controls. */
export function configKey(c: RunConfig): string {
  const o = Object.keys(c.overrides)
    .sort()
    .map((a) => [a, Object.keys(c.overrides[a]).sort().map((k) => [k, c.overrides[a][k]])])
  return JSON.stringify([c.lineup, c.hands, c.seed, o])
}
