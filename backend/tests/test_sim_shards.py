"""The simulator in shards: hand h depends only on (seed, h), so splitting a run
into shards and merging their counts gives exactly the single-process run, for
any shard size and any number of workers. And the new chip unit is the default.
"""

from __future__ import annotations

import pytest

from poker.sim import run
from poker.sim.runner import DEFAULT_LINEUP, run_shard, shard_spec
from poker.sim.stats import StatsAccumulator

_ARCHS = ["Nit", "TAG", "LAG", "Calling Station", "Maniac"]


def test_sharded_run_is_identical_for_any_worker_count():
    whole = run(1200, seed=3)
    sharded = run(1200, seed=3, workers=3, shard_size=400)
    assert [whole.line(a) for a in _ARCHS] == [sharded.line(a) for a in _ARCHS]
    assert whole.archetypes() == sharded.archetypes()


def test_uneven_shards_in_one_process_match_the_whole_run():
    whole = run(700, seed=8)
    sharded = run(700, seed=8, workers=1, shard_size=250)  # 250 + 250 + 200
    assert whole.to_counts() == sharded.to_counts()


def test_merge_is_exact():
    spec = shard_spec(lineup=DEFAULT_LINEUP, seed=5)
    first = StatsAccumulator.from_counts(run_shard(spec, 0, 150), big_blind=10)
    second = StatsAccumulator.from_counts(run_shard(spec, 150, 300), big_blind=10)
    first.merge(second)
    whole = run(300, seed=5)
    assert first.to_counts() == whole.to_counts()
    assert [first.line(a) for a in _ARCHS] == [whole.line(a) for a in _ARCHS]


def test_counts_round_trip():
    acc = run(120, seed=1)
    back = StatsAccumulator.from_counts(acc.to_counts(), big_blind=10)
    assert back.to_counts() == acc.to_counts()
    assert [back.line(a) for a in _ARCHS] == [acc.line(a) for a in _ARCHS]


def test_progress_reports_hands_done_in_order():
    seen: list[int] = []
    run(900, seed=2, shard_size=300, on_progress=seen.append)
    assert seen == [300, 600, 900]


def test_cancel_stops_between_shards():
    calls = {"n": 0}

    def cancelled() -> bool:
        calls["n"] += 1
        return calls["n"] > 1  # let the first shard through, then stop

    acc = run(900, seed=2, shard_size=300, cancelled=cancelled)
    assert acc.line("TAG").hands == 300 * 2  # one shard of a lineup with two TAGs


def test_sim_defaults_are_5_10_1000():
    spec = shard_spec(lineup=DEFAULT_LINEUP, seed=0)
    assert spec["blinds"] == (5, 10) and spec["starting_stack"] == 1000
    acc = run(50, seed=0)
    assert acc.big_blind == 10


def test_observer_needs_one_worker():
    with pytest.raises(ValueError):
        run(10, seed=0, workers=2, observer=lambda *a: None)


def test_v1_fingerprint_is_reproducible_and_seed_sensitive():
    import random

    from poker.sim.fingerprint import v1_fingerprint

    random.seed(1)
    a = v1_fingerprint(40, seed=0)
    random.seed(2)
    assert v1_fingerprint(40, seed=0) == a
    assert v1_fingerprint(40, seed=1) != a
    assert len(a) == 16 and int(a, 16) >= 0
