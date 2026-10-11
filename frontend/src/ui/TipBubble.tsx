/**
 * TipBubble: the small opaque bubble that Tooltip and InfoButton show (sheet material,
 * 14 px squircle, 13 px text). Rendered in a portal (into the view's LayerHost) so a
 * transformed ancestor never offsets it; positioned by useTip. Not used directly by views.
 */
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useLayerTarget } from './layerContext'
import './TipBubble.css'

export interface TipBubbleProps {
  id: string
  open: boolean
  ref: (el: HTMLDivElement | null) => void
  children: ReactNode
  /** role="tooltip" for a description; omit for a toggletip's note. */
  role?: 'tooltip'
  interactive?: boolean
}

export function TipBubble({ id, open, ref, children, role, interactive = false }: TipBubbleProps) {
  const target = useLayerTarget()
  if (!target) return null
  return createPortal(
    <div id={id} ref={ref} role={role} hidden={!open} className={`tip ${interactive ? 'is-interactive' : ''}`}>
      {children}
    </div>,
    target,
  )
}
