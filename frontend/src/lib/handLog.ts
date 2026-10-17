// The hand log: this hand's actions grouped by street (inventory 10). Each row is "You"
// or the position, then the action in words, with the call amount the history leaves out.

import type { ActionLogEntry } from '../api'
import { STREET_LABEL, streetVerb, type Street } from './tableModel'

export interface LogRow {
  /** History index (a stable key). */
  i: number
  who: string
  what: string
  you: boolean
  fold: boolean
}

export interface LogStreet {
  street: string
  label: string
  rows: LogRow[]
}

export function handLog(history: readonly ActionLogEntry[], heroSeat: number, amounts: readonly (number | null)[]): LogStreet[] {
  const out: LogStreet[] = []
  history.forEach((h, i) => {
    let block = out[out.length - 1]
    if (!block || block.street !== h.street) {
      block = { street: h.street, label: STREET_LABEL[h.street as Street] ?? h.street, rows: [] }
      out.push(block)
    }
    const you = h.seat === heroSeat
    block.rows.push({ i, who: you ? 'You' : h.position, what: streetVerb(h, amounts[i] ?? null, you), you, fold: h.action === 'fold' })
  })
  return out
}
