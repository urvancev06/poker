/**
 * Dock: the one glass surface under the table. It shows one face at a time (status,
 * actions, sizing, result, error) and morphs between them: the face that leaves fades out
 * while the glass reshapes to the new one and the new one fades in. Growing from the
 * "Dealing" pill into the three capsules is the dock's one overshoot (the grow spring,
 * about 3% of its width); everything else is critically damped. Reduced motion: instant.
 *
 *   <Dock faceKey="actions" contentKey="Call 26" axis={720} bottom={68}>...</Dock>
 *
 * faceKey     which face (a change morphs and cross-fades)
 * contentKey  a summary of what the face says (the leaving copy is the latest one)
 * axis        the shared centre line (px); bottom: px from the viewport bottom
 * phone       the phone's full-width faces; raised: above a bottom sheet's scrim (z 31)
 * busy        aria-busy while a request is in flight
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { play, useReducedMotion } from '../../lib/motion'
import './Dock.css'

interface Shape {
  w: number
  h: number
  r: number
}

export interface DockProps {
  faceKey: string
  contentKey: string
  axis: number
  bottom: number
  phone: boolean
  raised: boolean
  busy: boolean
  /** The face's class (face--status ...) and its content. */
  faceClass: string
  faceLabel?: string
  faceRole?: 'group' | 'status'
  children: ReactNode
  dockRef?: RefObject<HTMLDivElement | null>
}

interface Shown {
  key: string
  content: string
  node: ReactNode
  cls: string
  label?: string
  role?: 'group' | 'status'
}

const same = (a: Shape | null, b: Shape) => !!a && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 && a.r === b.r

export function Dock({ faceKey, contentKey, axis, bottom, phone, raised, busy, faceClass, faceLabel, faceRole, children, dockRef }: DockProps) {
  const reduce = useReducedMotion()
  const ownRef = useRef<HTMLDivElement>(null)
  const root = dockRef ?? ownRef
  const shade = useRef<HTMLDivElement>(null)
  const glass = useRef<HTMLDivElement>(null)
  const rim = useRef<HTMLDivElement>(null)
  const face = useRef<HTMLDivElement>(null)
  const leavingEl = useRef<HTMLDivElement>(null)

  // The face on screen, and the one leaving (adjusted during render: the leaving copy is
  // the last content the old face showed).
  const [shown, setShown] = useState<Shown>({ key: faceKey, content: contentKey, node: children, cls: faceClass, label: faceLabel, role: faceRole })
  const [leaving, setLeaving] = useState<Shown | null>(null)
  if (faceKey !== shown.key) {
    setLeaving(reduce ? null : shown)
    setShown({ key: faceKey, content: contentKey, node: children, cls: faceClass, label: faceLabel, role: faceRole })
  } else if (contentKey !== shown.content) {
    setShown({ ...shown, content: contentKey, node: children })
  }

  // The leaving face fades out, then goes.
  useEffect(() => {
    if (!leaving) return
    const a = play(leavingEl.current, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 160, ease: 'ease-out', fill: 'forwards' })
    // clears this leaving face only: a newer one that replaced it (its fade cancelled within
    // 160 ms) clears itself when its own fade is done
    const done = () => setLeaving((l) => (l === leaving ? null : l))
    if (!a) {
      const t = setTimeout(done, 0)
      return () => clearTimeout(t)
    }
    a.finished.then(done, done)
    return () => a.cancel()
  }, [leaving])

  /* ---------- the morph ---------- */
  const shape = useRef<Shape | null>(null)
  const morph = useRef<Animation[]>([])
  // the face last laid out: coming back into view (Activity) is not a face change
  const laidOut = useRef<string | null>(null)

  useLayoutEffect(() => {
    const dock = root.current
    const f = face.current
    const g = glass.current
    const r = rim.current
    const sh = shade.current
    if (!dock || !f || !g || !r || !sh) return
    const shapeOf = (): Shape => ({ w: f.offsetWidth, h: f.offsetHeight, r: phone && f.classList.contains('face--sizing') ? 30 : f.offsetHeight / 2 })
    const clipFor = (box: [number, number], s: Shape) => `inset(${box[1] - s.h}px ${(box[0] - s.w) / 2}px 0px ${(box[0] - s.w) / 2}px round ${s.r}px)`
    const paint = (s: Shape, box: [number, number] = [s.w, s.h]) => {
      dock.style.width = `${box[0]}px`
      dock.style.height = `${box[1]}px`
      g.style.clipPath = box[0] === s.w && box[1] === s.h ? `inset(0 round ${s.r}px)` : clipFor(box, s)
      for (const n of [r, sh]) {
        n.style.width = `${s.w}px`
        n.style.height = `${s.h}px`
        n.style.borderRadius = `${s.r}px`
      }
      shape.current = s
    }
    const stop = () => {
      morph.current.forEach((a) => a.cancel())
      morph.current = []
    }
    const morphTo = (s1: Shape, ease: 'spring' | 'grow') => {
      const s0 = shape.current
      stop()
      if (!s0 || reduce || !s0.w || (Math.abs(s0.w - s1.w) < 1 && Math.abs(s0.h - s1.h) < 1)) {
        paint(s1)
        return
      }
      // the state: the final shape, inside a box with room for the overshoot
      const box: [number, number] = [Math.ceil(Math.max(s0.w, s1.w * 1.04)), Math.ceil(Math.max(s0.h, s1.h))]
      paint(s1, box)
      const o = { duration: 560, ease, fill: 'none' as const }
      const run = [
        play(g, [{ clipPath: clipFor(box, s0) }, { clipPath: clipFor(box, s1) }], o),
        play(
          r,
          [
            { width: `${s0.w}px`, height: `${s0.h}px`, borderRadius: `${s0.r}px` },
            { width: `${s1.w}px`, height: `${s1.h}px`, borderRadius: `${s1.r}px` },
          ],
          o,
        ),
        play(sh, [{ transform: `scale(${s0.w / s1.w}, ${s0.h / s1.h})` }, { transform: 'none' }], o),
      ].filter((a): a is Animation => !!a)
      morph.current = run
      Promise.all(run.map((a) => a.finished)).then(
        () => {
          if (morph.current === run) {
            morph.current = []
            paint(s1)
          }
        },
        () => {},
      )
    }
    const first = shapeOf()
    const prev = shape.current
    const changed = laidOut.current !== null && laidOut.current !== faceKey
    laidOut.current = faceKey
    morphTo(first, prev && faceKey === 'actions' && first.w > prev.w * 1.2 ? 'grow' : 'spring')
    // the new face comes in as the glass reshapes (not on the first paint)
    if (changed) play(f, [{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 110 })
    // its content can change size (a status line, a raise amount): follow it
    const ro = new ResizeObserver(() => {
      const s = shapeOf()
      if (!same(shape.current, s)) morphTo(s, 'spring')
    })
    ro.observe(f)
    return () => {
      ro.disconnect()
    }
  }, [faceKey, phone, reduce, root])
  useEffect(() => () => morph.current.forEach((a) => a.cancel()), [])

  const current = faceKey === shown.key ? children : shown.node
  return (
    <div
      ref={root}
      className="dock"
      data-face={faceKey}
      data-phone={phone ? '' : undefined}
      data-raised={raised ? '' : undefined}
      aria-busy={busy}
      style={{ left: axis, bottom }}
    >
      <div ref={shade} className="dock__shade" aria-hidden="true" />
      <div ref={glass} className="dock__glass">
        <div ref={rim} className="dock__rim" aria-hidden="true" />
        {leaving && (
          <div ref={leavingEl} className={`face is-leaving ${leaving.cls}`} aria-hidden="true" inert key={`leave-${leaving.key}`}>
            {leaving.node}
          </div>
        )}
        <div ref={face} key={faceKey} className={`face ${faceClass}`} role={faceRole} aria-label={faceLabel}>
          {current}
        </div>
      </div>
    </div>
  )
}
