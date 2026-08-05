// The preferences context and its hooks. Kept out of prefs.tsx so that file
// exports only its provider component (Fast Refresh needs component-only
// modules); PrefsProvider imports PrefsContext from here.

import { createContext, useContext } from 'react'
import { DECKS, type DeckDef } from './decks'

// Opponent visibility is display-only: it never reaches the backend and never
// touches bot behaviour or coach maths. Persisted so the Labeled -> HUD -> Live
// progression survives a reload rather than resetting to the training wheels.
export type VisibilityMode = 'labeled' | 'hud' | 'live'

export interface PrefsValue {
  deckId: string
  deck: DeckDef
  setDeckId: (id: string) => void
  visibility: VisibilityMode
  setVisibility: (m: VisibilityMode) => void
}

export const PrefsContext = createContext<PrefsValue>({
  deckId: 'offsuit',
  deck: DECKS[0],
  setDeckId: () => {},
  visibility: 'labeled',
  setVisibility: () => {},
})

export const usePrefs = () => useContext(PrefsContext)
export const useDeck = () => useContext(PrefsContext).deck
