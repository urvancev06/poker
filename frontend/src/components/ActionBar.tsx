import { useEffect, useState } from 'react'
import type { ActionType, LegalActions } from '../api'

const QUICK: Array<[string, number]> = [
  // ⅓ is the first c-bet size the Study framework teaches and was the one size with
  // no button, so it could not be practised at the speed the others could.
  ['⅓', 1 / 3],
  ['½', 0.5],
  ['¾', 0.75],
  ['pot', 1],
]

export function ActionBar({
  legal,
  pot,
  heroBet,
  onAction,
  disabled,
}: {
  legal: LegalActions
  pot: number
  heroBet: number
  onAction: (type: ActionType, toAmount?: number) => void
  disabled?: boolean
}) {
  const canAggress = legal.can_bet || legal.can_raise
  const min = legal.min_raise_to ?? 0
  const max = legal.max_raise_to ?? 0
  const [amount, setAmount] = useState(min)

  useEffect(() => setAmount(min), [min, max])

  const currentLevel = legal.call_amount + heroBet
  const toForFraction = (f: number) =>
    Math.max(min, Math.min(Math.round(currentLevel + f * (pot + legal.call_amount)), max))

  const aggressType: ActionType = legal.can_bet ? 'bet' : 'raise'

  const btn =
    'flex-1 rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition disabled:opacity-40'

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2">
      {/* sizing row */}
      {canAggress && (
        <div className="flex w-full items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="h-1 flex-1 accent-accent"
            disabled={disabled}
          />
          <div className="flex shrink-0 gap-1">
            {QUICK.map(([label, f]) => (
              <button
                key={label}
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink"
                onClick={() => setAmount(toForFraction(f))}
                disabled={disabled}
              >
                {label}
              </button>
            ))}
            <button
              className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink"
              onClick={() => setAmount(max)}
              disabled={disabled}
            >
              all-in
            </button>
          </div>
        </div>
      )}

      {/* action buttons row */}
      <div className="flex w-full items-stretch justify-center gap-2">
        {legal.can_fold && (
          <button
            className={`${btn} border border-line text-muted hover:border-muted hover:text-ink`}
            onClick={() => onAction('fold')}
            disabled={disabled}
          >
            Fold
          </button>
        )}
        {legal.can_check && (
          <button
            className={`${btn} bg-bg2 text-ink ring-1 ring-line hover:ring-muted`}
            onClick={() => onAction('check')}
            disabled={disabled}
          >
            Check
          </button>
        )}
        {legal.can_call && (
          <button
            className={`${btn} bg-bg2 text-ink ring-1 ring-line hover:ring-muted`}
            onClick={() => onAction('call')}
            disabled={disabled}
          >
            Call <span className="tabular-nums text-accent">{legal.call_amount}</span>
          </button>
        )}
        {canAggress && (
          <button
            className={`${btn} bg-accent text-accent-ink hover:brightness-110`}
            onClick={() => onAction(aggressType, amount)}
            disabled={disabled}
          >
            {legal.can_bet ? 'Bet' : 'Raise'} <span className="tabular-nums">{amount}</span>
          </button>
        )}
      </div>
    </div>
  )
}
