import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATS } from './stats'
import {
  ARCHETYPES,
  ARCHETYPE_STATS,
  DRAWS,
  OPENING_RANGES,
  POSITIONS,
  PRICE_EXAMPLE,
  SECTIONS,
  STAT_TARGETS,
  bandText,
  drawEquity,
  priceToCall,
  speakBand,
  statGroups,
  targetText,
} from './study'

// The backend is the other half of each contract: read it from disk, so a change there
// fails here instead of letting Study quietly teach a different game.
const backend = (path: string) => readFileSync(new URL(`../../../backend/poker/${path}`, import.meta.url), 'utf8')

/** The `{ ... }` block that follows `name` in a Python file. */
function block(src: string, name: string): string {
  const start = src.indexOf(name)
  if (start < 0) throw new Error(`missing ${name}`)
  const open = src.indexOf('{', start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i)
  }
  throw new Error(`unclosed ${name}`)
}

describe('opening ranges', () => {
  it('are the lists the leak detector grades opens against, verbatim', () => {
    const src = block(backend('bots/preflop_ranges.py'), '_RANGE_TEXT')
    const lists: Record<string, string> = {}
    for (const m of src.matchAll(/"(\w+)":\s*(\(([^)]*)\)|"([^"]*)")/g)) {
      const body = m[3] ?? `"${m[4]}"`
      lists[m[1]] = [...body.matchAll(/"([^"]*)"/g)].map((s) => s[1]).join('')
    }
    expect(Object.keys(lists).sort()).toEqual(['BTN', 'CO', 'MP', 'SB', 'UTG'])
    for (const r of OPENING_RANGES) expect(r.list).toBe(lists[r.pos])
  })

  it('compute their widths from the lists (the backend counts 182, 222, 326, 538, 450)', () => {
    const by = Object.fromEntries(OPENING_RANGES.map((r) => [r.pos, [r.combos, r.pct]]))
    expect(by).toEqual({
      UTG: [182, 13.7],
      MP: [222, 16.7],
      CO: [326, 24.6],
      BTN: [538, 40.6],
      SB: [450, 33.9],
    })
  })

  it('are nested from UTG to the button', () => {
    const order = ['UTG', 'MP', 'CO', 'BTN']
    const rs = order.map((p) => OPENING_RANGES.find((r) => r.pos === p)!.hands)
    for (let i = 1; i < rs.length; i++) for (const h of rs[i - 1]) expect(rs[i].has(h), `${h} in ${order[i]}`).toBe(true)
  })

  it('cover every position but the big blind, in seat order', () => {
    expect(POSITIONS.map((p) => p.pos)).toEqual(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'])
    expect(OPENING_RANGES.map((r) => r.pos)).toEqual(['UTG', 'MP', 'CO', 'BTN', 'SB'])
  })
})

describe('pot odds and draws', () => {
  it('the worked example needs 29%', () => {
    expect(priceToCall(PRICE_EXAMPLE.call, PRICE_EXAMPLE.pot)).toBeCloseTo(29.41, 2)
    expect(Math.round(priceToCall(10, 24))).toBe(29)
  })

  it('draw odds are exact (one card outs/47, two cards 1 - C(47-outs, 2)/C(47, 2))', () => {
    const rounded = DRAWS.map((d) => [d.outs, Math.round(drawEquity(d.outs, 1)), Math.round(drawEquity(d.outs, 2))])
    expect(rounded).toEqual([
      [9, 19, 35],
      [8, 17, 31],
      [4, 9, 16],
      [15, 32, 54],
    ])
    expect(drawEquity(9, 2)).toBeCloseTo(34.97, 2)
    expect(drawEquity(0, 2)).toBe(0)
  })
})

describe('archetypes', () => {
  it('carry the Lab bands (backend/poker/sim/report.py)', () => {
    const src = block(backend('sim/report.py'), 'TARGETS: dict')
    const lab: Record<string, Record<string, [number, number] | null>> = {}
    for (const m of src.matchAll(/"([\w ]+)":\s*\{([^}]*)\}/g)) {
      const bands: Record<string, [number, number] | null> = {}
      for (const b of m[2].matchAll(/"(\w+)":\s*(None|\(([\d.]+),\s*([\d.]+)\))/g)) bands[b[1]] = b[2] === 'None' ? null : [Number(b[3]), Number(b[4])]
      lab[m[1] === 'Calling Station' ? 'Station' : m[1]] = bands
    }
    expect(Object.keys(lab)).toEqual(ARCHETYPES.map((a) => a.name))
    for (const a of ARCHETYPES) {
      for (const { key } of ARCHETYPE_STATS) {
        const want = lab[a.name][key]
        // the backend writes "no upper limit" as 99
        const expected = want === null ? undefined : want[1] >= 99 ? [want[0], null] : want
        expect(a.bands[key], `${a.name} ${key}`).toEqual(expected)
      }
    }
  })

  it('read bands as words, not a dash or a 99', () => {
    expect(bandText([10, 15])).toBe('10–15')
    expect(bandText([0, 1.5])).toBe('Below 1.5')
    expect(bandText([4, null])).toBe('Above 4')
    expect(speakBand([10, 15])).toBe('10 to 15 per cent')
    expect(speakBand([0, 1.5], true)).toBe('below 1.5')
    expect(speakBand([4, null], true)).toBe('above 4')
  })
})

describe('stat definitions', () => {
  it('quote the targets My stats holds you to (backend/poker/sim/hero_stats.py)', () => {
    const src = block(backend('sim/hero_stats.py'), 'HERO_TARGETS')
    const hero = Object.fromEntries([...src.matchAll(/"(\w+)":\s*\(([\d.]+),\s*([\d.]+)\)/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]))
    expect(STAT_TARGETS).toEqual(hero)
  })

  it('are grouped by the gates My stats reads them at: 500, 2,000, 3,000 (inventory §22)', () => {
    const groups = statGroups()
    expect(groups.map((g) => [g.gate, g.stats.map((s) => s.key)])).toEqual([
      [500, ['vpip', 'pfr']],
      [2000, ['ats', 'af', 'wtsd', 'wwsf', 'cbet']],
      [3000, ['threebet', 'wsd']],
    ])
    expect(groups.flatMap((g) => g.stats)).toHaveLength(STATS.length)
    for (const s of groups.flatMap((g) => g.stats)) expect(s.definition.length).toBeGreaterThan(10)
  })

  it('format targets as ranges', () => {
    const all = statGroups().flatMap((g) => g.stats)
    expect(targetText(all.find((s) => s.key === 'vpip')!)).toBe('22–26%')
    expect(targetText(all.find((s) => s.key === 'af')!)).toBe('2.5–3.5')
  })
})

describe('sections', () => {
  it('are the eight, with unique ids', () => {
    expect(SECTIONS).toHaveLength(8)
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(8)
  })
})
