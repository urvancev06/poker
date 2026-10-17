/**
 * StatGroups: the nine, grouped by the sample gate that makes them readable ("Readable at
 * 500 hands", "266 to go" / "Ready"). Below its gate a group has no state column: nothing
 * in it is judged yet. Fold to steal follows quietly: the API returns it without a target
 * band, so it is shown but never judged.
 *
 * `overall` null (loading): names and bands only, no figures.
 */
import { useId } from 'react'
import type { HeroStatLine, MyStats } from '../../api'
import { bandFor, count, foldToSteal, groupStats, groupStatus } from '../../lib/stats'
import { StatRow } from './StatRow'

export interface StatGroupsProps {
  overall: HeroStatLine | null
  targets: MyStats['targets']
}

export function StatGroups({ overall, targets }: StatGroupsProps) {
  const uid = useId()
  const windowHands = overall?.hands ?? 0
  const groups = groupStats(windowHands)
  const fts = overall ? foldToSteal(overall) : null
  // Once any group carries a state column, every group keeps one, so the rails line up.
  const withState = overall !== null && groups.some((g) => g.ready)
  return (
    <div className={`stat-groups mt-[104px] grid gap-16 max-sm:mt-16 max-sm:gap-12 ${withState ? 'has-state' : ''}`}>
      {groups.map((g) => {
        const ready = overall !== null && g.ready
        const headId = `${uid}-gate-${g.gate}`
        return (
          <section key={g.gate} aria-labelledby={headId} className={`stat-group ${ready ? 'is-ready' : 'is-waiting'}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 id={headId} className="m-0 text-headline font-strong max-sm:text-body">
                Readable at {count(g.gate)} hands
              </h2>
              <span className="text-callout text-fog tabular-nums max-sm:text-foot">{overall ? groupStatus(g) : ''}</span>
            </div>
            <ul className="m-0 -mx-3 list-none p-0 max-sm:-mx-2">
              {g.stats.map((def) => (
                <StatRow
                  key={def.key}
                  def={def}
                  value={overall ? overall[def.key] : undefined}
                  band={bandFor(targets, def.key)}
                  windowHands={windowHands}
                  ready={ready}
                />
              ))}
            </ul>
          </section>
        )
      })}
      {fts !== null ? (
        <p className="m-0 max-w-[62ch] text-callout text-fog">
          {fts.value !== null ? (
            <>
              Fold to steal <b className="font-semibold text-ink tabular-nums">{fts.value}</b>. How often you give up a blind to a steal.
            </>
          ) : (
            'Fold to steal: no steals faced yet.'
          )}{' '}
          It has no target range, so it is never judged.
        </p>
      ) : null}
    </div>
  )
}
