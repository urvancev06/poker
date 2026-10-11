// Coach geometry the table layout needs to place the glance and the maths panel (the
// numbers are the Stage prototype's). Pure.

const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The ring in the phone row and in the maths sheet's head. */
export const ROW_RING_PX = 52
export const SHEET_RING_PX = 40
/** The side glance's ring when no hand size is known. */
export const SIDE_RING_PX = 112

/**
 * The side glance's ring for a hero card `heroCardW` px wide: 0.8 of the card's height,
 * between 88 and 124 px; 132 px on a large desktop (>= 1700 x 960).
 */
export function coachRingPx(heroCardW: number, vw: number, vh: number): number {
  if (vw >= 1700 && vh >= 960) return 132
  return clampNum(Math.round(heroCardW * 1.4 * 0.8), 88, 124)
}

/**
 * Width the side glance needs: the ring, a 24 px gap, then the verdict and the figures
 * (236 px, or 170 px when `tight`: Call EV drops). Below the tight width, use the row.
 */
export function coachSideWidth(ringPx: number, tight = false): number {
  return ringPx + 24 + (tight ? 170 : 236)
}

/** The desktop side panel (maths, log): 27% of the viewport, between 340 and 400 px. */
export function sidePanelWidth(vw: number): number {
  return Math.round(clampNum(vw * 0.27, 340, 400))
}
