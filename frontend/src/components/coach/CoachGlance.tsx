/**
 * CoachGlance: the coach at a glance, bare on the void beside your hand (layout 'side') or
 * as one row above the dock on a phone (layout 'row'). The Stage prototype's look: the
 * green ring (fill = your realized equity, or raw Equity once the action is closed; the
 * inner grey arc and the notch at the price), the verdict in the backend's tone, three
 * figures with small labels, and "Show the maths". A bet/check spot (no price) has no
 * ring: the verdict and one figure.
 *
 * Contract (agreed with the table builder):
 *   coaching        the answer for this decision (null unless status is 'ready')
 *   status          'off'     offer "Ask the coach" (mode off) / "Show the coach" (think
 *                             first): onAsk
 *                   'idle'    not the hero's turn: render nothing
 *                   'loading' working out the odds (appears after 300 ms, so a fast answer
 *                             does not flash it)
 *                   'ready'   ring + verdict + figures; the whole thing opens the maths
 *                   'error'   the coach's own copy by status code, the backend detail,
 *                             Try again (when asking again can help) and Dismiss
 *   error           the coach's ApiError when status is 'error'
 *   layout          'side' | 'row'
 *   onAsk           ask (mode off) or reveal (think first) the coach
 *   onRetry         ask again after an error
 *   onDismissError  hide the error
 *   onOpenMaths     open the maths sheet (MathsSheet)
 * Optional:
 *   onHide          shows "Hide" next to a ready answer in modes off / think first
 *   mathsOpen       the maths sheet is open: aria-expanded; the side glance steps out of
 *                   sight while the panel's head carries the ring and verdict
 *   tight           side layout with little room: Call EV drops (lib/coachLayout
 *                   coachSideWidth says how much room each needs)
 *   ringSize        side ring in px (default 112; lib/coachLayout coachRingPx)
 *   revealDelay     ms before the ring and verdict draw in (the turn beat)
 *
 * Screen readers hear the verdict and figures once, when the answer arrives (a polite
 * live region that stays mounted). Focus follows the control the player used: Ask ->
 * the answer, Hide / Dismiss -> Ask. Motion: the ring draws in, the verdict slides 8 px;
 * nothing under reduced motion.
 */
import { useCallback, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Coaching } from '../../api'
import type { ApiError } from '../../lib/apiError'
import { coachErrorCopy } from '../../lib/coachError'
import { ROW_RING_PX, SIDE_RING_PX } from '../../lib/coachLayout'
import type { CoachStatus } from '../../lib/coachStatus'
import { glanceView, type Figure, type GlanceView } from '../../lib/coachView'
import { play } from '../../lib/motion'
import { usePrefs } from '../../lib/prefsContext'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { IconChevronRight, IconCoach } from '../../ui/Icons'
import { Ring } from '../../ui/Ring'
import { FIGURE_TEXT, TONE_TEXT } from './tones'
import './CoachGlance.css'

export interface CoachGlanceProps {
  coaching: Coaching | null
  status: CoachStatus
  error?: ApiError | null
  layout: 'side' | 'row'
  onAsk(): void
  onRetry(): void
  onDismissError(): void
  onOpenMaths(): void
  onHide?: () => void
  mathsOpen?: boolean
  tight?: boolean
  ringSize?: number
  revealDelay?: number
}

type FocusTarget = 'summary' | 'ask' | null

export function CoachGlance({
  coaching,
  status,
  error,
  layout,
  onAsk,
  onRetry,
  onDismissError,
  onOpenMaths,
  onHide,
  mathsOpen = false,
  tight = false,
  ringSize = SIDE_RING_PX,
  revealDelay = 0,
}: CoachGlanceProps) {
  const { coachMode } = usePrefs()
  const row = layout === 'row'
  const view = status === 'ready' && coaching ? glanceView(coaching) : null

  // Where focus goes once the control the player used has gone. Dropped (adjusted during
  // render) when the coach lands somewhere else, e.g. an error instead of an answer.
  const [focus, setFocus] = useState<FocusTarget>(null)
  if ((focus === 'summary' && status !== 'loading' && status !== 'ready') || (focus === 'ask' && status !== 'off')) setFocus(null)
  const focused = useCallback(() => setFocus(null), [])

  let body: ReactNode = null
  if (status === 'off') {
    body = (
      <AskButton
        label={coachMode === 'think' ? 'Show the coach' : 'Ask the coach'}
        autoFocus={focus === 'ask'}
        onFocused={focused}
        onClick={() => {
          setFocus('summary')
          onAsk()
        }}
      />
    )
  } else if (status === 'loading') {
    body = <Loading row={row} />
  } else if (status === 'error' && error) {
    const copy = coachErrorCopy(error)
    body = (
      <ErrorNotice
        error={error}
        context="coach"
        headline={copy.headline}
        layout="stack"
        onRetry={
          copy.canRetry
            ? () => {
                setFocus('summary')
                onRetry()
              }
            : undefined
        }
        onDismiss={() => {
          setFocus('ask')
          onDismissError()
        }}
        className={row ? 'max-w-[calc(100vw-32px)]' : 'max-w-[340px]'}
      />
    )
  } else if (view) {
    const showHide = !!onHide && coachMode !== 'on'
    body = (
      <>
        <Summary
          view={view}
          row={row}
          ringSize={row ? ROW_RING_PX : ringSize}
          tight={tight}
          expanded={mathsOpen}
          revealDelay={revealDelay}
          autoFocus={focus === 'summary'}
          onFocused={focused}
          onOpen={onOpenMaths}
        />
        {showHide && (
          <button
            type="button"
            onClick={() => {
              setFocus('ask')
              onHide()
            }}
            className={`h-11 shrink-0 rounded-full border-0 bg-transparent px-3 text-callout font-medium text-signal transition-colors duration-200 hover:bg-signal/10 ${
              row ? '' : '-ml-3 mt-2 self-start'
            }`}
          >
            Hide
          </button>
        )}
      </>
    )
  }

  return (
    <>
      {/* announces the answer once it is on screen; mounted through every state */}
      <p className="sr-only" role="status">
        {view?.spoken ?? ''}
      </p>
      {body && (
        <aside
          aria-label="Coach"
          data-layout={layout}
          className={`coach-glance flex ${row ? 'w-max max-w-[calc(100vw-16px)] items-center justify-center gap-1' : 'flex-col items-start'} ${
            mathsOpen && !row ? 'invisible' : ''
          }`}
        >
          {body}
        </aside>
      )}
    </>
  )
}

/** Focus `ref` once when asked to, if focus was lost with the control the player used
 * (it sits on the body). Focus the player has since moved elsewhere is never taken. */
function useFocusWhen<T extends HTMLElement>(when: boolean, onFocused: () => void) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    if (!when || !ref.current) return
    const active = document.activeElement
    if (!active || active === document.body) ref.current.focus({ preventScroll: true })
    onFocused()
  }, [when, onFocused])
  return ref
}

function AskButton({ label, autoFocus, onFocused, onClick }: { label: string; autoFocus: boolean; onFocused: () => void; onClick: () => void }) {
  const ref = useFocusWhen<HTMLButtonElement>(autoFocus, onFocused)
  return (
    <Capsule ref={ref} variant="quiet" size="md" onClick={onClick} className="gap-2.5 pl-3">
      <IconCoach />
      {label}
    </Capsule>
  )
}

function Loading({ row }: { row: boolean }) {
  return (
    <div className={`coach-loading flex items-center text-callout text-fog ${row ? 'min-h-11 gap-3' : 'gap-4'}`}>
      {/* the wrapper breathes (opacity on an HTML box, not the SVG) */}
      <span className={`coach-loading__ring block shrink-0 ${row ? 'size-8' : 'size-11'}`} aria-hidden="true">
        <svg viewBox="0 0 120 120" className="block size-full" focusable="false">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth={row ? 17 : 14} />
        </svg>
      </span>
      Working out the odds
    </div>
  )
}

interface SummaryProps {
  view: GlanceView
  row: boolean
  ringSize: number
  tight: boolean
  expanded: boolean
  revealDelay: number
  autoFocus: boolean
  onFocused: () => void
  onOpen: () => void
}

/** The answer: one button that opens the maths. Draws in when it mounts (a new answer). */
function Summary({ view, row, ringSize, tight, expanded, revealDelay, autoFocus, onFocused, onOpen }: SummaryProps) {
  const button = useFocusWhen<HTMLButtonElement>(autoFocus, onFocused)
  const text = useRef<HTMLSpanElement>(null)

  // A new answer mounts a new summary: the reveal runs once per answer, not on re-renders,
  // and not when the table comes back into sight (Activity re-runs layout effects; the ref
  // survives it).
  const revealed = useRef(false)
  const reveal = useEffectEvent(() => {
    play(button.current, [{ opacity: 0 }, { opacity: 1 }], { delay: revealDelay, duration: 260, ease: 'ease-out' })
    play(text.current, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { delay: revealDelay + 260, duration: 480 })
  })
  useLayoutEffect(() => {
    if (revealed.current) return
    revealed.current = true
    reveal()
  }, [])

  const figures = view.figures.filter((f) => !(f.kind === 'ev' && (row || tight)))
  const toneText = TONE_TEXT[view.tone]

  return (
    <button
      ref={button}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={`${view.spoken} Show the maths`}
      className={`coach-summary group flex border-0 bg-transparent text-left transition-colors duration-200 hover:bg-white/[0.035] ${
        row ? 'min-h-11 min-w-0 items-center gap-3.5 rounded-full py-1.5 pl-1.5 pr-3' : '-m-2.5 items-start gap-6 rounded-[30px] p-2.5'
      } ${row && !view.priced ? 'pl-4' : ''}`}
    >
      {view.priced && (
        <Ring realizedPct={view.eq} needPct={view.need} rawPct={view.raw} tone={view.tone} size={ringSize} reveal revealDelay={revealDelay} />
      )}
      {/* row: the figures wrap under the verdict when one line cannot hold both */}
      <span ref={text} className={`flex min-w-0 ${row ? 'flex-wrap items-center gap-x-4 gap-y-1' : 'flex-col pt-1.5'}`}>
        <span
          className={`min-w-0 font-bold ${toneText} ${
            row
              ? 'text-[22px] leading-[1.08] tracking-[-0.022em] text-balance'
              : 'text-verdict text-balance [@media(min-width:1700px)_and_(min-height:960px)]:text-[34px]'
          }`}
        >
          {view.verdict}
        </span>
        <span className={`flex shrink-0 ${row ? 'gap-3.5' : 'mt-3 gap-[22px]'}`}>
          {figures.map((f) => (
            <FigureView key={f.kind} figure={f} small={row} />
          ))}
        </span>
        {!row && (
          <span className="mt-3 inline-flex items-center gap-1 text-callout font-medium text-signal">
            Show the maths
            <IconChevronRight className="size-3.5 transition-transform duration-[460ms] ease-spring group-hover:translate-x-0.5" />
          </span>
        )}
      </span>
      {row && <IconChevronRight className="size-4 shrink-0 text-signal transition-transform duration-[460ms] ease-spring group-hover:translate-x-0.5" />}
    </button>
  )
}

function FigureView({ figure: f, small }: { figure: Figure; small: boolean }) {
  return (
    <span className="flex flex-col gap-px">
      <b className={`${small ? 'text-body' : 'text-headline'} font-strong leading-[1.15] tracking-[-0.015em] tabular-nums ${FIGURE_TEXT[f.tone]}`}>
        {f.value}
        {f.unit && <span className={`ml-[3px] font-semibold text-dust ${small ? 'text-foot' : 'text-callout'}`}>{f.unit}</span>}
      </b>
      <small className="text-caption font-medium whitespace-nowrap text-dust">{f.label}</small>
      {f.note && <small className="text-caption font-medium whitespace-nowrap text-dust">{f.note}</small>}
    </span>
  )
}
