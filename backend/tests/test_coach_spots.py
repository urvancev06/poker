"""Known-spot battery as enforced tests (the merge gate for the conditioned-range
change). The river bluff-catch must flip on the measured bluff fraction:
same hand + price, maniac vs nit -> different verdict; same villain, different
price -> different verdict. See scripts/coach_spot_check.py for the readable table.
"""

from scripts.coach_spot_check import BARREL, spot

RIVER = ["Ks", "Qd", "7h", "3c", "2s"]
SMALL = dict(to_call=6, pot=106)   # required ~5%
POTSZ = dict(to_call=100, pot=200)  # required ~33%


def test_value_hand_is_not_folded():
    c = spot(["7h", "7d"], ["7s", "Kd", "2c"], "TAG",
             {"preflop": "raise", "flop": "bet"}, to_call=20, pot=60, ip=True)
    assert not c.verdict.lower().startswith("fold")  # a set is never a fold


def test_air_is_folded_at_a_bad_price():
    c = spot(["Ah", "5c"], ["Kd", "Qs", "8h", "3d"], "TAG",
             {"preflop": "raise", "flop": "bet", "turn": "bet"}, to_call=70, pot=140, ip=False)
    assert c.verdict == "Fold."


def test_bluffcatch_flips_on_villain_bluff_rate():
    """Same hand (55), same price — a maniac bluffs enough to call, a nit doesn't."""
    man = spot(["5h", "5d"], RIVER, "Maniac", BARREL, ip=False, **SMALL)
    nit = spot(["5h", "5d"], RIVER, "Nit", BARREL, ip=False, **SMALL)
    assert "call" in man.verdict.lower() and not man.verdict.startswith("Fold")
    assert nit.verdict == "Fold."
    # the only thing that changed is the conditioned bluff fraction
    assert man.villains[0].bluff_pct > nit.villains[0].bluff_pct


def test_bluffcatch_flips_on_price():
    """Same villain (maniac) — a small bet is a call, a pot-sized bet is a fold."""
    small = spot(["5h", "5d"], RIVER, "Maniac", BARREL, ip=False, **SMALL)
    big = spot(["5h", "5d"], RIVER, "Maniac", BARREL, ip=False, **POTSZ)
    assert "call" in small.verdict.lower()
    assert big.verdict == "Fold."


def test_river_bluffcatch_is_a_pure_price_spot():
    # On the river, action is closed -> realized == raw (R = 1).
    c = spot(["5h", "5d"], RIVER, "Maniac", BARREL, ip=False, **SMALL)
    assert c.action_closed is True
    assert c.realized_equity_pct == c.equity_pct
