"""Every §4.6 postflop number, by name (initial values for phase-4 calibration).

Strengths are in ``s`` (strength against the opponents' preflop-line ranges plus
a clean-draw term) or ``h`` (against one range). See ``postflop.py`` for the
formulas that use them.
"""

from __future__ import annotations

# --- No bet faced ------------------------------------------------------------------
# Value thresholds by (street, side); the river is one number.
V = {("flop", "ip"): 0.68, ("flop", "oop"): 0.74, ("turn", "ip"): 0.74, ("turn", "oop"): 0.78, "river": 0.80}
LEAD_ADD = {"flop": 0.12, "turn": 0.08, "river": 0.05}  # leading into last street's aggressor
DEEP_SPR = 10.0
DEEP_SPR_ADD = 0.03  # turn and river, SPR above DEEP_SPR
TRAP_S = 0.97
TRAP_STREET = {"flop": 1.0, "turn": 0.5, "river": 0.0}  # x the trap dial

# Semi-bluff bases (flop and turn), x bluff x MW_DECAY^(opponents-1).
SEMI = {"combo": 0.75, "fd_oesd": 0.55, "gut_over": 0.25, "backdoor": 0.12}

# Air (s < SHOWDOWN_LO, no draw, no own pair).
AIR_CBET = {"dry": 0.65, "semi": 0.525, "wet": 0.40}
BARREL = 0.35
SCARE_ADD = 0.15
RIVER_BLUFF = 0.25
BLOCKER_MULT = (1.6, 0.6)  # river: with a nut-flush or top-pair blocker, without
STAB_IP = 0.22
STAB_OOP = 0.04
MW_DECAY = 0.4
OOP_NONAGG = 0.3
SHOWDOWN_LO = 0.55
AIR_WIDTH = 0.05  # P(bet) = σ((f_air − bluff_quantile)/AIR_WIDTH), D33

# --- Facing a bet ----------------------------------------------------------------
BLUFF_H = 0.35  # eq against the bluff slice: min(1, h/BLUFF_H)
R_BOT = {("flop", "ip"): 0.80, ("flop", "oop"): 0.72, ("turn", "ip"): 0.90, ("turn", "oop"): 0.82}
IMPLIED = {"nut": 0.6, "draw": 0.42, "gutshot": 0.3}
PRICE_ANCHOR = 0.25  # price_used = λ·r + (1 − λ)·PRICE_ANCHOR
SUSPICION_BAND = (0.3, 0.6)  # suspicion > 0 applies at h >= 0.3, < 0 at h <= 0.6
TO_ACT_PENALTY = 0.03

# Raises.
RAISE_THR = (0.90, 0.96, 0.985)  # vs a bet, vs a raise, vs a re-raise
SEMI_RAISE = 0.25
SEMI_RAISE_CAP = 0.6
SEMI_RAISE_OUTS = 12
AIR_RAISE_MIN_BLUFF = 1.5
AIR_RAISE_S = 0.3
AIR_RAISE_RATE = 0.03
COMMIT_SPR = 0.6

# D32: the monotone fold envelope.
ENVELOPE_GRID = (0.01, 0.25, 0.40, 0.60, 0.80, 1.05, 1.30, 1.65, 2.00, 3.00)

# Clean-draw factors for s and eq.
CLEAN = {"nut_flush": 1.0, "flush": 0.85, "oesd_clean": 0.9, "straight": 0.75, "gutshot": 0.7}
PAIRED_CLEAN = 0.75

# Probabilities below this are not played (moved to the passive choice), so a
# sampled bot never makes a one-in-a-million spew raise.
DUST = 1e-4
