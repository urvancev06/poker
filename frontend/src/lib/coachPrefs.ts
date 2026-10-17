// Whether "Show working" is open in the maths sheet. It is remembered across decisions
// (and visits, per device): someone who reads the working wants it on the next spot too.
// A tiny external store, so every MathsSheet instance reads the same value.

import { useSyncExternalStore } from 'react'
import { loadPref, savePref } from './prefsSchema'

export const SHOW_WORKING_KEY = 'poker-coach-working'

/** The stored value as a boolean ("1" = open); anything else is closed. */
export function parseShowWorking(stored: string | null): boolean {
  return stored === '1'
}

let open: boolean | null = null
const listeners = new Set<() => void>()

function read(): boolean {
  if (open === null) open = parseShowWorking(loadPref(SHOW_WORKING_KEY))
  return open
}

export function setShowWorking(next: boolean) {
  if (read() === next) return
  open = next
  savePref(SHOW_WORKING_KEY, next ? '1' : '0')
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** [open, setOpen] for the "Show working" disclosure. */
export function useShowWorking(): [boolean, (open: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, () => false), setShowWorking]
}
