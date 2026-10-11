/**
 * Segmented: one exclusive choice from a few (Coach On / Think first / Off; Labeled / HUD /
 * Live; the stats window). A radiogroup with roving focus: Tab lands on the selected
 * segment, the arrow keys (and Home / End) move and select, like native radios.
 *
 *   <Segmented label="Opponents" value={mode} onChange={setMode}
 *     options={[{ value: 'labeled', label: 'Labeled' }, ...]} />
 *
 * Props: options ({ value, label, title? }); value; onChange(value); label (accessible
 * name) or labelledBy (id of a visible label); size 'sm' (30 px, default) | 'md' (36 px);
 * className. The selected segment meets 3:1 non-text contrast (see Segmented.css).
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import './Segmented.css'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Hover title, e.g. a one-line explanation. */
  title?: string
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
  labelledBy?: string
  size?: 'sm' | 'md'
  className?: string
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export function Segmented<T extends string>({ options, value, onChange, label, labelledBy, size = 'sm', className = '' }: SegmentedProps<T>) {
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
    <div
      ref={group}
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={`seg ${size === 'md' ? 'seg--md' : ''} ${className}`}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            className="seg__opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
