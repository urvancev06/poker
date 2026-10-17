/**
 * Terms: a short list of rules as a definition list, the term in ink and the line after
 * it in the secondary colour. Side by side from 600 px, stacked on a phone.
 *
 *   <Terms items={[{ term: 'Stop-loss', text: 'A fixed limit per session...' }]} />
 */
export interface TermsProps {
  items: readonly { term: string; text: string }[]
  className?: string
}

export function Terms({ items, className = '' }: TermsProps) {
  return (
    <dl className={`study-terms m-0 ${className}`}>
      {items.map((it) => (
        <div key={it.term} className="study-terms__row">
          <dt className="font-semibold text-ink">{it.term}</dt>
          <dd className="m-0 text-fog">{it.text}</dd>
        </div>
      ))}
    </dl>
  )
}
