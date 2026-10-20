"""Implied / reverse-implied odds battery. Two properties:

  1. the set-mine flip lands at the right PLACE: a fold when shallow, callable when
     deep, with the boundary near the rule of 15, so neither at 8x (too loose) nor
     beyond 25x (too tight);
  2. reverse-implied (Y) fires on a dominated hand (-> fold) but does NOT over-fire on
     a decent non-premium made hand, which must still call.

scripts/implied_spot_check.py prints the readable boundary sweep.
"""

from scripts.implied_spot_check import flop_spot, setmine

CALL = 14  # the set-mine spot's call size


def _fold(c):
    return c.verdict.startswith("Fold")


def _callable(c):
    return not c.verdict.startswith("Fold")  # Call / Clear call / Close


def test_setmine_shallow_folds_deep_is_callable():
    assert _fold(setmine(4 * CALL))        # no stack to win -> no set value -> fold
    assert _callable(setmine(30 * CALL))   # deep -> set value -> stops being a fold


def test_setmine_boundary_is_near_rule_of_15():
    # Brackets the boundary rather than the endpoints: still a fold at 8x, callable
    # by 20x, so it sits near 15x.
    assert _fold(setmine(8 * CALL))
    assert _callable(setmine(20 * CALL))


def test_setmine_stays_conservative_when_deep():
    # A set-mine facing a 3-bet is marginal: even deep it should lean ("Close"),
    # never slam "Clear call".
    assert "clear call" not in setmine(30 * CALL).verdict.lower()


def test_reverse_implied_folds_a_dominated_hand():
    c = flop_spot(["5h", "4d"], ["Kd", "9s", "5c"])  # bottom pair (WEAK)
    assert _fold(c)
    assert "reverse implied" in c.implied_note
    assert c.required_equity_pct > c.required_direct_pct  # Y raised the price


def test_reverse_implied_does_not_overfire_on_a_decent_hand():
    c = flop_spot(["9h", "8d"], ["Kd", "9s", "5c"])  # second pair (MEDIUM)
    assert _callable(c)                               # must still call
    assert c.implied_note == ""                       # Y did NOT fire
    assert c.required_equity_pct == c.required_direct_pct  # price unadjusted


def test_draw_gets_implied_credit():
    c = flop_spot(["Ad", "Td"], ["Kd", "9d", "5c"])  # ace-high flush draw
    assert "draw" in c.implied_note
    assert c.required_equity_pct < c.required_direct_pct  # implied lowered the price


def test_action_closed_river_has_no_implied_adjustment():
    # On the river there's no more betting, so implied odds = 0 and the price is the
    # exact direct one (the bluff-catch proof stays untouched).
    from scripts.coach_spot_check import spot, BARREL
    c = spot(["5h", "5d"], ["Ks", "Qd", "7h", "3c", "2s"], "Maniac", BARREL, ip=False, to_call=6, pot=106)
    assert c.action_closed is True
    assert c.required_equity_pct == c.required_direct_pct
    assert c.implied_note == ""


def test_set_value_note_is_in_big_blinds():
    """Every amount the coach writes is in bb: 77 calling a 2.5 bb open at 5/10
    with 975 chips behind reads "97.5 bb behind", never the raw chips (the note
    shows word for word in the maths sheet's explanation and its price row)."""
    import re

    from poker.coach import build_coaching
    from poker.engine import Action, ActionType, Hand
    from tests.helpers import HandSession

    h = Hand.new(table_size=6, blinds=(5, 10), starting_stacks=1000, manual_deal=True)
    for cards in ("2c3d", "4h5s", "AsKd", "9c9d", "Th2h", "7c7d"):
        h.deal_hole(cards)
    h.apply(Action(ActionType.RAISE, 25))  # UTG opens to 2.5 bb
    h.apply(Action(ActionType.FOLD))
    h.apply(Action(ActionType.FOLD))
    archetypes = {0: "Nit", 1: "TAG", 2: "TAG", 3: "LAG", 4: "Maniac"}
    c = build_coaching(HandSession(h, hero_seat=5, archetypes=archetypes), trials=400)
    assert c.implied_note == "set value, 97.5 bb behind"
    assert "97.5 bb behind" in c.rationale
    assert not re.search(r"\b975\b", c.rationale)
