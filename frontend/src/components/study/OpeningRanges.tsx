/**
 * OpeningRanges: raise first in, by position. One position at a time (UTG by default):
 * its 13 x 13 grid, its width as the big figure (computed from the list, never written
 * beside it) and the list itself, which is what your opens are graded against. The big
 * blind has no opening range, so its grid stays dark and the defence plan takes the
 * figure's place. Then what to do when someone else raises first.
 */
import { useState } from 'react'
import { count } from '../../lib/stats'
import { BB_DEFENCE, OPENING_RANGES, PREFLOP_FOLLOW_ON, POSITIONS, type Position } from '../../lib/study'
import { TOTAL_COMBOS } from '../../lib/ranges'
import { Segmented } from '../../ui/Segmented'
import { RangeGrid } from './RangeGrid'
import { Terms } from './Terms'

const OPTIONS = POSITIONS.map((p) => ({ value: p.pos, label: p.pos, title: p.name }))
const NONE: ReadonlySet<string> = new Set()

export function OpeningRanges() {
  const [pos, setPos] = useState<Position>('UTG')
  const range = OPENING_RANGES.find((r) => r.pos === pos) ?? null
  const name = POSITIONS.find((p) => p.pos === pos)?.name ?? pos

  return (
    <>
      <Segmented className="study-seats mt-8" size="md" label="Position" value={pos} onChange={setPos} options={OPTIONS} />
      <div className="study-range mt-8">
        <div className="study-range__facts">
          {range ? (
            <>
              <p className="m-0 text-facts font-strong tabular-nums max-sm:text-[44px]">{range.pct.toFixed(1)}%</p>
              <p className="m-0 mt-2 text-callout text-fog tabular-nums">
                {count(range.combos)} of {count(TOTAL_COMBOS)} combos
              </p>
              <p className="m-0 mt-6 max-w-[34ch] text-callout leading-[1.5] text-ink">{range.list}</p>
            </>
          ) : (
            <>
              <p className="m-0 text-headline font-strong">No opening range</p>
              <p className="m-0 mt-3 max-w-[34ch] text-callout leading-[1.5] text-fog">{BB_DEFENCE}</p>
            </>
          )}
        </div>
        <RangeGrid hands={range?.hands ?? NONE} label={`${name} opening range`} />
      </div>
      <p className="sr-only" aria-live="polite">
        {range ? `${name} opens ${range.pct.toFixed(1)}%, ${count(range.combos)} of ${count(TOTAL_COMBOS)} combos.` : `${name}: no opening range.`}
      </p>
      <p className="m-0 mt-6 max-w-[62ch] text-callout text-fog">
        Each width is counted from its list. Memorize the lists: the percentage only describes them.
      </p>

      <h3 className="m-0 mt-14 text-headline font-strong">Facing a raise</h3>
      <Terms items={PREFLOP_FOLLOW_ON} className="mt-5" />
    </>
  )
}
