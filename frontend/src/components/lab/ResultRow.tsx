/**
 * ResultRow: one archetype against its five bands, plus bb/100. The row is a disclosure
 * (touch has no hover): opening it shows the targets in numbers, the five stats measured
 * without a target, how pooled seats were read, and which knobs the run changed. The band
 * numbers also appear on the rails when the row is pointed at, focused or open.
 *
 * Each cell: the value; beside it the signed distance when out of band, "No target" when
 * the stat has no band (never a pass, B24), nothing when in band; the rail on a fixed
 * scale for its stat, so the dots compare down the column.
 *
 * Desk (>= 1100): a matrix row. Below that: a block, one line per stat.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { LabArchetypesInfo, LabResult } from '../../api'
import {
  bandFractions,
  cellBand,
  dotFraction,
  formatBand,
  formatBb,
  formatDistance,
  formatStat,
  overrideEcho,
  rowContext,
  rowSpeech,
  seatPhrase,
  targetsText,
  type CellView,
  type ResultRowView,
} from '../../lib/lab'
import { play } from '../../lib/motion'
import { count } from '../../lib/stats'
import { LabRail } from './LabParts'

export interface ResultRowProps {
  row: ResultRowView
  result: LabResult | null
  info: LabArchetypesInfo
}

function Cell({ c, preview }: { c: CellView; preview: boolean }) {
  const band = cellBand(c.cell)
  const j = c.judgement
  const state = preview ? 'none' : j.state
  const note = preview ? '' : j.state === 'out' ? formatDistance(c.def, j.by) : j.state === 'unbanded' ? 'No target' : ''
  // Before a run the cell reads its target, so the matrix already says what to aim for.
  const value = preview ? (band ? formatBand(c.def, band) : 'No target') : formatStat(c.def, c.cell)
  const quiet = preview || j.state === 'none'
  return (
    <span className="lab-cell" data-state={state} aria-hidden="true">
      <span className="lab-cell__name text-callout font-semibold">{c.def.name}</span>
      <span className="lab-cell__read">
        <span className={`lab-cell__value tabular-nums ${quiet ? 'is-none' : ''}`}>{value}</span>
        {note ? <span className="lab-cell__note text-foot font-medium text-fog tabular-nums">{note}</span> : null}
      </span>
      <LabRail
        className="lab-cell__rail"
        p={preview ? null : dotFraction(c.def, c.cell)}
        band={band ? bandFractions(c.def, band) : null}
        state={state === 'none' ? 'none' : state}
        label={band && !preview ? formatBand(c.def, band) : undefined}
      />
    </span>
  )
}

export function ResultRow({ row, result, info }: ResultRowProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const toggled = useRef(false)
  const preview = !!row.preview

  useLayoutEffect(() => {
    if (!open || !toggled.current) return
    toggled.current = false
    play(panel.current, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 300 })
  }, [open])

  const toggle = () => {
    toggled.current = true
    setOpen((o) => !o)
  }

  const echo = result ? overrideEcho(result, row.key, info) : []
  const pooled = row.seats.length > 1

  return (
    <li className="lab-row" data-preview={preview ? '' : undefined}>
      <button type="button" className="lab-row__btn group" aria-expanded={open} aria-controls={panelId} aria-label={rowSpeech(row)} onClick={toggle}>
        <span className="lab-row__who" aria-hidden="true">
          <span className="block text-body font-strong">{row.name}</span>
          <span className="block text-foot text-fog">{preview ? seatPhrase(row.seats) : rowContext(row.seats, row.hands)}</span>
        </span>
        {row.cells.map((c) => (
          <Cell key={c.def.key} c={c} preview={preview} />
        ))}
        <span className="lab-row__bb tabular-nums" aria-hidden="true">
          {preview ? '' : formatBb(row.bb100)}
          {preview ? null : <span className="lab-row__unit text-foot font-medium text-dust"> bb/100</span>}
        </span>
      </button>
      <div id={panelId} ref={panel} hidden={!open} className="lab-row__more text-callout text-fog">
        <p className="m-0">
          <span className="text-ink">Targets:</span> {targetsText(row)}.
        </p>
        {preview ? (
          <p className="m-0">Not run yet.</p>
        ) : (
          <>
            <p className="m-0">
              <span className="text-ink">Measured without a target:</span> {row.extras.map((e) => `${e.name} ${e.text}`).join(', ')}.
            </p>
            {pooled ? (
              <p className="m-0">
                {seatPhrase(row.seats)} play the same {row.name} strategy, so their hands are read together as one: {count(row.hands)} in all.
              </p>
            ) : null}
            <p className="m-0">{echo.length ? `Knobs changed for this run: ${echo.join(', ')}.` : 'Played at its default knobs.'}</p>
          </>
        )}
      </div>
    </li>
  )
}
