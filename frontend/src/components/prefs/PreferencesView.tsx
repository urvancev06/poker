/**
 * Preferences: the coach mode, what you can see about the opponents, and the deck. All
 * three persist on this device (localStorage, via the prefs provider) and apply at once.
 *
 *   <PreferencesView coachMode={table.coachMode} onCoachMode={table.setCoachMode} />
 *
 * Props (optional): coachMode + onCoachMode, the table session's own setter, so a change
 * here also cancels or reveals the coach for the decision on the table (the same path the
 * "..." menu uses). Without them it reads and writes the stored preference directly.
 *
 * States: each selection; and storage refused (private window, blocked site data), where
 * the choices still apply for this visit and the page says so instead of "Saved on this
 * device".
 */
import { useId, useState } from 'react'
import type { CoachMode, VisibilityMode } from '../../lib/prefsSchema'
import { usePrefs } from '../../lib/prefsContext'
import { canPersist, localStore } from '../../lib/prefsStorage'
import { BP, useViewportSize } from '../../lib/breakpoints'
import { useSpaceAvoid } from '../../lib/spaceAvoid'
import { PageHeader } from '../../ui/PageHeader'
import { ChoiceList, type Choice } from './ChoiceList'
import { DeckPicker } from './DeckPicker'
import { SeatSample } from './SeatSample'
import './PreferencesView.css'

export interface PreferencesViewProps {
  coachMode?: CoachMode
  onCoachMode?: (mode: CoachMode) => void
}

const COACH: readonly Choice<CoachMode>[] = [
  { value: 'on', label: 'On', description: 'The coach shows its read on every one of your turns.' },
  { value: 'think', label: 'Think first', description: 'The coach works it out while you think. Decide, then show it to check yourself.' },
  { value: 'off', label: 'Off', description: 'Nothing until you ask the coach.' },
]

const OPPONENTS: readonly Choice<VisibilityMode>[] = [
  { value: 'labeled', label: 'Labeled', description: 'Each seat shows its archetype name. Easiest.', aside: <SeatSample mode="labeled" /> },
  {
    value: 'hud',
    label: 'HUD',
    description: 'Shows the VPIP, PFR and AF you have observed, once the sample is big enough. Read the player, not the label.',
    aside: <SeatSample mode="hud" />,
  },
  { value: 'live', label: 'Live', description: 'Nothing but the action. Closest to a real table.', aside: <SeatSample mode="live" /> },
]

function SpaceColumn() {
  const { w, h } = useViewportSize()
  const phone = w < BP.sm
  const col = Math.min(w, 1120) - (phone ? 0 : 56)
  const rect = w > 0 ? (phone ? { x: 0, y: 120, w, h: h - 120 } : { x: (w - col) / 2, y: 0, w: col, h }) : null
  useSpaceAvoid('prefs', [rect])
  return null
}

export function PreferencesView({ coachMode, onCoachMode }: PreferencesViewProps) {
  const prefs = usePrefs()
  const mode = coachMode ?? prefs.coachMode
  const setMode = onCoachMode ?? prefs.setCoachMode
  // Read once per visit: whether the browser will keep these.
  const [persists] = useState(() => canPersist(localStore()))
  const uid = useId()

  return (
    <div className="prefs mx-auto max-w-[1120px] px-10 pt-[100px] pb-[60px] max-sm:px-4 max-sm:pt-[76px] max-sm:pb-0">
      <SpaceColumn />
      <PageHeader title="Preferences" />
      <p className="m-0 mt-4 text-body text-fog">
        {persists ? 'Saved on this device.' : 'This browser is not keeping site data, so these last for this visit only.'}
      </p>

      <div className="prefs-body">
        <div className="prefs-col">
          <section aria-labelledby={`${uid}-coach`}>
            <h2 id={`${uid}-coach`} className="m-0 text-headline font-strong">
              Coach
            </h2>
            <ChoiceList className="mt-4" labelledBy={`${uid}-coach`} options={COACH} value={mode} onChange={setMode} />
          </section>

          <section aria-labelledby={`${uid}-opp`}>
            <h2 id={`${uid}-opp`} className="m-0 text-headline font-strong">
              Opponents
            </h2>
            <p id={`${uid}-opp-note`} className="m-0 mt-2 max-w-[60ch] text-callout text-fog">
              Display only: it never changes how the bots play or what the coach computes. Work down the list as you stop needing the
              training wheels.
            </p>
            <ChoiceList className="mt-4" labelledBy={`${uid}-opp`} describedBy={`${uid}-opp-note`} options={OPPONENTS} value={prefs.visibility} onChange={prefs.setVisibility} />
          </section>
        </div>

        <section aria-labelledby={`${uid}-deck`} className="prefs-deck">
          <h2 id={`${uid}-deck`} className="m-0 text-headline font-strong">
            Cards
          </h2>
          <DeckPicker labelledBy={`${uid}-deck`} value={prefs.deckId} onChange={prefs.setDeckId} />
        </section>
      </div>
    </div>
  )
}
