"""Phase 2 math tests (PROJECT.md Definition of Done):

- range parsing into combos (+ blocker removal),
- Monte Carlo equity on known spots within tolerance,
- exact pot-odds / EV arithmetic,
- the hand classifier on crafted boards.

Equity tests are seeded so they're deterministic; bands are wide enough never to
flake at the trial counts used but tight enough to catch real errors.
"""

import pytest

from poker.math import (
    Draw,
    MadeTier,
    analyze_call,
    call_ev,
    classify,
    combos_in_range,
    equity,
    parse_token,
    pot_odds_ratio,
    required_equity,
)


# --------------------------------------------------------------------------- #
# range parsing
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "token, count",
    [
        ("AA", 6),
        ("22+", 78),     # all 13 pairs
        ("TT+", 30),     # TT JJ QQ KK AA
        ("ATs+", 16),    # ATs AJs AQs AKs
        ("AKo", 12),
        ("AKs", 4),
        ("AK", 16),      # suited + offsuit
        ("A5s-A2s", 16),
        ("99-66", 24),
        ("AhKs", 1),     # explicit combo
    ],
)
def test_range_token_counts(token, count):
    assert len(parse_token(token)) == count


def test_range_blocker_removal():
    # An ace on the board removes the two AA combos containing it.
    assert len(combos_in_range("AA", dead=("As",))) == 3
    # A full range loses combos that use any dead card.
    full = combos_in_range("AKs", dead=())
    blocked = combos_in_range("AKs", dead=("Ah",))
    assert len(full) == 4 and len(blocked) == 3


def test_no_combo_has_duplicate_card():
    combos = parse_token("22+")
    assert all(a != b for a, b in combos)


# --------------------------------------------------------------------------- #
# Monte Carlo equity (known spots)
# --------------------------------------------------------------------------- #
def test_aa_vs_kk_preflop():
    r = equity(["As", "Ad"], [], [parse_token("KK")], trials=20000, seed=1)
    assert 0.79 <= r.equity <= 0.85  # ~82%


def test_coinflip_overcards_vs_pair():
    # AKs vs 22 is the classic ~50/50 race.
    r = equity(["As", "Ks"], [], [parse_token("2c2d")], trials=20000, seed=2)
    assert 0.46 <= r.equity <= 0.54


def test_flush_draw_equity():
    # Bare 9-high flush draw (9 outs) vs a pair of aces: textbook ~35%.
    r = equity(["9h", "8h"], ["Ah", "Kh", "2c"], [parse_token("AsQd")], trials=20000, seed=3)
    assert 0.31 <= r.equity <= 0.41


def test_made_flush_dominates():
    r = equity(["Ah", "Qh"], ["Jh", "7h", "2h"], [None], trials=10000, seed=4)
    assert r.equity >= 0.95


def test_aa_vs_random():
    r = equity(["As", "Ad"], [], [None], trials=10000, seed=5)
    assert 0.82 <= r.equity <= 0.88  # ~85%


def test_equity_fractions_sum_to_one():
    r = equity(["As", "Ad"], [], [None], trials=5000, seed=6)
    assert abs((r.win + r.tie + r.lose) - 1.0) < 1e-9


# --------------------------------------------------------------------------- #
# pot odds / EV (exact)
# --------------------------------------------------------------------------- #
def test_required_equity_worked_example():
    # STRATEGY.md: pot 24 after a 10 bet, calling 10 -> 10/34 = 29.41%.
    assert required_equity(10, 24) == pytest.approx(10 / 34)
    assert round(required_equity(10, 24) * 100, 2) == 29.41


def test_required_equity_half_pot_bet():
    # Half-pot bet: call 50 into a pot that's now 150 -> 25% needed.
    assert required_equity(50, 150) == pytest.approx(0.25)


def test_pot_odds_ratio():
    assert pot_odds_ratio(10, 24) == pytest.approx(2.4)


def test_call_ev_and_breakeven():
    assert call_ev(0.40, 10, 24) == pytest.approx(3.6)
    # At exactly the required equity, calling EV is ~0.
    req = required_equity(10, 24)
    assert call_ev(req, 10, 24) == pytest.approx(0.0, abs=1e-9)


def test_analyze_call_verdict():
    a = analyze_call(call=10, pot=24, equity=0.5)
    assert a.should_call is True
    assert a.call_ev == pytest.approx(0.5 * 24 - 0.5 * 10)
    b = analyze_call(call=10, pot=24, equity=0.2)
    assert b.should_call is False


# --------------------------------------------------------------------------- #
# classifier (crafted boards)
# --------------------------------------------------------------------------- #
def test_made_hand_tiers():
    assert classify(["Ah", "Kd"], ["As", "7c", "2d"]).made is MadeTier.PAIR
    assert classify(["Ah", "Kd"], ["As", "Kc", "2d"]).made is MadeTier.TWO_PAIR
    assert classify(["7h", "7d"], ["As", "7c", "2d"]).made is MadeTier.TRIPS
    assert classify(["9h", "8d"], ["7c", "6s", "5d"]).made is MadeTier.STRAIGHT
    assert classify(["Ah", "Qh"], ["Jh", "7h", "2h"]).made is MadeTier.FLUSH
    assert classify(["Ah", "Ad"], ["As", "Kc", "Kd"]).made is MadeTier.FULL_HOUSE
    assert classify(["7h", "7d"], ["7s", "7c", "2d"]).made is MadeTier.QUADS


def test_flush_draw_detected():
    hc = classify(["9h", "8h"], ["Ah", "Kh", "2c"])
    assert hc.made is MadeTier.HIGH_CARD
    assert hc.has(Draw.FLUSH_DRAW)
    assert not hc.has(Draw.BACKDOOR_FLUSH_DRAW)


def test_backdoor_flush_draw_on_flop_only():
    hc = classify(["Ah", "Kh"], ["7h", "3c", "2d"])
    assert hc.has(Draw.BACKDOOR_FLUSH_DRAW)
    assert hc.has(Draw.OVERCARDS)
    # on the turn, a 3-flush is no longer a backdoor draw
    hc_turn = classify(["Ah", "Kh"], ["7h", "3c", "2d", "9s"])
    assert not hc_turn.has(Draw.BACKDOOR_FLUSH_DRAW)


def test_open_ended_vs_gutshot():
    oesd = classify(["9h", "8d"], ["7c", "6s", "2d"])
    assert oesd.has(Draw.OPEN_ENDED) and not oesd.has(Draw.GUTSHOT)
    gut = classify(["9h", "8d"], ["7c", "5s", "2d"])
    assert gut.has(Draw.GUTSHOT) and not gut.has(Draw.OPEN_ENDED)


def test_wheel_gutshot():
    # A2 on 34x needs a 5 — a one-card (gutshot) straight draw using the ace low.
    hc = classify(["Ah", "2d"], ["3c", "4s", "Kd"])
    assert hc.has(Draw.GUTSHOT)


def test_no_draws_on_the_river():
    # 4 to a flush on a complete board is not a "draw".
    hc = classify(["9h", "8h"], ["Ah", "Kh", "2c", "3d", "5s"])
    assert not hc.draws


def test_preflop_classification():
    assert classify(["Ah", "Ad"], []).made is MadeTier.PAIR
    assert classify(["Ah", "Kd"], []).made is MadeTier.HIGH_CARD
