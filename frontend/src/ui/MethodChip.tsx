/** How an equity figure was computed, as a small pill beside it ("Exact", "±0.4 pp",
 *  "Table"): the Stage's quiet chip (TopBar's selected tab, smaller). Nothing for an
 *  answer without a method. Decorative: the figure's own label speaks the method. */
export function MethodChip({ tag, className = '' }: { tag: string | null; className?: string }) {
  if (!tag) return null
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full bg-quiet-hi px-2 py-px align-middle text-caption font-semibold whitespace-nowrap text-fog shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)] ${className}`}
    >
      {tag}
    </span>
  )
}
