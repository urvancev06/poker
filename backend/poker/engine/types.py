"""Serializable types for the engine layer.

These are deliberately *plain* (enums + dataclasses, cards as strings like "Ah")
so the same objects can be returned by the API and rendered by the frontend
without leaking PokerKit internals. The engine wrapper (``hand.py``) builds these
from a PokerKit ``State``; nothing here imports PokerKit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Street(str, Enum):
    PREFLOP = "preflop"
    FLOP = "flop"
    TURN = "turn"
    RIVER = "river"

    @classmethod
    def from_index(cls, index: int) -> "Street":
        return (cls.PREFLOP, cls.FLOP, cls.TURN, cls.RIVER)[index]


class ActionType(str, Enum):
    FOLD = "fold"
    CHECK = "check"
    CALL = "call"
    BET = "bet"      # opening a wager on a street with no prior bet
    RAISE = "raise"  # re-raising over a prior bet


# Seat -> position name. PokerKit always seats the small blind at index 0, so for
# a fixed table size the position of each seat is fixed; the *session* layer
# rotates which player sits in which seat to move the button. Names follow
# STRATEGY.md (UTG, MP, CO, BTN, SB, BB).
_POSITIONS: dict[int, list[str]] = {
    # Heads-up is PokerKit's special case: seat 0 posts the BB, seat 1 posts the
    # SB and is the button (it acts first preflop). So seat 0 = BB, seat 1 = SB.
    2: ["BB", "SB"],
    3: ["SB", "BB", "BTN"],
    4: ["SB", "BB", "UTG", "BTN"],
    5: ["SB", "BB", "UTG", "CO", "BTN"],
    6: ["SB", "BB", "UTG", "MP", "CO", "BTN"],
}


def positions_for(num_players: int) -> list[str]:
    """Position name for each seat index, for a `num_players`-handed table."""
    try:
        return list(_POSITIONS[num_players])
    except KeyError as exc:  # pragma: no cover - we only run 2..6 handed
        raise ValueError(f"unsupported table size: {num_players}") from exc


@dataclass(frozen=True)
class Action:
    """A decision to apply. For BET/RAISE, ``to_amount`` is the *total* bet level
    to raise to (matching PokerKit), not the increment."""

    type: ActionType
    to_amount: int | None = None

    def __str__(self) -> str:
        if self.to_amount is not None:
            return f"{self.type.value} to {self.to_amount}"
        return self.type.value


@dataclass(frozen=True)
class LegalActions:
    """What the player to act may legally do, with concrete sizing bounds."""

    can_fold: bool
    can_check: bool
    can_call: bool
    call_amount: int  # chips needed to call (0 when only a check is on offer)
    can_bet: bool     # open a bet (no prior bet this street)
    can_raise: bool   # raise over a prior bet
    min_raise_to: int | None  # smallest legal bet/raise *to* amount
    max_raise_to: int | None  # largest legal bet/raise *to* amount (all-in)

    @property
    def can_aggress(self) -> bool:
        return self.can_bet or self.can_raise


@dataclass
class SeatState:
    seat: int
    position: str
    stack: int          # chips behind
    bet: int            # chips wagered this street (in front of the player)
    folded: bool
    all_in: bool
    is_actor: bool
    hole_cards: list[str] | None = None  # None when hidden from the viewer


@dataclass
class PotState:
    amount: int
    eligible_seats: list[int]


@dataclass
class HistoryEntry:
    seat: int
    position: str
    street: str
    action: str          # ActionType value
    to_amount: int | None
    hole_cards: list[str] | None = None


@dataclass
class GameState:
    """A full, serializable snapshot of a hand at one moment."""

    table_size: int
    button: int
    blinds: tuple[int, int]
    street: str
    board: list[str]
    seats: list[SeatState]
    pots: list[PotState]
    total_pot: int       # collected pots + chips currently in front (display value)
    actor: int | None
    legal_actions: LegalActions | None
    is_over: bool
    history: list[HistoryEntry] = field(default_factory=list)
    results: list[int] | None = None  # net chip delta per seat, set when over
