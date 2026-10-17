/**
 * Knob: one strategy knob as a slider. The label explains itself on hover or tap; the
 * slider's description says the same to a screen reader. Changed, three cues: the fill
 * turns blue, a notch on the track marks the default, and "from 68%" appears beside the
 * value (it resets the knob).
 *
 * The input takes any value (step="any"), so a default off the step grid (TAG's c-bet 68%
 * on a 5% grid) sits where its label says; onChange gets the raw drag value to snap. The
 * arrow keys step from stop to stop with the default among them (stepKnob); Page Up/Down
 * and Home/End stay the browser's and are snapped the same way.
 */
import { useId, type CSSProperties, type KeyboardEvent } from 'react'
import type { LabKnob } from '../../api'
import { knobText, stepKnob } from '../../lib/lab'
import { Tooltip } from '../../ui/Tooltip'

export interface KnobProps {
  meta: LabKnob
  value: number
  def: number
  changed: boolean
  help: string
  onChange: (v: number) => void
  onReset: () => void
}

const ARROW: Record<string, 1 | -1> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }

const frac = (v: number, meta: LabKnob) => (meta.max > meta.min ? Math.min(1, Math.max(0, (v - meta.min) / (meta.max - meta.min))) : 0)

export function Knob({ meta, value, def, changed, help, onChange, onReset }: KnobProps) {
  const helpId = useId()
  const valueText = knobText(meta, value)
  const defText = knobText(meta, def)
  const style = { '--fill': frac(value, meta), '--def': frac(def, meta) } as CSSProperties
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir = ARROW[e.key]
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    onChange(stepKnob(value, meta, dir, def))
  }
  return (
    <li className="lab-knob" data-changed={changed ? '' : undefined}>
      <div className="flex min-h-7 items-baseline justify-between gap-3">
        {help ? (
          <Tooltip content={help} focusable={false} className="lab-knob__label text-callout font-medium">
            {meta.label}
          </Tooltip>
        ) : (
          <span className="text-callout font-medium">{meta.label}</span>
        )}
        <span className="flex items-baseline gap-2.5">
          {changed ? (
            <button type="button" className="lab-knob__from text-foot font-medium text-signal tabular-nums" aria-label={`Reset ${meta.label} to ${defText}`} onClick={onReset}>
              from {defText}
            </button>
          ) : null}
          <span className="text-callout font-strong tabular-nums" aria-hidden="true">
            {valueText}
          </span>
        </span>
      </div>
      <div className="lab-knob__track" style={style}>
        <input
          className="lab-slider"
          type="range"
          min={meta.min}
          max={meta.max}
          step="any"
          value={value}
          aria-label={meta.label}
          aria-valuetext={changed ? `${valueText}, default ${defText}` : `${valueText}, the default`}
          aria-describedby={help ? helpId : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          onKeyDown={onKeyDown}
        />
        <span className="lab-knob__notch" aria-hidden="true" />
      </div>
      {help ? (
        <span id={helpId} className="sr-only">
          {help}
        </span>
      ) : null}
    </li>
  )
}
