"""The v2 beta table (P3.12): engine=v2 seats the Classic lineup as PersonaBots
in shuffled seats, records persist the engine, the policy hash and the
server-only truth, and the coach runs in its reduced mode (D24): exact equity
against the pool-average preflop line and the price, no realization, no EV and
no postflop verdict. Preflop it gives the chart advice from the same charts the
v2 bots use (owner decision a). History grades v2 hands reduced (D25), with the
opens graded against the same charts.
"""

from __future__ import annotations

import json
import re

import pytest
from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.bots import PersonaBot
from poker.coach import build_coaching, leak_summary, review_hand
from poker.engine import Action, ActionType
from poker.game import GameSession
from poker.math.suits import class_of
from poker.strategy.charts.preflop import chart_advice
from poker.strategy.dials import TYPE_DISPLAY

_NAMES = sorted(TYPE_DISPLAY.values())
_NAME_RE = re.compile(r"\b(" + "|".join(re.escape(n) for n in TYPE_DISPLAY.values()) + r")\b")


def _hero_policy(gs: GameSession) -> Action:
    """Deterministic: check if free, call small bets, otherwise fold."""
    la = gs.state().legal_actions
    if la.can_check:
        return Action(ActionType.CHECK)
    if la.can_call and la.call_amount <= 50:
        return Action(ActionType.CALL)
    return Action(ActionType.FOLD)


def _v2(seed: int = 5) -> GameSession:
    return GameSession(session_id=f"v2s{seed}", villains=[], seed=seed, engine="v2")


def _find(gs: GameSession, want, policy=_hero_policy, hands: int = 60):
    """Play until ``want(gs)`` holds at a hero decision; the session stays there."""
    for _ in range(hands):
        gs.start_hand()
        while not gs.hand_over:
            if want(gs):
                return gs
            gs.submit_hero_action(policy(gs))
    raise AssertionError("no such decision")


def _facing_postflop_bet(gs: GameSession) -> bool:
    st = gs.state()
    return len(st.board) >= 3 and st.legal_actions.call_amount > 0


def _call_any(gs: GameSession) -> Action:
    la = gs.state().legal_actions
    return Action(ActionType.CHECK) if la.can_check else Action(ActionType.CALL)


def test_v2_session_classic_shuffled():
    with TestClient(create_app("sqlite://")) as client:
        a = client.post("/session", json={"engine": "v2", "seed": 5}).json()
        b = client.post("/session", json={"engine": "v2", "seed": 6}).json()
        assert a["engine"] == "v2" and sorted(a["archetypes"][1:]) == _NAMES
        assert a["archetypes"][1:] != b["archetypes"][1:]
        assert client.post("/session", json={"engine": "v3"}).status_code == 422
        assert client.post("/session", json={"seed": 5}).json()["engine"] == "v1"
    gs = _v2(5)
    assert all(isinstance(gs._bots[p], PersonaBot) for p in range(1, 6))


def test_v2_hands_play_and_persist():
    gs = _v2(7)
    for _ in range(40):
        gs.start_hand()
        while not gs.hand_over:
            gs.submit_hero_action(_hero_policy(gs))
        r = gs.last_result
        assert sum(r["results_by_player"].values()) + r["rake"] == 0
        json.dumps(r)  # the record (truth included) is plain JSON
    assert r["versions"]["engine"] == "v2"
    assert re.fullmatch(r"[0-9a-f]{12}", r["versions"]["policy_hash"])
    personas = r["truth"]["personas"]
    assert len(personas) == 5 and {p["type"] for p in personas} == set(TYPE_DISPLAY)
    assert all(t["player"] != 0 for t in r["truth"]["traces"])
    assert "truth" not in gs.public_last_result


def test_truth_never_served():
    with TestClient(create_app("sqlite://")) as client:
        sid = client.post("/session", json={"engine": "v2", "seed": 9, "auto_advance": True}).json()["session_id"]
        for _ in range(30):
            st = client.get(f"/session/{sid}").json()
            if st["hand_over"]:
                break
            la = st["state"]["legal_actions"]
            client.post(f"/session/{sid}/action", json={"type": "check" if la["can_check"] else "fold"})
        hands = client.get("/hands", params={"session_id": sid}).json()
        assert hands
        data = client.get(f"/hands/{hands[0]['id']}").json()["data"]
        assert "truth" not in data and data["versions"]["engine"] == "v2"


def test_reduced_coach():
    gs = _find(_v2(5), _facing_postflop_bet, policy=_call_any)
    c = build_coaching(gs)
    d = c.as_dict()
    assert (d["mode"], d["verdict"], d["tone"]) == ("reduced", "Odds only.", "neutral")
    assert d["mode_note"] == "Not yet calibrated for the new bots"
    assert d["call_ev"] is None and d["realization_pct"] == 100 and d["implied_note"] == ""
    assert d["equity_method"] in ("exact", "sampled", "preflop_table")
    assert d["required_direct_pct"] == round(100 * d["to_call"] / d["winnable"], 1)
    assert d["required_equity_pct"] == d["required_direct_pct"]
    assert d["advice"] is None
    texts = [d["rationale"], *d["basis"], *(v["description"] for v in d["villains"])]
    assert not any(_NAME_RE.search(t) for t in texts), texts
    assert all(v["archetype"] == "Pool average" for v in d["villains"])
    pos = gs.state().seats[d["villains"][0]["seat"]].position
    assert d["villains"][0]["description"].startswith(f"{pos}, ")


def test_reduced_coach_is_label_blind():
    """§5 L7 preview: swap who is who and the coaching JSON does not move."""
    gs = _find(_v2(5), _facing_postflop_bet, policy=_call_any)
    before = json.dumps(build_coaching(gs).as_dict(), sort_keys=True)
    bots = [gs._bots[p] for p in range(1, gs.n)]
    personas = [b.persona for b in bots]
    for b, p in zip(bots, personas[::-1]):
        b.persona = p
    gs.archetype_of = ["hero", *gs.archetype_of[1:][::-1]]
    assert json.dumps(build_coaching(gs).as_dict(), sort_keys=True) == before


def _first_in(gs: GameSession) -> bool:
    st = gs.state()
    return not st.board and not any(e.action in ("bet", "raise", "call") for e in st.history) \
        and st.seats[gs.hero_seat].position not in ("BB",)


def test_preflop_chart_advice_first_in():
    """Owner decision a: "Open-raise to 2.5 bb" / "Fold." from the bots' charts."""
    seen = set()
    gs = _v2(3)
    for _ in range(80):
        gs.start_hand()
        while not gs.hand_over:
            if _first_in(gs):
                st = gs.state()
                pos = st.seats[gs.hero_seat].position
                cls = class_of(st.seats[gs.hero_seat].hole_cards)
                d = build_coaching(gs).as_dict()
                adv = d["advice"]
                want = chart_advice(cls, pos, "unopened")
                assert d["mode"] == "reduced" and adv["hand"] == cls and adv["position"] == pos
                assert adv["action"] == want.action and adv["in_chart"] == (want.action == "raise")
                if want.action == "raise":
                    bb_size = 3.0 if pos == "SB" else 2.5
                    assert adv["to_amount"] == round(bb_size * 10)
                    assert d["verdict"] == f"Open-raise to {bb_size:g} bb." and d["tone"] == "good"
                    assert d["rationale"] == f"{cls} is in your {pos} chart."
                    seen.add("raise")
                else:
                    assert d["verdict"] == "Fold." and d["tone"] == "fold" and adv["to_amount"] is None
                    assert d["rationale"] == f"{cls} is not in your {pos} chart."
                    seen.add("fold")
                assert d["mode_note"] == "Preflop chart advice; odds only after the flop"
            gs.submit_hero_action(_hero_policy(gs))
        if seen == {"raise", "fold"}:
            break
    assert seen == {"raise", "fold"}


def test_preflop_chart_advice_facing_an_open():
    def facing_open(gs):
        st = gs.state()
        raises = [e for e in st.history if e.action in ("bet", "raise")]
        acted = any(e.seat == gs.hero_seat for e in st.history)
        limped = any(e.action == "call" for e in st.history[: st.history.index(raises[0])]) if raises else True
        return not st.board and len(raises) == 1 and not acted and not limped

    gs = _find(_v2(4), facing_open, hands=80)
    st = gs.state()
    d = build_coaching(gs).as_dict()
    adv = d["advice"]
    assert adv["action"] in ("3bet", "call", "fold")
    if adv["action"] == "3bet":
        assert d["verdict"].startswith("3-bet to ") and adv["to_amount"] > st.legal_actions.call_amount
    elif adv["action"] == "call":
        assert d["verdict"] == "Call." and adv["chart"]
    else:
        assert d["verdict"] == "Fold."
    assert d["call_ev"] is None and (d["equity_method"] == "preflop_table" or len(d["villains"]) > 1)


def test_no_chart_spot_is_odds_only():
    """A limper facing an iso-raise has no chart: the coach shows the odds only."""
    def limped_then_raised(gs):
        st = gs.state()
        mine = [e for e in st.history if e.seat == gs.hero_seat]
        return not st.board and bool(mine) and mine[-1].action == "call" and st.legal_actions.call_amount > 0

    def limp(gs):
        la = gs.state().legal_actions
        if not gs.state().board and la.can_call and la.call_amount <= 10:
            return Action(ActionType.CALL)
        return _hero_policy(gs)

    gs = _find(_v2(4), limped_then_raised, policy=limp, hands=120)
    d = build_coaching(gs).as_dict()
    assert d["advice"] is None and d["verdict"] == "Odds only." and d["mode_note"] == "Not yet calibrated for the new bots"


def _check_fold(gs: GameSession) -> Action:
    return Action(ActionType.CHECK) if gs.state().legal_actions.can_check else Action(ActionType.FOLD)


def _v2_record(seed: int = 7, policy=_hero_policy) -> list[dict]:
    gs = _v2(seed)
    out = []
    for _ in range(25):
        gs.start_hand()
        while not gs.hand_over:
            gs.submit_hero_action(policy(gs))
        out.append(gs.last_result)
    return out


def test_v2_review_is_reduced():
    records = _v2_record()
    rev = review_hand(records[0])
    assert rev["decisions"] and all(d["graded_by"] == "reduced" for d in rev["decisions"])
    kinds = {leak["type"] for r in records for leak in review_hand(r)["leaks"]}
    assert not kinds & {"call_no_odds", "fold_with_odds"}
    summary = leak_summary(records[:1])
    assert summary["hands_reduced"] == 1


def test_v2_review_grades_opens_against_the_charts():
    """A fold of an in-chart hand when folded to is a tight fold that names the chart."""
    found = set()
    for policy in (_check_fold, _hero_policy):  # folds first in, then limps first in
        for r in _v2_record(seed=3, policy=policy):
            for leak in review_hand(r)["leaks"]:
                if leak["type"] in ("tight_fold", "loose_open", "limp"):
                    assert "chart" in leak["note"] and not _NAME_RE.search(leak["note"])
                    found.add(leak["type"])
    assert {"tight_fold", "limp"} <= found


def test_v1_sessions_unchanged():
    gs = GameSession(session_id="v1", villains=["nit", "tag", "lag", "station", "maniac"], seed=5)
    assert gs.engine == "v1"
    gs = _find(gs, lambda g: g.state().legal_actions.call_amount > 0)
    d = build_coaching(gs).as_dict()
    assert d["mode"] == "full" and d["mode_note"] is None and d["advice"] is None
    rec = _play_out(gs)
    assert "policy_hash" not in rec["versions"] and "personas" not in rec["truth"]
    assert all(d["graded_by"] == "full" for d in review_hand(rec)["decisions"])
    assert leak_summary([rec])["hands_reduced"] == 0


def _play_out(gs: GameSession) -> dict:
    while not gs.hand_over:
        gs.submit_hero_action(_hero_policy(gs))
    return gs.last_result


@pytest.mark.parametrize("villains", [["tag", "nit"], ["lag", "tag", "station", "maniac", "nit"]])
def test_v2_takes_a_given_lineup(villains):
    gs = GameSession(session_id="x", villains=villains, seed=1, engine="v2")
    assert sorted(gs.archetype_of[1:]) == sorted(TYPE_DISPLAY[v] for v in villains)
