"""Math engine — the computed, reproducible numbers the coach shows.

    equity / EquityResult     Monte Carlo equity (treys) vs ranges or random hands
    parse_range / combos_in_range   range strings -> concrete combos
    classify / HandClass      made tier, the hole's own part (hole_tier), hole-aware
                              draws and a player's label ("top pair, good kicker")
    pair_strength             the hero's own one-pair holding vs the board
    MadeTier / Draw           classifier enums (shared with classify_legacy)
    hole_draws / DrawSet      draws that need a hole card, with outs
    texture / Texture         suit pattern, pairing, connectivity, dry/semi/wet
    scare_flags               what a new street brings (flush, straight, overcard)
    required_equity / call_ev / analyze_call / pot_odds_ratio   exact pot-odds math

Nothing here fabricates solver output; it all computes from cards and arithmetic.

``classify_legacy`` is the v1 bots' frozen classifier (until phase 5); import it
by module, it is not re-exported here.
"""

from .classify import Draw, HandClass, MadeTier, PairStrength, classify, pair_strength
from .draws import DrawSet, hole_draws
from .equity import EquityResult, equity
from .odds import CallAnalysis, analyze_call, call_ev, pot_odds_ratio, required_equity
from .texture import Texture, scare_flags, texture
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
    "hole_draws",
    "DrawSet",
    "texture",
    "Texture",
    "scare_flags",
    "required_equity",
    "pot_odds_ratio",
    "call_ev",
    "analyze_call",
    "CallAnalysis",
]
