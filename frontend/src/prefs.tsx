// Preferences provider: card deck, opponent visibility and coach mode, persisted per
// device in localStorage and shared via context (lib/prefsContext.ts). Unknown stored
// values fall back to the defaults; old deck ids migrate (lib/deckIds.ts).

import { useMemo, useState, type ReactNode } from 'react'
import { deckById } from './lib/decks'
import { normalizeDeckId, type DeckId } from './lib/deckIds'
import { PrefsContext, type PrefsValue } from './lib/prefsContext'
import {
  STORAGE_KEYS,
  loadPref,
  normalizeCoachMode,
  normalizeVisibility,
  savePref,
  type CoachMode,
  type VisibilityMode,
} from './lib/prefsSchema'

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [deckId, setDeck] = useState<DeckId>(() => normalizeDeckId(loadPref(STORAGE_KEYS.deck)))
  const [visibility, setVis] = useState<VisibilityMode>(() => normalizeVisibility(loadPref(STORAGE_KEYS.visibility)))
  const [coachMode, setCoach] = useState<CoachMode>(() => normalizeCoachMode(loadPref(STORAGE_KEYS.coachMode)))

  const value = useMemo<PrefsValue>(
    () => ({
      deckId,
      deck: deckById(deckId),
      setDeckId: (id: string) => {
        const next = normalizeDeckId(id)
        setDeck(next)
        savePref(STORAGE_KEYS.deck, next)
      },
      visibility,
      setVisibility: (m: VisibilityMode) => {
        setVis(m)
        savePref(STORAGE_KEYS.visibility, m)
      },
      coachMode,
      setCoachMode: (m: CoachMode) => {
        setCoach(m)
        savePref(STORAGE_KEYS.coachMode, m)
      },
    }),
    [deckId, visibility, coachMode],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}
