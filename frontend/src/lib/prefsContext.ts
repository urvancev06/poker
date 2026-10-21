// The preferences context and its hooks. Kept out of prefs.tsx so that file exports only
// its provider component (Fast Refresh needs component-only modules).
//
// Everything here is per device (localStorage) and display-only except coachMode, which
// decides when the table asks the coach, and engine, which picks the bots the next new
// game seats. Opponent visibility never reaches the backend,
// the bots or the coach maths.

import { createContext, useContext } from 'react'
import { DECKS, type DeckDef } from './decks'
import type { DeckId } from './deckIds'
import type { CoachMode, EngineChoice, VisibilityMode } from './prefsSchema'

export type { CoachMode, EngineChoice, VisibilityMode } from './prefsSchema'

export interface PrefsValue {
  deckId: DeckId
  deck: DeckDef
  setDeckId: (id: string) => void
  visibility: VisibilityMode
  setVisibility: (m: VisibilityMode) => void
  /** on / think (first) / off. Persisted (B21). */
  coachMode: CoachMode
  setCoachMode: (m: CoachMode) => void
  /** The bots of the next new game: current (v1) or the new engine (v2, beta). */
  engine: EngineChoice
  setEngine: (e: EngineChoice) => void
}

export const PrefsContext = createContext<PrefsValue>({
  deckId: 'standard',
  deck: DECKS[0],
  setDeckId: () => {},
  visibility: 'labeled',
  setVisibility: () => {},
  coachMode: 'on',
  setCoachMode: () => {},
  engine: 'v1',
  setEngine: () => {},
})

export const usePrefs = () => useContext(PrefsContext)
export const useDeck = () => useContext(PrefsContext).deck
