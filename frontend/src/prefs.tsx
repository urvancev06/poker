// Board preferences: card deck and opponent visibility, persisted in
// localStorage and shared via context. The decks live in lib/decks.tsx, the
// context and its hooks in lib/prefsContext.ts; this file holds the provider.

import { useEffect, useState, type ReactNode } from 'react'
import { DECKS } from './lib/decks'
import { PrefsContext, type VisibilityMode } from './lib/prefsContext'

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

const VISIBILITY_MODES: VisibilityMode[] = ['labeled', 'hud', 'live']

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [deckId, setDeckId] = useState(() => load('poker-deck', 'offsuit'))
  const [visibility, setVisibility] = useState<VisibilityMode>(() => {
    const v = load('poker-visibility', 'labeled') as VisibilityMode
    return VISIBILITY_MODES.includes(v) ? v : 'labeled'
  })

  useEffect(() => {
    save('poker-deck', deckId)
  }, [deckId])

  useEffect(() => {
    save('poker-visibility', visibility)
  }, [visibility])

  const deck = DECKS.find((d) => d.id === deckId) ?? DECKS[0]
  return (
    <PrefsContext.Provider value={{ deckId, deck, setDeckId, visibility, setVisibility }}>
      {children}
    </PrefsContext.Provider>
  )
}
