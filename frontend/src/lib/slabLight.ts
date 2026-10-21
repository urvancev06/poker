// How the slab's side wall is lit (components/table/Felt.tsx SlabSide draws it). The light
// comes from the planet below and in front: the wall brightens down its height to a lower
// bevel that faces it, is brightest under the light source, and darkens toward the ends,
// where it turns away from you. Across the wall everything is a smooth function sampled into
// gradient stops, so no two stops can collide into a hard edge wherever the light sits.

type RGB = readonly [number, number, number]

/** The limb's light where it catches an edge (the card backs' rim and engraving, the wall's
 * lower bevel); index.css --limb-light is the same colour, as channels, for CSS. */
export const LIMB_LIGHT_RGB: RGB = [180, 216, 255]
export const LIMB_LIGHT = `#${LIMB_LIGHT_RGB.map((c) => c.toString(16).padStart(2, '0')).join('')}`

/** Down the wall, from just under the top's rim (0) to the bottom edge (1): a soft
 * highlight where the rounded top edge turns down, a deeper belly, then the lower bevel. */
export const WALL_RAMP: readonly (readonly [number, RGB])[] = [
  [0, [30, 62, 112]],
  [0.15, [20, 42, 80]],
  [0.45, [16, 36, 72]],
  [0.7, [24, 56, 108]],
  [0.88, [40, 90, 160]],
  [0.97, [70, 135, 215]],
  [1, [105, 165, 235]],
]

/** The ramp's colour at a depth (0..1). */
export function wallColor(d: number): string {
  let i = 1
  while (i < WALL_RAMP.length - 1 && WALL_RAMP[i][0] < d) i++
  const [d0, c0] = WALL_RAMP[i - 1]
  const [d1, c1] = WALL_RAMP[i]
  const t = Math.max(0, Math.min(1, (d - d0) / (d1 - d0)))
  const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t))
  return `rgb(${c[0]} ${c[1]} ${c[2]})`
}

/** One fill per band (band k covers depth k/n down; its visible strip is k/n..(k+1)/n). */
export const wallFills = (n: number): string[] => Array.from({ length: n }, (_, k) => wallColor((k + 0.5) / n))

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lit = (x: number, lx: number, width: number) => Math.exp(-(((x - lx) / width) ** 2))
const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Across the wall (0 its left end, 1 its right): the black laid over the ramp. None under
 * the light (lx), more toward the ends. */
export function wallShade(x: number, lx: number): number {
  const ends = 1 - smooth(0, 0.26, Math.min(x, 1 - x))
  return r3((0.3 + 0.34 * ends) * (1 - lit(x, lx, 0.2)))
}

/** The lower edge's line: brightest under the light, never gone at the ends (so the
 * silhouette still reads against the void there). */
export function edgeLight(x: number, lx: number): number {
  return r3(0.16 + 0.62 * lit(x, lx, 0.24))
}

/** Where the light falls across the wall (0..1), from the light source's viewport x. */
export function lightAcross(lightX: number, x0: number, w: number): number {
  return Math.max(0.36, Math.min(0.74, (lightX - x0) / w))
}

/** Gradient stops for a function across the wall. */
export const acrossStops = (f: (x: number, lx: number) => number, lx: number, n = 21): [number, number][] =>
  Array.from({ length: n }, (_, i) => [i / (n - 1), f(i / (n - 1), lx)])
