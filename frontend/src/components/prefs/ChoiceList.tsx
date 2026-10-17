/**
 * ChoiceList: one exclusive choice where every option needs its explanation in view
 * (coach mode, opponent visibility). A reading sheet (#1c1c1e) of rows, each a radio: the
 * name, what it does, an optional sample on the right, and a check on the chosen one (the
 * cue that is not colour; the chosen name is heavier too). Roving focus like Segmented:
 * Tab lands on the chosen row, the arrow keys and Home / End move and choose.
 *
 *   <ChoiceList labelledBy={headingId} value={mode} onChange={setMode}
 *     options={[{ value: 'on', label: 'On', description: '...' }]} />
 *
 * Props: options ({ value, label, description, aside? }); value; onChange; labelledBy
 * (the id of the visible heading); describedBy (a note that applies to every option);
 * className.
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface Choice<T extends string> {
  value: T
  label: string
  description: string
  /** Shown on the right from 600 px (a sample of what the choice looks like). */
  aside?: ReactNode
}

export interface ChoiceListProps<T extends string> {
  options: readonly Choice<T>[]
  value: T
  onChange: (value: T) => void
  labelledBy: string
  describedBy?: string
  className?: string
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

export function CheckMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4.5 10.5l3.6 3.6 7.4-8.2" />
    </svg>
  )
}

export function ChoiceList<T extends string>({ options, value, onChange, labelledBy, describedBy, className = '' }: ChoiceListProps<T>) {
  const uid = useId()
  const group = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value)
    let next = -1
    if (e.key in STEP) next = (i + STEP[e.key] + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(options[next].value)
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div ref={group} role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} onKeyDown={onKeyDown} className={`choice-list material-sheet squircle ${className}`}>
      {options.map((o) => {
        const on = o.value === value
        const id = `${uid}-${o.value}`
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-labelledby={`${id}-l`}
            aria-describedby={`${id}-d`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className="choice"
          >
            <span className="choice__text">
              <span id={`${id}-l`} className="choice__label">
                {o.label}
              </span>
              <span id={`${id}-d`} className="choice__desc">
                {o.description}
              </span>
            </span>
            {o.aside ? (
              <span className="choice__aside" aria-hidden="true">
                {o.aside}
              </span>
            ) : null}
            <CheckMark className="choice__check" />
          </button>
        )
      })}
    </div>
  )
}
