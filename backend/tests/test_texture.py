"""Board texture (phase 2): suit pattern, pairing, connectivity, high card class,
a dry/semi/wet class, and the scare cards a new street brings."""

from __future__ import annotations

import pytest

from poker.math.texture import Texture, scare_flags, texture


def _split(cards: str) -> list[str]:
    return cards.split()


@pytest.mark.parametrize(
    "board, suits, paired, connectivity, high, wetness",
    [
        ("Kh 7c 2d", "rainbow", False, 1, "K", "dry"),
        ("Kh 7h 2d", "two_tone", False, 1, "K", "semi"),
        ("9c 8d 7h", "rainbow", False, 3, "low", "semi"),
        ("9h 8h 7c", "two_tone", False, 3, "low", "wet"),
        ("9h 8h 2c", "two_tone", False, 2, "low", "semi"),
        ("Kh 9h 2h", "monotone", False, 2, "K", "wet"),
        ("Ah 2c 3d", "rainbow", False, 3, "A", "semi"),  # the wheel counts
        ("Qs Jd 9c", "rainbow", False, 3, "Q", "semi"),
        ("Jd Tc 2s", "rainbow", False, 2, "mid", "dry"),
        ("Td Tc 2s", "rainbow", True, 1, "mid", "dry"),
        ("As Ad 9d 3c 6s", "two_tone", True, 2, "A", "semi"),
        ("2h 5h 9h Kh", "four_flush", False, 2, "K", "wet"),
        ("Kh 9h 6h 3h Js", "four_flush", False, 3, "K", "wet"),
        ("5c 6d 7h 8s", "rainbow", False, 4, "low", "semi"),
        ("Ks Kh 5d 5c Qs", "two_tone", True, 2, "K", "semi"),
        ("8s 6s 4s 2s 3h", "four_flush", False, 4, "low", "wet"),
    ],
)
def test_texture(board, suits, paired, connectivity, high, wetness):
    t = texture(_split(board))
    assert isinstance(t, Texture)
    assert (t.suits, t.paired, t.connectivity, t.high, t.wetness) == (suits, paired, connectivity, high, wetness)


def test_texture_needs_a_flop():
    with pytest.raises(ValueError):
        texture(["Ah", "Kd"])


@pytest.mark.parametrize(
    "prev, board, flags",
    [
        ("Kh 7h 2d", "Kh 7h 2d 9h", {"flush"}),  # the third heart
        ("Kh 7h 2h", "Kh 7h 2h 3h", {"flush"}),  # the fourth heart
        ("Kh 7h 2h", "Kh 7h 2h 3c", set()),
        ("9c 8d 2h", "9c 8d 2h 7s", {"straight"}),  # 9-8-7: a two-card straight is possible
        ("9c 8d 7h", "9c 8d 7h 6s", {"straight"}),  # four to a straight: one card makes it
        ("9c 8d 7h", "9c 8d 7h 2s", set()),
        ("Kc 7d 2h", "Kc 7d 2h As", {"overcard"}),
        ("Kc 7d 2h", "Kc 7d 2h 3s", set()),
        ("Tc 9d 2h", "Tc 9d 2h Jc", {"straight", "overcard"}),
        ("Tc 9c 2h 3d", "Tc 9c 2h 3d Jc", {"straight", "overcard", "flush"}),
        ("Kc 7d 2h", "Kc 7d 2h Kd", set()),  # pairing the top card is not an overcard
    ],
)
def test_scare_flags(prev, board, flags):
    assert scare_flags(_split(prev), _split(board)) == frozenset(flags)


def test_scare_flags_need_the_previous_board_as_a_prefix():
    with pytest.raises(ValueError):
        scare_flags(["Kc", "7d", "2h"], ["Kc", "7d", "3h", "9s"])


def test_scare_flags_from_nothing_are_empty():
    assert scare_flags([], ["Kc", "7d", "2h"]) == frozenset()
