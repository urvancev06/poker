// How an equity figure was computed (phase 2): the coach and the review send `equity_method`
//   exact          every runout counted, heads-up and two-way after the flop
//   sampled        seeded joint sampling (three or more villains, or preflop multiway), with
//                  `equity_se_pct`, one standard error in percentage points
//   preflop_table  heads-up preflop, read from the precomputed table (about ±0.4 pp)
// The words here are shared by the maths sheet, the glance and History. A sampled figure
// states its 95% margin, 1.96 standard errors, to 0.1 pp. Older answers carry no method and
// get no words.

export type EquityMethod = 'exact' | 'sampled' | 'preflop_table'

export interface EquityMethodFields {
  equity_method?: string | null
  equity_se_pct?: number | null
}

function known(m: string | null | undefined): m is EquityMethod {
  return m === 'exact' || m === 'sampled' || m === 'preflop_table'
}

/** A sampled figure's 95% margin in points (1.96 standard errors, to 0.1), else null. */
export function equityMargin(f: EquityMethodFields): number | null {
  if (f.equity_method !== 'sampled' || f.equity_se_pct == null || !Number.isFinite(f.equity_se_pct)) return null
  const m = Math.round(f.equity_se_pct * 1.96 * 10) / 10
  return m > 0 ? m : null
}

/** The method in a few words: "Every runout counted", "Sampled ±0.4 pp", "From the preflop
 *  table"; null for an answer without a method. */
export function equityMethodNote(f: EquityMethodFields): string | null {
  if (!known(f.equity_method)) return null
  if (f.equity_method === 'exact') return 'Every runout counted'
  if (f.equity_method === 'preflop_table') return 'From the preflop table'
  const m = equityMargin(f)
  return m != null ? `Sampled ±${m.toFixed(1)} pp` : 'Sampled'
}

/** A tag for under an equity figure: "Exact", "±0.4 pp", "Sampled" or "Table". */
export function equityMethodTag(f: EquityMethodFields): string | null {
  if (!known(f.equity_method)) return null
  if (f.equity_method === 'exact') return 'Exact'
  if (f.equity_method === 'preflop_table') return 'Table'
  const m = equityMargin(f)
  return m != null ? `±${m.toFixed(1)} pp` : 'Sampled'
}

/** The method for a screen reader, lower case to follow a figure: "every runout counted",
 *  "sampled, plus or minus 1.0 points", "from the preflop table"; null without a method. */
export function equityMethodSpoken(f: EquityMethodFields): string | null {
  if (!known(f.equity_method)) return null
  if (f.equity_method === 'exact') return 'every runout counted'
  if (f.equity_method === 'preflop_table') return 'from the preflop table'
  const m = equityMargin(f)
  return m != null ? `sampled, plus or minus ${m.toFixed(1)} points` : 'sampled'
}

/** The maths sheet's chip beside the headline bar. Beside raw equity it is the tag; beside
 *  realized equity (an estimate made from it) it says it is the equity's method: "Exact
 *  equity", "Table equity", "Equity ±0.4 pp". */
export function equityMethodChip(f: EquityMethodFields, beside: 'Equity' | 'Realized'): string | null {
  const tag = equityMethodTag(f)
  if (!tag || beside === 'Equity') return tag
  if (f.equity_method === 'sampled') return tag === 'Sampled' ? 'Sampled equity' : `Equity ${tag}`
  return `${tag} equity`
}
