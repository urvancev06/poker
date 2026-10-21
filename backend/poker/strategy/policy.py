"""The v2 policy entry point (P3.8).

``policy(spot, priv, persona)`` runs, in order:

1. decide: the chart policy preflop (``preflop.decide_preflop``) or the priced
   postflop policy (``postflop.decide_postflop``), on the persona's dials;
2. leaks: the persona's named leaks (``leaks.apply_leaks``, postflop only);
3. floors and the legal filter (``apply_floors``): a free check is never folded,
   the nuts are never folded, and a choice of an illegal kind becomes the action
   the engine would play for it (what ``sizing.to_action`` does), so the
   distribution is exactly the distribution over the actions the bot plays;
4. normalise.

``Trace`` records what the decision saw; ``explain`` renders it for the X-ray
(it may name types: it is never shown at the table, D26).
"""

from __future__ import annotations

import hashlib
import random
from collections.abc import Mapping
from dataclasses import fields, is_dataclass
from enum import Enum
from types import ModuleType
from typing import TYPE_CHECKING

from . import bettor, constants, leaks, preflop, sizing
from .charts import order as chart_order
from .charts import preflop as chart_tables
from .dials import TYPE_DIALS
from .leaks import LEAK_TEXT, apply_leaks
from .postflop import decide_postflop
from .preflop import decide_preflop
from .spot import Spot
from .types import ActionDist, Choice, Kind, Private, Trace, normalise

if TYPE_CHECKING:
    from ..bots.personas import Persona

_FOLD, _CHECK, _CALL = Choice(Kind.FOLD), Choice(Kind.CHECK), Choice(Kind.CALL)


def _engine_choice(c: Choice, spot: Spot) -> Choice:
    """``c`` as the kind the engine would accept here (mirrors ``to_action``)."""
    legal = spot.legal
    k = c.kind
    if k in (Kind.FOLD, Kind.CHECK):
        return _CHECK if legal.can_check else _FOLD
    if k == Kind.CALL or not legal.can_aggress:
        return _CALL if legal.can_call else _CHECK
    if k == Kind.BET and not legal.can_bet:
        return Choice(Kind.RAISE, c.frac)
    return c


def apply_floors(dist: Mapping[Choice, float], spot: Spot, priv: Private) -> ActionDist:
    """The floors and the legal filter, then normalise.

    * a choice of an illegal kind becomes the engine's action for it (a fold or
      check with a free check is a check; a raise with no raise legal is a call);
    * the nuts never fold: fold mass goes to the call.
    """
    out: dict[Choice, float] = {}
    for c, p in dist.items():
        if p <= 0:
            continue
        c = _engine_choice(c, spot)
        if c == _FOLD and priv.nuts and spot.legal.can_call:
            c = _CALL
        out[c] = out.get(c, 0.0) + p
    return normalise(out)


def choice_key(c: Choice) -> str:
    """``"bet 0.33"``, ``"raise"``, ``"fold"``: a stable label for a choice."""
    return c.kind.value if c.frac is None else f"{c.kind.value} {c.frac:.2f}"


def _order(c: Choice) -> tuple[str, float]:
    return (c.kind.value, c.frac or 0.0)


def _strength(priv: Private) -> dict:
    return {
        "cls": priv.cls,
        "s": priv.s,
        "s_all": priv.s_all,
        "hs": priv.hs,
        "h": dict(priv.h),
        "nuts": priv.nuts,
        "hole_tier": priv.hand.hole_tier.name,
        "outs": priv.draws.outs,
        "bluff_q": priv.bluff_q,
    }


def policy(spot: Spot, priv: Private, persona: Persona) -> tuple[ActionDist, Trace]:
    """The persona's action distribution at ``spot`` and the decision's trace."""
    dials = persona.dials
    if spot.street == "preflop":
        raw, features = decide_preflop(spot, priv.cls, dials)
        info = {"features": features, "prior": None, "eq": None, "price": None, "margin": None}
    else:
        raw, info = decide_postflop(spot, priv, dials)
    leaked, fired = apply_leaks(raw, spot, priv, persona.leaks)
    dist = apply_floors(leaked, spot, priv)
    trace = Trace(
        node=spot.node.value,
        street=spot.street,
        features=dict(info["features"]),
        strength=_strength(priv),
        prior=info["prior"],
        eq=info["eq"],
        price=info["price"],
        margin=info["margin"],
        dist={choice_key(c): p for c, p in sorted(dist.items(), key=lambda kv: _order(kv[0]))},
        leaks=tuple(fired),
    )
    return dist, trace


def sample(dist: Mapping[Choice, float], rng: random.Random) -> Choice:
    """One choice from ``dist``, drawn over the choices sorted by
    ``(kind.value, frac or 0)`` so the draw does not depend on dict order."""
    items = sorted(dist.items(), key=lambda kv: _order(kv[0]))
    u = rng.random()
    acc = 0.0
    for c, p in items:
        acc += p
        if u < acc:
            return c
    return items[-1][0]


def _pct(p: float) -> str:
    return f"{100 * p:.0f}%"


def explain(trace: Trace) -> list[str]:
    """Plain lines for the X-ray: the node, what drove the decision, the leaks that
    fired and the final mix."""
    f = trace.features
    st = trace.strength
    lines = [f"{trace.street.capitalize()}, {trace.node.replace('_', ' ')} ({st['cls']})."]
    if trace.street == "preflop":
        lines.append(
            f"Chart node {f.get('node', trace.node).replace('_', ' ')}: cut {f.get('cut', 0):.0f} combos; "
            f"value raise {_pct(f.get('p_value', 0.0))}, light raise {_pct(f.get('p_light', 0.0))}, "
            f"flat {_pct(f.get('p_flat', 0.0))}."
        )
    elif trace.eq is None:
        lines.append(
            f"First in: strength {st['s']:.2f} against a value line of {f.get('V', 0.0):.2f}, "
            f"value weight {_pct(f.get('w_v', 0.0))}, bluff frequency {_pct(f.get('f_b', 0.0))}."
        )
    else:
        v, beta = trace.prior if trace.prior is not None else (0.0, 0.0)
        lines.append(
            f"Facing a bet: the bettor's value line {v:.2f}, bluff share {_pct(beta)}; "
            f"equity {_pct(trace.eq)} against a price of {_pct(trace.price or 0.0)} "
            f"(margin {trace.margin:+.3f})."
        )
    if st["nuts"]:
        lines.append("Holds the nuts: never folds.")
    for name in trace.leaks:
        lines.append(f"Leak {name.replace('_', ' ')}: {LEAK_TEXT.get(name, '')}".rstrip(": "))
    mix = ", ".join(f"{k} {_pct(p)}" for k, p in sorted(trace.dist.items(), key=lambda kv: -kv[1]))
    lines.append(f"Plays {mix}.")
    return lines


# --- Policy hash ------------------------------------------------------------------

_HASHED_MODULES: tuple[ModuleType, ...] = (chart_tables, chart_order, bettor, constants, sizing, preflop, leaks)


def _canon(x) -> str:
    """A repr that does not depend on set order or the process hash seed."""
    if isinstance(x, (set, frozenset)):
        return "{" + ",".join(sorted(_canon(v) for v in x)) + "}"
    if isinstance(x, Mapping):
        return "{" + ",".join(sorted(f"{_canon(k)}:{_canon(v)}" for k, v in x.items())) + "}"
    if isinstance(x, (list, tuple)):
        return "(" + ",".join(_canon(v) for v in x) + ")"
    if isinstance(x, Enum):
        return f"{type(x).__name__}.{x.name}"
    if is_dataclass(x) and not isinstance(x, type):
        body = ",".join(f"{fl.name}={_canon(getattr(x, fl.name))}" for fl in fields(x))
        return f"{type(x).__name__}({body})"
    if callable(x):
        return f"{getattr(x, '__module__', '')}.{getattr(x, '__qualname__', type(x).__name__)}"
    if hasattr(x, "tobytes"):
        return hashlib.sha256(x.tobytes()).hexdigest()
    return repr(x)


def _tables() -> list[tuple[str, str]]:
    out = [("dials.TYPE_DIALS", _canon(TYPE_DIALS))]
    for mod in _HASHED_MODULES:
        for name in sorted(vars(mod)):
            if not name.isupper() and not (name.startswith("_") and name[1:].isupper()):
                continue
            value = getattr(mod, name)
            if callable(value) or isinstance(value, (ModuleType, type)):
                continue
            out.append((f"{mod.__name__}.{name}", _canon(value)))
    return out


def policy_hash() -> str:
    """The first 12 hex characters of a sha256 over the chart tables, the type
    dials, the bettor priors and every named constant of the policy modules."""
    h = hashlib.sha256()
    for name, value in _tables():
        h.update(name.encode())
        h.update(b"=")
        h.update(value.encode())
        h.update(b"\n")
    return h.hexdigest()[:12]
