import { describe, expect, it } from 'vitest'
import { cardLabel, parseCard, splitCards } from './cards'
import { DECK_IDS, DECK_NAMES, normalizeDeckId } from './deckIds'

describe('cards', () => {
  it('parses codes and prints 10 for T', () => {
    expect(parseCard('Ah')).toEqual({ rank: 'A', suit: 'h' })
    expect(parseCard('Td')).toEqual({ rank: '10', suit: 'd' })
    expect(parseCard('Zz')).toBeNull()
    expect(parseCard('')).toBeNull()
    expect(parseCard(null)).toBeNull()
  })

  it('names cards for assistive tech', () => {
    expect(cardLabel('As')).toBe('Ace of spades')
    expect(cardLabel('Th')).toBe('10 of hearts')
    expect(cardLabel('7c')).toBe('7 of clubs')
    expect(cardLabel('Qd')).toBe('Queen of diamonds')
  })

  it('splits History’s joined hole cards', () => {
    expect(splitCards('Tc3h')).toEqual(['Tc', '3h'])
    expect(splitCards('Ts 8c Qc')).toEqual(['Ts', '8c', 'Qc'])
    expect(splitCards('')).toEqual([])
  })
})

describe('decks', () => {
  it('has five named decks', () => {
    expect(DECK_IDS).toHaveLength(5)
    expect(DECK_IDS.map((id) => DECK_NAMES[id])).toEqual(['Standard', 'Four-colour', 'Large index', 'Minimal', 'Classic'])
  })

  it('migrates the old ids and falls back to Standard', () => {
    expect(normalizeDeckId('offsuit')).toBe('standard')
    expect(normalizeDeckId('fourcolor')).toBe('four')
    expect(normalizeDeckId('bold')).toBe('large')
    expect(normalizeDeckId('noir')).toBe('minimal')
    expect(normalizeDeckId('classic')).toBe('classic')
    expect(normalizeDeckId('four')).toBe('four')
    expect(normalizeDeckId('nope')).toBe('standard')
    expect(normalizeDeckId(null)).toBe('standard')
  })
})
