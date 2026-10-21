"""Phase-3 v2 smoke (P3.15): the Classic lineup on engine v2, every type's
stats with shard-clustered 95% CIs against the STRATEGY §4 and design §5
bands, under the design §5 rule (PASS / WARN / FAIL). WARN-only: the v2
gate is phase 4.

    PYTHONPATH=. .venv/bin/python -m scripts.v2_validation --hands 50000 --seed 0 --workers 4

Prints the table; ``--out`` also writes it to a file.
"""

from __future__ import annotations

import argparse
import time
from collections import Counter

from poker.sim.report import TARGETS
from poker.sim.runner import _bots, _play, process_pool, shard_bounds, shard_spec
from poker.sim.stats import StatsAccumulator
from poker.strategy.policy import policy_hash
from validation.v2_stats import hand_counts, merge_counts, ratio_ci, verdict

TYPES = ["Nit", "TAG", "LAG", "Calling Station", "Maniac"]

# (label, numerator, denominator, is a percentage). c is one shard's merged
# counters (StatsAccumulator counts + validation.v2_stats counts).
STATS = [
    ("VPIP", lambda c: c["vpip"], lambda c: c["hands"], True),
    ("PFR", lambda c: c["pfr"], lambda c: c["hands"], True),
    ("3-bet", lambda c: c["threebet"], lambda c: c["threebet_opp"], True),
    ("fold to 3-bet", lambda c: c["f3b_fold"], lambda c: c["f3b_opp"], True),
    ("ATS", lambda c: c["steal_attempt"], lambda c: c["steal_opp"], True),
    ("fold to steal", lambda c: c["folded_to_steal"], lambda c: c["faced_steal"], True),
    ("BB fold vs BTN open", lambda c: c["bbd_fold"], lambda c: c["bbd_opp"], True),
    ("AF", lambda c: c["postflop_bets"] + c["postflop_raises"], lambda c: c["postflop_calls"], False),
    ("WTSD", lambda c: c["wtsd"], lambda c: c["saw_flop"], True),
    ("W$SD", lambda c: c["won_at_showdown"], lambda c: c["wtsd"], True),
    ("flop c-bet", lambda c: c["cbet_flop"], lambda c: c["cbet_opp"], True),
    ("c-bet heads-up", lambda c: c["cb_hu"], lambda c: c["cb_hu_opp"], True),
    ("c-bet multiway", lambda c: c["cb_mw"], lambda c: c["cb_mw_opp"], True),
    ("fold to c-bet HU", lambda c: c["fcb_fold"], lambda c: c["fcb_opp"], True),
    ("lead into raiser", lambda c: c["lead"], lambda c: c["lead_opp"], True),
    ("river fold vs 33%", lambda c: c["rf_33_fold"], lambda c: c["rf_33_opp"], True),
    ("river fold vs 75%", lambda c: c["rf_75_fold"], lambda c: c["rf_75_opp"], True),
    ("river fold vs 150%", lambda c: c["rf_150_fold"], lambda c: c["rf_150_opp"], True),
    ("river bluff share", lambda c: c["rb_all_bluff"], lambda c: c["rb_all"], True),
    ("river bluff >=75%", lambda c: c["rb_big_bluff"], lambda c: c["rb_big"], True),
    ("crumb bets", lambda c: c["crumb"], lambda c: c["post_aggr"], True),
]

_S4 = {"VPIP": "vpip", "PFR": "pfr", "3-bet": "threebet", "AF": "af", "WTSD": "wtsd"}
# Design §5 pool bands (moderate confidence); "reg" is the TAG.
POOL = {
    ("TAG", "fold to 3-bet"): (45, 62),
    ("TAG", "BB fold vs BTN open"): (35, 55),
    ("TAG", "fold to c-bet HU"): (40, 60),
    ("TAG", "lead into raiser"): (0, 10),
    ("TAG", "river fold vs 33%"): (15, 30),
    ("TAG", "river fold vs 75%"): (35, 50),
    ("TAG", "river fold vs 150%"): (55, 70),
    ("TAG", "river bluff >=75%"): (20, 40),
    ("Calling Station", "river bluff share"): (0, 8),
}


def band(arch: str, label: str) -> tuple[float, float] | None:
    if label == "crumb bets":
        return (0, 0)
    if label in _S4:
        return TARGETS[arch][_S4[label]]
    return POOL.get((arch, label))


def run_shard(spec: dict, lo: int, hi: int) -> tuple[dict, dict, float, float]:
    """Hands [lo, hi): (StatsAccumulator counts, v2_stats counts, seconds,
    seconds of that spent counting)."""
    t0 = time.perf_counter()
    counting = 0.0
    bots = _bots(spec)
    names = [b.name for b in bots]
    acc = StatsAccumulator(big_blind=spec["blinds"][1])
    extra: dict[str, Counter] = {n: Counter() for n in names}

    def on_end(hand, seat_to_player):
        nonlocal counting
        t = time.perf_counter()
        for name, cnt in hand_counts(hand.snapshot(reveal_all=True), seat_to_player, names).items():
            extra[name].update(cnt)
        counting += time.perf_counter() - t

    for h in range(lo, hi):
        acc.add_hand(_play(spec, bots, h, on_end=on_end))
    return acc.to_counts(), {n: dict(c) for n, c in extra.items()}, time.perf_counter() - t0, counting


def _fmt(v: float | None, pct: bool) -> str:
    if v is None:
        return "-"
    return f"{100 * v:.1f}" if pct else f"{v:.2f}"


def _band_s(b: tuple[float, float] | None) -> str:
    if b is None:
        return ""
    lo, hi = b
    return f"{lo:g}+" if hi >= 99 else f"{lo:g}-{hi:g}"


def report(shards: list[tuple[dict, dict, float, float]], hands: int, seed: int, workers: int, wall: float) -> str:
    per = []  # per shard: {arch: counters}
    for std, extra, *_ in shards:
        per.append(merge_counts(std, extra))
    cpu = sum(s[2] for s in shards)
    play = cpu - sum(s[3] for s in shards)
    tally = Counter()
    lines = [
        "PHASE-3 V2 SMOKE (P3.15). WARN-only: the v2 gate is phase 4; bands are the current",
        "STRATEGY §4 bands and the design §5 pool bands (moderate confidence; 'reg' = TAG).",
        f"  command : PYTHONPATH=. .venv/bin/python -m scripts.v2_validation --hands {hands} --seed {seed} --workers {workers}",
        f"  engine  : v2, Classic lineup nit tag lag station maniac tag, 5/10, 100bb, policy {policy_hash()}",
        f"  speed   : {hands:,} hands, {wall:.0f} s wall; per process {hands / play:,.0f} hands/s playing"
        f" ({hands / cpu:,.0f} with this script's counting)",
        "  rule    : PASS point in band; FAIL whole 95% CI outside; else WARN (CI clustered by 1k-hand shard)",
        "",
    ]
    for arch in TYPES:
        n = sum(p.get(arch, Counter())["hands"] for p in per)
        net = sum(p.get(arch, Counter())["net"] for p in per)
        lines.append(f"{arch}  ({n:,} seat-hands, {100 * net / 10 / max(n, 1):+.1f} bb/100)")
        for label, num, den, pct in STATS:
            pairs = [(num(p[arch]), den(p[arch])) for p in per if arch in p]
            r, lo, hi = ratio_ci(pairs)
            b = band(arch, label)
            scale = 100 if pct else 1
            v = verdict(*(None if x is None else scale * x for x in (r, lo, hi)), b)
            tally[v] += 1
            ci = "" if r is None else f"[{_fmt(lo, pct)}, {_fmt(hi, pct)}]"
            nd = sum(d for _, d in pairs)
            lines.append(f"  {label:20} {_fmt(r, pct):>7} {ci:16} n={nd:<7} {_band_s(b):>8}  {v}")
        lines.append("")
    lines.append(f"verdicts: PASS {tally['PASS']}, WARN {tally['WARN']}, FAIL {tally['FAIL']}"
                 f" (of {tally['PASS'] + tally['WARN'] + tally['FAIL']} banded cells)")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--hands", type=int, default=50_000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    spec = shard_spec(seed=args.seed, engine="v2")
    t0 = time.time()
    with process_pool(args.workers) as pool:
        futures = [pool.submit(run_shard, spec, lo, hi) for lo, hi in shard_bounds(args.hands, 1000)]
        shards = [f.result() for f in futures]
    text = report(shards, args.hands, args.seed, args.workers, time.time() - t0)
    print(text, end="")
    if args.out:
        with open(args.out, "w") as fh:
            fh.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
