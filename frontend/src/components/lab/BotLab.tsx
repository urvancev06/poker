/**
 * Bot lab: you never set a bot's VPIP; you set a strategy and measure what comes out.
 * Lineup, then where each archetype landed (the gate verdict with its caveat, one row per
 * archetype against its bands), then the knobs, then how to read it. The run controls sit
 * in the dock, in reach from anywhere on the page.
 *
 *   <BotLab />
 *
 * States: loading the metadata (the frame, no figures), its error (scoped notice with Try
 * again), idle (the targets on the rails, "Not run yet."), simulating (15-75 s: elapsed
 * time, the estimate, and that the table waits), a result (pass or fail), a result whose
 * setup has since changed, a run error (notice; the last result stays).
 */
import { useRef, useState } from 'react'
import { api, type LabArchetypesInfo, type LabResult } from '../../api'
import {
  HANDS_MIN,
  clampHands,
  clampSeed,
  configKey,
  estimateText,
  msPerHand,
  previewRows,
  resultRows,
  seatedOverrides,
  type Overrides,
  type RunConfig,
} from '../../lib/lab'
import { describeError } from '../../lib/apiError'
import { prefersReducedMotion } from '../../lib/motion'
import { count } from '../../lib/stats'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { Tooltip } from '../../ui/Tooltip'
import { BotResults } from './BotResults'
import { KnobPanel } from './KnobPanel'
import { Lineup } from './Lineup'
import { DockField, Elapsed, LabDock } from './LabParts'
import { useLabInfo } from './useLabInfo'
import { useLabRun } from './useLabRun'

const simulate = (c: RunConfig): Promise<LabResult> =>
  api.labSimulate({ lineup: [...c.lineup], hands: c.hands, seed: c.seed, overrides: c.overrides as Record<string, Record<string, number>> })

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
  const run = useLabRun(simulate)
  const results = useRef<HTMLElement>(null)

  const config: RunConfig = { lineup, hands, seed, overrides: seatedOverrides(overrides, lineup) }
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
      <Lineup info={info} lineup={lineup} onChange={setLineup} />

      {run.error ? (
        <div className="material-sheet squircle mt-12 max-w-[640px] rounded-[20px] py-3.5 pr-3.5 pl-[18px]">
          <ErrorNotice
            error={run.error}
            context="lab"
            headline={run.error.code === 'network' ? 'The simulation didn’t reach the server.' : 'The simulation didn’t run.'}
            onRetry={describeError(run.error, 'lab').retryable ? start : undefined}
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
        estimate={estimate}
      />

      <KnobPanel info={info} lineup={lineup} overrides={overrides} onOverrides={setOverrides} picked={picked} onPick={setPicked} />

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
          {busy && run.startedAt !== null ? <Elapsed since={run.startedAt} /> : estimate}
        </span>
        <Capsule variant="primary" size="lg" className="lab-dock__go" onClick={start} disabled={busy}>
          {busy ? (
            'Simulating…'
          ) : (
            <span>
              Run<span className="max-sm:sr-only"> simulation</span>
            </span>
          )}
        </Capsule>
      </LabDock>
    </>
  )
}

function Footnote() {
  return (
    <div className="mt-24 grid max-w-[68ch] gap-4 text-callout text-fog max-sm:mt-16">
      <p className="m-0">
        A dot inside its band is in range; outside it, the figure beside the value says by how much. The gate is VPIP, PFR, AF and WTSD in band
        for every archetype seated. 3-bet is shown against its band but not gated. The Maniac has no WTSD target, so that reading is not judged
        here, although the server’s gate counts it as a pass.
      </p>
      <p className="m-0">
        The result here is indicative, not the gate. WTSD is counted per flop seen, so even at 25,000 hands a Nit sees only about 1,850 flops:
        enough noise to flip the result on its own. The real gate is 100,000 hands, run offline with backend/scripts/simulate.py, and even there
        the Nit’s WTSD sits about 1.2 standard deviations from its bound.
      </p>
    </div>
  )
}
