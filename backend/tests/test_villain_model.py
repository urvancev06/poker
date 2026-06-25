"""Action-conditioned villain ranges (coach/villain_model.py).

The load-bearing test is the bluff-slice consistency: the air fraction the model
keeps in a betting range must match what the bots actually bet, or the coach's
bluff-catch threshold grades the hero against a fiction. The rest guard that
aggression strengthens (de-bluffs) the range as it should.
"""

import pytest

from poker.coach.villain_model import BET_COMPOSITION, condition_range
from scripts.measure_bet_ranges import measure

BOARD5 = ["Ah", "7d", "2c", "Ks", "9h"]  # dry, two broadways
DEAD = set(BOARD5)


def _range(archetype, postflop, preflop_role="raise", board=BOARD5):
    return condition_range(archetype, board, preflop_role, postflop, DEAD)


def test_flop_bet_narrows_the_preflop_range():
    base = _range("TAG", {})
    cbet = _range("TAG", {"flop": "bet"})
    assert len(cbet.combos) < len(base.combos)


def test_barreling_strengthens_de_bluffs_the_range():
    # Combo count need not drop (air cards pair into value as the board grows),
    # but each barrel must lower the air/bluff fraction — a stronger range.
    base = _range("TAG", {})
    cbet = _range("TAG", {"flop": "bet"})
    barrel = _range("TAG", {"flop": "bet", "turn": "bet", "river": "bet"})
    assert cbet.bluff_fraction <= base.bluff_fraction
    assert barrel.bluff_fraction <= cbet.bluff_fraction


def test_3bet_preflop_is_tighter_than_an_open():
    opened = _range("TAG", {}, preflop_role="raise")
    threebet = _range("TAG", {}, preflop_role="3bet+")
    assert len(threebet.combos) < len(opened.combos)


def test_river_bluff_slice_is_low_and_archetype_ordered():
    # Against these bots a river barrel is almost all value: the bluff fraction
    # must be low, and a maniac must bluff more than a nit.
    nit = _range("Nit", {"flop": "bet", "turn": "bet", "river": "bet"})
    maniac = _range("Maniac", {"flop": "bet", "turn": "bet", "river": "bet"})
    assert nit.bluff_fraction < 0.05
    assert maniac.bluff_fraction > nit.bluff_fraction
    assert maniac.bluff_fraction < 0.20  # even a maniac is value-heavy by the river


def test_description_is_judgeable():
    r = _range("TAG", {"flop": "bet", "turn": "bet"})
    assert "TAG" in r.description and "barreled turn" in r.description and "combos" in r.description


def test_bluff_slice_matches_measured_reality():
    """The hard one: the encoded bluff slices must still match what the bots bet.
    Re-measure once (modest sample, different seed) and assert each archetype's
    flop/river air fractions agree — if they diverge (e.g. a bot's params change),
    this fails loudly rather than letting the coach grade against a fiction."""
    counts = measure(18000, seed=1)
    for archetype in BET_COMPOSITION:
        for street, tol in (("flop", 0.06), ("river", 0.05)):
            c = counts[archetype][street]
            tot = sum(c.values())
            if tot < 50:
                continue  # too few samples to judge (e.g. nit rivers in a small run)
            measured_air = c.get("air", 0) / tot
            encoded_air = BET_COMPOSITION[archetype][street]["air"]
            assert measured_air == pytest.approx(encoded_air, abs=tol), (
                f"{archetype} {street}: encoded {encoded_air:.3f} vs measured {measured_air:.3f}"
            )
