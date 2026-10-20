/**
 * TableView: the play screen. The table is a product shot: an obsidian slab in real 3D
 * perspective on the black stage, lit from below by the planet's limb. Seats are floating
 * type around it, cards land on bare obsidian, your hand stands below the rim and lifts
 * on your turn, the coach reads beside it, and one glass dock holds every action.
 *
 * Contract (unchanged):
 *   table            the session hook's result (lib/useTableSession.ts)
 *   logOpen          whether the hand log is open (the top bar's log button and the L key
 *                    live in the shell)
 *   onLogOpenChange  open / close the log (Done, Escape, drag down)
 *
 * Mounted once and kept alive (hidden) while another view is open; effects pause while
 * hidden. Opponent visibility comes from usePrefs(). Layout is a pure projection
 * (lib/tableLayout.ts); the model is lib/tableModel.ts; motion is useTableMotion.ts.
 *
 * Keys: F fold, C check or call, R bet or raise (opens the sizing face), 1-5 the size
 * presets, Enter confirms, Escape backs out of sizing, Space deals the next hand. Never
 * while typing in a text field.
 */
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { usePrefs } from '../../lib/prefsContext'
import { useLayoutKind, useViewportSize } from '../../lib/breakpoints'
import { cardLabel } from '../../lib/cards'
import { bb, bbSpeech, parseBB } from '../../lib/format'
import { classifyResult } from '../../lib/handResult'
import { handLog } from '../../lib/handLog'
import { play } from '../../lib/motion'
import { canAggress, aggroType, dockActions, PRESETS, presetAmount, presetIndexFor, submitOf, type DockAction } from '../../lib/sizing'
import { limbHeight, sunPlacement, type Rect } from '../../lib/space'
import { useSpaceAvoid } from '../../lib/spaceAvoid'
import { commandForKey, targetKind, type HotkeyFace } from '../../lib/tableHotkeys'
import { computeLayout, glintAt, placeSeats, project, VILLAIN_SLOTS, type SeatPlacement, type SeatSize, type TableLayout, type VillainSlot } from '../../lib/tableLayout'
import { boardSpeech, buildTableModel, identityOf, STREET_LABEL, statusLine, type TableModel } from '../../lib/tableModel'
import { useEscape } from '../../lib/escapeStack'
import type { TableSession, SessionErrorScope } from '../../lib/useTableSession'
import { Sheet } from '../../ui/Sheet'
import { CoachGlance } from '../coach/CoachGlance'
import { MathsSheet } from '../coach/MathsSheet'
import { Dock } from './Dock'
import { ActionsFace, ErrorFace, ResultFace, SizingFace, StatusFace } from './DockFaces'
import { Felt, Slab } from './Felt'
import { HandLog } from './HandLog'
import { HeroHand } from './HeroHand'
import { SeatLabel } from './SeatLabel'
import { useTableMotion } from './useTableMotion'
import './Stage.css'

export interface TableViewProps {
  table: TableSession
  logOpen: boolean
  onLogOpenChange: (open: boolean) => void
}

const DOCK_ERRORS = ['boot', 'newGame', 'action', 'advance', 'nextHand'] as const
/** Before the first deal: the lineup is fixed (inventory 6.1), shown in Labeled mode only. */
const BOOT_NAMES = ['Nit', 'TAG', 'LAG', 'Station', 'Maniac']
/** Top-seat label heights by mode (two lines; HUD adds the read's line). */
const TOP_SEAT_H = { desk: { two: 43, three: 63 }, phone: { two: 36, three: 54 } } as const

const sizesKeyOf = (sizes: Partial<Record<VillainSlot, SeatSize>>) => VILLAIN_SLOTS.map((k) => `${sizes[k]?.w ?? 0}x${sizes[k]?.h ?? 0}`).join(',')
function sizesFromKey(key: string): Partial<Record<VillainSlot, SeatSize>> {
  const out: Partial<Record<VillainSlot, SeatSize>> = {}
  if (!key) return out
  key.split(',').forEach((part, i) => {
    const [w, h] = part.split('x').map(Number)
    out[VILLAIN_SLOTS[i]] = { w, h }
  })
  return out
}

/** A seat label's box on screen, for keeping stars out from under it. */
function seatRect(p: SeatPlacement, size: SeatSize | undefined): Rect | null {
  if (!size || !size.w) return null
  const w = Math.min(size.w, p.maxWidth ?? Infinity)
  const h = size.h
  switch (p.side) {
    case 'top':
      return { x: p.x - w / 2, y: p.y - h, w, h }
    case 'top-left':
      return { x: p.x, y: p.y - h, w, h }
    case 'top-right':
      return { x: p.x - w, y: p.y - h, w, h }
    case 'left':
    case 'corner-right':
      return { x: p.x - w, y: p.y - h / 2, w, h }
    default:
      return { x: p.x, y: p.y - h / 2, w, h }
  }
}

function stageVars(L: TableLayout): CSSProperties {
  const g = L.g
  return {
    ['--s' as string]: L.s,
    ['--tilt' as string]: `${g.tilt}deg`,
    ['--aspect' as string]: g.aspect,
    ['--persp0' as string]: g.persp,
    ['--thick0' as string]: g.thick,
    ['--card' as string]: g.card,
    ['--back' as string]: g.back,
    ['--chip' as string]: g.chip,
    ['--rev' as string]: g.rev,
    ['--hw' as string]: `${L.hw}px`,
    ['--lift' as string]: `${L.lift}px`,
  }
}

/** What a screen reader hears when the table changes (one polite line). */
function announcement(m: TableModel | null, table: TableSession): string {
  if (!m) return table.booting ? 'Dealing you in' : ''
  if (m.handOver && table.session) {
    const o = classifyResult(table.session)
    return o ? `${o.word}${o.net !== null ? ` ${bbSpeech(Math.abs(o.net), m.bigBlind)}` : ''}. ${o.sub}.` : ''
  }
  if (m.heroTurn && m.legal) return m.legal.can_call ? `Your turn. ${bbSpeech(m.legal.call_amount, m.bigBlind)} to call.` : 'Your turn. You can check.'
  return statusLine(m)
}

export function TableView({ table, logOpen, onLogOpenChange }: TableViewProps) {
  const { session, reads, errors, coachStatus, decisionKey, busy } = table
  const { visibility } = usePrefs()
  const kind = useLayoutKind()
  const phone = kind === 'phone'
  const desk = kind === 'desk'
  const { w: W, h: H } = useViewportSize()

  /* ---------- the maths and the log share one place ---------- */
  const [mathsOpen, setMathsOpen] = useState(false)
  const [prevLog, setPrevLog] = useState(logOpen)
  if (logOpen !== prevLog) {
    setPrevLog(logOpen)
    if (logOpen && mathsOpen) setMathsOpen(false)
  }
  // the maths explains one decision: it closes when the coach leaves 'ready' (you acted)
  if (mathsOpen && coachStatus !== 'ready') setMathsOpen(false)
  const mathsShown = mathsOpen && coachStatus === 'ready'
  const logShown = logOpen && !!session

  const openMaths = () => {
    onLogOpenChange(false)
    setMathsOpen(true)
  }

  /* ---------- model and layout ---------- */
  const model = useMemo(() => (session ? buildTableModel(session, reads, visibility) : null), [session, reads, visibility])
  const panelOpen = desk && (logShown || mathsShown)
  const topSeatH = TOP_SEAT_H[phone ? 'phone' : 'desk'][visibility === 'hud' && model ? 'three' : 'two']
  const L = useMemo(() => computeLayout({ w: W, h: H, kind, panelOpen, limb: limbHeight(H), topSeatH, sideSeatW: 140 }), [W, H, kind, panelOpen, topSeatH])

  // seat labels: their natural sizes push the top three apart (measured after each render)
  const seatEls = useRef<(HTMLDivElement | null)[]>([])
  const [sizesKey, setSizesKey] = useState('')
  const sizes = useMemo(() => sizesFromKey(sizesKey), [sizesKey])
  // what the labels say (their size follows it), and the webfont arriving
  const seatText = useMemo(
    () =>
      model
        ? model.villains.map((v) => `${v.stack}|${v.allIn}|${v.button}|${v.actor}|${v.folded}|${v.net}|${v.label}|${v.tags.join(',')}`).join(';') + `|${visibility}|${JSON.stringify(reads ?? null)}`
        : `boot|${visibility}`,
    [model, visibility, reads],
  )
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let live = true
    document.fonts?.ready.then(() => live && setFontsReady(true))
    return () => {
      live = false
    }
  }, [])
  useLayoutEffect(() => {
    // uncap all five, read all five, restore all five: one forced layout, not five
    const els = VILLAIN_SLOTS.map((_, i) => seatEls.current[i] ?? null)
    const caps = els.map((el) => el?.style.maxWidth ?? '')
    els.forEach((el) => {
      if (el) el.style.maxWidth = 'none'
    })
    const next: Partial<Record<VillainSlot, SeatSize>> = {}
    VILLAIN_SLOTS.forEach((k, i) => {
      const el = els[i]
      if (el) next[k] = { w: Math.ceil(el.offsetWidth), h: Math.ceil(el.offsetHeight) }
    })
    els.forEach((el, i) => {
      if (el) el.style.maxWidth = caps[i]
    })
    const key = sizesKeyOf(next)
    if (key !== sizesKey) setSizesKey(key)
  }, [seatText, fontsReady, kind, sizesKey])
  const places = useMemo(() => placeSeats(L, sizes), [L, sizes])
  const glint = useMemo(() => glintAt(L, sunPlacement(W, H).left), [L, W, H])

  /* ---------- the decision ---------- */
  const legal = model?.legal ?? null
  const street = model?.street ?? 'preflop'
  const actions = useMemo(() => dockActions(legal, street), [legal, street])
  const sizable = canAggress(legal) && legal.min_raise_to !== legal.max_raise_to ? legal : null
  const [sizingFor, setSizingFor] = useState<string | null>(null)
  const sizingOpen = !!decisionKey && sizingFor === decisionKey && !!sizable
  const [pick, setPick] = useState<{ key: string; amount: number; preset: number | null } | null>(null)
  const amount = sizable ? (pick && pick.key === decisionKey ? pick.amount : sizable.min_raise_to) : 0
  const preset = pick && pick.key === decisionKey ? pick.preset : null
  const [pressed, setPressed] = useState<{ key: string | null; id: string } | null>(null)
  const pressedId = busy && pressed && pressed.key === decisionKey ? pressed.id : null
  const pot = model?.pot ?? 0
  const heroBet = model?.hero.bet ?? 0
  // every amount is chips; it is shown, and typed, in big blinds of this hand
  const big = model?.bigBlind ?? 10

  const submit = (type: Parameters<TableSession['act']>[0], toAmount: number | undefined, id: string) => {
    if (busy) return
    setPressed({ key: decisionKey, id })
    void table.act(type, toAmount)
  }
  const openSizing = () => {
    if (decisionKey && sizable) setSizingFor(decisionKey)
  }
  const closeSizing = () => setSizingFor(null)
  const choose = (a: DockAction) => {
    if (a.kind === 'size') return openSizing()
    const s = submitOf(a)
    if (s) submit(s.type, s.toAmount, a.kind)
  }
  const setAmount = (n: number, presetIndex: number | null = null) => {
    if (!decisionKey || !sizable) return
    setPick({ key: decisionKey, amount: n, preset: presetIndex ?? presetIndexFor(sizable, pot, heroBet, n) })
  }
  const choosePreset = (i: number) => {
    if (!sizable) return
    setAmount(presetAmount(sizable, pot, heroBet, PRESETS[i].f), i)
  }
  const typed = (text: string) => {
    if (!sizable) return
    const n = parseBB(text, big, sizable.min_raise_to, sizable.max_raise_to)
    if (n !== null) setAmount(n)
  }
  const confirm = () => {
    if (sizable) submit(aggroType(sizable), amount, 'confirm')
  }
  useEscape(sizingOpen, closeSizing)

  /* ---------- the dock's face ---------- */
  const dockErrorScope = DOCK_ERRORS.find((s) => errors[s])
  const dockError = dockErrorScope ? errors[dockErrorScope] : undefined
  const outcome = session ? classifyResult(session) : null
  let faceKey: string
  if (dockError && dockErrorScope) faceKey = 'error'
  else if (!model) faceKey = 'status'
  else if (outcome) faceKey = 'result'
  else if (model.heroTurn && legal) faceKey = sizingOpen ? 'sizing' : 'actions'
  else faceKey = 'status'
  const statusText = !model ? 'Dealing you in' : table.skipping ? 'Skipping to the result' : statusLine(model)
  const hotFace: HotkeyFace = faceKey === 'actions' || faceKey === 'sizing' || faceKey === 'result' ? faceKey : 'other'

  const dockRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const coachRef = useRef<HTMLDivElement>(null)

  // focus: the slider when sizing opens, back to Raise when it closes; the first action
  // when your turn arrives (only if focus was nowhere in particular, or in the dock)
  const wasSizing = useRef(false)
  useEffect(() => {
    if (sizingOpen) sliderRef.current?.focus({ preventScroll: true })
    else if (wasSizing.current) dockRef.current?.querySelector<HTMLElement>('.face:not(.is-leaving) [data-act="size"]')?.focus({ preventScroll: true })
    wasSizing.current = sizingOpen
  }, [sizingOpen])
  // (once you have used the dock: a fresh page does not grab focus)
  const usedDock = useRef(false)
  useEffect(() => {
    const dock = dockRef.current
    if (!dock) return
    const used = () => {
      usedDock.current = true
    }
    dock.addEventListener('focusin', used)
    return () => dock.removeEventListener('focusin', used)
  }, [])
  useEffect(() => {
    if (!decisionKey || !usedDock.current) return
    const a = document.activeElement
    if (!a || a === document.body || dockRef.current?.contains(a)) dockRef.current?.querySelector<HTMLElement>('.face--actions:not(.is-leaving) button')?.focus({ preventScroll: true })
  }, [decisionKey])

  /* ---------- keys ---------- */
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const cmd = commandForKey(e, targetKind(e.target), hotFace)
    if (!cmd || busy) return
    const has = (k: DockAction['kind']) => actions.find((a) => a.kind === k)
    switch (cmd.type) {
      case 'fold': {
        const a = has('fold')
        if (!a) return
        e.preventDefault()
        choose(a)
        return
      }
      case 'checkCall': {
        const a = has('check') ?? has('call')
        if (!a) return
        e.preventDefault()
        choose(a)
        return
      }
      case 'aggro': {
        e.preventDefault()
        if (has('size')) openSizing()
        else dockRef.current?.querySelector<HTMLElement>('.face:not(.is-leaving) [data-act="allin"]')?.focus()
        return
      }
      case 'preset': {
        if (!sizable) return
        e.preventDefault()
        openSizing()
        choosePreset(cmd.index)
        return
      }
      case 'confirm':
        e.preventDefault()
        confirm()
        return
      case 'next':
        e.preventDefault()
        void table.nextHand()
        return
    }
  })
  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /* ---------- motion ---------- */
  const stageRef = useRef<HTMLDivElement>(null)
  const feltGhosts = useRef<HTMLDivElement>(null)
  const overlayGhosts = useRef<HTMLDivElement>(null)
  const motionRefs = useMemo(() => ({ stage: stageRef, feltGhosts, overlayGhosts, dock: dockRef, coach: coachRef }), [])
  useTableMotion(motionRefs, model, L, table.skipping)

  const coachVisible = coachStatus !== 'idle' && !(phone && sizingOpen)
  // the coach comes in a beat after the hand lifts and the dock grows (only when it really
  // appears: not when the view comes back into sight)
  const coachWas = useRef(false)
  useLayoutEffect(() => {
    if (coachVisible && !coachWas.current) play(coachRef.current, [{ opacity: 0 }, { opacity: 1 }], { delay: 160, duration: 300, ease: 'ease-out' })
    coachWas.current = coachVisible
  }, [coachVisible])

  /* ---------- stars stay out from under the type ---------- */
  const avoid = useMemo(() => {
    const rects: (Rect | null)[] = VILLAIN_SLOTS.map((k) => seatRect(places[k], sizes[k]))
    const heroW = L.hw * 2.1 + 40
    rects.push({ x: L.axis - heroW / 2, y: L.heroTop - L.lift - 10, w: heroW, h: L.hw * 1.4 + (phone ? 62 : 80) + L.lift })
    if (coachVisible) rects.push(L.coachAt === 'side' ? { x: L.coach.left - 18, y: L.coach.top - 18, w: L.coach.width + 36, h: L.coach.height + 36 } : { x: L.coach.left, y: L.coach.top, w: L.coach.width, h: L.coach.height })
    const dw = phone ? L.W - 16 : 480
    rects.push({ x: L.axis - dw / 2 - 16, y: L.dockBottom - L.dockH - 16, w: dw + 32, h: L.dockH + 32 })
    return rects
  }, [places, sizes, L, phone, coachVisible])
  useSpaceAvoid('table', avoid)

  /* ---------- render ---------- */
  const g = L.g
  const villains = model?.villains ?? null
  const pt = (u: number, v: number) => project(L, u, v)
  const sheetInset = desk ? H - L.dockBottom : H - (L.dockBottom - L.dockH - 8)
  // a phone sheet's medium detent stops 8 px under your cards (lifted), so the hand you are
  // acting on stays in sight; drag it up for the large detent
  const sheetTop = phone ? L.heroTop - L.lift + L.hw * 1.4 + 8 : undefined
  const log = useMemo(() => (model && session ? handLog(model.history, session.hero_seat, model.replay.amounts, model.bigBlind) : []), [model, session])
  const showPot = !!model && !model.handOver && model.pot > 0
  const showBets = showPot && model.inBets > 0 && model.inBets < model.pot

  let face
  let faceClass: string
  let faceRole: 'group' | 'status' | undefined
  let faceLabel: string | undefined
  let contentKey: string
  if (faceKey === 'error' && dockError && dockErrorScope) {
    faceClass = 'face--error'
    contentKey = `${dockErrorScope}:${dockError.detail}`
    const scope: SessionErrorScope = dockErrorScope
    face = (
      <ErrorFace
        error={dockError}
        context={scope}
        phone={phone}
        onRetry={() => table.retry(scope)}
        onDismiss={scope === 'boot' || scope === 'advance' ? undefined : () => table.dismissError(scope)}
        onNewGame={() => void table.newGame()}
      />
    )
  } else if (faceKey === 'result' && outcome) {
    faceClass = 'face--result'
    faceRole = 'group'
    faceLabel = 'Hand over'
    contentKey = `${outcome.kind}:${outcome.net}`
    face = <ResultFace outcome={outcome} bigBlind={big} busy={busy} onNext={() => void table.nextHand()} />
  } else if (faceKey === 'actions') {
    faceClass = 'face--actions'
    faceRole = 'group'
    faceLabel = 'Your action'
    contentKey = actions.map((a) => `${a.kind}${'amount' in a ? a.amount : ''}`).join(',')
    face = <ActionsFace actions={actions} bigBlind={big} busy={busy} pressed={pressedId} onPick={choose} />
  } else if (faceKey === 'sizing' && sizable) {
    faceClass = 'face--sizing'
    faceRole = 'group'
    faceLabel = 'Choose an amount'
    contentKey = `sizing:${bb(amount, big).length}`
    face = (
      <SizingFace
        la={sizable}
        street={street}
        bigBlind={big}
        pot={pot}
        heroBet={heroBet}
        amount={amount}
        preset={preset}
        busy={busy}
        pressed={pressedId === 'confirm'}
        sliderRef={sliderRef}
        onBack={closeSizing}
        onPreset={choosePreset}
        onAmount={(n) => setAmount(n)}
        onTyped={typed}
        onConfirm={confirm}
      />
    )
  } else {
    const canSkip = table.canSkip && !table.skipping
    faceClass = `face--status ${canSkip ? 'has-tool' : ''}`
    contentKey = `${statusText}:${canSkip}`
    face = <StatusFace text={statusText} spinner={!model} canSkip={canSkip} onSkip={table.skipToResult} />
  }

  return (
    <main data-view="table">
      <h1 className="sr-only">Table</h1>
      <div ref={stageRef} className="stage" data-geo={L.gk} style={stageVars(L)}>
        <div className="table-obj" aria-hidden="true">
          <div className="scene" style={{ left: L.ox, top: L.oy }}>
            <div className="plane">
              <Slab glint={glint} focus={!!model?.heroTurn} />
              <Felt L={L} board={model?.board ?? []} villains={villains} hero={model?.hero ?? null} ghosts={feltGhosts} />
            </div>
          </div>
        </div>
        <div className="overlay" aria-hidden="true">
          {model && (
            <span className="centred text-foot font-semibold text-fog" data-street-label="" style={{ left: L.pot.x, top: L.pot.streetY }}>
              {STREET_LABEL[model.street]}
            </span>
          )}
          <div className="centred flex items-baseline gap-2" data-pot-label="" hidden={!showPot} style={{ left: L.pot.x, top: L.pot.potY }}>
            <span className="text-foot font-semibold text-fog">Pot</span>
            <span className={`font-strong tabular-nums tracking-[-0.02em] ${phone ? 'text-[24px]' : 'text-title'}`}>{bb(model?.pot ?? 0, big)}</span>
            <span className="text-foot font-semibold text-fog">bb</span>
          </div>
          {showBets && (
            <span className="centred text-foot font-medium tabular-nums text-fog" style={{ left: L.pot.x, top: L.pot.betsY }}>
              {bb(model.inBets, big, { unit: true })} in bets
            </span>
          )}
          {[model?.hero, ...(villains ?? [])].map((s, i) => {
            const p = s?.player ?? i
            const spot = p === 0 ? L.heroBet : L.bets[p as VillainSlot]
            const [x, y] = pt(spot[0], spot[1])
            const side = p === 0 ? 'right' : g.seats[p as VillainSlot].betSide
            return (
              <span
                key={`bet-${p}`}
                className={`bet-label font-strong tabular-nums tracking-[-0.01em] ${phone ? 'text-[14px]' : 'text-callout'}`}
                data-bet={p}
                data-side={side}
                hidden={!s || !(s.bet > 0)}
                style={{ left: x, top: y }}
              >
                {bb(s?.bet ?? 0, big)}
              </span>
            )
          })}
          <div className="overlay-ghosts" ref={overlayGhosts} />
        </div>
        <div className="overlay">
          {VILLAIN_SLOTS.map((k, i) => {
            const v = villains?.[i] ?? null
            const identity = v ? identityOf(v, visibility, reads?.[String(k)]) : { name: visibility === 'labeled' ? BOOT_NAMES[i] : '', pos: null, hud: null }
            return (
              <SeatLabel
                key={k}
                seat={v}
                bigBlind={big}
                identity={identity}
                place={places[k]}
                phone={phone}
                labelRef={(el) => {
                  seatEls.current[i] = el
                }}
              />
            )
          })}
          <HeroHand hero={model?.hero ?? null} bigBlind={big} turn={!!model?.heroTurn} phone={phone} x={L.axis} y={L.heroTop} />
        </div>
      </div>

      {model && (
        <p className="sr-only">
          {STREET_LABEL[model.street]}. {boardSpeech(model.board, cardLabel)}.{showPot ? ` Pot ${bbSpeech(model.pot, big)}${showBets ? `, ${bbSpeech(model.inBets, big)} of it in bets` : ''}.` : ''}
        </p>
      )}

      {/* a positioning slot only: CoachGlance's own aside is the Coach landmark */}
      <div
        ref={coachRef}
        className={`coach-slot flex ${L.coachAt === 'row' ? 'items-center' : 'flex-col items-start'}`}
        data-at={L.coachAt}
        hidden={!coachVisible}
        // beside the hand it may use the room up to the edge (or a side panel), no more: a
        // long verdict wraps instead of running under the panel
        style={L.coachAt === 'side' ? { left: L.coach.left, top: L.coach.top, maxWidth: L.Weff - 16 - L.coach.left } : { left: L.axis, bottom: H - (L.dockBottom - L.dockH - 10) }}
      >
        <CoachGlance
          coaching={table.coaching}
          status={coachStatus}
          error={errors.coach}
          layout={L.coachAt}
          tight={L.tight}
          onAsk={table.askCoach}
          onRetry={() => table.retry('coach')}
          onDismissError={() => table.dismissError('coach')}
          onOpenMaths={openMaths}
          onHide={table.hideCoach}
          mathsOpen={mathsShown}
        />
        {/* CoachGlance offers Hide on a ready answer; this one cancels a request in flight */}
        {table.coachMode !== 'on' && coachStatus === 'loading' && (
          <button
            type="button"
            onClick={table.hideCoach}
            className={`h-9 rounded-full border-0 bg-transparent px-3 text-callout font-medium text-signal transition-colors duration-200 hover:bg-signal/10 ${L.coachAt === 'row' ? 'ml-1' : '-ml-3 mt-2'}`}
          >
            Hide
          </button>
        )}
      </div>

      <Dock
        dockRef={dockRef}
        faceKey={faceKey}
        contentKey={contentKey}
        faceClass={faceClass}
        faceRole={faceRole}
        faceLabel={faceLabel}
        axis={L.axis}
        bottom={H - L.dockBottom}
        phone={phone}
        raised={!desk && (logShown || mathsShown)}
        busy={busy}
      >
        {face}
      </Dock>

      <div className="sr-only" aria-live="polite">
        {announcement(model, table)}
      </div>

      <Sheet open={logShown} onClose={() => onLogOpenChange(false)} title="This hand" bottomInset={sheetInset} mediumTop={sheetTop}>
        <HandLog streets={log} />
      </Sheet>
      <MathsSheet
        coaching={table.coaching}
        open={mathsShown}
        onClose={() => setMathsOpen(false)}
        bottomInset={sheetInset}
        mediumTop={sheetTop}
        positions={session?.state.seats.map((s) => s.position)}
      />
    </main>
  )
}
