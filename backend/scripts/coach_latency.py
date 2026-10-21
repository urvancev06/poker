"""Coach latency and coach-vs-review parity over 60 seeded hands (P2.10).

The hero checks or calls every spot; each postflop coach call is timed (cold
process, flop matrix not warmed), and each decision is compared with the stored
hand's review. Run: PYTHONPATH=. .venv/bin/python scripts/coach_latency.py
"""
import time, statistics as stt
from poker.game.session import GameSession
from poker.coach import build_coaching
from poker.coach.review import review_hand
from poker.engine import Action, ActionType as T
gs = GameSession("par", villains=["nit","tag","lag","station","maniac"], seed=5)
lat = {"flop": [], "turn": [], "river": []}; mism = []; methods = {}
for _ in range(60):
    gs.start_hand(); adv = []
    while not gs.hand_over:
        st = gs.state(); la = st.legal_actions; n = len(st.board)
        if n >= 3:
            t = time.perf_counter(); c = build_coaching(gs); dt = (time.perf_counter()-t)*1000
            street = {3:"flop",4:"turn",5:"river"}[n]; lat[street].append(dt)
            methods[c.equity_method] = methods.get(c.equity_method, 0) + 1
            adv.append((street, c.equity_pct, c.required_equity_pct, c.equity_method))
        gs.submit_hero_action(Action(T.CHECK) if la.can_check else Action(T.CALL))
    rev = review_hand(gs.last_result)
    hd = [d for d in rev["decisions"] if d["street"] != "preflop"]
    for a, d in zip(adv, hd):
        if d["equity_pct"] is None or abs(d["equity_pct"] - a[1]) > 0.05 or (a[2] and d["required_pct"] != a[2]):
            mism.append((a, d["street"], d["equity_pct"], d["required_pct"], d["equity_method"]))
print("methods", methods)
for k, v in lat.items():
    if v: print(k, "n", len(v), "p50 %.0f max %.0f ms" % (stt.median(v), max(v)))
print("mismatches", len(mism), mism[:5])
