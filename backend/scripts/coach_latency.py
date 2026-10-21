"""Coach latency and coach-vs-review parity over 60 seeded hands (P2.10, P3.15).

The hero checks or calls every spot; each coach call is timed (cold process,
flop matrix not warmed), and each postflop decision is compared with the stored
hand's review. With ``--engine v2`` (the beta table) preflop calls are timed
too (chart advice), and parity is skipped: a v2 review grades preflop and
missed value only, with no postflop equity (P3.12).

    PYTHONPATH=. .venv/bin/python scripts/coach_latency.py
    PYTHONPATH=. .venv/bin/python scripts/coach_latency.py --engine v2
"""
import argparse
import time, statistics as stt
from poker.game.session import GameSession
from poker.coach import build_coaching
from poker.coach.review import review_hand
from poker.engine import Action, ActionType as T

ap = argparse.ArgumentParser()
ap.add_argument("--engine", choices=["v1", "v2"], default="v1")
ap.add_argument("--hands", type=int, default=60)
args = ap.parse_args()
v2 = args.engine == "v2"
gs = GameSession("par", villains=["nit","tag","lag","station","maniac"], seed=5, engine=args.engine)
lat = {"preflop": [], "flop": [], "turn": [], "river": []}; mism = []; methods = {}
for _ in range(args.hands):
    gs.start_hand(); adv = []
    while not gs.hand_over:
        st = gs.state(); la = st.legal_actions; n = len(st.board)
        if n >= 3 or v2:
            t = time.perf_counter(); c = build_coaching(gs); dt = (time.perf_counter()-t)*1000
            street = {0:"preflop",3:"flop",4:"turn",5:"river"}[n]; lat[street].append(dt)
            methods[c.equity_method] = methods.get(c.equity_method, 0) + 1
            if n >= 3:
                adv.append((street, c.equity_pct, c.required_equity_pct, c.equity_method))
        gs.submit_hero_action(Action(T.CHECK) if la.can_check else Action(T.CALL))
    if v2:
        continue
    rev = review_hand(gs.last_result)
    hd = [d for d in rev["decisions"] if d["street"] != "preflop"]
    for a, d in zip(adv, hd):
        if d["equity_pct"] is None or abs(d["equity_pct"] - a[1]) > 0.05 or (a[2] and d["required_pct"] != a[2]):
            mism.append((a, d["street"], d["equity_pct"], d["required_pct"], d["equity_method"]))
print("engine", args.engine, "methods", methods)
for k, v in lat.items():
    if v:
        p90 = sorted(v)[int(0.9 * (len(v) - 1))]
        print(k, "n", len(v), "p50 %.0f p90 %.0f max %.0f ms" % (stt.median(v), p90, max(v)))
print("mismatches", "skipped (v2)" if v2 else len(mism), "" if v2 else mism[:5])
