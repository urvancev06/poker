import { useEffect, useRef } from 'react'
import type { ActionLogEntry } from '../api'

const STREET_LABEL: Record<string, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

function actionText(a: ActionLogEntry): string {
  switch (a.action) {
    case 'fold':
      return 'folds'
    case 'check':
      return 'checks'
    case 'call':
      return 'calls'
    case 'bet':
      return `bets ${a.to_amount}`
    case 'raise':
      return `raises to ${a.to_amount}`
    default:
      return a.action
  }
}

/** A running, candid record of who did what this hand — like a real client. */
export function ActionLog({ history, heroSeat }: { history: ActionLogEntry[]; heroSeat: number }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep the latest action in view as the hand unfolds.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [history.length])

  // Group consecutive entries by street, preserving order.
  const groups: Array<{ street: string; entries: ActionLogEntry[] }> = []
  for (const e of history) {
    const last = groups[groups.length - 1]
    if (last && last.street === e.street) last.entries.push(e)
    else groups.push({ street: e.street, entries: [e] })
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-bg2/70 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Action</div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
        {groups.length === 0 && <p className="text-muted/70">Hand starting…</p>}
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="text-[10px] uppercase tracking-wider text-accent/80">
              {STREET_LABEL[g.street] ?? g.street}
            </div>
            {g.entries.map((e, i) => {
              const isHero = e.seat === heroSeat
              return (
                <div key={i} className="flex items-baseline gap-1.5 tabular-nums">
                  <span className={isHero ? 'font-semibold text-accent' : 'text-muted'}>
                    {isHero ? 'You' : e.position}
                  </span>
                  <span className={e.action === 'fold' ? 'text-muted/60' : 'text-ink'}>
                    {actionText(e)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
