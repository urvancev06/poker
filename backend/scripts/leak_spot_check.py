"""Correct-plays battery for the leak detector.

A reviewer that flags a *correct* play trains bad habits, so the bar is near-zero
false positives: every standard play below must come back with NO leak. Two
deliberately bad plays are included as true positives; they must still be flagged,
so that a quiet detector can be told apart from a blind one.

    backend/.venv/bin/python scripts/leak_spot_check.py
"""

from __future__ import annotations

from poker.bots.preflop_strength import hand_class, percentile
from poker.coach import review_hand

POS = ["SB", "BB", "UTG", "MP", "CO", "BTN"]


def _a(seat, street, action, to=None):
    return {"player": seat, "seat": seat, "position": POS[seat], "street": street, "action": action, "to_amount": to}


# Persisted hands store the canonical DISPLAY names (what session.archetype_of holds).
_DISPLAY = {"nit": "Nit", "tag": "TAG", "lag": "LAG", "station": "Calling Station", "maniac": "Maniac"}


def _lineup(villain_seat, arch, hero_seat, button_player=0, n=6):
    seat_to_player = [(button_player + 1 + s) % n for s in range(n)]
    lu = ["Nit"] * n
    lu[seat_to_player[hero_seat]] = "hero"
    lu[seat_to_player[villain_seat]] = _DISPLAY[arch]
    return lu


def _hand(*, villain_seat, villain_arch, hero_seat, hero_cards, board, actions, net=0, showdown=False):
    return {
        "lineup": _lineup(villain_seat, villain_arch, hero_seat),
        "hero_seat": hero_seat,
        "button_player": 0,
        "blinds": [1, 2],
        "hero_cards": hero_cards,
        "board": board,
        "actions": actions,
        "hero_net": net,
        "went_to_showdown": showdown,
        "hand_index": 0,
    }


# Heads-up barrel skeleton: UTG(seat2)=villain opens, BB(seat1)=hero defends,
# villain barrels flop+turn, hero calls; the river action is supplied per spot.
def _barrel(hero_cards, board, villain_arch, river_actions, showdown=True):
    actions = [
        _a(2, "preflop", "raise", 6), _a(3, "preflop", "fold"), _a(4, "preflop", "fold"),
        _a(5, "preflop", "fold"), _a(0, "preflop", "fold"), _a(1, "preflop", "call"),
        _a(1, "flop", "check"), _a(2, "flop", "bet", 8), _a(1, "flop", "call"),
        _a(1, "turn", "check"), _a(2, "turn", "bet", 20), _a(1, "turn", "call"),
    ] + river_actions
    return _hand(villain_seat=2, villain_arch=villain_arch, hero_seat=1,
                 hero_cards=hero_cards, board=board, actions=actions, showdown=showdown)


def battery():
    spots = {}

    # Iso-raise 98o (~top 54%) over a limper. A limped pot is not a first-in spot,
    # so the opening range must not be applied to it at all.
    spots["iso-raise 98o over a limper (BTN)"] = (
        _hand(villain_seat=2, villain_arch="tag", hero_seat=5, hero_cards="9d8c", board="",
              actions=[_a(2, "preflop", "call"), _a(3, "preflop", "fold"), _a(4, "preflop", "fold"),
                       _a(5, "preflop", "raise", 8), _a(0, "preflop", "fold"), _a(1, "preflop", "fold")]),
        "raise", {"loose_open"},
    )

    # Standard 87s open from the BTN (~top 56%): inside the BTN opening range the
    # detector grades against, so no flag.
    spots["standard 87s RFI open (BTN, no limper)"] = (
        _hand(villain_seat=2, villain_arch="tag", hero_seat=5, hero_cards="8h7h", board="",
              actions=[_a(2, "preflop", "fold"), _a(3, "preflop", "fold"), _a(4, "preflop", "fold"),
                       _a(5, "preflop", "raise", 8), _a(0, "preflop", "fold"), _a(1, "preflop", "fold")]),
        "raise", {"loose_open"},
    )

    # TRUE POSITIVE: a genuinely loose RFI. 96o (~top 70%) opened folded-to from
    # the BTN is outside the BTN opening range, so it SHOULD flag loose_open.
    spots["TRUE POSITIVE: loose RFI open 96o (no limper)"] = (
        _hand(villain_seat=2, villain_arch="tag", hero_seat=5, hero_cards="9d6c", board="",
              actions=[_a(2, "preflop", "fold"), _a(3, "preflop", "fold"), _a(4, "preflop", "fold"),
                       _a(5, "preflop", "raise", 8), _a(0, "preflop", "fold"), _a(1, "preflop", "fold")]),
        "raise", set(),  # nothing forbidden: this spot is meant to flag loose_open
    )

    # Thin value check-raise: checking a strong hand to raise is NOT missed value.
    spots["thin value check-raise (flop)"] = (
        _hand(villain_seat=2, villain_arch="tag", hero_seat=1, hero_cards="Kh7d", board="Kd 7h 2c",
              actions=[_a(2, "preflop", "raise", 6), _a(3, "preflop", "fold"), _a(4, "preflop", "fold"),
                       _a(5, "preflop", "fold"), _a(0, "preflop", "fold"), _a(1, "preflop", "call"),
                       _a(1, "flop", "check"), _a(2, "flop", "bet", 8), _a(1, "flop", "raise", 24)]),
        "check", {"missed_value"},
    )

    # Disciplined fold vs a value double-barrel: NOT "you had the price".
    spots["disciplined fold vs value double-barrel"] = (
        _barrel("Ah9c", "Kc 7h 2d 5s", "tag", [_a(1, "turn", "fold")], showdown=False),
        "fold", {"fold_with_odds"},
    )
    # (river action absent: hand ends on the turn fold)

    # Set-mine: flatting a raise with 22 is not a limp, a loose open or a tight fold.
    spots["set-mine flat (22 vs open)"] = (
        _hand(villain_seat=2, villain_arch="tag", hero_seat=5, hero_cards="2h2d", board="",
              actions=[_a(2, "preflop", "raise", 6), _a(3, "preflop", "fold"), _a(4, "preflop", "fold"),
                       _a(5, "preflop", "call"), _a(0, "preflop", "fold"), _a(1, "preflop", "fold")]),
        "call", {"limp", "loose_open", "tight_fold"},
    )

    # Correct calldown vs a bluffy maniac (small river bet): NOT a call without odds.
    spots["correct calldown vs maniac (small river bet)"] = (
        _barrel("5h5d", "Ks Qd 7h 3c 2s", "maniac", [_a(1, "river", "check"), _a(2, "river", "bet", 6), _a(1, "river", "call")]),
        "call", {"call_no_odds"},
    )

    # TRUE POSITIVE: bluff-catching a nit's pot-sized river bet MUST flag call_no_odds.
    spots["TRUE POSITIVE: hero calls nit pot river bet"] = (
        _barrel("5h5d", "Ks Qd 7h 3c 2s", "nit", [_a(1, "river", "check"), _a(2, "river", "bet", 69), _a(1, "river", "call")]),
        "call", set(),  # nothing forbidden: this spot is meant to flag call_no_odds
    )
    return spots


def main():
    from poker.bots import archetypes
    cap = archetypes.make("tag").rfi_raise["BTN"]
    print(f"reg(TAG) BTN open cap ~top {cap*100:.0f}%  |  87s={percentile(hand_class(('8h','7h')))*100:.0f}% (inside, ok)  "
          f"96o={percentile(hand_class(('9d','6c')))*100:.0f}% (wider, flag)")
    print(f"{'spot':46}{'action':8}{'eq':>6}{'req':>6}  leaks")
    print("-" * 92)
    for name, (data, hero_action, _forbidden) in battery().items():
        rev = review_hand(data, equity_trials=4000)
        # the decision of interest is the last one matching the hero action
        decs = [d for d in rev["decisions"] if d["action"] == hero_action]
        d = decs[-1] if decs else None
        leaks = ",".join(l["type"] for l in (d["leaks"] if d else []))
        eq = "—" if not d or d["equity_pct"] is None else f"{d['equity_pct']:.0f}%"
        req = "—" if not d or d["required_pct"] is None else f"{d['required_pct']:.0f}%"
        print(f"{name:46}{hero_action:8}{eq:>6}{req:>6}  {leaks or '(none)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
