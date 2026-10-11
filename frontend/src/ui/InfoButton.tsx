/**
 * InfoButton: a small circled "i" that explains something on demand (the bb/100 variance
 * caveat). Hover or focus shows the note; a click or tap pins it open (aria-expanded), so
 * it works on touch; Escape or a tap elsewhere closes it. 24 px visible, 44 px to touch.
 *
 *   <InfoButton label="About bb/100">Over a few hundred hands, bb/100 is mostly luck.</InfoButton>
 *
 * Props: label (accessible name of the button); children (the note); placement; className.
 */
import type { ReactNode } from 'react'
import type { TipPlacement } from '../lib/tipPosition'
import { IconInfo } from './Icons'
import { TipBubble } from './TipBubble'
import { useTip } from './useTip'

export interface InfoButtonProps {
  label: string
  children: ReactNode
  placement?: TipPlacement
  className?: string
}

export function InfoButton({ label, children, placement = 'top', className = '' }: InfoButtonProps) {
  const { id, open, setAnchor, setBubble, toggle, onPointerEnter, onPointerLeave, onFocus, onBlur } = useTip(placement)
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={id}
        onClick={toggle}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`relative inline-grid size-6 shrink-0 place-items-center rounded-full border-0 bg-transparent p-0 text-fog transition-colors duration-200 before:absolute before:-inset-2.5 before:content-[''] hover:text-ink aria-expanded:text-ink ${className}`}
      >
        <IconInfo className="size-4" />
      </button>
      <TipBubble id={id} ref={setBubble} open={open} interactive>
        {children}
      </TipBubble>
    </>
  )
}
