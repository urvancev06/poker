/**
 * StatRow: one stat against its target band. The band is always on the rail (a target is
 * a range, never a point); the value is a dot on the same fixed scale. Three states, each
 * with a cue that is not colour:
 *   unjudged  a hollow dot (too few hands for this stat): the group says how many to go
 *   in band   a filled green dot and "In range"
 *   out       a filled orange dot and the signed distance from the band ("+59.9")
 * A null value has no dot. The row is a disclosure: a tap, click or Enter shows what the
 * stat means, its target and its gate (touch has no hover). The band's numbers appear when
 * the row is pointed at, focused or open.
 *
 * With `value` undefined (loading) the row shows only its name and band: no figure.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { formatBand, formatValue, judge, railPct, rowDefinition, rowLabel, stateText, type Band, type StatDef } from '../../lib/stats'
import { play } from '../../lib/motion'

export interface StatRowProps {
  def: StatDef
  /** undefined while loading: no figure at all. */
  value: number | null | undefined
  band: Band | null
  windowHands: number
  /** The group is ready (its gate is reached), so rows carry a state column. */
  ready: boolean
}

export function StatRow({ def, value, band, windowHands, ready }: StatRowProps) {
  const [open, setOpen] = useState(false)
  const defId = useId()
  const panel = useRef<HTMLParagraphElement>(null)
  const toggled = useRef(false)

  const loading = value === undefined
  const j = judge(value, band, windowHands, def.gate)
  const state = loading ? 'loading' : j.state === 'in' || j.state === 'out' ? j.state : 'unjudged'
  const lo = band ? railPct(def, band[0]) : 0
  const hi = band ? railPct(def, band[1]) : 0

  useLayoutEffect(() => {
    if (!open || !toggled.current) return
    toggled.current = false
    play(panel.current, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 300 })
  }, [open])

  const toggle = () => {
    toggled.current = true
    setOpen((o) => !o)
  }

  return (
    <li className="stat-row" data-state={state}>
      <button
        type="button"
        className="stat-row__btn group"
        aria-expanded={open}
        aria-controls={defId}
        aria-label={loading ? `${def.name}: loading.` : rowLabel(def, value, band, j)}
        onClick={toggle}
      >
        <span className="stat-row__name text-body font-semibold" aria-hidden="true">
          {def.name}
        </span>
        <span className={`stat-row__value text-title font-strong tabular-nums ${value == null ? 'is-null' : ''}`} aria-hidden="true">
          {loading ? '' : formatValue(def, value)}
        </span>
        <span className="stat-row__track" aria-hidden="true">
          {band ? (
            <span
              className="stat-row__lbl text-foot font-semibold text-fog opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-aria-expanded:opacity-100"
              style={{ left: `${(lo + hi) / 2}%` }}
            >
              {formatBand(def, band)}
            </span>
          ) : null}
          <span className="stat-row__rail" />
          {band ? <span className="stat-row__band" style={{ left: `${lo}%`, width: `${hi - lo}%` }} /> : null}
          {value != null ? <span className="stat-row__dot" style={{ left: `${railPct(def, value)}%` }} /> : null}
        </span>
        {ready ? (
          <span className="stat-row__state text-callout font-medium text-fog tabular-nums" aria-hidden="true">
            {loading ? '' : stateText(def, j)}
          </span>
        ) : null}
      </button>
      <p id={defId} ref={panel} hidden={!open} className="stat-row__def m-0 text-callout text-fog">
        {rowDefinition(def, value, band)}
      </p>
    </li>
  )
}
