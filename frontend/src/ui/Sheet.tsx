/**
 * Sheet: a non-modal panel for reading beside the table (the maths, the hand log).
 *   - layout 'side' (default on desktop): a 360 px panel on the right, under the top bar.
 *   - layout 'bottom' (default on phone and tablet): a bottom sheet with a grabber and two
 *     detents. Medium is ~56% of the screen (never under 320 px); drag the grabber or the
 *     header up 48 px for large, down 80 px to close. Pass `bottomInset` to end it above the
 *     dock, so you can read and act without closing it.
 *   - Non-modal: no focus trap, the rest of the page stays live. Escape (when it is the
 *     top-most open layer) and Done close it. Opening focuses Done; closing returns focus
 *     to where it was. role="dialog" named by its title.
 *   - Opens on the spring (desktop: slide + blur 8 -> 0; phone: rise), closes in 200 ms;
 *     instant under reduced motion. Rendered in a portal into the view's LayerHost (fixed, z 30; scrim z 29). While
 *     a bottom sheet is open the dock should sit above the scrim (z 31).
 *   - The body scrolls; when more is below, its last 28 px fade out.
 *
 *   <Sheet open={open} onClose={close} title="This hand" layout={desk ? 'side' : 'bottom'}
 *     bottomInset={dockTop}>...</Sheet>
 *
 * Props: open; onClose; title (ReactNode, the h2); label (accessible name when the title
 * is not plain text); leading (before the title, e.g. a small Ring); tone (colours the
 * title: 'good' | 'close' | 'fold' | 'neutral'); layout; bottomInset (px from the viewport
 * bottom where the sheet ends; default 16 side, 8 bottom); width (side, default 360);
 * scrim (bottom only, default true; a tap on it closes); doneLabel; children (the
 * scrolling body; a log can scrollIntoView its last row).
 */
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Capsule } from './Capsule'
import { barHeight, useLayoutKind, useViewportSize } from '../lib/breakpoints'
import { useEscape } from '../lib/escapeStack'
import { play, useReducedMotion } from '../lib/motion'
import { useLayerTarget } from './layerContext'
import './Sheet.css'

export type SheetLayout = 'side' | 'bottom'
type Detent = 'medium' | 'large'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  label?: string
  leading?: ReactNode
  tone?: string | null
  layout?: SheetLayout
  bottomInset?: number
  width?: number
  scrim?: boolean
  doneLabel?: string
  children: ReactNode
}

/** Medium and large heights for a bottom sheet ending `bottom` px above the viewport bottom. */
function heights(vh: number, vw: number, bottom: number) {
  const large = Math.max(200, vh - bottom - (barHeight(vw) + 8))
  const medium = Math.min(large, Math.max(320, Math.round(vh * 0.56)))
  return { medium, large }
}

export function Sheet({
  open,
  onClose,
  title,
  label,
  leading,
  tone,
  layout,
  bottomInset,
  width = 360,
  scrim = true,
  doneLabel = 'Done',
  children,
}: SheetProps) {
  const kind = useLayoutKind()
  const target = useLayerTarget()
  const at: SheetLayout = layout ?? (kind === 'desk' ? 'side' : 'bottom')
  const { w: vw, h: vh } = useViewportSize()
  const reduce = useReducedMotion()
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  // Mounted while open, and while the exit animation runs (adjusted during render).
  const [shown, setShown] = useState(open)
  const [prevOpen, setPrevOpen] = useState(open)
  const [detent, setDetent] = useState<Detent>('medium')
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setShown(true)
      setDetent('medium')
    } else if (reduce) setShown(false)
  }
  const closing = shown && !open

  useEscape(open, onClose)

  // Focus: remember where it was, move to Done; give it back on close.
  useLayoutEffect(() => {
    if (!open) return
    if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null
    done.current?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (open) return
    const back = returnFocus.current
    returnFocus.current = null
    if (back && document.contains(back) && (!document.activeElement || document.activeElement === document.body || panel.current?.contains(document.activeElement)))
      back.focus({ preventScroll: true })
  }, [open])

  // Enter: only when it opens, not when the layout changes while open.
  const enter = useEffectEvent(() => {
    const el = panel.current
    if (at === 'side')
      play(el, [{ opacity: 0, transform: 'translateX(16px) scale(.96)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 520 })
    else play(el, [{ opacity: 0, transform: 'translateY(48px)' }, { opacity: 1, transform: 'none' }], { duration: 520 })
  })
  useLayoutEffect(() => {
    if (open) enter()
  }, [open])

  // Exit, then unmount.
  useEffect(() => {
    if (!closing) return
    const finish = () => setShown(false)
    const a = play(panel.current, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: at === 'side' ? 'scale(.97)' : 'translateY(32px)' }], {
      duration: 200,
      ease: 'ease-in',
      fill: 'forwards',
    })
    if (a) {
      a.finished.then(finish, finish)
      return () => a.cancel()
    }
    const raf = requestAnimationFrame(finish)
    return () => cancelAnimationFrame(raf)
  }, [closing, at])

  // "More below" fade on the body.
  const [hasMore, setHasMore] = useState(false)
  const measure = (el: HTMLElement) => setHasMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
  useEffect(() => {
    const el = body.current
    if (!shown || !el) return
    // fires once on observe, then on every size change
    const ro = new ResizeObserver(() => measure(el))
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [shown])

  // Drag the grabber / header (bottom sheets).
  const drag = useRef<{ y0: number; dy: number } | null>(null)
  const flipFrom = useRef<number | null>(null)
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (at !== 'bottom' || (e.target as Element).closest('button')) return
    e.preventDefault() // no text selection or native drag from the header
    drag.current = { y0: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = panel.current
    if (!d || !el) return
    d.dy = e.clientY - d.y0
    el.style.transform = `translateY(${d.dy > 0 ? d.dy : d.dy * 0.3}px)`
  }
  const onPointerEnd = () => {
    const d = drag.current
    const el = panel.current
    drag.current = null
    if (!d || !el) return
    if (d.dy > 80) {
      el.style.transform = ''
      onClose()
      return
    }
    // settle into the new (or the same) detent from where the finger let go
    flipFrom.current = el.getBoundingClientRect().top
    el.style.transform = ''
    const next: Detent = d.dy < -48 ? 'large' : d.dy > 24 && detent === 'large' ? 'medium' : detent
    if (next !== detent) setDetent(next)
    else setFlipTick((t) => t + 1)
  }
  const [flipTick, setFlipTick] = useState(0)
  useLayoutEffect(() => {
    const el = panel.current
    const from = flipFrom.current
    flipFrom.current = null
    if (!el || from == null) return
    const to = el.getBoundingClientRect().top
    play(el, [{ transform: `translateY(${from - to}px)` }, { transform: 'none' }], { duration: 420 })
  }, [detent, flipTick])

  if (!shown || !target) return null

  const style: CSSProperties = {}
  const barH = barHeight(vw)
  if (at === 'side') {
    style.top = barH + 8
    style.bottom = bottomInset ?? 16
    style.width = Math.min(width, vw - 32)
  } else {
    const bottom = bottomInset ?? 8
    const h = heights(vh, vw, bottom)
    style.bottom = bottom
    style.height = detent === 'large' ? h.large : h.medium
  }

  return createPortal(
    <>
      {at === 'bottom' && scrim && <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />}
      <section
        ref={panel}
        role="dialog"
        aria-labelledby={label ? undefined : titleId}
        aria-label={label}
        data-layout={at}
        className="sheet"
        style={style}
        inert={closing}
      >
        <div className="sheet__drag" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          <div className="sheet__grab" aria-hidden="true" />
          <div className="sheet__head">
            {leading}
            <h2 id={titleId} className="sheet__title" data-tone={tone ?? undefined}>
              {title}
            </h2>
            <Capsule ref={done} variant="quiet" size="md" onClick={onClose}>
              {doneLabel}
            </Capsule>
          </div>
        </div>
        <div ref={body} className={`sheet__body ${hasMore ? 'has-more' : ''}`} onScroll={(e: UIEvent<HTMLDivElement>) => measure(e.currentTarget)}>
          {children}
        </div>
      </section>
    </>,
    target,
  )
}
