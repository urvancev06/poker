// Whether the browser keeps what Preferences saves. The provider swallows storage errors
// (private windows, blocked site data, quota), so a choice still applies for the visit;
// this lets the page say so instead of claiming "Saved on this device". Pure.

const PROBE = 'poker-prefs-probe'

/** True when a write and a removal both succeed. */
export function canPersist(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined): boolean {
  if (!storage) return false
  try {
    storage.setItem(PROBE, '1')
    storage.removeItem(PROBE)
    return true
  } catch {
    return false
  }
}

/** The browser's localStorage, or null where even reading it throws. */
export function localStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
