// The table's keys. F fold, C check or call, R bet or raise (opens the sizing face),
// 1-5 the presets, Enter confirms the size, Space deals the next hand. (L, the hand log,
// is the shell's.) Never while typing in a text field, never with a modifier, never on a
// key repeat; Space and Enter on a focused button stay the button's own.

export type TableCommand =
  | { type: 'fold' }
  | { type: 'checkCall' }
  | { type: 'aggro' }
  | { type: 'preset'; index: number }
  | { type: 'confirm' }
  | { type: 'next' }

export interface KeyLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  repeat?: boolean
  defaultPrevented?: boolean
}

/** What the target is, as far as the keys are concerned. */
export type TargetKind = 'text' | 'button' | 'other'

/** The dock face on screen. */
export type HotkeyFace = 'actions' | 'sizing' | 'result' | 'other'

const TEXT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url', ''])

/** Classify an event target: a text field (keys off), a button (Space/Enter are its own), other. */
export function targetKind(t: EventTarget | null): TargetKind {
  if (!t || typeof (t as Element).closest !== 'function') return 'other'
  const el = t as HTMLElement
  if (el.closest('textarea, select, [contenteditable=""], [contenteditable="true"]')) return 'text'
  const input = el.closest('input') as HTMLInputElement | null
  if (input) return TEXT_TYPES.has((input.getAttribute('type') ?? '').toLowerCase()) ? 'text' : 'other'
  if (el.closest('button, a[href], [role="button"], [role="radio"], summary')) return 'button'
  return 'other'
}

export function commandForKey(e: KeyLike, target: TargetKind, face: HotkeyFace): TableCommand | null {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null
  if (target === 'text') return null
  const k = e.key
  if (face === 'result') {
    if ((k === ' ' || k === 'Spacebar') && target !== 'button') return { type: 'next' }
    return null
  }
  if (face !== 'actions' && face !== 'sizing') return null
  const lower = k.length === 1 ? k.toLowerCase() : k
  if (lower === 'f') return { type: 'fold' }
  if (lower === 'c') return { type: 'checkCall' }
  if (lower === 'r') return { type: 'aggro' }
  if (k >= '1' && k <= '5' && k.length === 1) return { type: 'preset', index: Number(k) - 1 }
  if (k === 'Enter' && face === 'sizing' && target !== 'button') return { type: 'confirm' }
  return null
}
