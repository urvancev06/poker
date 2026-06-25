"""Replay a persisted hand street-by-street and attach computed coaching + leak
detection to each hero decision (PROJECT.md Phase 6).

Everything is reconstructed from the stored action log (no engine needed): pot
and price are accounted from the action amounts; equity is computed vs the same
modelled villain ranges the live coach uses. Leaks are *computed* judgements
(range deviation vs the §2 baseline, or an EV error vs the price) — never
results-oriented, and labelled as math-based reads, not solver truth.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..bots.preflop_strength import hand_class, percentile
from ..math.classify import Draw, MadeTier, classify
from ..math.equity import equity
from ..math.odds import required_equity
from .villain_model import static_range as _villain_range

# §2 baseline opening frequencies (TAG) for preflop deviation checks.
_BASELINE_RFI = {"UTG": 0.15, "MP": 0.19, "CO": 0.27, "BTN": 0.45, "SB": 0.38, "BB": 0.0}


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
    equity_pct: float | None
    required_pct: float | None
    leaks: list[Leak] = field(default_factory=list)


def _board_prefix(street: str, board: list[str]) -> list[str]:
    k = {"preflop": 0, "flop": 3, "turn": 4, "river": 5}[street]
    return board[:k]


def _two(cards: str) -> list[str] | None:
    return [cards[0:2], cards[2:4]] if cards and len(cards) >= 4 else None


def _preflop_leaks(hero: list[str], pos: str, action: str, preflop_raises: int) -> list[Leak]:
    leaks: list[Leak] = []
    pct = percentile(hand_class(hero))
    cap = _BASELINE_RFI.get(pos, 0.0)
    opened_to_us = preflop_raises == 0
    if action in ("bet", "raise") and opened_to_us and cap and pct > cap + 0.05:
        leaks.append(
            Leak(
                "loose_open",
                f"Opened {hand_class(hero)} from {pos} (~top {pct*100:.0f}%) — wider than the "
                f"~{cap*100:.0f}% {pos} baseline. Tighten or have a plan.",
            )
        )
    if action == "call" and opened_to_us:
        leaks.append(
            Leak(
                "limp",
                f"Limped {hand_class(hero)} from {pos}. The baseline is raise-or-fold — "
                "open-raise it or fold.",
            )
        )
    if action == "fold" and opened_to_us and cap and pct <= cap * 0.5:
        leaks.append(
            Leak(
                "tight_fold",
                f"Folded {hand_class(hero)} from {pos} when folded to — it's inside the "
                f"~{cap*100:.0f}% opening range. That's too tight.",
            )
        )
    return leaks


def _postflop_leaks(
    street: str,
    action: str,
    to_call: int,
    equity_frac: float | None,
    required: float | None,
    made: MadeTier,
) -> list[Leak]:
    leaks: list[Leak] = []
    if equity_frac is None:
        return leaks
    if to_call > 0 and required is not None:
        if action == "call" and equity_frac < required - 0.03:
            leaks.append(
                Leak(
                    "call_no_odds",
                    f"Called needing ~{required*100:.0f}% equity with only ~{equity_frac*100:.0f}% "
                    "— a call without the price.",
                )
            )
        # Only flag a too-tight fold on flop/turn with a wide margin: equity vs the
        # modelled (preflop) range overstates true equity vs a polarised river bet,
        # so we'd rather miss a leak than wrongly tell you to call.
        if action == "fold" and street in ("flop", "turn") and equity_frac >= required + 0.15:
            leaks.append(
                Leak(
                    "fold_with_odds",
                    f"Folded with ~{equity_frac*100:.0f}% vs ~{required*100:.0f}% needed — "
                    "you likely had the price to continue (vs a modelled range).",
                )
            )
    if action == "check" and made >= MadeTier.TWO_PAIR:
        leaks.append(
            Leak(
                "missed_value",
                f"Checked {made.name.replace('_', ' ').lower()} — a strong hand that usually wants "
                "to bet for value.",
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

    committed = [0] * n
    committed[0], committed[1] = sb, bb  # PokerKit seats 0=SB, 1=BB
    pot = sb + bb
    street_max = bb
    cur_street = "preflop"
    preflop_raises = 0
    folded: set[int] = set()

    streets: dict[str, dict] = {}
    decisions: list[Decision] = []

    for a in actions:
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
                ranges = [_villain_range(lineup[seat_to_player[s]], dead) for s in live]
                ranges = [r for r in ranges if r]
                if ranges:
                    eq_frac = equity(hero, board_now, ranges, trials=equity_trials, seed=0).equity
            required = required_equity(to_call, pot) if to_call > 0 else None

            leaks: list[Leak] = []
            if cur_street == "preflop":
                leaks += _preflop_leaks(hero, a["position"], act, preflop_raises)
            else:
                leaks += _postflop_leaks(cur_street, act, to_call, eq_frac, required, hc.made)

            decisions.append(
                Decision(
                    street=cur_street,
                    board=board_now,
                    pot=pot,
                    to_call=to_call,
                    action=act,
                    to_amount=to,
                    hand_label=hc.label or hc.made.name.replace("_", " ").lower(),
                    equity_pct=None if eq_frac is None else round(eq_frac * 100, 1),
                    required_pct=None if required is None else round(required * 100, 1),
                    leaks=leaks,
                )
            )

        # advance the accounting
        if act in ("bet", "raise") and to is not None:
            pot += to - committed[seat]
            committed[seat] = to
            street_max = max(street_max, to)
            if cur_street == "preflop":
                preflop_raises += 1
        elif act == "call":
            pot += street_max - committed[seat]
            committed[seat] = street_max
        elif act == "fold":
            folded.add(seat)

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


def leak_summary(records_data: list[dict], equity_trials: int = 1200) -> dict:
    """Aggregate leaks across many hands into an honest report."""
    by_type: dict[str, dict] = {}
    examples: list[dict] = []
    hands_reviewed = 0
    for data in records_data:
        if not isinstance(data, dict) or "actions" not in data:
            continue
        hands_reviewed += 1
        review = review_hand(data, equity_trials=equity_trials)
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
