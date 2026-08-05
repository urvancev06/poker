import { useEffect, useRef } from 'react'
import type { ActionLogEntry } from '../api'
import { actionText } from '../lib/actionText'

const STREET_LABEL: Record<string, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

/** Running record of who did what this hand, grouped by street. */
export function ActionLog({ history, heroSeat }: { history: ActionLogEntry[]; heroSeat: number }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep the latest action in view as the hand unfolds.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [history.length])

  const groups: Array<{ street: string; entries: ActionLogEntry[] }> = []
  for (const e of history) {
    const last = groups[groups.length - 1]
    if (last && last.street === e.street) last.entries.push(e)
    else groups.push({ street: e.street, entries: [e] })
  }

  return (
    <div className="flex max-h-[55vh] min-h-0 flex-col rounded-lg border border-line p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Action</div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed">
        {groups.length === 0 && <p className="text-faint">awaiting…</p>}
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="text-[9px] uppercase tracking-[0.16em] text-accent/70">
              {STREET_LABEL[g.street] ?? g.street}
            </div>
            {g.entries.map((e, i) => {
              const isHero = e.seat === heroSeat
              return (
                <div key={i} className="flex gap-2 tabular-nums">
                  <span className={`w-7 shrink-0 ${isHero ? 'text-accent' : 'text-faint'}`}>
                    {isHero ? 'YOU' : e.position}
                  </span>
                  <span className={e.action === 'fold' ? 'text-faint' : 'text-muted'}>
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
