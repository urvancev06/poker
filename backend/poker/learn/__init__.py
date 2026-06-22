"""Learning / research modules — the quant-flavoured "understand it from the
inside" layer (PROJECT.md §7, stretch).

    kuhn_cfr.train      vanilla Counterfactual Regret Minimization on Kuhn poker,
                        converging to the known equilibrium (game value -1/18).
"""

from .kuhn_cfr import EQUILIBRIUM_VALUE, train

__all__ = ["train", "EQUILIBRIUM_VALUE"]
