// The Stage shell: the space behind every view, the top bar (brand, the centred capsule
// nav, the log button, New game, the "..." menu) and view switching.
//
// The table session lives here (lib/useTableSession.ts), above the views, so the game
// keeps running while another view is open: bots keep stepping and the coach keeps
// fetching (inventory 5.1). Every view stays mounted once visited (React <Activity>):
// hidden views keep their state, and their effects pause until they are shown again.
// Each view has its own LayerHost, so its sheets and tooltips hide with it.
// No router and no URL state: a reload lands on the table.

import { Activity, useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePrefs } from './lib/prefsContext'
import { useTableSession } from './lib/useTableSession'
import type { View } from './lib/views'
import { LayerHost } from './ui/LayerHost'
import { Space } from './ui/Space'
import { TopBar } from './components/shell/TopBar'
import { MoreMenu } from './components/shell/MoreMenu'
import { TableView } from './components/table/TableView'
import { StatsView } from './components/stats/StatsView'
import { HistoryView } from './components/history/HistoryView'
import { LabView } from './components/lab/LabView'
import { StudyView } from './components/study/StudyView'
import { PreferencesView } from './components/prefs/PreferencesView'

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable]')
}

/** A scrolling view under the fixed top bar; the bottom padding keeps text off the limb. */
function Page({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <LayerHost>
        <main className="relative z-[1] pt-[var(--bar-h)] pb-40">{children}</main>
      </LayerHost>
    </Activity>
  )
}

export default function App() {
  const table = useTableSession()
  const { visibility, setVisibility } = usePrefs()
  const [view, setView] = useState<View>('table')
  const [visited, setVisited] = useState<ReadonlySet<View>>(() => new Set<View>(['table']))
  const [logOpen, setLogOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const navigate = useCallback((v: View) => {
    setView(v)
    setVisited((s) => (s.has(v) ? s : new Set(s).add(v)))
    if (v !== 'table') setLogOpen(false)
    window.scrollTo(0, 0)
  }, [])

  const newGame = useCallback(() => {
    navigate('table')
    void table.newGame()
  }, [navigate, table])

  // L toggles the hand log on the table.
  const onTable = view === 'table'
  useEffect(() => {
    if (!onTable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        setLogOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onTable])

  return (
    <div className="relative min-h-dvh">
      <Space variant={onTable ? 'stage' : 'page'} dollyKey={view} intro />
      <TopBar
        view={view}
        onNavigate={navigate}
        logOpen={logOpen}
        onToggleLog={() => setLogOpen((o) => !o)}
        onNewGame={newGame}
        menu={
          <MoreMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            view={view}
            onNavigate={navigate}
            coachMode={table.coachMode}
            onCoachMode={table.setCoachMode}
            visibility={visibility}
            onVisibility={setVisibility}
            onNewGame={newGame}
          />
        }
      />

      <Activity mode={onTable ? 'visible' : 'hidden'}>
        <LayerHost>
          <TableView table={table} logOpen={logOpen} onLogOpenChange={setLogOpen} />
        </LayerHost>
      </Activity>
      {visited.has('stats') && (
        <Page active={view === 'stats'}>
          <StatsView onGoToTable={() => navigate('table')} />
        </Page>
      )}
      {visited.has('history') && (
        <Page active={view === 'history'}>
          <HistoryView sessionId={table.session?.session_id} />
        </Page>
      )}
      {visited.has('study') && (
        <Page active={view === 'study'}>
          <StudyView />
        </Page>
      )}
      {visited.has('lab') && (
        <Page active={view === 'lab'}>
          <LabView />
        </Page>
      )}
      {visited.has('prefs') && (
        <Page active={view === 'prefs'}>
          <PreferencesView />
        </Page>
      )}
    </div>
  )
}
