// The space layer's pure parts: the deterministic starfield, the horizon geometry and the
// masks that keep stars out from under the UI. Ported from the prototype's space.js; the
// <Space/> component (ui/Space.tsx) renders these once.

/** A viewport rectangle (px). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Star {
  cx: number
  cy: number
  r: number
  fill: string
  opacity: number
}

/** The field's own coordinate box. The SVG is 108% of the viewport, centred, "slice". */
export const FIELD_W = 1600
export const FIELD_H = 1000

// mulberry32: a tiny seeded PRNG, so the sky is the same on every load.
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

interface LayerSpec {
  seed: number
  count: number
  rMin: number
  rMax: number
  oMin: number
  oMax: number
}

// Stars thin out towards the limb, where the atmosphere would wash them out.
function limbFade(y: number): number {
  return 1 - Math.min(1, Math.max(0, (y - (FIELD_H - 380)) / 380)) * 0.85
}

function layer({ seed, count, rMin, rMax, oMin, oMax }: LayerSpec): Star[] {
  const rnd = mulberry32(seed)
  const out: Star[] = []
  for (let i = 0; i < count; i++) {
    const cx = rnd() * FIELD_W
    const cy = rnd() * FIELD_H
    const r = rMin + Math.pow(rnd(), 2.4) * (rMax - rMin)
    const o = (oMin + rnd() * (oMax - oMin)) * limbFade(cy)
    const h = rnd()
    const fill = h < 0.1 ? '#d4e4ff' : h > 0.95 ? '#ffeedd' : '#ffffff'
    out.push({ cx: round(cx, 1), cy: round(cy, 1), r: round(r, 2), fill, opacity: round(o, 2) })
  }
  return out
}

/** The far field: many faint, small stars. */
export const FAR_STARS: readonly Star[] = layer({ seed: 7, count: 260, rMin: 0.35, rMax: 0.75, oMin: 0.18, oMax: 0.5 })
/** The near field: fewer, brighter; the only layer that does the parallax push-in. */
export const NEAR_STARS: readonly Star[] = layer({ seed: 23, count: 70, rMin: 0.6, rMax: 1.15, oMin: 0.4, oMax: 0.85 })

/** A handful of bright stars with a halo, kept clear of the limb. */
export const BRIGHT_STARS: readonly { cx: number; cy: number }[] = (() => {
  const rnd = mulberry32(101)
  const out: { cx: number; cy: number }[] = []
  for (let i = 0; i < 5; i++) {
    out.push({ cx: round(FIELD_W * 0.05 + rnd() * FIELD_W * 0.9, 1), cy: round(40 + rnd() * (FIELD_H - 480), 1) })
  }
  return out
})()

/* ---------- horizon ---------- */

/** Height of the limb above the viewport bottom: low enough that every floating control
 * sits fully above it with clear air. */
export function limbHeight(viewportH: number): number {
  return Math.round(Math.min(60, Math.max(34, viewportH * 0.055)))
}

/** Radius of the planet: the CSS draws it 300vmax wide. */
export function planetRadius(viewportW: number, viewportH: number): number {
  return (Math.max(viewportW, viewportH) * 3) / 2
}

/** How far the limb has dropped below its crest at horizontal position x. */
export function limbSag(x: number, viewportW: number, viewportH: number): number {
  const R = planetRadius(viewportW, viewportH)
  const dx = x - viewportW / 2
  return R - Math.sqrt(Math.max(0, R * R - dx * dx))
}

/** Top of the limb (viewport y) at horizontal position x. */
export function limbTop(x: number, viewportW: number, viewportH: number): number {
  return viewportH - limbHeight(viewportH) + limbSag(x, viewportW, viewportH)
}

/** Where the one light source (a star rising behind the limb) sits: 62% across (72% on
 * narrow screens), on the limb. `bottom` is measured up from the horizon's own bottom
 * edge, so it holds whether the horizon is pinned to the viewport or to a page's end. */
export function sunPlacement(viewportW: number, viewportH: number): { left: number; bottom: number; limb: number } {
  const left = viewportW * (viewportW < 700 ? 0.72 : 0.62)
  const limb = limbHeight(viewportH)
  return { left: round(left, 1), bottom: round(limb - limbSag(left, viewportW, viewportH), 1), limb }
}

/* ---------- avoidance masks ---------- */

export interface MaskOptions {
  /** Grow every rect by this much (px). */
  pad?: number
  /** Alpha left inside a rect: 0 drops the stars, 0.3 leaves a whisper. */
  keep?: number
  /** Fade under the top bar: alpha from 0 to `topFadeStart` px, ramping to 1 at `topFadeEnd`. */
  topFade?: { alpha: number; start: number; end: number } | null
}

export interface MaskStyle {
  maskImage: string
  maskSize: string
  maskPosition: string
  maskRepeat: string
  maskComposite: string
}

export const TOP_FADE = { alpha: 0.2, start: 58, end: 120 } as const

/** Keep only rects that have an area, rounded to whole px (a stable key for memoising). */
export function normaliseRects(rects: readonly (Rect | null | undefined)[]): Rect[] {
  const out: Rect[] = []
  for (const r of rects) {
    if (!r || !(r.w > 0) || !(r.h > 0)) continue
    out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })
  }
  return out
}

export function rectsKey(rects: readonly Rect[]): string {
  return rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';')
}

/** The inverse of rectsKey. */
export function rectsFromKey(key: string): Rect[] {
  if (!key) return []
  return key.split(';').map((part) => {
    const [x, y, w, h] = part.split(',').map(Number)
    return { x, y, w, h }
  })
}

/**
 * A CSS mask for a full-viewport star layer: the base (opaque, or the top-bar fade) minus
 * one hole per rect. Holes are plain gradient layers, so moving the UI only changes these
 * strings; the star SVG itself is never rebuilt. Compositing runs bottom-up: the holes are
 * unioned (add), then the base is cut by them (subtract).
 */
export function holeMask(rects: readonly Rect[], { pad = 0, keep = 0, topFade = TOP_FADE }: MaskOptions = {}): MaskStyle {
  const base = topFade
    ? `linear-gradient(rgba(0, 0, 0, ${topFade.alpha}) 0 ${topFade.start}px, #000 ${topFade.end}px)`
    : 'linear-gradient(#000, #000)'
  const images = [base]
  const sizes = ['100% 100%']
  const positions = ['0 0']
  const composites = ['subtract']
  const a = round(1 - keep, 3)
  const hole = `linear-gradient(rgba(0, 0, 0, ${a}), rgba(0, 0, 0, ${a}))`
  for (const r of rects) {
    images.push(hole)
    sizes.push(`${r.w + 2 * pad}px ${r.h + 2 * pad}px`)
    positions.push(`${r.x - pad}px ${r.y - pad}px`)
    composites.push('add')
  }
  if (rects.length === 0) composites[0] = 'add'
  return {
    maskImage: images.join(', '),
    maskSize: sizes.join(', '),
    maskPosition: positions.join(', '),
    maskRepeat: 'no-repeat',
    maskComposite: composites.join(', '),
  }
}
