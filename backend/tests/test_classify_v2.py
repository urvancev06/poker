"""The hole-aware classifier (phase 2): labels a player would say, draws that need
a hole card, and the tier the hole cards themselves contribute.

The golden table is the plan's (P2.3), with two corrections: its ``Ks2d`` row
put the 2d in the hole and on the board, so it uses ``Ks2c``; and its
``Kc7c`` row listed a backdoor flush on 7s 7d 2h, where only two clubs are
visible, so that row has no draws and a second row on 7s 7d 2c has the backdoor.
"""

from __future__ import annotations

import re
import time
from itertools import combinations

import pytest

from poker.math import Draw, HandClass, MadeTier, PairStrength, classify, pair_strength
from poker.math import classify_legacy
from poker.math.cards import FULL_DECK
from poker.math.draws import DrawSet, hole_draws
from poker.rng import shuffled_deck, stream

FD, OE, GS, OV, BD = Draw.FLUSH_DRAW, Draw.OPEN_ENDED, Draw.GUTSHOT, Draw.OVERCARDS, Draw.BACKDOOR_FLUSH_DRAW
T = MadeTier


def _split(cards: str) -> list[str]:
    cards = cards.replace(" ", "")
    return [cards[i : i + 2] for i in range(0, len(cards), 2)]


# (hole, board, label, hole_tier, draws, nut_flush_draw)
GOLDEN = [
    ("4s4h", "As Ad 9d 3c 6s", "pocket fours on a paired board", T.PAIR, set(), False),
    ("8c4d", "Ks Kh 5d 5c Qs", "board two pair, eight kicker", T.HIGH_CARD, set(), False),
    ("Ac4d", "Ks Kh 5d 5c Qs", "board two pair, ace kicker", T.HIGH_CARD, set(), False),
    ("AcQd", "2h 5h 9h Kh", "ace high", T.HIGH_CARD, set(), False),
    ("AhKd", "5c 6d 7h 8s", "ace high", T.HIGH_CARD, set(), False),
    ("AhKd", "5c 6d 7h", "ace high + two overcards", T.HIGH_CARD, {OV}, False),
    ("Ah5h", "Kh 9h 2c", "ace high + nut flush draw", T.HIGH_CARD, {FD}, True),
    ("Qh5h", "Kh 9h 2c", "queen high + flush draw", T.HIGH_CARD, {FD}, False),
    ("7h7d", "7s Kd 2c", "set", T.TRIPS, set(), False),
    ("Kc7c", "7s 7d 2h", "trips", T.TRIPS, set(), False),
    ("Kc7c", "7s 7d 2c", "trips + backdoor flush draw", T.TRIPS, {BD}, False),
    ("AsKd", "Ah 7c 2d", "top pair, top kicker", T.PAIR, set(), False),
    ("AsJd", "Ah 7c 2d", "top pair, good kicker", T.PAIR, set(), False),
    ("As4d", "Ah 7c 2d", "top pair, weak kicker", T.PAIR, set(), False),
    ("KsQd", "Ah Kc 2d", "second pair", T.PAIR, set(), False),
    ("9s9d", "Ah Kc 2d", "pocket nines", T.PAIR, set(), False),
    ("QsQd", "Jh 7c 2d", "overpair", T.PAIR, set(), False),
    ("3s3d", "Jh 7c 5d", "underpair", T.PAIR, set(), False),
    ("Ks2c", "Ah Kc 2d", "two pair", T.TWO_PAIR, set(), False),
    ("AsKd", "Ah Kc 2d", "top two pair", T.TWO_PAIR, set(), False),
    ("6s5s", "7h 8d 9c", "straight", T.STRAIGHT, set(), False),
    ("JcTc", "9c 8d 2c 3h", "jack high + flush draw + open-ended straight draw", T.HIGH_CARD, {FD, OE}, False),
    ("Ah2c", "Kh 9h 6h 3h Js", "nut flush", T.FLUSH, set(), False),
]


@pytest.mark.parametrize("hole, board, label, hole_tier, draws, nut", GOLDEN, ids=[f"{g[0]}|{g[1]}" for g in GOLDEN])
def test_golden_labels_tiers_and_draws(hole, board, label, hole_tier, draws, nut):
    hc = classify(_split(hole), _split(board))
    assert hc.label == label
    assert hc.hole_tier is hole_tier
    assert set(hc.draws) == draws
    assert hc.nut_flush_draw is nut


# --------------------------------------------------------------------------- #
# the audit's cases
# --------------------------------------------------------------------------- #
def test_audit_pocket_fours_on_a_board_two_pair_is_not_two_pair():
    hc = classify(["4s", "4h"], _split("As Ad 9d 3c 6s"))
    assert hc.made is T.TWO_PAIR  # the made tier keeps its meaning: aces and fours
    assert hc.hole_tier is T.PAIR  # but only the fours are the hero's
    assert "two pair" not in hc.label


def test_audit_eight_four_plays_the_board():
    hc = classify(["8c", "4d"], _split("Ks Kd 5c 5h Qd"))
    assert hc.label == "board two pair, eight kicker"
    assert hc.hole_tier is T.HIGH_CARD
    assert hc.board_plays is True


def test_audit_no_phantom_flush_draw():
    hc = classify(["Ac", "Qd"], _split("2h 5h 9h Kh"))
    assert Draw.FLUSH_DRAW not in hc.draws and not hc.nut_flush_draw
    assert "flush" not in hc.label


# --------------------------------------------------------------------------- #
# more labels
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "hole, board, label, hole_tier",
    [
        # pairs and kickers
        ("AdKs", "Ac 9h 9d", "top pair, top kicker on a paired board", T.PAIR),
        ("AsKd", "Kh 7c 2d", "top pair, top kicker", T.PAIR),  # an ace kicker with kings
        ("KsAd", "Ah Kc 7d", "top two pair", T.TWO_PAIR),
        ("AsKd", "Ah 8c 2d", "top pair, top kicker", T.PAIR),
        ("KsAd", "Ah 7c 2d", "top pair, top kicker", T.PAIR),  # aces with a king kicker
        ("AsQd", "Kh Ac 2d", "top pair, good kicker", T.PAIR),
        ("Ts9d", "Ah Tc 7d 2s", "second pair", T.PAIR),
        ("7s6d", "Ah Tc 7d 2s", "middle pair", T.PAIR),
        ("2s6d", "Ah Tc 7d 2c", "bottom pair", T.PAIR),
        ("7s6d", "Ah Ac 7d", "second pair on a paired board", T.PAIR),
        ("QsQd", "Jh Jc 2d", "overpair on a paired board", T.PAIR),
        ("2s2d", "Jh 7c 5d 5s", "underpair on a paired board", T.PAIR),
        # board-made tiers with no own part
        ("AsKd", "7h 7c 2d 3s", "board pair, ace kicker", T.HIGH_CARD),
        ("AsKd", "7h 7c 2d", "board pair, ace kicker + two overcards", T.HIGH_CARD),
        ("9s3d", "7h 7c 7d", "board trips, nine kicker", T.HIGH_CARD),
        ("As3d", "5h 6c 7d 8s 9h", "board straight, ace kicker", T.HIGH_CARD),
        ("9s9d", "5h 6c 7d 8s 9h", "board straight, nine kicker", T.HIGH_CARD),  # the set does not play
        ("As3d", "Kh 9h 6h 3h 2h", "board flush, ace kicker", T.HIGH_CARD),
        ("2s3d", "Kh Kc Kd 7s 7h", "board full house, three kicker", T.HIGH_CARD),
        ("As3d", "Kh Kc Kd Ks 7h", "board quads, ace kicker", T.HIGH_CARD),
        ("AsAd", "Kh Kc Kd Ks", "board quads, ace kicker", T.HIGH_CARD),  # the aces are only a kicker
        # counterfeited: three pairs, the hole's pair is the lowest and does not play
        ("2s3d", "Kh Kc Qd Qs 2h", "board two pair, three kicker", T.HIGH_CARD),
        ("4s4d", "Kh Kc Qd Qs 9h", "board two pair, four kicker", T.HIGH_CARD),
        # three pairs, the hole's pair plays
        ("Ks2d", "Kh Qc Qd 2s 7h", "top pair, weak kicker on a paired board", T.PAIR),
        # bigger hands
        ("Ts3d", "5h 6c 7d 8s 9h", "straight", T.STRAIGHT),  # the hole's ten makes a higher straight
        ("KhQh", "Ah 9h 2h", "nut flush", T.FLUSH),
        ("QhJh", "Ah 9h 2h", "flush", T.FLUSH),
        ("Kh7d", "7s 7c Kd 2h", "full house", T.FULL_HOUSE),
        ("AsAd", "Kh Kc Kd 7s 7h", "full house", T.FULL_HOUSE),
        ("7h7d", "7s 7c 2d", "quads", T.QUADS),
        ("9h8h", "7h 6h 5h", "straight flush", T.STRAIGHT_FLUSH),
        ("7s3d", "Kh Kc Kd 7h", "full house", T.FULL_HOUSE),
        # high card and draws
        ("7s2d", "Ah Kc Qd", "seven high", T.HIGH_CARD),
        ("9h8d", "Tc 7s 2d", "nine high + open-ended straight draw", T.HIGH_CARD),
        ("9h8d", "Tc 6s 2d", "nine high + gutshot", T.HIGH_CARD),
        ("9h8d", "7c 6s 2d", "nine high + open-ended straight draw + two overcards", T.HIGH_CARD),
        ("AhKh", "7h 3c 2d", "ace high + two overcards + backdoor flush draw", T.HIGH_CARD),
        ("AhKh", "7h 7c 2h", "board pair, ace kicker + nut flush draw + two overcards", T.HIGH_CARD),
        ("Ah5d", "Ac 5h 2s", "top two pair", T.TWO_PAIR),
        ("Ad2d", "Ac 5h 2h", "two pair", T.TWO_PAIR),
        ("Kh9h", "Ks 7h 2h", "top pair, weak kicker + flush draw", T.PAIR),
    ],
)
def test_more_labels(hole, board, label, hole_tier):
    hc = classify(_split(hole), _split(board))
    assert (hc.label, hc.hole_tier) == (label, hole_tier)


def test_seat_labels_on_the_table_are_hole_aware():
    """The API's seat labels (D16) use the new classifier."""
    from types import SimpleNamespace

    from poker.api.serializers import seat_to_dict

    seat = SimpleNamespace(
        seat=1, position="BTN", stack=900, bet=0, folded=False, all_in=False, is_actor=False,
        hole_cards=["8c", "4d"],
    )
    assert seat_to_dict(seat, _split("Ks Kh 5d 5c Qs"))["hand_label"] == "board two pair, eight kicker"


def test_preflop_labels_are_unchanged():
    assert classify(["Ah", "Ad"], []).label == "pocket As"
    assert classify(["Ah", "Kd"], []).label == "high card"
    assert classify(["Ah", "Ad"], []).hole_tier is T.PAIR
    assert classify(["Ah", "Kd"], []).hole_tier is T.HIGH_CARD


def test_board_plays_only_when_no_hole_card_is_needed():
    assert classify(["8c", "4d"], _split("Ks Kh 5d 5c Qs")).board_plays is True
    assert classify(["Ac", "4d"], _split("Ks Kh 5d 5c Qs")).board_plays is False  # the ace kicker plays
    assert classify(["9s", "9d"], _split("5h 6c 7d 8s 9h")).board_plays is True
    assert classify(["As", "3d"], _split("Kh Kc Kd Ks 7h")).board_plays is False  # the kicker plays
    assert classify(["Ah", "Kd"], _split("7h 7c 2d")).board_plays is False  # a flop needs two hole cards
    assert classify(["Ah", "Kd"], []).board_plays is False


def test_hand_class_new_fields_have_defaults():
    hc = HandClass(T.PAIR)
    assert hc.hole_tier is T.HIGH_CARD and hc.nut_flush_draw is False and hc.board_plays is False


# --------------------------------------------------------------------------- #
# pair strength
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "hole, board, strength",
    [
        ("8c4d", "Ks Kh 5d 5c Qs", PairStrength.NONE),  # a board pair is not the hero's
        ("AsKd", "7h 7c 2d", PairStrength.NONE),
        ("2s3d", "Kh Kc Qd Qs 2h", PairStrength.NONE),  # counterfeited (legacy: WEAK)
        ("4s4d", "Kh Kc Qd Qs 9h", PairStrength.NONE),  # counterfeited (legacy: WEAK)
        ("9s9d", "5h 6c 7d 8s 9h", PairStrength.NONE),  # plays the board's straight
        ("AsKd", "Ah 7c 2d", PairStrength.STRONG),
        ("QsQd", "Jh 7c 2d", PairStrength.STRONG),
        ("KsQd", "Ah Kc 2d", PairStrength.MEDIUM),
        ("9s9d", "Ah Kc 2d", PairStrength.MEDIUM),
        ("4s4h", "As Ad 9d 3c 6s", PairStrength.MEDIUM),
        ("7s6d", "Ah Tc 7d 2s", PairStrength.MEDIUM),  # middle pair
        ("2s6d", "Ah Tc 7d 2c", PairStrength.WEAK),
        ("3s3d", "Jh 7c 5d", PairStrength.WEAK),
        ("AsKd", "Ah Kc 2d", PairStrength.NONE),  # two pair is not a one-pair holding
        ("AsKd", "", PairStrength.NONE),
    ],
)
def test_pair_strength_is_hole_aware(hole, board, strength):
    assert pair_strength(_split(hole), _split(board)) is strength


# --------------------------------------------------------------------------- #
# invariants over many seeded holdings
# --------------------------------------------------------------------------- #
def _samples(n: int):
    for i in range(n):
        deck = shuffled_deck(stream(0, "classify_v2", i))
        yield deck[:2], deck[2 : 2 + (0, 3, 4, 5)[i % 4]]


_RANK = r"(two|three|four|five|six|seven|eight|nine|ten|jack|queen|king|ace)"
_PLURAL = r"(twos|threes|fours|fives|sixes|sevens|eights|nines|tens|jacks|queens|kings|aces)"
_PAIRED = r"( on a paired board)?"
_MADE = (
    rf"(overpair{_PAIRED}|underpair{_PAIRED}|pocket {_PLURAL}{_PAIRED}"
    rf"|top pair, (top|good|weak) kicker{_PAIRED}|(second|middle|bottom) pair{_PAIRED}"
    r"|top two pair|two pair|set|trips|straight|nut flush|flush|full house|quads|straight flush"
    rf"|board (pair|two pair|trips|straight|flush|full house|quads|straight flush), {_RANK} kicker"
    rf"|{_RANK} high)"
)
_DRAWS = r"( \+ (nut flush draw|flush draw))?( \+ open-ended straight draw| \+ gutshot)?( \+ two overcards)?( \+ backdoor flush draw)?"
_GRAMMAR = re.compile(rf"^{_MADE}{_DRAWS}$")


def test_every_postflop_label_follows_the_grammar():
    seen = set()
    for hole, board in _samples(8000):
        if not board:
            continue
        label = classify(hole, board).label
        assert _GRAMMAR.match(label), (hole, board, label)
        seen.add(label)
    assert len(seen) > 100


def test_made_tier_keeps_its_meaning():
    """``made`` is still the tier of the best five cards, exactly as before."""
    for hole, board in _samples(4000):
        assert classify(hole, board).made is classify_legacy.classify(hole, board).made


def test_invariants():
    for hole, board in _samples(6000):
        hc = classify(hole, board)
        assert hc.hole_tier <= hc.made
        if len(board) in (0, 5):
            assert not hc.draws and not hc.nut_flush_draw
        if hc.nut_flush_draw:
            assert Draw.FLUSH_DRAW in hc.draws
        if hc.board_plays:
            assert hc.hole_tier is T.HIGH_CARD and len(board) == 5
        if hc.hole_tier is T.HIGH_CARD and hc.made >= T.PAIR:
            assert hc.label.startswith("board "), (hole, board, hc.label)
        if Draw.FLUSH_DRAW in hc.draws:
            # a hole card of the suit, four of it in all, and no flush yet
            suits = [c[1] for c in hole + board]
            suit = next(s for s in "shdc" if suits.count(s) == 4)
            assert any(c[1] == suit for c in hole) and hc.made < T.FLUSH


# --------------------------------------------------------------------------- #
# draws
# --------------------------------------------------------------------------- #
def test_hole_draws_fields():
    d = hole_draws(["9c", "8c"], _split("Tc 7d 2c"))
    assert isinstance(d, DrawSet)
    assert d.flush and not d.nut_flush and d.oesd and not d.gutshot and not d.overcards
    assert d.outs == 15
    d = hole_draws(["Jc", "Tc"], _split("9c 8d 2c"))
    assert d.flush and d.oesd and d.overcards and d.outs == 21  # overcards add their 6
    d = hole_draws(["Ah", "5h"], _split("Kh 9h 2c"))
    assert d.flush and d.nut_flush and d.outs == 9
    # the wheel window (A, 2, 5) holds three ranks with a hole card: a backdoor straight
    assert d.backdoor_straight


def test_outs_table():
    assert hole_draws(["9h", "8d"], _split("Tc 7s 2d")).outs == 8
    assert hole_draws(["9h", "8d"], _split("Tc 6s 2d")).outs == 4
    assert hole_draws(["Ah", "Kd"], _split("5c 6d 7h")).outs == 6
    assert hole_draws(["Ah", "Kd"], _split("Qc Jd 3h")).outs == 10  # gutshot + two overcards
    assert hole_draws(["Jh", "8h"], _split("Th 7c 2h")).outs == 12  # flush + gutshot
    assert hole_draws(["Ah", "5h"], _split("Kh 9h 2c")).outs == 9
    assert hole_draws(["Ah", "Kd"], _split("5c 6d 7h 8s")).outs == 0


def test_board_straight_outs_do_not_count():
    # A 4 or a 9 makes a straight for the board alone; the hole does not beat it.
    d = hole_draws(["Ah", "Kd"], _split("5c 6d 7h 8s"))
    assert not d.oesd and not d.gutshot
    # A ten makes the hole's own higher straight on a board that a 4 or 9 completes.
    d = hole_draws(["Th", "2d"], _split("5c 6d 7h 8s"))
    assert d.gutshot and not d.oesd


def test_wheel_draws():
    assert hole_draws(["Ah", "2d"], _split("3c 4s Kd")).gutshot
    d = hole_draws(["Ah", "2d"], _split("3c 4s 5d"))  # a made wheel: no straight draws
    assert not d.gutshot and not d.oesd


def test_backdoors_are_flop_only():
    d = hole_draws(["Ah", "Kh"], _split("7h 3c 2d"))
    assert d.backdoor_flush and d.overcards
    d = hole_draws(["Ah", "Kh"], _split("7h 3c 2d 9s"))
    assert not d.backdoor_flush and not d.overcards and not d.backdoor_straight
    # a backdoor straight needs a hole rank in the window
    assert not hole_draws(["Ah", "Kd"], _split("5c 6d 7h")).backdoor_straight
    assert hole_draws(["8h", "2d"], _split("6c 5d Kh")).backdoor_straight


def test_no_draws_once_made():
    d = hole_draws(["6s", "5s"], _split("7h 8d 9c"))  # a made straight
    assert not d.oesd and not d.gutshot
    d = hole_draws(["Ah", "Qh"], _split("Jh 7h 2h"))  # a made flush
    assert not d.flush and not d.oesd and not d.gutshot


def _naive_straight_out_ranks(hole, board):
    """The rule, written with sets: a rank counts if hole + board + it makes a
    higher straight than board + it does."""

    def best(ranks: set[int]) -> int:
        vals = set(ranks) | ({-1} if 12 in ranks else set())
        top = 0
        for lo in range(-1, 9):
            if all(v in vals for v in range(lo, lo + 5)):
                top = lo + 5
        return top

    hr = {"23456789TJQKA".index(c[0]) for c in hole}
    br = {"23456789TJQKA".index(c[0]) for c in board}
    if best(hr | br):
        return 0
    return sum(1 for r in range(13) if best(hr | br | {r}) > best(br | {r}))


def test_straight_draws_match_a_naive_implementation():
    for i in range(3000):
        deck = shuffled_deck(stream(0, "draws_naive", i))
        hole, board = deck[:2], deck[2 : 2 + (3, 4)[i % 2]]
        d = hole_draws(hole, board)
        suits = [c[1] for c in hole + board]
        if max(suits.count(s) for s in "shdc") >= 5:
            continue  # a made flush skips straight draws
        counts = sorted([[c[0] for c in hole + board].count(r) for r in {c[0] for c in hole + board}], reverse=True)
        if counts[0] >= 4 or (counts[0] == 3 and counts[1] >= 2):
            continue  # a full house or quads skips them too
        n = _naive_straight_out_ranks(hole, board)
        assert (d.oesd, d.gutshot) == (n >= 2, n == 1), (hole, board, n)


def test_draws_cost():
    """Every holding on a flop (1,176; the plan budgets 1,081) takes under 20 ms."""
    board = ["Kh", "9h", "6c"]
    holes = list(combinations([c for c in FULL_DECK if c not in board], 2))
    assert len(holes) == 1176
    hole_draws(list(holes[0]), board)  # warm
    best = min(_time(lambda: [hole_draws(h, board) for h in holes]) for _ in range(3))
    assert best < 0.020, f"{best * 1000:.1f} ms"


def _time(fn) -> float:
    t0 = time.perf_counter()
    fn()
    return time.perf_counter() - t0
