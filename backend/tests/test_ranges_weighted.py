"""Weighted range strings and connector dashes (phase 2).

    "AKo:0.5, AA"     every AKo combo at weight 0.5, every AA combo at 1.0
    "T9s-54s"         suited connectors from T9s down to 54s (same gap, same suits)
    "J9s-64s"         one-gappers from J9s down to 64s
"""

from __future__ import annotations

import pytest

from poker.math import combos_in_range, parse_range, parse_token
from poker.math.ranges import parse_weighted


def _names(combos) -> set[str]:
    """Class names ("T9s", "QQ", "AKo") of a combo set."""
    out = set()
    for a, b in combos:
        if a[0] == b[0]:
            out.add(a[0] + b[0])
        else:
            out.add(a[0] + b[0] + ("s" if a[1] == b[1] else "o"))
    return out


def test_suited_connector_dash():
    combos = parse_range("T9s-54s")
    assert len(combos) == 24
    assert _names(combos) == {"T9s", "98s", "87s", "76s", "65s", "54s"}


def test_one_gapper_dash():
    assert _names(parse_range("J9s-64s")) == {"J9s", "T8s", "97s", "86s", "75s", "64s"}


def test_connector_dash_either_order_and_offsuit_and_bare():
    assert parse_range("54s-T9s") == parse_range("T9s-54s")
    assert _names(parse_range("KQo-JTo")) == {"KQo", "QJo", "JTo"} and len(parse_range("KQo-JTo")) == 36
    assert len(parse_range("T9-87")) == 3 * 16


@pytest.mark.parametrize(
    "token, count",
    [
        ("AA", 6),
        ("22+", 78),
        ("TT+", 30),
        ("ATs+", 16),
        ("AKo", 12),
        ("AKs", 4),
        ("AK", 16),
        ("A5s-A2s", 16),
        ("99-66", 24),
        ("AhKs", 1),
    ],
)
def test_token_counts_are_unchanged(token, count):
    """The counts of test_math.py::test_range_token_counts, through every entry point."""
    assert len(parse_token(token)) == count
    assert len(parse_range(token)) == count
    weighted = parse_weighted(token)
    assert len(weighted) == count and set(weighted.values()) == {1.0}
    assert set(weighted) == parse_token(token)


def test_weights():
    w = parse_weighted("AKo:0.5, AA")
    assert len(w) == 18
    assert all(w[c] == 0.5 for c in parse_token("AKo"))
    assert all(w[c] == 1.0 for c in parse_token("AA"))


def test_the_larger_weight_wins():
    w = parse_weighted("AKo:0.3, AKo:0.6, AK:0.2")
    assert all(w[c] == 0.6 for c in parse_token("AKo"))
    assert all(w[c] == 0.2 for c in parse_token("AKs"))
    w = parse_weighted("TT+:0.25, AA")
    assert all(w[c] == 1.0 for c in parse_token("AA"))
    assert all(w[c] == 0.25 for c in parse_token("KK"))


def test_weighted_syntax_everywhere():
    assert parse_weighted("AhKs:0.25") == {("Ah", "Ks"): 0.25}
    assert parse_weighted(" AKo : 0.5 ,, ") == {c: 0.5 for c in parse_token("AKo")}
    assert parse_weighted("T9s-54s:0.5") == {c: 0.5 for c in parse_range("T9s-54s")}
    assert parse_weighted("AA:1") == parse_weighted("AA:1.0") == {c: 1.0 for c in parse_token("AA")}
    assert parse_weighted("") == {}
    assert parse_range("AKo:0.5, AA") == parse_token("AKo") | parse_token("AA")
    assert len(combos_in_range("AA:0.5", dead=("As",))) == 3


def test_weighted_order_does_not_depend_on_the_hash_seed():
    """Equity samples range lists in order, so the dict's order must not follow
    Python's per-process string hash."""
    import os
    import subprocess
    import sys
    from pathlib import Path

    code = "from poker.math.ranges import parse_weighted; print(list(parse_weighted('AKo:0.5, T9s-54s, 22+')))"
    backend = Path(__file__).resolve().parents[1]
    outs = {
        subprocess.run(
            [sys.executable, "-c", code], cwd=backend, capture_output=True, text=True, check=True,
            env={**os.environ, "PYTHONHASHSEED": seed, "PYTHONPATH": str(backend)},
        ).stdout
        for seed in ("1", "2", "3")
    }
    assert len(outs) == 1


@pytest.mark.parametrize(
    "text",
    ["AKo:1.5", "AKo:-1", "AKo:x", "AKo:0", "AKo:", "AKo:nan", "AKo:inf", "T9s-54o", "T9s-64s", "TT-54s", "K2s-Q2s"],
)
def test_bad_ranges_raise(text):
    with pytest.raises(ValueError):
        parse_weighted(text)
    with pytest.raises(ValueError):
        parse_range(text)
