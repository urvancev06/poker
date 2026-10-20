import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { HandSummary, LeakSummary } from '../api'
import {
  DEFAULT_WINDOW,
  LEAK_WINDOWS,
  LIST_LIMIT,
  dayLabel,
  elapsedLabel,
  firstPassNote,
  groupBySession,
  handNumber,
  handsCount,
  inWindow,
  leakLabel,
  leakRows,
  leakRule,
  netTone,
  outcomeOf,
  parseStoredDate,
  queryKey,
  reportScope,
  reviewingLine,
  rowLabel,
  timeRange,
  whenLabel,
} from './historyList'

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./__fixtures__/history/${name}.json`, import.meta.url), 'utf8')) as T
const UTC = { locale: 'en-US', timeZone: 'UTC' }
const NOW = new Date('2026-10-17T12:00:00Z')

describe('windows', () => {
  it('reads 200 / 500 / 1,000, defaults to 500 and fetches the list at the widest', () => {
    expect(LEAK_WINDOWS).toEqual([200, 500, 1000])
    expect(DEFAULT_WINDOW).toBe(500)
    expect(LIST_LIMIT).toBe(1000)
  })
  it('cuts the list to the window, newest first (B19: the list matches the report)', () => {
    const hands = fixture<HandSummary[]>('hands_list')
    expect(inWindow(hands, 200)).toHaveLength(50)
    expect(inWindow(hands, 10).map((h) => h.id)).toEqual(hands.slice(0, 10).map((h) => h.id))
  })
  it('keys a query by scope, session and window', () => {
    expect(queryKey('all', 'abc', 500)).toBe('all|500')
    expect(queryKey('session', 'abc', 200)).toBe('abc|200')
    expect(queryKey('session', undefined, 200)).toBe('none|200')
  })
})

describe('leak labels', () => {
  it('names every known type and shows an unknown one raw', () => {
    expect(leakLabel('call_no_odds')).toBe('Called without odds')
    expect(leakLabel('limp')).toBe('Limped first in')
    expect(leakLabel('missed_value')).toBe('Missed value')
    expect(leakLabel('new_kind')).toBe('new_kind')
  })
  it('explains each rule, nothing for an unknown type', () => {
    expect(leakRule('call_no_odds')).toMatch(/more than 5 points below the price/)
    expect(leakRule('fold_with_odds')).toMatch(/at least 5 points above/)
    expect(leakRule('loose_open')).toMatch(/never in the big blind/)
    expect(leakRule('new_kind')).toBe('')
  })
})

describe('numbers and dates', () => {
  it('counts hands from 1', () => {
    expect(handNumber(0)).toBe(1)
    expect(handNumber(131)).toBe(132)
  })
  it('reads a zone-less stored time as UTC', () => {
    expect(parseStoredDate('2026-10-10T04:02:24.651546')?.toISOString()).toBe('2026-10-10T04:02:24.651Z')
    expect(parseStoredDate('2026-10-10T04:02:24+00:00')?.toISOString()).toBe('2026-10-10T04:02:24.000Z')
    expect(parseStoredDate(null)).toBeNull()
    expect(parseStoredDate('not a date')).toBeNull()
  })
  it('names the day', () => {
    expect(dayLabel(new Date('2026-10-17T03:00:00Z'), NOW, UTC)).toBe('Today')
    expect(dayLabel(new Date('2026-10-16T23:00:00Z'), NOW, UTC)).toBe('Yesterday')
    expect(dayLabel(new Date('2026-10-10T04:00:00Z'), NOW, UTC)).toBe('Sat, Oct 10')
    expect(dayLabel(new Date('2025-10-10T04:00:00Z'), NOW, UTC)).toBe('Oct 10, 2025')
  })
  it('gives a time range, or one time within a minute', () => {
    const a = new Date('2026-10-10T03:56:30Z')
    const b = new Date('2026-10-10T03:58:55Z')
    expect(timeRange(a, b, UTC).replace(/\s/g, ' ')).toBe('3:56 – 3:58 AM')
    expect(timeRange(a, a, UTC).replace(/\s/g, ' ')).toBe('3:56 AM')
  })
  it('says when, for the replay header', () => {
    expect(whenLabel('2026-10-10T04:02:24', NOW, UTC).replace(/\s/g, ' ')).toBe('Sat, Oct 10 at 4:02 AM')
    expect(whenLabel(null, NOW, UTC)).toBe('')
  })
  it('counts hands in words', () => {
    expect(handsCount(1)).toBe('1 hand')
    expect(handsCount(1000)).toBe('1,000 hands')
  })
})

describe('groupBySession (B19: rows from different sessions never look alike)', () => {
  const hands = fixture<HandSummary[]>('hands_list')
  it('splits the list into runs of one session, newest first, with a date and a time range', () => {
    const groups = groupBySession(hands, undefined, NOW, UTC)
    expect(groups.map((g) => [g.sessionId, g.hands.length])).toEqual([
      ['54b6efdaa7a5', 2],
      ['89e9c273d836', 48],
    ])
    expect(groups[0].title).toBe('Sat, Oct 10')
    expect(groups[0].range.replace(/\s/g, ' ')).toBe('4:00 – 4:02 AM')
    expect(groups.every((g) => !g.current)).toBe(true)
  })
  it('calls the session at the table "This session"', () => {
    const groups = groupBySession(hands, '54b6efdaa7a5', NOW, UTC)
    expect(groups[0]).toMatchObject({ current: true, title: 'This session' })
    expect(groups[1].current).toBe(false)
  })
  it('keeps the group key stable for the same newest hand', () => {
    expect(groupBySession(hands, undefined, NOW, UTC)[0].key).toBe('54b6efdaa7a5:234')
  })
  it('falls back when the hands carry no dates', () => {
    const g = groupBySession([{ ...hands[0], created_at: null }], undefined, NOW, UTC)[0]
    expect(g.title).toBe('Earlier')
    expect(g.range).toBe('')
  })
  it('is empty for no hands', () => {
    expect(groupBySession([], undefined, NOW, UTC)).toEqual([])
  })
})

describe('outcomes (six cases from net and showdown)', () => {
  it('keeps every case apart', () => {
    expect(outcomeOf(94, true)).toEqual({ word: 'Won at showdown', short: 'Showdown', tone: 'win' })
    expect(outcomeOf(3, false)).toEqual({ word: 'Won, everyone folded', short: 'They folded', tone: 'win' })
    expect(outcomeOf(-91, true)).toEqual({ word: 'Lost at showdown', short: 'Showdown', tone: 'loss' })
    expect(outcomeOf(-2, false)).toEqual({ word: 'You folded', short: 'Folded', tone: 'loss' })
    expect(outcomeOf(0, true)).toEqual({ word: 'Split pot', short: 'Split', tone: 'even' })
    expect(outcomeOf(0, false)).toEqual({ word: 'Folded, it cost nothing', short: 'Folded', tone: 'even' })
  })
  it('tones by the rounded net', () => {
    expect(netTone(0.4)).toBe('even')
    expect(netTone(-0.6)).toBe('loss')
  })
  it('names a row for assistive tech', () => {
    const hands = fixture<HandSummary[]>('hands_list')
    // old rows: 1/2, no big_blind field
    expect(rowLabel(hands[2])).toBe('Hand 132, SB, 4 of diamonds and Ace of hearts, won at showdown, up 47 bb')
    expect(rowLabel(hands[0])).toBe('Hand 2, CO, 10 of clubs and 3 of hearts, lost at showdown, down 45.5 bb')
    expect(rowLabel(hands[1])).toBe('Hand 1, BTN, 4 of spades and 9 of diamonds, folded, it cost nothing')
  })
  it('reads each row in its own big blinds (Review Focus 1)', () => {
    const [old] = fixture<HandSummary[]>('hands_list')
    const atTwo = { ...old, hero_net: 4, went_to_showdown: true, big_blind: 2 }
    const atTen = { ...old, hero_net: -20, went_to_showdown: true, big_blind: 10 }
    expect(rowLabel(atTwo)).toMatch(/, up 2 bb$/)
    expect(rowLabel(atTen)).toMatch(/, down 2 bb$/)
    expect(rowLabel({ ...atTen, hero_net: 15 })).toMatch(/, up 1.5 bb$/)
  })
})

describe('the leak report', () => {
  const report = fixture<LeakSummary>('stats_leaks')
  it('keeps the backend order and scales each bar to the largest count', () => {
    const rows = leakRows(report)
    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ['Called without odds', 242],
      ['Limped first in', 69],
      ['Missed value', 14],
      ['Opened too loose', 8],
      ['Folded too tight', 3],
    ])
    expect(rows[0].share).toBe(1)
    expect(rows[1].share).toBeCloseTo(69 / 242)
    expect(rows[0].rule).not.toBe('')
  })
  it('has no rows for an empty report', () => {
    expect(leakRows(fixture<LeakSummary>('stats_leaks_empty'))).toEqual([])
  })
  it('says what the window covers, and when it is bigger than the data', () => {
    expect(reportScope(239, 500, 'all')).toBe('All 239 hands you have played')
    expect(reportScope(200, 200, 'all')).toBe('Your last 200 hands')
    expect(reportScope(12, 200, 'session')).toBe('All 12 hands this session')
    expect(reportScope(500, 500, 'session')).toBe('Your last 500 hands this session')
    expect(reportScope(1, 200, 'all')).toBe('Your only hand')
    expect(reportScope(1, 200, 'session')).toBe('Your only hand this session')
    expect(reportScope(0, 200, 'all')).toBe('')
  })
})

describe('the slow first pass', () => {
  it('says what it is reviewing', () => {
    expect(reviewingLine(null, 500)).toBe('Reviewing up to 500 hands')
    expect(reviewingLine(239, 500)).toBe('Reviewing 239 hands')
    expect(reviewingLine(1, 500)).toBe('Reviewing 1 hand')
  })
  it('estimates the first pass honestly from the hand count', () => {
    expect(firstPassNote(40)).toMatch(/takes a few seconds/)
    expect(firstPassNote(239)).toMatch(/takes about a minute/)
    expect(firstPassNote(1000)).toMatch(/takes about 4 minutes/)
    expect(firstPassNote(null)).toMatch(/^The first look at your hands/)
    expect(firstPassNote(239)).toMatch(/until the server restarts\.$/)
  })
  it('shows the elapsed time', () => {
    expect(elapsedLabel(0)).toBe('0 s')
    expect(elapsedLabel(8_900)).toBe('8 s')
    expect(elapsedLabel(65_000)).toBe('1:05')
    expect(elapsedLabel(-5)).toBe('0 s')
  })
})
