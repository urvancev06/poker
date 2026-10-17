// Which section of a long page is being read, for the in-page nav (Study). Pure.

/**
 * The index of the section being read: the last one whose top has passed `line` (px from
 * the viewport top). At the very bottom of the page the last section wins even if its top
 * never reaches the line (a short closing section). Before the first, the first.
 */
export function activeSection(tops: readonly number[], line: number, atBottom: boolean): number {
  if (tops.length === 0) return -1
  if (atBottom) return tops.length - 1
  let active = 0
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= line) active = i
    else break
  }
  return active
}

/** True when the page cannot scroll any further (within a pixel of rounding). */
export function isAtBottom(scrollY: number, viewportH: number, docH: number): boolean {
  return docH - (scrollY + viewportH) <= 1
}
