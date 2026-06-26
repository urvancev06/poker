"""The five archetypes as ``StrategyParams`` sets (STRATEGY.md §4).

TAG is anchored to §2's opening percentages; the others widen/tighten and shift
aggression/passivity per §4. These are the *tuning dials* — the simulation
measures the resulting stats and we adjust until each lands in its target band.
The point of the fish (Station, Maniac) is that they play badly on purpose.
"""

from __future__ import annotations

from ..math import MadeTier
from .strategy import StrategyParams

# TAG opening frequencies by position, from STRATEGY.md §2.
_TAG_RFI = {"UTG": 0.15, "MP": 0.19, "CO": 0.27, "BTN": 0.45, "SB": 0.38, "BB": 0.0}


def _scale(base: dict[str, float], mult: float, cap: float = 0.92) -> dict[str, float]:
    return {k: (min(v * mult, cap) if v > 0 else 0.0) for k, v in base.items()}


def nit() -> StrategyParams:
    # Premiums only; passive postflop (low AF), folds a lot (low WTSD).
    return StrategyParams(
        name="Nit",
        rfi_raise=_scale(_TAG_RFI, 0.72),
        threebet_value=0.025,
        threebet_bluff_freq=0.0,
        call_open=0.05,
        bb_defend_call=0.16,
        fourbet_value=0.008,
        call_3bet=0.02,
        value_bet_min=MadeTier.PAIR,
        value_bet_freq=0.70,
        semibluff_freq=0.2,
        cbet_freq=0.35,
        barrel_freq=0.25,
        stab_freq=0.02,
        raise_value_min=MadeTier.TWO_PAIR,
        raise_value_freq=0.35,
        # Graded calldown: top pair / overpairs defend via strong_pair_defend; weak/
        # medium pairs fold at calldown_freq. Tightened to ~0 to hold WTSD in band
        # now that strong pairs defend (a weak-tight nit folds bottom/2nd pair anyway).
        calldown_freq=0.0,
        strong_pair_defend=0.82,
        float_freq=0.02,
        bet_frac=0.6,
    )


def tag() -> StrategyParams:
    return StrategyParams(
        name="TAG",
        rfi_raise=_scale(_TAG_RFI, 1.25),
        threebet_value=0.055,
        threebet_bluff_freq=0.18,
        call_open=0.06,
        bb_defend_call=0.32,
        fourbet_value=0.012,
        call_3bet=0.03,
        value_bet_min=MadeTier.PAIR,
        value_bet_freq=0.85,
        semibluff_freq=0.55,
        cbet_freq=0.68,
        barrel_freq=0.52,
        stab_freq=0.08,
        raise_value_min=MadeTier.TWO_PAIR,
        raise_value_freq=0.65,
        calldown_freq=0.10,        # weak/medium pairs; top pair defends via strong_pair_defend
        strong_pair_defend=0.82,
        float_freq=0.05,
        bet_frac=0.6,
    )


def lag() -> StrategyParams:
    return StrategyParams(
        name="LAG",
        rfi_raise=_scale(_TAG_RFI, 1.5),
        threebet_value=0.06,
        threebet_bluff_freq=0.30,
        call_open=0.10,
        bb_defend_call=0.48,
        fourbet_value=0.018,
        call_3bet=0.05,
        value_bet_min=MadeTier.PAIR,
        value_bet_freq=0.9,
        semibluff_freq=0.5,
        cbet_freq=0.75,
        barrel_freq=0.5,
        stab_freq=0.10,
        raise_value_min=MadeTier.TWO_PAIR,
        raise_value_freq=0.6,
        calldown_freq=0.18,        # weak/medium pairs; top pair defends via strong_pair_defend
        strong_pair_defend=0.82,
        float_freq=0.10,
        bet_frac=0.65,
    )


def calling_station() -> StrategyParams:
    return StrategyParams(
        name="Calling Station",
        rfi_raise=_scale(_TAG_RFI, 0.50),
        rfi_limp={"UTG": 0.35, "MP": 0.40, "CO": 0.48, "BTN": 0.58, "SB": 0.55, "BB": 0.0},
        threebet_value=0.03,
        threebet_bluff_freq=0.0,
        call_open=0.55,
        bb_defend_call=0.70,
        fourbet_value=0.006,
        call_3bet=0.05,
        value_bet_min=MadeTier.PAIR,
        value_bet_freq=0.6,
        semibluff_freq=0.15,
        cbet_freq=0.2,
        barrel_freq=0.1,
        stab_freq=0.02,
        raise_value_min=MadeTier.TRIPS,
        raise_value_freq=0.25,
        calldown_freq=0.82,
        float_freq=0.42,
        bet_frac=0.55,
    )


def maniac() -> StrategyParams:
    return StrategyParams(
        name="Maniac",
        rfi_raise=_scale(_TAG_RFI, 2.2),
        threebet_value=0.06,
        threebet_bluff_freq=0.30,
        call_open=0.45,
        bb_defend_call=0.85,
        fourbet_value=0.03,
        call_3bet=0.20,
        value_bet_min=MadeTier.PAIR,
        value_bet_freq=0.95,
        semibluff_freq=0.85,
        cbet_freq=0.9,
        barrel_freq=0.8,
        stab_freq=0.4,
        raise_value_min=MadeTier.PAIR,
        raise_value_freq=0.6,
        calldown_freq=0.5,
        float_freq=0.3,
        bet_frac=0.75,
    )


ARCHETYPES = {
    "nit": nit,
    "tag": tag,
    "lag": lag,
    "station": calling_station,
    "maniac": maniac,
}


def make(name: str) -> StrategyParams:
    key = name.lower().replace(" ", "")
    if key not in ARCHETYPES:
        raise ValueError(f"unknown archetype: {name!r}; choose from {list(ARCHETYPES)}")
    return ARCHETYPES[key]()
