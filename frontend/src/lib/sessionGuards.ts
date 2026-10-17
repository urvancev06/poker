// The table session's bookkeeping rules, kept out of React so they can be tested (the
// hook, lib/useTableSession.ts, only wires them to effects and requests). Pure.
//
//   DecisionClock  how long each hero decision took (decision_ms): one clock per decision,
//                  keyed by the decision itself, so two hero decisions in a row (you call
//                  and are first to act on the next street) each get their own time (F1)
//   Generation     which game a response belongs to: New game starts a new generation and
//                  every request started before it is dropped when it lands (C1)

/** Times hero decisions. Feed it the decision on screen; read it when the hero acts. */
export class DecisionClock {
  private key: string | null = null
  private start: number | null = null

  /** The decision on screen (null: not the hero's turn). A new key starts the clock at
   * `now`; the same key keeps it running; null stops it. Safe to call on every change. */
  sync(key: string | null, now: number): void {
    if (key === this.key) return
    this.key = key
    this.start = key === null ? null : now
  }

  /** The hero acts: the ms since the decision began (undefined when unknown). The clock
   * stops; the next decision starts a new one. Keep the result to `restore` it. */
  take(now: number): { elapsedMs: number | undefined; key: string | null; started: number | null } {
    const started = this.start
    this.start = null
    return { elapsedMs: started === null ? undefined : Math.round(now - started), key: this.key, started }
  }

  /** The action was rejected: it is still the same decision, so the clock keeps running
   * from when the turn began (B23). Ignored once another decision is on screen. */
  restore(taken: { key: string | null; started: number | null }, now: number): void {
    if (taken.key !== this.key || this.key === null || this.start !== null) return
    this.start = taken.started ?? now
  }
}

/** A counter of games: a response is applied only if no New game came since it was asked. */
export class Generation {
  private n = 0

  /** A new game: every check handed out before now turns false. */
  bump(): void {
    this.n++
  }

  /** A check to run when the response lands: true while the game it was asked in is current. */
  current(): () => boolean {
    const n = this.n
    return () => n === this.n
  }
}
