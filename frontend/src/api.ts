// Typed client for the Poker backend API (poker.api.app). Types mirror the
// serializers in backend/poker/api/serializers.py and coach.as_dict().

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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
}

export interface GameStateDict {
  table_size: number
  button: number
  blinds: [number, number]
  street: string
  board: string[]
  pot: number
  actor: number | null
  is_over: boolean
  seats: Seat[]
  legal_actions: LegalActions | null
  results: number[] | null
  history: ActionLogEntry[]
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
  basis: string[]
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error((detail as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
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
  stats: { vpip: number; pfr: number; threebet: number; af: number | null; wtsd: number } | null
}
export type Reads = Record<string, BotRead>

export interface HeroStatLine {
  hands: number
  vpip: number
  pfr: number
  threebet: number
  ats: number
  af: number | null
  wtsd: number
  wsd: number
  wwsf: number
  cbet: number
  net_bb_per_100: number
}
export interface MyStats {
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
  leaks: Leak[]
}
export interface ReviewStreet {
  street: string
  board: string[]
  actions: Array<{ player: number; position: string; action: string; to_amount: number | null; is_hero: boolean }>
}
export interface HandReview {
  hand_index: number
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

// --- Bot lab + learning (Phase 7) ---
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
  submitAction: (id: string, type: ActionType, toAmount?: number) =>
    req<SessionState>(`/session/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ type, to_amount: toAmount ?? null }),
    }),
  advance: (id: string) => req<SessionState>(`/session/${id}/advance`, { method: 'POST' }),
  nextHand: (id: string) =>
    req<SessionState>(`/session/${id}/next-hand`, { method: 'POST' }),
  coach: (id: string) => req<Coaching>(`/session/${id}/coach`),
  reads: (id: string) => req<Reads>(`/session/${id}/reads`),
  myStats: (sessionId?: string) =>
    req<MyStats>(`/stats/me${sessionId ? `?session_id=${sessionId}` : ''}`),
  listHands: (sessionId?: string, limit = 50) =>
    req<HandSummary[]>(`/hands?limit=${limit}${sessionId ? `&session_id=${sessionId}` : ''}`),
  handReview: (id: number) => req<HandReview>(`/hands/${id}/review`),
  leaks: (sessionId?: string) =>
    req<LeakSummary>(`/stats/leaks${sessionId ? `?session_id=${sessionId}` : ''}`),
  labArchetypes: () => req<LabArchetypesInfo>('/lab/archetypes'),
  labSimulate: (body: LabSimulateBody) =>
    req<LabResult>('/lab/simulate', { method: 'POST', body: JSON.stringify(body) }),
  cfr: (iterations: number, seed = 0) =>
    req<CfrResult>('/lab/cfr', { method: 'POST', body: JSON.stringify({ iterations, seed }) }),
}
