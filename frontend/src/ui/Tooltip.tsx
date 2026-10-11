/**
 * Tooltip: a short description for something on screen ("Median of 290 decisions"). It
 * shows on hover and on keyboard focus, and a tap toggles it, so it works on touch.
 * Escape, leaving, or a tap elsewhere hides it. The anchor gets aria-describedby.
 *
 *   <Tooltip content="Median of 290 decisions"><span>8.3 s</span></Tooltip>
 *
 * Props: content; children (the anchor's content); focusable (default true: the anchor
 * joins the tab order, for non-interactive text; pass false when children is already a
 * button); placement 'top' (default) | 'bottom'; className (the anchor span).
 * Never put the only copy of essential information in a tooltip.
 */
import type { ReactNode } from 'react'
import type { TipPlacement } from '../lib/tipPosition'
import { TipBubble } from './TipBubble'
import { useTip } from './useTip'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  focusable?: boolean
  placement?: TipPlacement
  className?: string
}

export function Tooltip({ content, children, focusable = true, placement = 'top', className = '' }: TooltipProps) {
  const { id, open, setAnchor, setBubble, toggle, onPointerEnter, onPointerLeave, onFocus, onBlur } = useTip(placement)
  return (
    <>
      <span
        ref={setAnchor}
        tabIndex={focusable ? 0 : undefined}
        aria-describedby={id}
        className={`rounded-[6px] ${className}`}
        onClick={toggle}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {children}
      </span>
      <TipBubble id={id} ref={setBubble} open={open} role="tooltip">
        {content}
      </TipBubble>
    </>
  )
}
