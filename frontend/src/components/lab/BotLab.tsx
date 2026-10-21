/**
 * Bot lab: you never set a bot's VPIP; you set a strategy and measure what comes out.
 * Lineup, then where each archetype landed (the gate verdict with its caveat, one row per
 * archetype against its bands), then the knobs, then how to read it (a disclosure). The
 * run controls sit in the dock, in reach from anywhere on the page.
 *
 *   <BotLab />
 *
 * States: loading the metadata (the frame, no figures), its error (scoped notice with Try
 * again), idle (the targets on the rails, "Not run yet."), simulating (a background job:
 * hands done so far, elapsed time, the estimate, and Cancel in the dock; the table keeps
 * playing), cancelled (how far it got; the last result stays), a result (pass or fail), a
 * result whose setup has since changed, a run error (notice; the last result stays), and a
 * run the server lost when it restarted (notice with Run again).
 *
 * Bots: the current archetypes or the new engine (beta). The new engine has no knobs yet
 * (its dials arrive with the policy explorer), and its rows read against the current bots'
 * bands, which the results say.
 */
import { useRef, useState } from 'react'
import type { EngineChoice, LabArchetypesInfo, LabJobBody } from '../../api'
import {
  HANDS_MIN,
  clampHands,
  clampSeed,
  configKey,
  estimateText,
  msPerHand,
  previewRows,
  progressText,
  resultRows,
  seatedOverrides,
  type Overrides,
  type RunConfig,
} from '../../lib/lab'
import { describeError } from '../../lib/apiError'
import { prefersReducedMotion } from '../../lib/motion'
import { count } from '../../lib/stats'
import { Capsule } from '../../ui/Capsule'
import { Disclosure } from '../../ui/Disclosure'
import { Segmented, type SegmentedOption } from '../../ui/Segmented'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { Tooltip } from '../../ui/Tooltip'
import { BotResults } from './BotResults'
import { KnobPanel } from './KnobPanel'
import { Lineup } from './Lineup'
import { DockField, Elapsed, LabDock } from './LabParts'
import { useLabInfo } from './useLabInfo'
import { useLabJob } from './useLabJob'

const simulate = (c: RunConfig): LabJobBody => ({
  kind: 'simulate',
  lineup: [...c.lineup],
  hands: c.hands,
  seed: c.seed,
  overrides: c.engine === 'v2' ? {} : (c.overrides as Record<string, Record<string, number>>),
  engine: c.engine ?? 'v1',
})

const ENGINE_OPTIONS: readonly SegmentedOption<EngineChoice>[] = [
  { value: 'v1', label: 'Current bots' },
  { value: 'v2', label: 'New engine (beta)' },
]
const V2_BANDS = 'Bands are the current bots’ targets. The new engine is calibrated in a later phase.'

const INTRO = (
  <p className="m-0 mt-5 max-w-[62ch] text-body text-fog max-sm:text-callout">
    You never set a bot’s VPIP: you set a strategy and measure what comes out. Pick a lineup, nudge a knob, run the simulation, and watch each stat
    land in or out of its target band.
  </p>
)

export function BotLab() {
  const { info, error, retrying, retry } = useLabInfo()
  if (info) return <BotLabReady info={info} />
  return (
    <div aria-busy={!error}>
      {INTRO}
      {error ? (
        <div className="material-sheet squircle mt-12 max-w-[640px] rounded-[20px] py-3.5 pr-3.5 pl-[18px]">
          <ErrorNotice error={error} context="lab" headline="The lab couldn’t load." onRetry={retry} busy={retrying} layout="row" className="max-sm:flex-col max-sm:items-start" />
        </div>
      ) : (
        <>
          {/* the lineup's frame, without names, so nothing jumps when it lands */}
          <div className="mt-16 max-sm:mt-12" aria-hidden="true">
            <div className="text-headline font-strong">Lineup</div>
            <div className="lab-lineup mt-4">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="lab-seat" />
              ))}
            </div>
          </div>
          <p className="sr-only" role="status">
            Loading the lab
          </p>
        </>
      )}
    </div>
  )
}

function BotLabReady({ info }: { info: LabArchetypesInfo }) {
  const [lineup, setLineup] = useState<string[]>(() => [...info.default_lineup])
  const [hands, setHands] = useState(() => clampHands(info.default_hands, info.max_hands))
  const [seed, setSeed] = useState(0)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [picked, setPicked] = useState<string | null>(null)
  const [engine, setEngine] = useState<EngineChoice>('v1')
  const run = useLabJob(simulate)
  const results = useRef<HTMLElement>(null)

  const config: RunConfig = { lineup, hands, seed, overrides: engine === 'v2' ? {} : seatedOverrides(overrides, lineup), engine }
  const busy = run.running !== null
  const result = run.result
  const stale = result !== null && run.resultFor !== null && configKey(run.resultFor) !== configKey(config)
  const rows = result ? resultRows(result, info) : previewRows(lineup, info)
  const estimate = estimateText(hands, msPerHand(result))

  const start = () => {
    run.run(config)
    // Bring the results into view (from the lineup below them, or from the knobs above),
    // where the wait and then the answer show.
    const el = results.current
    const top = el?.getBoundingClientRect().top ?? 0
    if (el && (top < 0 || top > window.innerHeight * 0.6)) {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    }
  }

  return (
    <>
      {INTRO}
      <div className="mt-10 max-sm:mt-8">
        <span id="lab-engine" className="mb-2 ml-0.5 block text-foot font-semibold text-fog">
          Bots
        </span>
        <Segmented labelledBy="lab-engine" size="md" options={ENGINE_OPTIONS} value={engine} onChange={setEngine} />
      </div>
      <Lineup info={info} lineup={lineup} onChange={setLineup} />

      {run.error ? (
        <div className="material-sheet squircle mt-12 max-w-[640px] rounded-[20px] py-3.5 pr-3.5 pl-[18px]">
          <ErrorNotice
            error={run.error}
            context="lab"
            headline={
              run.error.code === 'network'
                ? 'The simulation didn’t reach the server.'
                : run.error.code === 'lab_lost' || run.error.code === 'lab_failed'
                  ? undefined
                  : 'The simulation didn’t run.'
            }
            onRetry={describeError(run.error, 'lab').retryable ? start : undefined}
            retryLabel={run.error.code === 'lab_lost' || run.error.code === 'lab_failed' ? 'Run again' : undefined}
            onDismiss={run.dismissError}
            layout="row"
            className="max-sm:flex-col max-sm:items-start"
          />
        </div>
      ) : null}

      <BotResults
        ref={results}
        info={info}
        rows={rows}
        result={result}
        stale={stale}
        running={run.running}
        startedAt={run.startedAt}
        progress={run.progress}
        cancelled={run.cancelled}
        estimate={estimate}
        note={engine === 'v2' || result?.engine === 'v2' ? V2_BANDS : null}
      />

      {engine === 'v2' ? (
        <section aria-labelledby="lab-tune" className="mt-24 max-sm:mt-16">
          <h2 id="lab-tune" className="m-0 text-title font-strong">
            Tune
          </h2>
          <p className="m-0 mt-4 text-callout text-fog">The new engine’s dials arrive with the policy explorer.</p>
        </section>
      ) : (
        <KnobPanel info={info} lineup={lineup} overrides={overrides} onOverrides={setOverrides} picked={picked} onPick={setPicked} />
      )}

      <Footnote />

      <LabDock busy={busy} label="Simulation">
        <DockField
          className="lab-field--hands"
          label="Hands"
          value={hands}
          format={count}
          hint={`${count(HANDS_MIN)} to ${count(info.max_hands)} hands`}
          onCommit={(n) => setHands(n === null ? hands : clampHands(n, info.max_hands))}
        />
        <DockField
          className="lab-field--seed"
          label="Seed"
          value={seed}
          format={String}
          hint="Any whole number. The same seed deals the same cards, so a run repeats exactly."
          onCommit={(n) => setSeed(n === null ? seed : clampSeed(n))}
          renderLabel={(l) => (
            <Tooltip content="The same seed deals the same cards, so a run repeats exactly." focusable={false}>
              {l}
            </Tooltip>
          )}
        />
        <span className="lab-dock__note text-foot text-fog tabular-nums" aria-hidden="true">
          {busy && run.progress ? (
            progressText(run.progress.done, run.progress.total)
          ) : busy && run.startedAt !== null ? (
            <Elapsed since={run.startedAt} />
          ) : (
            estimate
          )}
        </span>
        {busy ? (
          // The run goes on in the background: the one thing to do with it now is stop it.
          // The same button as Run, so focus stays on it; it answers once the server has
          // the job (canCancel), so the second click of a double-click on Run is a no-op.
          <Capsule
            variant="secondary"
            size="lg"
            className="lab-dock__go"
            onClick={run.cancel}
            disabled={!run.canCancel}
            aria-label={run.cancelling ? undefined : 'Cancel the simulation'}
          >
            {run.cancelling ? 'Cancelling…' : 'Cancel'}
          </Capsule>
        ) : (
          <Capsule variant="primary" size="lg" className="lab-dock__go" onClick={start}>
            <span>
              Run<span className="max-sm:sr-only"> simulation</span>
            </span>
          </Capsule>
        )}
      </LabDock>
    </>
  )
}

/** How to read the rails and the knobs, and why the verdict is indicative: one disclosure,
 *  so the page leads with the figures (as Stats keeps its bb/100 caveat behind an i). */
function Footnote() {
  return (
    <Disclosure summary="How to read this" className="mt-20 max-w-[68ch] max-sm:mt-14" panelClassName="grid gap-4 pt-1 pb-3 text-callout text-fog">
      <p className="m-0">
        A dot inside its band is in range; outside it, the figure beside the value says by how much. The gate is VPIP, PFR, AF and WTSD in band
        for every archetype seated. 3-bet is shown against its band but not gated. The Maniac has no WTSD target, so that reading is not judged
        here, although the server’s gate counts it as a pass.
      </p>
      <p className="m-0">
        The knobs are shares: of hands for the 3-bet value, flat-call and defend ranges, of the time for the frequencies, of the pot for the bet
        size.
      </p>
      <p className="m-0">
        The result here is indicative, not the gate. WTSD is counted per flop seen, so even at 25,000 hands a Nit sees only about 1,850 flops:
        enough noise to flip the result on its own. The real gate is 100,000 hands, run offline with backend/scripts/simulate.py, and even there
        the Nit’s WTSD sits about 1.2 standard deviations from its bound.
      </p>
    </Disclosure>
  )
}
