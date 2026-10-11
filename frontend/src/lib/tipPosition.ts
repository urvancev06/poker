// Where a tooltip goes: above its anchor (or below), centred on it, flipped when there is
// no room, and clamped inside the viewport with a margin.

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export type TipPlacement = 'top' | 'bottom'

export function placeTip(
  anchor: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  prefer: TipPlacement = 'top',
  gap = 8,
  margin = 8,
): { left: number; top: number; placement: TipPlacement } {
  const above = anchor.top - gap - tip.height
  const below = anchor.top + anchor.height + gap
  const fitsAbove = above >= margin
  const fitsBelow = below + tip.height <= viewport.height - margin
  let placement = prefer
  if (prefer === 'top' && !fitsAbove && fitsBelow) placement = 'bottom'
  if (prefer === 'bottom' && !fitsBelow && fitsAbove) placement = 'top'
  const top = placement === 'top' ? above : below
  const centred = anchor.left + anchor.width / 2 - tip.width / 2
  const maxLeft = Math.max(margin, viewport.width - margin - tip.width)
  const left = Math.min(Math.max(centred, margin), maxLeft)
  return { left: Math.round(left), top: Math.round(top), placement }
}
