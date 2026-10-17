/**
 * CFR on Kuhn: train a real solver on a game small enough that its answer is known, and
 * check it. The intro, then (after a run) the three figures with their pass states, the
 * two convergence charts on fixed scales, and the learned strategy against the textbook
 * equilibrium, grouped by the player who acts. Iterations and Train sit in the dock, as
 * Hands and Run do in the Bot lab.
 *
 *   <CfrLab />
 *
 * States: not trained yet, training (the last result stays, marked), a result, an error
 * (scoped notice; the last result stays).
 */
import { useState } from 'react'
import { api, type CfrResult } from '../../api'
import { describeError } from '../../lib/apiError'
import { ITER_DEFAULT, ITER_MAX, ITER_MIN, cfrFigures, cfrSummary, clampIterations, trainEstimate, type CfrFigure } from '../../lib/labCfr'
import { count } from '../../lib/stats'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { CfrChart } from './CfrChart'
import { CfrStrategy } from './CfrStrategy'
import { DockField, LabDock } from './LabParts'
import { useLabRun } from './useLabRun'

const train = (iterations: number): Promise<CfrResult> => api.cfr(iterations)

export function CfrLab() {
  const [iterations, setIterations] = useState(ITER_DEFAULT)
  const run = useLabRun(train)
  const busy = run.running !== null
  const result = run.result
  const stale = result !== null && run.resultFor !== iterations

  let headline = 'Not trained yet.'
  if (busy) headline = `Training ${count(run.running ?? iterations)} iterations.`
  else if (result) headline = `Trained ${count(result.iterations)} iterations.`

  return (
    <>
      <div className="mt-5 grid max-w-[62ch] gap-4 text-body text-fog max-sm:text-callout">
        <p className="m-0">
          Counterfactual regret minimization (CFR) teaches itself an equilibrium strategy by playing against itself and, after every hand,
          regretting the choices that would have done better. Here it plays Kuhn poker: three cards, J, Q and K, one card each and one bet
          allowed. The game is small enough that its equilibrium is known in closed form, so this is not a made-up solver output: it is a real
          solver, checked against the exact answer.
        </p>
        <p className="m-0">
          Acting first is a disadvantage: the game is worth −1/18, about −0.056, to the first player. Exploitability is how much a perfect
          counter-strategy would win against the learned one. It should fall toward 0 as training runs.
        </p>
      </div>

      {run.error ? (
        <div className="material-sheet squircle mt-12 rounded-[20px] py-3.5 pr-3.5 pl-[18px]">
          <ErrorNotice
            error={run.error}
            context="cfr"
            headline={run.error.code === 'network' ? 'Training didn’t reach the server.' : undefined}
            onRetry={describeError(run.error, 'cfr').retryable ? () => run.run(iterations) : undefined}
            onDismiss={run.dismissError}
            layout="row"
            className="max-sm:flex-col max-sm:items-start"
          />
        </div>
      ) : null}

      <section aria-labelledby="cfr-status" className="mt-20 max-sm:mt-14" aria-busy={busy}>
        <h2 id="cfr-status" className="lab-verdict m-0 text-verdict font-strong max-sm:text-[26px]" data-tone={busy ? 'busy' : result ? 'done' : 'idle'}>
          {headline}
        </h2>
        <p className="m-0 mt-2.5 text-callout text-fog">
          {busy
            ? `This takes ${trainEstimate(run.running ?? iterations)}.${result ? ' Below is the last run, until this one lands.' : ''}`
            : result
              ? stale
                ? `The iterations have changed since this run. Train again to measure ${count(iterations)}.`
                : 'Seed 0, so the same count always trains the same strategy.'
              : `${count(iterations)} iterations take ${trainEstimate(iterations)}.`}
        </p>
        <p className="sr-only" aria-live="polite">
          {result && !busy ? cfrSummary(result) : ''}
        </p>
      </section>

      {result ? (
        <div className={busy ? 'lab-waiting' : undefined}>
          <Figures figures={cfrFigures(result)} />
          <div className="mt-24 grid grid-cols-2 gap-14 max-sm:mt-16 max-sm:grid-cols-1 max-sm:gap-12">
            <CfrChart kind="exploit" trend={result.trend} />
            <CfrChart kind="value" trend={result.trend} exact={result.equilibrium_value} />
          </div>
          <CfrStrategy strategy={result.strategy} />
        </div>
      ) : null}

      <LabDock busy={busy} label="Training">
        <DockField
          className="lab-field--iters"
          label="Iterations"
          value={iterations}
          format={count}
          hint={`${count(ITER_MIN)} to ${count(ITER_MAX)} iterations`}
          onCommit={(n) => setIterations(n === null ? iterations : clampIterations(n))}
        />
        <Capsule variant="primary" size="lg" className="lab-dock__go" onClick={() => run.run(iterations)} disabled={busy}>
          {busy ? 'Training…' : 'Train'}
        </Capsule>
      </LabDock>
    </>
  )
}

const TONE: Record<string, string> = { true: 'is-pass', false: 'is-fail', null: '' }

function Figures({ figures }: { figures: CfrFigure[] }) {
  const [lead, ...rest] = figures
  return (
    <section aria-label="Results" className="lab-figures mt-12 flex flex-wrap items-end gap-x-20 gap-y-8 max-sm:mt-10 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-6">
      <div className="lab-figure max-sm:col-span-2">
        <div className={`lab-figure__value text-facts font-strong tabular-nums max-sm:text-[48px] ${TONE[String(lead.pass)]}`}>{lead.value}</div>
        <div className="mt-2 text-body font-semibold">{lead.label}</div>
        <div className="text-callout text-fog">{lead.note}</div>
      </div>
      {rest.map((f) => (
        <div key={f.key} className="lab-figure">
          <div className={`lab-figure__value text-title font-strong tabular-nums ${TONE[String(f.pass)]}`}>{f.value}</div>
          <div className="mt-1.5 text-callout font-semibold">{f.label}</div>
          <div className="text-foot text-fog">{f.note}</div>
        </div>
      ))}
    </section>
  )
}
