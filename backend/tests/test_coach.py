"""Coach verdict logic (the candid suggested line).

Two invariants:
- a value hand (two pair+) that is clearly ahead never gets a Fold verdict, and a
  fold always states the numbers behind it;
- while money is still behind, the verdict is judged on *realized* equity (raw
  equity discounted for position and multiway), so a marginal hand that beats the
  raw price can still be a fold. Once action is closed (river or all-in) raw
  equity is realized equity and the plain equity-vs-price rule applies.
"""

import pytest

from poker.coach.coach import _realization_factor, _suggest


def test_value_hand_ahead_raises_not_folds():
    verdict, why = _suggest(
        can_check=False,
        tier_name="two pair",
        is_strong=True,
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
    """Raw 40% beats the 33% price, but realized 28% (OOP, multiway) does not, so
    the verdict is a fold."""
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
        realized=0.20,  # would be a fold if this were used, but action is closed
        required=0.33,
        in_position=False,
        action_closed=True,
        villain_desc="the field",
        players_behind=0,
    )
    assert verdict == "Call."


def test_realization_factor_directions():
    """Each factor must push realization the right way. HT = a bare-air hand type
    held fixed while one factor varies."""
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

    # Later streets shrink the discount toward 1: the conditioned range already
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


def test_every_verdict_string_has_a_tone():
    """The frontend colours the verdict from `tone`. A verdict string added to or
    renamed in _suggest without a matching VERDICT_TONE entry renders neutral
    instead of as a fold, so every reachable verdict must be mapped."""
    import itertools

    from poker.coach.coach import VERDICT_TONE, _suggest

    seen = set()
    for can_check, is_strong, is_draw, closed, ip in itertools.product(
        (True, False), (True, False), (True, False), (True, False), (True, False)
    ):
        for eq in (0.05, 0.25, 0.5, 0.65, 0.75, 0.95):
            for req in (0.1, 0.3, 0.5, 0.8):
                v, _ = _suggest(
                    can_check=can_check, tier_name="x", is_strong=is_strong, is_draw=is_draw,
                    equity_frac=eq, realized=eq, required=req, in_position=ip,
                    action_closed=closed, villain_desc="a TAG", players_behind=0,
                )
                seen.add(v)
    unmapped = seen - set(VERDICT_TONE)
    assert not unmapped, f"verdict strings with no tone: {sorted(unmapped)}"
    assert len(seen) >= 8, f"expected the full verdict ladder, only saw {sorted(seen)}"


def test_overpair_well_ahead_raises_rather_than_calling():
    """A value line must follow the equity, not just the made tier. An overpair with
    a nut flush draw is one pair by tier but crushes a c-betting range, and gating
    the raise on two-pair-or-better talked the coach out of raising its best hands."""
    verdict, why = _suggest(
        can_check=False,
        tier_name="a pair + flush draw",
        is_strong=False,  # one pair by tier
        is_draw=True,
        equity_frac=0.89,  # but crushing their range
        realized=0.88,
        required=0.20,
        in_position=True,
        action_closed=False,
        villain_desc="TAG's modelled range",
        players_behind=0,
    )
    assert verdict == "Raise for value."
    assert "a pair + flush draw" in why


def test_never_suggests_a_raise_when_raising_is_illegal():
    """Facing an all-in there is nothing to raise to, so even a monster can only call.
    A verdict the engine would reject is worse than a conservative one."""
    verdict, _ = _suggest(
        can_check=False,
        tier_name="two pair",
        is_strong=True,
        is_draw=False,
        equity_frac=0.93,
        realized=0.93,
        required=0.25,
        in_position=True,
        action_closed=True,  # all-in: raw equity is realized
        villain_desc="a Maniac",
        players_behind=0,
        can_raise=False,
    )
    assert not verdict.lower().startswith("raise")
    assert verdict == "Call."


def test_never_suggests_a_bet_when_betting_is_illegal():
    """Every villain already all-in: the hero can check the hand down but cannot bet."""
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
        can_bet=False,
    )
    assert verdict == "Check."
