/**
 * Ring: the coach's equity ring, read in one glance.
 *   - the outer fill is your realized equity (green / ink / yellow / red by tone);
 *   - the inner grey arc is the price (required equity), with a white notch across both
 *     rings at the price: over the notch or short of it;
 *   - raw equity, when it differs from realized by a point or more, is a small ink dot
 *     just outside the outer track: it can never merge with the notch.
 * With needPct null (nothing to call) only the fill is drawn. The SVG is decorative
 * unless `label` is given (then role="img").
 *
 *   <Ring realizedPct={39} needPct={22.2} rawPct={40} tone="good" size={112} reveal />
 *
 * Props: realizedPct; needPct (number | null); rawPct?; tone (backend `tone`, anything
 * unknown is neutral); size (px; under 72 px uses the thick small-ring strokes);
 * reveal (draw in: the price arc, then the notch, then the fill sweeps past it, then the
 * dot; re-runs when the figures change; instant under reduced motion); revealDelay (ms);
 * label; className.
 */
import { useId, useLayoutEffect, useRef } from 'react'
import { dash, fillGradient, normalizeTone, notch, rawDot, ringVariant } from '../lib/ring'
import { play } from '../lib/motion'
import './Ring.css'

export interface RingProps {
  realizedPct: number
  needPct: number | null
  rawPct?: number | null
  tone: string
  size: number
  reveal?: boolean
  revealDelay?: number
  label?: string
  className?: string
}

export function Ring({ realizedPct, needPct, rawPct = null, tone, size, reveal = false, revealDelay = 0, label, className = '' }: RingProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const variant = ringVariant(size)
  const svg = useRef<SVGSVGElement>(null)
  const priced = needPct != null
  const dot = rawDot(realizedPct, rawPct, variant)
  const n = priced ? notch(needPct, variant) : null
  const g = fillGradient(realizedPct)

  useLayoutEffect(() => {
    const el = svg.current
    if (!reveal || !el) return
    const q = (s: string) => el.querySelector(s)
    const t0 = revealDelay
    const anims = [
      priced ? play(q('.coach-ring__price'), [{ strokeDasharray: '0 100' }, { strokeDasharray: dash(needPct) }], { delay: t0, duration: 460 }) : null,
      priced ? play(q('.coach-ring__notches'), [{ opacity: 0 }, { opacity: 1 }], { delay: t0 + 260, duration: 240, ease: 'ease-out' }) : null,
      play(q('.coach-ring__fill'), [{ strokeDasharray: '0 100', opacity: 0 }, { opacity: 1, offset: 0.06 }, { strokeDasharray: dash(realizedPct), opacity: 1 }], {
        delay: t0 + 140,
        duration: 680,
      }),
      play(q('.coach-ring__raw'), [{ opacity: 0 }, { opacity: 1 }], { delay: t0 + 640, duration: 240, ease: 'ease-out' }),
    ]
    return () => anims.forEach((a) => a?.cancel())
  }, [reveal, revealDelay, priced, needPct, realizedPct])

  return (
    <svg
      ref={svg}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      data-tone={normalizeTone(tone)}
      className={`coach-ring ${variant === 'sm' ? 'coach-ring--sm' : ''} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-fill`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          <stop className="coach-ring__a" offset="0" />
          <stop className="coach-ring__b" offset="1" />
        </linearGradient>
      </defs>
      <g transform="rotate(-90 60 60)">
        <circle className="coach-ring__track" cx="60" cy="60" r="50" />
        <circle
          className="coach-ring__fill"
          cx="60"
          cy="60"
          r="50"
          pathLength={100}
          strokeDasharray={dash(realizedPct)}
          stroke={`url(#${uid}-fill)`}
          opacity={realizedPct > 0 ? 1 : 0}
        />
        {priced && (
          <>
            <circle className="coach-ring__ptrack" cx="60" cy="60" r="35" />
            <circle className="coach-ring__price" cx="60" cy="60" r="35" pathLength={100} strokeDasharray={dash(needPct)} />
          </>
        )}
      </g>
      {n && (
        <g className="coach-ring__notches">
          <line className="coach-ring__halo" {...n.halo} />
          <line className="coach-ring__notch" {...n.line} />
        </g>
      )}
      {dot && <circle className="coach-ring__raw" cx={dot.cx} cy={dot.cy} r={dot.r} />}
    </svg>
  )
}
