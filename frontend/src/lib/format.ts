// Number formatting shared by every view.
//
// Every chip amount is shown in big blinds (decision 1): `bb(chips, bigBlind)`. Chips are
// integers and the blinds are 1/2 (old hands) or 5/10 (new ones), so one decimal is always
// exact: 25 at 10 -> "2.5", 1000 -> "100". The unit "bb" is written in prose and controls
// (`{ unit: true }`); on the felt the number stands alone and its accessible text says
// "big blinds" (`bbSpeech`). Typed sizes are read back with `parseBB`.
//
// Negative numbers use the true minus sign (U+2212), which matches the plus sign's width
// in tabular figures.

const MINUS = '−'
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** Every hand stored before the 5/10 chip unit was at 1/2. */
export const LEGACY_BIG_BLIND = 2

function validBigBlind(b: unknown): b is number {
  return typeof b === 'number' && Number.isFinite(b) && b > 0
}

/** A payload's big blind: `blinds[1]`, else `big_blind`, else the legacy 2. */
export function bigBlindOf(x: { blinds?: readonly number[] | null } | { big_blind?: number | null } | null | undefined): number {
  if (x && 'blinds' in x && Array.isArray(x.blinds) && validBigBlind(x.blinds[1])) return x.blinds[1]
  if (x && 'big_blind' in x && validBigBlind(x.big_blind)) return x.big_blind
  return LEGACY_BIG_BLIND
}

/** Chips in big blinds, rounded to one decimal; null when it rounds to zero. */
function inBB(chipsAmount: number, bigBlind: number): number {
  const b = validBigBlind(bigBlind) ? bigBlind : LEGACY_BIG_BLIND
  const v = Math.round((chipsAmount / b) * 10) / 10
  return Object.is(v, -0) ? 0 : v
}

/**
 * Chips as big blinds: bb(25, 10) -> "2.5", bb(1000, 10) -> "100", bb(12345, 10) -> "1,234.5".
 * `unit` appends " bb"; `sign` adds "+" to a positive amount (a result). Zero is "0".
 */
export function bb(chipsAmount: number, bigBlind: number, opts: { unit?: boolean; sign?: boolean } = {}): string {
  const v = inBB(chipsAmount, bigBlind)
  const body = nf1.format(Math.abs(v))
  const sign = v < 0 ? MINUS : opts.sign && v > 0 ? '+' : ''
  return `${sign}${body}${opts.unit ? ' bb' : ''}`
}

/** Big blinds in words, for screen readers: "2.5 big blinds", "1 big blind". */
export function bbSpeech(chipsAmount: number, bigBlind: number): string {
  const v = inBB(chipsAmount, bigBlind)
  const n = nf1.format(Math.abs(v))
  return `${v < 0 ? 'minus ' : ''}${n} ${Math.abs(v) === 1 ? 'big blind' : 'big blinds'}`
}

/**
 * A typed size in big blinds, as chips: "7.5", "7,5" (a comma before one or two final digits
 * is a decimal point; any other comma separates thousands), an optional "bb" and spaces.
 * Rounds to the nearest chip and clamps to [minChips, maxChips]. Null for input with no
 * number in it, so the caller keeps the amount it had.
 */
export function parseBB(text: string, bigBlind: number, minChips: number, maxChips: number): number | null {
  let s = text.trim().toLowerCase().replace(/\s*bb$/, '').trim()
  if (!s) return null
  s = /^\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const b = validBigBlind(bigBlind) ? bigBlind : LEGACY_BIG_BLIND
  const chipsAmount = Math.round(Number(s) * b)
  return Math.min(maxChips, Math.max(minChips, chipsAmount))
}

/** A whole number that is not a chip amount (hands, combos, leak counts): 2766 -> "2,766". */
export function count(n: number): string {
  return nf.format(Math.round(n))
}

/** A fixed-precision signed number: signed(8, 1) -> "+8.0", signed(-1, 1) -> "−1.0". */
export function signed(n: number, digits = 1): string {
  const s = Math.abs(n).toFixed(digits)
  if (Number(s) === 0) return (0).toFixed(digits)
  return (n > 0 ? '+' : MINUS) + s
}

/** A percentage at the given precision: pct(39.04) -> "39%", pct(22.2, 1) -> "22.2%". */
export function pct(n: number | null | undefined, digits = 0, empty = '—'): string {
  if (n == null || !Number.isFinite(n)) return empty
  return `${n.toFixed(digits)}%`
}
