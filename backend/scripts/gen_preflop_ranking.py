"""Regenerate the 169-hand preflop strength ranking embedded in
poker/bots/preflop_strength.py.

Ranks every starting-hand class by heads-up all-in equity vs a random hand.
Prints a Python list literal to paste into HAND_RANKING.

    backend/.venv/bin/python scripts/gen_preflop_ranking.py
"""

from poker.math.cards import RANKS
from poker.math.equity import equity

SEED = 12345
TRIALS = 2500


def main() -> None:
    hands = []
    for i, r1 in enumerate(RANKS):
        for j, r2 in enumerate(RANKS):
            if i == j:
                hands.append((r1 + r2, [r1 + "s", r1 + "h"]))
            elif i > j:
                hands.append((r1 + r2 + "s", [r1 + "s", r2 + "s"]))
                hands.append((r1 + r2 + "o", [r1 + "s", r2 + "h"]))
    ranked = sorted(
        ((name, equity(cards, [], [None], trials=TRIALS, seed=SEED).equity) for name, cards in hands),
        key=lambda t: -t[1],
    )
    names = [n for n, _ in ranked]
    print(f"# {len(names)} hands, seed={SEED}, trials={TRIALS}")
    print(names)


if __name__ == "__main__":
    main()
