"""Action-conditioned villain ranges for the coach.

A villain's *preflop* top-X% archetype range is only the starting point. As the
hand goes on, every bet/call narrows and strengthens what they can hold: someone
who barrels two streets is not still holding their whole opening range. Computing
flop/turn/river equity against the static preflop range systematically *inflates*
hero equity, which is the structural driver of over-calling.

So here we walk a villain's actions this hand and rebuild their range street by
street:

  * an aggressive action (bet/raise) keeps the hands that *bet* that board — made
    hands (pair+), real draws, and a **bluff slice** sized to how often this
    archetype actually bets air (measured from the sim, BET_COMPOSITION below —
    NOT eyeballed: the bluff fraction sets the hero's bluff-catch threshold, so it
    has to match reality or the coach grades against a fiction);
  * a call keeps a continue range (made hands + draws + a small float for loose
    types);
  * a check carries little information and does not narrow (the aggression does).

The result is a concrete combo list (for the Monte-Carlo equity engine) plus a
human description for the panel, so the read is judgeable, not a bare number. The
``bluff_fraction`` it returns IS the air share of a betting range — exactly the
quantity a river bluff-catch turns on.

Implied/reverse-implied odds (a follow-on) will adjust the *price*, not the
range, and slot in on top of this without changing it.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..math.cards import Combo
from ..math.classify import Draw, MadeTier, classify
from ..math.ranges import parse_token
from ..bots.preflop_strength import top_fraction

# Modelled preflop looseness per archetype (fraction of all combos) when they have
# only opened/called. A stated assumption for the equity estimate, not a solver
# range. (Kept here so the coach has a single source for villain modelling.)
ARCHETYPE_RANGE_PCT = {
    "Nit": 0.12,
    "TAG": 0.22,
    "LAG": 0.32,
    "Calling Station": 0.50,
    "Maniac": 0.62,
}
_DEFAULT_PCT = 0.30

# Tighter preflop range when the villain has 3-bet+ (much stronger than an open).
_THREEBET_PCT = {
    "Nit": 0.03, "TAG": 0.05, "LAG": 0.07, "Calling Station": 0.05, "Maniac": 0.12,
}

# Measured bet-range composition per archetype per street: of the hands the bot
# actually bets/raises with, the fractions that are value (made pair+) / draw /
# air. Source: scripts/measure_bet_ranges.py over the locked baseline
# (backend/validation/phase3_gate.txt). The air fraction is the bluff slice.
# FILLED FROM THE A2 BASELINE RUN; test_villain_model asserts a fresh measurement
# still matches these within tolerance, so they can't silently drift into fiction.
BET_COMPOSITION: dict[str, dict[str, dict[str, float]]] = {
    # Measured: scripts/measure_bet_ranges.py, 60k hands, seed 0 (phase3_gate.txt).
    "Nit": {
        "flop": {"value": 0.854, "draw": 0.037, "air": 0.109},
        "turn": {"value": 0.961, "draw": 0.023, "air": 0.016},
        "river": {"value": 0.993, "draw": 0.000, "air": 0.007},
    },
    "TAG": {
        "flop": {"value": 0.705, "draw": 0.087, "air": 0.209},
        "turn": {"value": 0.891, "draw": 0.068, "air": 0.041},
        "river": {"value": 0.965, "draw": 0.000, "air": 0.035},
    },
    "LAG": {
        "flop": {"value": 0.682, "draw": 0.089, "air": 0.229},
        "turn": {"value": 0.903, "draw": 0.063, "air": 0.033},
        "river": {"value": 0.964, "draw": 0.000, "air": 0.036},
    },
    "Calling Station": {
        "flop": {"value": 0.930, "draw": 0.037, "air": 0.032},
        "turn": {"value": 0.961, "draw": 0.033, "air": 0.006},
        "river": {"value": 0.995, "draw": 0.000, "air": 0.005},
    },
    "Maniac": {
        "flop": {"value": 0.660, "draw": 0.104, "air": 0.236},
        "turn": {"value": 0.828, "draw": 0.110, "air": 0.062},
        "river": {"value": 0.936, "draw": 0.000, "air": 0.064},
    },
}
# Neutral fallback if an (archetype, street) is missing.
_FALLBACK_COMP = {"value": 0.70, "draw": 0.10, "air": 0.20}

# How much air a calling (not betting) range carries, by archetype (floats /
# loose continues). Stations/maniacs peel light; nits basically never.
_CALL_AIR_FRACTION = {
    "Nit": 0.02, "TAG": 0.05, "LAG": 0.10, "Calling Station": 0.30, "Maniac": 0.25,
}

_STRONG_DRAWS = (Draw.FLUSH_DRAW, Draw.OPEN_ENDED, Draw.GUTSHOT)
_STREET_LEN = {"flop": 3, "turn": 4, "river": 5}
_TOTAL_COMBOS = 1326.0
_ACTION_RANK = {"check": 0, "call": 1, "bet": 2, "raise": 3}


def villain_line(history, seat: int) -> tuple[str, dict[str, str]]:
    """Reconstruct a villain's line from an action history (objects or items with
    ``.seat``/``.street``/``.action``): their preflop role ("3bet+"/"raise"/
    "call"/"passive") and their strongest action on each postflop street — the
    inputs ``condition_range`` is built from. Shared by the live coach and the
    post-hoc hand review so both grade against the *same* model."""
    pre_raises = 0
    raised_depth = 0
    called_pre = False
    postflop: dict[str, str] = {}
    for e in history:
        is_me = e.seat == seat
        if e.street == "preflop" and e.action in ("bet", "raise"):
            pre_raises += 1
            if is_me:
                raised_depth = pre_raises
        if not is_me:
            continue
        if e.street == "preflop":
            if e.action == "call":
                called_pre = True
        else:
            cur = postflop.get(e.street)
            if cur is None or _ACTION_RANK.get(e.action, 0) > _ACTION_RANK.get(cur, -1):
                postflop[e.street] = e.action
    role = "3bet+" if raised_depth >= 2 else "raise" if raised_depth == 1 else "call" if called_pre else "passive"
    return role, postflop


@dataclass
class ConditionedRange:
    combos: list[Combo]
    description: str          # e.g. "TAG, c-bet flop + barreled turn → ~top 9% (92 combos)"
    bluff_fraction: float     # air share of the final range (the bluff-catch threshold)


def _base_combos(archetype: str, pct: float, dead: set[str]) -> list[Combo]:
    combos: set = set()
    for name in top_fraction(pct):
        combos |= parse_token(name)
    return [c for c in combos if c[0] not in dead and c[1] not in dead]


def static_range(archetype: str, dead: set[str]) -> list[Combo]:
    """The unconditioned top-X% preflop range for an archetype. Used by the
    post-hoc hand review, which doesn't replay each villain's line."""
    return _base_combos(archetype, ARCHETYPE_RANGE_PCT.get(archetype, _DEFAULT_PCT), dead)


def _categorize(combos: list[Combo], board: list[str]) -> tuple[list, list, list]:
    """Split combos into (value = made pair+, draw = real draw, air) on this board."""
    value, draw, air = [], [], []
    for c in combos:
        hc = classify(list(c), board)
        if hc.made >= MadeTier.PAIR:
            value.append(c)
        elif any(d in hc.draws for d in _STRONG_DRAWS):
            draw.append(c)
        else:
            air.append(c)
    return value, draw, air


def _take(combos: list[Combo], n: int) -> list[Combo]:
    """Deterministic subset (sorted) so the model is reproducible."""
    if n <= 0:
        return []
    if n >= len(combos):
        return list(combos)
    return sorted(combos)[:n]


def _comp(archetype: str, street: str) -> dict[str, float]:
    return BET_COMPOSITION.get(archetype, {}).get(street, _FALLBACK_COMP)


def _aggression_filter(combos: list[Combo], board: list[str], archetype: str, street: str) -> list[Combo]:
    """Keep the hands this archetype *bets* this board: all value, plus draws and
    air in the measured proportions (so the air share matches the real bluff rate)."""
    value, draw, air = _categorize(combos, board)
    comp = _comp(archetype, street)
    cv = max(comp["value"], 1e-6)
    if value:
        n_draw = round(len(value) * comp["draw"] / cv)
        n_air = round(len(value) * comp["air"] / cv)
    else:
        # Degenerate: no value combos left — keep draws and a matching air slice.
        n_draw = len(draw)
        n_air = round(len(draw) * comp["air"] / max(comp["draw"], 1e-6)) if draw else len(air)
    return list(value) + _take(draw, n_draw) + _take(air, n_air)


def _call_filter(combos: list[Combo], board: list[str], archetype: str) -> list[Combo]:
    """A continue range: made hands + draws + a small archetype-sized float of air."""
    value, draw, air = _categorize(combos, board)
    f = _CALL_AIR_FRACTION.get(archetype, 0.08)
    keep = value + draw
    n_air = round(len(keep) * f / max(1 - f, 1e-6))
    return keep + _take(air, n_air)


_STREET_VERB = {
    ("flop", "bet"): "c-bet flop", ("flop", "raise"): "raised flop",
    ("turn", "bet"): "barreled turn", ("turn", "raise"): "raised turn",
    ("river", "bet"): "barreled river", ("river", "raise"): "raised river",
    ("flop", "call"): "called flop", ("turn", "call"): "called turn", ("river", "call"): "called river",
}


def condition_range(
    archetype: str,
    board: list[str],
    preflop_role: str,                 # "3bet+" | "raise" | "call" | "passive"
    postflop_actions: dict[str, str],  # {"flop": "bet", "turn": "bet", ...} this villain's action
    dead: set[str],
) -> ConditionedRange:
    """Build a villain's action-conditioned range + a human description."""
    pct = _THREEBET_PCT.get(archetype, 0.05) if preflop_role == "3bet+" \
        else ARCHETYPE_RANGE_PCT.get(archetype, _DEFAULT_PCT)
    combos = _base_combos(archetype, pct, dead)

    tags: list[str] = []
    if preflop_role == "3bet+":
        tags.append("3-bet pre")
    for street in ("flop", "turn", "river"):
        if len(board) < _STREET_LEN[street]:
            break
        action = postflop_actions.get(street)
        if action is None:
            continue
        board_st = board[: _STREET_LEN[street]]
        if action in ("bet", "raise"):
            combos = _aggression_filter(combos, board_st, archetype, street)
        elif action == "call":
            combos = _call_filter(combos, board_st, archetype)
        # check / other: no narrowing
        verb = _STREET_VERB.get((street, action))
        if verb:
            tags.append(verb)

    # Bluff fraction = air share on the CURRENT board — only meaningful postflop
    # (preflop every unpaired hand is "air", which isn't a bluff). 0 preflop.
    if len(board) >= 3 and combos:
        _, _, air_now = _categorize(combos, board)
        bluff_fraction = len(air_now) / len(combos)
    else:
        bluff_fraction = 0.0

    approx_pct = round(100 * len(combos) / _TOTAL_COMBOS, 1)
    line = " + ".join(tags) if tags else "preflop range"
    description = f"{archetype}, {line} → ~top {approx_pct}% ({len(combos)} combos)"
    return ConditionedRange(combos=combos, description=description, bluff_fraction=bluff_fraction)
