"""Phase-3 v2 smoke stats beyond ``StatsAccumulator``: the design §5 pool stats.

``hand_counts`` reads one finished hand (its ``snapshot(reveal_all=True)``) and
returns per-player integer counters:

- ``f3b_opp/f3b_fold``: the first preflop raiser facing exactly one re-raise;
- ``bbd_opp/bbd_fold``: the BB facing a folded-to BTN open after the SB folds;
- ``cb_hu_opp/cb_hu``, ``cb_mw_opp/cb_mw``: flop c-bet heads-up and multiway;
- ``fcb_opp/fcb_fold``: heads-up, the caller facing the raiser's flop c-bet;
- ``lead_opp/lead``: a caller betting the flop before the preflop raiser acts;
- ``rf_<b>_opp/rf_<b>_fold``: heads-up, facing the first river bet in size
  bucket ``b`` (33, 75 or 150 per cent of the pot);
- ``rb_all/rb_all_bluff``, ``rb_big/rb_big_bluff``: first river bets, all
  sizes and >= 75% pot, and those made with hs < 0.5 (the bluff share);
- ``post_aggr/crumb``: postflop bets and raises, and those that leave less
  than 30% of the resulting pot behind without jamming (must be 0).

Counts are plain sums, so shards merge exactly; ``ratio_ci`` gives a
shard-clustered 95% CI and ``verdict`` applies the design §5 pass rule.
"""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Sequence

from poker.math.board import board_cache

# Bucket name -> [lo, hi) as a share of the pot before the bet (design §5:
# reg river folds 15-30% vs 33% pot, 35-50% vs 75%, 55-70% vs 150%).
RIVER_BUCKETS = {"33": (0.20, 0.45), "75": (0.60, 0.90), "150": (1.25, 1.75)}
BIG_RIVER = 0.75
BLUFF_HS = 0.5
CRUMB_POT = 0.30  # poker.strategy.sizing.CRUMB_POT


def _bucket(size: float) -> str | None:
    for name, (lo, hi) in RIVER_BUCKETS.items():
        if lo <= size < hi:
            return name
    return None


def hand_counts(snap, seat_to_player: Sequence[int], names: Sequence[str]) -> dict[str, Counter]:
    """Counters by name for one finished hand (``names[player]``)."""
    out: dict[str, Counter] = {n: Counter() for n in names}

    def c(seat: int) -> Counter:
        return out[names[seat_to_player[seat]]]

    pot = sum(snap.blinds)
    stack: dict[int, int] = {}
    folded: set[int] = set()
    street = "preflop"
    tot: dict[int, int] = {}
    bets = 0                       # bets and raises on this street
    raises = 0                     # preflop raises so far
    limpers = 0
    opener = btn_open = None
    sb_folded = False
    pfr: int | None = None
    acted: set[int] = set()        # seats that have acted on this street
    live_at_street = 0
    cbet_by: int | None = None     # the raiser's flop c-bet stands, unanswered
    river_bet: tuple[int, str | None] | None = None

    for e in snap.history:
        if e.street != street:
            street, tot, bets, acted, cbet_by, river_bet = e.street, {}, 0, set(), None, None
            live_at_street = sum(1 for s in stack if s not in folded)
        stack.setdefault(e.seat, (e.stack_after or 0) + e.added)
        me = c(e.seat)
        aggr = e.action in ("bet", "raise")

        if street == "preflop":
            if raises == 2 and e.seat == opener:
                me["f3b_opp"] += 1
                me["f3b_fold"] += e.action == "fold"
            if e.position == "SB" and btn_open is not None and raises == 1:
                sb_folded = e.action == "fold"
            if e.position == "BB" and btn_open is not None and raises == 1 and sb_folded:
                me["bbd_opp"] += 1
                me["bbd_fold"] += e.action == "fold"
            if aggr:
                if raises == 0:
                    opener = e.seat
                    if limpers == 0 and e.position == "BTN":
                        btn_open = e.seat
                raises += 1
                pfr = e.seat
            elif e.action == "call" and raises == 0:
                limpers += 1
        else:
            if aggr:
                me["post_aggr"] += 1
                level = max(tot.values(), default=0)
                pot_after = pot + e.added + (e.to_amount - level)
                opp = max((stack[s] + tot.get(s, 0) for s in stack if s not in folded and s != e.seat),
                          default=0)
                behind = min(e.stack_after or 0, opp - e.to_amount)
                me["crumb"] += 0 < behind < CRUMB_POT * pot_after
            if street == "flop" and pfr is not None and pfr not in folded:
                if e.seat == pfr and bets == 0:
                    key = "cb_hu" if live_at_street == 2 else "cb_mw"
                    me[key + "_opp"] += 1
                    me[key] += e.action == "bet"
                    if e.action == "bet" and live_at_street == 2:
                        cbet_by = e.seat
                elif e.seat != pfr and bets == 0 and pfr not in acted:
                    me["lead_opp"] += 1
                    me["lead"] += e.action == "bet"
                elif cbet_by is not None and e.seat != pfr and bets == 1:
                    me["fcb_opp"] += 1
                    me["fcb_fold"] += e.action == "fold"
            if street == "river":
                if e.action == "bet" and bets == 0:
                    size = e.to_amount / pot
                    bluff = bool(e.hole_cards) and board_cache(snap.board).hs(e.hole_cards) < BLUFF_HS
                    me["rb_all"] += 1
                    me["rb_all_bluff"] += bluff
                    if size >= BIG_RIVER:
                        me["rb_big"] += 1
                        me["rb_big_bluff"] += bluff
                    river_bet = (e.seat, _bucket(size)) if live_at_street == 2 else None
                elif river_bet is not None and bets == 1 and e.seat != river_bet[0]:
                    if river_bet[1] is not None:
                        me[f"rf_{river_bet[1]}_opp"] += 1
                        me[f"rf_{river_bet[1]}_fold"] += e.action == "fold"
                    river_bet = None

        pot += e.added
        stack[e.seat] = e.stack_after if e.stack_after is not None else stack[e.seat] - e.added
        tot[e.seat] = e.street_total
        acted.add(e.seat)
        bets += aggr
        if e.action == "fold":
            folded.add(e.seat)
    return out


def merge_counts(*parts: dict[str, dict[str, int]]) -> dict[str, Counter]:
    """Sum counter dicts by name. ``Counter.update``, not ``+``: ``+`` drops
    negative and zero entries, and ``net`` is negative for a losing type."""
    out: dict[str, Counter] = {}
    for part in parts:
        for name, cnt in part.items():
            out.setdefault(name, Counter()).update(cnt)
    return out


def ratio_ci(shards: Sequence[tuple[float, float]]) -> tuple[float | None, float | None, float | None]:
    """Sum(num) / sum(den) with a 95% CI clustered by shard (the linearised
    ratio estimator), or ``(None,)*3`` with no denominator."""
    den = sum(d for _, d in shards)
    if not den:
        return None, None, None
    r = sum(n for n, _ in shards) / den
    k = sum(1 for _, d in shards if d)
    if k < 2:
        return r, r, r
    var = k / (k - 1) * sum((n - r * d) ** 2 for n, d in shards) / den ** 2
    half = 1.96 * math.sqrt(var)
    return r, r - half, r + half


def verdict(point: float | None, lo: float | None, hi: float | None,
            band: tuple[float, float] | None) -> str:
    """Design §5: PASS if the point is in the band, FAIL if the whole 95% CI is
    outside it, else WARN; '-' with no band, 'n/a' with no sample."""
    if point is None:
        return "n/a"
    if band is None:
        return "-"
    blo, bhi = band
    if blo <= point <= bhi:
        return "PASS"
    if hi < blo or lo > bhi:
        return "FAIL"
    return "WARN"
