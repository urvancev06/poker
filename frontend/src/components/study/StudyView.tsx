/**
 * Study: the static reference for the 100bb 6-max baseline the bots are built from and the
 * coach teaches, framed honestly as a starting point and not solver truth. Long-form
 * reading on the void: prose held under 64ch, the Stage type scale, and from 1100 px a
 * quiet in-page nav that sticks beside the column.
 *
 *   <StudyView />
 *
 * Eight sections (inventory §16): positions; opening ranges as 13 x 13 grids; the postflop
 * framework; pot odds; the draws table and sizing; the five archetypes and how to beat
 * each; stat definitions, grouped by the same sample gates My stats reads them at; and
 * bankroll, variance and tilt. No fetches and no loading, error or empty states: the
 * content is in lib/study.ts, where tests hold it to the backend.
 */
import type { ReactNode } from 'react'
import { BP, useLayoutKind, useViewportSize } from '../../lib/breakpoints'
import { useSpaceAvoid } from '../../lib/spaceAvoid'
import { PageHeader } from '../../ui/PageHeader'
import { count, speakBand as speakTarget } from '../../lib/stats'
import {
  ARCHETYPES,
  ARCHETYPE_STATS,
  BANKROLL,
  DRAWS,
  FRAMEWORK,
  GTO_WIZARD_URL,
  POSITIONS,
  PRICE_EXAMPLE,
  SECTIONS,
  SIZING,
  bandText,
  drawEquity,
  priceToCall,
  speakBand,
  sectionDomId,
  statGroups,
  targetText,
  type SectionId,
} from '../../lib/study'
import { OpeningRanges } from './OpeningRanges'
import { StudyNav } from './StudyNav'
import { Terms } from './Terms'
import './StudyView.css'

const TITLE = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title])) as Record<SectionId, string>
const STAT_GROUPS = statGroups()

/** Keeps stars out from under the column. Its own component so a resize re-renders only this. */
function SpaceColumn() {
  const { w, h } = useViewportSize()
  const phone = w < BP.sm
  const col = Math.min(w, 1120) - (phone ? 0 : 56)
  const rect = w > 0 ? (phone ? { x: 0, y: 120, w, h: h - 120 } : { x: (w - col) / 2, y: 0, w: col, h }) : null
  useSpaceAvoid('study', [rect])
  return null
}

function Section({ id, lead, children }: { id: SectionId; lead?: string; children: ReactNode }) {
  const dom = sectionDomId(id)
  return (
    <section id={dom} aria-labelledby={`${dom}-h`} className="study-section">
      <h2 id={`${dom}-h`} tabIndex={-1} className="m-0 text-title font-strong">
        {TITLE[id]}
      </h2>
      {lead ? <p className="study-lead">{lead}</p> : null}
      {children}
    </section>
  )
}

export function StudyView() {
  const desk = useLayoutKind() === 'desk'
  return (
    <div className="study mx-auto max-w-[1120px] px-10 pt-[100px] pb-[60px] max-sm:px-4 max-sm:pt-[76px] max-sm:pb-0">
      <SpaceColumn />
      <header className="study-head">
        <PageHeader title="Study" />
        <p className="m-0 mt-5 max-w-[60ch] text-body text-fog">
          The 100bb 6-max baseline the bots are built from and the coach teaches. It is a standard starting point, not solver
          truth: real GTO mixes its frequencies. For exact ranges and mixing,{' '}
          <a href={GTO_WIZARD_URL} target="_blank" rel="noreferrer" className="study-link">
            check in GTO Wizard<span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      </header>

      <div className="study-body">
        {desk ? <StudyNav /> : null}
        <div className="study-column">
          <Section id="positions" lead="Acting later means more information and more profit, so play tighter early and wider late. In the order they act before the flop:">
            <ol className="study-positions m-0 list-none p-0">
              {POSITIONS.map((p) => (
                <li key={p.pos} className="study-positions__row">
                  <span className="text-headline font-strong">{p.pos}</span>
                  <div>
                    <p className="m-0 font-semibold text-ink">{p.name}</p>
                    <p className="m-0 mt-1 text-fog">{p.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="opening" lead="Raise first in: everyone before you has folded. History grades your opens against exactly these lists.">
            <OpeningRanges />
          </Section>

          <Section id="postflop" lead="The decision framework the bots play and the coach teaches.">
            <dl className="study-framework m-0">
              {FRAMEWORK.map((f) => (
                <div key={f.term} className="study-framework__row">
                  <dt className="text-headline font-strong">{f.term}</dt>
                  <dd className="m-0 mt-2">
                    <p className="m-0 text-callout text-fog">{f.counts}</p>
                    <p className="m-0 mt-1.5 text-ink">{f.play}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="pot-odds" lead="The coach computes these exactly. The price is what calling costs as a share of the pot you would win.">
            <PotOdds />
          </Section>

          <Section id="draws" lead="The exact chance of hitting, not the rule of thumb. Two cards only counts when you are all-in; otherwise you pay again on the turn.">
            <Draws />
          </Section>

          <Section id="player-types" lead="The five bots at the table, the bands the Lab holds them to, and how to beat each.">
            <PlayerTypes />
          </Section>

          <Section id="stats" lead="Your targets, the ranges My stats holds you to. Each stat is read only once the sample can carry it, so they are grouped by when that is.">
            <StatDefinitions />
          </Section>

          <Section id="bankroll">
            <Terms items={BANKROLL} className="mt-8" />
          </Section>
        </div>
      </div>
    </div>
  )
}

function PotOdds() {
  const need = Math.round(priceToCall(PRICE_EXAMPLE.call, PRICE_EXAMPLE.pot))
  const after = PRICE_EXAMPLE.pot + PRICE_EXAMPLE.call
  return (
    <>
      <p className="m-0 mt-8 text-headline font-strong tabular-nums">Need = call ÷ (pot + call)</p>
      <p className="m-0 mt-3 max-w-[62ch] text-fog">
        The pot already counts their bet. A {PRICE_EXAMPLE.call} bb bet makes the pot {PRICE_EXAMPLE.pot} bb; calling {PRICE_EXAMPLE.call} bb makes it{' '}
        {after} bb, so you need {PRICE_EXAMPLE.call} ÷ {after}:
      </p>
      <dl className="study-figures m-0 mt-6">
        <div>
          <dt>Pot</dt>
          <dd>
            {PRICE_EXAMPLE.pot}
            <span className="ml-1 text-callout font-semibold text-fog">bb</span>
          </dd>
        </div>
        <div>
          <dt>To call</dt>
          <dd>
            {PRICE_EXAMPLE.call}
            <span className="ml-1 text-callout font-semibold text-fog">bb</span>
          </dd>
        </div>
        <div>
          <dt>Need</dt>
          <dd>{need}%</dd>
        </div>
      </dl>
      <Terms
        className="mt-12"
        items={[
          {
            term: 'Rule of 2 and 4',
            text: 'With one card to come, equity is about outs × 2%. With two to come, and only when you are all-in, about outs × 4%.',
          },
          { term: 'Call when equity beats the price', text: 'The coach uses Monte Carlo equity against the modelled range, not just your outs.' },
          { term: 'Dirty outs', text: 'An out that also improves the hand you are up against is not clean. Discount it.' },
        ]}
      />
    </>
  )
}

function Draws() {
  return (
    <>
      <table className="study-table mt-8">
        <thead>
          <tr>
            <th scope="col">Draw</th>
            <th scope="col">Outs</th>
            <th scope="col">One card</th>
            <th scope="col">Two cards</th>
          </tr>
        </thead>
        <tbody>
          {DRAWS.map((d) => (
            <tr key={d.draw}>
              <th scope="row">{d.draw}</th>
              <td>
                {d.approx ? (
                  <>
                    <span aria-hidden="true">~</span>
                    <span className="sr-only">about </span>
                    {d.outs}
                  </>
                ) : (
                  d.outs
                )}
              </td>
              <td>{Math.round(drawEquity(d.outs, 1))}%</td>
              <td>{Math.round(drawEquity(d.outs, 2))}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="m-0 mt-14 text-headline font-strong">Bet sizing after the flop</h3>
      <p className="study-lead">As a share of the pot.</p>
      <Terms className="mt-5" items={SIZING.map((s) => ({ term: s.spot, text: s.size }))} />
    </>
  )
}

function PlayerTypes() {
  return (
    <>
      <div className="study-types">
        {ARCHETYPES.map((a) => (
          <article key={a.name} className="study-type" aria-labelledby={`study-type-${a.name}`}>
            <h3 id={`study-type-${a.name}`} className="m-0 text-headline font-strong">
              {a.name}
            </h3>
            <p className="m-0 mt-1.5 text-fog">{a.identity}</p>
            <dl className="study-bands m-0 mt-4">
              {ARCHETYPE_STATS.map((s) => {
                const band = a.bands[s.key]
                return band ? (
                  <div key={s.key}>
                    <dt>{s.label}</dt>
                    <dd>
                      <span aria-hidden="true">{bandText(band)}</span>
                      <span className="sr-only">{speakBand(band, s.ratio)}</span>
                    </dd>
                  </div>
                ) : null
              })}
            </dl>
            <p className="m-0 mt-4 text-ink">{a.exploit}</p>
          </article>
        ))}
      </div>
      <p className="m-0 mt-12 max-w-[62ch] text-callout text-fog">
        The exploits are reads from general poker knowledge, not solver lines. The Station and the Maniac play badly on purpose: that is
        the point.
      </p>
    </>
  )
}

function StatDefinitions() {
  return (
    <div className="study-stat-groups">
      {STAT_GROUPS.map((g) => (
        <div key={g.gate}>
          <h3 className="m-0 text-headline font-strong">Readable at {count(g.gate)} hands</h3>
          <dl className="study-stats m-0 mt-4">
            {g.stats.map((s) => (
              <div key={s.key} className="study-stats__row">
                <dt className="font-strong text-ink">{s.name}</dt>
                <dd className="study-stats__target m-0 tabular-nums">
                  <span aria-hidden="true">{targetText(s)}</span>
                  <span className="sr-only">{speakTarget(s, s.target)}</span>
                </dd>
                <dd className="m-0 text-fog">{s.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
