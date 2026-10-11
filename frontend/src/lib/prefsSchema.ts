// What the preferences store and how a stored value is read back. Storage errors are
// swallowed (private windows, quota); an unknown value falls back to the default.

export type VisibilityMode = 'labeled' | 'hud' | 'live'
/** on: the coach speaks on every hero turn. think: it works in the background and waits
 * until you ask ("Think first"). off: only when you ask. */
export type CoachMode = 'on' | 'think' | 'off'

export const STORAGE_KEYS = {
  deck: 'poker-deck',
  visibility: 'poker-visibility',
  coachMode: 'poker-coach-mode',
} as const

export const VISIBILITY_MODES: readonly VisibilityMode[] = ['labeled', 'hud', 'live']
export const COACH_MODES: readonly CoachMode[] = ['on', 'think', 'off']

export const DEFAULT_VISIBILITY: VisibilityMode = 'labeled'
export const DEFAULT_COACH_MODE: CoachMode = 'on'

export function normalizeVisibility(v: string | null | undefined): VisibilityMode {
  return VISIBILITY_MODES.includes(v as VisibilityMode) ? (v as VisibilityMode) : DEFAULT_VISIBILITY
}

export function normalizeCoachMode(v: string | null | undefined): CoachMode {
  return COACH_MODES.includes(v as CoachMode) ? (v as CoachMode) : DEFAULT_COACH_MODE
}

export function loadPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}
