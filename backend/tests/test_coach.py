"""Coach verdict logic (the candid suggested line).

Guards the fix for "it told me to fold two pair": a value hand (two pair or
better) that is clearly ahead must never get a Fold verdict, and a fold must
state the equity vs the required price.
"""

from poker.coach.coach import _suggest


def test_value_hand_ahead_raises_not_folds():
    verdict, why = _suggest(
        can_check=False,
        tier_name="two pair",
        is_strong=True,        # two pair+
        is_draw=False,
        equity_frac=0.93,      # crushing
        required=0.30,
        villain_desc="Nit's modelled range",
    )
    assert verdict.lower().startswith("raise")
    assert "two pair" in why


def test_value_hand_can_check_bets_for_value():
    verdict, _ = _suggest(True, "two pair", True, False, 0.85, None, "the field")
    assert verdict == "Bet for value."


def test_clearly_behind_folds_with_numbers():
    verdict, why = _suggest(
        can_check=False,
        tier_name="ace high",
        is_strong=False,
        is_draw=False,
        equity_frac=0.18,
        required=0.33,
        villain_desc="TAG's modelled range",
    )
    assert verdict == "Fold."
    assert "18%" in why and "33%" in why and "TAG" in why


def test_borderline_is_marginal_not_fold():
    verdict, _ = _suggest(False, "second pair", False, False, 0.32, 0.33, "the field")
    assert "marginal" in verdict.lower()
