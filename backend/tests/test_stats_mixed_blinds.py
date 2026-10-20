"""Stats over hands at different blind levels (Review Focus 1, D13).

The live database holds hands at 1/2; new sessions play 5/10. bb/100 divides
each hand's net by that hand's own big blind, so a mix of levels is one honest
figure rather than nonsense, and every hand counts.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.db import HandRecord, make_engine, make_session_factory, save_hand
from poker.sim.hero_stats import hero_report
from poker.sim.table import PlayerHandSummary


def _summary(net: int) -> dict:
    return asdict(PlayerHandSummary(player=0, archetype="0", net=net))


def _row(session_id: str, index: int, net: int, blinds: list[int] | None) -> HandRecord:
    data = {
        "session_id": session_id,
        "hand_index": index,
        "hero_net": net,
        "hero_summary": _summary(net),
        "actions": [],
    }
    if blinds is not None:
        data["blinds"] = blinds
    return HandRecord(
        session_id=session_id, hand_index=index, hero_position="BTN", hero_cards="AsKs",
        board="", pot=0, hero_net=net, went_to_showdown=False, data=data,
    )


def test_hero_report_normalises_each_hand_by_its_own_big_blind():
    summaries = [_summary(4), _summary(-20)]
    # 4 chips at 1/2 is +2 bb; -20 at 5/10 is -2 bb: the two cancel.
    rep = hero_report(summaries, big_blinds=[2, 10])
    assert rep["overall"]["net_bb_per_100"] == 0.0
    # Without per-hand blinds it keeps the old single-level behaviour.
    assert hero_report(summaries, big_blind=2)["overall"]["net_bb_per_100"] == -400.0


def test_hero_report_trend_buckets_use_per_hand_big_blinds():
    # 40 hands: the first half +10 chips at 5/10 (+1 bb), the second +2 at 1/2 (+1 bb).
    summaries = [_summary(10)] * 20 + [_summary(2)] * 20
    rep = hero_report(summaries, buckets=8, big_blinds=[10] * 20 + [2] * 20)
    assert rep["overall"]["net_bb_per_100"] == 100.0
    assert [b["net_bb_per_100"] for b in rep["trend"]] == [100.0] * 8


def test_stats_me_mixed_blinds_normalises_per_hand(tmp_path):
    url = f"sqlite:///{tmp_path / 'mixed.db'}"
    client = TestClient(create_app(url))
    db = make_session_factory(make_engine(url))()
    save_hand(db, _row("s", 0, 4, [1, 2]))
    save_hand(db, _row("s", 1, -20, [5, 10]))
    db.close()

    me = client.get("/stats/me").json()
    assert me["overall"]["hands"] == 2
    assert me["overall"]["net_bb_per_100"] == 0.0
    assert me["window"]["blind_levels"] == [[1, 2], [5, 10]]
    assert me["window"]["big_blind"] == 10  # the most recent level
    assert me["window"]["hands_at_this_blind"] == 2  # every hand counts now

    hands = client.get("/hands").json()
    assert sorted(h["big_blind"] for h in hands) == [2, 10]


def test_hand_summary_big_blind_falls_back_to_the_legacy_level(tmp_path):
    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    client = TestClient(create_app(url))
    db = make_session_factory(make_engine(url))()
    save_hand(db, _row("old", 0, 3, None))  # a row from before blinds were stored
    db.close()

    [h] = client.get("/hands").json()
    assert h["big_blind"] == 2
    assert client.get(f"/hands/{h['id']}").json()["big_blind"] == 2
    me = client.get("/stats/me").json()
    assert me["overall"]["net_bb_per_100"] == 150.0
    assert me["window"]["blind_levels"] == [[1, 2]]
