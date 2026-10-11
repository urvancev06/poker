// The five decks' ids and names, and the migration from the pre-Stage ids, kept apart from
// the drawing code (lib/decks.tsx) so it can be tested and imported without JSX.

export const DECK_IDS = ['standard', 'four', 'large', 'minimal', 'classic'] as const
export type DeckId = (typeof DECK_IDS)[number]

export const DEFAULT_DECK: DeckId = 'standard'

export const DECK_NAMES: Record<DeckId, string> = {
  standard: 'Standard',
  four: 'Four-colour',
  large: 'Large index',
  minimal: 'Minimal',
  classic: 'Classic',
}

// The old ids (stored in localStorage 'poker-deck' before the redesign) map to the
// nearest new deck, so nobody loses a four-colour choice.
const LEGACY: Record<string, DeckId> = {
  offsuit: 'standard',
  fourcolor: 'four',
  bold: 'large',
  noir: 'minimal',
  classic: 'classic',
}

export function normalizeDeckId(id: string | null | undefined): DeckId {
  if (!id) return DEFAULT_DECK
  if ((DECK_IDS as readonly string[]).includes(id)) return id as DeckId
  return LEGACY[id] ?? DEFAULT_DECK
}
