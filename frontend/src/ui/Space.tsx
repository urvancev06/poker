/**
 * Space: the void behind every view. A deterministic two-layer starfield with a few bright
 * stars, the planet's limb glowing blue at the bottom of the frame, and the one light
 * source rising behind it (62% across). Render it once, at the app root.
 *
 *   <Space variant={view === 'table' ? 'stage' : 'page'} dollyKey={view} intro />
 *
 * Props:
 *   variant  'stage' (default): fixed to the viewport, the limb at its bottom.
 *            'page': for a scrolling view; the stars stay fixed, the horizon sits at the
 *            end of the document (the root needs `position: relative` and the page's height).
 *   dollyKey when it changes (and on mount), the near star layer does its one slow
 *            parallax push-in (2.6 s on the stage, 2 s on a page). Reduced motion: none.
 *   intro    on mount, the light comes up: the limb over 1.1 s, the sun a beat later.
 *
 * Keeping stars out from under the UI: views report their rects with
 * useSpaceAvoid(owner, rects) (lib/spaceAvoid.ts). Near stars inside a rect are dropped,
 * far stars drop to a whisper, bright stars keep 40 px clear, and the top bar's band fades.
 * This only rewrites CSS masks; the star SVG renders once and never again.
 */
import { memo, useLayoutEffect, useRef } from 'react'
import { BRIGHT_STARS, FAR_STARS, FIELD_H, FIELD_W, NEAR_STARS, holeMask, sunPlacement, type Star } from '../lib/space'
import { useSpaceAvoidRects } from '../lib/spaceAvoid'
import { useViewportSize } from '../lib/breakpoints'
import { play } from '../lib/motion'
import './Space.css'

export interface SpaceProps {
  variant?: 'stage' | 'page'
  dollyKey?: string | number
  intro?: boolean
}

function Dots({ stars }: { stars: readonly Star[] }) {
  return stars.map((s, i) => <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} fillOpacity={s.opacity} />)
}

/** One star layer's SVG. Memoised with no changing props: it renders once. */
const StarSvg = memo(function StarSvg({ kind }: { kind: 'far' | 'near' | 'bright' }) {
  return (
    <svg className="space__stars" viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {kind === 'far' && <Dots stars={FAR_STARS} />}
      {kind === 'near' && <Dots stars={NEAR_STARS} />}
      {kind === 'bright' && (
        <>
          <defs>
            <radialGradient id="space-halo">
              <stop offset="0" stopColor="#cfe2ff" stopOpacity=".35" />
              <stop offset="1" stopColor="#cfe2ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          {BRIGHT_STARS.map((s, i) => (
            <g key={i}>
              <circle cx={s.cx} cy={s.cy} r="5" fill="url(#space-halo)" />
              <circle cx={s.cx} cy={s.cy} r="1.15" fill="#fff" fillOpacity=".95" />
            </g>
          ))}
        </>
      )}
    </svg>
  )
})

export function Space({ variant = 'stage', dollyKey, intro = false }: SpaceProps) {
  const { w, h } = useViewportSize()
  const rects = useSpaceAvoidRects()
  const near = useRef<HTMLDivElement>(null)
  const horizon = useRef<HTMLDivElement>(null)
  const sunEl = useRef<HTMLDivElement>(null)
  const sun = sunPlacement(w, h)

  // The light comes up once, when the app opens.
  const introOnMount = useRef(intro)
  useLayoutEffect(() => {
    if (!introOnMount.current) return
    play(horizon.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 1100, ease: 'ease-out' })
    play(sunEl.current, [{ opacity: 0 }, { opacity: 1 }], { delay: 250, duration: 1100, ease: 'ease-out' })
  }, [])

  // One slow push-in of the near layer per view: transform only, then the layer is static.
  useLayoutEffect(() => {
    const a = play(near.current, [{ transform: 'translate3d(0, 22px, 0) scale(1.06)' }, { transform: 'none' }], {
      duration: variant === 'page' ? 2000 : 2600,
    })
    return () => a?.cancel()
  }, [dollyKey, variant])

  return (
    <div className="space" data-variant={variant} aria-hidden="true">
      <div className="space__field">
        <div className="space__layer" style={holeMask(rects, { keep: 0.3 })}>
          <div className="space__drift">
            <StarSvg kind="far" />
          </div>
        </div>
        <div className="space__layer" style={holeMask(rects, { pad: 4 })}>
          <div className="space__drift" ref={near}>
            <StarSvg kind="near" />
          </div>
        </div>
        <div className="space__layer" style={holeMask(rects, { pad: 40 })}>
          <div className="space__drift">
            <StarSvg kind="bright" />
          </div>
        </div>
      </div>
      <div className="space__horizon" ref={horizon} style={{ ['--limb' as string]: `${sun.limb}px` }}>
        <div className="space__sun" ref={sunEl} style={{ left: sun.left, bottom: sun.bottom }} />
        <div className="space__planet" />
      </div>
    </div>
  )
}
