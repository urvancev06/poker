/**
 * The Lab's small shared parts.
 *
 * LabRail   a fixed-scale rail in the My stats language: a bare hairline track, the target
 *           band on it, the value as a dot. The dot slides to a new reading on the spring
 *           (a `translate` transition: reduced motion makes it instant) and fades in the
 *           first time. Its state is never colour alone: the row says "In range", the
 *           distance, or "No target" in words.
 *             in        filled green
 *             out       filled orange
 *             unbanded  hollow (no target to hold it against: not judged)
 *             plain     filled ink (a reading with nothing to judge, the CFR strategy)
 * LabDock   the one glass element on the page: the run controls, fixed above the limb so
 *           Run is in reach from anywhere on a long page.
 * DockField a labelled whole-number field in the dock: typing is free, the value commits
 *           (parsed and clamped by the caller) on Enter or blur, and shows with separators.
 * Elapsed   the seconds a run has taken so far, ticking twice a second. Its own component
 *           so the tick re-renders only this text.
 * LabProgress  a background run's hands done so far: a bare hairline track with an ink
 *           fill (the rail's language), growing as polls land; reduced motion makes it
 *           jump. Exposed as a progressbar with the hands in words.
 */
import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { elapsedText, parseWhole } from '../../lib/lab'

export interface RailBand {
  lo: number
  hi: number
  /** Runs off the scale's end ("4+"): no rounded end. */
  open?: boolean
}

export interface LabRailProps {
  /** The dot's place, 0-1, or null for no dot. */
  p: number | null
  band: RailBand | null
  state: 'in' | 'out' | 'unbanded' | 'none' | 'plain'
  /** The band's numbers, shown when the row is pointed at, focused or open. */
  label?: string
  className?: string
}

export function LabRail({ p, band, state, label, className = '' }: LabRailProps) {
  const point = band !== null && band.hi - band.lo < 0.004
  const bandStyle = band ? ({ '--lo': band.lo, '--hi': band.hi } as CSSProperties) : undefined
  return (
    <span className={`lab-rail ${className}`} data-state={state} aria-hidden="true">
      <span className="lab-rail__line" />
      {band ? <span className={`lab-rail__band ${point ? 'is-point' : ''} ${band.open ? 'is-open' : ''}`} style={bandStyle} /> : null}
      {p !== null ? <span className="lab-rail__dot" style={{ '--p': p } as CSSProperties} /> : null}
      {band && label ? (
        <span className="lab-rail__lbl text-caption font-semibold text-fog tabular-nums" style={bandStyle}>
          {label}
        </span>
      ) : null}
    </span>
  )
}

export function LabDock({ busy, label, children }: { busy: boolean; label: string; children: ReactNode }) {
  return (
    <div className="lab-dock-wrap">
      <div role="group" aria-label={label} aria-busy={busy} className="lab-dock material-glass">
        {children}
      </div>
    </div>
  )
}

export interface DockFieldProps {
  /** The visible label ("Hands"), also the field's accessible name. */
  label: string
  value: number
  /** Parse result of what was typed (null when it is not a whole number). The caller clamps. */
  onCommit: (n: number | null) => void
  format: (n: number) => string
  /** The allowed range in words, for screen readers ("100 to 25,000"). */
  hint: string
  disabled?: boolean
  className?: string
  /** Wraps the label, e.g. in a Tooltip. */
  renderLabel?: (label: ReactNode) => ReactNode
}

export function DockField({ label, value, onCommit, format, hint, disabled, className = '', renderLabel }: DockFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const id = useId()
  const commit = () => {
    if (draft !== null) onCommit(parseWhole(draft))
    setDraft(null)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape' && draft !== null) {
      e.preventDefault()
      setDraft(null)
    }
  }
  const text = <span className="lab-field__label text-foot font-medium text-fog">{label}</span>
  return (
    <label className={`lab-field ${className}`} htmlFor={id}>
      {renderLabel ? renderLabel(text) : text}
      <input
        id={id}
        className="lab-field__input text-headline font-strong tabular-nums"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        value={draft ?? format(value)}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={onKey}
      />
      <span id={`${id}-hint`} className="sr-only">
        {hint}
      </span>
    </label>
  )
}

export function LabProgress({ share, label }: { share: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, share)) * 100)
  return (
    <span className="lab-progress mb-1.5" role="progressbar" aria-label="Simulation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={label}>
      <span className="lab-progress__fill" style={{ '--p': share } as CSSProperties} />
    </span>
  )
}

export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  return <>{elapsedText(now - since)}</>
}
