/**
 * GateRing: how much of the window can be read. Three arcs, one per sample gate (500,
 * 2,000, 3,000 hands), each labelled where it ends; the gate being worked towards reads
 * brighter. The hand count sits in the middle.
 *
 * When a window's figures arrive the arcs sweep in on the spring and the count settles
 * (reduced motion: instant). While loading there is no count and no fill, only the tracks.
 */
import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import { count, countSize, ringLabel } from '../../lib/stats'
import { GATE_RING, gateArcs } from '../../lib/statsCharts'
import { play } from '../../lib/motion'

export interface GateRingProps {
  /** Hands in the window; null while loading. */
  hands: number | null
}

// The count shrinks as it grows so it always clears the ring (phone sizes after max-sm).
const COUNT_SIZE = {
  lg: 'text-hero max-sm:text-[64px]',
  md: 'text-[64px] max-sm:text-[50px]',
  sm: 'text-[52px] max-sm:text-[42px]',
} as const

export function GateRing({ hands }: GateRingProps) {
  const gradId = `gate-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const svg = useRef<SVGSVGElement>(null)
  const countEl = useRef<HTMLDivElement>(null)
  const arcs = useMemo(() => gateArcs(hands ?? 0), [hands])
  const loading = hands === null

  // The figures arriving is the event: sweep each filled arc in turn, settle the count.
  useLayoutEffect(() => {
    if (hands === null) return
    svg.current?.querySelectorAll('.gate-ring__fill').forEach((p, i) => {
      play(p, [{ strokeDasharray: '0 100' }, { strokeDasharray: '100 100' }], { duration: 1000, delay: 150 + i * 200 })
    })
    play(countEl.current, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 600 })
  }, [hands])

  return (
    <figure
      className="gate-ring relative m-0 size-[300px] flex-none max-lg:size-[260px] max-sm:size-[240px]"
      role="img"
      aria-label={hands === null ? 'Loading your stats' : ringLabel(hands)}
    >
      <svg ref={svg} viewBox={`0 0 ${GATE_RING.size} ${GATE_RING.size}`} aria-hidden="true" focusable="false" className="block size-full overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--gate-a)" />
            <stop offset="1" stopColor="var(--gate-b)" />
          </linearGradient>
        </defs>
        {arcs.map((a) => (
          <g key={a.gate}>
            <path className="gate-ring__track" d={a.track} />
            {!loading && a.fill ? <path className="gate-ring__fill" d={a.fill} pathLength={100} stroke={`url(#${gradId})`} /> : null}
            <text x={a.label.x} y={a.label.y} textAnchor="middle" className={!loading && a.next ? 'gate-ring__gate is-next' : 'gate-ring__gate'}>
              {a.label.text}
            </text>
          </g>
        ))}
      </svg>
      <div ref={countEl} className="absolute inset-0 flex flex-col items-center justify-center">
        {hands === null ? (
          <span className="text-body text-fog">Loading</span>
        ) : (
          <>
            <b className={`${COUNT_SIZE[countSize(hands)]} leading-none font-bold tracking-[-0.045em] tabular-nums`}>{count(hands)}</b>
            <span className="mt-1.5 text-body font-medium text-fog">{hands === 1 ? 'hand' : 'hands'}</span>
          </>
        )}
      </div>
    </figure>
  )
}
