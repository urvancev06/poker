"""Known-spot battery for the coach: hand-crafted spots with known-correct
answers, run through build_coaching so the verdict is judged end-to-end.

The load-bearing case is the river bluff-catch: the verdict must FLIP on whether
the villain's *measured* bluff fraction clears the pot-odds bar — same hand +
price, different villain (maniac bluffs, nit doesn't) -> different verdict; same
villain, different price -> different verdict. If that flip doesn't reproduce,
the conditioned-range bluff slice is wrong and the change must not merge.

    backend/.venv/bin/python scripts/coach_spot_check.py
"""

from __future__ import annotations

from poker.coach import build_coaching
from poker.engine.types import GameState, HistoryEntry, LegalActions, SeatState

POS = {0: "SB", 1: "BB", 2: "UTG", 3: "MP", 4: "CO", 5: "BTN"}
_STREET = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}


class _FakeSession:
    """Minimal session exposing just what build_coaching reads."""

    hero_to_act = True

    def __init__(self, state, hero_seat, villain_seats, arch_by_seat):
        self._state = state
        self._hero_seat = hero_seat
        self._vs = villain_seats
        self._arch = arch_by_seat

    @property
    def hero_seat(self):
        return self._hero_seat

    def state(self):
        return self._state

    def live_villain_seats(self):
        return list(self._vs)

    def archetype_at_seat(self, s):
        return self._arch[s]


def _seat(i, hole=None, stack=200, bet=0, folded=False, actor=False):
    return SeatState(
        seat=i, position=POS[i], stack=stack, bet=bet, folded=folded,
        all_in=(stack == 0 and not folded), is_actor=actor, hole_cards=hole,
    )


def _history(villain_seat, hero_seat, villain_actions, current_street):
    streets = ["preflop", "flop", "turn", "river"]
    cur = streets.index(current_street)
    H = []
    for st in streets[:cur]:  # past streets: villain acted, hero called
        va = villain_actions.get(st)
        if va:
            H.append(HistoryEntry(villain_seat, POS[villain_seat], st, va, None))
            H.append(HistoryEntry(hero_seat, POS[hero_seat], st, "call", None))
    cva = villain_actions.get(current_street)
    if cva:
        H.append(HistoryEntry(villain_seat, POS[villain_seat], current_street, cva, None))
    return H


def spot(hero, board, villain_arch, villain_actions, to_call, pot, ip=True, can_check=False, trials=4000):
    """Build a one-villain spot and run the coach. ``pot`` already includes the
    villain's current bet (odds convention). ``ip`` = hero acts after villain."""
    street = _STREET[len(board)]
    villain_seat, hero_seat = (2, 5) if ip else (5, 2)
    seats = []
    for i in range(6):
        if i == hero_seat:
            seats.append(_seat(i, hole=list(hero), bet=0, actor=True))
        elif i == villain_seat:
            seats.append(_seat(i, bet=to_call))
        else:
            seats.append(_seat(i, folded=True))
    legal = LegalActions(
        can_fold=True, can_check=can_check, can_call=to_call > 0, call_amount=to_call,
        can_bet=can_check, can_raise=to_call > 0, min_raise_to=to_call * 2 or 4, max_raise_to=200,
    )
    state = GameState(
        table_size=6, button=5, blinds=(1, 2), street=street, board=list(board),
        seats=seats, pots=[], total_pot=pot, actor=hero_seat, legal_actions=legal,
        is_over=False, history=_history(villain_seat, hero_seat, villain_actions, street),
    )
    fake = _FakeSession(state, hero_seat, [villain_seat], {villain_seat: villain_arch})
    return build_coaching(fake, trials=trials)


# Each spot: (name, kwargs, expected-substring-in-verdict-or-None-for-documented)
BARREL = {"preflop": "raise", "flop": "bet", "turn": "bet", "river": "bet"}


def battery():
    rows = []

    # 1. Clear value-call: hero flopped a set on a dry board facing a c-bet. Must
    #    not fold; should call or raise.
    c = spot(["7h", "7d"], ["7s", "Kd", "2c"], "TAG", {"preflop": "raise", "flop": "bet"},
             to_call=20, pot=60, ip=True)
    rows.append(("value-call: set of 7s vs TAG c-bet", c, "not-fold"))

    # 2. Clear fold: hero has bare ace-high, no draw, facing a turn barrel OOP at a
    #    bad price. Must fold.
    c = spot(["Ah", "5c"], ["Kd", "Qs", "8h", "3d"], "TAG", {"preflop": "raise", "flop": "bet", "turn": "bet"},
             to_call=70, pot=140, ip=False)
    rows.append(("clear fold: ace-high vs TAG double-barrel OOP", c, "Fold"))

    # 3. River bluff-catch — the flip. Hero holds 55 (a bluff-catcher) on K Q 7 3 2.
    board = ["Ks", "Qd", "7h", "3c", "2s"]
    small = dict(to_call=6, pot=106)   # required ~5.4%
    big = dict(to_call=100, pot=200)   # required ~33%
    c_man_small = spot(["5h", "5d"], board, "Maniac", BARREL, ip=False, **small)
    c_nit_small = spot(["5h", "5d"], board, "Nit", BARREL, ip=False, **small)
    c_man_big = spot(["5h", "5d"], board, "Maniac", BARREL, ip=False, **big)
    rows.append(("bluff-catch 55 vs MANIAC, small bet (req~5%)", c_man_small, "call"))
    rows.append(("bluff-catch 55 vs NIT, same small bet", c_nit_small, "Fold"))
    rows.append(("bluff-catch 55 vs MANIAC, pot bet (req~33%)", c_man_big, "Fold"))

    # 4. Set-mine (DOCUMENTED known limitation — needs implied odds, gap 2). Hero
    #    has 22 preflop facing a TAG open; raw equity vs a raising range is low so
    #    the current model folds. Correct answer (call for set value) needs the
    #    implied-odds term, the named follow-on.
    c = spot(["2h", "2d"], [], "TAG", {"preflop": "raise"}, to_call=6, pot=9, ip=True)
    rows.append(("set-mine: 22 vs TAG open (needs implied odds)", c, None))

    return rows


def main():
    print(f"{'spot':52}{'raw':>5}{'real':>6}{'req':>6}  verdict")
    print("-" * 92)
    for name, c, _exp in battery():
        req = "—" if c.required_equity_pct is None else f"{c.required_equity_pct:.0f}%"
        print(f"{name:52}{c.equity_pct:>4}%{c.realized_equity_pct:>5}%{req:>6}  {c.verdict}")
        if c.villains:
            print(f"{'':52}{'':>17}  read: {c.villains[0].description} | bluff {c.villains[0].bluff_pct}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
