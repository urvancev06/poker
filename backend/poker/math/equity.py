"""Monte Carlo equity via treys.

Estimate a hero hand's equity against one or more opponents, where each opponent
is either a *range* (a set of combos from ``ranges.py``) or an unknown random
hand. We sample opponent holdings + the remaining board many times and let treys
pick the winner. Equity is the expected share of the pot (split pots divided).
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import TypeAlias

from treys import Card, Evaluator

from .cards import FULL_DECK, Combo

_EVAL = Evaluator()
# Cache the treys int for every card string once.
_INT = {c: Card.new(c) for c in FULL_DECK}

# An opponent is a range (iterable of combos) or None / "random" for any hand.
Opponent: TypeAlias = set[Combo] | list[Combo] | None | str


@dataclass(frozen=True)
class EquityResult:
    win: float       # fraction of trials hero is sole best
    tie: float       # fraction hero ties for best
    lose: float      # fraction hero is beaten
    equity: float    # expected pot share (ties split by number sharing)
    trials: int

    def as_pct(self) -> dict[str, float]:
        return {
            "win": round(self.win * 100, 2),
            "tie": round(self.tie * 100, 2),
            "lose": round(self.lose * 100, 2),
            "equity": round(self.equity * 100, 2),
        }


def _is_range(opp: Opponent) -> bool:
    return not (opp is None or (isinstance(opp, str) and opp == "random"))


def _sample_opponent(
    opp: Opponent, used: set[str], deck: list[str], rng: random.Random
) -> tuple[str, str] | None:
    """Pick a holding for one opponent that avoids ``used`` cards."""
    if _is_range(opp):
        combos = opp if isinstance(opp, (list, tuple)) else list(opp)
        for _ in range(64):  # rejection sample
            a, b = rng.choice(combos)
            if a not in used and b not in used:
                return (a, b)
        return None  # range fully blocked in this trial
    # random unknown hand: any two free cards
    free = [c for c in deck if c not in used]
    if len(free) < 2:
        return None
    a, b = rng.sample(free, 2)
    return (a, b)


def equity(
    hero: tuple[str, str] | list[str],
    board: tuple[str, ...] | list[str] = (),
    opponents: list[Opponent] | None = None,
    trials: int = 10_000,
    seed: int | None = None,
) -> EquityResult:
    """Equity of ``hero`` (2 cards) on ``board`` (0–5 cards) vs ``opponents``
    (default: one random hand)."""
    if opponents is None:
        opponents = [None]
    rng = random.Random(seed)

    hero = list(hero)
    board = list(board)
    hero_int = [_INT[c] for c in hero]
    board_int = [_INT[c] for c in board]
    need = 5 - len(board)

    # Materialise range opponents to lists once (faster sampling).
    opps = [list(o) if _is_range(o) else o for o in opponents]

    wins = ties = 0
    share_sum = 0.0
    completed = 0
    attempts = 0

    while completed < trials:
        used = set(hero) | set(board)
        holdings: list[list[int]] = []
        ok = True
        for o in opps:
            pick = _sample_opponent(o, used, FULL_DECK, rng)
            if pick is None:
                ok = False
                break
            used.add(pick[0])
            used.add(pick[1])
            holdings.append([_INT[pick[0]], _INT[pick[1]]])
        if not ok:
            # The opponent's range is fully blocked by the hero's cards and the board.
            # Drop the trial from the denominator entirely: counting it would land it
            # in `lose` and bias equity down. `attempts` bounds the loop so a range
            # that is always blocked can't spin forever.
            attempts += 1
            if attempts > trials * 4:
                break
            continue

        if need:
            free = [c for c in FULL_DECK if c not in used]
            drawn = rng.sample(free, need)
            full_board = board_int + [_INT[c] for c in drawn]
        else:
            full_board = board_int

        hero_score = _EVAL.evaluate(full_board, hero_int)
        opp_scores = [_EVAL.evaluate(full_board, h) for h in holdings]
        best_opp = min(opp_scores)

        if hero_score < best_opp:
            wins += 1
            share_sum += 1.0
        elif hero_score > best_opp:
            pass  # lose
        else:
            ties += 1
            sharers = 1 + sum(1 for s in opp_scores if s == hero_score)
            share_sum += 1.0 / sharers
        completed += 1

    # Denominator is the trials that reached a showdown; `or 1` returns zeros
    # rather than dividing by zero when every trial was blocked.
    n = completed or 1
    return EquityResult(
        win=wins / n,
        tie=ties / n,
        lose=(n - wins - ties) / n,
        equity=share_sum / n,
        trials=completed,
    )
