// Range notation -> the 169 starting-hand classes, and the 13 x 13 grid Study draws them
// on. Pure: no React, no DOM.
//
// Mirrors backend/poker/math/ranges.py, so a list means the same hands here as in the
// leak detector that grades your opens (backend/poker/bots/preflop_ranges.py):
//   pairs     "22", "TT+", "99-66"
//   suited    "AKs", "ATs+", "A5s-A2s"
//   offsuit   "KQo", "ATo+"
//   bare      "AK" (both AKs and AKo)
// "+" fixes the higher card and raises the kicker up to one below it ("ATs+" is ATs, AJs,
// AQs, AKs; "TT+" is TT..AA). Typographic dashes (the lists are written for people) read
// as "-". Explicit combos ("AhKs") are not a class, so they are refused here.

/** High to low: the grid's row and column order. */
export const RANKS = 'AKQJT98765432'

export const TOTAL_COMBOS = 1326

export type HandKind = 'pair' | 'suited' | 'offsuit'

export interface HandCell {
  /** "AA", "AKs", "AKo": the higher rank first. */
  hand: string
  kind: HandKind
  /** 6 for a pair, 4 suited, 12 offsuit. */
  combos: number
  row: number
  col: number
}

const COMBOS: Record<HandKind, number> = { pair: 6, suited: 4, offsuit: 12 }

/** The class at grid position (row, col): pairs on the diagonal, suited above it, offsuit below. */
export function cellAt(row: number, col: number): HandCell {
  const hi = RANKS[Math.min(row, col)]
  const lo = RANKS[Math.max(row, col)]
  const kind: HandKind = row === col ? 'pair' : row < col ? 'suited' : 'offsuit'
  const hand = kind === 'pair' ? hi + lo : hi + lo + (kind === 'suited' ? 's' : 'o')
  return { hand, kind, combos: COMBOS[kind], row, col }
}

/** All 169 cells, row by row. */
export const GRID: readonly HandCell[] = Array.from({ length: 169 }, (_, i) => cellAt(Math.floor(i / 13), i % 13))

/** A rank's strength, 0 (deuce) .. 12 (ace), as the backend counts it. */
function strength(rank: string): number {
  const i = RANKS.indexOf(rank.toUpperCase())
  if (i < 0) throw new RangeError(`not a rank: ${rank}`)
  return 12 - i
}

const rankAt = (s: number) => RANKS[12 - s]

interface Endpoint {
  hi: number
  lo: number
  /** true suited, false offsuit, null both. */
  suited: boolean | null
}

function endpoint(core: string): Endpoint {
  let c = core.trim()
  let suited: boolean | null = null
  const last = c.slice(-1).toLowerCase()
  if (c.length === 3 && (last === 's' || last === 'o')) {
    suited = last === 's'
    c = c.slice(0, -1)
  }
  if (c.length !== 2) throw new RangeError(`bad range token: ${core}`)
  const a = strength(c[0])
  const b = strength(c[1])
  if (a === b && suited !== null) throw new RangeError(`a pair cannot be suited or offsuit: ${core}`)
  return { hi: Math.max(a, b), lo: Math.min(a, b), suited }
}

/** The classes for two ranks: one pair, or the suited and/or offsuit class. */
function classes(hi: number, lo: number, suited: boolean | null): string[] {
  const h = rankAt(hi)
  const l = rankAt(lo)
  if (hi === lo) return [h + l]
  if (suited === true) return [h + l + 's']
  if (suited === false) return [h + l + 'o']
  return [h + l + 's', h + l + 'o']
}

function token(raw: string): string[] {
  const t = raw.trim().replace(/[–—]/g, '-')
  if (!t) return []
  if (t.includes('-')) {
    const [a, b, extra] = t.split('-')
    if (extra !== undefined) throw new RangeError(`bad range token: ${raw}`)
    const ea = endpoint(a)
    const eb = endpoint(b)
    const out: string[] = []
    if (ea.hi === ea.lo && eb.hi === eb.lo) {
      for (let r = Math.min(ea.hi, eb.hi); r <= Math.max(ea.hi, eb.hi); r++) out.push(...classes(r, r, null))
      return out
    }
    if (ea.hi !== eb.hi || ea.suited !== eb.suited) throw new RangeError(`endpoints don't line up: ${raw}`)
    for (let l = Math.min(ea.lo, eb.lo); l <= Math.max(ea.lo, eb.lo); l++) out.push(...classes(ea.hi, l, ea.suited))
    return out
  }
  if (t.endsWith('+')) {
    const e = endpoint(t.slice(0, -1))
    const out: string[] = []
    if (e.hi === e.lo) for (let r = e.lo; r <= 12; r++) out.push(...classes(r, r, null))
    else for (let l = e.lo; l < e.hi; l++) out.push(...classes(e.hi, l, e.suited))
    return out
  }
  const e = endpoint(t)
  return classes(e.hi, e.lo, e.suited)
}

/** A comma-separated list -> the set of classes it names ("AKs", "TT", ...). Throws RangeError on bad notation. */
export function parseRange(text: string): ReadonlySet<string> {
  const out = new Set<string>()
  for (const raw of text.split(',')) for (const c of token(raw)) out.add(c)
  return out
}

const COMBOS_BY_HAND = new Map(GRID.map((c) => [c.hand, c.combos]))

/** Two-card combos in a set of classes (out of 1,326). */
export function comboCount(hands: ReadonlySet<string>): number {
  let n = 0
  for (const h of hands) n += COMBOS_BY_HAND.get(h) ?? 0
  return n
}

/** 182 -> 13.7 (per cent of all 1,326 combos, one decimal). */
export function widthPct(combos: number): number {
  return Math.round((combos / TOTAL_COMBOS) * 1000) / 10
}
