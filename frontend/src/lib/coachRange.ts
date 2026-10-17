// "Their range" in the maths sheet: one line per modelled villain, straight under the
// coach's rationale. Pure; MathsSheet renders the lines.
//
// The backend describes each read as "{Archetype}, {line} → ~top {pct}% ({n} combos)",
// where {line} is tags joined with " + " ("preflop range", "3-bet pre", "c-bet flop",
// "raised turn", "barreled river", "called flop" ...; inventory 9.2). This is the one
// parse the coach view does, with the raw text as the fallback:
//   - the archetype prefix is dropped (B16: in HUD and Live modes the read must not name
//     the archetype; the villain is named by position there, by archetype when Labeled);
//   - bluff_pct is the air share of the villain's range. It is the bluff-catch threshold
//     only for a range that is betting into you; for a villain who only called it is not
//     shown at all (B28), and outside a priced spot it is just their range's air share.

import type { Coaching, VillainModel } from '../api'
import { chips, pct } from './format'
import { capitalize } from './coachWorking'
import type { VisibilityMode } from './prefsSchema'

const SHORT: Record<string, string> = {
  Nit: 'Nit',
  TAG: 'TAG',
  LAG: 'LAG',
  'Calling Station': 'Station',
  Maniac: 'Maniac',
}

export interface RangeRead {
  /** The archetype the description starts with, or null when it does not parse. */
  archetype: string | null
  /** The line tags, in order ("3-bet pre", "c-bet flop"). Empty when it does not parse. */
  tags: string[]
  /** "7.6" from "~top 7.6%", or null. */
  topPct: string | null
}

const DESCRIPTION = /^([^,→]+),\s*(.+?)\s*→\s*(.*)$/
const TOP = /top\s+([\d.]+)\s*%/

export function parseRange(description: string): RangeRead {
  const m = DESCRIPTION.exec(description.trim())
  if (!m) return { archetype: null, tags: [], topPct: null }
  const tags = m[2]
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean)
  return { archetype: m[1].trim(), tags, topPct: TOP.exec(m[3])?.[1] ?? null }
}

/** What the villain did last in this hand's line. */
export type LastAction = 'bet' | 'call' | 'none' | 'unknown'

const BET = /^(3-bet|4-bet|5-bet|c-bet|bet|raised|barreled|donk|shove|all-in)\b/i
const CALL = /^(called|limped|checked)\b/i
const NO_ACTION = /^preflop range$/i

export function lastAction(tags: readonly string[]): LastAction {
  const last = tags[tags.length - 1]
  if (!last) return 'unknown'
  if (NO_ACTION.test(last)) return 'none'
  if (BET.test(last)) return 'bet'
  if (CALL.test(last)) return 'call'
  return 'unknown'
}

/** The air line for one villain, or null when it would mislead (B28) or there is no air. */
export function airLine(v: Pick<VillainModel, 'bluff_pct'>, last: LastAction, priced: boolean): string | null {
  if (!(v.bluff_pct > 0) || last === 'call') return null
  const share = pct(v.bluff_pct, 1)
  if (priced && last === 'bet') return `${share} of this betting range is air: a hand that beats only bluffs wins that often.`
  return `${share} of their range is air.`
}

export interface VillainLine {
  seat: number
  /** Labeled: the archetype ("Station"). HUD / Live: the position ("BTN"), never the archetype. */
  name: string
  /** "3-bet pre, c-bet flop. 101 combos" */
  line: string
  /** "Top 7.6%", or the combo count when the description has no top %. */
  value: string
  air: string | null
}

export interface VillainLineOptions {
  visibility: VisibilityMode
  /** Position by seat index (state.seats[i].position), for HUD and Live naming. */
  positions?: readonly string[]
  /** Whether the hero faces a price (lib/coachView isPriced). */
  priced: boolean
}

export function villainLines(c: Pick<Coaching, 'villains'>, { visibility, positions, priced }: VillainLineOptions): VillainLine[] {
  const many = c.villains.length > 1
  return c.villains.map((v, i) => {
    const r = parseRange(v.description)
    const combos = `${chips(v.combos)} combos`
    const name =
      visibility === 'labeled'
        ? (SHORT[v.archetype] ?? v.archetype)
        : (positions?.[v.seat] ?? (many ? `Opponent ${i + 1}` : 'Opponent'))
    // unparseable: the backend's words, minus a leading archetype in HUD / Live
    const prefix = `${v.archetype},`
    const rawLine = visibility !== 'labeled' && v.description.startsWith(prefix) ? v.description.slice(prefix.length) : v.description
    const line = r.tags.length ? `${capitalize(r.tags.join(', '))}. ${combos}` : capitalize(rawLine)
    return {
      seat: v.seat,
      name,
      line,
      value: r.topPct ? `Top ${r.topPct}%` : combos,
      air: airLine(v, lastAction(r.tags), priced),
    }
  })
}
