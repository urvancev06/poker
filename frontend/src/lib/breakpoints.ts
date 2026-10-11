// The two breakpoints, defined once (index.css --bp-sm / --bp-lg and @theme
// --breakpoint-sm / --breakpoint-lg hold the same numbers; a test keeps them equal).
//   phone  < 600 px    one column, bottom sheets, the coach as a row above the dock
//   tablet 600-1099    bottom sheets, the coach beside the hand when there is room
//   desk   >= 1100     the centred nav, side panels

import { useSyncExternalStore } from 'react'

export const BP = { sm: 600, lg: 1100 } as const

export type LayoutKind = 'phone' | 'tablet' | 'desk'

export function layoutKind(width: number): LayoutKind {
  if (width < BP.sm) return 'phone'
  if (width < BP.lg) return 'tablet'
  return 'desk'
}

const QUERIES = [`(max-width: ${BP.sm - 0.02}px)`, `(min-width: ${BP.lg}px)`]

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mqs = QUERIES.map((q) => window.matchMedia(q))
  mqs.forEach((mq) => mq.addEventListener('change', onChange))
  return () => mqs.forEach((mq) => mq.removeEventListener('change', onChange))
}

function snapshot(): LayoutKind {
  if (typeof window === 'undefined') return 'desk'
  return layoutKind(window.innerWidth)
}

/** 'phone' | 'tablet' | 'desk', re-rendering only when the kind changes. */
export function useLayoutKind(): LayoutKind {
  return useSyncExternalStore(subscribe, snapshot, () => 'desk')
}

// Viewport size, for layout projections (re-renders on every resize: use sparingly).
let size = { w: 0, h: 0 }
function readSize() {
  if (typeof window === 'undefined') return size
  const w = window.innerWidth
  const h = window.innerHeight
  if (w !== size.w || h !== size.h) size = { w, h }
  return size
}
function subscribeSize(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('resize', onChange, { passive: true })
  return () => window.removeEventListener('resize', onChange)
}
const SERVER_SIZE = { w: 1440, h: 900 }

/** { w, h } of the viewport; the object is stable until the size changes. */
export function useViewportSize(): { w: number; h: number } {
  return useSyncExternalStore(subscribeSize, readSize, () => SERVER_SIZE)
}

/** The top bar's height (index.css --bar-h): 56 on a phone, 64 otherwise. */
export function barHeight(viewportW: number): number {
  return viewportW < BP.sm ? 56 : 64
}
