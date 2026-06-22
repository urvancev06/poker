"""Phase 6 tests: the learning-layer stats machinery.

- the post-hoc summarizer reproduces archetype behaviour (ordering),
- a session accumulates per-bot observed reads (revealed past the sample),
- the hero report aggregates per-hand summaries.
"""

import random

from poker.bots import Bot, archetypes, build_context
from poker.engine import Action, ActionType, Hand
from poker.game import GameSession
from poker.game.session import HUD_MIN_HANDS
from poker.sim.hero_stats import hero_report
from poker.sim.stats import StatsAccumulator
from poker.sim.summarize import summarize_hand


def test_summarizer_reproduces_archetype_ordering():
    lineup = ["nit", "tag", "lag", "station", "maniac", "tag"]
    bots = [Bot(archetypes.make(x)) for x in lineup]
    random.seed(0)
    rng = random.Random(123)
    acc = StatsAccumulator()
    n = 6
    for h in range(1500):
        s2p = [(h % n + 1 + k) % n for k in range(n)]
        hand = Hand.new(table_size=n, blinds=(1, 2), starting_stacks=200)
        while not hand.is_over and hand.actor is not None:
            hand.apply(bots[s2p[hand.actor]].act(build_context(hand, 2), rng))
        summ = summarize_hand(hand, s2p, n)
        for p in range(n):
            summ[p].archetype = bots[p].name
        acc.add_hand(summ)

    vpip = {a: acc.line(a).vpip for a in ["Nit", "TAG", "LAG", "Calling Station", "Maniac"]}
    assert vpip["Nit"] < vpip["TAG"] < vpip["LAG"]
    assert vpip["Calling Station"] > vpip["TAG"]
    # Station is passive, Maniac aggressive.
    assert acc.line("Calling Station").af < acc.line("Maniac").af
    assert acc.line("Calling Station").pfr < acc.line("Maniac").pfr


def _drive_hero_fold_check(s: GameSession) -> None:
    while not s.hand_over:
        if not s.hero_to_act:
            break
        la = s.state().legal_actions
        if la.can_check:
            s.submit_hero_action(Action(ActionType.CHECK))
        else:
            s.submit_hero_action(Action(ActionType.FOLD))


def test_session_reads_reveal_past_threshold():
    s = GameSession("t", villains=["nit", "tag", "lag", "station", "maniac"], seed=7)
    # below threshold
    for _ in range(5):
        s.start_hand()
        _drive_hero_fold_check(s)
    early = s.reads()
    assert all(not r["ready"] and r["stats"] is None for r in early.values())
    assert all(r["min_hands"] == HUD_MIN_HANDS for r in early.values())

    # past threshold
    for _ in range(HUD_MIN_HANDS):
        s.start_hand()
        _drive_hero_fold_check(s)
    later = s.reads()
    assert all(r["hands"] >= HUD_MIN_HANDS for r in later.values())
    assert all(r["ready"] and r["stats"] is not None for r in later.values())
    assert "vpip" in later[1]["stats"]


def test_hero_report_aggregates():
    s = GameSession("t", villains=["nit", "tag", "lag", "station", "maniac"], seed=3)
    summaries = []
    for _ in range(12):
        s.start_hand()
        _drive_hero_fold_check(s)
        if s.last_result:
            summaries.append(s.last_result["hero_summary"])
    rep = hero_report(summaries)
    assert rep["overall"]["hands"] == len(summaries)
    assert 0 <= rep["overall"]["vpip"] <= 100
    assert "vpip" in rep["targets"]
