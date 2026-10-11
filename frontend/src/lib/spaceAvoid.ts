// Where the UI sits, so the starfield can keep its stars out from under it. Any view
// reports its rects (viewport px) under its own name; <Space/> reads the union. Only the
// masks change when the rects do: the star SVG is never rebuilt.

import { useEffect, useSyncExternalStore } from 'react'
import { normaliseRects, rectsFromKey, rectsKey, type Rect } from './space'

export function createAvoidStore() {
  const owners = new Map<string, { key: string; rects: Rect[] }>()
  const listeners = new Set<() => void>()
  let snapshot: readonly Rect[] = []

  const emit = () => {
    snapshot = [...owners.values()].flatMap((o) => o.rects)
    listeners.forEach((l) => l())
  }

  return {
    set(owner: string, rects: readonly (Rect | null | undefined)[]) {
      const clean = normaliseRects(rects)
      const key = rectsKey(clean)
      if (owners.get(owner)?.key === key) return
      if (clean.length === 0) {
        if (!owners.delete(owner)) return
      } else owners.set(owner, { key, rects: clean })
      emit()
    },
    clear(owner: string) {
      if (owners.delete(owner)) emit()
    },
    get: (): readonly Rect[] => snapshot,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

const store = createAvoidStore()
const EMPTY: readonly Rect[] = []

/** Report this view's UI rects to the starfield (cleared when the view unmounts or hides). */
export function useSpaceAvoid(owner: string, rects: readonly (Rect | null | undefined)[] | null) {
  // A primitive key, so the effect runs only when a rect really moved.
  const key = rects ? rectsKey(normaliseRects(rects)) : ''
  useEffect(() => {
    store.set(owner, rectsFromKey(key))
  }, [owner, key])
  useEffect(() => () => store.clear(owner), [owner])
}

/** The union of every view's rects (for <Space/>). */
export function useSpaceAvoidRects(): readonly Rect[] {
  return useSyncExternalStore(store.subscribe, store.get, () => EMPTY)
}
