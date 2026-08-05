"""Learning / research modules: poker theory implemented from scratch, outside
the app path.

    kuhn_cfr.train      vanilla Counterfactual Regret Minimization on Kuhn poker,
                        converging to the known equilibrium (game value -1/18).
"""

from .kuhn_cfr import EQUILIBRIUM_VALUE, train

__all__ = ["train", "EQUILIBRIUM_VALUE"]
