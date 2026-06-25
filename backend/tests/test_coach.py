"""Coach verdict logic (the candid suggested line).

Guards two things:
- the original "it told me to fold two pair" fix: a value hand (two pair+) that's
  clearly ahead must never get a Fold verdict, and a fold must state the numbers;
- the realized-equity fix for "it calls everything": with money behind, the
  verdict is judged on *realized* equity (raw discounted for position/multiway),
  so a marginal hand that beats the raw price can still be a fold — while on the
  river / all-in (action closed) the pure raw-equity-vs-price rule is used.
"""

import pytest

from poker.coach.coach import _realization_factor, _suggest


def test_value_hand_ahead_raises_not_folds():
    verdict, why = _suggest(
        can_check=False,
        tier_name="two pair",
        is_strong=True,  # two pair+
        is_draw=False,
        equity_frac=0.93,  # crushing
        realized=0.93,
        required=0.30,
        in_position=True,
        action_closed=False,
        villain_desc="Nit's modelled range",
        players_behind=0,
    )
    assert verdict.lower().startswith("raise")
    assert "two pair" in why


def test_value_hand_can_check_bets_for_value():
    verdict, _ = _suggest(
        can_check=True,
        tier_name="two pair",
        is_strong=True,
        is_draw=False,
        equity_frac=0.85,
        realized=0.85,
        required=None,
        in_position=True,
        action_closed=False,
        villain_desc="the field",
        players_behind=0,
    )
    assert verdict == "Bet for value."


def test_clearly_behind_folds_with_numbers():
    # River (action closed): pure price decision on raw equity.
    verdict, why = _suggest(
        can_check=False,
        tier_name="ace high",
        is_strong=False,
        is_draw=False,
        equity_frac=0.18,
        realized=0.18,
        required=0.33,
        in_position=True,
        action_closed=True,
        villain_desc="TAG's modelled range",
        players_behind=0,
    )
    assert verdict == "Fold."
    assert "18%" in why and "33%" in why


def test_borderline_is_close_not_hard_fold():
    verdict, _ = _suggest(
        can_check=False,
        tier_name="second pair",
        is_strong=False,
        is_draw=False,
        equity_frac=0.32,
        realized=0.32,
        required=0.33,
        in_position=True,
        action_closed=False,
        villain_desc="the field",
        players_behind=0,
    )
    assert "close" in verdict.lower()


def test_marginal_oop_call_on_raw_becomes_fold_on_realized():
    """The 'calls everything' fix: raw 40% beats the 33% price, but realized 28%
    (OOP, multiway) does not — so it's a fold, not a call."""
    verdict, _ = _suggest(
        can_check=False,
        tier_name="ace high",
        is_strong=False,
        is_draw=False,
        equity_frac=0.40,
        realized=0.28,
        required=0.33,
        in_position=False,
        action_closed=False,
        villain_desc="the field",
        players_behind=1,
    )
    assert verdict == "Fold."


def test_action_closed_uses_raw_equity_not_realized():
    """On the river / all-in, raw equity IS realized, so a good raw price is a call
    even when the (irrelevant) realized figure is low."""
    verdict, _ = _suggest(
        can_check=False,
        tier_name="a pair",
        is_strong=False,
        is_draw=False,
        equity_frac=0.45,
        realized=0.20,  # would be a fold if this were used — but action is closed
        required=0.33,
        in_position=False,
        action_closed=True,
        villain_desc="the field",
        players_behind=0,
    )
    assert verdict == "Call."


def test_realization_factor_directions():
    """Each factor must push the right way (constraint: keep R honest, check
    direction). HT = a bare-air hand type held fixed while one factor varies."""
    f = _realization_factor
    HT = dict(is_strong=False, is_pair=False, is_draw=False, action_closed=False)

    # Action closed -> realize everything, regardless of position/multiway/street.
    assert f(in_position=False, num_opponents=3, players_behind=2, street="preflop",
             is_strong=False, is_pair=False, is_draw=False, action_closed=True) == 1.0

    # In position realizes MORE than out of position.
    assert f(in_position=True, num_opponents=1, street="flop", **HT) > \
           f(in_position=False, num_opponents=1, street="flop", **HT)
    # Multiway realizes LESS than heads-up.
    assert f(in_position=True, num_opponents=3, street="flop", **HT) < \
           f(in_position=True, num_opponents=1, street="flop", **HT)
    # Players still to act behind LOWER realization.
    assert f(in_position=True, num_opponents=1, players_behind=2, street="flop", **HT) < \
           f(in_position=True, num_opponents=1, street="flop", **HT)

    # Later streets shrink the discount toward 1 — the conditioned range now
    # carries the "they're strong" signal, so R must not double-count it.
    flop = f(in_position=False, num_opponents=2, street="flop", **HT)
    turn = f(in_position=False, num_opponents=2, street="turn", **HT)
    river = f(in_position=False, num_opponents=2, street="river", **HT)
    assert flop < turn < river
    assert river == pytest.approx(1.0)  # river weight 0 -> full realization
    assert 0.5 <= flop <= 1.0


def test_draw_realizes_better_than_air():
    f = _realization_factor
    common = dict(in_position=False, num_opponents=2, street="flop", action_closed=False)
    r_air = f(is_strong=False, is_pair=False, is_draw=False, **common)
    r_draw = f(is_strong=False, is_pair=False, is_draw=True, **common)
    assert r_draw > r_air
