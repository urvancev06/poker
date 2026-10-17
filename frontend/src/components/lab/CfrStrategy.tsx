/**
 * CfrStrategy: the 12 learned frequencies, one per information set (a card plus the action
 * so far), grouped by the player who acts: player 1 opens and, after checking, faces a
 * bet; player 2 faces a bet or is checked to. Each row is the card, how often it takes the
 * spot's action (bet, or call when facing a bet), a rail from never to always with the
 * textbook equilibrium on it, and that equilibrium in words. The rest of the time it
 * checks or folds.
 *
 * The textbook answer is a family: player 1 may bluff the J anywhere from 0 to a third of
 * the time, and its K bet and Q call follow from that choice, so those two targets are
 * computed from the J bluff the solver learned.
 */
import type { CfrStrategyRow } from '../../api'
import { strategyGroups } from '../../lib/labCfr'
import { LabRail } from './LabParts'

const PLAYER_TITLE = { 1: 'Player 1, first to act', 2: 'Player 2, second to act' } as const

export function CfrStrategy({ strategy }: { strategy: readonly CfrStrategyRow[] }) {
  const players = strategyGroups(strategy)
  return (
    <section aria-labelledby="cfr-strategy" className="mt-24 max-sm:mt-16">
      <h2 id="cfr-strategy" className="m-0 text-title font-strong">
        Learned strategy
      </h2>
      <p className="m-0 mt-3 max-w-[64ch] text-callout text-fog">
        How often each card bets or calls at each spot; the rest of the time it checks or folds. The textbook equilibrium emerges: never open
        the Q, always call a bet with the K, fold the J to a bet, and bluff the J up to a third of the time, with the K bet three times as
        often as that bluff. The pale mark on each rail is the textbook answer.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-x-16 gap-y-14 max-lg:grid-cols-1 max-sm:mt-8">
        {players.map((pl) => (
          <section key={pl.player} aria-labelledby={`cfr-p${pl.player}`}>
            <h3 id={`cfr-p${pl.player}`} className="m-0 text-headline font-strong">
              {PLAYER_TITLE[pl.player]}
            </h3>
            {pl.groups.map((g) => (
              <div key={g.spot.history} className="mt-6">
                <h4 className="m-0 text-callout font-semibold text-fog">
                  {g.spot.title}: how often it {g.spot.action === 'bets' ? 'bets' : 'calls'}
                </h4>
                <ul className="m-0 mt-1 list-none p-0">
                  {g.rows.map((r) => (
                    <li key={r.infoset} className="kuhn-row">
                      <span className="kuhn-row__card text-title font-strong">{r.card}</span>
                      <span className="kuhn-row__value text-headline font-strong tabular-nums">{r.text}</span>
                      <LabRail className="kuhn-row__rail" p={r.p} band={r.target ? { lo: r.target.lo, hi: r.target.hi } : null} state="plain" />
                      <span className="kuhn-row__target text-foot text-fog tabular-nums">
                        <span className="sr-only">Textbook: </span>
                        {r.target?.text ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}
