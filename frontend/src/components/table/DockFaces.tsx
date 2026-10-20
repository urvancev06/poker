/**
 * The dock's faces. Each renders the inside of one face; Dock.tsx draws the glass.
 *   StatusFace   the latest action while the bots play ("Maniac bets 13 bb"), cross-fading as
 *                it changes; "Dealing you in" with a spinner at boot; "Skip to result"
 *                after you fold (B17)
 *   ActionsFace  three equal capsules: Fold / Check, Call 1.5 bb, Bet or Raise (B1, B26). The
 *                coach's pick is not painted on a button: the verdict says it, you choose
 *   SizingFace   back, presets 1/3 1/2 3/4 Pot All-in, the slider, the exact amount in big
 *                blinds (one decimal; "7.5", "7,5" and "75bb" all read), confirm
 *   ResultFace   six outcomes kept apart (B2) and Next hand
 *   ErrorFace    a scoped error with the backend's detail, Dismiss and Try again
 * Keys (aria-keyshortcuts): F fold, C check/call, R bet/raise, 1-5 presets, Enter
 * confirm, Space next hand.
 */
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react'
import type { LegalActions } from '../../api'
import type { ApiError, ErrorContext } from '../../lib/apiError'
import { describeError } from '../../lib/apiError'
import { bb, bbSpeech } from '../../lib/format'
import type { HandOutcome } from '../../lib/handResult'
import { play, useReducedMotion } from '../../lib/motion'
import { PRESETS, aggroLabel, amountFill, presetTicks, type DockAction } from '../../lib/sizing'
import type { Street } from '../../lib/tableModel'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { IconButton } from '../../ui/IconButton'
import { IconBack } from '../../ui/Icons'

/* ---------- status ---------- */

export function StatusFace({ text, spinner, canSkip, onSkip }: { text: string; spinner: boolean; canSkip: boolean; onSkip: () => void }) {
  const reduce = useReducedMotion()
  // the line it replaces fades out over it (adjusted during render; none to fade when
  // motion is reduced)
  const [lines, setLines] = useState<{ now: string; was: string | null }>({ now: text, was: null })
  if (lines.now !== text) setLines({ now: text, was: reduce ? null : lines.now })
  const nowRef = useRef<HTMLSpanElement>(null)
  const wasRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (lines.was === null) return
    // out, then in, overlapping only briefly, so two lines never read as one
    play(nowRef.current, [{ opacity: 0 }, { opacity: 1 }], { delay: 90, duration: 200, ease: 'ease-out' })
    const a = play(wasRef.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, ease: 'ease-out', fill: 'forwards' })
    if (!a) return
    const done = () => setLines((l) => (l.was === null ? l : { now: l.now, was: null }))
    a.finished.then(done, () => {})
    return () => a.cancel()
  }, [lines])
  return (
    <>
      {spinner && <span className="status__dot" aria-hidden="true" />}
      <span className="status__text text-callout font-medium text-fog">
        <span ref={nowRef} key={lines.now}>
          {lines.now}
        </span>
        {lines.was !== null && (
          <span ref={wasRef} aria-hidden="true" key={`was-${lines.was}`}>
            {lines.was}
          </span>
        )}
      </span>
      {canSkip && (
        <Capsule variant="quiet" size="sm" onClick={onSkip} className="ml-1">
          Skip to result
        </Capsule>
      )}
    </>
  )
}

/* ---------- actions ---------- */

const KEYS: Record<DockAction['kind'], string> = { fold: 'F', check: 'C', call: 'C', size: 'R', allin: 'R' }

export function ActionsFace({ actions, bigBlind, busy, pressed, onPick }: { actions: DockAction[]; bigBlind: number; busy: boolean; pressed: string | null; onPick: (a: DockAction) => void }) {
  return actions.map((a) => {
    const id = a.kind
    let label: string
    let name: string | undefined
    switch (a.kind) {
      case 'fold':
        label = 'Fold'
        break
      case 'check':
        label = 'Check'
        break
      case 'call':
        label = `Call ${bb(a.amount, bigBlind, { unit: true })}`
        break
      case 'size':
        label = a.verb
        name = `${a.verb}, choose an amount`
        break
      case 'allin':
        label = `All-in ${bb(a.amount, bigBlind, { unit: true })}`
        break
    }
    return (
      <Capsule
        key={id}
        variant="secondary"
        size="lg"
        data-act={id}
        data-pressed={pressed === id ? '' : undefined}
        aria-label={name}
        aria-keyshortcuts={KEYS[a.kind]}
        disabled={busy}
        onClick={() => onPick(a)}
      >
        {label}
      </Capsule>
    )
  })
}

/* ---------- sizing ---------- */

export interface SizingFaceProps {
  la: LegalActions & { min_raise_to: number; max_raise_to: number }
  street: Street
  /** The hand's big blind: the amount is chips, shown and typed in big blinds. */
  bigBlind: number
  pot: number
  heroBet: number
  amount: number
  preset: number | null
  busy: boolean
  pressed: boolean
  sliderRef: RefObject<HTMLInputElement | null>
  onBack: () => void
  onPreset: (index: number) => void
  onAmount: (amount: number) => void
  onTyped: (text: string) => void
  onConfirm: () => void
}

export function SizingFace({ la, street, bigBlind, pot, heroBet, amount, preset, busy, pressed, sliderRef, onBack, onPreset, onAmount, onTyped, onConfirm }: SizingFaceProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const ticks = presetTicks(la, pot, heroBet)
  const fill = amountFill(amount, la.min_raise_to, la.max_raise_to)
  const commit = () => {
    if (draft !== null) onTyped(draft)
    setDraft(null)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }
  return (
    <>
      <IconButton label="Back to actions" title="Back (Escape)" aria-keyshortcuts="Escape" size="lg" variant="secondary" className="sizing__back" onClick={onBack} disabled={busy}>
        <IconBack />
      </IconButton>
      <div className="presets" role="group" aria-label="Sizes">
        {PRESETS.map((p, i) => (
          <button key={p.name} type="button" aria-pressed={preset === i} aria-label={p.label === p.name ? undefined : p.name} aria-keyshortcuts={String(i + 1)} disabled={busy} onClick={() => onPreset(i)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="slider-wrap">
        <input
          ref={sliderRef}
          className="slider"
          type="range"
          min={la.min_raise_to}
          max={la.max_raise_to}
          step={1}
          value={amount}
          aria-label={street !== 'preflop' && la.can_bet ? 'Bet' : 'Raise to'}
          aria-valuetext={bbSpeech(amount, bigBlind)}
          disabled={busy}
          style={{ ['--fill' as string]: `${fill}%` }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onAmount(Number(e.target.value))}
        />
        <span className="slider__ticks" aria-hidden="true">
          {ticks.map((t, i) => (
            <i key={i} style={{ left: `${t}%` }} />
          ))}
        </span>
      </div>
      <input
        className="amount"
        type="text"
        inputMode="decimal"
        aria-label={`Exact amount in big blinds, ${bb(la.min_raise_to, bigBlind)} to ${bb(la.max_raise_to, bigBlind)}`}
        value={draft ?? bb(amount, bigBlind)}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
      />
      <Capsule variant="primary" size="lg" className="sizing__confirm min-w-[150px]" aria-keyshortcuts="Enter" data-pressed={pressed ? '' : undefined} disabled={busy} onClick={onConfirm}>
        {aggroLabel(la, street, amount, bigBlind)}
      </Capsule>
    </>
  )
}

/* ---------- result ---------- */

const NET_TONE = { win: 'text-win', loss: 'text-loss', neutral: 'text-ink' } as const

export function ResultFace({ outcome, bigBlind, busy, onNext }: { outcome: HandOutcome; bigBlind: number; busy: boolean; onNext: () => void }) {
  return (
    <>
      <span className="text-headline font-strong tracking-[-0.018em]">{outcome.word}</span>
      {outcome.net !== null && <span className={`text-headline font-strong tabular-nums tracking-[-0.01em] ${NET_TONE[outcome.tone]}`}>{bb(outcome.net, bigBlind, { sign: true, unit: true })}</span>}
      <span className="result__sub mr-1.5 text-callout text-fog">{outcome.sub}</span>
      <Capsule variant="primary" size="lg" aria-keyshortcuts="Space" disabled={busy} onClick={onNext}>
        Next hand
      </Capsule>
    </>
  )
}

/* ---------- error ---------- */

export function ErrorFace({ error, context, phone, onRetry, onDismiss, onNewGame }: { error: ApiError; context: ErrorContext; phone: boolean; onRetry: () => void; onDismiss?: () => void; onNewGame: () => void }) {
  const d = describeError(error, context)
  // the server lost this session (a backend restart), or nothing else gets you out of an
  // error that asking again cannot fix: a new game. Try again only where it can succeed.
  const newGame = d.needsNewGame || (!d.retryable && !onDismiss)
  return (
    <ErrorNotice
      error={error}
      context={context}
      layout="row"
      onRetry={newGame ? onNewGame : d.retryable ? onRetry : undefined}
      retryLabel={newGame ? 'New game' : 'Try again'}
      onDismiss={onDismiss}
      compactDismiss={phone && !!onDismiss && !!(newGame || d.retryable)}
      className={phone ? 'w-full min-w-0' : 'max-w-[min(640px,calc(100vw-32px))]'}
    />
  )
}
