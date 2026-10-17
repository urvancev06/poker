// A bottom sheet's two detents (ui/Sheet.tsx). Pure.

/** The medium detent never goes under this, however little room is left above it: the
 * head and a few lines of the body. */
export const SHEET_MEDIUM_MIN = 180

/**
 * Medium and large heights for a bottom sheet ending `bottom` px above the bottom of a
 * `vh` px viewport whose top bar is `barH` tall.
 *   large   up to 8 px under the top bar
 *   medium  about 56% of the screen (at least 320 px); with `mediumTop` (a viewport y, e.g.
 *           just under the hero's cards) it stops there instead, so what is above stays in
 *           sight, but never under SHEET_MEDIUM_MIN
 */
export function sheetHeights(vh: number, barH: number, bottom: number, mediumTop?: number): { medium: number; large: number } {
  const large = Math.max(200, vh - bottom - (barH + 8))
  let medium = Math.min(large, Math.max(320, Math.round(vh * 0.56)))
  if (mediumTop != null) medium = Math.min(medium, Math.max(SHEET_MEDIUM_MIN, Math.round(vh - bottom - mediumTop)))
  return { medium, large }
}
