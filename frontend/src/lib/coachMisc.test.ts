import { describe, expect, it } from 'vitest'
import { coachErrorCopy } from './coachError'
import { coachRingPx, coachSideWidth, sidePanelWidth } from './coachLayout'
import { parseShowWorking } from './coachPrefs'

describe('coachErrorCopy', () => {
  it('picks the copy by status code, and offers a retry only when it can help', () => {
    expect(coachErrorCopy({ code: 'network' })).toEqual({ headline: 'Can’t reach the coach.', canRetry: true })
    expect(coachErrorCopy({ code: 'conflict' })).toEqual({ headline: 'The coach speaks on your turn.', canRetry: true })
    expect(coachErrorCopy({ code: 'server' })).toEqual({ headline: 'The coach hit an error.', canRetry: true })
    expect(coachErrorCopy({ code: 'not_found' })).toEqual({ headline: 'This game is no longer on the server.', canRetry: false })
    expect(coachErrorCopy({ code: 'validation' }).canRetry).toBe(false)
    expect(coachErrorCopy({ code: 'bad_response' }).canRetry).toBe(true)
    expect(coachErrorCopy({ code: 'http' }).headline).toBe('The coach couldn’t answer.')
  })
})

describe('coach geometry', () => {
  it('sizes the side ring from the hero cards', () => {
    expect(coachRingPx(107, 1440, 900)).toBe(120)
    expect(coachRingPx(60, 1280, 720)).toBe(88)
    expect(coachRingPx(200, 1440, 900)).toBe(124)
    expect(coachRingPx(107, 1920, 1080)).toBe(132)
  })

  it('reserves room for the verdict and figures beside the ring', () => {
    expect(coachSideWidth(112)).toBe(372)
    expect(coachSideWidth(112, true)).toBe(306)
  })

  it('sizes the desktop side panel', () => {
    expect(sidePanelWidth(1440)).toBe(389)
    expect(sidePanelWidth(1100)).toBe(340)
    expect(sidePanelWidth(2560)).toBe(400)
  })
})

describe('show working', () => {
  it('is open only when stored as open', () => {
    expect(parseShowWorking('1')).toBe(true)
    expect(parseShowWorking('0')).toBe(false)
    expect(parseShowWorking(null)).toBe(false)
    expect(parseShowWorking('true')).toBe(false)
  })
})
