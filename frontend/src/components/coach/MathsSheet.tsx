/**
 * MathsSheet: the coach's working, as a sheet (side panel on desktop, bottom sheet on a
 * phone). OWNED BY THE COACH BUILDER: this is the agreed contract with a minimal working
 * implementation (two bars, the rationale verbatim, the basis, the honesty line).
 *
 * Contract:
 *   coaching     the answer being explained (null renders nothing)
 *   open         whether the sheet is open
 *   onClose()    Done, Escape, a tap on the scrim, or a drag down
 *   bottomInset  optional: px from the viewport bottom where a bottom sheet ends (above
 *                the dock, so you can read and act); default 8
 */
import type { Coaching } from '../../api'
import { pct } from '../../lib/format'
import { normalizeTone } from '../../lib/ring'
import { Disclosure } from '../../ui/Disclosure'
import { Ring } from '../../ui/Ring'
import { Sheet } from '../../ui/Sheet'

export interface MathsSheetProps {
  coaching: Coaching | null
  open: boolean
  onClose(): void
  bottomInset?: number
}

export function MathsSheet({ coaching, open, onClose, bottomInset }: MathsSheetProps) {
  if (!coaching) return null
  const c = coaching
  const tone = normalizeTone(c.tone)
  const priced = c.to_call > 0 && c.required_equity_pct != null
  const eq = c.action_closed ? c.equity_pct : c.realized_equity_pct
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.verdict}
      label="The maths"
      tone={tone}
      bottomInset={bottomInset}
      leading={priced ? <Ring realizedPct={eq} needPct={c.required_equity_pct} rawPct={c.equity_pct} tone={tone} size={40} /> : undefined}
    >
      <div className="grid gap-4">
        <Bar label={c.action_closed ? 'Equity' : 'Realized'} value={eq} fill="bg-ink" />
        {priced && <Bar label="Need" value={c.required_equity_pct ?? 0} fill="bg-fog" digits={1} />}
      </div>
      <p className="mt-[22px] text-body leading-[1.45]">{c.rationale}</p>
      <Disclosure summary="How this is worked out" className="mt-[18px]">
        <ul className="mb-1.5 mt-1 grid gap-1.5 text-foot text-fog">
          {c.basis.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </Disclosure>
      <p className="mt-3.5 text-foot text-fog">Computed, not solved.</p>
    </Sheet>
  )
}

function Bar({ label, value, fill, digits = 0 }: { label: string; value: number; fill: string; digits?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-callout font-medium text-fog">{label}</span>
        <span className="text-[24px] font-strong tracking-[-0.02em] tabular-nums">{pct(value, digits)}</span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-[5px] bg-white/10">
        <i className={`absolute inset-y-0 left-0 rounded-[5px] ${fill}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  )
}
