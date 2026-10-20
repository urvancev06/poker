/**
 * The replay of one hand, on a #1c1c1e reading sheet.
 *
 *   ReplayPanel  the desk's right column: stays in view under the top bar while the list
 *                scrolls, and always fits the viewport; its body scrolls, with a fade when
 *                more is below. With no hand picked it says what a replay shows and offers
 *                the last hand.
 *   ReplayBody   the replay itself (also the phone's bottom sheet):
 *     - header: your cards, your position and when, the signed net and how it ended (the
 *       showdown flag is in those words: "Lost at showdown");
 *     - every street with the board as it stood (the cards dealt on it set apart), each
 *       action in words with its amount and an all-in mark; your actions on a raised band;
 *       streets dealt with nobody left to act (an all-in runout) are shown too;
 *     - your decision under each of your actions: the hand you held, the price, a rail on
 *       one 0-100 scale (fill = realized equity, notch = the price, dot = raw equity), the
 *       figures with their labels, a note when the price was adjusted away from pot odds,
 *       and the review's leak notes in full;
 *     - the showdown: every hand turned up, with each player's result.
 *   The header shows at once from the row's summary; the streets follow when the review
 *   lands. Loading and error states are scoped to the body.
 */
import { useEffect, useId, useRef, useState, type ReactNode, type UIEvent } from 'react'
import type { HandSummary } from '../../api'
import { describeError } from '../../lib/apiError'
import { splitCards } from '../../lib/cards'
import { bb, pct } from '../../lib/format'
import { handNumber, outcomeOf, whenLabel } from '../../lib/historyList'
import { boardSpeech, buildTimeline, decisionsLine, figuresLabel, handBigBlind, priceNote, shownHands, type DecisionView, type TimelineStreet } from '../../lib/historyReplay'
import { usePrefs } from '../../lib/prefsContext'
import { Capsule } from '../../ui/Capsule'
import { ErrorNotice } from '../../ui/ErrorNotice'
import { Card } from '../Card'
import { NET_TEXT } from './tones'
import type { ReplayLoad } from './useHistoryData'

/* ---------- the desk panel ---------- */

export function ReplayPanel({ picked, load, onLatest }: { picked: HandSummary | null; load: ReplayLoad; onLatest: () => void }) {
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const measure = (el: HTMLElement) => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)

  // "More below" fade, kept right as the content changes size.
  useEffect(() => {
    const el = body.current
    if (!el) return
    const ro = new ResizeObserver(() => measure(el))
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [picked?.id, load.review])

  // Always fits the viewport: below its resting place at the top of the page it is
  // shorter, and it grows as the page scrolls until it sticks under the top bar. Written
  // straight to the element (computed geometry, no re-render per scroll frame).
  useEffect(() => {
    const el = panel.current
    if (!el) return
    let raf = 0
    const fit = () => {
      raf = 0
      el.style.maxHeight = `${Math.max(280, window.innerHeight - el.getBoundingClientRect().top - 16)}px`
    }
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(fit)
    }
    fit()
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', queue)
      window.removeEventListener('resize', queue)
    }
  }, [])

  // a new hand starts at its top
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [picked?.id])

  return (
    <section
      ref={panel}
      aria-labelledby={picked ? titleId : undefined}
      aria-label={picked ? undefined : 'Replay'}
      className="replay-panel material-sheet squircle rounded-sheet"
    >
      <div ref={body} className={`replay-panel__body ${more ? 'has-more' : ''}`} onScroll={(e: UIEvent<HTMLDivElement>) => measure(e.currentTarget)}>
        {picked ? (
          <ReplayBody summary={picked} load={load} titleId={titleId} />
        ) : (
          <div className="grid justify-items-start py-2">
            <p className="m-0 text-headline font-strong">Pick a hand to replay it.</p>
            <p className="m-0 mt-2 max-w-[46ch] text-callout text-fog">
              Every street is laid out with the board as it fell, and each of your decisions is scored again: the equity you realized against the price you were offered.
            </p>
            <Capsule variant="primary" size="md" className="mt-5" onClick={onLatest}>
              Replay your last hand
            </Capsule>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------- the replay ---------- */

export interface ReplayBodyProps {
  summary: HandSummary
  load: ReplayLoad
  /** Render the "Hand 132" heading with this id (the desk panel); the phone sheet has its own. */
  titleId?: string
}

export function ReplayBody({ summary: h, load, titleId }: ReplayBodyProps) {
  const { visibility } = usePrefs()
  const [now] = useState(() => new Date())
  const { review, detail, error, loading, retry } = load
  const o = outcomeOf(h.hero_net, h.went_to_showdown)
  const when = whenLabel(h.created_at, now)
  const t = review ? buildTimeline(review, detail) : null
  // the hand's own big blind (old hands: 1/2), from the stored hand, the review or the row
  const big = handBigBlind(review?.big_blind ? review : h, detail)
  const shown = review && detail ? shownHands(detail, { labeled: visibility === 'labeled' }) : []
  const n = handNumber(h.hand_index)

  return (
    <article aria-busy={loading}>
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2.5 max-sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex gap-1.5">
          {splitCards(h.hero_cards).map((c, i) => (
            <Card key={i} card={c} width={52} className="replay-card max-sm:h-auto max-sm:w-11" />
          ))}
        </div>
        <div className="min-w-0 pt-0.5 max-sm:col-span-2 max-sm:row-start-2 max-sm:pt-0">
          {titleId ? (
            <h2 id={titleId} className="m-0 text-title font-strong">
              Hand {n}
            </h2>
          ) : null}
          <p className={`m-0 flex flex-wrap gap-x-2.5 text-callout text-fog ${titleId ? 'mt-1' : ''}`}>
            <span className="font-semibold text-ink">{h.hero_position}</span>
            {when ? <span>{when}</span> : null}
          </p>
          {t ? <p className="m-0 mt-0.5 text-callout text-fog">{decisionsLine(t)}</p> : null}
        </div>
        <div className="pt-0.5 text-right max-sm:col-start-2 max-sm:row-start-1">
          <div className={`text-title font-strong tabular-nums ${NET_TEXT[o.tone]}`}>
            {bb(h.hero_net, big, { sign: true })}
            <span className="ml-1 text-callout font-semibold text-fog">bb</span>
          </div>
          <div className="mt-1 text-foot text-fog">{o.word}</div>
        </div>
      </header>

      {t ? (
        <>
          <ol className="m-0 mt-7 grid list-none gap-6 px-3 py-0">
            {t.streets.map((s, i) => (
              <StreetBlock key={`${s.street}-${i}`} street={s} />
            ))}
            {shown.length > 0 && review?.hero_cards ? (
              <li>
                <StreetHead label="Showdown" />
                <ul className="m-0 mt-1.5 list-none p-0">
                  {[...(review.went_to_showdown ? [{ seat: -1, position: 'You', cards: review.hero_cards, name: null, net: review.hero_net }] : []), ...shown]
                    .sort((a, b) => (b.net ?? 0) - (a.net ?? 0))
                    .map((s) => (
                      <li key={s.seat} className="flex items-center gap-3 py-1.5 text-callout">
                        <span className={`w-10 flex-none font-semibold ${s.seat < 0 ? 'text-ink' : 'text-fog'}`}>{s.position}</span>
                        <span className="flex gap-[3px]">
                          {s.cards.map((c) => (
                            <Card key={c} card={c} width={30} className="replay-card" />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-fog">{s.name ?? ''}</span>
                        {s.net != null ? <span className={`font-semibold tabular-nums ${NET_TEXT[s.net > 0 ? 'win' : s.net < 0 ? 'loss' : 'even']}`}>{bb(s.net, big, { sign: true, unit: true })}</span> : null}
                      </li>
                    ))}
                </ul>
              </li>
            ) : null}
          </ol>
          {t.loose.length > 0 ? (
            <section className="mt-7 px-3">
              <h3 className="m-0 text-callout font-semibold text-fog">Your decisions</h3>
              <ul className="m-0 mt-2 grid list-none gap-3 p-0">
                {t.loose.map((d) => (
                  <li key={d.key} className="replay-you">
                    <p className="m-0 text-callout font-semibold">
                      {d.street}: {d.action}
                    </p>
                    <Decision d={d} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="sr-only" role="status">{`Hand ${n} replayed.`}</p>
        </>
      ) : error ? (
        <ErrorNotice error={error} context="review" headline="This hand’s replay didn’t load." onRetry={describeError(error, 'review').retryable ? retry : undefined} busy={loading} className="mt-7" />
      ) : (
        <p className="history-wait m-0 mt-7 text-callout text-fog">Replaying the hand</p>
      )}
    </article>
  )
}

function StreetHead({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[42px] items-center gap-3">
      <h3 className="m-0 w-[72px] flex-none text-callout font-semibold text-fog">{label}</h3>
      {children}
    </div>
  )
}

function StreetBlock({ street: s }: { street: TimelineStreet }) {
  const old = s.board.slice(0, s.newFrom)
  const fresh = s.board.slice(s.newFrom)
  return (
    <li>
      <StreetHead label={s.label}>
        {s.board.length > 0 ? (
          <div role="img" aria-label={boardSpeech(s.board, s.newFrom)} className="flex items-center gap-[3px]">
            {old.map((c) => (
              <Card key={c} card={c} width={30} decorative className="replay-card" />
            ))}
            {fresh.map((c, i) => (
              <Card key={c} card={c} width={30} decorative className={`replay-card ${i === 0 && old.length > 0 ? 'ml-2.5' : ''}`} />
            ))}
          </div>
        ) : null}
      </StreetHead>
      {s.dealtOnly ? (
        <p className="m-0 mt-1 text-callout text-fog">Dealt with nobody left to act.</p>
      ) : (
        <ul className="m-0 mt-1 list-none p-0">
          {s.rows.map((r) => (
            <li key={r.key} className={r.you ? 'replay-you my-1.5' : ''}>
              <div className={`flex gap-3 text-callout ${r.you ? '' : 'py-[5px]'} ${r.fold && !r.you ? 'text-dust-sheet' : 'text-ink'}`}>
                <span className={`w-10 flex-none font-semibold ${r.you ? 'text-ink' : r.fold ? 'text-dust-sheet' : 'text-fog'}`}>{r.who}</span>
                <span className={`tabular-nums ${r.you ? 'font-semibold' : ''}`}>
                  {r.what}
                  {r.allIn ? <span className="text-fog">, all in</span> : null}
                </span>
              </div>
              {r.decision ? <Decision d={r.decision} /> : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** One of your decisions, re-scored. */
function Decision({ d }: { d: DecisionView }) {
  const note = priceNote(d)
  const tone = d.priceFlag ? 'is-flagged' : ''
  return (
    <div className="mt-1.5 pl-[52px] max-sm:pl-0">
      <p className="m-0 text-callout text-ink">
        <span className="font-semibold">{d.handLabel}</span>
        <span className="ml-2.5 text-fog tabular-nums">{d.price}</span>
      </p>
      {d.eq || d.need != null ? (
        <div role="img" aria-label={figuresLabel(d)} className="mt-3">
          {d.eq ? (
            <div className={`replay-rail ${tone}`} aria-hidden="true">
              <i className="replay-rail__fill" style={{ width: `${clamp(d.eq.value)}%` }} />
              {d.need != null ? <i className="replay-rail__need" style={{ left: `${clamp(d.need)}%` }} /> : null}
              {d.raw != null ? <i className="replay-rail__raw" style={{ left: `${clamp(d.raw)}%` }} /> : null}
            </div>
          ) : null}
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1" aria-hidden="true">
            {d.eq ? <Figure value={pct(d.eq.value, 1)} label={d.eq.label} className={d.priceFlag ? 'text-(--tone-fold-b)' : 'text-ink'} /> : null}
            {d.need != null ? <Figure value={pct(d.need, 1)} label="Need" className="text-fog" /> : null}
            {d.raw != null ? <Figure value={pct(d.raw, 1)} label="Equity" className="text-fog" /> : null}
          </div>
        </div>
      ) : null}
      {note ? <p className="m-0 mt-2 max-w-[56ch] text-foot text-fog">{note}</p> : null}
      {d.leaks.length > 0 ? (
        <ul className="m-0 mt-2.5 grid list-none gap-2 p-0">
          {d.leaks.map((l, i) => (
            <li key={`${l.type}-${i}`} className="replay-leak text-callout">
              <b className="font-semibold text-(--tone-fold-b)">{l.label}.</b> <span className="text-ink">{l.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Figure({ value, label, className }: { value: string; label: string; className: string }) {
  return (
    <span className="grid">
      <span className={`text-headline font-strong tabular-nums ${className}`}>{value}</span>
      <span className="text-caption font-semibold text-dust-sheet">{label}</span>
    </span>
  )
}

const clamp = (n: number) => Math.min(100, Math.max(0, n))
