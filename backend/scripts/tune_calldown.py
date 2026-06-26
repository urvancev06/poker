"""Combined tuning harness: run one sim and report BOTH the gate stats and the
realism stats (one-pair-fold, fold-to-c-bet) per archetype, under a candidate set
of strategy overrides. Lets us find a point where the regs' made-hand over-fold is
fixed AND the 100k gate stays in band — or prove the two can't both hold.

    backend/.venv/bin/python scripts/tune_calldown.py
"""

from __future__ import annotations

from collections import defaultdict

from poker.engine import ActionType
from poker.math import MadeTier, PairStrength, classify, pair_strength
from poker.sim.report import TARGETS
from poker.sim.runner import run

REGS = ("Nit", "TAG", "LAG")
KEY = {"Nit": "nit", "TAG": "tag", "LAG": "lag", "Calling Station": "station", "Maniac": "maniac"}


def evaluate(overrides: dict, hands: int = 40000, seed: int = 0):
    of: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def obs(name, ctx, action):
        if ctx.street == "preflop" or ctx.to_call <= 0:
            return
        d = of[name]
        folded = action.type is ActionType.FOLD
        tier = classify(ctx.hole, ctx.board).made
        if ctx.street == "flop" and not ctx.is_pfr:
            d["fb"] += 1
            d["ff"] += folded
        if tier == MadeTier.PAIR:
            d["pf"] += 1
            d["pp"] += folded
            if pair_strength(ctx.hole, ctx.board) is PairStrength.STRONG:
                d["sf"] += 1            # strong pair (top pair/overpair) faced
                d["sp"] += folded       # ...folded (THE leak metric)

    acc = run(hands, seed=seed, overrides=overrides, observer=obs)
    return acc, of


def band_ok(name, stat, val):
    b = TARGETS[name].get(stat)
    return b is None or (b[0] <= val <= b[1])


def show(label, overrides, hands=40000):
    acc, of = evaluate(overrides, hands=hands)
    print(f"\n### {label}   (overrides: {overrides})")
    print(f"{'arch':16}{'AF':>7}{'WTSD':>8}{'STRONGfold':>11}{'1pairFold':>11}{'f2cbet':>9}  gate?")
    all_ok = True
    for name in ("Nit", "TAG", "LAG", "Calling Station", "Maniac"):
        L = acc.line(name)
        d = of.get(name, {})
        pf = 100 * d.get("pp", 0) / d["pf"] if d.get("pf") else 0
        sf = 100 * d.get("sp", 0) / d["sf"] if d.get("sf") else 0   # strong-pair fold% (the leak)
        fb = 100 * d.get("ff", 0) / d["fb"] if d.get("fb") else 0
        gate = all(band_ok(name, s, getattr(L, s)) for s in ("vpip", "pfr", "af", "wtsd"))
        all_ok &= gate
        wtsd_flag = "" if band_ok(name, "wtsd", L.wtsd) else "✗"
        af_flag = "" if band_ok(name, "af", L.af) else "✗"
        print(f"{name:16}{L.af:>6.2f}{af_flag:1}{L.wtsd:>7.1f}{wtsd_flag:1}{sf:>10.0f}%{pf:>10.0f}%{fb:>8.0f}%  {'OK' if gate else 'FAIL'}")
    print(f"  => gate {'PASS' if all_ok else 'FAIL'} (40k; confirm survivors at 100k)")
    return all_ok


def cand(nit_cd, tag_cd, lag_cd, spd=0.82):
    return {
        "nit": {"calldown_freq": nit_cd, "strong_pair_defend": spd},
        "tag": {"calldown_freq": tag_cd, "strong_pair_defend": spd},
        "lag": {"calldown_freq": lag_cd, "strong_pair_defend": spd},
    }


if __name__ == "__main__":
    import sys
    which = sys.argv[1] if len(sys.argv) > 1 else "A"
    if which == "A":
        show("A: Nit cd0.10 / TAG cd0.19 / LAG cd0.22, spd0.82", cand(0.10, 0.19, 0.22))
    elif which == "B":
        show("B: Nit cd0.06 / TAG cd0.16 / LAG cd0.20, spd0.82", cand(0.06, 0.16, 0.20))
    elif which == "C":
        show("C: Nit cd0.03 / TAG cd0.16 / LAG cd0.20, spd0.82", cand(0.03, 0.16, 0.20), hands=60000)
    elif which == "REPORT":
        # BEFORE = uniform calldown (disable grading via spd=0, original calldowns)
        show("BEFORE (uniform calldown, the leak)",
             {k: {"strong_pair_defend": 0.0} for k in ("nit", "tag", "lag")}, hands=60000)
        # AFTER = strong-pair defense on, calldown lowered to hold WTSD
        show("AFTER (spd0.82, calldown lowered to hold WTSD)", cand(0.03, 0.16, 0.20), hands=60000)
    elif which == "FINAL":
        show("FINAL (baked-in archetypes, no overrides)", {}, hands=60000)
    elif which == "NIT":
        # map the Nit frontier: WTSD vs one-pair-fold as calldown varies (spd fixed)
        for ncd in (0.04, 0.08, 0.12, 0.16):
            show(f"NIT cd={ncd} spd0.82", cand(ncd, 0.19, 0.22), hands=30000)
