"""Replay a persisted hand street-by-street and attach computed coaching + leak
detection to each hero decision (PROJECT.md Phase 6).

Everything is reconstructed from the stored action log (no engine needed): pot
and price are accounted from the action amounts; equity is computed vs the same
modelled villain ranges the live coach uses. Leaks are *computed* judgements
(range deviation vs the §2 baseline, or an EV error vs the price) — never
results-oriented, and labelled as math-based reads, not solver truth.
"""

from __future__ import annotations

from collections import namedtuple
from dataclasses import dataclass, field

from ..bots.preflop_ranges import RFI_COMBOS, has_rfi, in_rfi
from ..bots.preflop_strength import hand_class
from ..math.cards import canonical_combo
from ..math.classify import Draw, MadeTier, PairStrength, classify, pair_strength
from ..math.equity import equity
from ..math.odds import implied_required_equity, required_equity
# The price model is shared with the live coach ON PURPOSE: the reviewer must judge a
# decision by exactly the rule the coach advised it with, or the app contradicts itself
# (it did — the reviewer used the raw price and raw equity while the coach used the
# implied-adjusted price and realized equity, so a call the coach called "Call." could
# be booked as a `call_no_odds` leak). These stay private to the coach package.
from .coach import _implied_adjustment, _realization_factor
from .villain_model import condition_range, villain_line

# Judge opens by EXACT MEMBERSHIP in STRATEGY.md §2's positional hand lists.
#
# This replaces a percentile comparison against the TAG bot's `rfi_raise`, which was
# the §2 *percentage labels* used as code inputs and scaled x1.25. That baseline did
# not discriminate: opening exactly the §2 range produced "too loose" flags (44, T9s,
# 33, 98s...), while opening 1.5-1.7x wider produced none, and `tight_fold` never fired
# at all. See audit F-01/F-02 and bots/preflop_ranges.py for the full reasoning.
#
# With an explicit list, in-range and out-of-range are exact, so the old +0.05 slack and
# the `cap * 0.5` fold threshold are gone — there is nothing left for them to absorb.

# Lightweight history item for villain_line (it reads .seat/.street/.action).
_HE = namedtuple("_HE", "seat street action")


@dataclass
class Leak:
    type: str
    note: str


@dataclass
class Decision:
    street: str
    board: list[str]
    pot: int
    to_call: int
    action: str
    to_amount: int | None
    hand_label: str
    equity_pct: float | None            # raw Monte Carlo equity
    required_pct: float | None          # the DECISION price (implied/reverse-adjusted)
    realized_pct: float | None = None   # equity x realization factor — what the leak judges
    required_direct_pct: float | None = None  # raw pot odds, before the implied adjustment
    leaks: list[Leak] = field(default_factory=list)


def _board_prefix(street: str, board: list[str]) -> list[str]:
    k = {"preflop": 0, "flop": 3, "turn": 4, "river": 5}[street]
    return board[:k]


def _two(cards: str) -> list[str] | None:
    return [cards[0:2], cards[2:4]] if cards and len(cards) >= 4 else None


def _preflop_leaks(hero: list[str], pos: str, action: str, preflop_raises: int, num_limpers: int) -> list[Leak]:
    leaks: list[Leak] = []
    # Only judge against the RFI (open) baseline in a *genuine* first-in spot:
    # folded to us, no prior raise AND no limpers. An iso-raise over a limper, a
    # 3-bet, or a flat facing a raise is a different decision and must not be
    # graded as a loose open / a limp / a too-tight fold.
    opened_to_us = preflop_raises == 0 and num_limpers == 0
    if not opened_to_us:
        return leaks

    cls = hand_class(hero)
    # The BB has no opening range at all, so nothing here is judgeable from that seat.
    judgeable = has_rfi(pos)
    in_range = judgeable and in_rfi(pos, canonical_combo(hero[0], hero[1]))
    width = RFI_COMBOS.get(pos, 0)

    if action in ("bet", "raise") and judgeable and not in_range:
        leaks.append(
            Leak(
                "loose_open",
                f"Opened {cls} from {pos} — it isn't in the {pos} opening range "
                f"(STRATEGY.md §2, {width} combos). Tighten or have a plan.",
            )
        )
    if action == "call":
        leaks.append(
            Leak(
                "limp",
                f"Limped {cls} from {pos}. The baseline is raise-or-fold — "
                "open-raise it or fold.",
            )
        )
    if action == "fold" and judgeable and in_range:
        leaks.append(
            Leak(
                "tight_fold",
                f"Folded {cls} from {pos} when folded to — it's in the {pos} opening "
                f"range (STRATEGY.md §2). That's too tight.",
            )
        )
    return leaks


def _postflop_leaks(
    street: str,
    action: str,
    to_call: int,
    equity_frac: float | None,
    required: float | None,
) -> list[Leak]:
    """EV-error reads on a postflop decision, judged against the *conditioned*
    villain range (so a disciplined fold vs a value barrel isn't called a leak,
    and a correct call vs a bluffy line isn't either). ``missed_value`` is handled
    separately (it needs a check-through lookahead).

    ``equity_frac`` is REALIZED equity and ``required`` is the implied/reverse-adjusted
    price — the same two numbers the live coach compared when it advised this decision.
    They must stay in step with coach.py or the app contradicts its own advice (F-17)."""
    leaks: list[Leak] = []
    if equity_frac is None or to_call <= 0 or required is None:
        return leaks
    if action == "call" and equity_frac < required - 0.05:
        leaks.append(
            Leak(
                "call_no_odds",
                f"Called needing ~{required*100:.0f}% but only realizing ~{equity_frac*100:.0f}% "
                "vs their conditioned range — a call without the price.",
            )
        )
    # Too-tight fold: realized equity clears the price by more than the tolerance.
    #
    # The river used to be excluded and the margin was 0.18 against 0.05 for the
    # opposite error — a 3.6x asymmetry that made this rule near-silent, and silent
    # precisely on the street where bluff-catching decisions concentrate (audit F-19).
    # The river is in fact the ONE street where the comparison is exactly right: the
    # action closes, so realization is 1.0 and realized equity IS raw equity.
    #
    # The tolerance is now symmetric with `call_no_odds` at 0.05. The remaining
    # asymmetry is structural rather than a hand-tuned constant: `_realization_factor`
    # already discounts equity below raw whenever money is behind, which biases this
    # rule toward silence off the river without needing a second fudge factor.
    if action == "fold" and equity_frac >= required + 0.05:
        leaks.append(
            Leak(
                "fold_with_odds",
                f"Folded realizing ~{equity_frac*100:.0f}% vs the ~{required*100:.0f}% needed "
                "(vs their conditioned range) — you likely had the price to continue.",
            )
        )
    return leaks


def review_hand(data: dict, equity_trials: int = 1800) -> dict:
    lineup: list[str] = data["lineup"]
    n = len(lineup)
    hero_seat = data["hero_seat"]
    button_player = data["button_player"]
    seat_to_player = [(button_player + 1 + s) % n for s in range(n)]
    sb, bb = tuple(data.get("blinds", (1, 2)))
    board_full = data["board"].split() if data.get("board") else []
    hero = _two(data.get("hero_cards", ""))
    actions = data.get("actions", [])

    start_stacks = list(data.get("start_stacks") or [])
    committed = [0] * n
    committed[0], committed[1] = sb, bb  # PokerKit seats 0=SB, 1=BB
    # Cumulative across the whole hand (``committed`` resets each street), so we can
    # reconstruct each seat's remaining stack — the implied-odds term needs it.
    total_committed = [0] * n
    total_committed[0], total_committed[1] = sb, bb
    pot = sb + bb
    street_max = bb
    cur_street = "preflop"
    preflop_raises = 0
    num_limpers = 0
    folded: set[int] = set()
    history_entries: list = []          # _HE items seen so far, for villain_line
    value_checks: list = []             # (Decision, action_index, street, made) for missed-value lookahead

    streets: dict[str, dict] = {}
    decisions: list[Decision] = []

    for idx, a in enumerate(actions):
        seat = a["seat"]
        act = a["action"]
        street = a["street"]
        to = a["to_amount"]
        if street != cur_street:
            cur_street = street
            committed = [0] * n
            street_max = 0

        board_now = _board_prefix(cur_street, board_full)
        streets.setdefault(cur_street, {"street": cur_street, "board": board_now, "actions": []})
        streets[cur_street]["actions"].append(
            {
                "player": a["player"],
                "position": a["position"],
                "action": act,
                "to_amount": to,
                "is_hero": seat == hero_seat,
            }
        )

        if seat == hero_seat and hero is not None:
            to_call = max(0, street_max - committed[seat])
            hc = classify(hero, board_now)
            live = [s for s in range(n) if s != hero_seat and s not in folded]
            eq_frac: float | None = None
            if live and cur_street != "preflop":
                dead = set(hero) | set(board_now)
                # Same model the live coach uses: each villain's range narrowed by
                # the line they've actually taken this hand (not their static open).
                ranges = []
                for s in live:
                    role, postflop = villain_line(history_entries, s)
                    cr = condition_range(lineup[seat_to_player[s]], board_now, role, postflop, dead)
                    if cr.combos:
                        ranges.append(cr.combos)
                if ranges:
                    eq_frac = equity(hero, board_now, ranges, trials=equity_trials, seed=0).equity

            # Price + realized equity, computed by the SAME rule the live coach used when
            # it advised this decision (coach.py:328-368). Judging a call by a different
            # rule than the one it was advised under is how the app came to contradict
            # itself; see audit F-17.
            required = required_direct = realized = None
            if to_call > 0:
                hero_stack = (start_stacks[hero_seat] - total_committed[hero_seat]) if start_stacks else 0
                contesting = [s for s in live if committed[s] >= street_max]
                players_behind = sum(1 for s in live if committed[s] < street_max)
                villain_stacks = [
                    (start_stacks[s] - total_committed[s]) if start_stacks else 0
                    for s in (contesting or live)
                ]
                is_river = len(board_full) == 5 and cur_street == "river"
                all_villains_allin = bool(villain_stacks) and all(v == 0 for v in villain_stacks)
                action_closed = is_river or to_call >= hero_stack or all_villains_allin

                is_strong = hc.made >= MadeTier.TWO_PAIR
                is_pair = hc.made == MadeTier.PAIR
                is_draw = Draw.FLUSH_DRAW in hc.draws or Draw.OPEN_ENDED in hc.draws
                pair_str = pair_strength(hero, board_now) if is_pair else PairStrength.NONE

                effective_behind = min(hero_stack, max(villain_stacks, default=0))
                implied_adj, _note = _implied_adjustment(
                    street=cur_street,
                    is_pocket_pair=(hero[0][0] == hero[1][0]),
                    is_draw=is_draw,
                    made_tier=hc.made,
                    pair_str=pair_str,
                    pot=pot,
                    behind=effective_behind,
                    action_closed=action_closed,
                )
                required_direct = required_equity(to_call, pot)
                required = implied_required_equity(to_call, pot, implied_adj)
                if eq_frac is not None:
                    r = _realization_factor(
                        is_strong=is_strong,
                        is_pair=is_pair,
                        is_draw=is_draw,
                        in_position=all(hero_seat > s for s in (contesting or live)),
                        num_opponents=len(contesting or live),
                        players_behind=players_behind,
                        street=cur_street,
                        action_closed=action_closed,
                    )
                    realized = eq_frac * r

            leaks: list[Leak] = []
            if cur_street == "preflop":
                leaks += _preflop_leaks(hero, a["position"], act, preflop_raises, num_limpers)
            else:
                leaks += _postflop_leaks(cur_street, act, to_call, realized, required)

            decision = Decision(
                street=cur_street,
                board=board_now,
                pot=pot,
                to_call=to_call,
                action=act,
                to_amount=to,
                hand_label=hc.label or hc.made.name.replace("_", " ").lower(),
                equity_pct=None if eq_frac is None else round(eq_frac * 100, 1),
                required_pct=None if required is None else round(required * 100, 1),
                realized_pct=None if realized is None else round(realized * 100, 1),
                required_direct_pct=None if required_direct is None else round(required_direct * 100, 1),
                leaks=leaks,
            )
            decisions.append(decision)
            # A checked strong hand is a missed-value candidate — but only if the
            # street checks THROUGH (no later bet/raise); resolved in a post-pass so
            # check-raises and check-calls aren't falsely flagged.
            if cur_street != "preflop" and act == "check" and hc.made >= MadeTier.TWO_PAIR:
                value_checks.append((decision, idx, cur_street, hc.made))

        # advance the accounting
        if act in ("bet", "raise") and to is not None:
            pot += to - committed[seat]
            total_committed[seat] += to - committed[seat]
            committed[seat] = to
            street_max = max(street_max, to)
            if cur_street == "preflop":
                preflop_raises += 1
        elif act == "call":
            pot += street_max - committed[seat]
            total_committed[seat] += street_max - committed[seat]
            committed[seat] = street_max
            if cur_street == "preflop" and preflop_raises == 0:
                num_limpers += 1  # a preflop call with no raise yet = a limp
        elif act == "fold":
            folded.add(seat)

        history_entries.append(_HE(seat, street, act))

    # Missed-value: a checked strong hand only counts if the street checked THROUGH
    # after it (no later bet/raise by anyone) — otherwise it was a check-raise or a
    # check-call, not a missed bet.
    for decision, idx, street, made in value_checks:
        aggressed_after = False
        for x in actions[idx + 1:]:
            if x["street"] != street:
                break
            if x["action"] in ("bet", "raise"):
                aggressed_after = True
                break
        if not aggressed_after:
            decision.leaks.append(
                Leak(
                    "missed_value",
                    f"Checked {made.name.replace('_', ' ').lower()} and the street checked through "
                    "— a strong hand that usually wants a value bet.",
                )
            )

    all_leaks = [
        {"hand_index": data.get("hand_index"), "street": d.street, **leak.__dict__}
        for d in decisions
        for leak in d.leaks
    ]
    return {
        "hand_index": data.get("hand_index"),
        "hero_cards": hero,
        "board": board_full,
        "hero_net": data.get("hero_net"),
        "went_to_showdown": data.get("went_to_showdown"),
        "streets": list(streets.values()),
        "decisions": [
            {**d.__dict__, "leaks": [leak.__dict__ for leak in d.leaks]} for d in decisions
        ],
        "leaks": all_leaks,
    }


# Reviewing a hand costs a Monte Carlo run per hero decision, and the leak report
# re-reviewed every hand on every request: ~13.4 s for 200 hands, on every History
# mount. A stored hand is immutable, so the only thing that can change its verdict is
# a change to this package -- hence the version stamp in the key. Bounded so a long
# session cannot grow it without limit.
_REVIEW_CACHE: dict[tuple, dict] = {}
_CACHE_MAX = 5000
# Bump when anything that changes a leak verdict changes (thresholds, price model,
# ranges). Forgetting to bump serves stale verdicts; bumping needlessly only costs
# one recomputation.
_REVIEW_VERSION = 2


def _cache_key(data: dict, equity_trials: int) -> tuple | None:
    sid, idx = data.get("session_id"), data.get("hand_index")
    if sid is None or idx is None:
        return None
    return (_REVIEW_VERSION, sid, idx, equity_trials)


def review_hand_cached(data: dict, equity_trials: int = 1200) -> dict:
    """``review_hand`` memoised on (session, hand index, trials, review version)."""
    key = _cache_key(data, equity_trials)
    if key is None:
        return review_hand(data, equity_trials=equity_trials)
    hit = _REVIEW_CACHE.get(key)
    if hit is not None:
        return hit
    result = review_hand(data, equity_trials=equity_trials)
    if len(_REVIEW_CACHE) >= _CACHE_MAX:
        _REVIEW_CACHE.clear()
    _REVIEW_CACHE[key] = result
    return result


def leak_summary(records_data: list[dict], equity_trials: int = 1200) -> dict:
    """Aggregate leaks across many hands into an honest report."""
    by_type: dict[str, dict] = {}
    examples: list[dict] = []
    hands_reviewed = 0
    for data in records_data:
        if not isinstance(data, dict) or "actions" not in data:
            continue
        hands_reviewed += 1
        review = review_hand_cached(data, equity_trials=equity_trials)
        for leak in review["leaks"]:
            entry = by_type.setdefault(leak["type"], {"type": leak["type"], "count": 0})
            entry["count"] += 1
            if len(examples) < 30:
                examples.append(leak)
    return {
        "hands_reviewed": hands_reviewed,
        "by_type": sorted(by_type.values(), key=lambda e: -e["count"]),
        "examples": examples,
    }
