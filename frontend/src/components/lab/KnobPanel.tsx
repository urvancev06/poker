/**
 * KnobPanel: which archetype to tune, and its 13 strategy knobs. Stats are outputs, never
 * inputs: the knobs are frequencies and sizes, and the run measures what they produce.
 *
 * - The picker lists only seated archetypes. The choice is derived from the lineup on
 *   every render, so it never points at an archetype that left (B34).
 * - Changes apply to every seat of that archetype, and the line under the picker says how
 *   many seats that is. They stay when an archetype leaves the lineup (kept for when it
 *   comes back) and are not sent while it is not seated.
 * - A changed knob reads "from 68%" (which resets it), its fill turns blue, and the thumb
 *   leaves the notch that marks the default. "Reset TAG" resets the archetype.
 */
import type { LabArchetypesInfo } from '../../api'
import {
  archetypeName,
  changedCount,
  isChanged,
  knobValue,
  seatedKeys,
  seatsOf,
  shortName,
  snapKnob,
  tuneTarget,
  unseatedChanged,
  withKnob,
  withoutArch,
  KNOB_HELP,
  type Overrides,
} from '../../lib/lab'
import { Capsule } from '../../ui/Capsule'
import { Segmented } from '../../ui/Segmented'
import { Knob } from './Knob'

export interface KnobPanelProps {
  info: LabArchetypesInfo
  lineup: readonly string[]
  overrides: Overrides
  onOverrides: (next: Overrides | ((prev: Overrides) => Overrides)) => void
  picked: string | null
  onPick: (key: string) => void
}

function scopeText(name: string, seats: number): string {
  if (seats <= 1) return `Changes apply to its one seat.`
  if (seats === 2) return `Changes apply to both ${name} seats.`
  return `Changes apply to all ${seats} ${name} seats.`
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function KnobPanel({ info, lineup, overrides, onOverrides, picked, onPick }: KnobPanelProps) {
  const tune = tuneTarget(picked, lineup, info)
  if (!tune) return null
  const arch = info.archetypes.find((a) => a.key === tune)
  const defaults = arch?.knobs ?? {}
  const name = archetypeName(info, tune)
  const changed = changedCount(overrides, tune, defaults)
  const seats = seatsOf(lineup, tune).length
  const kept = unseatedChanged(overrides, lineup).map((k) => archetypeName(info, k))

  const options = seatedKeys(lineup, info).map((k) => ({
    value: k,
    label: (
      <span className="inline-flex items-center gap-1.5">
        {shortName(archetypeName(info, k))}
        {changedCount(overrides, k, info.archetypes.find((a) => a.key === k)?.knobs) > 0 ? (
          <>
            <span className="lab-changed-dot" aria-hidden="true" />
            <span className="sr-only">, changed</span>
          </>
        ) : null}
      </span>
    ),
  }))

  return (
    <section aria-labelledby="lab-tune" className="mt-24 max-sm:mt-16">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 max-sm:flex-col max-sm:items-stretch">
        <h2 id="lab-tune" className="m-0 text-title font-strong">
          Tune
        </h2>
        <Segmented className="lab-tune-pick" label="Archetype to tune" value={tune} onChange={onPick} options={options} />
      </div>
      <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="m-0 text-callout text-fog" aria-live="polite">
          <span className="text-ink">{name}</span> {changed ? `has ${changed} ${changed === 1 ? 'knob' : 'knobs'} changed.` : 'plays its defaults.'}{' '}
          {scopeText(shortName(name), seats)}
        </p>
        {changed ? (
          <Capsule variant="quiet" size="md" onClick={() => onOverrides((o) => withoutArch(o, tune))}>
            Reset {shortName(name)}
          </Capsule>
        ) : null}
      </div>
      <ul className="lab-knobs m-0 mt-6 list-none p-0">
        {info.knob_meta.map((meta) => {
          const def = defaults[meta.key] ?? meta.min
          return (
            <Knob
              key={meta.key}
              meta={meta}
              value={knobValue(overrides, tune, meta.key, def)}
              def={def}
              changed={isChanged(overrides, tune, meta.key, def)}
              help={KNOB_HELP[meta.key] ?? ''}
              onChange={(v) => onOverrides((o) => withKnob(o, tune, meta.key, snapKnob(v, meta, def), def))}
              onReset={() => onOverrides((o) => withKnob(o, tune, meta.key, def, def))}
            />
          )
        })}
      </ul>
      {kept.length ? (
        <p className="m-0 mt-6 text-foot text-dust">
          {listNames(kept)} {kept.length === 1 ? 'has' : 'have'} changes kept for when {kept.length === 1 ? 'it is' : 'they are'} seated again. They are not
          used while {kept.length === 1 ? 'it sits' : 'they sit'} out.
        </p>
      ) : null}
    </section>
  )
}
