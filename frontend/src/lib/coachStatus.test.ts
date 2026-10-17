import { describe, expect, it } from 'vitest'
import { coachSlot, deriveCoachStatus, type CoachSlotInput, type CoachStatusInput } from './coachStatus'
import { normalizeCoachMode, normalizeVisibility } from './prefsSchema'

const base: CoachStatusInput = { heroToAct: true, mode: 'on', asked: false, loading: false, hasCoaching: false, hasError: false }

describe('deriveCoachStatus', () => {
  it('is idle when it is not the hero’s turn', () => {
    expect(deriveCoachStatus({ ...base, heroToAct: false, hasCoaching: true })).toBe('idle')
  })

  it('auto mode: loading, then ready, or error', () => {
    expect(deriveCoachStatus({ ...base, loading: true })).toBe('loading')
    expect(deriveCoachStatus({ ...base, hasCoaching: true })).toBe('ready')
    expect(deriveCoachStatus({ ...base, hasError: true })).toBe('error')
  })

  it('off mode offers the coach until asked', () => {
    expect(deriveCoachStatus({ ...base, mode: 'off' })).toBe('off')
    expect(deriveCoachStatus({ ...base, mode: 'off', asked: true, loading: true })).toBe('loading')
    expect(deriveCoachStatus({ ...base, mode: 'off', asked: true, hasCoaching: true })).toBe('ready')
  })

  it('think-first hides an answer it already has until asked', () => {
    expect(deriveCoachStatus({ ...base, mode: 'think', hasCoaching: true })).toBe('off')
    expect(deriveCoachStatus({ ...base, mode: 'think', hasError: true })).toBe('off')
    expect(deriveCoachStatus({ ...base, mode: 'think', asked: true, hasCoaching: true })).toBe('ready')
  })
})

describe('coachSlot', () => {
  const K = 's:3:5'
  const slot = (over: Partial<CoachSlotInput> = {}) => coachSlot({ decisionKey: K, mode: 'on', askedFor: null, answerFor: null, error: null, ...over })

  it('auto mode is loading from the first frame of a turn, then ready', () => {
    expect(slot()).toEqual({ status: 'loading', answered: false, showError: false, settled: false })
    expect(slot({ answerFor: K })).toMatchObject({ status: 'ready', answered: true, settled: true })
  })

  it('an answer or an error for another decision does not count (B14, B15)', () => {
    expect(slot({ answerFor: 's:3:4' }).status).toBe('loading')
    expect(slot({ error: { key: 's:3:4', dismissed: false } }).status).toBe('loading')
  })

  it('an error shows, and once dismissed offers the coach again, not a spinner (F2)', () => {
    expect(slot({ error: { key: K, dismissed: false } })).toMatchObject({ status: 'error', showError: true, settled: true })
    expect(slot({ error: { key: K, dismissed: true } })).toEqual({ status: 'off', answered: false, showError: false, settled: true })
    // mode off: asked, failed, dismissed -> "Ask the coach" again
    expect(slot({ mode: 'off', askedFor: K, error: { key: K, dismissed: true } }).status).toBe('off')
    // think-first, shown, failed, dismissed -> "Show the coach" again
    expect(slot({ mode: 'think', askedFor: K, error: { key: K, dismissed: true } }).status).toBe('off')
  })

  it('mode off waits to be asked; nothing while it is not the hero’s turn', () => {
    expect(slot({ mode: 'off' }).status).toBe('off')
    expect(slot({ mode: 'off', askedFor: K }).status).toBe('loading')
    expect(slot({ decisionKey: null, answerFor: K }).status).toBe('idle')
  })
})

describe('stored preferences', () => {
  it('fall back to defaults', () => {
    expect(normalizeCoachMode('think')).toBe('think')
    expect(normalizeCoachMode('banana')).toBe('on')
    expect(normalizeCoachMode(null)).toBe('on')
    expect(normalizeVisibility('hud')).toBe('hud')
    expect(normalizeVisibility('x')).toBe('labeled')
  })
})
