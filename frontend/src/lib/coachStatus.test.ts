import { describe, expect, it } from 'vitest'
import { deriveCoachStatus, type CoachStatusInput } from './coachStatus'
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

describe('stored preferences', () => {
  it('fall back to defaults', () => {
    expect(normalizeCoachMode('think')).toBe('think')
    expect(normalizeCoachMode('banana')).toBe('on')
    expect(normalizeCoachMode(null)).toBe('on')
    expect(normalizeVisibility('hud')).toBe('hud')
    expect(normalizeVisibility('x')).toBe('labeled')
  })
})
