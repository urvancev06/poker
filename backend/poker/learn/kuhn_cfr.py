"""Counterfactual Regret Minimization (CFR) on Kuhn poker.

Why Kuhn? It is the smallest poker game with a non-trivial equilibrium, and that
equilibrium is known in closed form, so the solver can be checked against the
analytic answer instead of merely being asserted correct.

The game (3-card deck J<Q<K, each player antes 1):
  - Player 0 acts: check ('p') or bet 1 ('b').
  - If P0 checks, P1 may check (showdown) or bet; if P1 bets, P0 may fold or call.
  - If P0 bets, P1 may fold or call.
  Showdowns: higher card wins the pot.

Vanilla CFR (Neller & Lanctot, 2013): at every information set we keep regret for
each action, play proportionally to positive regret, and accumulate an *average*
strategy that provably converges to a Nash equilibrium. It is the average
strategy, not the current one, that is the equilibrium.

Known facts we test against:
  - Game value to player 0 = -1/18 ≈ -0.0556 (P0 is at a disadvantage acting first).
  - Several pure components are stable across the whole equilibrium family
    (P0 never opens the Q; P1 always calls a bet with K, always folds J, …).
  - Exploitability (how much a best response beats the strategy) → 0.

The tiny game tree is hand-built here rather than driven through PokerKit: an
explicit 12-infoset tree is easier to read than a general engine, and this module
stands alone. PokerKit is for the real NLHE game.
"""

from __future__ import annotations

import random
from fractions import Fraction

# Actions: index 0 = 'p' (pass = check or fold), 1 = 'b' (bet = bet or call).
_ACTIONS = ("p", "b")
N_ACTIONS = 2
_CARD_NAME = {0: "J", 1: "Q", 2: "K"}

# The analytic game value to player 0.
EQUILIBRIUM_VALUE = -1.0 / 18.0

# All 6 distinct deals (player0 card, player1 card), each equally likely.
_DEALS = [(a, b) for a in range(3) for b in range(3) if a != b]

# Non-terminal histories and whose turn it is (len(history) % 2).
#   ""   -> P0 (open)        "p"  -> P1 (faces check)
#   "b"  -> P1 (faces bet)   "pb" -> P0 (checked, now faces bet)
# Terminal histories: pp, bp, bb, pbp, pbb.


def _is_terminal(history: str) -> bool:
    return history in ("pp", "bp", "bb", "pbp", "pbb")


def _terminal_value_p0(history: str, c0: int, c1: int) -> int:
    """Payoff to player 0 at a terminal history (their net chips, antes included)."""
    p0_wins_showdown = 1 if c0 > c1 else -1
    if history == "pp":            # both check: showdown for 1 each
        return p0_wins_showdown
    if history == "bp":            # P0 bet, P1 folded
        return 1
    if history == "pbp":           # P0 checked, P1 bet, P0 folded
        return -1
    if history in ("bb", "pbb"):   # a bet was called: showdown for 2 each
        return 2 * p0_wins_showdown
    raise ValueError(f"not terminal: {history!r}")


# --------------------------------------------------------------------------- #
# CFR
# --------------------------------------------------------------------------- #
class _Node:
    """One information set: regret + cumulative strategy for its two actions."""

    __slots__ = ("regret_sum", "strategy_sum")

    def __init__(self) -> None:
        self.regret_sum = [0.0, 0.0]
        self.strategy_sum = [0.0, 0.0]

    def strategy(self) -> list[float]:
        """Current strategy = positive regret, normalized (uniform if none)."""
        pos = [r if r > 0 else 0.0 for r in self.regret_sum]
        total = pos[0] + pos[1]
        if total > 0:
            return [pos[0] / total, pos[1] / total]
        return [0.5, 0.5]

    def average_strategy(self) -> list[float]:
        total = self.strategy_sum[0] + self.strategy_sum[1]
        if total > 0:
            return [self.strategy_sum[0] / total, self.strategy_sum[1] / total]
        return [0.5, 0.5]


def _cfr(nodes: dict[str, _Node], cards: tuple[int, int], history: str, p0: float, p1: float) -> float:
    """Recursive CFR; returns the node's expected value to the player to act."""
    player = len(history) % 2
    if _is_terminal(history):
        # Terminal value is from P0's view; flip for P1.
        v = _terminal_value_p0(history, cards[0], cards[1])
        return v if player == 0 else -v

    infoset = f"{cards[player]}:{history}"
    node = nodes.setdefault(infoset, _Node())
    strategy = node.strategy()
    # Accumulate the average-strategy numerator weighted by this player's reach.
    reach = p0 if player == 0 else p1
    node.strategy_sum[0] += reach * strategy[0]
    node.strategy_sum[1] += reach * strategy[1]

    util = [0.0, 0.0]
    node_util = 0.0
    for a in range(N_ACTIONS):
        next_history = history + _ACTIONS[a]
        if player == 0:
            util[a] = -_cfr(nodes, cards, next_history, p0 * strategy[a], p1)
        else:
            util[a] = -_cfr(nodes, cards, next_history, p0, p1 * strategy[a])
        node_util += strategy[a] * util[a]

    # Counterfactual regret update, weighted by the *opponent's* reach.
    cf_reach = p1 if player == 0 else p0
    for a in range(N_ACTIONS):
        node.regret_sum[a] += cf_reach * (util[a] - node_util)
    return node_util


# --------------------------------------------------------------------------- #
# Exploitability via exact best response (brute force over pure strategies)
# --------------------------------------------------------------------------- #
def _br_infosets(hero: int) -> list[str]:
    """Information set keys where ``hero`` is to act."""
    histories = ["", "pb"] if hero == 0 else ["p", "b"]
    return [f"{card}:{h}" for h in histories for card in range(3)]


def _value_p0(strat0, strat1, cards: tuple[int, int], history: str) -> float:
    """Expected value to P0 of a deal, given each player's strategy fn key->probs."""
    if _is_terminal(history):
        return float(_terminal_value_p0(history, cards[0], cards[1]))
    player = len(history) % 2
    probs = (strat0 if player == 0 else strat1)(f"{cards[player]}:{history}")
    total = 0.0
    for a in range(N_ACTIONS):
        if probs[a]:
            total += probs[a] * _value_p0(strat0, strat1, cards, history + _ACTIONS[a])
    return total


def game_value(avg: dict[str, list[float]]) -> float:
    """Exact value to P0 of BOTH players following the average strategy.

    Averaged over all 6 deals and computed exactly, with no sampling. A running mean
    of the self-play utility is not a substitute: it averages in the early
    near-uniform strategies, so it approaches -1/18 only as O(1/n) and can read
    further from the target at 200k iterations than at 20k."""

    def strat(key: str) -> list[float]:
        return avg.get(key, [0.5, 0.5])

    return sum(_value_p0(strat, strat, cards, "") for cards in _DEALS) / len(_DEALS)


def _best_response_value(avg: dict[str, list[float]], hero: int) -> float:
    """Exact value the best-responding ``hero`` achieves vs fixed average ``avg``.

    Kuhn is tiny: the hero has 6 binary information sets, so we enumerate all
    2**6 pure strategies and take the best. No belief bookkeeping needed.
    """
    infosets = _br_infosets(hero)

    def opp(key: str) -> list[float]:
        return avg.get(key, [0.5, 0.5])

    best = float("-inf")
    for mask in range(1 << len(infosets)):
        pure = {infosets[i]: ([1.0, 0.0] if (mask >> i) & 1 == 0 else [0.0, 1.0])
                for i in range(len(infosets))}

        def hero_strat(key: str) -> list[float]:
            return pure[key]

        if hero == 0:
            strat0, strat1 = hero_strat, opp
            val = sum(_value_p0(strat0, strat1, d, "") for d in _DEALS) / len(_DEALS)
        else:
            strat0, strat1 = opp, hero_strat
            val = -sum(_value_p0(strat0, strat1, d, "") for d in _DEALS) / len(_DEALS)
        best = max(best, val)
    return best


def exploitability(avg: dict[str, list[float]]) -> float:
    """NashConv: how much both players together gain by best-responding (→0)."""
    return _best_response_value(avg, 0) + _best_response_value(avg, 1)


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def _label(infoset: str) -> tuple[str, str, str]:
    card_idx, history = infoset.split(":")
    card = _CARD_NAME[int(card_idx)]
    spot = {
        "": "open",
        "p": "checked to",
        "b": "facing a bet",
        "pb": "checked, facing a bet",
    }.get(history, history)
    return card, history, f"{card} — {spot}"


def train(iterations: int = 20_000, seed: int = 0, checkpoints: int = 20) -> dict:
    """Run CFR self-play for ``iterations`` and return convergence + strategy.

    Returns a JSON-friendly dict:
      iterations, game_value (exact value of the average strategy), exploitability,
      trend: [{iterations, game_value, exploitability}] checkpoints,
      strategy: [{infoset, card, history, label, pass, bet}] sorted for display.
    """
    iterations = max(1, int(iterations))
    rng = random.Random(seed)
    nodes: dict[str, _Node] = {}
    deck = [0, 1, 2]

    trend: list[dict] = []
    step = max(1, iterations // max(1, checkpoints))

    for i in range(1, iterations + 1):
        rng.shuffle(deck)
        cards = (deck[0], deck[1])
        _cfr(nodes, cards, "", 1.0, 1.0)
        if i % step == 0 or i == iterations:
            avg = {k: n.average_strategy() for k, n in nodes.items()}
            trend.append(
                {
                    "iterations": i,
                    "game_value": round(game_value(avg), 4),
                    "exploitability": round(exploitability(avg), 4),
                }
            )

    avg = {k: n.average_strategy() for k, n in nodes.items()}
    strategy = []
    for infoset in sorted(nodes, key=lambda k: (k.split(":")[1], k.split(":")[0])):
        card, history, label = _label(infoset)
        probs = avg[infoset]
        strategy.append(
            {
                "infoset": infoset,
                "card": card,
                "history": history,
                "label": label,
                "pass": round(probs[0], 3),
                "bet": round(probs[1], 3),
            }
        )

    return {
        "iterations": iterations,
        "game_value": round(game_value(avg), 4),
        "equilibrium_value": round(float(Fraction(-1, 18)), 4),
        "exploitability": round(exploitability(avg), 4),
        "trend": trend,
        "strategy": strategy,
    }
