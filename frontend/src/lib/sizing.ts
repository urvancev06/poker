// The hero's choices: which buttons the dock shows and how a bet or raise is sized.
// Pure. Amounts are integer chips and street totals ("raise to"), never increments; labels
// show them in big blinds of the hand ("Raise to 7.5 bb"), and a typed size is read in big
// blinds (lib/format `parseBB`).
//
//   B1   never offer Fold when checking is free (the backend rejects that fold)
//   B26  preflop, the engine reports the big blind's raise over limps as a "bet": it reads
//        "Raise to N" (the action sent is still the one the engine asked for)
//   Presets 1/3, 1/2, 3/4 and pot use the pot-raise formula (inventory 8):
//        to = level + f * (pot + call), level = call + heroBet, clamped to [min, max];
//        pot already includes every bet in front. All-in is max_raise_to.

import type { ActionType, LegalActions } from '../api'
import { bb } from './format'
import type { Street } from './tableModel'

export type DockAction =
  | { kind: 'fold' }
  | { kind: 'check' }
  | { kind: 'call'; amount: number }
  /** Opens the sizing face. */
  | { kind: 'size'; verb: 'Bet' | 'Raise' }
  /** min == max: the only size is all-in, one button. */
  | { kind: 'allin'; type: 'bet' | 'raise'; amount: number }

/** Is any bet or raise legal, with amounts? */
export function canAggress(la: LegalActions | null | undefined): la is LegalActions & { min_raise_to: number; max_raise_to: number } {
  return !!la && (la.can_bet || la.can_raise) && la.min_raise_to != null && la.max_raise_to != null
}

/** "Bet" postflop with nothing to call; "Raise" otherwise (B26: the preflop option is a raise). */
export function aggroVerb(la: LegalActions, street: Street): 'Bet' | 'Raise' {
  return la.can_bet && street !== 'preflop' ? 'Bet' : 'Raise'
}

/** The engine's own action type for an aggressive amount. */
export function aggroType(la: LegalActions): 'bet' | 'raise' {
  return la.can_bet ? 'bet' : 'raise'
}

/** The confirm button's label: "Bet 2.5 bb", "Raise to 7.5 bb". */
export function aggroLabel(la: LegalActions, street: Street, amount: number, bigBlind: number): string {
  const n = bb(amount, bigBlind, { unit: true })
  return aggroVerb(la, street) === 'Bet' ? `Bet ${n}` : `Raise to ${n}`
}

/** The buttons, in order. Only legal ones; Fold never beside a free check (B1). */
export function dockActions(la: LegalActions | null | undefined, street: Street): DockAction[] {
  if (!la) return []
  const out: DockAction[] = []
  if (la.can_fold && !la.can_check) out.push({ kind: 'fold' })
  if (la.can_check) out.push({ kind: 'check' })
  if (la.can_call) out.push({ kind: 'call', amount: la.call_amount })
  if (canAggress(la)) {
    if (la.min_raise_to === la.max_raise_to) out.push({ kind: 'allin', type: aggroType(la), amount: la.max_raise_to })
    else out.push({ kind: 'size', verb: aggroVerb(la, street) })
  }
  return out
}

export interface Preset {
  /** Shown on the button. */
  label: string
  /** Its accessible name. */
  name: string
  /** Pot fraction, or 'max' for all-in. */
  f: number | 'max'
}

export const PRESETS: readonly Preset[] = [
  { label: '⅓', name: 'One third pot', f: 1 / 3 },
  { label: '½', name: 'Half pot', f: 0.5 },
  { label: '¾', name: 'Three quarters pot', f: 0.75 },
  { label: 'Pot', name: 'Pot', f: 1 },
  { label: 'All-in', name: 'All-in', f: 'max' },
]

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** The street total a preset sizes to (pot-raise formula), clamped to the legal range. */
export function presetAmount(la: LegalActions, pot: number, heroBet: number, f: number | 'max'): number {
  if (!canAggress(la)) return 0
  if (f === 'max') return la.max_raise_to
  const level = la.call_amount + heroBet
  return clamp(Math.round(level + f * (pot + la.call_amount)), la.min_raise_to, la.max_raise_to)
}

/** Where each pot preset falls on the slider, 0..100 (the ticks under the track). */
export function presetTicks(la: LegalActions, pot: number, heroBet: number): number[] {
  if (!canAggress(la)) return []
  const span = Math.max(1, la.max_raise_to - la.min_raise_to)
  return PRESETS.filter((p) => p.f !== 'max').map((p) => ((presetAmount(la, pot, heroBet, p.f) - la.min_raise_to) / span) * 100)
}

/** The preset an amount matches, if any (so a typed or dragged amount lights its preset). */
export function presetIndexFor(la: LegalActions, pot: number, heroBet: number, amount: number): number | null {
  if (!canAggress(la)) return null
  for (let i = 0; i < PRESETS.length; i++) if (presetAmount(la, pot, heroBet, PRESETS[i].f) === amount) return i
  return null
}

/** The slider's fill (0..100) for an amount. */
export function amountFill(amount: number, min: number, max: number): number {
  return max > min ? ((clamp(amount, min, max) - min) / (max - min)) * 100 : 100
}

/** The action a dock button submits. */
export function submitOf(a: DockAction): { type: ActionType; toAmount?: number } | null {
  switch (a.kind) {
    case 'fold':
      return { type: 'fold' }
    case 'check':
      return { type: 'check' }
    case 'call':
      return { type: 'call' }
    case 'allin':
      return { type: a.type, toAmount: a.amount }
    default:
      return null
  }
}
