"""Parse poker range strings into concrete two-card combos.

Supports the standard notation used in STRATEGY.md:

    pairs            "22", "TT+", "99-66"
    suited           "AKs", "ATs+", "A5s-A2s", "T8s+"
    offsuit          "KQo", "ATo+", "KTo+"
    bare (both)      "AK"            -> AKs and AKo
    explicit combo   "AhKs"          -> just that combo

"+" fixes the higher card and raises the kicker up to one below it (so "ATs+" is
ATs, AJs, AQs, AKs; "TT+" is TT..AA). A "X-Y" range walks between the endpoints.
This is standard hand notation, not GTO frequency data — it just enumerates
combos.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

from .cards import (
    RANK_INDEX,
    RANKS,
    SUITS,
    Combo,
    canonical_combo,
    is_card,
)


def _pair_combos(idx: int) -> set[Combo]:
    rank = RANKS[idx]
    cards = [rank + s for s in SUITS]
    return {canonical_combo(a, b) for a, b in combinations(cards, 2)}


def _suited_combos(hi: int, lo: int) -> set[Combo]:
    return {canonical_combo(RANKS[hi] + s, RANKS[lo] + s) for s in SUITS}


def _offsuit_combos(hi: int, lo: int) -> set[Combo]:
    return {
        canonical_combo(RANKS[hi] + s1, RANKS[lo] + s2)
        for s1 in SUITS
        for s2 in SUITS
        if s1 != s2
    }


def _expand(hi: int, lo: int, suited: bool | None) -> set[Combo]:
    """Combos for two distinct ranks. ``suited`` True/False/None (both)."""
    if suited is True:
        return _suited_combos(hi, lo)
    if suited is False:
        return _offsuit_combos(hi, lo)
    return _suited_combos(hi, lo) | _offsuit_combos(hi, lo)


@dataclass(frozen=True)
class _Endpoint:
    hi: int
    lo: int
    suited: bool | None
    is_pair: bool


def _parse_endpoint(core: str) -> _Endpoint:
    cu = core.upper()
    suited: bool | None = None
    if cu and cu[-1] in ("S", "O"):
        suited = cu[-1] == "S"
        cu = cu[:-1]
    if len(cu) != 2 or cu[0] not in RANK_INDEX or cu[1] not in RANK_INDEX:
        raise ValueError(f"bad range token: {core!r}")
    i1, i2 = RANK_INDEX[cu[0]], RANK_INDEX[cu[1]]
    hi, lo = max(i1, i2), min(i1, i2)
    return _Endpoint(hi=hi, lo=lo, suited=suited, is_pair=(hi == lo))


def _parse_plus(core: str) -> set[Combo]:
    ep = _parse_endpoint(core)
    out: set[Combo] = set()
    if ep.is_pair:
        for idx in range(ep.lo, len(RANKS)):  # this pair and up to AA
            out |= _pair_combos(idx)
    else:
        for lo in range(ep.lo, ep.hi):  # fix high card, raise kicker to hi-1
            out |= _expand(ep.hi, lo, ep.suited)
    return out


def _parse_dash(token: str) -> set[Combo]:
    a, b = token.split("-")
    ea, eb = _parse_endpoint(a.strip()), _parse_endpoint(b.strip())
    out: set[Combo] = set()
    if ea.is_pair and eb.is_pair:
        for idx in range(min(ea.hi, eb.hi), max(ea.hi, eb.hi) + 1):
            out |= _pair_combos(idx)
        return out
    if ea.hi != eb.hi or ea.suited != eb.suited:
        raise ValueError(f"endpoints don't line up: {token!r}")
    for lo in range(min(ea.lo, eb.lo), max(ea.lo, eb.lo) + 1):
        out |= _expand(ea.hi, lo, ea.suited)
    return out


def parse_token(token: str) -> set[Combo]:
    token = token.strip()
    if not token:
        return set()
    # explicit combo, e.g. "AhKs"
    if len(token) == 4 and is_card(token[:2]) and is_card(token[2:]):
        if token[:2] == token[2:]:
            raise ValueError(f"duplicate card in combo: {token!r}")
        return {canonical_combo(token[:2], token[2:])}
    if "-" in token:
        return _parse_dash(token)
    if token.endswith("+"):
        return _parse_plus(token[:-1])
    ep = _parse_endpoint(token)
    if ep.is_pair:
        return _pair_combos(ep.hi)
    return _expand(ep.hi, ep.lo, ep.suited)


def parse_range(text: str) -> set[Combo]:
    """Parse a comma-separated range string into a set of concrete combos."""
    combos: set[Combo] = set()
    for raw in text.split(","):
        combos |= parse_token(raw)
    return combos


def combos_in_range(text: str, dead: tuple[str, ...] = ()) -> set[Combo]:
    """Parse ``text`` and drop any combo that uses a dead card (board cards or
    cards already in another player's hand)."""
    dead_set = set(dead)
    return {c for c in parse_range(text) if c[0] not in dead_set and c[1] not in dead_set}
