/**
 * The hand log: this hand's actions, grouped by street (inventory 10). "You" or the
 * position, then the action with its amount; folds step back. Opens at the newest row.
 */
import { useLayoutEffect, useRef } from 'react'
import type { LogStreet } from '../../lib/handLog'

export function HandLog({ streets }: { streets: LogStreet[] }) {
  const last = useRef<HTMLLIElement>(null)
  const count = streets.reduce((a, b) => a + b.rows.length, 0)
  // keep the newest action in view as the hand goes on
  useLayoutEffect(() => {
    last.current?.scrollIntoView({ block: 'nearest' })
  }, [count])
  if (!count) return <p className="m-0 text-callout text-fog">Nobody has acted yet.</p>
  return streets.map((b, si) => (
    <section key={`${b.street}-${si}`} aria-label={b.label}>
      <h3 className={`mb-1 text-foot font-semibold text-fog ${si === 0 ? 'mt-0' : 'mt-3.5'}`}>{b.label}</h3>
      <ol className="m-0 list-none p-0">
        {b.rows.map((r, ri) => (
          <li
            key={r.i}
            ref={si === streets.length - 1 && ri === b.rows.length - 1 ? last : undefined}
            className={`flex gap-3 py-[5px] text-callout tabular-nums ${r.fold ? 'text-dust-sheet' : 'text-ink'}`}
          >
            <span className={`w-10 flex-none font-semibold ${r.you ? 'text-ink' : r.fold ? 'text-dust-sheet' : 'text-fog'}`}>{r.who}</span>
            <span>{r.what}</span>
          </li>
        ))}
      </ol>
    </section>
  ))
}
