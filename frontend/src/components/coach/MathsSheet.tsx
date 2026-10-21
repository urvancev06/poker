/**
 * MathsSheet: the coach's working, as a sheet (a side panel on desktop, a bottom sheet on
 * a phone or tablet; ui/Sheet). It reads as an explanation, top to bottom:
 *   1. two bars on one 0-100 scale: Realized (or Equity once the action is closed) against
 *      Need, with an ink tick at raw equity when it differs;
 *   2. the coach's rationale, verbatim;
 *   3. "Their range": one line per modelled villain (the line they took, the top % and
 *      combos, and the air share with what it means; none for a villain who only called,
 *      B28). Named by archetype when Labeled, by position in HUD and Live (B16);
 *   4. "Show working": the derivation, every row tagged Exact / Computed / Estimate (Need
 *      is an Estimate whenever the implied adjustment moved the price). Its open state is
 *      remembered across decisions;
 *   5. "How this is worked out": the backend's basis list;
 *   6. the honesty tag "Computed, not solved." and a link to check in GTO Wizard.
 * The body scrolls, with a fade when more is below; nothing clips.
 *
 * Contract:
 *   coaching     the answer being explained (null: the sheet closes; the last answer stays
 *                on screen while it animates out)
 *   open         whether the sheet is open
 *   onClose()    Done, Escape, a tap on the scrim, or a drag down
 *   bottomInset  optional: px from the viewport bottom where the sheet ends (above the
 *                dock, so you can read and act); default 16 side, 8 bottom
 *   mediumTop    optional: how high the phone sheet's medium detent may reach (viewport
 *                y, under your cards: ui/Sheet)
 * Optional:
 *   positions    position by seat index (session.state.seats[i].position), to name
 *                villains in HUD and Live modes; without it they read "Opponent"
 *   width        the desktop panel's width (default lib/coachLayout sidePanelWidth)
 */
import { useId, useState } from 'react'
import type { Coaching } from '../../api'
import { useViewportSize } from '../../lib/breakpoints'
import { SHEET_RING_PX, sidePanelWidth } from '../../lib/coachLayout'
import { useShowWorking } from '../../lib/coachPrefs'
import { villainLines, type VillainLine } from '../../lib/coachRange'
import { glanceView, type GlanceView } from '../../lib/coachView'
import { PROVENANCE_LABEL, workingRows, type WorkingRow } from '../../lib/coachWorking'
import { equityMethodChip, equityMethodSpoken } from '../../lib/equityMethod'
import { pct } from '../../lib/format'
import { usePrefs } from '../../lib/prefsContext'
import { Disclosure } from '../../ui/Disclosure'
import { MethodChip } from '../../ui/MethodChip'
import { Ring } from '../../ui/Ring'
import { Sheet } from '../../ui/Sheet'
import { TONE_FILL, TONE_TEXT } from './tones'

export interface MathsSheetProps {
  coaching: Coaching | null
  open: boolean
  onClose(): void
  bottomInset?: number
  mediumTop?: number
  positions?: readonly string[]
  width?: number
}

const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-[9px] not-first:border-t not-first:border-white/6'

export function MathsSheet({ coaching, open, onClose, bottomInset, mediumTop, positions, width }: MathsSheetProps) {
  // Keep the last answer while the sheet animates out (coaching goes null when you act).
  const [last, setLast] = useState(coaching)
  if (coaching && coaching !== last) setLast(coaching)
  const { visibility } = usePrefs()
  const { w: vw } = useViewportSize()
  const [working, setWorking] = useShowWorking()

  const c = coaching ?? last
  if (!c) return null
  const view = glanceView(c)
  const lines = villainLines(c, { visibility, positions, priced: view.priced })

  return (
    <Sheet
      open={open && !!coaching}
      onClose={onClose}
      title={view.verdict}
      label="The maths"
      tone={view.tone}
      bottomInset={bottomInset}
      mediumTop={mediumTop}
      width={width ?? sidePanelWidth(vw)}
      leading={
        view.priced ? <Ring realizedPct={view.eq} needPct={view.need} rawPct={view.raw} tone={view.tone} size={SHEET_RING_PX} /> : undefined
      }
    >
      {view.reduced && c.mode_note && <p className="m-0 mb-3 text-foot text-fog">{c.mode_note}</p>}
      <Bars view={view} method={equityMethodChip(c, view.eqLabel)} spoken={equityMethodSpoken(c)} />
      <p className="mt-[22px] mb-0 text-body leading-[1.45] text-ink">{c.rationale}</p>
      {lines.length > 0 && <TheirRange lines={lines} />}
      <Disclosure summary="Show working" open={working} onOpenChange={setWorking} className="mt-[18px]" panelClassName="mb-1.5 mt-1">
        <Working rows={workingRows(c)} />
      </Disclosure>
      <Disclosure summary="How this is worked out" panelClassName="mb-1.5 mt-1">
        <ul className="m-0 grid list-none gap-1.5 p-0 text-foot leading-[1.45] text-fog">
          {c.basis.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </Disclosure>
      <p className="mt-3.5 mb-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-foot text-fog">
        <span>Computed, not solved.</span>
        <a href="https://gtowizard.com" target="_blank" rel="noopener noreferrer" className="rounded-sm text-signal no-underline hover:underline">
          Check in GTO Wizard
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </Sheet>
  )
}

/** Realized (or Equity) against Need, on one 0-100 scale. */
function Bars({ view, method, spoken }: { view: GlanceView; method: string | null; spoken: string | null }) {
  const rawTick = Math.abs(view.raw - view.eq) >= 1 ? view.raw : null
  const label = `${view.eqLabel} ${pct(view.eq)}${view.need != null ? `, need ${pct(view.need, 1)}` : ''}${rawTick != null ? `, raw equity ${pct(rawTick)}` : ''}${spoken ? `, ${spoken}` : ''}`
  return (
    <div role="img" aria-label={label} className="grid gap-4">
      <Bar label={view.eqLabel} chip={method} value={pct(view.eq)} width={view.eq} valueClass={TONE_TEXT[view.tone]} fillClass={`bg-linear-to-r ${TONE_FILL[view.tone]}`} tick={rawTick} />
      {view.need != null && <Bar label="Need" value={pct(view.need, 1)} width={view.need} valueClass="text-ink" fillClass="bg-fog" tick={null} />}
    </div>
  )
}

interface BarProps {
  label: string
  /** The equity method's chip, beside the label. */
  chip?: string | null
  value: string
  width: number
  valueClass: string
  fillClass: string
  tick: number | null
}

const clamp = (n: number) => Math.min(100, Math.max(0, n))

function Bar({ label, chip = null, value, width, valueClass, fillClass, tick }: BarProps) {
  return (
    <div aria-hidden="true">
      <div className="flex items-baseline justify-between">
        <span className="text-callout font-medium text-fog">
          {label}
          <MethodChip tag={chip} className="ml-2" />
        </span>
        <span className={`text-[24px] leading-[1.15] font-strong tracking-[-0.02em] tabular-nums ${valueClass}`}>{value}</span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-[5px] bg-white/10">
        <i className={`absolute inset-y-0 left-0 rounded-[5px] ${fillClass}`} style={{ width: `${clamp(width)}%` }} />
        {tick != null && (
          <i
            className="absolute -inset-y-1 -ml-px w-0.5 rounded-[1px] bg-ink shadow-[0_0_0_1.5px_var(--sheet-fill)]"
            style={{ left: `${clamp(tick)}%` }}
            title={`Raw equity ${pct(tick)}`}
          />
        )}
      </div>
    </div>
  )
}

function TheirRange({ lines }: { lines: VillainLine[] }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mt-[22px]">
      <h3 id={id} className="m-0 text-callout font-medium text-fog">
        Their range
      </h3>
      <ul className="m-0 mt-1 list-none p-0">
        {lines.map((l) => (
          <li key={l.seat} className={ROW}>
            <span className="min-w-0">
              <span className="block text-callout font-semibold text-ink">{l.name}</span>
              <span className="mt-0.5 block text-foot leading-[1.35] text-fog">{l.line}</span>
              {l.air && <span className="mt-1 block text-foot leading-[1.35] text-fog">{l.air}</span>}
            </span>
            <span className="text-right text-body font-strong tracking-[-0.01em] whitespace-nowrap tabular-nums">{l.value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Working({ rows }: { rows: WorkingRow[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {rows.map((r) => (
        <li key={r.key} className={ROW}>
          <span className="min-w-0">
            <span className="block text-callout font-semibold text-ink">{r.label}</span>
            {r.note && <span className="mt-0.5 block text-foot leading-[1.35] text-fog">{r.note}</span>}
          </span>
          <span className="text-right">
            <span className="block text-body font-strong tracking-[-0.01em] whitespace-nowrap tabular-nums">{r.value}</span>
            <span className={`mt-[3px] block text-caption font-semibold ${r.kind === 'exact' ? 'text-fog' : 'text-dust-sheet'}`}>{PROVENANCE_LABEL[r.kind]}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
