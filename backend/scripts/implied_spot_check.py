"""Implied / reverse-implied odds battery + calibration.

Two things this must prove (per the design review):
  1. the set-mine flip lands at the right PLACE — 22 turns Fold->Call as the stack
     behind grows, and that boundary sits near the rule-of-15 (~15x the call), not
     at 8x (too loose) or 25x (too tight); the endpoints prove it moves, the
     boundary proves it moves at the right place;
  2. reverse-implied (Y) fires on a dominated hand (-> fold) but does NOT over-fire
     on a decent non-premium made hand (which must still call) — both directions,
     because quiet over-folding dressed up as "reverse implied" is the failure mode.

    backend/.venv/bin/python scripts/implied_spot_check.py
"""

from __future__ import annotations

from poker.coach import build_coaching
from poker.coach.coach import _SET_MINE_RATE
from poker.engine.types import GameState, HistoryEntry, LegalActions
from scripts.coach_spot_check import POS, _FakeSession, _seat


def _spot(hero, board, history, villain_arch, to_call, pot, hero_seat, villain_seat,
          behind, can_check=False, trials=4000):
    """One spot with explicit stack-behind (caps implied odds)."""
    seats = []
    for i in range(6):
        if i == hero_seat:
            seats.append(_seat(i, hole=list(hero), bet=0, stack=behind, actor=True))
        elif i == villain_seat:
            seats.append(_seat(i, bet=to_call, stack=behind))
        else:
            seats.append(_seat(i, folded=True))
    legal = LegalActions(
        can_fold=True, can_check=can_check, can_call=to_call > 0, call_amount=to_call,
        can_bet=can_check, can_raise=to_call > 0, min_raise_to=to_call * 2 or 4, max_raise_to=behind,
    )
    street = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}[len(board)]
    state = GameState(
        table_size=6, button=5, blinds=(1, 2), street=street, board=list(board),
        seats=seats, pots=[], total_pot=pot, actor=hero_seat, legal_actions=legal,
        is_over=False, history=history,
    )
    fake = _FakeSession(state, hero_seat, [villain_seat], {villain_seat: villain_arch})
    return build_coaching(fake, trials=trials)


# --- set-mine facing a 3-bet IN POSITION: 22 with no direct odds, relies on set
# value (position is what makes set-mining work). hero (BTN, seat5) opens, villain
# (BB, seat1) 3-bets, hero calls in position.
_3BET_HIST = [
    HistoryEntry(5, POS[5], "preflop", "raise", None),   # hero open (BTN)
    HistoryEntry(1, POS[1], "preflop", "raise", None),   # villain 3-bet (BB)
]


def setmine(behind, call=14, pot=29, villain="TAG"):
    return _spot(["2h", "2d"], [], _3BET_HIST, villain, call, pot,
                 hero_seat=5, villain_seat=1, behind=behind)


# --- reverse-implied (Y) both directions, and a draw, all facing a flop c-bet ----
# villain (UTG, seat2) opens, hero (BB, seat1) defends, villain c-bets the flop.
def _flop_cbet_hist():
    return [
        HistoryEntry(2, POS[2], "preflop", "raise", None),
        HistoryEntry(1, POS[1], "preflop", "call", None),
        HistoryEntry(2, POS[2], "flop", "bet", None),
    ]


def flop_spot(hero, board, to_call=10, pot=30, behind=150, villain="TAG"):
    return _spot(hero, board, _flop_cbet_hist(), villain, to_call, pot,
                 hero_seat=1, villain_seat=2, behind=behind)


def reverse_battery():
    print("\nREVERSE-IMPLIED (Y) — both directions, flop c-bet, call 10 into 30 (direct req ~25%)")
    print(f"{'hand':28}{'pair':>8}{'req_dir':>9}{'req_adj':>9}{'real':>7}  verdict   [note]")
    print("-" * 84)
    board = ["Kd", "9s", "5c"]
    for hero, label in [
        (["5h", "4d"], "bottom pair (5) — dominated"),
        (["9h", "8d"], "second pair (9) — decent, must still call"),
        (["Ad", "Td"], "ace-high flush draw — implied"),
    ]:
        bd = ["Kd", "9d", "5c"] if "flush" in label else board
        c = flop_spot(hero, bd)
        d = c.required_direct_pct or 0
        a = c.required_equity_pct or 0
        print(f"{label:28}{c.made_tier[:7]:>8}{d:>8}%{a:>8}%{c.realized_equity_pct:>6}%  {c.verdict}   [{c.implied_note}]")


def boundary_sweep(call=14):
    print(f"SET-MINE BOUNDARY (22 vs a 3-bet, call={call}; _SET_MINE_RATE={_SET_MINE_RATE})")
    print(f"{'behind':>7}{'x call':>8}{'req_direct':>11}{'req_impl':>10}{'realized':>10}  verdict")
    print("-" * 64)
    flip = None
    prev = None
    for mult in (4, 8, 11, 13, 15, 17, 20, 25, 35):
        behind = mult * call
        c = setmine(behind)
        is_call = "call" in c.verdict.lower() and not c.verdict.startswith("Fold")
        if prev is False and is_call and flip is None:
            flip = mult
        prev = is_call
        print(f"{behind:>7}{mult:>7}x{c.required_direct_pct:>10}%{c.required_equity_pct:>9}%"
              f"{c.realized_equity_pct:>9}%  {c.verdict}   [{c.implied_note}]")
    print(f"\n  Fold->Call flip near ~{flip}x the call (target ~15x; 8x=too loose, 25x=too tight)")
    return flip


if __name__ == "__main__":
    boundary_sweep()
    reverse_battery()
