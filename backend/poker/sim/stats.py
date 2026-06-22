"""Aggregate per-hand summaries into the poker stats (STRATEGY.md §5).

Definitions used (standard 6-max HUD conventions):
    VPIP   = voluntarily put $ in preflop / hands dealt
    PFR    = raised preflop / hands dealt
    3-bet  = 3-bet / opportunities to 3-bet (faced an open)
    ATS    = open-raised CO/BTN/SB when folded to / those opportunities
    F2steal= folded in the blinds to a steal / steals faced
    AF     = (postflop bets + raises) / postflop calls
    WTSD   = went to showdown / saw flop
    WSD    = won at showdown / went to showdown
    WWSF   = won / saw flop
    C-bet  = flop c-bet as PFR / times PFR saw flop
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from .table import PlayerHandSummary


@dataclass
class StatLine:
    archetype: str
    hands: int
    vpip: float
    pfr: float
    threebet: float
    ats: float
    fold_to_steal: float
    af: float
    wtsd: float
    wsd: float
    wwsf: float
    cbet: float
    net_bb_per_100: float


def _pct(num: int, den: int) -> float:
    return 100.0 * num / den if den else 0.0


class StatsAccumulator:
    def __init__(self) -> None:
        self._c: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def add_hand(self, summaries: list[PlayerHandSummary]) -> None:
        for s in summaries:
            c = self._c[s.archetype]
            c["hands"] += 1
            c["vpip"] += s.vpip
            c["pfr"] += s.pfr
            c["threebet"] += s.threebet
            c["threebet_opp"] += s.threebet_opp
            c["steal_attempt"] += s.steal_attempt
            c["steal_opp"] += s.steal_opp
            c["folded_to_steal"] += s.folded_to_steal
            c["faced_steal"] += s.faced_steal
            c["pf_bets"] += s.pf_bets
            c["pf_raises"] += s.pf_raises
            c["pf_calls"] += s.pf_calls
            c["saw_flop"] += s.saw_flop
            c["wtsd"] += s.wtsd
            c["won_at_showdown"] += s.won_at_showdown
            c["wwsf"] += s.saw_flop and s.won
            c["cbet_flop"] += s.cbet_flop
            c["cbet_opp"] += s.cbet_opp
            c["net"] += s.net

    def line(self, archetype: str, big_blind: int = 2) -> StatLine:
        c = self._c[archetype]
        hands = c["hands"]
        af_den = c["pf_calls"]
        af = (c["pf_bets"] + c["pf_raises"]) / af_den if af_den else float("inf")
        net_bb_per_100 = (
            100.0 * (c["net"] / big_blind) / hands if hands else 0.0
        )
        return StatLine(
            archetype=archetype,
            hands=hands,
            vpip=_pct(c["vpip"], hands),
            pfr=_pct(c["pfr"], hands),
            threebet=_pct(c["threebet"], c["threebet_opp"]),
            ats=_pct(c["steal_attempt"], c["steal_opp"]),
            fold_to_steal=_pct(c["folded_to_steal"], c["faced_steal"]),
            af=af,
            wtsd=_pct(c["wtsd"], c["saw_flop"]),
            wsd=_pct(c["won_at_showdown"], c["wtsd"]),
            wwsf=_pct(c["wwsf"], c["saw_flop"]),
            cbet=_pct(c["cbet_flop"], c["cbet_opp"]),
            net_bb_per_100=net_bb_per_100,
        )

    def archetypes(self) -> list[str]:
        return list(self._c.keys())
