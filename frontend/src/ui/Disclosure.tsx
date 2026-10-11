/**
 * Disclosure: a button that shows and hides the block under it ("Show working", "How this
 * is worked out", a stats row's definition). The button carries aria-expanded and
 * aria-controls; the chevron turns 90 degrees on the spring; the opened block settles in
 * (opacity + 4 px, reduced motion: instant).
 *
 *   <Disclosure summary="Show working" open={open} onOpenChange={setOpen}>...</Disclosure>
 *
 * Props: summary (the button's label); children (the block); open + onOpenChange
 * (controlled, e.g. to remember the state in prefs) or defaultOpen (uncontrolled);
 * divider (a hairline above the button, default true); className (the wrapper);
 * buttonClassName; panelClassName.
 */
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconChevronRight } from './Icons'
import { play } from '../lib/motion'

export interface DisclosureProps {
  summary: ReactNode
  children: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  divider?: boolean
  className?: string
  buttonClassName?: string
  panelClassName?: string
}

export function Disclosure({
  summary,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  divider = true,
  className = '',
  buttonClassName = '',
  panelClassName = '',
}: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen)
  const isOpen = open ?? inner
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  // Only a toggle by the user animates; mounting already open does not.
  const toggled = useRef(false)

  const toggle = () => {
    toggled.current = true
    if (open === undefined) setInner(!isOpen)
    onOpenChange?.(!isOpen)
  }

  useLayoutEffect(() => {
    if (!isOpen || !toggled.current) return
    toggled.current = false
    play(panel.current, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 320 })
  }, [isOpen])

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={toggle}
        className={`group flex min-h-11 w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-callout font-medium text-signal ${
          divider ? 'border-t border-solid border-sheet-line' : ''
        } ${buttonClassName}`}
      >
        <span>{summary}</span>
        <IconChevronRight className="size-3.5 shrink-0 transition-transform duration-[460ms] ease-spring group-aria-expanded:rotate-90" />
      </button>
      <div id={id} ref={panel} hidden={!isOpen} className={panelClassName}>
        {children}
      </div>
    </div>
  )
}
