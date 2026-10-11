// The six destinations. No router and no URL state (inventory 5.1): the view is app
// state, the table by default, and leaving the table never pauses the game.

export type View = 'table' | 'stats' | 'history' | 'study' | 'lab' | 'prefs'

export const VIEW_LABEL: Record<View, string> = {
  table: 'Table',
  stats: 'My stats',
  history: 'History',
  study: 'Study',
  lab: 'Lab',
  prefs: 'Preferences',
}

/** In the centred capsule nav (and the menu's first group below 1100 px). */
export const PRIMARY_VIEWS: readonly View[] = ['table', 'stats', 'history']
/** In the "..." menu. */
export const MORE_VIEWS: readonly View[] = ['study', 'lab', 'prefs']
