/**
 * Facts: the two numbers beside the ring. Seconds per decision is the big one; bb/100 is
 * deliberately subordinate (smaller, secondary colour) with its variance caveat behind an
 * info button, which also works on tap. Neither explains itself in a caption: "Median of
 * 290 decisions" is a tooltip on hover, focus or tap.
 *
 * Nothing measured yet reads as words ("No decisions timed yet"), never as a big dash.
 */
import type { DecisionFact, ResultFact } from '../../lib/stats'
import { InfoButton } from '../../ui/InfoButton'
import { Tooltip } from '../../ui/Tooltip'

export interface FactsProps {
  decision: DecisionFact | null
  result: ResultFact | null
}

export function Facts({ decision, result }: FactsProps) {
  return (
    <div className="grid content-center gap-10 max-sm:flex max-sm:w-full max-sm:flex-wrap max-sm:items-baseline max-sm:justify-center max-sm:gap-x-8 max-sm:gap-y-4">
      {decision ? (
        <Tooltip content={decision.note} className="flex w-max items-baseline gap-2">
          <span className="text-facts font-strong tabular-nums max-sm:text-[40px]">{decision.value}</span>
          <span className="text-headline font-semibold text-fog max-sm:text-callout">s per decision</span>
        </Tooltip>
      ) : (
        <p className="m-0 text-headline font-semibold text-fog max-sm:text-callout">No decisions timed yet</p>
      )}
      {result ? (
        <div className="flex w-max items-baseline gap-2">
          <span className="text-title font-strong text-fog tabular-nums max-sm:text-[22px]">{result.value}</span>
          <span className="text-callout font-semibold text-dust">bb/100</span>
          <InfoButton label="About bb/100" placement="bottom" className="ml-0.5 self-center">
            {result.note}
          </InfoButton>
        </div>
      ) : null}
      {result?.mixed ? <p className="m-0 -mt-8 text-foot text-dust max-sm:-mt-2 max-sm:basis-full max-sm:text-center">{result.mixed}</p> : null}
    </div>
  )
}
