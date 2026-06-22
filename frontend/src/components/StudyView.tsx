// The Study panel: a candid, scannable reference built from STRATEGY.md. These
// ranges are a solid 100bb 6-max baseline, NOT solver truth — exact frequencies
// and mixing always defer to GTO Wizard (mirrors the project's honesty rules).

const RFI: Array<[string, string, string]> = [
  ['UTG', '~15%', '22+, ATs+, A5s, A4s, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo'],
  ['MP / HJ', '~19%', '22+, A9s+, A5s–A2s, KTs+, QTs+, J9s+, T9s, 98s, ATo+, KJo+'],
  ['CO', '~27%', '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo'],
  ['BTN', '~45%', '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K9o+, Q9o+, J9o+, T9o, 98o'],
  ['SB', '~38% (3bb)', '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, A2o+, K9o+, QTo+, JTo'],
  ['BB', 'defense', 'No RFI — defend vs opens: wide vs BTN/CO/SB, tighter vs UTG/MP; mix flats with a polarized 3-bet.'],
]

const FRAMEWORK: Array<[string, string]> = [
  ['Strong made hand', 'Top pair good kicker+, two pair, sets, straights, flushes — bet for value ½–¾ pot, keep betting, size up with the nuts.'],
  ['Draw', 'Flush draw / open-ended / strong combo draws — semi-bluff ½–⅔ pot, or call if the price is right. Give up if you miss with no fold equity.'],
  ['Air', 'No pair, no draw — as the preflop raiser c-bet once (⅓–½) on good boards, then give up if called. Not the aggressor → check-fold.'],
  ['Facing a bet', 'Raise monsters; call one street with marginal made hands; fold to sustained aggression with weak holdings; with draws, compare equity to the price.'],
]

const DRAWS: Array<[string, string, string, string]> = [
  ['Flush draw', '9', '19%', '35%'],
  ['Open-ender', '8', '17%', '31%'],
  ['Gutshot', '4', '9%', '17%'],
  ['Combo (FD+OESD)', '~15', '—', 'favorite'],
]

const ARCHETYPES: Array<{ name: string; stats: string; identity: string; beat: string }> = [
  {
    name: 'Nit',
    stats: 'VPIP 10–15 · PFR 8–12 · 3-bet 1–3 · AF 1–2',
    identity: 'Premiums only, folds constantly.',
    beat: 'Steal relentlessly and fold to its aggression — when a nit puts in money, believe it. Don’t pay off the rare big bet.',
  },
  {
    name: 'TAG',
    stats: 'VPIP 20–24 · PFR 17–21 · 3-bet 6–9 · AF 2.5–3.5',
    identity: 'Solid, balanced — the §2 baseline, the benchmark.',
    beat: 'No free lunch. Play solid, avoid marginal spots out of position, and pick your bluffs where your range is credible.',
  },
  {
    name: 'LAG',
    stats: 'VPIP 27–33 · PFR 22–28 · 3-bet 9–13 · AF 3–4.5',
    identity: 'Wide + aggressive, narrow VPIP–PFR gap; hard to read.',
    beat: 'Tighten up and let it barrel into your strong range; call down lighter than vs a nit, and 3-bet to deny its position.',
  },
  {
    name: 'Calling Station',
    stats: 'VPIP 40–55 · PFR 6–13 · 3-bet 1–3 · AF <1.5',
    identity: 'Passive fish — calls everything, never folds to value, almost never bluffs.',
    beat: 'Value bet relentlessly and thin; never bluff (it won’t fold). If it suddenly raises, it has it — fold your bluff-catchers.',
  },
  {
    name: 'Maniac',
    stats: 'VPIP 50–65 · PFR 38–50 · 3-bet 14–22 · AF >4',
    identity: 'Aggressive spew — raises/bluffs constantly, barrels air.',
    beat: 'Punish with value, not bluffs. Let it bet into you, trap with strong hands, and call down wider — don’t try to out-bluff it.',
  },
]

const STATS: Array<[string, string, string]> = [
  ['VPIP', '22–26', 'Voluntarily put money in preflop. The VPIP–PFR gap shows passivity.'],
  ['PFR', '18–22', 'Raised preflop. Small gap to VPIP = aggressive/competent.'],
  ['3-bet%', '7–10', 'Re-raised preflop.'],
  ['ATS', '30–40', 'Attempt to steal (open CO/BTN/SB when folded to).'],
  ['AF', '~3', '(bets + raises) ÷ calls postflop. ≫3 maniac, ≪3 too passive.'],
  ['WTSD', '25–30', 'Went to showdown.'],
  ['WSD', '52–58', 'Won at showdown.'],
  ['WWSF', '48–54', 'Won when saw the flop.'],
  ['C-bet%', '55–70', 'Continuation-bet the flop as preflop raiser (board-dependent).'],
]

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-bg2/60 p-5">
      <h3 className="mb-3 font-display text-lg text-ink">{title}</h3>
      {children}
    </section>
  )
}

export function StudyView() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <div>
        <h2 className="font-display text-2xl text-ink">Study</h2>
        <p className="mt-1 text-sm text-muted">
          A solid 100bb 6-max baseline (from STRATEGY.md). These are a <em>standard starting point</em>,
          not solver truth — real GTO mixes frequencies. For exact ranges and mixing,{' '}
          <a
            href="https://gtowizard.com"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-4 hover:underline"
          >
            confirm in GTO Wizard
          </a>
          .
        </p>
      </div>

      <Card title="Preflop — Raise First In (folded to you)">
        <div className="space-y-2">
          {RFI.map(([pos, pct, range]) => (
            <div key={pos} className="grid grid-cols-[64px_64px_1fr] items-baseline gap-2 text-sm">
              <span className="font-semibold text-ink">{pos}</span>
              <span className="tabular-nums text-accent">{pct}</span>
              <span className="text-muted">{range}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t border-line/60 pt-3 text-sm text-muted">
          <p><span className="text-ink">3-bet value:</span> QQ+, AK always; add JJ, AQs vs CO/BTN/SB. <span className="text-ink">Bluff:</span> A5s–A4s, suited blockers.</p>
          <p><span className="text-ink">Flat (in position):</span> 99–22 set-mining, suited broadways/connectors when cheap. OOP → lean 3-bet-or-fold.</p>
          <p><span className="text-ink">Facing a 3-bet:</span> 4-bet QQ+/AK; call JJ–TT, AQs by price &amp; opponent. Don’t stack off light preflop.</p>
        </div>
      </Card>

      <Card title="Postflop — the decision framework">
        <div className="space-y-2.5">
          {FRAMEWORK.map(([k, v]) => (
            <div key={k} className="text-sm">
              <span className="font-semibold text-ink">{k}. </span>
              <span className="text-muted">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Pot odds &amp; equity (computed exactly)">
          <ul className="space-y-2 text-sm text-muted">
            <li><span className="text-ink">Price to call:</span> call ÷ (pot-after-bet + call). E.g. pot 24 after a 10 bet, call 10 → 10/34 = <span className="tabular-nums text-accent">29%</span> needed.</li>
            <li><span className="text-ink">Rule of 2 &amp; 4:</span> one card ≈ outs×2%; two cards all-in ≈ outs×4%. Otherwise count one card at a time.</li>
            <li><span className="text-ink">Call if equity &gt; price.</span> The coach uses Monte Carlo equity vs the modelled range, not just outs.</li>
            <li><span className="text-ink">Dirty outs:</span> an out that also helps villain isn’t clean — discount it.</li>
          </ul>
        </Card>
        <Card title="Common draws (outs → equity)">
          <div className="grid grid-cols-[1fr_44px_56px_64px] gap-x-2 gap-y-1.5 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-muted">Draw</span>
            <span className="text-[11px] uppercase tracking-wider text-muted">Outs</span>
            <span className="text-[11px] uppercase tracking-wider text-muted">1 card</span>
            <span className="text-[11px] uppercase tracking-wider text-muted">2 cards</span>
            {DRAWS.map(([d, o, a, b]) => (
              <Row key={d} cells={[d, o, a, b]} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Sizing: c-bet ⅓–½ · value/semi-bluff ½–¾ · nutted ¾–pot · check-raise ~3×.
          </p>
        </Card>
      </div>

      <Card title="The five archetypes — and how to beat each">
        <div className="space-y-3">
          {ARCHETYPES.map((a) => (
            <div key={a.name} className="rounded-lg border border-line/60 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-display text-base text-ink">{a.name}</span>
                <span className="text-[11px] tabular-nums text-muted">{a.stats}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{a.identity}</p>
              <p className="mt-1 text-sm">
                <span className="text-[11px] uppercase tracking-wider text-accent/80">Exploit · </span>
                <span className="text-ink">{a.beat}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Exploits are heuristic reads (general poker knowledge), not solver lines. The fish play badly
          on purpose — that’s the point.
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Stat definitions (reg targets)">
          <div className="space-y-1.5 text-sm">
            {STATS.map(([k, t, d]) => (
              <div key={k} className="flex items-baseline gap-2">
                <span className="w-16 shrink-0 font-semibold text-ink">{k}</span>
                <span className="w-14 shrink-0 tabular-nums text-accent">{t}</span>
                <span className="text-muted">{d}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Sample size: VPIP/PFR ~100+ hands, 3-bet ~500, turn stats ~1,000+. Don’t over-read small samples.
          </p>
        </Card>
        <Card title="Bankroll · variance · tilt">
          <ul className="space-y-2 text-sm text-muted">
            <li><span className="text-ink">Bankroll:</span> ≥20 buy-ins for your stake; move down when you drop below.</li>
            <li><span className="text-ink">Stop-loss:</span> a fixed per-session limit (e.g. 3 buy-ins) → stop, don’t reload.</li>
            <li><span className="text-ink">Variance is real:</span> judge decisions, not results. A good line that lost is still correct; a spew that won is still a spew.</li>
            <li><span className="text-ink">Tilt:</span> watch for chasing losses and playing too long — volume isn’t virtue.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Row({ cells }: { cells: string[] }) {
  return (
    <>
      <span className="text-ink">{cells[0]}</span>
      <span className="tabular-nums text-muted">{cells[1]}</span>
      <span className="tabular-nums text-muted">{cells[2]}</span>
      <span className="tabular-nums text-muted">{cells[3]}</span>
    </>
  )
}
