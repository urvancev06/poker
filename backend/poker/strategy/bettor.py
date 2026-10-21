"""Bettor priors (D34): the facing player's belief about a bettor's range.

A prior ``(v, β)`` lives in the bettor's own range-percentile space: a share β
of bluffs at the bottom and value above percentile v. It is keyed by street,
node kind and size bucket; check-raises, raises and re-raises have one value per
street whatever the size. Multiway adds 0.05 to v (capped at 0.97) and scales β
by 0.6. These are hand-authored data, not measured in a feedback loop.

A size-blind player (``price`` dial λ) reads every size partly as medium:
``λ·prior(bucket) + (1 − λ)·prior("M")``.
"""

from __future__ import annotations

from .spot import size_bucket
from .types import Node

_BUCKETS = ("S", "M", "L", "O", "J")


def _row(*cells: tuple[float, float]) -> dict[str, tuple[float, float]]:
    return dict(zip(_BUCKETS, cells))


def _flat(cell: tuple[float, float]) -> dict[str, tuple[float, float]]:
    return {b: cell for b in _BUCKETS}


PRIORS: dict[tuple[str, str], dict[str, tuple[float, float]]] = {
    ("flop", "cbet"): _row((0.45, 0.40), (0.52, 0.35), (0.60, 0.30), (0.70, 0.30), (0.82, 0.28)),
    ("flop", "bet"): _row((0.55, 0.30), (0.60, 0.28), (0.66, 0.25), (0.72, 0.25), (0.82, 0.25)),
    ("turn", "barrel"): _row((0.58, 0.33), (0.62, 0.30), (0.68, 0.27), (0.75, 0.28), (0.86, 0.25)),
    ("turn", "bet"): _row((0.60, 0.28), (0.64, 0.26), (0.70, 0.24), (0.76, 0.24), (0.86, 0.22)),
    ("river", "bet"): _row((0.62, 0.22), (0.70, 0.27), (0.78, 0.26), (0.82, 0.34), (0.90, 0.20)),
    ("flop", "check_raise"): _flat((0.80, 0.25)),
    ("turn", "check_raise"): _flat((0.86, 0.15)),
    ("river", "check_raise"): _flat((0.92, 0.08)),
    ("flop", "raise"): _flat((0.82, 0.22)),
    ("turn", "raise"): _flat((0.88, 0.12)),
    ("river", "raise"): _flat((0.93, 0.07)),
    ("flop", "reraise"): _flat((0.92, 0.08)),
    ("turn", "reraise"): _flat((0.95, 0.05)),
    ("river", "reraise"): _flat((0.97, 0.03)),
}

MULTIWAY_V_ADD = 0.05
MULTIWAY_V_CAP = 0.97
MULTIWAY_BETA = 0.6


def prior_kind(street: str, node: Node) -> str:
    """The PRIORS row kind of a facing node on ``street``."""
    if node == Node.VS_CHECK_RAISE:
        return "check_raise"
    if node == Node.VS_RAISE:
        return "raise"
    if node == Node.VS_RERAISE:
        return "reraise"
    if street == "river":
        return "bet"
    if node == Node.VS_CBET:
        return "cbet" if street == "flop" else "barrel"
    if node == Node.VS_BARREL:
        return "barrel" if street == "turn" else "cbet"
    return "bet"


def prior(street: str, node: Node, frac: float, multiway: bool, price: float) -> tuple[float, float]:
    """``(v, β)`` for a bet of pot fraction ``frac`` at ``node``, blended toward
    the medium bucket by ``1 − price``."""
    row = PRIORS[(street, prior_kind(street, node))]
    v_b, beta_b = row[size_bucket(frac)]
    v_m, beta_m = row["M"]
    lam = min(1.0, max(0.0, price))
    v = lam * v_b + (1 - lam) * v_m
    beta = lam * beta_b + (1 - lam) * beta_m
    if multiway:
        v = min(MULTIWAY_V_CAP, v + MULTIWAY_V_ADD)
        beta *= MULTIWAY_BETA
    return v, beta
