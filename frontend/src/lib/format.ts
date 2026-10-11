// Number formatting shared by every view. Chips are integers; only bb/100 has decimals.
// Negative numbers use the true minus sign (U+2212), which matches the plus sign's width
// in tabular figures.

const MINUS = '−'
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 1168 -> "1,168". Rounds to an integer (chips are integers). */
export function chips(n: number): string {
  const s = nf.format(Math.abs(Math.round(n)))
  return n < 0 && Math.round(n) !== 0 ? MINUS + s : s
}

/** +14, −191, 0 (no sign on zero). */
export function signedChips(n: number): string {
  const r = Math.round(n)
  if (r === 0) return '0'
  return (r > 0 ? '+' : MINUS) + nf.format(Math.abs(r))
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
