/**
 * DeckPicker: the five decks, each previewed live with one card of every suit (A♠ K♥ Q♦
 * J♣), so the four-colour deck visibly differs from the rest. A radiogroup with roving
 * focus (arrow keys, Home / End). The chosen deck's cards lift, like your hand on your
 * turn; its name gets a check and a heavier weight, so the choice is never told by motion
 * or colour alone. The previews are decorative: the deck's name is the radio's name.
 *
 *   <DeckPicker value={deckId} onChange={setDeckId} labelledBy={headingId} />
 */
import { useRef, type KeyboardEvent } from 'react'
import { DECKS } from '../../lib/decks'
import type { DeckId } from '../../lib/deckIds'
import { Card } from '../Card'
import { CheckMark } from './ChoiceList'

export interface DeckPickerProps {
  value: DeckId
  onChange: (id: DeckId) => void
  labelledBy: string
}

const PREVIEW = ['As', 'Kh', 'Qd', 'Jc'] as const
const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export function DeckPicker({ value, onChange, labelledBy }: DeckPickerProps) {
  const group = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = DECKS.findIndex((d) => d.id === value)
    let next = -1
    if (e.key in STEP) next = (i + STEP[e.key] + DECKS.length) % DECKS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = DECKS.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(DECKS[next].id)
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div ref={group} role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="deck-picker">
      {DECKS.map((d) => {
        const on = d.id === value
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={d.name}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(d.id)}
            className="deck"
          >
            <span className="deck__hand">
              {PREVIEW.map((c) => (
                <Card key={c} card={c} deckId={d.id} width={46} decorative className="deck__card" />
              ))}
            </span>
            <span className="deck__name">
              {d.name}
              <CheckMark className="deck__check" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
