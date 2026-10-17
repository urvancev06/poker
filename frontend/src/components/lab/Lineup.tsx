/**
 * Lineup: the six seats of the simulated table, each a native picker of the five
 * archetypes (native, so the phone's own picker opens). Duplicates are allowed; the
 * default seats two TAGs. Each capsule carries its seat number, which the results use
 * ("Seats 2 and 6").
 */
import type { LabArchetypesInfo } from '../../api'
import { shortName } from '../../lib/lab'
import { IconChevronRight } from '../../ui/Icons'

export interface LineupProps {
  info: LabArchetypesInfo
  lineup: readonly string[]
  onChange: (lineup: string[]) => void
}

export function Lineup({ info, lineup, onChange }: LineupProps) {
  return (
    <section aria-labelledby="lab-lineup" className="mt-16 max-sm:mt-12">
      <h2 id="lab-lineup" className="m-0 text-headline font-strong">
        Lineup
      </h2>
      <ol className="lab-lineup m-0 mt-4 list-none p-0">
        {lineup.map((key, i) => (
          <li key={i}>
            <label className="lab-seat">
              <span className="lab-seat__no text-foot font-semibold text-dust tabular-nums" aria-hidden="true">
                {i + 1}
              </span>
              <select
                className="lab-seat__pick text-callout font-semibold"
                aria-label={`Seat ${i + 1}`}
                value={key}
                onChange={(e) => onChange(lineup.map((k, j) => (j === i ? e.target.value : k)))}
              >
                {info.archetypes.map((a) => (
                  <option key={a.key} value={a.key}>
                    {shortName(a.name)}
                  </option>
                ))}
              </select>
              <IconChevronRight className="lab-seat__chev size-3 text-fog" />
            </label>
          </li>
        ))}
      </ol>
    </section>
  )
}
