/**
 * CoachGlance: the coach at a glance, bare on the void beside your hand (layout 'side') or
 * as one row above the dock on a phone (layout 'row'). OWNED BY THE COACH BUILDER: this is
 * the agreed contract with a minimal working implementation.
 *
 * Contract:
 *   coaching        the answer for this decision (null unless status is 'ready')
 *   status          'off'     offer "Ask the coach" (onAsk)
 *                   'idle'    not the hero's turn: render nothing
 *                   'loading' working out the odds
 *                   'ready'   ring + verdict + figures; the whole thing opens the maths
 *                   'error'   scoped error with Try again (onRetry) and Dismiss (onDismissError)
 *   error           the coach's ApiError when status is 'error'
 *   layout          'side' | 'row'
 *   onAsk           ask (mode off) or reveal (think-first) the coach
 *   onRetry         ask again after an error
 *   onDismissError  hide the error
 *   onOpenMaths     open the maths sheet (MathsSheet)
 */
import type { Coaching } from '../../api'
import type { ApiError } from '../../lib/apiError'
import { pct } from '../../lib/format'
import { normalizeTone } from '../../lib/ring'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { IconChevronRight, IconCoach } from '../../ui/Icons'
import { Ring } from '../../ui/Ring'

export interface CoachGlanceProps {
  coaching: Coaching | null
  status: 'off' | 'idle' | 'loading' | 'ready' | 'error'
  error?: ApiError | null
  layout: 'side' | 'row'
  onAsk(): void
  onRetry(): void
  onDismissError(): void
  onOpenMaths(): void
}

const TONE_TEXT = { good: 'text-win', neutral: 'text-ink', close: 'text-close', fold: 'text-loss' } as const

export function CoachGlance({ coaching, status, error, layout, onAsk, onRetry, onDismissError, onOpenMaths }: CoachGlanceProps) {
  const row = layout === 'row'
  if (status === 'idle') return null
  if (status === 'off')
    return (
      <Capsule variant="quiet" size="md" onClick={onAsk} className="pl-3">
        <IconCoach />
        Ask the coach
      </Capsule>
    )
  if (status === 'loading')
    return (
      <p role="status" className="flex items-center gap-4 text-callout text-fog">
        <span className="size-11 animate-pulse rounded-full border-[6px] border-white/15" aria-hidden="true" />
        Working out the odds
      </p>
    )
  if (status === 'error' || !coaching)
    return error ? (
      <ErrorNotice error={error} context="coach" onRetry={onRetry} onDismiss={onDismissError} layout={row ? 'row' : 'stack'} />
    ) : null

  const c = coaching
  const tone = normalizeTone(c.tone)
  const priced = c.to_call > 0 && c.required_equity_pct != null
  const eq = c.action_closed ? c.equity_pct : c.realized_equity_pct
  const eqWord = c.action_closed ? 'Equity' : 'Realized'
  const size = row ? 52 : 112
  const label = `${c.verdict} ${eqWord} ${pct(eq)}${priced ? `, need ${pct(c.required_equity_pct, 1)}` : ''}. Show the maths`

  return (
    <button
      type="button"
      onClick={onOpenMaths}
      aria-haspopup="dialog"
      aria-label={label}
      className={`flex items-center border-0 bg-transparent text-left transition-colors duration-200 hover:bg-white/[0.035] ${
        row ? 'gap-3.5 rounded-full py-1.5 pl-1.5 pr-3.5' : '-m-2.5 items-start gap-6 rounded-[30px] p-2.5'
      }`}
    >
      {priced && <Ring realizedPct={eq} needPct={c.required_equity_pct} rawPct={c.equity_pct} tone={tone} size={size} reveal />}
      <span className={`flex min-w-0 ${row ? 'items-center gap-4' : 'flex-col pt-1.5'}`}>
        <span className={`${row ? 'whitespace-nowrap text-[22px] font-bold tracking-[-0.022em]' : 'text-verdict font-bold'} ${TONE_TEXT[tone]}`}>{c.verdict}</span>
        <span className={`flex ${row ? 'gap-3.5' : 'mt-3 gap-[22px]'}`}>
          <Figure value={pct(eq)} label={eqWord} className={TONE_TEXT[tone]} small={row} />
          {priced && <Figure value={pct(c.required_equity_pct)} label="Need" className="text-fog" small={row} />}
        </span>
        {!row && (
          <span className="mt-3 inline-flex items-center gap-1 text-callout font-medium text-signal" aria-hidden="true">
            Show the maths
            <IconChevronRight />
          </span>
        )}
      </span>
      {row && <IconChevronRight className="size-3.5 text-signal" />}
    </button>
  )
}

function Figure({ value, label, className, small }: { value: string; label: string; className: string; small: boolean }) {
  return (
    <span className="flex flex-col gap-px">
      <b className={`${small ? 'text-body' : 'text-headline'} font-strong leading-[1.15] tabular-nums ${className}`}>{value}</b>
      <small className="text-caption font-medium text-dust">{label}</small>
    </span>
  )
}
