import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { HandRecord, HandReview } from '../api'
import { boardSpeech, buildTimeline, decisionView, decisionsLine, figuresLabel, priceNote, shownHands } from './historyReplay'

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./__fixtures__/history/${name}.json`, import.meta.url), 'utf8')) as T
const review = (id: number) => fixture<HandReview>(`review_${id}`)
const detail = (id: number) => fixture<HandRecord>(`detail_${id}`)

describe('decisionView', () => {
  it('shows realized equity against the price, with raw equity beside it (inventory 22)', () => {
    const v = decisionView(review(234).decisions[1], 'd1', 2)
    expect(v).toMatchObject({
      street: 'Flop',
      action: 'Call',
      handLabel: 'A pair + backdoor flush draw',
      price: '5 bb to call into 13 bb',
      eq: { label: 'Realized', value: 46.8 },
      raw: 50.3,
      need: 27.8,
      direct: null,
      adjust: null,
      flagged: false,
    })
    expect(priceNote(v)).toBe('')
    expect(figuresLabel(v)).toBe('Realized 46.8%, need 27.8%, raw equity 50.3%')
  })
  it('tags the equity with how it was computed (phase 2 reviews)', () => {
    const d = review(234).decisions[1]
    const exact = decisionView({ ...d, equity_method: 'exact', equity_se_pct: null }, 'd1', 2)
    expect(exact.method).toBe('Exact')
    expect(figuresLabel(exact)).toBe('Realized 46.8%, need 27.8%, raw equity 50.3%, every runout counted')
    const sampled = decisionView({ ...d, equity_method: 'sampled', equity_se_pct: 0.5 }, 'd1', 2)
    expect(sampled.method).toBe('±1.0 pp')
    expect(figuresLabel(sampled)).toBe('Realized 46.8%, need 27.8%, raw equity 50.3%, sampled, plus or minus 1.0 points')
    // an older review sends no method, and a decision without equity gets no tag
    expect(decisionView(d, 'd1', 2).method).toBeNull()
    expect(decisionView({ ...review(234).decisions[0], equity_method: null }, 'd0', 2).method).toBeNull()
  })
  it('names a price made dearer by the adjustment, and the pot odds it started from', () => {
    const v = decisionView(review(13).decisions[2], 'd2', 2)
    expect(v).toMatchObject({ need: 45.7, direct: 33.6, adjust: 'dearer', flagged: true, priceFlag: true })
    expect(v.leaks[0]).toMatchObject({ type: 'call_no_odds', label: 'Called without odds' })
    expect(v.leaks[0].note).toMatch(/a call without the price/)
    expect(priceNote(v)).toBe('Pot odds alone ask 33.6%. The price is raised to 45.7% for what you may lose on later streets when you are behind.')
  })
  it('names a price made cheaper (implied odds)', () => {
    const v = decisionView(review(141).decisions[1], 'd1', 2)
    expect(v).toMatchObject({ need: 22.5, direct: 30, adjust: 'cheaper' })
    expect(priceNote(v)).toMatch(/^Pot odds alone ask 30.0%. The price is lowered to 22.5%/)
  })
  it('preflop: the price in words, no figures (the review scores no preflop equity)', () => {
    const v = decisionView(review(234).decisions[0], 'd0', 2)
    expect(v).toMatchObject({ street: 'Preflop', eq: null, raw: null, need: null, price: '2.5 bb to call into 4 bb' })
    expect(priceNote(v)).toBe('')
    expect(figuresLabel(v)).toBe('')
  })
  it('a check has equity and no price', () => {
    const v = decisionView(review(13).decisions[1], 'd1', 2)
    expect(v).toMatchObject({ action: 'Check', eq: { label: 'Equity', value: 25.8 }, raw: null, need: null, price: 'Nothing to call, pot 10.5 bb' })
    expect(priceNote(v)).toBe('')
  })
  it('words raises and bets as totals; a preflop "bet" is a raise (B26)', () => {
    expect(decisionView(review(62).decisions[0], 'd0', 2).action).toBe('Raise to 239 bb')
    const bet = { ...review(13).decisions[1], action: 'bet', to_amount: 13 }
    expect(decisionView(bet, 'x', 2).action).toBe('Bet 6.5 bb')
    expect(decisionView({ ...bet, street: 'preflop' }, 'x', 2).action).toBe('Raise to 6.5 bb')
    expect(decisionView({ ...bet, to_amount: 75 }, 'x', 10).action).toBe('Bet 7.5 bb')
  })
  it('a raise or a check is not judged on a call price', () => {
    const open = decisionView(review(62).decisions[0], 'd0', 2)
    expect(open).toMatchObject({ need: null, eq: null, price: '1 bb to call into 1.5 bb', flagged: true, priceFlag: false })
    expect(priceNote(open)).toBe('')
    const fold = decisionView(review(2).decisions[0], 'd0', 2)
    expect(fold).toMatchObject({ need: null, flagged: true })
  })
  it('a postflop fold keeps its price: folding with the odds is judged on it', () => {
    const fold = { ...review(234).decisions[1], action: 'fold', leaks: [{ type: 'fold_with_odds', note: 'Folded with the odds.' }] }
    expect(decisionView(fold, 'x', 2)).toMatchObject({ action: 'Fold', need: 27.8, eq: { label: 'Realized', value: 46.8 }, priceFlag: true })
  })
  it('a missed-value check is flagged, but not on its equity', () => {
    const v = decisionView(review(141).decisions[2], 'd2', 2)
    expect(v).toMatchObject({ action: 'Check', eq: { label: 'Equity', value: 91.1 }, flagged: true, priceFlag: false })
  })
  it('carries preflop leaks', () => {
    expect(decisionView(review(2).decisions[0], 'd0', 2).leaks.map((l) => l.label)).toEqual(['Folded too tight'])
    expect(decisionView(review(237).decisions[0], 'd0', 2).leaks.map((l) => l.label)).toEqual(['Limped first in'])
  })
  it('says what a call can win when a side pot caps it', () => {
    const d = { ...review(234).decisions[1], to_call: 40, pot: 130, winnable: 105 }
    expect(decisionView(d, 'x', 10).price).toBe('4 bb to call into 13 bb, you can win 10.5 bb of it')
    expect(decisionView({ ...d, winnable: 170 }, 'x', 10).price).toBe('4 bb to call into 13 bb')
  })
})

describe('buildTimeline', () => {
  it('words every action with its amount, the hero in the first person, decisions on the hero rows', () => {
    const t = buildTimeline(review(234), detail(234))
    expect(t.streets.map((s) => s.label)).toEqual(['Preflop', 'Flop', 'Turn', 'River'])
    const pre = t.streets[0].rows.map((r) => `${r.who} ${r.what}`)
    expect(pre).toEqual(['UTG folds', 'MP raises to 2.5 bb', 'You call 2.5 bb', 'BTN folds', 'SB folds', 'BB calls 2.5 bb'])
    expect(t.streets[1].rows.map((r) => `${r.who} ${r.what}`)).toEqual(['BB bets 5 bb', 'MP folds', 'You call 5 bb'])
    expect(t.bigBlind).toBe(2)
    const hero = t.streets.flatMap((s) => s.rows.filter((r) => r.you))
    expect(hero).toHaveLength(4)
    expect(hero.every((r) => r.decision !== null)).toBe(true)
    expect(hero[1].decision?.handLabel).toBe('A pair + backdoor flush draw')
    expect(t.loose).toEqual([])
    expect(t).toMatchObject({ decisionCount: 4, flagged: 0, heroFolded: false })
  })
  it('gives each street its board and marks the cards dealt on it', () => {
    const t = buildTimeline(review(234), detail(234))
    expect(t.streets.map((s) => [s.board.length, s.newFrom])).toEqual([
      [0, 0],
      [3, 0],
      [4, 3],
      [5, 4],
    ])
  })
  it('adds the runout after an all-in, and marks who is all in (with the stored stacks)', () => {
    const t = buildTimeline(review(62), detail(62))
    expect(t.streets.map((s) => [s.label, s.dealtOnly, s.board.length, s.newFrom])).toEqual([
      ['Preflop', false, 0, 0],
      ['Flop', true, 3, 0],
      ['Turn', true, 4, 3],
      ['River', true, 5, 4],
    ])
    const rows = t.streets[0].rows
    expect(rows.map((r) => `${r.who} ${r.what}${r.allIn ? ' (all in)' : ''}`)).toEqual([
      'You raise to 239 bb (all in)',
      'MP calls 95 bb (all in)',
      'CO folds',
      'BTN calls 82.5 bb (all in)',
      'SB calls 72 bb (all in)',
      'BB folds',
    ])
  })
  it("takes a call's amount from the stored ledger when the hand has one", () => {
    const d = detail(62)
    const actions = (d.data.actions ?? []).map((a, i) => (i === 1 ? { ...a, street_total: 150 } : a))
    const rows = buildTimeline(review(62), { ...d, data: { ...d.data, actions } }).streets[0].rows
    expect(rows[1].what).toBe('calls 75 bb')
  })
  it("reads a 5/10 hand in its own big blinds, from the stored blinds or the review's", () => {
    const d = detail(234)
    const t = buildTimeline({ ...review(234), big_blind: 10 }, { ...d, data: { ...d.data, blinds: [5, 10], start_stacks: undefined } })
    expect(t.bigBlind).toBe(10)
    expect(t.streets[1].rows.map((r) => r.what)).toEqual(['bets 1 bb', 'folds', 'call 1 bb'])
    expect(buildTimeline({ ...review(234), big_blind: 10 }).bigBlind).toBe(10)
  })
  it('without the stored hand: no all-in marks, calls at the street level', () => {
    const rows = buildTimeline(review(62)).streets[0].rows
    expect(rows.some((r) => r.allIn)).toBe(false)
    expect(rows[1].what).toBe('calls 239 bb')
  })
  it('a hand the hero folded keeps playing out', () => {
    const t = buildTimeline(review(63), detail(63))
    expect(t.heroFolded).toBe(true)
    expect(t.streets).toHaveLength(4)
    expect(t.streets[0].rows.find((r) => r.you)).toMatchObject({ what: 'fold', fold: true })
  })
  it('a hand that ended preflop has no runout', () => {
    const t = buildTimeline(review(15), null)
    expect(t.streets.map((s) => s.label)).toEqual(['Preflop'])
    expect(t.flagged).toBe(1)
  })
  it('lists the decisions on their own when they do not line up with the hero rows', () => {
    const r = review(234)
    const t = buildTimeline({ ...r, decisions: r.decisions.slice(0, 3) })
    expect(t.loose).toHaveLength(3)
    expect(t.streets.flatMap((s) => s.rows).every((row) => row.decision === null)).toBe(true)
  })
  it('re-raised twice on one street: two decisions there', () => {
    const t = buildTimeline(review(13))
    const turn = t.streets.find((s) => s.street === 'turn')!
    expect(turn.rows.filter((r) => r.decision).length).toBe(2)
    expect(t.flagged).toBe(3)
  })
  it('sums up the decisions', () => {
    expect(decisionsLine({ decisionCount: 4, flagged: 0 })).toBe('4 decisions, none flagged')
    expect(decisionsLine({ decisionCount: 1, flagged: 1 })).toBe('1 decision, 1 flagged')
    expect(decisionsLine({ decisionCount: 0, flagged: 0 })).toBe('No decisions to score')
  })
})

describe('showdown', () => {
  it('shows the opponents who turned their cards up, winners first, never the hero', () => {
    expect(shownHands(detail(234), { labeled: true })).toEqual([{ seat: 1, position: 'BB', cards: ['8h', 'Qs'], name: 'LAG', net: 97 }])
  })
  it('names no archetype in HUD and Live (B16)', () => {
    expect(shownHands(detail(234), { labeled: false })[0].name).toBeNull()
  })
  it('several hands at a multiway showdown', () => {
    const shown = shownHands(detail(62), { labeled: false })
    expect(shown.map((s) => [s.position, s.cards.join(''), s.net])).toEqual([
      ['BTN', 'KdAc', 476],
      ['MP', 'ThTd', -140],
      ['SB', 'JsKs', -144],
    ])
  })
  it('nothing without the stored hand', () => {
    expect(shownHands(null, { labeled: true })).toEqual([])
  })
})

describe('boardSpeech', () => {
  it('says the board and what was just dealt', () => {
    expect(boardSpeech([])).toBe('No board')
    expect(boardSpeech(['Ts', '8c', 'Qc'])).toBe('Board 10 of spades, 8 of clubs, Queen of clubs')
    expect(boardSpeech(['Ts', '8c', 'Qc', 'Qh'], 3)).toBe('Board 10 of spades, 8 of clubs, Queen of clubs; dealt now: Queen of hearts')
  })
})
