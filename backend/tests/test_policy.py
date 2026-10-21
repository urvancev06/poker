"""P3.8: the policy entry point, PersonaBot and its trace."""

from __future__ import annotations

import random
import re
import subprocess
import sys
import time
from pathlib import Path

import pytest

from poker.bots import build_context
from poker.bots.personas import LeakSpec, Persona, make_persona
from poker.engine import ActionType, Hand
from poker.strategy.dials import TYPE_DISPLAY, type_mean
from poker.strategy.private import build_private
from poker.strategy.scenario import scenario
from poker.strategy.spot import build_spot
from poker.strategy.types import Choice, Kind, Trace

from poker.bots.bot_v2 import PersonaBot
from poker.strategy.policy import apply_floors, explain, policy, policy_hash, sample

SRP = ["BTN raise 2.5", "BB call", "flop"]
TO_RIVER = ["BB check", "BTN check", "turn", "BB check", "BTN check", "river"]
CLASSIC = ("nit", "tag", "lag", "station", "maniac", "tag")
FOLD, CHECK, CALL = Choice(Kind.FOLD), Choice(Kind.CHECK), Choice(Kind.CALL)


def mean_persona(type_key: str, leaks=()) -> Persona:
    return Persona(f"{type_key}-mean", type_key, type_mean(type_key), tuple(LeakSpec(n, i) for n, i in leaks))


def setup(hero, board, *, hero_pos, line, **kw):
    s = build_spot(scenario(hero, board, hero_pos=hero_pos, line=line, **kw))
    return s, build_private(s, (hero[:2], hero[2:]))


def assert_legal(action, legal) -> None:
    t = action.type
    if t is ActionType.FOLD:
        assert legal.can_fold
    elif t is ActionType.CHECK:
        assert legal.can_check
    elif t is ActionType.CALL:
        assert legal.can_call
    else:
        assert legal.can_bet if t is ActionType.BET else legal.can_raise
        assert legal.min_raise_to <= action.to_amount <= legal.max_raise_to


def play(n_hands: int, seed: int, stacks_bb=(20, 300), lineup=CLASSIC):
    """Self-play ``n_hands`` of PersonaBots at 5/10; returns (log, times)."""
    rng = random.Random(seed)
    bots = [PersonaBot(make_persona(t, random.Random(seed * 100 + i), f"p{i}")) for i, t in enumerate(lineup)]
    n = len(bots)
    log, times = [], []
    for h in range(n_hands):
        stacks = [rng.randint(stacks_bb[0] * 10, stacks_bb[1] * 10) for _ in range(n)]
        hand = Hand.new(n, (5, 10), stacks, seed=rng.randrange(2**32))
        drng = random.Random(rng.randrange(2**32))
        while not hand.is_over and hand.actor is not None:
            seat = hand.actor
            legal = hand.legal_actions()
            ctx = build_context(hand, 10)
            bot = bots[(seat + h) % n]
            t0 = time.perf_counter()
            action = bot.act(ctx, drng)
            times.append(time.perf_counter() - t0)
            assert_legal(action, legal)
            assert isinstance(bot.last_trace, Trace)
            log.append((h, seat, str(action)))
            hand.apply(action)
        assert sum(hand.results()) == 0
    return log, times


@pytest.fixture(scope="module")
def fuzz():
    return play(200, seed=7)


def test_persona_bot_always_legal_fuzz(fuzz):
    log, _ = fuzz
    assert len(log) >= 1500


def test_decision_cost(fuzz):
    _, times = fuzz
    mean_ms = 1000 * sum(times) / len(times)
    print(f"\nPersonaBot mean decision time over {len(times)} decisions: {mean_ms:.3f} ms")
    assert mean_ms < 2.0


def test_self_play_is_deterministic_under_seed():
    assert play(15, seed=3)[0] == play(15, seed=3)[0]


def test_persona_bot_name_and_persona():
    p = make_persona("station", random.Random(1), "s1")
    bot = PersonaBot(p)
    assert bot.name == TYPE_DISPLAY["station"] and bot.persona is p and bot.last_trace is None


def test_nuts_never_fold_even_with_leaks():
    # Broadway on Qc Jh Td 2s 3h (no flush possible) is the absolute nuts.
    s, priv = setup("AsKs", "QcJhTd2s3h", hero_pos="BB", line=SRP + TO_RIVER + ["BB check", "BTN jam"])
    assert priv.nuts and s.to_call > 0
    persona = mean_persona("tag", [("cant_fold_pair", 1.0), ("scared_money", 1.0)])
    dist, trace = policy(s, priv, persona)
    assert dist.get(FOLD, 0.0) == 0.0
    assert sum(dist.values()) == pytest.approx(1.0)
    assert "scared_money" in trace.leaks


def test_no_fold_when_check_is_free():
    first_in = [
        ("Qc3d", "Kd8c2h", "BTN", SRP + ["BB check"]),
        ("7c2d", "", "BB", ["UTG call", "MP fold", "CO fold", "BTN fold", "SB call"]),
        ("6c5d", "Ks9d2h", "BB", SRP),
    ]
    for hero, board, pos, line in first_in:
        s, priv = setup(hero, board, hero_pos=pos, line=line)
        assert s.legal.can_check
        for key in ("nit", "tag", "maniac"):
            dist, _ = policy(s, priv, mean_persona(key, [("fit_or_fold", 1.0), ("scared_money", 1.0)]))
            assert FOLD not in dist
    # The floor moves any fold mass onto the free check.
    s, priv = setup(*first_in[0][:2], hero_pos=first_in[0][2], line=first_in[0][3])
    out = apply_floors({FOLD: 0.4, CHECK: 0.5, Choice(Kind.BET, 0.33): 0.1}, s, priv)
    assert out == {CHECK: pytest.approx(0.9), Choice(Kind.BET, 0.33): pytest.approx(0.1)}


def test_illegal_kinds_go_to_what_the_engine_would_play():
    # Facing a jam that covers the hero: no raise is legal, so raise mass is a call.
    s, priv = setup("KsJd", "Kh7c2d9s4h", hero_pos="BB", line=SRP + TO_RIVER + ["BB check", "BTN jam"])
    assert not s.legal.can_aggress
    out = apply_floors({FOLD: 0.2, Choice(Kind.RAISE): 0.3, Choice(Kind.JAM): 0.1, CALL: 0.4}, s, priv)
    assert out == {FOLD: pytest.approx(0.2), CALL: pytest.approx(0.8)}


def test_trace_fields_present():
    cases = [
        ("AsAh", "", "UTG", []),
        ("Jh4h", "9h7h2c", "BB", SRP + ["BB check", "BTN bet 0.5"]),
        ("KsJd", "Kh7d2c", "BTN", SRP + ["BB check"]),
    ]
    for hero, board, pos, line in cases:
        s, priv = setup(hero, board, hero_pos=pos, line=line)
        dist, tr = policy(s, priv, mean_persona("tag"))
        assert tr.street == s.street and tr.node == s.node.value
        assert isinstance(tr.features, dict) and tr.features
        assert {"cls", "s", "hs", "nuts"} <= set(tr.strength)
        assert sum(tr.dist.values()) == pytest.approx(1.0)
        assert len(tr.dist) == len(dist)
        assert all(re.fullmatch(r"(fold|check|call|raise|jam)|bet( [0-9.]+)?|raise( [0-9.]+)?", k) for k in tr.dist)
        assert isinstance(tr.leaks, tuple)
        lines = explain(tr)
        assert lines and all(isinstance(x, str) and x for x in lines)
    # Preflop traces carry the chart node; facing-bet traces carry the price.
    s, priv = setup("Jh4h", "9h7h2c", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    tr = policy(s, priv, mean_persona("tag"))[1]
    assert tr.eq is not None and tr.price is not None and tr.margin is not None and tr.prior is not None
    s, priv = setup("AsAh", "", hero_pos="UTG", line=[])
    tr = policy(s, priv, mean_persona("tag"))[1]
    assert tr.features["node"] == "unopened" and tr.eq is None


def test_sample_is_seeded_and_ordered():
    dist = {Choice(Kind.BET, 0.66): 0.25, CHECK: 0.5, Choice(Kind.BET, 0.33): 0.25}
    draws = [sample(dist, random.Random(i)) for i in range(400)]
    assert draws == [sample(dict(reversed(list(dist.items()))), random.Random(i)) for i in range(400)]
    share = draws.count(CHECK) / len(draws)
    assert 0.4 < share < 0.6


def test_policy_hash_is_stable():
    h = policy_hash()
    assert re.fullmatch(r"[0-9a-f]{12}", h)
    import importlib

    import poker.strategy.policy as mod

    assert importlib.reload(mod).policy_hash() == h
    backend = Path(__file__).resolve().parents[1]
    code = "from poker.strategy.policy import policy_hash; print(policy_hash())"
    for seed in ("1", "2"):
        out = subprocess.run(
            [sys.executable, "-c", code], cwd=backend, capture_output=True, text=True, check=True,
            env={"PYTHONPATH": str(backend), "PYTHONHASHSEED": seed},
        ).stdout.strip()
        assert out == h


def test_bluff_quantile_is_built_only_where_the_policy_reads_it():
    from poker.math.board import board_cache

    # First in with air: the board's D33 bluff quantile.
    s, priv = setup("Qc3d", "Kd8c2h", hero_pos="BTN", line=SRP + ["BB check"])
    assert priv.bluff_q == board_cache(s.board).bluff_quantile(("Qc", "3d")) < 1.0
    # Facing a bet the policy never reads it: 1.0, and the board's ranking (16 ms
    # a board) is not built.
    s, priv = setup("Qc3d", "Js6h4d", hero_pos="BB", line=SRP + ["BB check", "BTN bet 0.5"])
    assert priv.bluff_q == 1.0 and board_cache(s.board)._bluff is None


def test_air_bluff_quantile_is_over_the_hero_own_range():
    """D33 ranks the board's air combos board-wide, but a BTN's range holds the
    board's best bluff candidates, so it bet 92% of its air where f_air is 65%
    (spot book sb13). The quantile is now the weighted rank among the hero's own
    preflop-line range's air (no own pair, no draw), so f_air is the share of
    that air that bets."""
    import numpy as np

    from poker.math.cards import FULL_DECK
    from poker.math.vector import COMBOS
    from poker.strategy.postflop import own_bluff_quantile
    from poker.strategy.preflop import range_array

    s, priv = setup("QsJs", "Kh7d2c", hero_pos="BTN", line=SRP + ["BB check"])
    tag = type_mean("tag")
    w = range_array(tag, s, s.seat, s.board)
    qs, ws = [], []
    for cid in np.flatnonzero(w > 0).tolist():
        a, b = COMBOS[cid]
        q = own_bluff_quantile(s, (FULL_DECK[a], FULL_DECK[b]), tag)
        if q < 1.0:
            qs.append(q)
            ws.append(w[cid])
    qs, ws = np.array(qs), np.array(ws)
    assert len(qs) > 20 and qs.min() == 0.0
    assert abs(ws[qs < 0.5].sum() / ws.sum() - 0.5) < 0.05
    # The policy reads it for first-in air.
    hole = ("Qs", "5s")
    s2, p2 = setup("Qs5s", "Kh7d2c", hero_pos="BTN", line=SRP + ["BB check"])
    tr = policy(s2, p2, mean_persona("tag"))[1]
    assert tr.features["air"] and tr.strength["bluff_q"] == own_bluff_quantile(s2, hole, tag)
