"""Math engine — the computed, reproducible numbers the coach shows.

    equity / EquityResult     Monte Carlo equity (treys) vs ranges or random hands
    parse_range / combos_in_range   range strings -> concrete combos
    classify / HandClass      made-hand tier + draw detection
    MadeTier / Draw           classifier enums
    required_equity / call_ev / analyze_call / pot_odds_ratio   exact pot-odds math

Nothing here fabricates solver output; it all computes from cards and arithmetic.
"""

from .classify import Draw, HandClass, MadeTier, PairStrength, classify, pair_strength
from .equity import EquityResult, equity
from .odds import CallAnalysis, analyze_call, call_ev, pot_odds_ratio, required_equity
from .ranges import combos_in_range, parse_range, parse_token

__all__ = [
    "equity",
    "EquityResult",
    "parse_range",
    "parse_token",
    "combos_in_range",
    "classify",
    "pair_strength",
    "HandClass",
    "MadeTier",
    "Draw",
    "PairStrength",
    "required_equity",
    "pot_odds_ratio",
    "call_ev",
    "analyze_call",
    "CallAnalysis",
]
