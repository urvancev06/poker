/**
 * PageHeader: the title row every page view opens with (My stats, History, Study, Lab,
 * Preferences), so the title sits at the same height on all of them and switching views
 * never makes it jump.
 *   - the h1 on the left: 56 px (40 on a phone);
 *   - `controls` (optional) on the right, bottom-aligned with the title;
 *   - `note` (optional, a polite live region) under the controls. From 600 px it hangs
 *     below the row instead of adding to its height; on a phone it stays in the flow.
 *
 *   <PageHeader title="My stats" controls={<Segmented ... />} note={note} />
 */
import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  controls?: ReactNode
  note?: ReactNode
}

export function PageHeader({ title, controls, note }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-[18px]">
      <h1 className="m-0 text-display font-bold max-sm:text-[40px]">{title}</h1>
      {controls != null &&
        (note === undefined ? (
          controls
        ) : (
          <div className="relative flex flex-col items-end gap-2 max-sm:items-stretch">
            {controls}
            <p className="m-0 min-h-[18px] text-foot text-fog max-sm:text-center sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:whitespace-nowrap" aria-live="polite">
              {note}
            </p>
          </div>
        ))}
    </div>
  )
}
