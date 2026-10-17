import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Reads, SessionState } from '../api'
import { buildTableModel, identityOf, replayHand, statusLine, streetOfBoard, streetVerb } from './tableModel'

const fixture = (name: string): SessionState => JSON.parse(readFileSync(new URL(`./__fixtures__/table/${name}.json`, import.meta.url), 'utf8')) as SessionState

describe('streetOfBoard (B12)', () => {
  it('reads the street from the board length', () => {
    expect([0, 3, 4, 5].map(streetOfBoard)).toEqual(['preflop', 'flop', 'turn', 'river'])
  })
  it('ignores a stale state.street after a runout', () => {
    const s = fixture('result_showdown_won') // street "flop", five cards down
    expect(s.state.street).toBe('flop')
    expect(buildTableModel(s, undefined, 'labeled').street).toBe('river')
  })
})

describe('replayHand', () => {
  const s = fixture('spot_implied_draw')
  const r = replayHand(s)
  it('derives call amounts the history leaves out', () => {
    // BB (the hero) calls the SB's 3-bet to 15
    const i = s.state.history.findIndex((h) => h.position === 'BB' && h.action === 'call')
    expect(r.amounts[i]).toBe(15)
  })
  it("words each seat's line: preflop role, then this street", () => {
    const seatOf = (pos: string) => s.state.seats.findIndex((x) => x.position === pos)
    expect(r.tags[seatOf('SB')]).toEqual(['3-bet 15', 'bets 26'])
    expect(r.tags[seatOf('MP')]).toEqual(['Open 5'])
    expect(r.tags[seatOf('BB')]).toEqual(['Call 15'])
    expect(r.tags[seatOf('UTG')]).toEqual([])
  })
  it('agrees with the backend on the bets in front', () => {
    const m = buildTableModel(s, undefined, 'labeled')
    expect(m.villains[4].bet).toBe(26) // the Maniac
    expect(m.inBets).toBe(26)
    expect(m.pot).toBe(61)
  })
  it('names a limp and a raise over limps', () => {
    const t = fixture('spot_preflop_unopened')
    const limped: SessionState = {
      ...t,
      state: {
        ...t.state,
        history: [
          { seat: 2, position: 'UTG', street: 'preflop', action: 'call', to_amount: null },
          { seat: 3, position: 'MP', street: 'preflop', action: 'raise', to_amount: 8 },
        ],
      },
    }
    const tags = replayHand(limped).tags
    expect(tags[2]).toEqual(['Limp 2'])
    expect(tags[3]).toEqual(['Raise 8'])
  })
})

describe('buildTableModel', () => {
  it('B3: shows a villain only with cards the backend says were shown', () => {
    const free = buildTableModel(fixture('result_hero_folded_net0'), undefined, 'labeled')
    // the BB won uncontested: the reveal-all snapshot has its cards, shown_cards is empty
    expect(free.villains.every((v) => v.cards === null)).toBe(true)
    const lost = buildTableModel(fixture('result_showdown_lost'), undefined, 'labeled')
    const tag = lost.villains[1] // TAG
    expect(tag.cards).toEqual(['Jd', 'Qc'])
    expect(tag.label).toBe('a pair')
    expect(tag.net).toBe(197)
    expect(lost.villains.filter((v) => v.cards).length).toBe(1)
  })
  it("keeps the hero's own cards at hand end, and hides them while a folded hand runs", () => {
    expect(buildTableModel(fixture('result_hero_folded_net0'), undefined, 'labeled').hero.cards).toEqual(['Kd', 'Qd'])
    const live = buildTableModel(fixture('state_hero_folded_hand_continues'), undefined, 'labeled')
    expect(live.hero.cards).toBeNull()
    expect(live.hero.folded).toBe(true)
    expect(live.handOver).toBe(false)
  })
  it('B20: no all-in tag once the hand is over', () => {
    const s = fixture('result_hero_busted')
    expect(s.state.seats[s.hero_seat].all_in).toBe(true)
    const m = buildTableModel(s, undefined, 'labeled')
    expect(m.hero.allIn).toBe(false)
    expect(m.hero.stack).toBe(0)
  })
  it('keeps the all-in tag while the hand runs', () => {
    const m = buildTableModel(fixture('state_hero_allin_waiting'), undefined, 'labeled')
    expect(m.hero.allIn).toBe(true)
  })
  it('marks the bot that is thinking, never at hand end', () => {
    const m = buildTableModel(fixture('state_hero_folded_hand_continues'), undefined, 'labeled')
    expect(m.villains.filter((v) => v.actor).map((v) => v.position)).toEqual(['BTN'])
    expect(buildTableModel(fixture('result_showdown_lost'), undefined, 'labeled').villains.some((v) => v.actor)).toBe(false)
  })
  it('puts the button on the right player', () => {
    const m = buildTableModel(fixture('spot_implied_draw'), undefined, 'labeled')
    expect(m.villains.filter((v) => v.button).map((v) => v.player)).toEqual([4])
    expect(m.hero.button).toBe(false)
  })
})

describe('identityOf', () => {
  const seat = { player: 4, position: 'BTN', archetype: 'Calling Station' }
  it('Labeled: the short archetype and the position', () => {
    expect(identityOf(seat, 'labeled')).toEqual({ name: 'Station', pos: 'BTN', hud: null })
  })
  it('HUD: the position, then the read once ready ("—" for null, AF only when known)', () => {
    const reads: Reads = JSON.parse(
      '{"4":{"hands":40,"min_hands":30,"ready":true,"stats":{"vpip":57.5,"pfr":10,"threebet":null,"af":null,"wtsd":null}}}',
    )
    expect(identityOf(seat, 'hud', reads['4'])).toEqual({ name: 'BTN', pos: null, hud: ['57.5/10.0'] })
    expect(identityOf(seat, 'hud', { hands: 40, min_hands: 30, ready: true, stats: { vpip: null, pfr: 2, threebet: null, af: 0.71, wtsd: null } }).hud).toEqual(['—/2.0', 'AF 0.7'])
    expect(identityOf(seat, 'hud', { hands: 7, min_hands: 30, ready: false, stats: null }).hud).toEqual(['Read 7/30'])
    expect(identityOf(seat, 'hud').hud).toEqual(['Read 0/30'])
  })
  it('Live: the position only; the hero is always "You"', () => {
    expect(identityOf(seat, 'live')).toEqual({ name: 'BTN', pos: null, hud: null })
    expect(identityOf({ player: 0, position: 'BB', archetype: 'hero' }, 'live').name).toBe('You')
  })
})

describe('statusLine (B17)', () => {
  it('first person for the hero: "You fold", not "You folds"', () => {
    const m = buildTableModel(fixture('state_hero_folded_hand_continues'), undefined, 'labeled')
    expect(statusLine(m)).toBe('You fold')
  })
  it('names the bot by the mode and says the amount', () => {
    const s = fixture('state_hero_allin_waiting')
    const m = buildTableModel(s, undefined, 'labeled')
    // the last action is the hero's own all-in bet (MP bets 4)
    expect(statusLine(m)).toBe('You bet 4')
    const live = buildTableModel(fixture('spot_implied_draw'), undefined, 'live')
    expect(statusLine(live)).toBe('SB bets 26')
    expect(statusLine(buildTableModel(fixture('spot_implied_draw'), undefined, 'labeled'))).toBe('Maniac bets 26')
  })
  it('says "Dealing" before anyone acts', () => {
    expect(statusLine(buildTableModel(fixture('state_dealing_no_history'), undefined, 'labeled'))).toBe('Dealing')
  })
})

describe('streetVerb', () => {
  it('words a preflop "bet" (the big blind option) as a raise (B26)', () => {
    expect(streetVerb({ action: 'bet', street: 'preflop', to_amount: 8 }, 8, false)).toBe('raises to 8')
    expect(streetVerb({ action: 'bet', street: 'flop', to_amount: 8 }, 8, true)).toBe('bet 8')
    expect(streetVerb({ action: 'call', street: 'flop', to_amount: null }, 1168, false)).toBe('calls 1,168')
  })
})
