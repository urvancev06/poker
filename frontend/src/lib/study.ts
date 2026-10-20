// Study: the static reference for the 100bb 6-max baseline the app plays and coaches by
// (STRATEGY.md). Its words and the numbers derived from them. Pure: no React, no DOM.
//
// What must stay in step with the backend, and the test that holds it there:
// - the opening lists are the ones the leak detector grades your opens against
//   (backend/poker/bots/preflop_ranges.py); each width is computed from its list here,
//   never written beside it;
// - the archetype bands are the Lab's (backend/poker/sim/report.py);
// - the stat targets are My stats' (backend/poker/sim/hero_stats.py), and each stat is
//   read at the same sample gate My stats uses (lib/stats.ts), so the two views tell one
//   story about sample size (inventory §22).

import { comboCount, parseRange, widthPct } from './ranges'
import { STATS, type Gate, type StatKey } from './stats'

/** The sections, in reading order: the in-page nav and the headings. */
export const SECTIONS = [
  { id: 'positions', nav: 'Positions', title: 'Positions' },
  { id: 'opening', nav: 'Opening ranges', title: 'Opening ranges' },
  { id: 'postflop', nav: 'Postflop', title: 'Postflop' },
  { id: 'pot-odds', nav: 'Pot odds', title: 'Pot odds and equity' },
  { id: 'draws', nav: 'Draws', title: 'Common draws' },
  { id: 'player-types', nav: 'Player types', title: 'Player types' },
  { id: 'stats', nav: 'Stat definitions', title: 'Stat definitions' },
  { id: 'bankroll', nav: 'Bankroll and tilt', title: 'Bankroll, variance and tilt' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']

/** A section's element id (unique across the app: every view stays mounted); its heading is `${id}-h`. */
export const sectionDomId = (id: SectionId) => `study-${id}`

export type Position = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB'

/** Worst to best before the flop. MP is the hijack (the table and History say "MP"). */
export const POSITIONS: readonly { pos: Position; name: string; text: string }[] = [
  { pos: 'UTG', name: 'Under the gun', text: 'First to act before the flop, with everyone still to come. The tightest range.' },
  { pos: 'MP', name: 'Middle position, the hijack', text: 'A little wider than UTG, but four players still act after you.' },
  { pos: 'CO', name: 'Cutoff', text: 'Late position. Open wide and attack the blinds when it folds to you.' },
  { pos: 'BTN', name: 'Button', text: 'You act last on every street after the flop. The widest range and the most profitable seat.' },
  { pos: 'SB', name: 'Small blind', text: 'Half a blind already in, and out of position after the flop. Lean toward raise or fold.' },
  { pos: 'BB', name: 'Big blind', text: 'You close the action before the flop, so the price lets you defend wide. Out of position after it.' },
]

export interface OpeningRange {
  pos: Position
  /** The list, verbatim from STRATEGY.md: the source of truth. */
  list: string
  hands: ReadonlySet<string>
  combos: number
  /** Per cent of 1,326 combos, one decimal. */
  pct: number
}

// The lists, as STRATEGY.md and the leak detector write them (typographic dashes and all).
const OPEN_LISTS: Record<Exclude<Position, 'BB'>, string> = {
  UTG: '22+, ATs+, A5s, A4s, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo',
  MP: '22+, A9s+, A5s–A2s, KTs+, QTs+, J9s+, T9s, 98s, ATo+, KJo+',
  CO: '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo',
  BTN: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K9o+, Q9o+, J9o+, T9o, 98o',
  SB: '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, A2o+, K9o+, QTo+, JTo',
}

export const OPENING_RANGES: readonly OpeningRange[] = (Object.keys(OPEN_LISTS) as Exclude<Position, 'BB'>[]).map((pos) => {
  const hands = parseRange(OPEN_LISTS[pos])
  const combos = comboCount(hands)
  return { pos, list: OPEN_LISTS[pos], hands, combos, pct: widthPct(combos) }
})

/** The big blind has no opening range: it checks its option when folded to. */
export const BB_DEFENCE = 'The big blind never opens: folded to, it checks its option. Against an open, defend wide against the button, cutoff and small blind, tighter against UTG and MP, and mix calls with a polarized 3-bet.'

/** What follows the open. Term, then the line. */
export const PREFLOP_FOLLOW_ON: readonly { term: string; text: string }[] = [
  { term: '3-bet for value', text: 'QQ+ and AK always. Add JJ and AQs against an open from the CO, BTN or SB.' },
  { term: '3-bet as a bluff', text: 'A5s–A4s and other suited blockers.' },
  { term: 'Flat in position', text: '99–22 to set-mine, suited broadways and suited connectors when it is cheap. Out of position, lean to 3-bet or fold.' },
  { term: 'Facing a 3-bet', text: '4-bet QQ+ and AK. Call JJ–TT and AQs depending on the price and the player. Don’t stack off light before the flop.' },
]

/** The postflop decision framework: what counts, then what to do. */
export const FRAMEWORK: readonly { term: string; counts: string; play: string }[] = [
  {
    term: 'Strong made hand',
    counts: 'Top pair with a good kicker or better: two pair, sets, straights, flushes.',
    play: 'Bet ½ to ¾ pot for value, keep betting, and size up with the nuts.',
  },
  {
    term: 'Draw',
    counts: 'A flush draw, an open-ender or a strong combo draw.',
    play: 'Semi-bluff ½ to ⅔ pot, or call when the price is right. Give up when you miss and have no fold equity.',
  },
  {
    term: 'Air',
    counts: 'No pair and no draw.',
    play: 'As the preflop raiser, c-bet once (⅓ to ½ pot) on a good board and give up if called. Not the aggressor: check and fold.',
  },
  {
    term: 'Facing a bet',
    counts: 'Whatever you hold.',
    play: 'Raise monsters, call one street with marginal made hands, fold weak hands to sustained aggression. With a draw, compare your equity to the price.',
  },
]

/** The price you need: call ÷ (pot after their bet + call), in per cent. */
export function priceToCall(call: number, potAfterBet: number): number {
  return (call / (potAfterBet + call)) * 100
}

/** The worked example: a 10 bet into 14 makes the pot 24; calling 10 makes it 34. */
/** The pot-odds example, in big blinds. */
export const PRICE_EXAMPLE = { pot: 24, call: 10 } as const

/** The unseen cards after the flop: 52 minus your two and the board's three. */
const UNSEEN = 47

/**
 * Exact chance of hitting at least one of `outs`, with one card to come (the turn) or two
 * (turn and river, which only counts when you are all-in). Hypergeometric, not the rule of
 * 2 and 4. Per cent.
 */
export function drawEquity(outs: number, cards: 1 | 2): number {
  if (cards === 1) return (outs / UNSEEN) * 100
  const miss = ((UNSEEN - outs) * (UNSEEN - outs - 1)) / (UNSEEN * (UNSEEN - 1))
  return (1 - miss) * 100
}

export const DRAWS: readonly { draw: string; outs: number; approx?: boolean }[] = [
  { draw: 'Flush draw', outs: 9 },
  { draw: 'Open-ender', outs: 8 },
  { draw: 'Gutshot', outs: 4 },
  { draw: 'Flush draw and open-ender', outs: 15, approx: true },
]

/** Bet sizes after the flop, as a share of the pot. */
export const SIZING: readonly { spot: string; size: string }[] = [
  { spot: 'C-bet', size: '⅓ to ½' },
  { spot: 'Value and semi-bluffs', size: '½ to ¾' },
  { spot: 'Nutted hands', size: '¾ to pot' },
  { spot: 'Check-raise', size: 'About 3× the bet' },
]

export type ArchetypeStat = 'vpip' | 'pfr' | 'threebet' | 'af' | 'wtsd'

export const ARCHETYPE_STATS: readonly { key: ArchetypeStat; label: string; ratio?: boolean }[] = [
  { key: 'vpip', label: 'VPIP' },
  { key: 'pfr', label: 'PFR' },
  { key: 'threebet', label: '3-bet' },
  { key: 'af', label: 'AF', ratio: true },
  { key: 'wtsd', label: 'WTSD' },
]

/** [lo, hi]; hi null means "no upper limit" (AF above 4); lo 0 with a hi reads "below". */
export type StudyBand = readonly [number, number | null]

export interface Archetype {
  /** As the table labels the seat. */
  name: string
  /** Who it is. */
  identity: string
  /** How to beat it. */
  exploit: string
  /** The Lab's bands; a missing stat has no band (Maniac WTSD varies). */
  bands: Partial<Record<ArchetypeStat, StudyBand>>
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    name: 'Nit',
    identity: 'Plays premiums only and folds constantly.',
    exploit: 'Steal relentlessly, and believe it when it puts money in. Don’t pay off the rare big bet.',
    bands: { vpip: [10, 15], pfr: [8, 12], threebet: [1, 3], af: [1, 2], wtsd: [26, 32] },
  },
  {
    name: 'TAG',
    identity: 'Tight and aggressive: the baseline on this page, and the benchmark.',
    exploit: 'No free lunch. Play solid, avoid marginal spots out of position, and bluff where your range is credible.',
    bands: { vpip: [20, 24], pfr: [17, 21], threebet: [6, 9], af: [2.5, 3.5], wtsd: [25, 30] },
  },
  {
    name: 'LAG',
    identity: 'Wide and aggressive, with a narrow gap between VPIP and PFR. Hard to read.',
    exploit: 'Tighten up and let it barrel into your strong range. Call down lighter than against a nit, and 3-bet to take its position away.',
    bands: { vpip: [27, 33], pfr: [22, 28], threebet: [9, 13], af: [3, 4.5], wtsd: [27, 33] },
  },
  {
    name: 'Station',
    identity: 'A calling station: passive, calls everything, never folds to value and almost never bluffs.',
    exploit: 'Value bet thin and often, and never bluff: it won’t fold. When it suddenly raises, it has it. Fold your bluff-catchers.',
    bands: { vpip: [40, 55], pfr: [6, 13], threebet: [1, 3], af: [0, 1.5], wtsd: [38, 50] },
  },
  {
    name: 'Maniac',
    identity: 'Raises and bluffs constantly, and barrels air.',
    exploit: 'Punish it with value, not bluffs. Let it bet into you, trap with strong hands and call down wider. Don’t try to out-bluff it.',
    bands: { vpip: [50, 65], pfr: [38, 50], threebet: [14, 22], af: [4, null] },
  },
]

/** A band as text: "10–15", "Below 1.5", "Above 4". */
export function bandText(band: StudyBand): string {
  const [lo, hi] = band
  if (hi === null) return `Above ${lo}`
  if (lo === 0) return `Below ${hi}`
  return `${lo}–${hi}`
}

/** A band for a screen reader: "10 to 15 per cent", "below 1.5". */
export function speakBand(band: StudyBand, ratio = false): string {
  const [lo, hi] = band
  const unit = ratio ? '' : ' per cent'
  if (hi === null) return `above ${lo}${unit}`
  if (lo === 0) return `below ${hi}${unit}`
  return `${lo} to ${hi}${unit}`
}

/** Your targets (a range, never a point), as My stats holds you to them. */
export const STAT_TARGETS: Record<StatKey, readonly [number, number]> = {
  vpip: [22, 26],
  pfr: [18, 22],
  threebet: [7, 10],
  ats: [30, 40],
  af: [2.5, 3.5],
  wtsd: [25, 30],
  wsd: [52, 58],
  wwsf: [48, 54],
  cbet: [55, 70],
}

const DEFINITIONS: Record<StatKey, string> = {
  vpip: 'Hands you voluntarily put money in before the flop. The gap to PFR shows how passive you are.',
  pfr: 'Hands you raise before the flop. A small gap to VPIP is aggressive and competent.',
  threebet: 'How often you re-raise when you face an open. Counted per chance, about 0.4 a hand, not per hand.',
  ats: 'Attempts to steal: how often you open from the CO, BTN or SB when it folds to you.',
  af: '(Bets + raises) ÷ calls, after the flop. Well above 3 is a maniac, well below is too passive.',
  wtsd: 'Flops you take to showdown, counted per flop seen rather than per hand, so it settles slowly.',
  wsd: 'Showdowns you win.',
  wwsf: 'Flops you go on to win, counted per flop seen.',
  cbet: 'Flops you bet as the preflop raiser. It depends on the board.',
}

export interface StudyStat {
  key: StatKey
  name: string
  target: readonly [number, number]
  ratio: boolean
  definition: string
}

/** The nine, grouped by the sample gate My stats reads them at, smallest gate first. */
export function statGroups(): { gate: Gate; stats: StudyStat[] }[] {
  const gates = [...new Set(STATS.map((s) => s.gate))].sort((a, b) => a - b)
  return gates.map((gate) => ({
    gate,
    stats: STATS.filter((s) => s.gate === gate).map((s) => ({
      key: s.key,
      name: s.name,
      target: STAT_TARGETS[s.key],
      ratio: !!s.ratio,
      definition: DEFINITIONS[s.key],
    })),
  }))
}

/** "22–26%", AF "2.5–3.5". */
export function targetText(s: Pick<StudyStat, 'target' | 'ratio'>): string {
  return `${s.target[0]}–${s.target[1]}${s.ratio ? '' : '%'}`
}

export const BANKROLL: readonly { term: string; text: string }[] = [
  { term: 'Bankroll', text: 'At least 20 buy-ins for your stake. Move down when you drop below.' },
  { term: 'Stop-loss', text: 'A fixed limit per session, say 3 buy-ins. Hit it, stop, and don’t reload.' },
  { term: 'Variance is real', text: 'Judge decisions, not results. A good line that lost is still correct; a spew that won is still a spew.' },
  { term: 'Tilt', text: 'Watch for chasing losses and playing too long. Volume isn’t a virtue.' },
]

/** Where exact ranges and mixed frequencies live. */
export const GTO_WIZARD_URL = 'https://gtowizard.com'
