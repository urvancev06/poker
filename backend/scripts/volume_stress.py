"""Volume stress test for the advice layer (coach + leak detector).

The known-spot batteries prove specific hand-picked spots; this proves the advice
holds across decisions nobody chose. We play many hands with the hero seat driven
by a simple, validated baseline (a TAG bot) and point BOTH the coach and the leak
detector at every hero decision, then report:

  * leak-flag rate (per decision + per hand, by type) — a validated TAG makes few
    real EV-errors, so this should be low single digits; a big fraction = residual
    false positives to investigate, not a pass;
  * coach verdict distribution — should not be degenerate (all-fold / all-call);
  * a SAMPLE of actually-flagged decisions — the rate says how often, the sample
    says whether they're real leaks or standard plays;
  * a coarse equity-vs-outcome check on river call decisions that reached showdown.

    backend/.venv/bin/python scripts/volume_stress.py --hands 8000
"""

from __future__ import annotations

import argparse
import random
from collections import Counter, defaultdict

from poker.bots import Bot, archetypes, build_context
from poker.coach import build_coaching, review_hand
from poker.game.session import GameSession


def _verdict_bucket(v: str) -> str:
    s = v.lower()
    if s.startswith("fold"):
        return "fold"
    if s.startswith("clear call") or s.startswith("call"):
        return "call"
    if s.startswith("raise"):
        return "raise/value"
    if s.startswith("close"):
        return "close"
    if s.startswith("bet") or s.startswith("thin"):
        return "bet/value"
    if s.startswith("semi"):
        return "semibluff"
    if s.startswith("check"):
        return "check"
    return s[:14]


def run(hands: int, seed: int = 0, coach_trials: int = 1000):
    hero_bot = Bot(archetypes.make("tag"))
    gs = GameSession(session_id="vol", villains=["nit", "tag", "lag", "station", "maniac"], seed=seed)
    rng = random.Random(seed ^ 0xABCDEF)

    verdicts: Counter = Counter()
    coach_calls = 0
    leak_types: Counter = Counter()
    total_decisions = 0
    decisions_with_leak = 0
    hands_with_leak = 0
    samples_by_type: dict[str, list] = defaultdict(list)
    # coarse calibration: river coach decisions, (realized_eq, won_showdown)
    river_calib: list[tuple[float, int]] = []

    for h in range(hands):
        gs.start_hand()
        # capture the coach verdict at each hero decision this hand
        while gs.hero_to_act:
            try:
                c = build_coaching(gs, trials=coach_trials)
                verdicts[_verdict_bucket(c.verdict)] += 1
                coach_calls += 1
            except Exception:
                pass
            action = hero_bot.act(build_context(gs.hand, gs.blinds[1]), rng)
            gs.submit_hero_action(action)

        res = gs.last_result
        if not res:
            continue
        rev = review_hand(res, equity_trials=coach_trials)
        hand_leaked = False
        for d in rev["decisions"]:
            total_decisions += 1
            if d["leaks"]:
                decisions_with_leak += 1
                hand_leaked = True
                for lk in d["leaks"]:
                    leak_types[lk["type"]] += 1
                    if len(samples_by_type[lk["type"]]) < 4:
                        samples_by_type[lk["type"]].append({
                            "hand": res["hand_index"], "street": d["street"],
                            "cards": "".join(res.get("hero_cards", "")),
                            "board": " ".join(d["board"]) or "-",
                            "action": d["action"], "eq": d["equity_pct"], "req": d["required_pct"],
                            "note": lk["note"],
                        })
            # coarse river calibration: a call on the river that reached showdown
            if d["street"] == "river" and d["action"] == "call" and d["equity_pct"] is not None and res.get("went_to_showdown"):
                river_calib.append((d["equity_pct"] / 100.0, 1 if (res.get("hero_net", 0) or 0) > 0 else 0))
        if hand_leaked:
            hands_with_leak += 1

    return {
        "hands": hands, "coach_calls": coach_calls, "verdicts": verdicts,
        "total_decisions": total_decisions, "decisions_with_leak": decisions_with_leak,
        "hands_with_leak": hands_with_leak, "leak_types": leak_types,
        "samples_by_type": samples_by_type, "river_calib": river_calib,
    }


def report(r: dict) -> str:
    L = []
    L.append("")
    L.append("VOLUME STRESS — hero = TAG bot, coach + leak detector on every decision")
    L.append("=" * 78)
    dec, lk = r["total_decisions"], r["decisions_with_leak"]
    L.append(f"hands: {r['hands']:,}   hero decisions reviewed: {dec:,}   coach calls: {r['coach_calls']:,}")
    L.append(f"LEAK RATE: {lk}/{dec} decisions = {100*lk/max(dec,1):.1f}%   "
             f"| {r['hands_with_leak']}/{r['hands']} hands = {100*r['hands_with_leak']/max(r['hands'],1):.1f}%")
    L.append("")
    L.append("leaks by type:")
    for t, n in r["leak_types"].most_common():
        L.append(f"  {t:16}{n:>7}  ({100*n/max(dec,1):.2f}% of decisions)")
    L.append("")
    L.append("coach verdict distribution:")
    tot = sum(r["verdicts"].values()) or 1
    for v, n in r["verdicts"].most_common():
        L.append(f"  {v:16}{n:>7}  {100*n/tot:.1f}%")
    if r["river_calib"]:
        pred = sum(e for e, _ in r["river_calib"]) / len(r["river_calib"])
        act = sum(w for _, w in r["river_calib"]) / len(r["river_calib"])
        L.append("")
        L.append(f"river-call calibration (n={len(r['river_calib'])}): mean predicted eq {pred*100:.1f}% "
                 f"vs actual showdown-win {act*100:.1f}%  (bias {(pred-act)*100:+.1f})")
    L.append("")
    L.append("SAMPLE of flagged decisions (eyeball: real leak or standard play?):")
    for t, samples in r["samples_by_type"].items():
        L.append(f"  --- {t} ---")
        for s in samples:
            L.append(f"    #{s['hand']} {s['street']:6} {s['cards']:5} [{s['board']:14}] {s['action']:5} "
                     f"eq={s['eq']} req={s['req']}")
            L.append(f"        {s['note']}")
    L.append("=" * 78)
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hands", type=int, default=8000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--trials", type=int, default=1000)
    args = ap.parse_args()
    print(report(run(args.hands, args.seed, args.trials)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
