# STRATEGY.md — Poker Knowledge (source of truth)

The poker domain knowledge the app is built from. It feeds three things:
- **The bots** — their preflop ranges and postflop logic are seeded from §2–§3, then tuned to hit the archetype stat targets in §4.
- **The coach** — the math in §3 and the stat definitions in §5 are what it computes and explains.
- **My own progress** — the stat targets in §4–§5 are what my dashboard compares my play against.

> **Honesty rules:**
> - The ranges below are a **solid standard baseline**, not solver truth. Real GTO mixes frequencies (a hand raised 40% / folded 60%), so nothing here is exact GTO and the app never presents it as such. For exact frequencies and mixing, the answer is "confirm in GTO Wizard."
> - The coach **computes** concrete math (Monte Carlo equity, pot odds, EV) and shows its work. It never invents solver numbers.
> - Stat bands for archetypes are **descriptive player-type profiles** (general poker knowledge), not solver outputs.

---

## 1. The format this is built for

- **No-Limit Texas Hold'em, 6-max cash, 100bb effective, ~2.5bb opens** (3bb from the SB). Online-style.
- **5/10 blinds, 1,000-chip (100bb) buy-ins; every amount is shown in big blinds.** Hands stored before this change were played at 1/2 and show in their own big blinds.
- Positions, worst→best preflop: **UTG, MP (HJ), CO, BTN, SB, BB.**
- Everything assumes heads-up-to-the-flop decisions unless noted; multiway tightens ranges.

---

## 2. Preflop ranges (baseline)

A standard, slightly-conservative 100bb baseline, good for low/mid stakes where rake is real. The bots' TAG profile is seeded from these; the other archetypes widen or tighten them (§4). Notation: `A2s+` = all suited aces; `KTo+` = KTo, KJo, KQo; `22+` = all pairs.

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

<!-- charts:v2:start -->
### Proposed v2 baseline charts (2026-10): baseline, not solver, for owner review

Rendered from `backend/poker/strategy/charts/` by `backend/scripts/render_charts.py`; do not edit by hand (a test keeps this block in sync). The v2 bots and the beta coach read these same tables. Each list is the chart with every dial at 1.0 and shows the hands whose chart probability is at least 50%; the types scale the cuts with their dials (§4). The RFI lists above are unchanged.

#### Opening order

One order holds every RFI list above as an exact prefix: the UTG tier, then MP∖UTG, CO∖MP, SB∖CO, BTN∖SB, then the rest; inside each tier hands sort by Chen playability. A player's open cut is its seat's list size × its `open` dial (cumulative combos: UTG 182, MP 222, CO 326, SB 450, BTN 538).

- Widening past the BTN list adds, in order: `64s, 43s, T8o, 87o, 53s, 32s, 97o, 76o, Q4s, Q3s, Q2s, 85s, 42s, J8o, 86o, 65o`, ...
- Hands near a cut mix through a logistic of width 3 combos, so a range is never a cliff; a TAG opens about 15% wider than the lists (`open` 1.15).

#### Limped pots

- Iso-raise with the open cut × 0.7 per limper: CO over one limper `22+, A7s+, A5s-A2s, KTs+, QTs+, J9s+, T9s, 98s, ATo+, KJo+`; BTN over one limper `22+, A2s+, K5s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, A7o+, KTo+, QTo+, JTo`.
- The BB over limpers raises `TT+, AQs+, AKo` and checks the rest, so AA no longer checks behind.
- Premium hands `JJ+, AQs+, AKo` (44 combos) are never limped; only a player with a `limp` dial (Station, Maniac) limps the others.

#### Facing an open

Three disjoint sets per seat pair, at a 2.5bb open: value 3-bets always 3-bet, light 3-bets come off an ordered list by a cut (`threebet` dial), and flats come off a flat order that skips the value 3-bets (`call` dial). An open above 2.5bb shrinks every cut by ×(2.5bb/open)^0.8. From the SB it is mostly 3-bet or fold (flat base 12 combos).

| Hero vs opener | 3-bet value | 3-bet light | Flat |
|---|---|---|---|
| MP vs UTG | `QQ+, AKs, AKo` | `A5s-A4s` | `JJ-88, AQs-ATs, KJs+, QJs` |
| CO vs UTG | `QQ+, AKs, AKo` | `A5s-A4s` | `JJ-88, AQs-ATs, KJs+, QJs` |
| BTN vs UTG | `QQ+, AKs, AKo` | `A5s-A4s` | `JJ-88, AQs-ATs, KJs+, QJs` |
| SB vs UTG | `QQ+, AKs, AKo` | `A5s-A4s` | `JJ-TT` |
| CO vs MP | `QQ+, AKs, AKo` | `A5s-A2s` | `JJ-77, AQs-ATs, KJs+, QJs, JTs` |
| BTN vs MP | `QQ+, AKs, AKo` | `A5s-A2s` | `JJ-77, AQs-ATs, KJs+, QJs, JTs` |
| SB vs MP | `QQ+, AKs, AKo` | `A5s-A2s` | `JJ-TT` |
| BTN vs CO | `JJ+, AQs+, AKo` | `A5s-A2s, KJs-KTs` | `TT-55, AJs-ATs, KQs, QTs+, JTs, T9s, 98s, AQo-AJo, KQo` |
| SB vs CO | `JJ+, AQs+, AKo` | `A5s-A2s, KJs-KTs, QJs` | `TT-99` |
| SB vs BTN | `JJ+, AQs+, AKo` | `A5s-A2s, KJs-KTs, QJs, 76s, 65s` | `TT-99` |

Light 3-bet order: `A5s, A4s, A3s, A2s, KJs, KTs, QJs, 76s, 65s, A9s, A8s, A7s, A6s, K9s, Q9s, J9s, T8s, 98s, 87s, 54s, QTs, JTs, T9s, AJo, KQo, ATo, KJo, QJo, K8s, Q8s, J8s, 97s, 86s, 75s, 64s, 53s, A9o, KTo, QTo, JTo`.

#### BB defence

The BB defends a suited-and-connected order (Chen + 1.5 if suited + 1 if connected or one-gapped with a 4 or better). Its flat cut is the defence target minus the value 3-bets, so value plus flats lands on the target.

| vs | Defend | 3-bet | Flat |
|---|---|---|---|
| UTG | 25% | `QQ+, AKs, A5s-A4s, AKo` | `JJ-77, AQs-A6s, A3s-A2s, K5s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, AQo-AJo, KJo+, QTo+, J9o+, T9o, 98o` |
| MP | 28% | `QQ+, AKs, A5s-A2s, AKo` | `JJ-66, AQs-A6s, K2s+, Q8s+, J8s+, T7s+, 97s+, 86s+, 75s+, 64s+, 54s, 43s, AQo-ATo, KJo+, QTo+, J9o+, T9o, 98o` |
| CO | 38% | `JJ+, AQs+, A5s-A2s, KJs-KTs, AKo` | `TT-22, AJs-A6s, KQs, K9s-K2s, Q2s+, J7s+, T7s+, 96s+, 85s+, 75s+, 64s+, 53s+, 42s+, 32s, AQo-ATo, KTo+, QTo+, J9o+, T8o+, 97o+, 87o, 76o` |
| BTN | 50% | `JJ+, AQs+, A5s-A2s, KJs-KTs, QJs, 76s, 65s, AKo` | `TT-22, AJs-A6s, KQs, K9s-K2s, QTs-Q2s, J7s+, T7s+, 96s+, 85s+, 75s-74s, 64s, 53s+, 42s+, 32s, AQo-A2o, KTo+, Q9o+, J9o+, T8o+, 97o+, 86o+, 75o+, 65o, 54o` |
| SB | 58% | `JJ+, AQs+, A9s, A5s-A2s, KJs-KTs, QJs, 76s, 65s, AKo` | `TT-22, AJs-ATs, A8s-A6s, KQs, K9s-K2s, QTs-Q2s, J2s+, T2s+, 95s+, 84s+, 75s-74s, 64s-63s, 52s+, 42s+, 32s, AQo-A2o, K8o+, Q9o+, J8o+, T8o+, 97o+, 86o+, 75o+, 64o+, 54o` |

#### Facing a 3-bet

The opener calls with the top 45% of its own opening range in position and 42% out of position (4-bets included), so a button opener defends far wider than a UTG opener. 4-bet value is `QQ+, AKs, AKo` (`KK+, AKs` against an MP 3-bet over a UTG open); 4-bet bluffs `A5s-A4s` at 0.15 × the `threebet` dial. Fold-to-3-bet is the combo-weighted share of the opening range that folds.

| Opener vs 3-bettor | Call | Fold (chart) | Fold (TAG) |
|---|---|---|---|
| UTG vs BTN (OOP) | `JJ-99, AQs-AJs, KJs+, QJs, JTs` | 58% | 57% |
| UTG vs BB (IP) | `JJ-99, AQs-AJs, KJs+, QJs, JTs` | 54% | 54% |
| MP vs BTN (OOP) | `JJ-88, AQs-AJs, KJs+, QJs, JTs, AQo` | 57% | 57% |
| MP vs BB (IP) | `JJ-88, AQs-ATs, KJs+, QJs, JTs, AQo` | 55% | 54% |
| CO vs BTN (OOP) | `JJ-88, AQs-ATs, KTs+, QTs+, JTs, T9s, 98s, AQo-AJo, KQo` | 58% | 58% |
| CO vs BB (IP) | `JJ-77, AQs-ATs, KTs+, QTs+, JTs, T9s, 98s, AQo-AJo, KQo` | 55% | 55% |
| BTN vs SB (IP) | `JJ-22, AQs-A2s, KTs+, Q9s+, J9s+, T8s+, 98s, AQo-ATo, KJo+` | 55% | 55% |
| BTN vs BB (IP) | `JJ-22, AQs-A2s, KTs+, Q9s+, J9s+, T8s+, 98s, AQo-ATo, KJo+` | 55% | 55% |
| SB vs BB (OOP) | `JJ-22, AQs-A9s, A5s-A4s, KTs+, QTs+, J9s+, T9s, 98s, AQo-AJo, KQo` | 58% | 58% |

- Cold, facing an open and a 3-bet: 4-bet `KK+, AKs`; call from `QQ, JJ, AKo, AQs` with a cut of 18 combos (`QQ-JJ, AKo`).

#### Facing a 4-bet or 5-bet

- Jam `KK+, AKs`. `QQ, AKo` continue when the direct price is at most 38%, else fold. Everything else folds.
- Facing a 5-bet: `KK+, AKs` call or jam; everything else folds.

#### Squeeze and cold 4-bet

- Facing an open and callers: squeeze `QQ+, AKs, AKo` for value and `A5s-A4s` as bluffs at 0.5 × the `threebet` dial; flat cuts shrink × 0.6.
- Cold 4-bet `KK+, AKs`.

#### Short stacks and sizes

- At 25bb effective or less, every 3-bet or bigger is a jam.
- Small pairs `66-22` flat only when the effective stack is at least 18× the call.
- Sizes (§4.6): open 2.5bb (3bb from the SB) plus 1bb per limper; 3-bet 3× in position and 4× out of position; 4-bet 2.2×; jam when a raise would commit more than 40% of the stack.

<!-- charts:v2:end -->

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

Each archetype is a **parameter set** over the strategy in §2–§3. The parameters are tuned until a ≥100k-hand simulation lands the measured stats inside these bands. The bands come from current 6-max consensus; they are targets to converge on, not measurements of any particular player pool.

| Archetype | VPIP | PFR | 3-bet | AF | WTSD | Identity |
|---|---|---|---|---|---|---|
| **Nit** | 10–15 | 8–12 | 1–3 | 1–2 | 26–32 † | Premiums only. Folds constantly. Easy to steal from; when it raises, believe it. |
| **TAG** (reg) | 20–24 | 17–21 | 6–9 | 2.5–3.5 | 25–30 | Solid, balanced, the §2 baseline. The benchmark opponent. |
| **LAG** | 27–33 | 22–28 | 9–13 | 3–4.5 | 27–33 | Wide + aggressive, narrow VPIP–PFR gap. Pressures relentlessly; hard to read. |
| **Calling Station** | 40–55 | 6–13 | 1–3 | <1.5 | 38–50 | Passive fish. Wide gap. Calls everything, never folds to value, almost never bluffs. |
| **Maniac** | 50–65 | 38–50 | 14–22 | >4 | varies | Aggressive spew. Raises/bluffs constantly, barrels air. Punish with value, not bluffs. |

> † Counter-intuitively, nit WTSD is not low in aggregate. A tight *passive*
> premium range structurally shows down at a reg-like rate (~30%): the few flops it
> sees are strong, so they reach showdown. The nit tells are a **high WSD (~60%+)**,
> since it only turns up with the goods, and over-folding in *specific* spots
> (rivers, steals). A parameter sweep confirms the band is the achievable one: pushing WTSD
> below ~28 forces VPIP or AF out of their defining bands. WSD is reported as
> evidence but not hard-gated, since a band fitted to its own measurement is not a
> test.

**How the parameters differ (the levers to tune):**
- **Range width** — Nit ≈ top ~12%; TAG = §2 baseline; LAG widens opens/3-bets; Station calls a very wide range but rarely raises (low PFR despite high VPIP); Maniac raises a very wide range.
- **Aggression / barrel frequency** — Station ~never bets without a strong hand; Maniac bets/raises at the slightest opportunity, including pure air; TAG/LAG bet for value + balanced bluffs.
- **Bluff frequency** — Station ≈ 0; Nit ≈ low; TAG ≈ balanced; LAG/Maniac high.
- **Calldown / fold-to-bet** — Station folds far too little (pays off value); Nit folds too much; TAG ≈ correct; Maniac calls light *and* over-bluffs.
- **Steal / fold-to-steal** — Nit folds blinds constantly; Station defends too wide passively; LAG/Maniac steal often.

**v2 types are dial vectors.** In the new engine (beta), a type is not a separate strategy. It is a vector of 16 dials and a decision temperature over the one logical policy, defined in `backend/poker/strategy/dials.py` (`TYPE_DIALS`, with each dial's range in `DIAL_META`). Each player is a copy of its type's mean, jittered per player, plus up to two named leaks (`poker/bots/personas.py`). The bands above remain the targets. The phase-3 smoke (`backend/validation/v2_smoke.txt`, 50,000 hands) is WARN-only. The type vectors are calibrated against these bands in phase 4, and where a logical policy disagrees with a band, the band is revised with the owner.

> The fish archetypes (Station, Maniac, loose-passive play) play badly on purpose. Realistic, beatable opponents are the whole reason to practise against them, so their leaks are the feature and not a defect to tune away.

### Reads are earned, not given (opponent visibility modes)

Reading the opponent, meaning *acquiring* the read from observed play, is itself a trained skill. The bots play **identically** in every mode; only what *I* can see about them changes. The per-table setting gates display only: never bot behaviour, never the coach's math.

- **Live** — no labels, no opponent stats. I build the read purely from observed actions, like a live table. The realistic target.
- **HUD** — opponent stats (VPIP/PFR/AF/3-bet…) show in the seat HUD, but **only after a minimum observed sample vs that specific bot** (~30 hands for a rough read, fuller by ~100). No archetype label — I read the numbers myself, like a real tracker.
- **Labeled** — the archetype name (Nit/TAG/LAG/Station/Maniac) shown upfront. Training wheels: drill the exploit fast while learning the counters.

Default **Labeled** for a new player; intended progression **Labeled → HUD → Live**. Labeled mode teaches the *exploit*; HUD and Live train the *read*. The mode is persisted, so the progression can actually be committed to rather than resetting to training wheels each session.

---

## 5. Stat definitions (for the dashboard + bot validation)

Computed from logged decisions. Healthy 6-max reg targets in brackets — these are also **my** targets for the progress dashboard.

- **VPIP** — % of hands you voluntarily put money in preflop. *[22–26]*
- **PFR** — % of hands you raise preflop. *[18–22]*. The VPIP–PFR gap shows passivity; a small gap = aggressive/competent, a wide gap = passive/fish.
- **3-bet%** — of the spots where you FACED an open, how often you re-raised. Denominator is 3-bet *opportunities* (~0.42/hand measured), **not hands** — `backend/poker/sim/stats.py`, `threebet / threebet_opp`. *[7–10]*
- **ATS (attempt to steal)** — % you open CO/BTN/SB when folded to. *[30–40]*
- **AF (aggression factor)** — `(bets + raises) ÷ calls` postflop. ~3 is normal; ≫3 = maniac, ≪ = too passive.
- **WTSD** — of the flops you SAW, how often you reached showdown. Denominator is `saw_flop`, **not hands** — `wtsd / saw_flop`. This is why it settles slowly: a tight player sees few flops. *[25–30]*
- **WSD** — % won at showdown. *[52–58]*
- **WWSF** — won when saw flop. *[~48–54]*
- **C-bet%** — % you continuation-bet the flop as preflop raiser. *[~55–70 depending on board]*
- **Fold to c-bet** — solid players ~55–60%; fish far lower.

**Sample-size reality:** VPIP/PFR need ~100+ hands to stabilize, 3-bet and fold-to-3-bet ~500, 4-bet and turn stats ~1,000+. The coach holds to these floors rather than reading a leak into twenty hands, and so should I.

---

## 6. Bankroll, variance, tilt (the coach enforces these honestly)

- **Bankroll:** cash games, **≥20 buy-ins** for your stake (more is safer); move down when you drop below; never play scared/over-rolled money.
- **Stop-loss:** a fixed per-session loss limit (e.g. 3 buy-ins) → stop, don't reload, come back another day.
- **Variance is real:** good play loses over meaningful stretches. **Judge decisions, not short-run results.** A profitable line that lost is still correct; a spew that won is still a spew. The coach says so plainly.
- **Tilt / chasing:** the coach flags results-oriented thinking, chasing losses, and playing too long, rather than cheerleading volume.

---

## 7. Where the coach defers

Exact preflop frequencies, exact mixed strategies, precise multi-street solver lines, and node-locked exploit solutions → **GTO Wizard**. The coach teaches the *why*, computes *concrete* math, and points there for exact ranges. A fabricated "GTO number" is worse than none.

---

## 8. Known modelling limitations

The coach judges *realized equity vs an action-conditioned villain range*: the bots' bluff frequencies are measured from their own strategy rather than assumed. The gaps below are the ones I know about. Paths are relative to `backend/`.

- **Postflop defense is strength-polarized, and WTSD is the binding constraint.** `poker/bots/strategy.py` grades the calldown by `pair_strength`: top pair and overpairs defend at `strong_pair_defend` (0.82), weak and medium pairs fold at the archetype's `calldown_freq`. Aggregate one-pair-fold (~55%) and fold-to-c-bet (~68%) read high, but that is weak-pair and air folding rather than an over-fold; the aggregate is a poor proxy once the strength split is visible. Defense **by board texture** (peel second pair on a dry board, fold it on a wet one) is not modelled. Anything that loosens defense also lifts WTSD, which already sits in the upper half of every reg band, so the two cannot be tuned independently.
- **Implied and reverse-implied odds adjust the price only.** `required = call / (pot + call + X)`, with the conditioned range and the realized-equity estimate untouched. `X` is positive for set-mines (scaled by the stack behind, capped at it, anchored to the rule of 15) and for strong draws, negative for dominated weak pairs, and **0 whenever the action closes** (river or all-in), so bluff-catch math is provably unchanged by this term. `X` is deliberately small: a manufactured speculative call is the classic losing pattern. The boundaries are pinned in `scripts/implied_spot_check.py` and `tests/test_implied_spots.py`, including the set-mine threshold near 15× and reverse-implied in both directions.
- **The conditioned range over-narrows slightly.** In the river-spot probe (`validation/coach_calibration.txt`, reproduced by `scripts/coach_calibration.py --hands 6000 --seed 0`) the conditioned range's bias is **−0.034 overall** over 1,205 spots, ranging from −0.027 (TAG) to −0.050 (Nit, on only 60 spots). It models villains as slightly too value-heavy by the river and so **under**-rates the hero. That is the safe direction, since the static range it replaced over-rated the hero by +0.049 and an over-rating is an over-calling bias, but it is still a real error. Closing it means keeping more weak and bluff combos in the archetypes' barreling ranges. The probe is not bit-for-bit deterministic; the figures move by about ±0.001 between runs.
- **The bots' preflop ranges are percentile-based, so their *shape* is wrong.** `poker/bots/preflop_strength.py` ranks hands by raw all-in equity, which under-rates small pairs and suited connectors. An archetype can therefore sit inside its VPIP/PFR band while opening the wrong hands from early position: too many weak offsuit broadways, too few speculative suited ones. The *leak detector* does not share the flaw, since it judges my play against §2's explicit positional lists (`poker/bots/preflop_ranges.py`); it is only the bots that run on percentiles. Replacing the percentiles with those lists would also invalidate the coach's measured `BET_COMPOSITION` table, which is calibrated against the ranges the bots currently play.