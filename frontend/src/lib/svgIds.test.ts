import { describe, expect, it } from 'vitest'
import { suffixIdRefs } from './svgIds'

const ids = new Set(['_r_5_s', '_r_5_c'])

describe('suffixIdRefs (a cloned card back keeps its own gradient and clip)', () => {
  it('rewrites url(#id) references to the renamed ids', () => {
    expect(suffixIdRefs('url(#_r_5_s)', ids, '-g1')).toBe('url(#_r_5_s-g1)')
    expect(suffixIdRefs('url("#_r_5_c")', ids, '-g1')).toBe('url("#_r_5_c-g1")')
    expect(suffixIdRefs("url( '#_r_5_c' )", ids, '-g2')).toBe("url('#_r_5_c-g2')")
  })

  it('rewrites every reference inside a style value', () => {
    expect(suffixIdRefs('fill: url(#_r_5_s); clip-path: url(#_r_5_c)', ids, '-g3')).toBe('fill: url(#_r_5_s-g3); clip-path: url(#_r_5_c-g3)')
  })

  it('rewrites a bare #id href', () => {
    expect(suffixIdRefs('#_r_5_s', ids, '-g4')).toBe('#_r_5_s-g4')
  })

  it('leaves other ids and plain values alone', () => {
    expect(suffixIdRefs('url(#elsewhere)', ids, '-g5')).toBe('url(#elsewhere)')
    expect(suffixIdRefs('#elsewhere', ids, '-g5')).toBe('#elsewhere')
    expect(suffixIdRefs('#ffffff', ids, '-g5')).toBe('#ffffff')
    expect(suffixIdRefs('none', ids, '-g5')).toBe('none')
  })
})
