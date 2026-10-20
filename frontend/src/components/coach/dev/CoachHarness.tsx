/**
 * CoachHarness: DEV ONLY (frontend/coach-harness.html, served by `vite`, never built).
 * Renders CoachGlance and MathsSheet against the real captured coach answers
 * (lib/coachSamples.ts), set on the Stage void roughly where the table puts them, so every
 * verdict and state can be looked at and screenshotted without playing hands.
 *
 * Query parameters:
 *   s=<sample>        a lib/coachSamples name (default spot_implied_draw)
 *   status=ready|loading|off|error|idle   (default ready)
 *   err=conflict|network|server|not_found|bad_request   the error for status=error
 *   mode=on|think|off coach mode (labels "Ask" / "Show the coach", Hide)
 *   vis=labeled|hud|live  opponent visibility (villain names in the maths)
 *   maths             open the maths sheet;  working=1|0  Show working open / closed
 *   tight             the side glance with little room (Call EV drops)
 *   gallery           every sample's glance on one page
 * The glance reacts like the app: Ask -> loading -> ready, Hide -> off, Try again.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { ApiError, toApiError } from '../../../lib/apiError'
import { useLayoutKind, useViewportSize } from '../../../lib/breakpoints'
import { coachRingPx, coachSideWidth, sidePanelWidth } from '../../../lib/coachLayout'
import { setShowWorking } from '../../../lib/coachPrefs'
import { COACH_SAMPLES, coachSample, type CoachSample } from '../../../lib/coachSamples'
import type { CoachStatus } from '../../../lib/coachStatus'
import { capitalize } from '../../../lib/coachWorking'
import { DECKS } from '../../../lib/decks'
import { bb, bigBlindOf } from '../../../lib/format'
import { PrefsContext, usePrefs, type PrefsValue } from '../../../lib/prefsContext'
import { normalizeCoachMode, normalizeVisibility, type CoachMode, type VisibilityMode } from '../../../lib/prefsSchema'
import { Card } from '../../Card'
import { Capsule } from '../../../ui/Capsule'
import { Glass } from './Glass'
import { Space } from '../../../ui/Space'
import { CoachGlance } from '../CoachGlance'
import { MathsSheet } from '../MathsSheet'

const q = new URLSearchParams(window.location.search)
if (q.has('working')) setShowWorking(q.get('working') !== '0')

const STATUSES: readonly CoachStatus[] = ['off', 'idle', 'loading', 'ready', 'error']
const initialStatus = (STATUSES as readonly string[]).includes(q.get('status') ?? '') ? (q.get('status') as CoachStatus) : 'ready'

function harnessError(kind: string | null): ApiError {
  const path = '/session/harness/coach'
  switch (kind) {
    case 'network':
      return toApiError(new TypeError('Failed to fetch'), path, 'http://localhost:8000')
    case 'server':
      return new ApiError({ status: 500, detail: 'Internal Server Error', path })
    case 'not_found':
      return new ApiError({ status: 404, detail: 'session not found', path })
    case 'bad_request':
      return new ApiError({ status: 400, detail: 'unknown action type: shove', path })
    default:
      return new ApiError({ status: 409, detail: 'coaching is only available on the hero’s turn', path })
  }
}

function usePrefsValue(): PrefsValue {
  const [coachMode, setCoachMode] = useState<CoachMode>(() => normalizeCoachMode(q.get('mode')))
  const [visibility, setVisibility] = useState<VisibilityMode>(() => normalizeVisibility(q.get('vis')))
  return useMemo(
    () => ({ deckId: 'standard', deck: DECKS[0], setDeckId: () => {}, visibility, setVisibility, coachMode, setCoachMode }),
    [visibility, coachMode],
  )
}

export function CoachHarness() {
  const prefs = usePrefsValue()
  return (
    <PrefsContext value={prefs}>
      <div className="relative min-h-dvh">
        <Space variant={q.has('gallery') ? 'page' : 'stage'} />
        {q.has('gallery') ? <Gallery /> : <Scene sample={coachSample(q.get('s') ?? 'spot_implied_draw')} />}
      </div>
    </PrefsContext>
  )
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** One decision, laid out like the table: hand at the centre, coach beside it, dock below. */
function Scene({ sample }: { sample: CoachSample }) {
  const c = sample.coach
  const { coachMode } = usePrefs()
  const kind = useLayoutKind()
  const { w: vw, h: vh } = useViewportSize()
  const [status, setStatus] = useState<CoachStatus>(initialStatus)
  const [mathsOpen, setMathsOpen] = useState(q.has('maths'))
  const error = useMemo(() => harnessError(q.get('err')), [])
  if (mathsOpen && status !== 'ready') setMathsOpen(false)

  const phone = kind === 'phone'
  const desk = kind === 'desk'
  const panelW = desk && mathsOpen ? sidePanelWidth(vw) : 0
  const weff = vw - (panelW ? panelW + 16 : 0)
  const axis = phone ? vw / 2 : weff / 2
  const hw = phone ? 66 : Math.round(clamp(Math.min(vw * 0.0743, vh * 0.119), 76, 116))
  const ring = coachRingPx(hw, vw, vh)
  const room = weff - 16 - (axis + hw * 1.05 + 48)
  const layout = phone || room < coachSideWidth(ring, true) ? 'row' : 'side'
  const tight = q.has('tight') || (layout === 'side' && room < coachSideWidth(ring, false))
  const dockBottom = phone ? 58 : vh < 800 ? 60 : 68
  const dockH = phone ? 66 : 64
  const heroTop = phone ? 405 : Math.round(vh * (vh < 800 ? 0.54 : 0.574))
  const priced = c.to_call > 0

  const ask = () => {
    if (coachMode === 'think') return setStatus('ready')
    setStatus('loading')
    window.setTimeout(() => setStatus('ready'), 900)
  }

  const coachStyle: CSSProperties =
    layout === 'side'
      ? { left: axis + hw * 1.05 + 48, top: heroTop }
      : { left: axis, bottom: dockBottom + dockH + 10, transform: 'translateX(-50%)' }

  return (
    <>
      <p className="fixed top-5 left-6 z-20 m-0 text-caption text-dust">Coach harness: {sample.name}</p>
      <main className="fixed inset-0 z-[1]">
        <h1 className="sr-only">Coach harness</h1>
        {/* the board, flat: context only */}
        <div className="absolute flex -translate-x-1/2 gap-2.5" style={{ left: axis, top: phone ? 220 : vh * 0.26 }}>
          {sample.board.map((card) => (
            <Card key={card} card={card} width={phone ? 46 : Math.round(hw * 0.78)} />
          ))}
        </div>
        <p className="absolute m-0 -translate-x-1/2 text-callout text-fog" style={{ left: axis, top: (phone ? 220 + 70 : vh * 0.26 + hw * 1.15) }}>
          Pot <b className="text-title font-strong text-ink tabular-nums">{bb(c.pot, bigBlindOf(c))}</b> bb
        </p>
        {/* your hand, lifted on your turn */}
        <div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: axis, top: heroTop }}>
          <div className="flex gap-2.5">
            {sample.heroCards.map((card) => (
              <Card key={card} card={card} width={hw} className="shadow-[0_18px_40px_rgba(0,0,0,0.6)]" />
            ))}
          </div>
          <p className="mt-9 mb-0 text-headline font-strong text-ink">{capitalize(c.hand_label)}</p>
          <p className="mt-1 mb-0 text-callout text-fog">
            <b className="font-semibold text-ink">You</b> {sample.positions[sample.heroSeat]}
          </p>
        </div>

        <div className={`absolute z-[8] ${layout === 'row' ? 'w-max' : ''}`} style={coachStyle}>
          <CoachGlance
            coaching={status === 'ready' ? c : null}
            status={status}
            error={error}
            layout={layout}
            tight={tight}
            ringSize={ring}
            mathsOpen={mathsOpen}
            onAsk={ask}
            onRetry={() => {
              setStatus('loading')
              window.setTimeout(() => setStatus('ready'), 900)
            }}
            onDismissError={() => setStatus('off')}
            onHide={() => setStatus('off')}
            onOpenMaths={() => setMathsOpen(true)}
          />
        </div>

      </main>
      <div className={`fixed z-[31] -translate-x-1/2 ${phone ? 'w-[calc(100vw-16px)]' : ''}`} style={{ left: axis, bottom: dockBottom }}>
        <Glass className={`flex items-center gap-2 p-2 ${phone ? 'h-[66px]' : 'h-16'}`}>
          {(priced ? ['Fold', `Call ${bb(c.to_call, bigBlindOf(c), { unit: true })}`, 'Raise'] : ['Check', 'Bet']).map((label) => (
            <Capsule key={label} variant="secondary" size="lg" className={phone ? 'min-w-0 flex-1' : ''}>
              {label}
            </Capsule>
          ))}
        </Glass>
      </div>
      <MathsSheet
        coaching={status === 'ready' ? c : null}
        open={mathsOpen}
        onClose={() => setMathsOpen(false)}
        bottomInset={desk ? dockBottom : dockBottom + dockH + 8}
        positions={sample.positions}
      />
    </>
  )
}

/** Every captured answer's glance on one page (side layout; the row on a phone). */
function Gallery() {
  const kind = useLayoutKind()
  const row = kind === 'phone'
  return (
    <main className="relative z-[1] grid gap-x-10 gap-y-12 px-6 pt-16 pb-40 sm:grid-cols-2 lg:grid-cols-3">
      <h1 className="sr-only">Coach gallery</h1>
      {COACH_SAMPLES.map((s) => (
        <section key={s.name} className="min-w-0">
          <p className="mt-0 mb-4 text-caption text-dust">{s.name}</p>
          <div className={row ? 'flex justify-center' : 'pl-2.5'}>
            <CoachGlance
              coaching={s.coach}
              status="ready"
              layout={row ? 'row' : 'side'}
              onAsk={() => {}}
              onRetry={() => {}}
              onDismissError={() => {}}
              onOpenMaths={() => {}}
            />
          </div>
        </section>
      ))}
    </main>
  )
}
