"""Pot odds, required equity, and simple call-vs-fold EV — exact arithmetic.

These are the numbers the coach shows and reproduces. Convention: ``pot`` is the
size of the pot *after* the opponent's bet (i.e. it already includes their bet),
and ``call`` is what you must put in to call. Folding is always worth 0.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CallAnalysis:
    call: int
    pot: int
    required_equity: float  # break-even equity to call
    equity: float | None    # your actual equity, if provided
    call_ev: float | None   # EV of calling vs folding (0), if equity provided
    should_call: bool | None

    def as_dict(self) -> dict:
        return {
            "call": self.call,
            "pot": self.pot,
            "required_equity_pct": round(self.required_equity * 100, 2),
            "equity_pct": None if self.equity is None else round(self.equity * 100, 2),
            "call_ev": None if self.call_ev is None else round(self.call_ev, 2),
            "should_call": self.should_call,
        }


def required_equity(call: int, pot: int) -> float:
    """Break-even equity to call: ``call / (pot + call)``. ``pot`` already
    includes the opponent's bet."""
    if call < 0 or pot < 0:
        raise ValueError("call and pot must be non-negative")
    if call == 0:
        return 0.0
    return call / (pot + call)


def pot_odds_ratio(call: int, pot: int) -> float:
    """Pot odds as a ``pot : call`` ratio (e.g. 3.0 means you're getting 3-to-1)."""
    if call <= 0:
        raise ValueError("call must be positive for a ratio")
    return pot / call


def call_ev(equity: float, call: int, pot: int) -> float:
    """EV of calling vs folding (0): ``equity*pot - (1-equity)*call``.

    Win the ``pot`` with probability ``equity``; otherwise lose your ``call``.
    Positive means calling beats folding."""
    if not 0.0 <= equity <= 1.0:
        raise ValueError("equity must be in [0, 1]")
    return equity * pot - (1 - equity) * call


def analyze_call(call: int, pot: int, equity: float | None = None) -> CallAnalysis:
    """Bundle the call decision: required equity, and (if you pass your actual
    ``equity``) the call EV and a verdict."""
    req = required_equity(call, pot)
    ev = None if equity is None else call_ev(equity, call, pot)
    verdict = None if equity is None else equity >= req
    return CallAnalysis(
        call=call,
        pot=pot,
        required_equity=req,
        equity=equity,
        call_ev=ev,
        should_call=verdict,
    )
