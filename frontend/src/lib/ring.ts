// Geometry of the coach equity ring (ui/Ring.tsx), in its 120 x 120 viewBox.
//
//   outer ring  r 50   the fill is realized equity, on a faint track in the tone
//   inner ring  r 35   the price arc (required equity), in --fog on a faint track
//   notch              one ink line with a black halo across both rings at the price
//   raw dot            raw equity: a small ink dot OUTSIDE the outer track, so it can
//                      never merge with the price notch (it sits beyond the notch's tip)

export type Tone = 'good' | 'neutral' | 'close' | 'fold'

const TONES: ReadonlySet<string> = new Set(['good', 'neutral', 'close', 'fold'])

/** The backend `tone`, or neutral for anything unknown. Never parsed from the verdict. */
export function normalizeTone(tone: string | null | undefined): Tone {
  return tone && TONES.has(tone) ? (tone as Tone) : 'neutral'
}

export type RingVariant = 'lg' | 'sm'

/** Small rings (under 72 px) use thicker strokes so over/under still reads. */
export function ringVariant(sizePx: number): RingVariant {
  return sizePx < 72 ? 'sm' : 'lg'
}

export const RING = {
  c: 60,
  outer: 50,
  inner: 35,
  lg: { outerW: 14, innerW: 7, halo: [29, 59.5], dotAt: 66, dotR: 2.4 },
  sm: { outerW: 17, innerW: 9, halo: [25, 62], dotAt: 70, dotR: 3.6 },
} as const

export function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0
  return Math.min(100, Math.max(0, p))
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** A point at `pct` around the ring (0 at twelve o'clock, clockwise) and radius r. */
export function arcPoint(pct: number, r: number): [number, number] {
  const a = (clampPct(pct) / 100) * Math.PI * 2 - Math.PI / 2
  return [r2(RING.c + r * Math.cos(a)), r2(RING.c + r * Math.sin(a))]
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

function segment(pct: number, r0: number, r1: number): Segment {
  const [x1, y1] = arcPoint(pct, r0)
  const [x2, y2] = arcPoint(pct, r1)
  return { x1, y1, x2, y2 }
}

/** The price notch: the halo (wider, black) and the ink line on top. */
export function notch(needPct: number, variant: RingVariant): { halo: Segment; line: Segment } {
  const [r0, r1] = RING[variant].halo
  return { halo: segment(needPct, r0, r1), line: segment(needPct, r0 + 0.5, r1 - 0.5) }
}

/** The raw-equity dot, or null when raw and realized are within a point of each other. */
export function rawDot(realizedPct: number, rawPct: number | null | undefined, variant: RingVariant): { cx: number; cy: number; r: number } | null {
  if (rawPct == null || !Number.isFinite(rawPct) || Math.abs(rawPct - realizedPct) < 1) return null
  const [cx, cy] = arcPoint(rawPct, RING[variant].dotAt)
  return { cx, cy, r: RING[variant].dotR }
}

/** The fill gradient runs from the arc's start to its tip, in the rotated (-90deg) frame. */
export function fillGradient(realizedPct: number): Segment {
  const a = (clampPct(realizedPct) / 100) * Math.PI * 2
  return { x1: 110, y1: 60, x2: r2(60 + 50 * Math.cos(a)), y2: r2(60 + 50 * Math.sin(a)) }
}

/** stroke-dasharray for an arc on a pathLength=100 circle. */
export function dash(pct: number): string {
  return `${r2(clampPct(pct))} 100`
}
