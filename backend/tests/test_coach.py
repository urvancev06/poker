"""Coach verdict logic (the candid suggested line).

Guards two things:
- the original "it told me to fold two pair" fix: a value hand (two pair+) that's
  clearly ahead must never get a Fold verdict, and a fold must state the numbers;
- the realized-equity fix for "it calls everything": with money behind, the
  verdict is judged on *realized* equity (raw discounted for position/multiway),
  so a marginal hand that beats the raw price can still be a fold — while on the
  river / all-in (action closed) the pure raw-equity-vs-price rule is used.
"""

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


def test_realization_factor_bounds():
    # Action closed -> realize everything.
    assert _realization_factor(
        is_strong=False, is_pair=False, is_draw=False,
        in_position=False, num_opponents=2, action_closed=True,
    ) == 1.0
    # OOP, multiway, bare air -> heavily discounted.
    r_air = _realization_factor(
        is_strong=False, is_pair=False, is_draw=False,
        in_position=False, num_opponents=2, action_closed=False,
    )
    assert r_air < 0.70
    # Strong hand, in position, heads-up -> full realization.
    assert _realization_factor(
        is_strong=True, is_pair=False, is_draw=False,
        in_position=True, num_opponents=1, action_closed=False,
    ) == 1.0
    # A draw realizes better than bare air in the same spot.
    r_draw = _realization_factor(
        is_strong=False, is_pair=False, is_draw=True,
        in_position=False, num_opponents=2, action_closed=False,
    )
    assert r_draw > r_air
