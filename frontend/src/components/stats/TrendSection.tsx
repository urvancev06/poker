/**
 * TrendSection: VPIP, PFR, AF and WTSD over 8 slices of the window, oldest first, from 40
 * hands. Below that it says how many hands to go, in the same words as the groups.
 */
import { useId } from 'react'
import type { MyStats } from '../../api'
import { bandFor } from '../../lib/stats'
import { TREND_STATS, showTrend, trendCaption, trendWaiting } from '../../lib/statsCharts'
import { TrendChart } from './TrendChart'

export interface TrendSectionProps {
  data: MyStats
}

export function TrendSection({ data }: TrendSectionProps) {
  const headId = useId()
  const n = data.overall.hands
  const ready = showTrend(n, data.trend)
  const caption = ready ? trendCaption(n, data.trend.length) : trendWaiting(n)
  return (
    <section className="stats-trend mt-[120px] max-sm:mt-20" aria-labelledby={headId}>
      <div className="flex items-baseline justify-between gap-4 max-sm:flex-col max-sm:gap-1">
        <h2 id={headId} className="m-0 text-title font-strong">
          Trend
        </h2>
        <p className="m-0 text-callout text-fog">{caption}</p>
      </div>
      {ready ? (
        <div className="mt-8 grid grid-cols-4 gap-12 max-lg:grid-cols-2 max-sm:gap-x-5 max-sm:gap-y-8">
          {TREND_STATS.map((def) => (
            <TrendChart key={def.key} def={def} trend={data.trend} band={bandFor(data.targets, def.key)} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
