"""The chip ledger: a lossless record of every chip a hand moves.

PokerKit owns the rules (betting, side pots, showdown, payouts). The ledger is
bookkeeping kept beside it, so the rest of the app never has to replay an action
log to recover an amount:

* ``post`` entries for the blinds, ``action`` entries for every decision (with
  the chips it ``added``, the seat's ``street_total`` after it, ``stack_after``,
  ``all_in`` and the decision ``facts`` seen before acting), and ``return``
  entries for the uncalled part of a bet handed back when a street closes;
* ``pot`` = chips contributed net of returns (gross, before rake);
* ``winnable(seat, extra)``: what a seat can win if it adds ``extra``, which
  respects side pots (a short stack can only win each opponent's chips up to
  its own total);
* ``payouts(results)``: chips each seat collects at the end
  (``results[i] + contributed[i]``); they sum to ``pot - rake``.

Return rule (it matches ``pokerkit.State.collect_bets``): when a street closes,
the top street bet minus the second-highest street bet, over every seat
including folded ones, goes back to the top bettor.

Storage: ``as_dict()`` is what a persisted hand keeps in ``hands.data.ledger``
(``version`` 1). ``from_dict`` reads it back.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass
from typing import Literal

LEDGER_VERSION = 1

EntryKind = Literal["post", "action", "return"]


@dataclass(frozen=True)
class DecisionFacts:
    """Facts about the decision of the player to act, computed before acting.

    ``to_act_after_call`` counts the players who still act on this street if
    this seat calls (or checks): PokerKit's actor queue minus this seat. All-in
    seats are never in it. ``closes_on_call`` is "nobody acts after me".
    ``betting_over_after_call`` adds "and no later street has betting": the
    river, or at most one live seat with chips left once this seat has called.
    ``can_respond_to_raise`` counts live opponents with chips behind.
    """

    seat: int
    street: str
    to_call: int
    pot: int
    winnable_if_call: int
    to_act_after_call: int
    closes_on_call: bool
    betting_over_after_call: bool
    can_respond_to_raise: int

    def as_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "DecisionFacts":
        return cls(**d)


@dataclass(frozen=True)
class LedgerEntry:
    kind: EntryKind
    seat: int
    street: str
    added: int              # chips put in (negative for a return)
    street_total: int       # the seat's bet on this street after the entry
    stack_after: int        # chips behind after the entry
    all_in: bool = False    # this entry put the seat all-in
    action: str | None = None      # action label for ``action`` entries
    to_amount: int | None = None   # bet/raise "to" level; None otherwise
    facts: DecisionFacts | None = None

    def as_dict(self) -> dict:
        d = asdict(self)
        d["facts"] = None if self.facts is None else self.facts.as_dict()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "LedgerEntry":
        facts = d.get("facts")
        return cls(
            kind=d["kind"],
            seat=d["seat"],
            street=d["street"],
            added=d["added"],
            street_total=d["street_total"],
            stack_after=d["stack_after"],
            all_in=d.get("all_in", False),
            action=d.get("action"),
            to_amount=d.get("to_amount"),
            facts=None if facts is None else DecisionFacts.from_dict(facts),
        )


class Ledger:
    def __init__(self, starting_stacks: Sequence[int]) -> None:
        self.starting_stacks = list(starting_stacks)
        n = len(self.starting_stacks)
        self.entries: list[LedgerEntry] = []
        self.contributed = [0] * n   # net of returns, whole hand
        self.street_bets = [0] * n   # this street's bets
        self.rake = 0                # chips the house took (set at the end)

    # ---- recording ------------------------------------------------------

    def stack(self, seat: int) -> int:
        """Chips behind for ``seat`` right now (before any payout)."""
        return self.starting_stacks[seat] - self.contributed[seat]

    def _add(self, seat: int, amount: int) -> None:
        self.contributed[seat] += amount
        self.street_bets[seat] += amount

    def post(self, seat: int, amount: int, street: str = "preflop") -> LedgerEntry:
        """A forced bet (blind)."""
        self._add(seat, amount)
        entry = LedgerEntry(
            kind="post",
            seat=seat,
            street=street,
            added=amount,
            street_total=self.street_bets[seat],
            stack_after=self.stack(seat),
            all_in=amount > 0 and self.stack(seat) == 0,
        )
        self.entries.append(entry)
        return entry

    def record_action(
        self,
        seat: int,
        street: str,
        action: str,
        to_amount: int | None,
        added: int,
        stack_after: int,
        facts: DecisionFacts | None,
    ) -> LedgerEntry:
        self._add(seat, added)
        if stack_after != self.stack(seat):
            raise AssertionError(
                f"ledger out of step at seat {seat}: engine {stack_after}, ledger {self.stack(seat)}"
            )
        entry = LedgerEntry(
            kind="action",
            seat=seat,
            street=street,
            added=added,
            street_total=self.street_bets[seat],
            stack_after=stack_after,
            all_in=added > 0 and stack_after == 0,
            action=action,
            to_amount=to_amount,
            facts=facts,
        )
        self.entries.append(entry)
        return entry

    def close_street(self, street: str) -> LedgerEntry | None:
        """Close the street: return the uncalled part of the top bet (if any) and
        reset the street bets."""
        entry = None
        bets = self.street_bets
        if len(bets) >= 2:
            ordered = sorted(bets, reverse=True)
            top, second = ordered[0], ordered[1]
            if top > second:
                seat = bets.index(top)
                excess = top - second
                self._add(seat, -excess)
                entry = LedgerEntry(
                    kind="return",
                    seat=seat,
                    street=street,
                    added=-excess,
                    street_total=self.street_bets[seat],
                    stack_after=self.stack(seat),
                )
                self.entries.append(entry)
        self.street_bets = [0] * len(bets)
        return entry

    # ---- reading --------------------------------------------------------

    @property
    def pot(self) -> int:
        """Every chip in the middle, net of returns (gross: before rake)."""
        return sum(self.contributed)

    def winnable(self, seat: int, extra: int = 0) -> int:
        """Chips ``seat`` can win if it adds ``extra`` now: its own total plus each
        other seat's contribution up to that total (side pots)."""
        mine = self.contributed[seat] + extra
        return mine + sum(
            min(c, mine) for i, c in enumerate(self.contributed) if i != seat
        )

    def payouts(self, results: Sequence[int]) -> list[int]:
        """Chips each seat collects at the end, from the per-seat net results."""
        return [r + c for r, c in zip(results, self.contributed)]

    # ---- storage --------------------------------------------------------

    def summary(self) -> dict:
        """The compact view a snapshot carries."""
        return {"contributed": list(self.contributed), "pot": self.pot, "rake": self.rake}

    def as_dict(self) -> dict:
        return {
            "version": LEDGER_VERSION,
            "starting_stacks": list(self.starting_stacks),
            "entries": [e.as_dict() for e in self.entries],
            "contributed": list(self.contributed),
            "pot": self.pot,
            "rake": self.rake,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Ledger":
        entries = [LedgerEntry.from_dict(e) for e in d.get("entries", [])]
        n = len(d["contributed"])
        led = cls(d.get("starting_stacks") or [0] * n)
        led.entries = entries
        led.contributed = list(d["contributed"])
        led.rake = int(d.get("rake", 0))
        return led


@dataclass(frozen=True)
class RakeConfig:
    """House rake: ``percentage`` of each pot, capped at ``cap_bb`` big blinds
    per pot, and nothing when no flop is dealt (``no_flop_no_drop``).

    PokerKit applies the rake function per pot, every time it computes the pots,
    so the function must be pure; the cap therefore applies to each pot (a hand
    with side pots can be raked up to the cap once per pot). Off (``None``)
    everywhere until the table model turns it on.
    """

    percentage: float = 0.05
    cap_bb: float = 3.0
    no_flop_no_drop: bool = True
