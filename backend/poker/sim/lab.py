"""Bot lab — expose the Phase-3 simulation machinery as a JSON-friendly feature.

The lab lets you pick a lineup, nudge a few strategy *knobs*, run a headless
simulation, and read the *emergent* stats against their target bands. It is the
honest demonstration of Principle 3 (PROJECT.md §3): you never set a bot's VPIP;
you set a strategy and *measure* what comes out. Tuning a knob here and watching
the band light up or go red is exactly the Phase-3 tuning loop, made interactive.

Nothing here is new poker logic — it reuses ``runner.run`` and ``report`` so the
lab and the validation gate compute identically.
"""

from __future__ import annotations

import time

from ..bots import archetypes
from .report import TARGETS, evaluate, gate_passes
from .runner import DEFAULT_LINEUP, run
from .stats import StatLine

# Hard cap so an interactive request can't block the (single) worker for minutes.
# The real validation gate (>=100k) runs offline via scripts/simulate.py.
MAX_LAB_HANDS = 25_000
DEFAULT_LAB_HANDS = 5_000

# The scalar knobs the lab may tune. Each entry drives one slider in the UI.
# (key, label, min, max, step). We deliberately expose only frequencies/sizings
# that move stats in an intuitive way — not the percentile caps, which need the
# hand-ranking context to read sensibly.
KNOB_META: list[dict] = [
    {"key": "threebet_value", "label": "3-bet value", "min": 0.0, "max": 0.15, "step": 0.005},
    {"key": "threebet_bluff_freq", "label": "3-bet bluff", "min": 0.0, "max": 0.6, "step": 0.02},
    {"key": "call_open", "label": "Flat-call open", "min": 0.0, "max": 0.7, "step": 0.02},
    {"key": "bb_defend_call", "label": "BB defend", "min": 0.0, "max": 0.95, "step": 0.02},
    {"key": "cbet_freq", "label": "C-bet freq", "min": 0.0, "max": 1.0, "step": 0.05},
    {"key": "barrel_freq", "label": "Barrel freq", "min": 0.0, "max": 1.0, "step": 0.05},
    {"key": "value_bet_freq", "label": "Value-bet freq", "min": 0.0, "max": 1.0, "step": 0.05},
    {"key": "semibluff_freq", "label": "Semi-bluff freq", "min": 0.0, "max": 1.0, "step": 0.05},
    {"key": "calldown_freq", "label": "Calldown", "min": 0.0, "max": 1.0, "step": 0.05},
    {"key": "float_freq", "label": "Float freq", "min": 0.0, "max": 0.6, "step": 0.02},
    {"key": "raise_value_freq", "label": "Raise value", "min": 0.0, "max": 1.0, "step": 0.05},
    {"key": "stab_freq", "label": "Stab freq", "min": 0.0, "max": 0.6, "step": 0.02},
    {"key": "bet_frac", "label": "Bet size (pot)", "min": 0.25, "max": 1.0, "step": 0.05},
]
KNOB_KEYS = frozenset(k["key"] for k in KNOB_META)

# All stats we report; the band (if any) comes from report.TARGETS.
_STATS = ["vpip", "pfr", "threebet", "ats", "fold_to_steal", "af", "wtsd", "wsd", "wwsf", "cbet"]


def _key_to_name() -> dict[str, str]:
    """Map archetype key ('tag') -> display name ('TAG'), as report.TARGETS keys."""
    return {key: archetypes.make(key).name for key in archetypes.ARCHETYPES}


def archetypes_info() -> dict:
    """Static metadata for the lab UI: each archetype's targets + default knobs."""
    out = []
    for key in archetypes.ARCHETYPES:
        params = archetypes.make(key)
        name = params.name
        out.append(
            {
                "key": key,
                "name": name,
                "targets": TARGETS.get(name, {}),
                "knobs": {k["key"]: getattr(params, k["key"]) for k in KNOB_META},
            }
        )
    return {
        "archetypes": out,
        "knob_meta": KNOB_META,
        "default_lineup": list(DEFAULT_LINEUP),
        "max_hands": MAX_LAB_HANDS,
        "default_hands": DEFAULT_LAB_HANDS,
    }


def sanitize_overrides(raw: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    """Keep only known archetype keys and known tunable knobs, coerced to float."""
    clean: dict[str, dict[str, float]] = {}
    for arch_key, knobs in (raw or {}).items():
        akey = arch_key.lower().replace(" ", "")
        if akey not in archetypes.ARCHETYPES:
            continue
        kept = {k: float(v) for k, v in knobs.items() if k in KNOB_KEYS}
        if kept:
            clean[akey] = kept
    return clean


def _row(line: StatLine, checks: dict[str, object]) -> dict:
    name = line.archetype
    arch_checks = checks.get(name, {})
    stats = {}
    for s in _STATS:
        value = getattr(line, s)
        cell = arch_checks.get(s)
        if cell is not None:
            stats[s] = {
                "value": None if value == float("inf") else round(value, 2),
                "band": list(cell.band) if cell.band else None,
                "ok": cell.ok,
            }
        else:
            stats[s] = {
                "value": None if value == float("inf") else round(value, 2),
                "band": None,
                "ok": None,
            }
    return {
        "archetype": name,
        "hands": line.hands,
        "net_bb_per_100": round(line.net_bb_per_100, 2),
        "stats": stats,
    }


def run_lab(
    lineup: list[str],
    hands: int,
    seed: int = 0,
    blinds: tuple[int, int] = (1, 2),
    starting_stack: int = 200,
    overrides: dict[str, dict[str, float]] | None = None,
) -> dict:
    """Run a capped simulation and return measured-vs-target rows as JSON."""
    hands = max(1, min(int(hands), MAX_LAB_HANDS))
    clean_overrides = sanitize_overrides(overrides or {})

    start = time.perf_counter()
    acc = run(
        hands,
        lineup=lineup,
        seed=seed,
        blinds=blinds,
        starting_stack=starting_stack,
        overrides=clean_overrides,
    )
    elapsed_ms = round((time.perf_counter() - start) * 1000)

    checks = evaluate(acc)
    # Report one row per archetype that actually appeared in the lineup.
    present = {archetypes.make(name).name for name in lineup}
    rows = [_row(acc.line(name), checks) for name in TARGETS if name in present]

    return {
        "hands": hands,
        "seed": seed,
        "lineup": list(lineup),
        "overrides": clean_overrides,
        "gate_pass": gate_passes(acc),
        "rows": rows,
        "elapsed_ms": elapsed_ms,
    }
