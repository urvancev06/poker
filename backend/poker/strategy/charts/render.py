"""Render the v2 charts as the STRATEGY.md §2 block (D28).

``scripts/render_charts.py --write`` puts ``render_markdown()`` between the markers,
and ``tests/test_charts.py`` keeps the two in sync, so the document never drifts
from the tables the bots and the beta coach read.
"""

from __future__ import annotations

from ...bots.preflop_ranges import RFI_COMBOS
from . import preflop as P
from .order import COMBOS_OF, OPEN_ORDER, compact, combos


def _code(classes) -> str:
    return f"`{compact(classes)}`" if classes else "-"


def _pct(x: float) -> str:
    return f"{100 * x:.0f}%"


def _vs_open_row(hero: str, opener: str) -> tuple[list[str], list[str], list[str]]:
    probs = P.vs_open_probs(hero, opener)
    value = list(P.VALUE_3BET[opener])
    light = [c for c, (p3, _) in probs.items() if p3 >= 0.5 and c not in P.VALUE_3BET[opener]]
    flat = [c for c, (_, pc) in probs.items() if pc >= 0.5]
    return value, light, flat


def _opening() -> list[str]:
    tiers, prev = [], 0
    for pos in ("UTG", "MP", "CO", "SB", "BTN"):
        tiers.append(f"{pos} {RFI_COMBOS[pos]}")
        prev = RFI_COMBOS[pos]
    tail, total = [], 0
    for c in OPEN_ORDER:
        total += COMBOS_OF[c]
        if total > prev:
            tail.append(c)
        if len(tail) == 16:
            break
    return [
        "#### Opening order",
        "",
        "One order holds every RFI list above as an exact prefix: the UTG tier, then "
        "MP∖UTG, CO∖MP, SB∖CO, BTN∖SB, then the rest; inside each tier hands sort by "
        "Chen playability. A player's open cut is its seat's list size × its `open` dial "
        f"(cumulative combos: {', '.join(tiers)}).",
        "",
        f"- Widening past the BTN list adds, in order: `{', '.join(tail)}`, ...",
        "- Hands near a cut mix through a logistic of width 3 combos, so a range is "
        "never a cliff; a TAG opens about 15% wider than the lists (`open` 1.15).",
        "",
    ]


def _limped() -> list[str]:
    return [
        "#### Limped pots",
        "",
        f"- Iso-raise with the open cut × {P.ISO_SHRINK} per limper: "
        f"CO over one limper `{compact(P.members(P.unopened_probs('CO', limpers=1)))}`; "
        f"BTN over one limper `{compact(P.members(P.unopened_probs('BTN', limpers=1)))}`.",
        f"- The BB over limpers raises {_code(P.BB_ISO_VALUE)} and checks the rest, "
        "so AA no longer checks behind.",
        f"- Premium hands {_code(P.PREMIUM)} ({combos(P.PREMIUM)} combos) are never limped; "
        "only a player with a `limp` dial (Station, Maniac) limps the others.",
        "",
    ]


def _facing_open() -> list[str]:
    out = [
        "#### Facing an open",
        "",
        "Three disjoint sets per seat pair, at a 2.5bb open: value 3-bets always "
        "3-bet, light 3-bets come off an ordered list by a cut (`threebet` dial), and "
        "flats come off a flat order that skips the value 3-bets (`call` dial). An open "
        f"above the opener's standard size ({P.OPEN_SIZE_REF_BB:g}bb, {P.SB_OPEN_SIZE_REF_BB:g}bb from the SB) "
        f"shrinks every cut by ×(standard/open)^{P.OPEN_SIZE_EXP}. From the SB it "
        f"is mostly 3-bet or fold (flat base {P.SB_FLAT_BASE} combos).",
        "",
        "| Hero vs opener | 3-bet value | 3-bet light | Flat |",
        "|---|---|---|---|",
    ]
    for opener in P.POSITIONS[:-2]:
        for hero in P.heroes_after(opener):
            if hero == "BB":
                continue
            value, light, flat = _vs_open_row(hero, opener)
            out.append(f"| {hero} vs {opener} | {_code(value)} | {_code(light)} | {_code(flat)} |")
    out += [
        "",
        f"Light 3-bet order: `{', '.join(P.LIGHT_3BET_ORDER)}`.",
        "",
    ]
    return out


def _bb_defence() -> list[str]:
    out = [
        "#### BB defence",
        "",
        "The BB defends a suited-and-connected order (Chen + 1.5 if suited + 1 if "
        "connected or one-gapped with a 4 or better). Its flat cut is the defence target "
        "minus the value 3-bets, so value plus flats lands on the target.",
        "",
        "| vs | Defend | 3-bet | Flat |",
        "|---|---|---|---|",
    ]
    for opener in P.POSITIONS[:-1]:
        probs = P.vs_open_probs("BB", opener)
        three = [c for c, (p3, _) in probs.items() if p3 >= 0.5]
        flat = [c for c, (_, pc) in probs.items() if pc >= 0.5]
        share = sum(COMBOS_OF[c] * (p3 + pc) for c, (p3, pc) in probs.items()) / 1326
        out.append(f"| {opener} | {_pct(share)} | {_code(three)} | {_code(flat)} |")
    out.append("")
    return out


def _facing_3bet() -> list[str]:
    from ..dials import TYPE_DIALS

    tag = TYPE_DIALS["tag"]
    out = [
        "#### Facing a 3-bet",
        "",
        f"The opener calls with the top {_pct(P.CALL_3BET_FRAC['ip'])} of its own opening "
        f"range in position and {_pct(P.CALL_3BET_FRAC['oop'])} out of position (4-bets "
        "included), so a button opener defends far wider than a UTG opener. 4-bet value "
        f"is {_code(P.FOURBET_VALUE)} ({_code(P.FOURBET_VALUE_VS_EP)} against an MP "
        f"3-bet over a UTG open); 4-bet bluffs {_code(P.FOURBET_BLUFF)} at "
        f"{P.FOURBET_BLUFF_RATE:.2f} × the `threebet` dial. Fold-to-3-bet is the "
        "combo-weighted share of the opening range that folds.",
        "",
        "| Opener vs 3-bettor | Call | Fold (chart) | Fold (TAG) |",
        "|---|---|---|---|",
    ]
    pairs = [("UTG", "BTN"), ("UTG", "BB"), ("MP", "BTN"), ("MP", "BB"), ("CO", "BTN"),
             ("CO", "BB"), ("BTN", "SB"), ("BTN", "BB"), ("SB", "BB")]
    for opener, tb in pairs:
        resp = P.vs_3bet_probs(opener, tb)
        call = [c for c, (_, pc) in resp.items() if pc >= 0.5]
        side = "IP" if P.in_position(opener, tb) else "OOP"
        f_chart = P.fold_to_3bet(opener, tb)
        f_tag = P.fold_to_3bet(opener, tb, open_mult=tag.open, call=tag.call, threebet=tag.threebet)
        out.append(f"| {opener} vs {tb} ({side}) | {_code(call)} | {_pct(f_chart)} | {_pct(f_tag)} |")
    out += [
        "",
        f"- Cold, facing an open and a 3-bet: 4-bet {_code(P.COLD_4BET)}; call from "
        f"`{', '.join(P.COLD_CALL_3BET_ORDER)}` with a cut of {P.COLD_CALL_3BET_BASE} combos "
        f"(`{compact(P.members({c: p for c, (_, p) in P.cold_vs_3bet_probs().items()}))}`).",
        "",
    ]
    return out


def _facing_4bet() -> list[str]:
    return [
        "#### Facing a 4-bet or 5-bet",
        "",
        f"- Jam {_code(P.JAM_VS_4BET)}. {_code(P.CONTINUE_VS_4BET)} continue when the "
        f"direct price is at most {_pct(P.CONTINUE_VS_4BET_PRICE)}, else fold. Everything "
        "else folds.",
        f"- Facing a 5-bet: {_code(P.JAM_VS_4BET)} call or jam; everything else folds.",
        "",
    ]


def _squeeze() -> list[str]:
    return [
        "#### Squeeze and cold 4-bet",
        "",
        f"- Facing an open and callers: squeeze {_code(P.SQUEEZE_VALUE)} for value and "
        f"{_code(P.SQUEEZE_BLUFF)} as bluffs at {P.SQUEEZE_BLUFF_P:.1f} × the `threebet` "
        f"dial; flat cuts shrink × {P.SQUEEZE_FLAT}.",
        f"- Cold 4-bet {_code(P.COLD_4BET)}.",
        "",
    ]


def _stacks() -> list[str]:
    return [
        "#### Short stacks and sizes",
        "",
        f"- At {P.SHORT_STACK_BB}bb effective or less, every 3-bet or bigger is a jam.",
        f"- Small pairs {_code(P.SMALL_PAIRS)} flat only when the effective stack is at "
        f"least {P.SMALL_PAIR_STACK_X}× the call.",
        "- Sizes (§4.6): open 2.5bb (3bb from the SB) plus 1bb per limper; 3-bet 3× in "
        "position and 4× out of position; 4-bet 2.2×; jam when a raise would commit "
        "more than 40% of the stack.",
        "",
    ]


def render_markdown() -> str:
    lines = [
        P.MD_START,
        "### Proposed v2 baseline charts (2026-10): baseline, not solver, for owner review",
        "",
        "Rendered from `backend/poker/strategy/charts/` by `backend/scripts/render_charts.py`; "
        "do not edit by hand (a test keeps this block in sync). The v2 bots and the beta "
        "coach read these same tables. Each list is the chart with every dial at 1.0 and "
        "shows the hands whose chart probability is at least 50%; the types scale the cuts "
        "with their dials (§4). The RFI lists above are unchanged.",
        "",
        *_opening(),
        *_limped(),
        *_facing_open(),
        *_bb_defence(),
        *_facing_3bet(),
        *_facing_4bet(),
        *_squeeze(),
        *_stacks(),
        P.MD_END,
    ]
    return "\n".join(lines) + "\n"
