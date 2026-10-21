"""Calibration probe: does the action-conditioned villain range predict reality
better than the static preflop range, without over-correcting into over-folding?

Ground truth comes from the river, where the board is complete and the sim knows
every hole card: for each spot in which the hero faces a single villain's river
bet we know whether the hero's hand actually beat the villain's. Over many spots
a well-calibrated model's mean predicted equity equals the mean actual win rate.
Two predictions per spot:

  * OLD = equity vs the villain's *static* preflop top-X% range
  * NEW = equity vs the villain's *action-conditioned* range

bias = mean(predicted) - mean(actual). The static range is too wide on the river,
so it over-rates hero equity (bias > 0) -> over-calling. A NEW bias near zero
means the error shrank; a negative one means it only moved into over-folding.

    backend/.venv/bin/python scripts/coach_calibration.py --hands 6000

Hands are dealt at 5/10 with 100bb stacks from seeded streams (deck of hand h,
decision k of player p in hand h), so a run depends only on --hands and --seed.
"""

from __future__ import annotations

import argparse
from collections import defaultdict

from treys import Card, Evaluator

from poker.bots import Bot, archetypes, build_context
from poker.coach.villain_model import condition_range, static_range, villain_line
from poker.engine import Hand
# The coach's own equity (exact on a heads-up river), so the probe measures what it shows.
from poker.coach.villains import villain_equity
from poker.rng import shuffled_deck, stream

_EVAL = Evaluator()
_LINEUP = ["nit", "tag", "lag", "station", "maniac", "tag"]
# Decision 1: the table's chip unit, 5/10 blinds and 1,000-chip (100bb) stacks.
_BLINDS = (5, 10)
_STACK = 1000


def _won(hero, villain, board) -> float:
    h = _EVAL.evaluate([Card.new(c) for c in board], [Card.new(c) for c in hero])
    v = _EVAL.evaluate([Card.new(c) for c in board], [Card.new(c) for c in villain])
    return 1.0 if h < v else 0.0 if h > v else 0.5


def run_probe(hands: int, seed: int = 0, eq_trials: int = 400):
    bots = [Bot(archetypes.make(n)) for n in _LINEUP]
    n = len(bots)
    rows = []                                   # (archetype, actual, old, new)
    for h in range(hands):
        button = h % n
        seat_to_player = [(button + 1 + k) % n for k in range(n)]
        decisions = [0] * n  # per-player decision number k, for the decision stream
        hand = Hand.new(
            table_size=n, blinds=_BLINDS, starting_stacks=_STACK,
            deck=shuffled_deck(stream(seed, "deck", h)),
        )
        while not hand.is_over:
            seat = hand.actor
            if seat is None:
                break
            ctx = build_context(hand, _BLINDS[1])
            if ctx.street == "river" and ctx.to_call > 0 and len(ctx.board) == 5:
                snap = hand.snapshot(reveal_all=True)
                bettors = {e.seat for e in snap.history if e.street == "river" and e.action in ("bet", "raise")}
                others_live = [s for s in range(n) if s != seat and not snap.seats[s].folded]
                if len(bettors) == 1 and len(others_live) == 1:
                    vseat = others_live[0]
                    vhole = hand.hole_cards(vseat)
                    if vseat in bettors and vhole:
                        hero, board = list(ctx.hole), list(ctx.board)
                        dead = set(hero) | set(board)
                        varch = bots[seat_to_player[vseat]].name
                        role, postflop = villain_line(snap.history, vseat)
                        key = f"calibration:{seed}:{h}"
                        old = villain_equity(hero, board, [static_range(varch, dead)], key=key, samples=eq_trials)
                        cr = condition_range(varch, board, role, postflop, dead)
                        new = villain_equity(hero, board, [cr.combos], key=key, samples=eq_trials)
                        if old is not None and new is not None:
                            rows.append((varch, _won(hero, vhole, board), old.equity, new.equity))
            player = seat_to_player[seat]
            rng = stream(seed, "decision", h, player, decisions[player])
            decisions[player] += 1
            hand.apply(bots[player].act(ctx, rng))
    return rows


def _summary(rows):
    def stats(sub):
        if not sub:
            return None
        a = sum(r[1] for r in sub) / len(sub)
        o = sum(r[2] for r in sub) / len(sub)
        nw = sum(r[3] for r in sub) / len(sub)
        mae_o = sum(abs(r[2] - r[1]) for r in sub) / len(sub)
        mae_n = sum(abs(r[3] - r[1]) for r in sub) / len(sub)
        return len(sub), a, o, nw, o - a, nw - a, mae_o, mae_n

    lines = ["",
             "CALIBRATION PROBE — hero faces a single villain's river bet",
             "  bias = mean(predicted equity) - mean(actual win rate);  >0 means the model OVER-rates the call",
             "=" * 92,
             f"{'villain':16}{'n':>6}{'actual':>9}{'old_pred':>10}{'new_pred':>10}{'bias_old':>10}{'bias_new':>10}{'MAE_old':>9}{'MAE_new':>9}",
             "-" * 92]
    by = defaultdict(list)
    for r in rows:
        by[r[0]].append(r)
    for arch in ("Nit", "TAG", "LAG", "Calling Station", "Maniac"):
        s = stats(by.get(arch, []))
        if s:
            nn, a, o, nw, bo, bn, mo, mn = s
            lines.append(f"{arch:16}{nn:>6}{a:>9.3f}{o:>10.3f}{nw:>10.3f}{bo:>+10.3f}{bn:>+10.3f}{mo:>9.3f}{mn:>9.3f}")
    s = stats(rows)
    nn, a, o, nw, bo, bn, mo, mn = s
    lines.append("-" * 92)
    lines.append(f"{'ALL':16}{nn:>6}{a:>9.3f}{o:>10.3f}{nw:>10.3f}{bo:>+10.3f}{bn:>+10.3f}{mo:>9.3f}{mn:>9.3f}")
    lines.append("=" * 92)
    verdict = "REDUCED" if abs(bn) < abs(bo) - 0.005 and bn > -0.04 else "CHECK"
    lines.append(f"overall: static over-rates by {bo:+.3f}; conditioned bias {bn:+.3f}  ->  error {verdict}")
    return "\n".join(lines), (bo, bn, nn)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hands", type=int, default=6000)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    rows = run_probe(args.hands, args.seed)
    text, _ = _summary(rows)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
