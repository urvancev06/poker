"""Phase 7 tests: the bot lab + the CFR learning module.

The lab is just a JSON wrapper over the Phase-3 machinery, so we test that:
  - knob overrides actually move the emergent stats in the right direction,
  - the report structure (bands, gate) is well-formed,
  - the API endpoints respond.

The CFR module has a *known* answer, so we test convergence hard:
  - game value -> -1/18,
  - exploitability -> ~0,
  - the stable pure components of the equilibrium.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from poker.api.app import create_app
from poker.learn import EQUILIBRIUM_VALUE, kuhn_cfr, train
from poker.sim.lab import archetypes_info, run_lab, sanitize_overrides


# --------------------------------------------------------------------------- #
# Bot lab
# --------------------------------------------------------------------------- #
def test_archetypes_info_well_formed():
    info = archetypes_info()
    keys = {a["key"] for a in info["archetypes"]}
    assert keys == {"nit", "tag", "lag", "station", "maniac"}
    # Every archetype exposes a value for every tunable knob.
    knob_keys = {k["key"] for k in info["knob_meta"]}
    for a in info["archetypes"]:
        assert set(a["knobs"]) == knob_keys
    # TAG carries its target bands.
    tag = next(a for a in info["archetypes"] if a["key"] == "tag")
    assert tag["targets"]["vpip"] == [20, 24] or tuple(tag["targets"]["vpip"]) == (20, 24)


def test_sanitize_overrides_drops_unknown():
    raw = {
        "tag": {"cbet_freq": 0.9, "not_a_knob": 5, "rfi_raise": {}},
        "bogus": {"cbet_freq": 0.5},
        "STATION": {"calldown_freq": 0.99},  # case-insensitive key
    }
    clean = sanitize_overrides(raw)
    assert clean["tag"] == {"cbet_freq": 0.9}   # unknown knobs dropped
    assert "bogus" not in clean                  # unknown archetype dropped
    assert clean["station"] == {"calldown_freq": 0.99}  # key normalized to lower-case


def test_lab_report_structure_and_gate():
    res = run_lab(lineup=["nit", "tag", "lag", "station", "maniac", "tag"], hands=400, seed=1)
    assert res["hands"] == 400
    assert isinstance(res["gate_pass"], bool)
    archetypes_seen = {r["archetype"] for r in res["rows"]}
    assert archetypes_seen == {"Nit", "TAG", "LAG", "Calling Station", "Maniac"}
    tag_row = next(r for r in res["rows"] if r["archetype"] == "TAG")
    vpip = tag_row["stats"]["vpip"]
    assert "value" in vpip and "band" in vpip and "ok" in vpip
    assert vpip["band"] == [20, 24]


def test_lab_hands_capped():
    res = run_lab(lineup=["tag", "tag"], hands=10_000_000, seed=0)
    assert res["hands"] == 25_000  # MAX_LAB_HANDS


def test_override_loosens_calldown_raises_wtsd():
    """Cranking a calling station's calldown should raise its WTSD — a stat is an
    output of the knob, exactly the Principle-3 lesson the lab demonstrates."""
    lineup = ["station", "tag", "tag", "tag", "tag", "tag"]
    base = run_lab(lineup=lineup, hands=2_000, seed=7)
    loose = run_lab(lineup=lineup, hands=2_000, seed=7, overrides={"station": {"calldown_freq": 0.99}})
    base_wtsd = next(r for r in base["rows"] if r["archetype"] == "Calling Station")["stats"]["wtsd"]["value"]
    loose_wtsd = next(r for r in loose["rows"] if r["archetype"] == "Calling Station")["stats"]["wtsd"]["value"]
    assert loose_wtsd >= base_wtsd


# --------------------------------------------------------------------------- #
# CFR on Kuhn poker
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def solved():
    # Enough iterations to land close to the analytic equilibrium, deterministic.
    return train(iterations=60_000, seed=0, checkpoints=10)


def test_cfr_game_value_converges(solved):
    assert abs(solved["game_value"] - EQUILIBRIUM_VALUE) < 0.01


def test_cfr_exploitability_small(solved):
    # NashConv -> 0; vanilla CFR at 60k iters is comfortably under this.
    assert solved["exploitability"] < 0.03


def test_cfr_stable_pure_components(solved):
    strat = {s["infoset"]: s for s in solved["strategy"]}
    # P0 never opens the Q (betting it is dominated).
    assert strat["1:"]["bet"] < 0.05
    # P1 always calls a bet with the K, always folds the J.
    assert strat["2:b"]["bet"] > 0.95   # call
    assert strat["0:b"]["bet"] < 0.05   # fold
    # P1 always bets the K when checked to; P0 always calls a bet with the K.
    assert strat["2:p"]["bet"] > 0.95
    assert strat["2:pb"]["bet"] > 0.95


def test_cfr_trend_monotone_ish(solved):
    # Exploitability should broadly fall as training proceeds.
    expl = [c["exploitability"] for c in solved["trend"]]
    assert expl[-1] <= expl[0]


def test_exploitability_zero_at_known_equilibrium():
    """Sanity-check the best-response machinery itself against an exact analytic
    equilibrium (alpha = 1/3), independent of CFR. Its exploitability must be ~0."""
    a = 1.0 / 3.0  # the free parameter; alpha = 1/3 is one valid equilibrium
    avg = {
        # Player 0
        "0:": [1 - a, a],          # J: bluff-bet with freq alpha
        "1:": [1.0, 0.0],          # Q: always check
        "2:": [1 - 3 * a, 3 * a],  # K: bet with freq 3*alpha
        "0:pb": [1.0, 0.0],        # J: always fold to a bet
        "1:pb": [1 - (a + 1 / 3), a + 1 / 3],  # Q: call with freq alpha + 1/3
        "2:pb": [0.0, 1.0],        # K: always call
        # Player 1
        "0:p": [1 - 1 / 3, 1 / 3],  # J facing check: bluff-bet 1/3
        "1:p": [1.0, 0.0],          # Q facing check: check
        "2:p": [0.0, 1.0],          # K facing check: bet
        "0:b": [1.0, 0.0],          # J facing bet: fold
        "1:b": [1 - 1 / 3, 1 / 3],  # Q facing bet: call 1/3
        "2:b": [0.0, 1.0],          # K facing bet: call
    }
    assert kuhn_cfr.exploitability(avg) < 1e-9


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def client():
    return TestClient(create_app("sqlite://"))


def test_lab_endpoints(client):
    info = client.get("/lab/archetypes")
    assert info.status_code == 200
    assert "knob_meta" in info.json()

    res = client.post("/lab/simulate", json={"lineup": ["tag", "nit"], "hands": 300, "seed": 0})
    assert res.status_code == 200
    assert res.json()["hands"] == 300

    bad = client.post("/lab/simulate", json={"lineup": ["not-an-archetype"], "hands": 100})
    assert bad.status_code == 400


def test_cfr_endpoint(client):
    res = client.post("/lab/cfr", json={"iterations": 5_000, "seed": 0})
    assert res.status_code == 200
    body = res.json()
    assert abs(body["game_value"] - EQUILIBRIUM_VALUE) < 0.05
    assert len(body["strategy"]) == 12  # all 12 information sets
