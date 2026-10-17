/**
 * CfrChart: training's checkpoints, oldest first, on a FIXED scale so runs of any length
 * read alike (the My stats trend language: no axes, the scale as a few hairlines).
 *
 *   exploit  exploitability as bars on a log scale, 0.001 to 0.5; the 0.02 pass line is
 *            the brighter hairline. Exploitability falls roughly as 1/sqrt(iterations),
 *            and on a log scale every decade gets the same room.
 *   value    the learned game value as dots on a linear scale, 0 to −0.12; the band
 *            between the two bright hairlines is exact ± 0.01 (−1/18 in the middle).
 *
 * The big figure is the checkpoint shown in ink: the last by default. Pointing at a
 * checkpoint, tapping it, or focusing the chart and using the arrow keys shows that one,
 * with its iterations under the chart. Screen readers also get every checkpoint as a list.
 * The scale's labels are HTML beside the plot, so they stay legible at phone width.
 */
import { useId, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { CfrCheckpoint } from '../../api'
import { CHART, EXACT_VALUE, axisEnds, checkpointCaption, exploitChart, formatValue, slotAt, valueChart } from '../../lib/labCfr'

export interface CfrChartProps {
  kind: 'exploit' | 'value'
  trend: readonly CfrCheckpoint[]
  exact?: number
}

const KEY_STEP: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }
const PLOT = CHART.w - CHART.gutter

export function CfrChart({ kind, trend, exact = EXACT_VALUE }: CfrChartProps) {
  const n = trend.length
  const [active, setActive] = useState<number | null>(null)
  const uid = useId()
  const readoutId = `${uid}-readout`
  const clipId = `cfr-cut-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const shown = active !== null && active >= 0 && active < n ? active : n - 1
  const point = trend[shown]

  const pointAt = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width <= 0) return -1
    return slotAt(((e.clientX - r.left) / r.width) * CHART.w, n)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') setActive(pointAt(e))
  }
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') setActive(null)
  }
  // Touch has no hover: a tap shows a checkpoint, a second tap on it goes back to the last.
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
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.matches(':focus-visible')) setActive((a) => a ?? n - 1)
  }

  if (!point) return null
  const exploit = kind === 'exploit'
  const title = exploit ? 'Exploitability over training' : 'Game value over training'
  const read = (p: CfrCheckpoint) => (exploit ? p.exploitability.toFixed(4) : formatValue(p.game_value))
  const speak = (p: CfrCheckpoint, i: number) => `${checkpointCaption(i, n, p)}: ${exploit ? 'exploitability' : 'game value'} ${read(p)}.`
  const [first, last] = axisEnds(trend)
  const scale = exploit ? 'log scale from 0.001 to 0.5, pass line at 0.02' : `linear scale from 0 to −0.12, band ${formatValue(exact)} plus or minus 0.01`

  let marks: ReactNode
  let lines: Array<{ y: number; label: string; strong?: boolean }>
  if (exploit) {
    const c = exploitChart(trend)
    lines = c.lines
    const pass = c.lines.find((l) => l.strong)
    // The pass line also cuts through the bars in black (the stats band's rule), so it
    // reads over every bar.
    marks = (
      <>
        <defs>
          <clipPath id={clipId}>
            {c.bars.map((b) => (
              <path key={b.i} d={b.d} />
            ))}
          </clipPath>
        </defs>
        {c.bars.map((b) => (
          <path key={b.i} className={`cfr-chart__bar ${b.i === shown ? 'is-on' : ''}`} d={b.d} />
        ))}
        {pass ? <line className="cfr-chart__cut" clipPath={`url(#${clipId})`} x1={0} x2={PLOT} y1={pass.y} y2={pass.y} /> : null}
      </>
    )
  } else {
    const c = valueChart(trend, exact)
    const mid = (c.band[0].y + c.band[1].y) / 2
    lines = [c.zero, { ...c.band[0], label: '' }, { y: mid, label: '−1/18' }, { ...c.band[1], label: '' }]
    marks = c.dots.map((d) => <circle key={d.i} className={`cfr-chart__dot ${d.i === shown ? 'is-on' : ''}`} cx={d.cx} cy={d.cy} r={d.i === shown ? 5 : 4} />)
  }

  return (
    <figure className="cfr-chart m-0">
      <figcaption className="text-callout text-fog">{title}</figcaption>
      <div className="mt-0.5 text-title leading-[31px] font-strong tabular-nums">{read(point)}</div>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${title}, ${n} checkpoints, ${scale}. Arrow keys read each checkpoint.`}
        aria-describedby={readoutId}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => setActive(null)}
        className="cfr-chart__plot relative mt-[18px] rounded-[6px]"
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
          <g className="cfr-chart__lines">
            {lines.map((l, i) =>
              l.label === '−1/18' ? null : <line key={i} className={l.strong ? 'is-strong' : ''} x1={0} x2={PLOT} y1={l.y} y2={l.y} />,
            )}
          </g>
          {marks}
        </svg>
        {/* the scale, as HTML so it stays legible at any width */}
        <div className="cfr-chart__scale" aria-hidden="true">
          {lines
            .filter((l) => l.label)
            .map((l) => (
              <span key={l.label} className={`text-caption font-semibold tabular-nums ${l.strong ? 'text-fog' : 'text-dust'}`} style={{ top: `${(l.y / CHART.h) * 100}%` }}>
                {l.label}
              </span>
            ))}
        </div>
      </div>
      <div className="cfr-chart__ends mt-1.5 flex justify-between text-caption text-dust tabular-nums" aria-hidden="true">
        <span>{first}</span>
        <span>{last}</span>
      </div>
      <p className="m-0 mt-1.5 min-h-[18px] text-foot text-fog tabular-nums" aria-hidden="true">
        {active !== null ? checkpointCaption(shown, n, point) : ''}
      </p>
      <p id={readoutId} className="sr-only" aria-live="polite">
        {active !== null ? speak(point, shown) : ''}
      </p>
      <ol className="sr-only">
        {trend.map((p, i) => (
          <li key={i}>{speak(p, i)}</li>
        ))}
      </ol>
    </figure>
  )
}
