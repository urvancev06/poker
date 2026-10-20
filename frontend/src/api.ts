// Typed client for the Poker backend API (poker.api.app). Types mirror the
// serializers in backend/poker/api/serializers.py and coach.as_dict().
// Every failure throws an ApiError (lib/apiError.ts) carrying the HTTP status, a code and
// the backend's readable detail; a network failure has status null and code 'network'.

import { errorFromResponse, toApiError, ApiError } from './lib/apiError'

export { ApiError }

export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export interface LegalActions {
  can_fold: boolean
  can_check: boolean
  can_call: boolean
  call_amount: number
  can_bet: boolean
  can_raise: boolean
  min_raise_to: number | null
  max_raise_to: number | null
}

export interface Seat {
  seat: number
  position: string
  stack: number
  bet: number
  folded: boolean
  all_in: boolean
  is_actor: boolean
  hole_cards: string[] | null
  hand_label: string | null // made-hand label when cards are visible (hero always; villains at showdown)
}

export interface ActionLogEntry {
  seat: number
  position: string
  street: string
  action: ActionType
  to_amount: number | null
  // From the engine ledger (absent on records from before it): chips this action put in,
  // the seat's bet on the street after it, whether it put the seat all-in, and the stack left.
  added?: number
  street_total?: number
  all_in?: boolean
  stack_after?: number
}

/** Facts for the player to act, computed by the engine before the action. */
export interface DecisionFacts {
  seat: number
  street: string
  to_call: number
  pot: number
  /** What a call can win: the caller's chips plus each opponent's, up to the caller's total. */
  winnable_if_call: number
  to_act_after_call: number
  closes_on_call: boolean
  betting_over_after_call: boolean
  can_respond_to_raise: number
}

/** The chips in the middle, per seat; unlike `pot` it survives the end of the hand. */
export interface LedgerSummary {
  contributed: number[]
  pot: number
  rake: number
}

/** A pot layer. At hand end every amount is 0, and mid-hand it excludes this street's
 * bets and is [] preflop (B13): it cannot drive a side-pot display on its own. */
export interface PotLayer {
  amount: number
  eligible_seats: number[]
}

export interface GameStateDict {
  table_size: number
  button: number
  blinds: [number, number]
  /** Goes stale after an all-in runout (B12): derive the street from board.length. */
  street: string
  board: string[]
  pot: number
  pots?: PotLayer[]
  actor: number | null
  is_over: boolean
  seats: Seat[]
  legal_actions: LegalActions | null
  results: number[] | null
  history: ActionLogEntry[]
  ledger?: LedgerSummary
  facts?: DecisionFacts | null
}

export interface HandResult {
  session_id: string
  hand_index: number
  hero_seat: number
  hero_position: string
  hero_cards: string
  board: string
  pot: number
  hero_net: number
  went_to_showdown: boolean
  results_by_player: Record<string, number>
  actions: Array<Record<string, unknown>>
  lineup: string[]
  button_player?: number
  blinds?: [number, number]
  start_stacks?: number[]
  /** Hole cards actually shown at showdown, keyed by seat ("JdQc"). Empty when nobody showed (B3). */
  shown_cards?: Record<string, string>
  hero_decision_ms?: number[]
  hero_summary?: Record<string, unknown>
}

export interface SessionState {
  session_id: string
  hand_index: number
  hand_over: boolean
  hero_seat: number
  hero_to_act: boolean
  stacks_by_player: number[]
  archetypes: string[]
  seat_to_player: number[]
  button_player: number
  state: GameStateDict
  last_result: HandResult | null
}

export interface VillainModel {
  seat: number
  archetype: string
  combos: number
  description: string // action-conditioned read, e.g. "TAG, barreled turn → ~top 9%"
  bluff_pct: number // air share of this villain's range (the bluff-catch threshold)
}

export interface Coaching {
  hand_label: string
  made_tier: string
  draws: string[]
  equity_pct: number
  realized_equity_pct: number
  realization_pct: number
  win_pct: number
  tie_pct: number
  lose_pct: number
  to_call: number
  pot: number
  required_equity_pct: number | null // implied/reverse-adjusted (the decision price)
  required_direct_pct: number | null // raw pot-odds price, before implied adjustment
  implied_note: string // why the price moved (set value / draw / reverse), or ""
  pot_odds: string | null
  call_ev: number | null
  in_position: boolean
  action_closed: boolean
  players_behind: number
  villains: VillainModel[]
  verdict: string
  rationale: string
  tone: 'good' | 'neutral' | 'close' | 'fold'
  basis: string[]
  /** What a call can win (side pots cap it); absent when the spot has no engine facts. */
  winnable?: number | null
  /** Amounts above are chips at this level; the UI shows big blinds. */
  big_blind?: number
  /** Nobody acts after a call (the betting may still go on to a later street). */
  closes_on_call?: boolean | null
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    })
  } catch (e) {
    throw toApiError(e, path, API_BASE)
  }
  if (!res.ok) throw await errorFromResponse(res, path)
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError({ status: res.status, code: 'bad_response', detail: 'The response was not valid JSON.', path })
  }
}

export interface CreateSessionBody {
  villains?: string[]
  small_blind?: number
  big_blind?: number
  buy_in?: number
  seed?: number | null
  auto_advance?: boolean
}

export interface BotRead {
  hands: number
  min_hands: number
  ready: boolean
  // Each may be null: "no sample yet" for that denominator, not zero.
  stats: {
    vpip: number | null
    pfr: number | null
    threebet: number | null
    af: number | null
    wtsd: number | null
  } | null
}
export type Reads = Record<string, BotRead>

export interface HeroStatLine {
  hands: number
  // null means "no sample" (empty denominator), NOT zero. Render it as "—".
  vpip: number | null
  pfr: number | null
  threebet: number | null
  ats: number | null
  fold_to_steal?: number | null
  af: number | null
  wtsd: number | null
  wsd: number | null
  wwsf: number | null
  cbet: number | null
  net_bb_per_100: number
}
export interface DecisionTime {
  median_s: number | null
  n: number
}

export interface StatsWindow {
  last: number | null
  session_id: string | null
  hands: number
  big_blind?: number
  hands_at_this_blind?: number
  /** Distinct [small, big] blind levels in the window; bb/100 counts each hand in its own. */
  blind_levels?: Array<[number, number]>
}

export interface MyStats {
  window?: StatsWindow
  decision_time?: DecisionTime
  overall: HeroStatLine
  trend: HeroStatLine[]
  targets: Record<string, [number, number]>
}

export interface HandSummary {
  id: number
  created_at: string | null
  session_id: string
  hand_index: number
  hero_position: string
  hero_cards: string
  board: string
  pot: number
  hero_net: number
  went_to_showdown: boolean
  /** The hand's own big blind (old rows: 2). `pot` and `hero_net` are chips at it. */
  big_blind?: number
}

/** GET /hands/{id}: the summary plus the stored hand. History reads `shown_cards`, `lineup`,
 * `actions` (seat and player per action), `start_stacks` (by seat), `blinds` and
 * `results_by_player` from it: /review leaves them out (B19). */
export interface HandRecord extends HandSummary {
  data: Partial<HandResult>
}

export interface Leak {
  type: string
  note: string
  street?: string
  hand_index?: number
}
export interface ReviewDecision {
  street: string
  board: string[]
  pot: number
  to_call: number
  action: string
  to_amount: number | null
  hand_label: string
  equity_pct: number | null
  required_pct: number | null
  realized_pct?: number | null
  required_direct_pct?: number | null
  /** What a call could win (side pots cap it); absent on hands from before the ledger. */
  winnable?: number | null
  leaks: Leak[]
}
export interface ReviewStreet {
  street: string
  board: string[]
  actions: Array<{ player: number; position: string; action: string; to_amount: number | null; is_hero: boolean }>
}
export interface HandReview {
  hand_index: number
  big_blind?: number
  hero_cards: string[] | null
  board: string[]
  hero_net: number
  went_to_showdown: boolean
  streets: ReviewStreet[]
  decisions: ReviewDecision[]
  leaks: Leak[]
}
export interface LeakSummary {
  hands_reviewed: number
  by_type: Array<{ type: string; count: number }>
  examples: Leak[]
}

// --- Bot lab (offline archetype tuning) + the CFR trainer ---
export interface LabKnob {
  key: string
  label: string
  min: number
  max: number
  step: number
}
export interface LabArchetype {
  key: string
  name: string
  targets: Record<string, [number, number] | null>
  knobs: Record<string, number>
}
export interface LabArchetypesInfo {
  archetypes: LabArchetype[]
  knob_meta: LabKnob[]
  default_lineup: string[]
  max_hands: number
  default_hands: number
}
export interface LabStatCell {
  value: number | null
  band: [number, number] | null
  ok: boolean | null
}
export interface LabRow {
  archetype: string
  hands: number
  net_bb_per_100: number
  stats: Record<string, LabStatCell>
}
export interface LabResult {
  hands: number
  seed: number
  lineup: string[]
  overrides: Record<string, Record<string, number>>
  gate_pass: boolean
  rows: LabRow[]
  elapsed_ms: number
}
export interface LabSimulateBody {
  lineup: string[]
  hands: number
  seed?: number
  overrides?: Record<string, Record<string, number>>
}

/** A background Lab run (POST /lab/jobs). */
export interface LabJobBody extends LabSimulateBody {
  kind: 'simulate'
}
export type LabJobState = 'queued' | 'running' | 'done' | 'cancelled' | 'failed'
export interface LabJob {
  job_id: string
  kind: string
  state: LabJobState
  progress: { done: number; total: number }
  result: LabResult | null
  error: string | null
  created_at: string
  elapsed_ms: number
}

export interface CfrStrategyRow {
  infoset: string
  card: string
  history: string
  label: string
  pass: number
  bet: number
}
export interface CfrCheckpoint {
  iterations: number
  game_value: number
  exploitability: number
}
export interface CfrResult {
  iterations: number
  game_value: number
  equilibrium_value: number
  exploitability: number
  trend: CfrCheckpoint[]
  strategy: CfrStrategyRow[]
}

export const api = {
  createSession: (body: CreateSessionBody = {}) =>
    req<SessionState>('/session', { method: 'POST', body: JSON.stringify(body) }),
  getState: (id: string) => req<SessionState>(`/session/${id}`),
  submitAction: (id: string, type: ActionType, toAmount?: number, decisionMs?: number) =>
    req<SessionState>(`/session/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        to_amount: toAmount ?? null,
        decision_ms: decisionMs ?? null,
      }),
    }),
  advance: (id: string) => req<SessionState>(`/session/${id}/advance`, { method: 'POST' }),
  nextHand: (id: string) =>
    req<SessionState>(`/session/${id}/next-hand`, { method: 'POST' }),
  coach: (id: string) => req<Coaching>(`/session/${id}/coach`),
  reads: (id: string) => req<Reads>(`/session/${id}/reads`),
  myStats: (sessionId?: string, last?: number) => {
    const q = new URLSearchParams()
    if (sessionId) q.set('session_id', sessionId)
    if (last) q.set('last', String(last))
    const qs = q.toString()
    return req<MyStats>(`/stats/me${qs ? `?${qs}` : ''}`)
  },
  listHands: (sessionId?: string, limit = 50) =>
    req<HandSummary[]>(`/hands?limit=${limit}${sessionId ? `&session_id=${sessionId}` : ''}`),
  handReview: (id: number) => req<HandReview>(`/hands/${id}/review`),
  handDetail: (id: number) => req<HandRecord>(`/hands/${id}`),
  leaks: (sessionId?: string, limit?: number) => {
    const q = new URLSearchParams()
    if (sessionId) q.set('session_id', sessionId)
    if (limit) q.set('limit', String(limit))
    const qs = q.toString()
    return req<LeakSummary>(`/stats/leaks${qs ? `?${qs}` : ''}`)
  },
  labArchetypes: () => req<LabArchetypesInfo>('/lab/archetypes'),
  labSimulate: (body: LabSimulateBody) =>
    req<LabResult>('/lab/simulate', { method: 'POST', body: JSON.stringify(body) }),
  labJobCreate: (body: LabJobBody, init?: RequestInit) =>
    req<{ job_id: string; state: LabJobState }>('/lab/jobs', { method: 'POST', body: JSON.stringify(body), ...init }),
  labJobGet: (id: string, init?: RequestInit) => req<LabJob>(`/lab/jobs/${id}`, init),
  labJobCancel: (id: string) => req<{ job_id: string; state: LabJobState }>(`/lab/jobs/${id}`, { method: 'DELETE' }),
  cfr: (iterations: number, seed = 0) =>
    req<CfrResult>('/lab/cfr', { method: 'POST', body: JSON.stringify({ iterations, seed }) }),
}
