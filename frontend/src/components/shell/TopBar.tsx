/**
 * TopBar: the shell's one bar, fixed, 64 px (56 on a phone).
 *   left    the mark and "Poker" (goes to the table)
 *   centre  the capsule nav: Table / My stats / History (from 1100 px; the menu has them below)
 *   right   the hand log (table only, L), New game (from 600 px), the "..." menu
 * On scrolling views a black gradient sits behind it so content fades under it.
 */
import type { ReactNode } from 'react'
import { PRIMARY_VIEWS, VIEW_LABEL, type View } from '../../lib/views'
import { Capsule } from '../../ui/Capsule'
import { IconButton } from '../../ui/IconButton'
import { IconLog } from '../../ui/Icons'

export interface TopBarProps {
  view: View
  onNavigate: (view: View) => void
  logOpen: boolean
  onToggleLog: () => void
  onNewGame: () => void
  /** The "..." menu (MoreMenu), rendered at the end of the tools. */
  menu: ReactNode
}

export function TopBar({ view, onNavigate, logOpen, onToggleLog, onNewGame, menu }: TopBarProps) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-20 flex h-[var(--bar-h)] items-center pr-3 pl-4 sm:pr-4 sm:pl-6 ${
        view === 'table' ? '' : "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-linear-to-b before:from-black before:from-40% before:to-transparent before:content-['']"
      }`}
    >
      <button
        type="button"
        onClick={() => onNavigate('table')}
        aria-label="Poker, go to the table"
        className="inline-flex items-center gap-2.5 rounded-[10px] border-0 bg-transparent p-0 text-ink"
      >
        <img src="/brand/urvancev-logo-white.svg" alt="" width={22} height={22} className="size-[22px]" />
        <span className="text-[19px] font-strong tracking-title">Poker</span>
      </button>

      <nav aria-label="Views" className="absolute top-1/2 left-1/2 hidden -translate-1/2 gap-0.5 rounded-full bg-quiet p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] lg:flex">
        {PRIMARY_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-current={view === v ? 'page' : undefined}
            onClick={() => onNavigate(v)}
            className="rounded-full border-0 bg-transparent px-4 py-[7px] text-[14px] font-medium tracking-[-0.005em] text-fog transition-colors duration-200 hover:text-ink aria-[current=page]:bg-quiet-hi aria-[current=page]:text-ink aria-[current=page]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3),inset_0_1px_0_rgba(255,255,255,0.12)]"
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {view === 'table' && (
          <IconButton label="Hand log" title="Hand log (L)" aria-expanded={logOpen} aria-keyshortcuts="L" onClick={onToggleLog}>
            <IconLog />
          </IconButton>
        )}
        <Capsule variant="quiet" size="sm" onClick={onNewGame} className="max-sm:hidden">
          New game
        </Capsule>
        {menu}
      </div>
    </header>
  )
}
