"""P3.10: the spot book (design §5 L3), one test per (row, type).

A row outside its bounds is a finding: fix the policy, or (when the bound is
wrong) keep it failing here as a strict xfail with the measured value, for the
owner's review.
"""

from __future__ import annotations

import pytest

from poker.strategy.private import build_private
from validation.spotbook import MEASURES, RANGE, SPOTS, TYPE_CODES, BY_ID, bounds_for, build, cases, evaluate_spot, within

OWNER_REVIEW: dict[tuple[str, str], str] = {
    ("sb04", "lag"): "measured 0.799",
    ("sb13", "tag"): "measured 0.924",
    ("sb45", "tag"): "measured 0.646",
    ("sb46", "nit"): "measured 0.129",
}


def _params():
    out = []
    for row, t in cases():
        marks = []
        if (row.id, t) in OWNER_REVIEW:
            marks.append(pytest.mark.xfail(strict=True, reason=f"owner review: {OWNER_REVIEW[(row.id, t)]}"))
        out.append(pytest.param(row, t, id=f"{row.id}-{t}", marks=marks))
    return out


@pytest.mark.parametrize(("row", "type_key"), _params())
def test_spot(row, type_key):
    lo, hi = bounds_for(row, type_key)
    v = evaluate_spot(row, type_key)
    assert within(v, lo, hi), f"{row.id} ({row.note}), {type_key}: {v:.4f} not in [{lo:.3f}, {hi:.3f}]"


def test_spotbook_has_60_rows():
    assert len(SPOTS) == 60 and len(BY_ID) == 60
    assert [r.id for r in SPOTS] == [f"sb{i:02d}" for i in range(1, 61)]


def test_every_row_names_a_known_measure_and_type():
    for row in SPOTS:
        assert row.measure in MEASURES, row.id
        assert row.bounds and set(row.bounds) <= set(TYPE_CODES.values()), row.id
        assert (row.hero == RANGE) == row.measure.startswith("range_"), row.id
        for lo, hi in row.bounds.values():
            assert 0.0 <= lo <= hi <= 1.0, row.id
        if row.ref is not None:
            assert row.ref[0] is None or row.ref[0] in BY_ID
            assert row.ref[3] in ("lo", "hi")


def test_floor_rows_hold_the_nuts():
    for rid in ("sb05", "sb38", "sb60"):
        row = BY_ID[rid]
        spot = build(row)
        assert build_private(spot, (row.hero[:2], row.hero[2:])).nuts, rid
        assert spot.to_call > 0
