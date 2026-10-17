import { describe, expect, it } from 'vitest'
import { DecisionClock, Generation } from './sessionGuards'

describe('DecisionClock', () => {
  it('times one decision from when it appears to the action', () => {
    const c = new DecisionClock()
    c.sync('s:0:3', 1000)
    expect(c.take(3500).elapsedMs).toBe(2500)
  })

  it('times two hero decisions in a row separately (call, then first to act on the flop: F1)', () => {
    const c = new DecisionClock()
    c.sync('s:4:2', 0) // preflop, the big blind facing a limp
    expect(c.take(10254).elapsedMs).toBe(10254)
    // the response is the hero's turn again, on the flop: a new decision, a new clock
    c.sync('s:4:4', 10400)
    expect(c.take(12400).elapsedMs).toBe(2000)
  })

  it('keeps running through a rejected action (B23)', () => {
    const c = new DecisionClock()
    c.sync('s:0:3', 0)
    const taken = c.take(1000)
    c.restore(taken, 1200)
    expect(c.take(4000).elapsedMs).toBe(4000)
  })

  it('a rejected action with no start (unknown) starts from the rejection', () => {
    const c = new DecisionClock()
    const taken = c.take(500) // nothing on screen: unknown
    expect(taken.elapsedMs).toBeUndefined()
    c.sync('s:0:3', 600)
    c.take(700)
    c.restore({ key: 's:0:3', started: null }, 800)
    expect(c.take(1800).elapsedMs).toBe(1000)
  })

  it('does not restart for the same decision, and stops when it is not the hero’s turn', () => {
    const c = new DecisionClock()
    c.sync('s:0:3', 0)
    c.sync('s:0:3', 900) // a refetched state for the same decision
    expect(c.take(1000).elapsedMs).toBe(1000)
    c.sync(null, 1100)
    expect(c.take(2000).elapsedMs).toBeUndefined()
  })

  it('does not restore an old decision’s start onto a new one', () => {
    const c = new DecisionClock()
    c.sync('s:0:3', 0)
    const taken = c.take(1000)
    c.sync('t:0:3', 1500) // a new game came in meanwhile
    c.restore(taken, 1600)
    expect(c.take(2500).elapsedMs).toBe(1000)
  })
})

describe('Generation (C1: a response from before New game is dropped)', () => {
  it('a check stays true until the next game', () => {
    const g = new Generation()
    const oldAction = g.current()
    expect(oldAction()).toBe(true)
    g.bump() // New game
    const newDeal = g.current()
    expect(oldAction()).toBe(false)
    expect(newDeal()).toBe(true)
  })

  it('the boot effect run twice (StrictMode) keeps only the second result', () => {
    const g = new Generation()
    const first = g.current()
    g.bump() // the first run's cleanup
    const second = g.current()
    expect([first(), second()]).toEqual([false, true])
  })
})
