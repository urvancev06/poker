/**
 * TrendChart: one stat over the window's slices (oldest first), on a fixed scale so peaks
 * compare. The target band is two hairlines: light where they cross the void, cut dark
 * through the bars, so the band stays visible over every bar. No axes.
 *
 *   a value      a bar (a real 0 is a flat sliver on the baseline)
 *   no value     a hollow marker, never a zero bar (B31)
 *   in band      green with an ink cap (a cue that is not colour), and only for a slice that
 *                alone holds enough hands for the stat; small slices are never judged
 *
 * The big figure is the slice shown in ink: the latest by default. Pointing at a slice,
 * tapping it, or focusing the chart and using the arrow keys shows that slice instead,
 * with its hands under the chart. Screen readers also get every slice as a list.
 */
import { useId, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'
import type { HeroStatLine } from '../../api'
import { speakBand, type Band } from '../../lib/stats'
import { CHART, sliceAt, sliceCaption, sliceLabel, sliceValue, trendChart, type TrendDef } from '../../lib/statsCharts'

export interface TrendChartProps {
  def: TrendDef
  trend: readonly HeroStatLine[]
  band: Band | null
}

const KEY_STEP: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }

export function TrendChart({ def, trend, band }: TrendChartProps) {
  const chart = trendChart(trend, def, band)
  const n = chart.marks.length
  const [active, setActive] = useState<number | null>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const clipId = `trend-cut-${uid}`
  const readoutId = `trend-readout-${uid}`
  const shown = active !== null && active >= 0 && active < n ? active : n - 1
  const mark = chart.marks[shown]

  const pointAt = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width <= 0) return -1
    return sliceAt(((e.clientX - r.left) / r.width) * CHART.w, chart)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') setActive(pointAt(e))
  }
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') setActive(null)
  }
  // Touch has no hover: a tap shows a slice, a second tap on it goes back to the latest.
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'touch') return
    const i = pointAt(e)
    setActive((a) => (a === i ? null : i))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = -1
    if (e.key in KEY_STEP) next = Math.max(0, Math.min(n - 1, shown + KEY_STEP[e.key]))
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape' && active !== null) next = null
    if (next === -1) return
    e.preventDefault()
    setActive(next)
  }
  // Keyboard focus reads the slice in ink (the latest) straight away.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.matches(':focus-visible')) setActive((a) => a ?? n - 1)
  }

  if (!mark) return null
  const target = band ? `, target ${speakBand(def, band)}` : ''

  return (
    <figure className="trend-chart m-0">
      <div className="text-callout text-fog">{def.name}</div>
      {/* one fixed line: a value, or the words for why there is none (never a big dash) */}
      <div
        className={`mt-0.5 h-[31px] tabular-nums ${mark.value === null ? 'text-callout leading-[31px] font-medium text-fog' : 'text-title leading-[31px] font-strong'}`}
      >
        {sliceValue(def, mark)}
      </div>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${def.name} over ${n} slices${target}. Arrow keys read each slice.`}
        aria-describedby={readoutId}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => setActive(null)}
        className="mt-[18px] rounded-[6px]"
      >
        <svg
          viewBox={`0 0 ${CHART.w} ${CHART.h}`}
          aria-hidden="true"
          focusable="false"
          className="block h-auto w-full touch-pan-y overflow-visible"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
        >
          <defs>
            <clipPath id={clipId}>
              {chart.marks.map((m) => (m.kind === 'bar' ? <path key={m.i} d={m.d} /> : null))}
            </clipPath>
          </defs>
          {chart.bandY ? (
            <g className="trend-chart__band">
              <line x1={0} x2={CHART.w} y1={chart.bandY[0]} y2={chart.bandY[0]} />
              <line x1={0} x2={CHART.w} y1={chart.bandY[1]} y2={chart.bandY[1]} />
            </g>
          ) : null}
          {chart.marks.map((m) => {
            const on = m.i === shown
            if (m.kind === 'none') {
              return <circle key={m.i} className={`trend-chart__none ${on ? 'is-on' : ''}`} cx={m.cx} cy={CHART.base - 4} r={3.5} />
            }
            const cls = on ? 'is-on' : m.inBand ? 'is-in' : ''
            return (
              <g key={m.i}>
                <path className={`trend-chart__bar ${cls}`} d={m.d} />
                {m.inBand ? <rect className="trend-chart__cap" x={m.x + 3} y={m.y - 5} width={CHART.bar - 6} height={2} rx={1} /> : null}
              </g>
            )
          })}
          {chart.bandY ? (
            <g className="trend-chart__cut" clipPath={`url(#${clipId})`}>
              <line x1={0} x2={CHART.w} y1={chart.bandY[0]} y2={chart.bandY[0]} />
              <line x1={0} x2={CHART.w} y1={chart.bandY[1]} y2={chart.bandY[1]} />
            </g>
          ) : null}
        </svg>
      </div>
      <p className="m-0 mt-2.5 min-h-[18px] text-foot text-dust tabular-nums" aria-hidden="true">
        {active !== null ? sliceCaption(mark, n) : ''}
      </p>
      <p id={readoutId} className="sr-only" aria-live="polite">
        {active !== null ? sliceLabel(def, mark, n) : ''}
      </p>
      <ol className="sr-only">
        {chart.marks.map((m) => (
          <li key={m.i}>{sliceLabel(def, m, n)}</li>
        ))}
      </ol>
    </figure>
  )
}
