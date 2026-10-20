"""``Hand``: a thin wrapper over a PokerKit ``State`` for one hand of 6-max
No-Limit Hold'em cash.

It starts a hand, says whose turn it is and what the legal actions and sizings
are, applies an action, advances streets, runs showdown and distributes side
pots, and exposes a serializable snapshot. PokerKit owns the rules, betting,
side pots and hand ranking; this class only adapts it to a stable interface the
rest of the app can rely on.

Seat convention (PokerKit's): seat 0 is the small blind, seat 1 the big blind,
the last seat the button. To move the button across hands, the *session* layer
rotates which player sits in which seat; one ``Hand`` is a single deal.
"""

from __future__ import annotations

import random
import warnings
from collections import deque
from collections.abc import Sequence

from pokerkit import Automation, Card, Mode, NoLimitTexasHoldem, State

# PokerKit emits advisory UserWarnings that are irrelevant to our controlled use:
# a hint when a player folds while a free check is available (we allow it; it's
# legal), and a "card not recommended to be dealt" note during manual dealing in
# tests. Silence just these so the 100k-hand simulation output stays clean.
warnings.filterwarnings("ignore", message="There is no reason for this player to fold")
warnings.filterwarnings("ignore", message="A card being dealt")

from ..math.cards import FULL_DECK
from ..rng import shuffled_deck
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

# Every mechanical step PokerKit can automate. Normal play automates all of them
# except the deal: we deal from our own shuffled deck (see ``Hand.new``).
_AUTO_RANDOM = (
    Automation.ANTE_POSTING,
    Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING,
    Automation.CARD_BURNING,
    Automation.HOLE_DEALING,
    Automation.BOARD_DEALING,
    Automation.HOLE_CARDS_SHOWING_OR_MUCKING,
    Automation.HAND_KILLING,
    Automation.CHIPS_PUSHING,
    Automation.CHIPS_PULLING,
    Automation.RUNOUT_COUNT_SELECTION,
)

# Hole and board dealing are left to us: ``Hand`` deals from its own deck, or the
# caller deals exact cards (``manual_deal=True``) to construct specific scenarios
# (side pots, known showdowns).
_AUTO_MANUAL_DEAL = tuple(
    a
    for a in _AUTO_RANDOM
    if a not in (Automation.HOLE_DEALING, Automation.BOARD_DEALING)
)


class EngineError(RuntimeError):
    """Misuse of the engine (e.g. acting on a finished hand)."""


class IllegalAction(EngineError):
    """An action that the rules don't permit in the current spot."""


def _card_str(card) -> str:
    """PokerKit card -> compact string like ``"Ah"``."""
    return repr(card)


class Hand:
    def __init__(
        self,
        state: State,
        starting_stacks: Sequence[int],
        blinds: tuple[int, int],
        table_size: int,
    ) -> None:
        self._state = state
        self._starting = list(starting_stacks)
        self.blinds = blinds
        self.table_size = table_size
        self._positions = positions_for(table_size)
        self._history: list[HistoryEntry] = []
        self._folded: set[int] = set()
        self._last_street_index = 0
        # Every seat's cards as dealt. PokerKit clears them on a fold or a muck.
        self._dealt: list[list[str]] = [[] for _ in range(table_size)]
        # True when this hand deals from its own deck (not the manual-deal path).
        self._self_dealing = False

    # ---- construction -----------------------------------------------------

    @classmethod
    def new(
        cls,
        table_size: int = 6,
        blinds: tuple[int, int] = (1, 2),
        starting_stacks: int | Sequence[int] = 200,
        seed: int | None = None,
        manual_deal: bool = False,
        deck: Sequence[str] | None = None,
    ) -> "Hand":
        """Start a fresh hand.

        ``starting_stacks`` is either one int (same for everyone) or a per-seat
        sequence in PokerKit seat order (seat 0 = SB).

        The deal comes from ``deck`` (52 distinct cards, dealt in order: seat i
        gets ``deck[i]`` and ``deck[i + n]``, then a burn before each street),
        or from ``shuffled_deck(random.Random(seed))``. Nothing reads the global
        ``random`` state: PokerKit still shuffles its own copy of the deck with
        it, but that copy is replaced before any card is dealt.
        ``manual_deal=True`` leaves dealing to the caller (tests).
        """
        sb, bb = blinds
        if isinstance(starting_stacks, int):
            stacks: tuple[int, ...] = (starting_stacks,) * table_size
        else:
            stacks = tuple(starting_stacks)
            if len(stacks) != table_size:
                raise ValueError(
                    f"got {len(stacks)} stacks for a {table_size}-handed table"
                )
        if manual_deal and deck is not None:
            raise ValueError("a manual-deal hand takes no deck")
        if not manual_deal:
            deck = list(deck) if deck is not None else shuffled_deck(random.Random(seed))
            if len(deck) != 52 or set(deck) != set(FULL_DECK):
                raise ValueError("deck must hold each of the 52 cards exactly once")
        state = NoLimitTexasHoldem.create_state(
            _AUTO_MANUAL_DEAL,
            False,         # ante_trimming_status
            0,             # antes
            (sb, bb),      # blinds
            bb,            # min bet
            stacks,
            table_size,
            mode=Mode.CASH_GAME,
        )
        hand = cls(state, stacks, blinds, table_size)
        if not manual_deal:
            state.deck_cards = deque(Card.parse("".join(deck)))
            hand._self_dealing = True
            hand._deal_pending()
        return hand

    def _deal_pending(self) -> None:
        """Deal every card the state is waiting for, from our deck (burns are
        automated and come off the same deck). No-op on manual-deal hands."""
        if not self._self_dealing:
            return
        s = self._state
        while s.can_deal_hole():
            s.deal_hole(1)
        self._capture_holes()
        while s.can_deal_board():
            s.deal_board(s.board_dealing_count)

    def _capture_holes(self) -> None:
        for seat in range(self.table_size):
            cards = self._state.hole_cards[seat]
            if len(cards) > len(self._dealt[seat]):
                self._dealt[seat] = [_card_str(c) for c in cards]

    def dealt_holes(self) -> list[list[str]]:
        """Every seat's hole cards as dealt, kept after folds and mucks."""
        return [list(c) for c in self._dealt]

    # ---- manual dealing (tests) ------------------------------------------

    def deal_hole(self, cards: str) -> None:
        """Deal one player's hole cards, e.g. ``"AhKs"`` (manual-deal hands)."""
        self._state.deal_hole(cards)
        self._capture_holes()

    def deal_board(self, cards: str) -> None:
        """Deal board cards for the current street (manual-deal hands)."""
        self._state.deal_board(cards)

    # ---- queries ----------------------------------------------------------

    @property
    def is_over(self) -> bool:
        return not self._state.status

    @property
    def actor(self) -> int | None:
        return self._state.actor_index

    @property
    def street(self) -> Street:
        idx = self._state.street_index
        if idx is None:
            idx = self._last_street_index
        else:
            self._last_street_index = idx
        return Street.from_index(idx)

    @property
    def board(self) -> list[str]:
        if not self._state.board_count:
            return []
        return [_card_str(c) for c in self._state.get_board_cards(0)]

    def hole_cards(self, seat: int) -> list[str] | None:
        cards = self._state.hole_cards[seat]
        if not cards:
            return None
        return [_card_str(c) for c in cards]

    def legal_actions(self) -> LegalActions | None:
        """What the player to act may do, with concrete sizing. ``None`` when
        there is no decision pending (hand over / between automated steps)."""
        s = self._state
        if self.is_over or s.actor_index is None:
            return None
        call_amount = s.checking_or_calling_amount
        can_check_or_call = s.can_check_or_call()
        can_aggress = s.can_complete_bet_or_raise_to()
        return LegalActions(
            can_fold=s.can_fold(),
            can_check=can_check_or_call and call_amount == 0,
            can_call=can_check_or_call and call_amount > 0,
            call_amount=call_amount,
            can_bet=can_aggress and call_amount == 0,
            can_raise=can_aggress and call_amount > 0,
            min_raise_to=(
                s.min_completion_betting_or_raising_to_amount if can_aggress else None
            ),
            max_raise_to=(
                s.max_completion_betting_or_raising_to_amount if can_aggress else None
            ),
        )

    def results(self) -> list[int] | None:
        """Net chip delta per seat (final stack - starting stack). ``None`` until
        the hand is over."""
        if not self.is_over:
            return None
        return [
            self._state.stacks[i] - self._starting[i] for i in range(self.table_size)
        ]

    # ---- mutation ---------------------------------------------------------

    def apply(self, action: Action) -> None:
        """Apply ``action`` for the player to act. Raises ``IllegalAction`` if the
        action isn't legal in the current spot. Street/board progression and
        showdown happen automatically."""
        if self.is_over:
            raise EngineError("cannot act: the hand is over")
        seat = self._state.actor_index
        if seat is None:
            raise EngineError("cannot act: no player to act")
        legal = self.legal_actions()
        assert legal is not None  # actor exists => legal actions exist
        street_at_action = self.street.value
        hole = self.hole_cards(seat)

        t = action.type
        if t is ActionType.FOLD:
            if not legal.can_fold:
                raise IllegalAction("folding is not legal here")
            # Folding when a free check is available is never correct in cash play,
            # and PokerKit can then leave a side pot with no eligible claimant,
            # which burns chips and breaks conservation. Reject it rather than
            # corrupt the pot.
            if legal.can_check:
                raise IllegalAction("cannot fold for free — check instead")
            self._state.fold()
            self._folded.add(seat)
        elif t is ActionType.CHECK:
            if not legal.can_check:
                raise IllegalAction("checking is not legal here (there's a bet to call)")
            self._state.check_or_call()
        elif t is ActionType.CALL:
            if not legal.can_call:
                raise IllegalAction("calling is not legal here (nothing to call)")
            self._state.check_or_call()
        elif t in (ActionType.BET, ActionType.RAISE):
            if not legal.can_aggress:
                raise IllegalAction("betting/raising is not legal here")
            amount = action.to_amount
            if amount is None:
                raise IllegalAction("a bet/raise needs a 'to' amount")
            if amount < legal.min_raise_to or amount > legal.max_raise_to:
                raise IllegalAction(
                    f"bet/raise to {amount} outside legal range "
                    f"[{legal.min_raise_to}, {legal.max_raise_to}]"
                )
            self._state.complete_bet_or_raise_to(amount)
        else:  # pragma: no cover - exhaustive
            raise IllegalAction(f"unknown action type: {t}")

        self._history.append(
            HistoryEntry(
                seat=seat,
                position=self._positions[seat],
                street=street_at_action,
                action=t.value,
                to_amount=action.to_amount if t in (ActionType.BET, ActionType.RAISE) else None,
                hole_cards=hole,
            )
        )
        # Deal whatever the action unlocked: the next street, or an all-in runout.
        self._deal_pending()

    # ---- snapshot ---------------------------------------------------------

    @property
    def total_pot(self) -> int:
        """Collected pots plus chips in front, right now.

        Read this rather than a snapshot taken after the hand ends: PokerKit's
        CHIPS_PUSHING automation has already emptied the pot by then, so the
        snapshot reports 0."""
        return int(self._state.total_pot_amount)

    def _pots(self) -> list[PotState]:
        return [
            PotState(amount=p.amount, eligible_seats=list(p.player_indices))
            for p in self._state.pots
        ]

    def snapshot(
        self, viewer: int | None = None, reveal_all: bool = False
    ) -> GameState:
        """A serializable snapshot. Hole cards are shown for ``viewer`` only,
        unless ``reveal_all`` (e.g. at showdown / for tests)."""
        s = self._state
        actor = s.actor_index
        seats: list[SeatState] = []
        for i in range(self.table_size):
            # Track folds ourselves: PokerKit's `statuses[i]` also goes False when
            # a losing hand mucks at showdown, which is not the same as folding.
            folded = i in self._folded
            show = reveal_all or viewer == i
            seats.append(
                SeatState(
                    seat=i,
                    position=self._positions[i],
                    stack=s.stacks[i],
                    bet=s.bets[i],
                    folded=folded,
                    all_in=(not folded) and s.stacks[i] == 0,
                    is_actor=(actor == i),
                    hole_cards=self.hole_cards(i) if show else None,
                )
            )
        return GameState(
            table_size=self.table_size,
            button=self.table_size - 1,
            blinds=self.blinds,
            street=self.street.value,
            board=self.board,
            seats=seats,
            pots=self._pots(),
            total_pot=s.total_pot_amount,
            actor=actor,
            legal_actions=self.legal_actions(),
            is_over=self.is_over,
            history=list(self._history),
            results=self.results(),
        )
