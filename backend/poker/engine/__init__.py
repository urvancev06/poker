"""Game engine — a clean wrapper over PokerKit for 6-max NLHE cash.

Public surface:
    Hand            one hand: legal actions, apply, advance, showdown, snapshot
    Action          a decision to apply (fold/check/call/bet/raise + sizing)
    ActionType      the kinds of action
    LegalActions    what's legal now, with min/max sizing
    GameState       a serializable snapshot of a hand
    Street          preflop/flop/turn/river
    Ledger          chips added / returned per entry, pot, winnable, payouts
    DecisionFacts   to call, winnable, who acts after a call, is betting over
    EngineError / IllegalAction   error types
"""

from .hand import EngineError, Hand, IllegalAction
from .ledger import DecisionFacts, Ledger, LedgerEntry, RakeConfig
from .types import (
    Action,
    ActionType,
    GameState,
    HistoryEntry,
    LegalActions,
    PotState,
    SeatState,
    Street,
    positions_for,
)

__all__ = [
    "Hand",
    "Action",
    "ActionType",
    "LegalActions",
    "GameState",
    "SeatState",
    "PotState",
    "HistoryEntry",
    "Street",
    "positions_for",
    "Ledger",
    "LedgerEntry",
    "DecisionFacts",
    "RakeConfig",
    "EngineError",
    "IllegalAction",
]
