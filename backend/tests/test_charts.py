"""P3.1: the v2 preflop charts, the opening order and the STRATEGY.md §2 block."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from poker.bots.preflop_ranges import RFI_COMBOS, RFI_RANGES, _RANGE_TEXT
from poker.math.ranges import parse_range
from poker.math.suits import class_of
from poker.strategy.charts import order, preflop
from poker.strategy.charts.order import CLASSES, COMBOS_OF, OPEN_ORDER, chen, order_mid, p_in

STRATEGY_MD = Path(__file__).resolve().parents[2] / "STRATEGY.md"
POSITIONS = ("UTG", "MP", "CO", "BTN", "SB", "BB")


def _classes(text: str) -> set[str]:
    return {class_of(c) for c in parse_range(text)}


def _rfi_classes(pos: str) -> set[str]:
    return {class_of(c) for c in RFI_RANGES[pos]}


def test_chen_values():
    assert chen("AA") == 20
    assert chen("KK") == 16
    assert chen("AKs") == 12
    assert chen("22") == 5
    assert chen("54s") == 5.5
    assert chen("K2o") == 3.0
    assert chen("72o") == -1.5


def test_classes_and_combos():
    assert len(CLASSES) == 169 == len(set(CLASSES))
    assert sum(COMBOS_OF.values()) == 1326
    assert (COMBOS_OF["AA"], COMBOS_OF["AKs"], COMBOS_OF["AKo"]) == (6, 4, 12)


def test_open_order_prefixes_equal_rfi_lists():
    assert len(OPEN_ORDER) == 169 == len(set(OPEN_ORDER))
    for pos in ("UTG", "MP", "CO", "SB", "BTN"):
        total, prefix = 0, set()
        for cls in OPEN_ORDER:
            if total >= RFI_COMBOS[pos]:
                break
            prefix.add(cls)
            total += COMBOS_OF[cls]
        assert total == RFI_COMBOS[pos], pos
        assert prefix == _rfi_classes(pos), pos


def test_open_order_tiers_sort_by_chen_then_kind_then_ranks():
    utg = OPEN_ORDER[: len(_rfi_classes("UTG"))]
    assert utg[0] == "AA"
    keys = [order.playability_key(c) for c in utg]
    assert keys == sorted(keys)
    # 99 (pair, Chen 9) before KJs (suited, Chen 9) before AQo (offsuit, Chen 9).
    assert utg.index("99") < utg.index("KJs") < utg.index("AQo")


def test_tail_by_playability():
    assert OPEN_ORDER.index("54s") < OPEN_ORDER.index("K2o")


def test_p_in_boundary():
    cut = RFI_COMBOS["UTG"]
    utg = _rfi_classes("UTG")
    for cls in CLASSES:
        if cls in utg:
            assert p_in(cls, OPEN_ORDER, cut) >= 0.5, cls
        else:
            assert p_in(cls, OPEN_ORDER, cut) < 0.5, cls


def test_order_mid_and_p_in_outside_the_order():
    assert order_mid(OPEN_ORDER, "AA") == 3.0
    assert order_mid(OPEN_ORDER, OPEN_ORDER[1]) == 6 + COMBOS_OF[OPEN_ORDER[1]] / 2
    assert p_in("72o", preflop.LIGHT_3BET_ORDER, 1000) == 0.0


def test_bb_defend_order_total():
    o = preflop.BB_DEFEND_ORDER
    assert len(o) == 169 == len(set(o))
    assert o[0] == "AA"
    assert "72o" in o[-5:]


def test_chart_lists_are_the_planned_lists():
    assert set(preflop.VALUE_3BET["UTG"]) == _classes("QQ+, AKs, AKo") == set(preflop.VALUE_3BET["MP"])
    for opener in ("CO", "BTN", "SB"):
        assert set(preflop.VALUE_3BET[opener]) == _classes("JJ+, AQs+, AKo")
    assert preflop.LIGHT_3BET_ORDER[:9] == ("A5s", "A4s", "A3s", "A2s", "KJs", "KTs", "QJs", "76s", "65s")
    assert len(preflop.LIGHT_3BET_ORDER) == 40
    late = preflop.FLAT_ORDER_LATE
    assert late[late.index("77") + 1 : late.index("77") + 4] == ("AQo", "AJo", "KQo")
    assert sorted(late) == sorted(preflop.FLAT_ORDER_EARLY)
    assert set(preflop.PREMIUM) == _classes("QQ+, AKs, AKo, JJ, AQs")
    assert set(preflop.BB_ISO_VALUE) == _classes("TT+, AQs+, AKo")
    assert set(preflop.FOURBET_VALUE_VS_EP) == _classes("KK+, AKs") == set(preflop.JAM_VS_4BET)
    assert set(preflop.SMALL_PAIRS) == _classes("66-22")
    assert set(preflop.COLD_CALL_3BET_ORDER) == {"QQ", "JJ", "AKo", "AQs"}


def test_every_hero_opener_pair_has_light_and_flat_bases():
    for i, opener in enumerate(POSITIONS[:-1]):
        for hero in POSITIONS[i + 1 :]:
            assert preflop.LIGHT_BASE[(hero, opener)] > 0
            if hero != "BB":
                assert preflop.FLAT_BASE[(hero, opener)] > 0
    assert preflop.LIGHT_BASE[("SB", "CO")] == 28 and preflop.LIGHT_BASE[("BB", "SB")] == 40
    assert preflop.FLAT_BASE[("BTN", "CO")] == 110 and preflop.FLAT_BASE[("SB", "UTG")] == 12


def test_vs_open_sets_are_disjoint_and_value_always_3bets():
    for i, opener in enumerate(POSITIONS[:-1]):
        for hero in POSITIONS[i + 1 :]:
            probs = preflop.vs_open_probs(hero, opener)
            for cls in preflop.VALUE_3BET[opener]:
                assert probs[cls] == (1.0, 0.0)
            for cls, (p3, p_call) in probs.items():
                assert 0.0 <= p3 <= 1.0 and 0.0 <= p_call <= 1.0 - p3 + 1e-12, (hero, opener, cls)


@pytest.mark.parametrize("opener", ["UTG", "MP", "CO", "BTN", "SB"])
def test_bb_defend_share_matches_target(opener):
    probs = preflop.vs_open_probs("BB", opener)
    defended = sum(COMBOS_OF[c] * (p3 + p_call) for c, (p3, p_call) in probs.items())
    assert defended / 1326 == pytest.approx(preflop.BB_DEFEND_TARGET[opener], abs=0.01)


def test_open_size_shrinks_cuts():
    assert preflop.size_factor(2.5) == 1.0 == preflop.size_factor(2.0)
    assert preflop.size_factor(3.5) == pytest.approx((2.5 / 3.5) ** 0.8)
    # Measured against the opener's standard size: the SB's 3bb open is standard.
    assert preflop.size_factor(3.0, "SB") == 1.0
    assert preflop.size_factor(3.5, "SB") == pytest.approx((3.0 / 3.5) ** 0.8)
    assert preflop.size_factor(3.0, "CO") == pytest.approx((2.5 / 3.0) ** 0.8)


def test_iso_cut_shrinks_per_limper():
    assert preflop.open_cut("CO") == RFI_COMBOS["CO"]
    assert preflop.open_cut("CO", limpers=2) == pytest.approx(RFI_COMBOS["CO"] * 0.49)


def test_compact_round_trips():
    for pos in ("UTG", "MP", "CO", "BTN", "SB"):
        text = order.compact(_rfi_classes(pos))
        assert _classes(text) == _rfi_classes(pos), (pos, text)
    assert order.compact({"AA", "KK", "QQ", "AKs", "AKo"}) == "QQ+, AKs, AKo"
    assert order.compact({"A5s", "A4s", "A3s"}) == "A5s-A3s"


def test_rfi_text_unchanged():
    text = STRATEGY_MD.read_text()
    for pos, label in (("UTG", "UTG"), ("MP", "MP / HJ"), ("CO", "CO"), ("BTN", "BTN"), ("SB", "SB")):
        m = re.search(rf"^- \*\*{re.escape(label)} \([^)]*\):\*\* `([^`]*)`", text, re.M)
        assert m, pos
        assert m.group(1) == _RANGE_TEXT[pos], pos


def test_reg_fold_to_3bet_lands_in_the_pool_band():
    """Owner decision (c): a reg's fold-to-3-bet is inside the §5 band 45-62% from
    every opening seat, in and out of position, and out of position still folds
    at least as much as in position. Exact over the chart (combo-weighted by
    P(open)), at the TAG type mean."""
    from poker.strategy.dials import TYPE_DIALS

    tag = TYPE_DIALS["tag"]
    for opener in POSITIONS[:-1]:
        ip, oop = [], []
        for threebettor in preflop.heroes_after(opener):
            f = preflop.fold_to_3bet(
                opener, threebettor, open_mult=tag.open, call=tag.call, threebet=tag.threebet
            )
            assert 0.45 <= f <= 0.62, (opener, threebettor, f)
            (ip if preflop.in_position(opener, threebettor) else oop).append(f)
        if ip and oop:
            assert min(oop) >= max(ip) - 1e-9, (opener, ip, oop)


def test_chart_advice_reads_the_baseline_charts():
    adv = preflop.chart_advice
    assert adv("AKo", "UTG", "unopened") == preflop.ChartAdvice("raise", "UTG open", pytest.approx(1.0))
    assert adv("72o", "UTG", "unopened").action == "fold"
    assert adv("98o", "BTN", "unopened").action == "raise"
    assert adv("KQo", "BB", "unopened").action == "check"
    assert adv("AQs", "BB", "unopened", limpers=1).action == "raise"
    a = adv("A5s", "BTN", "vs_open", opener="CO")
    assert (a.action, a.chart) == ("3bet", "light 3-bet vs CO")
    a = adv("JJ", "BTN", "vs_open", opener="CO")
    assert (a.action, a.chart) == ("3bet", "value 3-bet vs CO")
    a = adv("KQs", "BTN", "vs_open", opener="CO")
    assert (a.action, a.chart) == ("call", "flat vs CO")
    assert adv("K7o", "BTN", "vs_open", opener="CO").action == "fold"
    a = adv("K9s", "BB", "vs_open", opener="BTN")
    assert (a.action, a.chart) == ("call", "BB defence vs BTN")
    assert adv("72o", "BB", "vs_open", opener="BTN").action == "fold"
    a = adv("QQ", "UTG", "vs_3bet", opener="UTG", threebettor="BTN")
    assert (a.action, a.chart) == ("4bet", "value 4-bet")
    a = adv("JJ", "UTG", "vs_3bet", opener="UTG", threebettor="BTN")
    assert (a.action, a.chart) == ("call", "call a 3-bet out of position")
    assert adv("22", "UTG", "vs_3bet", opener="UTG", threebettor="BTN").action == "fold"
    assert adv("QQ", "UTG", "vs_4bet", price=0.35).action == "call"
    assert adv("QQ", "UTG", "vs_4bet", price=0.45).action == "fold"
    assert adv("KK", "UTG", "vs_4bet", price=0.45).action == "jam"
    with pytest.raises(ValueError):
        adv("AA", "UTG", "vs_cbet")


def test_chart_advice_open_matches_rfi_exactly():
    """The coach's "it's in your UTG chart" and History's open grading agree."""
    for pos in ("UTG", "MP", "CO", "BTN", "SB"):
        raised = {c for c in CLASSES if preflop.chart_advice(c, pos, "unopened").action == "raise"}
        assert raised == _rfi_classes(pos), pos


def test_render_names_every_chart():
    from poker.strategy.charts.render import render_markdown

    md = render_markdown()
    assert md.startswith(preflop.MD_START) and md.rstrip().endswith(preflop.MD_END)
    assert "baseline, not solver, for owner review" in md
    for heading in ("Opening order", "Facing an open", "BB defence", "Facing a 3-bet",
                    "Facing a 4-bet", "Limped pots", "Squeeze and cold 4-bet", "Short stacks"):
        assert heading in md, heading
    assert md == render_markdown()


def test_strategy_md_block_in_sync():
    from poker.strategy.charts.render import render_markdown

    text = STRATEGY_MD.read_text()
    start, end = text.find(preflop.MD_START), text.find(preflop.MD_END)
    assert 0 <= start < end, "run backend/scripts/render_charts.py --write"
    assert text[start : end + len(preflop.MD_END)] + "\n" == render_markdown()
