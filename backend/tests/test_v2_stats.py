"""The phase-3 v2 smoke counters (validation/v2_stats.py), on scripted hands.

Seats 0..5 are SB, BB, UTG, MP, CO, BTN; player p sits in seat p and is named
by NAMES[p]. Stacks start at 1,000, blinds 5/10."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from poker.engine.types import HistoryEntry
from validation.v2_stats import hand_counts, ratio_ci, verdict

POS = ["SB", "BB", "UTG", "MP", "CO", "BTN"]
NAMES = ["sb", "bb", "utg", "mp", "co", "btn"]


class Script:
    """Builds a history the way the engine records it (added, street_total,
    stack_after), so the tests read like a hand history."""

    def __init__(self, stacks: int = 1000) -> None:
        self.stack = {s: stacks for s in range(6)}
        self.stack[0] -= 5
        self.stack[1] -= 10
        self.street = "preflop"
        self.tot = {0: 5, 1: 10}
        self.history: list[HistoryEntry] = []
        self.holes: dict[int, list[str]] = {}

    def go(self, street: str) -> Script:
        self.street, self.tot = street, {}
        return self

    def act(self, seat: int, action: str, to: int | None = None) -> Script:
        before = self.tot.get(seat, 0)
        level = max(self.tot.values(), default=0)
        new = to if action in ("bet", "raise") else level if action == "call" else before
        added = new - before
        self.stack[seat] -= added
        self.tot[seat] = new
        self.history.append(HistoryEntry(
            seat=seat, position=POS[seat], street=self.street, action=action,
            to_amount=to, hole_cards=self.holes.get(seat), added=added, street_total=new,
            all_in=self.stack[seat] == 0, stack_after=self.stack[seat]))
        return self

    def folds(self, *seats: int) -> Script:
        for s in seats:
            self.act(s, "fold")
        return self

    def counts(self, board: list[str] | None = None) -> dict:
        snap = SimpleNamespace(history=self.history, board=board or [], blinds=(5, 10), button=5,
                               table_size=6)
        return hand_counts(snap, list(range(6)), NAMES)


def test_opener_folding_to_a_3bet_counts_for_the_opener_only():
    c = Script().folds(2, 3).act(4, "raise", 25).act(5, "raise", 75).folds(0, 1, 4).counts()
    assert (c["co"]["f3b_opp"], c["co"]["f3b_fold"]) == (1, 1)
    assert c["btn"]["f3b_opp"] == 0


def test_a_cold_4bet_before_the_opener_acts_is_not_a_fold_to_3bet():
    c = (Script().act(2, "raise", 25).folds(3).act(4, "raise", 75).act(5, "raise", 180)
         .folds(0, 1, 2, 4).counts())
    assert c["utg"]["f3b_opp"] == 0


def test_bb_fold_vs_a_btn_open_needs_the_sb_to_fold():
    c = Script().folds(2, 3, 4).act(5, "raise", 25).folds(0, 1).counts()
    assert (c["bb"]["bbd_opp"], c["bb"]["bbd_fold"]) == (1, 1)
    c = Script().folds(2, 3, 4).act(5, "raise", 25).act(0, "call").folds(1).counts()
    assert c["bb"]["bbd_opp"] == 0


def _btn_vs_bb_flop() -> Script:
    return Script().folds(2, 3, 4).act(5, "raise", 25).folds(0).act(1, "call").go("flop")


def test_heads_up_cbet_and_the_fold_to_it():
    c = _btn_vs_bb_flop().act(1, "check").act(5, "bet", 20).folds(1).counts(["As", "7d", "2c"])
    assert (c["btn"]["cb_hu_opp"], c["btn"]["cb_hu"]) == (1, 1)
    assert (c["bb"]["fcb_opp"], c["bb"]["fcb_fold"]) == (1, 1)
    assert (c["bb"]["lead_opp"], c["bb"]["lead"]) == (1, 0)


def test_a_lead_into_the_raiser_removes_the_cbet_chance():
    c = _btn_vs_bb_flop().act(1, "bet", 20).act(5, "call").counts(["As", "7d", "2c"])
    assert (c["bb"]["lead_opp"], c["bb"]["lead"]) == (1, 1)
    assert c["btn"]["cb_hu_opp"] == 0 and c["btn"]["fcb_opp"] == 0


def test_multiway_cbet_is_counted_apart():
    c = (Script().folds(2, 3, 4).act(5, "raise", 25).act(0, "call").act(1, "call").go("flop")
         .act(0, "check").act(1, "check").act(5, "bet", 25).folds(0, 1).counts(["As", "7d", "2c"]))
    assert (c["btn"]["cb_mw_opp"], c["btn"]["cb_mw"]) == (1, 1) and c["btn"]["cb_hu_opp"] == 0
    assert c["bb"]["fcb_opp"] == 0  # the fold-to-c-bet band is heads-up


def test_river_fold_by_size_and_the_bluff_share():
    s = _btn_vs_bb_flop()  # pot 55
    s.holes = {5: ["2c", "3d"], 1: ["Ah", "Td"]}
    s.act(1, "check").act(5, "check").go("turn").act(1, "check").act(5, "check").go("river")
    c = s.act(1, "check").act(5, "bet", 45).folds(1).counts(["As", "Ks", "Qh", "Jd", "9c"])
    assert (c["bb"]["rf_75_opp"], c["bb"]["rf_75_fold"]) == (1, 1)
    assert (c["btn"]["rb_big"], c["btn"]["rb_big_bluff"]) == (1, 1)
    assert (c["btn"]["rb_all"], c["btn"]["rb_all_bluff"]) == (1, 1)


def test_a_bet_that_leaves_crumbs_behind_is_counted():
    s = Script(stacks=100).folds(2, 3, 4).act(5, "raise", 25).folds(0).act(1, "call").go("flop")
    c = s.act(1, "check").act(5, "bet", 60).folds(1).counts(["As", "7d", "2c"])
    assert c["btn"]["crumb"] == 1 and c["btn"]["post_aggr"] == 1
    s = Script(stacks=100).folds(2, 3, 4).act(5, "raise", 25).folds(0).act(1, "call").go("flop")
    c = s.act(1, "check").act(5, "bet", 75).folds(1).counts(["As", "7d", "2c"])
    assert c["btn"]["crumb"] == 0  # the jam leaves nothing behind


def test_ratio_ci_pools_shards_and_widens_with_their_spread():
    p, lo, hi = ratio_ci([(5, 10), (5, 10), (5, 10)])
    assert p == pytest.approx(0.5) and lo == pytest.approx(0.5) and hi == pytest.approx(0.5)
    p, lo, hi = ratio_ci([(2, 10), (8, 10)])
    assert p == pytest.approx(0.5) and lo < 0.5 < hi
    assert ratio_ci([(0, 0)]) == (None, None, None)


def test_verdict_follows_the_design_rule():
    assert verdict(50, 48, 52, (45, 62)) == "PASS"
    assert verdict(63, 60, 66, (45, 62)) == "WARN"   # outside, but the CI reaches the band
    assert verdict(70, 66, 74, (45, 62)) == "FAIL"   # the whole CI is outside
    assert verdict(50, 48, 52, None) == "-"
    assert verdict(None, None, None, (1, 2)) == "n/a"


def test_merge_keeps_negative_and_zero_counts():
    from validation.v2_stats import merge_counts
    m = merge_counts({"TAG": {"net": -50, "hands": 2}}, {"TAG": {"crumb": 0, "f3b_opp": 1}})
    assert m["TAG"]["net"] == -50 and m["TAG"]["hands"] == 2 and m["TAG"]["f3b_opp"] == 1
