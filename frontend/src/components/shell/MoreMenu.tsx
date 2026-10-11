/**
 * MoreMenu: the "..." menu in the top bar. A disclosure (a button with aria-expanded and
 * a panel), not role=menu: it holds two radiogroups and a few links.
 *   - below 1100 px: the three primary views first (the centred nav is hidden there);
 *   - Coach: On / Think first / Off; Opponents: Labeled / HUD / Live (both persisted);
 *   - Study, Lab, Preferences; and New game on a phone (the top bar hides it there).
 * Opens on the spring (scale .96 + blur 6 -> 0); Escape, a tap outside, focus leaving, or
 * picking a destination closes it, and focus returns to the button.
 */
import { useId, useLayoutEffect, useRef } from 'react'
import { useEscape } from '../../lib/escapeStack'
import { play } from '../../lib/motion'
import type { CoachMode, VisibilityMode } from '../../lib/prefsSchema'
import { MORE_VIEWS, PRIMARY_VIEWS, VIEW_LABEL, type View } from '../../lib/views'
import { IconButton } from '../../ui/IconButton'
import { IconMore } from '../../ui/Icons'
import { Segmented, type SegmentedOption } from '../../ui/Segmented'

const COACH_OPTIONS: readonly SegmentedOption<CoachMode>[] = [
  { value: 'on', label: 'On', title: 'The coach speaks on every turn' },
  { value: 'think', label: 'Think first', title: 'Decide first, then ask to see the coach' },
  { value: 'off', label: 'Off', title: 'Only when you ask' },
]
const OPPONENT_OPTIONS: readonly SegmentedOption<VisibilityMode>[] = [
  { value: 'labeled', label: 'Labeled', title: 'Archetype shown' },
  { value: 'hud', label: 'HUD', title: 'Stats after a sample' },
  { value: 'live', label: 'Live', title: 'Read it yourself' },
]

export interface MoreMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: View
  onNavigate: (view: View) => void
  coachMode: CoachMode
  onCoachMode: (mode: CoachMode) => void
  visibility: VisibilityMode
  onVisibility: (mode: VisibilityMode) => void
  onNewGame: () => void
}

const ITEM =
  'squircle flex min-h-10 w-full items-center rounded-[12px] border-0 bg-transparent px-2.5 text-left text-callout text-ink hover:bg-quiet aria-[current=page]:font-semibold'

export function MoreMenu({ open, onOpenChange, view, onNavigate, coachMode, onCoachMode, visibility, onVisibility, onNewGame }: MoreMenuProps) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const close = (refocus = true) => {
    onOpenChange(false)
    if (refocus) button.current?.focus({ preventScroll: true })
  }
  useEscape(open, () => close())

  // Opening: the spring, and focus to the first control the eye lands on.
  useLayoutEffect(() => {
    const el = panel.current
    if (!open || !el) return
    play(el, [{ opacity: 0, transform: 'scale(.96)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 320 })
    const first = [...el.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [role="radio"][tabindex="0"]')].find((b) => b.offsetParent !== null)
    first?.focus({ preventScroll: true })
  }, [open])

  // A tap outside closes it (without stealing focus back).
  useLayoutEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || button.current?.contains(t)) return
      onOpenChange(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, onOpenChange])

  const go = (v: View) => {
    onNavigate(v)
    close()
  }

  return (
    <>
      <IconButton
        ref={button}
        label="More"
        title="More"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
      >
        <IconMore />
      </IconButton>
      <div
        id={id}
        ref={panel}
        hidden={!open}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null
          if (next && !panel.current?.contains(next) && next !== button.current) close(false)
        }}
        className="material-sheet squircle fixed top-[52px] right-2 left-2 z-40 max-h-[calc(100dvh-76px)] origin-[calc(100%-20px)_0] overflow-auto rounded-menu p-2 sm:top-[58px] sm:left-auto sm:right-4 sm:w-[300px]"
      >
        <div className="px-2 pt-2 pb-2.5 lg:hidden">
          {PRIMARY_VIEWS.map((v) => (
            <button key={v} type="button" className={ITEM} aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="border-sheet-line px-2 pt-2 pb-2.5 max-lg:border-t">
          <span id={`${id}-coach`} className="mb-2 ml-0.5 block text-foot font-semibold text-fog">
            Coach
          </span>
          <Segmented labelledBy={`${id}-coach`} options={COACH_OPTIONS} value={coachMode} onChange={onCoachMode} />
        </div>
        <div className="border-t border-sheet-line px-2 pt-2 pb-2.5">
          <span id={`${id}-opp`} className="mb-2 ml-0.5 block text-foot font-semibold text-fog">
            Opponents
          </span>
          <Segmented labelledBy={`${id}-opp`} options={OPPONENT_OPTIONS} value={visibility} onChange={onVisibility} />
        </div>
        <div className="mt-0.5 border-t border-sheet-line pt-1.5">
          {MORE_VIEWS.map((v) => (
            <button key={v} type="button" className={ITEM} aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>
              {VIEW_LABEL[v]}
            </button>
          ))}
          <button
            type="button"
            className={`${ITEM} sm:hidden`}
            onClick={() => {
              onNewGame()
              close()
            }}
          >
            New game
          </button>
        </div>
      </div>
    </>
  )
}
