"""Which villains a decision is played against, and the equity against them (D21).

The live coach and the hand review both call these, so the same decision gets
the same villains, the same seeded equity and the same price in both places
(the review used to model every live villain, the coach only the contesting
ones).

* ``select_villains``: the villains contesting the pot are the live ones whose
  street bet reaches the level the hero faces (all live villains when none does,
  as in a check spot); ``behind`` is how many act after a call, the engine's fact
  when there is one.
* ``decision_key``: session, hand and history length, which seeds the sampled
  equity methods. A decision is the same decision live and in review.
* ``villain_equity``: equity v2 (``math.equity.equity_vs_ranges``) against the
  villains' modelled combo lists, exact heads-up and two-way after the flop, from
  the preflop table heads-up preflop, and sampled otherwise.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace

from ..math.cards import Combo
from ..math.equity import EquityResult, equity_vs_ranges, weights_from_combos

# Joint samples for the sampled methods. One number for the coach and the review:
# a different sample count is a different estimate.
EQUITY_SAMPLES = 4000


def select_villains(
    live: Sequence[int],
    street_bets: Sequence[int],
    level: int,
    to_act_after_call: int | None,
) -> tuple[list[int], int]:
    """``(contesting, behind)`` for a hero decision.

    ``live``: the villain seats still in the hand. ``street_bets``: every seat's
    bet on this street, by seat. ``level``: the street bet the hero must match to
    call (pass 0 when there is no bet to face). ``to_act_after_call``: the
    engine's fact, or None for a spot without facts (an old row, a scripted spot).
    """
    contesting = [s for s in live if street_bets[s] >= level] or list(live)
    if to_act_after_call is not None:
        behind = to_act_after_call
    else:
        behind = sum(1 for s in live if street_bets[s] < level)
    return contesting, behind


def decision_key(session_id: str, hand_index: int, history_len: int) -> str:
    """The key that seeds a decision's sampled equity: ``"session:hand:actions"``."""
    return f"{session_id}:{hand_index}:{history_len}"


def villain_equity(
    hero: Sequence[str],
    board: Sequence[str],
    ranges: Sequence[Sequence[Combo]],
    *,
    key: str,
    samples: int | None = None,
) -> EquityResult | None:
    """The hero's equity against each villain's modelled combos, or None when no
    villain has a combo the hero and the board leave open (or the ranges cannot
    all be held at once). An empty range counts as dropped, like a blocked one."""
    weights = [weights_from_combos(r) for r in ranges if r]
    if not weights:
        return None
    try:
        res = equity_vs_ranges(hero, board, weights, key=key, samples=samples or EQUITY_SAMPLES)
    except ValueError:
        return None
    return replace(res, dropped=res.dropped + len(ranges) - len(weights))
