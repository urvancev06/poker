// The behaviour shared by Tooltip and InfoButton: show on hover (mouse) and keyboard
// focus, toggle on tap, close on Escape, on leaving, or on a tap elsewhere; place the
// bubble above the anchor (flipping below when there is no room) by writing its position
// directly to the element (computed geometry).

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import { useEscape } from '../lib/escapeStack'
import { placeTip, type TipPlacement } from '../lib/tipPosition'

export interface Tip {
  id: string
  open: boolean
  /** Callback refs for the anchor and the bubble. */
  setAnchor: (el: HTMLElement | null) => void
  setBubble: (el: HTMLDivElement | null) => void
  onPointerEnter: (e: PointerEvent) => void
  onPointerLeave: (e: PointerEvent) => void
  onFocus: (e: FocusEvent) => void
  onBlur: () => void
  /** Tap / click toggles a pinned tip (touch has no hover). */
  toggle: () => void
}

export function useTip(placement: TipPlacement = 'top'): Tip {
  const id = useId()
  const anchor = useRef<HTMLElement | null>(null)
  const bubble = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hover || focus || pinned

  const close = useCallback(() => {
    setHover(false)
    setFocus(false)
    setPinned(false)
  }, [])
  useEscape(open, close)

  useLayoutEffect(() => {
    const a = anchor.current
    const b = bubble.current
    if (!open || !a || !b) return
    const r = a.getBoundingClientRect()
    const p = placeTip(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      { width: b.offsetWidth, height: b.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      placement,
    )
    b.style.left = `${p.left}px`
    b.style.top = `${p.top}px`
    b.dataset.placement = p.placement
  }, [open, placement])

  // A tap elsewhere closes a pinned tip.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Node
      if (anchor.current?.contains(t) || bubble.current?.contains(t)) return
      setPinned(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned])

  const setAnchor = useCallback((el: HTMLElement | null) => {
    anchor.current = el
  }, [])
  const setBubble = useCallback((el: HTMLDivElement | null) => {
    bubble.current = el
  }, [])

  return {
    id,
    open,
    setAnchor,
    setBubble,
    onPointerEnter: (e) => {
      if (e.pointerType === 'mouse') setHover(true)
    },
    onPointerLeave: (e) => {
      if (e.pointerType === 'mouse') setHover(false)
    },
    // Keyboard focus only: a tap focuses too, and then the tap's toggle decides.
    onFocus: (e) => {
      if (e.currentTarget.matches(':focus-visible')) setFocus(true)
    },
    onBlur: () => {
      setFocus(false)
      setPinned(false)
    },
    toggle: () => setPinned((p) => !p),
  }
}
