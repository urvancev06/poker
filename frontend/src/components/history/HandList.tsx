/**
 * HandList: the hands in the window, newest first, grouped by session under its day and
 * time range (hand numbers restart every session, B19). Each row: the hand number, your
 * position, your cards, how it ended and the signed net (+94 / −91 / 0: the sign says it,
 * the colour repeats it).
 *
 * A row is a button; the one being replayed is aria-current and carries a rim (>= 3:1, as
 * the segmented control's). One tab stop for the whole list: the arrow keys (and Home /
 * End) move between rows, Enter or a click replays one. PAGE_SIZE rows at a time.
 */
import { useId, useState, type KeyboardEvent } from 'react'
import type { HandSummary } from '../../api'
import { splitCards } from '../../lib/cards'
import { chips, signedChips } from '../../lib/format'
import { PAGE_SIZE, groupBySession, handNumber, handsCount, outcomeOf, rowLabel, type SessionGroup } from '../../lib/historyList'
import { Capsule } from '../../ui/Capsule'
import { Card } from '../Card'
import { NET_TEXT } from './tones'

export interface HandListProps {
  hands: HandSummary[]
  sessionId?: string
  selectedId: number | null
  onSelect: (h: HandSummary) => void
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }

export function HandList({ hands, sessionId, selectedId, onSelect }: HandListProps) {
  const headId = useId()
  const [shown, setShown] = useState(PAGE_SIZE)
  // "Today" / "Yesterday" are read against the moment the list was built.
  const [now] = useState(() => new Date())
  // grouped over the whole window (so a group's count is the session's), shown a page at a time
  const groups = groupBySession(hands, sessionId, now)
  const visible: { group: SessionGroup; rows: HandSummary[] }[] = []
  let budget = shown
  for (const g of groups) {
    if (budget <= 0) break
    visible.push({ group: g, rows: g.hands.slice(0, budget) })
    budget -= g.hands.length
  }
  const rest = hands.length - shown
  // the tab stop: the replayed row when it is on screen, else the first
  const stop = selectedId != null && hands.slice(0, shown).some((h) => h.id === selectedId) ? selectedId : (hands[0]?.id ?? null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.hand-row')]
    const i = rows.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    let next = -1
    if (e.key in STEP) next = Math.min(rows.length - 1, Math.max(0, i + STEP[e.key]))
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = rows.length - 1
    if (next < 0) return
    e.preventDefault()
    rows[next].focus()
  }

  return (
    <section aria-labelledby={headId}>
      <h2 id={headId} className="sr-only">
        Hands
      </h2>
      <div className="grid gap-8" onKeyDown={onKeyDown}>
        {visible.map(({ group, rows }) => (
          <Group key={group.key} group={group} rows={rows} selectedId={selectedId} stop={stop} onSelect={onSelect} />
        ))}
      </div>
      {rest > 0 ? (
        <Capsule variant="quiet" size="md" className="mt-6" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show {chips(Math.min(PAGE_SIZE, rest))} more
        </Capsule>
      ) : null}
    </section>
  )
}

interface GroupProps {
  group: SessionGroup
  rows: HandSummary[]
  selectedId: number | null
  stop: number | null
  onSelect: (h: HandSummary) => void
}

function Group({ group: g, rows, selectedId, stop, onSelect }: GroupProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="hand-group">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 id={id} className="m-0 text-callout font-semibold">
          {g.title}
          {g.range ? (
            <>
              {/* a real space, so it is heard as "Oct 10 4:12", not "Oct 104:12" (the margin
                  makes up the rest of the 10 px gap) */}{' '}
              <span className="ml-1.5 font-normal text-fog tabular-nums">{g.range}</span>
            </>
          ) : null}
        </h3>
        <span className="text-foot text-fog tabular-nums">{handsCount(g.hands.length)}</span>
      </div>
      <ul className="m-0 -mx-3 list-none p-0">
        {rows.map((h) => (
          <Row key={h.id} hand={h} selected={h.id === selectedId} tabbable={h.id === stop} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  )
}

function Row({ hand: h, selected, tabbable, onSelect }: { hand: HandSummary; selected: boolean; tabbable: boolean; onSelect: (h: HandSummary) => void }) {
  const o = outcomeOf(h.hero_net, h.went_to_showdown)
  return (
    <li className="hand-row__item">
      <button type="button" className="hand-row" data-hand={h.id} aria-current={selected ? 'true' : undefined} aria-label={rowLabel(h)} tabIndex={tabbable ? 0 : -1} onClick={() => onSelect(h)}>
        <span className="text-callout text-fog tabular-nums">{handNumber(h.hand_index)}</span>
        <span className="text-callout font-semibold">{h.hero_position}</span>
        <span className="flex gap-[3px]">
          {splitCards(h.hero_cards).map((c, i) => (
            <Card key={i} card={c} width={26} decorative className="hand-row__card" />
          ))}
        </span>
        <span className="min-w-0 truncate text-foot text-fog">{o.short}</span>
        <span className={`text-right text-body font-strong tabular-nums ${NET_TEXT[o.tone]}`}>{signedChips(h.hero_net)}</span>
      </button>
    </li>
  )
}
