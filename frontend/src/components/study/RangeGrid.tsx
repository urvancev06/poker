/**
 * RangeGrid: the 169 starting hands on a 13 x 13 grid, the hands in the range lit in the
 * atmosphere's blue. Pairs run down the diagonal, suited hands above it, offsuit below.
 * In or out is told by the fill and the label's weight, never by hue alone; a screen
 * reader gets a table whose cells say "AKs, open" or "AKo, fold".
 *
 *   <RangeGrid hands={range.hands} label="UTG opening range" />
 *
 * Props: hands (the classes in the range, "AKs", "TT" ...); label (the table's name).
 * Switching ranges cross-fades each cell's fill (reduced motion: instant).
 */
import { memo } from 'react'
import { GRID } from '../../lib/ranges'

export interface RangeGridProps {
  hands: ReadonlySet<string>
  label: string
}

const ROWS = Array.from({ length: 13 }, (_, r) => GRID.slice(r * 13, r * 13 + 13))

export const RangeGrid = memo(function RangeGrid({ hands, label }: RangeGridProps) {
  return (
    <div role="table" aria-label={label} className="range-grid">
      {ROWS.map((row, r) => (
        <div role="row" key={r} className="range-grid__row">
          {row.map((c) => {
            const on = hands.has(c.hand)
            return (
              <div role="cell" key={c.hand} aria-label={`${c.hand}, ${on ? 'open' : 'fold'}`} className={`range-cell ${on ? 'is-in' : ''}`} data-kind={c.kind}>
                {c.hand}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
})
