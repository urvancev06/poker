# STRATEGY.md — Poker Knowledge (source of truth)

This is the poker domain knowledge the app is built from. It feeds three things:
- **The bots** — their preflop ranges and postflop logic are seeded from §2–§3, then tuned to hit the archetype stat targets in §4.
- **The coach** — the math in §3 and the stat definitions in §5 are what it computes and explains.
- **My own progress** — the stat targets in §4–§5 are what my dashboard compares my play against.

> **Honesty rules (non-negotiable, mirror the project's):**
> - The ranges below are a **solid standard baseline**, not solver truth. Real GTO involves mixed frequencies (a hand raised 40% / folded 60%). **Do not present these as exact GTO.** For exact frequencies and mixing, the answer is always "confirm in GTO Wizard."
> - The coach **computes** concrete math (Monte Carlo equity, pot odds, EV) and shows its work. It never invents solver numbers.
> - Stat bands for archetypes are **descriptive player-type profiles** (general poker knowledge), not solver outputs.

---

## 1. The format this is built for

- **No-Limit Texas Hold'em, 6-max cash, 100bb effective, ~2.5bb opens** (3bb from the SB). Online-style.
- Positions, worst→best preflop: **UTG, MP (HJ), CO, BTN, SB, BB.**
- Everything assumes heads-up-to-the-flop decisions unless noted; multiway tightens ranges.

---

## 2. Preflop ranges (baseline)

A standard, slightly-conservative 100bb baseline — good for low/mid stakes where rake is real. **Seed the bots' "TAG" profile from these; widen/tighten per archetype (§4).** Notation: `A2s+` = all suited aces; `KTo+` = KTo, KJo, KQo; `22+` = all pairs.

### Raise First In (RFI) — folded to you
- **UTG (~15%):** `22+, ATs+, A5s, A4s, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo`
- **MP / HJ (~19%):** `22+, A9s+, A5s–A2s, KTs+, QTs+, J9s+, T9s, 98s, ATo+, KJo+`
- **CO (~27%):** `22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo`
- **BTN (~45%):** `22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K9o+, Q9o+, J9o+, T9o, 98o`
- **SB (~38%, raise-only baseline, 3bb):** `22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, A2o+, K9o+, QTo+, JTo`
  *(Advanced SB play mixes limps and raises — that's a solver topic, out of scope for the baseline.)*
- **BB:** no RFI — checks its option when folded to. BB strategy is **defense** (below).

### Facing a single raise (conceptual baseline — exact ranges → solver)
- **3-bet for value:** `QQ+, AK` always; add `JJ, AQs` vs CO/BTN/SB opens.
- **3-bet as a bluff:** a few blocker/playability hands, e.g. `A5s–A4s`, `KJs`-type suited hands.
- **Flat call (mostly in position):** `99–22` (set-mining), suited broadways, suited connectors when closing the action cheaply.
- **Out of position:** tighten — lean toward **3-bet-or-fold**, especially at higher rake.
- **Fold** everything else. When in doubt at low stakes, fold.

### Facing a 3-bet
- **4-bet for value:** `QQ+, AK` (mix `AKs` always, `AKo` often).
- **Call a 3-bet** with `JJ–TT, AQs` depending on price, position, and the 3-bettor.
- **Fold** the rest. Don't stack off light preflop.

### BB defense (vs an open)
- Defend **wide vs late opens** (BTN/CO/SB) because of price and position closing; defend **tighter vs UTG/MP**.
- Mix flat-calls with a polarized 3-betting range (value + suited blockers). 3-bet more vs SB opens (you'll have position).

---

## 3. Postflop logic + the math

### The decision framework (what the bots do, what the coach teaches)
1. **Strong made hand** (top pair good kicker+, two pair, sets, straights, flushes): **bet for value**, ½–¾ pot; keep betting on later streets; size up with the nuts.
2. **Draw** (flush draw, open-ended, strong combo draws): **semi-bluff** (½–⅔ pot) or call if the **price is right** (see pot odds). Give up if you miss and have no fold equity.
3. **Air** (no pair, no draw): as the preflop raiser, **c-bet once** (⅓–½ pot) on favorable boards, then give up if called; if you weren't the aggressor, **check-fold**.
4. **Facing a bet:** raise monsters; call one street with marginal made hands; fold to sustained aggression with weak holdings; with draws, **compare equity to the price**.

### Pot odds & equity (the coach computes these exactly)
- **Pot odds (price to call):** `call ÷ (pot_after_their_bet + call)`. Example: pot 24 after a 10 bet, calling 10 → `10 ÷ (24+10) = 29%` equity needed.
- **Outs → equity (rule of 2 and 4):** one card to come ≈ `outs × 2`%; **two cards to come, all-in only** ≈ `outs × 4`%. Otherwise count one card at a time (you'll pay again on the next street).
- **Common draws:** flush draw 9 outs ≈ 19% (1 card) / 35% (2); OESD 8 outs ≈ 17%/31%; gutshot 4 outs ≈ 9%/17%; combo (flush+straight) ~15 outs ≈ favorite.
- **Call if equity > price.** For real ranges, the bots/coach use **Monte Carlo equity** (hero vs the villain's modeled range), not just outs counting.
- **Clean vs dirty outs:** an out that also improves a likely villain hand isn't clean — discount it.

### Sizing baseline
- Preflop: open 2.5bb (3bb SB); 3-bet ~3× the open in position, ~4× OOP; 4-bet ~2.2–2.5× the 3-bet.
- Postflop: c-bet ⅓–½; value/semi-bluff ½–¾; nutted hands ¾–pot; check-raise ~3× the bet.

---

## 4. The five bot archetypes (profiles + stat targets)

Each archetype is a **parameter set** over the strategy in §2–§3. Tune the parameters until simulation (≥100k hands) lands the measured stats in these bands. Stat bands are grounded in current 6-max consensus; treat them as **targets to converge on**, then we refine together.

| Archetype | VPIP | PFR | 3-bet | AF | WTSD | Identity |
|---|---|---|---|---|---|---|
| **Nit** | 10–15 | 8–12 | 1–3 | 1–2 | 26–32 † | Premiums only. Folds constantly. Easy to steal from; when it raises, believe it. |
| **TAG** (reg) | 20–24 | 17–21 | 6–9 | 2.5–3.5 | 25–30 | Solid, balanced, the §2 baseline. The benchmark opponent. |
| **LAG** | 27–33 | 22–28 | 9–13 | 3–4.5 | ~30 | Wide + aggressive, narrow VPIP–PFR gap. Pressures relentlessly; hard to read. |
| **Calling Station** | 40–55 | 6–13 | 1–3 | <1.5 | 38–50 | Passive fish. Wide gap. Calls everything, never folds to value, almost never bluffs. |
| **Maniac** | 50–65 | 38–50 | 14–22 | >4 | varies | Aggressive spew. Raises/bluffs constantly, barrels air. Punish with value, not bluffs. |

> † **Nit WTSD is not "low" in aggregate — that was an over-literal reading.** A
> tight *passive* premium range structurally shows down at a reg-like rate (~30%):
> the few flops it sees are strong, so they reach showdown. The real nit tell is a
> **high WSD (~60%+)** — it only shows up with the goods — plus over-folding
> *specific* spots (rivers, steals). Verified by sweep: pushing WTSD below ~28
> forces VPIP or AF out of their defining bands, so the band reflects the
> achievable, behaviourally-correct model. WSD is reported as evidence but not
> hard-gated (a band fit to its own measurement isn't a gate).

**How the parameters differ (the levers to tune):**
- **Range width** — Nit ≈ top ~12%; TAG = §2 baseline; LAG widens opens/3-bets; Station calls a very wide range but rarely raises (low PFR despite high VPIP); Maniac raises a very wide range.
- **Aggression / barrel frequency** — Station ~never bets without a strong hand; Maniac bets/raises at the slightest opportunity, including pure air; TAG/LAG bet for value + balanced bluffs.
- **Bluff frequency** — Station ≈ 0; Nit ≈ low; TAG ≈ balanced; LAG/Maniac high.
- **Calldown / fold-to-bet** — Station folds far too little (pays off value); Nit folds too much; TAG ≈ correct; Maniac calls light *and* over-bluffs.
- **Steal / fold-to-steal** — Nit folds blinds constantly; Station defends too wide passively; LAG/Maniac steal often.

> The **point of the fish archetypes (Station, Maniac, and loose-passive play) is that they play badly on purpose** — realistic, beatable opponents are the whole reason to practice. Don't "fix" them into good players.

### Reads are earned, not given (opponent visibility modes)

Reading the opponent — *acquiring* the read from observed play — is itself a trained skill, not a given. The bots play **identically** in every mode; only what *I* can see about them changes. A per-table display setting (gates **display only** — never bot behaviour, never the coach's math):

- **Live** — no labels, no opponent stats. I build the read purely from observed actions, like a live table. The realistic target.
- **HUD** — opponent stats (VPIP/PFR/AF/3-bet…) show in the seat HUD, but **only after a minimum observed sample vs that specific bot** (~30 hands for a rough read, fuller by ~100). No archetype label — I read the numbers myself, like a real tracker.
- **Labeled** — the archetype name (Nit/TAG/LAG/Station/Maniac) shown upfront. Training wheels: drill the exploit fast while learning the counters.

Default **Labeled** for a new player; intended progression **Labeled → HUD → Live**. Labeled mode teaches the *exploit*; HUD/Live mode trains the *read*. (Implementation: display-gating in Phase 5; the mode toggle + per-bot observed-hand tracking that drives the HUD reveal in Phase 6 — no new phase.)

---

## 5. Stat definitions (for the dashboard + bot validation)

Computed from logged decisions. Healthy 6-max reg targets in brackets — these are also **my** targets for the progress dashboard.

- **VPIP** — % of hands you voluntarily put money in preflop. *[22–26]*
- **PFR** — % of hands you raise preflop. *[18–22]*. The VPIP–PFR gap shows passivity; a small gap = aggressive/competent, a wide gap = passive/fish.
- **3-bet%** — of the spots where you FACED an open, how often you re-raised. Denominator is 3-bet *opportunities* (~0.42/hand measured), **not hands** — `sim/stats.py` `threebet / threebet_opp`. *[7–10]*
- **ATS (attempt to steal)** — % you open CO/BTN/SB when folded to. *[30–40]*
- **AF (aggression factor)** — `(bets + raises) ÷ calls` postflop. ~3 is normal; ≫3 = maniac, ≪ = too passive.
- **WTSD** — of the flops you SAW, how often you reached showdown. Denominator is `saw_flop`, **not hands** — `sim/stats.py` `wtsd / saw_flop`. This is why it settles slowly: a tight player sees few flops. *[25–30]*
- **WSD** — % won at showdown. *[52–58]*
- **WWSF** — won when saw flop. *[~48–54]*
- **C-bet%** — % you continuation-bet the flop as preflop raiser. *[~55–70 depending on board]*
- **Fold to c-bet** — solid players ~55–60%; fish far lower.

**Sample-size reality (the coach must respect this):** VPIP/PFR need ~100+ hands to stabilize, 3-bet/fold-to-3-bet ~500, 4-bet/turn stats ~1,000+. Don't draw conclusions (about a bot or about me) from tiny samples.

---

## 6. Bankroll, variance, tilt (the coach enforces these honestly)

- **Bankroll:** cash games, **≥20 buy-ins** for your stake (more is safer); move down when you drop below; never play scared/over-rolled money.
- **Stop-loss:** a fixed per-session loss limit (e.g. 3 buy-ins) → stop, don't reload, come back another day.
- **Variance is real:** good play loses over meaningful stretches. **Judge decisions, not short-run results.** A profitable line that lost is still correct; a spew that won is still a spew. The coach says so plainly.
- **Tilt / chasing:** the coach flags results-oriented thinking, chasing losses, and playing too long, rather than cheerleading volume.

---

## 7. Where the coach defers

Exact preflop frequencies, exact mixed strategies, precise multi-street solver lines, and node-locked exploit solutions → **GTO Wizard**. The coach teaches the *why*, computes *concrete* math, and points there for exact ranges. A fabricated "GTO number" is worse than none.

## 8. Model — known limitations & tracked follow-ons (coach + bots)

The coach judges *realized equity vs an action-conditioned villain range* (the bots' bluff frequencies are measured, not assumed). Honest, named gaps to close:

- **Postflop made-hand defense is now strength-polarized and gate-green (DONE).** `bots/strategy.py` grades the calldown by `pair_strength`: top pair / overpairs defend via `strong_pair_defend` (~0.82), weak/medium pairs fold at `calldown_freq`. This killed the over-fold the 8k volume stress caught — strong-pair fold (folding top pair / AA) dropped **48–64% → ~14%** for the regs — while the 100k gate stays in band (defending more made hands lifts WTSD, so the regs' weak/medium calldown was tightened to compensate; the WTSD coupling is a real, respected constraint). *Aggregate* one-pair-fold / fold-to-c-bet stay ~55% / ~68%: that's correct weak-pair and air folds, not a leak (the strength split proved the aggregate was a misleading proxy). Finer weak/medium-pair and draw defense **by board texture** (e.g. peel second pair on dry boards, fold it on wet) is an **unvalidated future refinement, not a current hole** — and any such change must keep the gate green, since looser defense raises WTSD.
- **Implied / reverse-implied odds (DONE).** The price now carries an implied/reverse term — `required = call / (pot + call + X)` — adjusting the *price* only (conditioned range and realized equity untouched). `X` is positive for set-mines (scaled by the stack behind, **capped at it**, anchored to the rule-of-15) and strong draws, negative for dominated weak pairs (reverse implied), and **0 when the action closes** (river/all-in, so the bluff-catch math is provably unchanged). Conservative by design — err small, since a manufactured speculative call is the classic losing pattern. 22 vs a TAG open deep now reads **Call** (was "Close"); a dominated bottom pair folds; a decent second pair is **not** over-folded. Tuned/proved in `scripts/implied_spot_check.py` + `tests/test_implied_spots.py` (set-mine boundary near 15×; reverse both directions).
- **Conditioned range over-narrows vs the loosest villains.** The river-spot calibration probe (`validation/coach_calibration.txt`) shows the conditioned range's bias is **−0.071 vs the Maniac** (and −0.033 overall) — i.e. it models the loosest barrellers as a touch *too* value-heavy by the river, slightly **under**-rating the hero. That is the safe direction (it was **+0.047 over**-rating with the old static range, so worse against that one type but no longer an over-call bias), and it's bounded — but it should be tuned in the implied-odds pass (keep a few more weak/bluff combos in the loose archetypes' barreling ranges so realized ≈ actual). *Measured with* `backend/.venv/bin/python scripts/coach_calibration.py --hands 6000 --seed 0` *(52s, n=1182 river spots). The figure previously recorded here was −0.053, which does not reproduce.*
- **Preflop range *shape*** (`bots/preflop_strength.py`): the percentile ranking is raw all-in equity, which under-rates small pairs / suited connectors, so early-position opens have the wrong *shape* even when the aggregate VPIP/PFR band is met. Swap in §2's explicit positional lists.

These are *deliberately* deferred: the conditioned-range + realized-equity change was proven to reduce the dominant over-calling error (battery + calibration probe) before adding the next term on top.