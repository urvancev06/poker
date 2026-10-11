// One Escape key for the whole app. Menus, sheets and popovers register while open; a
// single document listener closes only the top-most (the last one opened), so Escape in
// a tooltip inside a sheet closes the tooltip, and the next Escape closes the sheet.

import { useEffect, useEffectEvent } from 'react'

export type EscapeHandler = () => void

export function createEscapeStack() {
  const stack: { id: number; handler: EscapeHandler }[] = []
  let next = 1
  return {
    /** Register a layer; returns the function that removes it. */
    push(handler: EscapeHandler): () => void {
      const id = next++
      stack.push({ id, handler })
      return () => {
        const i = stack.findIndex((e) => e.id === id)
        if (i >= 0) stack.splice(i, 1)
      }
    },
    /** Run the top-most handler. Returns whether one ran. */
    escape(): boolean {
      const top = stack[stack.length - 1]
      if (!top) return false
      top.handler()
      return true
    },
    get size() {
      return stack.length
    },
  }
}

const shared = createEscapeStack()
let listening = false

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  if (shared.escape()) e.preventDefault()
}

function ensureListener() {
  if (listening || typeof document === 'undefined') return
  document.addEventListener('keydown', onKeyDown)
  listening = true
}

/** While `active`, Escape calls `onEscape` (if this is the top-most open layer). */
export function useEscape(active: boolean, onEscape: EscapeHandler) {
  const handle = useEffectEvent(onEscape)
  useEffect(() => {
    if (!active) return
    ensureListener()
    return shared.push(() => handle())
  }, [active])
}
