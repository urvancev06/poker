"""``Hand`` — a thin, tested wrapper over a PokerKit ``State`` for one hand of
6-max NLHE cash.

Responsibilities (PROJECT.md Phase 1): start a hand, say whose turn it is and
the legal actions with sizing, apply an action, advance streets, run showdown and
distribute side pots, and expose a serializable snapshot. PokerKit owns the rules,
betting, side pots, and hand ranking — this class only adapts it to a clean,
stable interface the rest of the app (and the frontend) can rely on.

Seat convention (PokerKit's): seat 0 is the small blind, seat 1 the big blind,
the last seat the button. To move the button across hands, the *session* layer
rotates which player sits in which seat; one ``Hand`` is a single deal.
"""

from __future__ import annotations

import random
import warnings
from collections.abc import Sequence

from pokerkit import Automation, Mode, NoLimitTexasHoldem, State

# PokerKit emits advisory UserWarnings that are irrelevant to our controlled use:
# a hint when a player folds while a free check is available (we allow it; it's
# legal), and a "card not recommended to be dealt" note during manual dealing in
# tests. Silence just these so the 100k-hand simulation output stays clean.
warnings.filterwarnings("ignore", message="There is no reason for this player to fold")
warnings.filterwarnings("ignore", message="A card being dealt")

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

# Normal play: PokerKit handles every mechanical step, including random dealing.
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

# Manual dealing (deterministic tests): same, but the caller deals hole + board
# cards so specific scenarios (side pots, known showdowns) can be constructed.
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

    # ---- construction -----------------------------------------------------

    @classmethod
    def new(
        cls,
        table_size: int = 6,
        blinds: tuple[int, int] = (1, 2),
        starting_stacks: int | Sequence[int] = 200,
        seed: int | None = None,
        manual_deal: bool = False,
    ) -> "Hand":
        """Start a fresh hand.

        ``starting_stacks`` is either one int (same for everyone) or a per-seat
        sequence in PokerKit seat order (seat 0 = SB). ``seed`` makes the random
        deal reproducible. ``manual_deal=True`` leaves dealing to the caller.
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
        if seed is not None:
            random.seed(seed)
        automations = _AUTO_MANUAL_DEAL if manual_deal else _AUTO_RANDOM
        state = NoLimitTexasHoldem.create_state(
            automations,
            False,         # ante_trimming_status
            0,             # antes
            (sb, bb),      # blinds
            bb,            # min bet
            stacks,
            table_size,
            mode=Mode.CASH_GAME,
        )
        return cls(state, stacks, blinds, table_size)

    # ---- manual dealing (tests) ------------------------------------------

    def deal_hole(self, cards: str) -> None:
        """Deal one player's hole cards, e.g. ``"AhKs"`` (manual-deal hands)."""
        self._state.deal_hole(cards)

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
            # Folding when a free check is available is a "non-standard fold":
            # never correct in cash play, and PokerKit can leave a side pot with
            # no eligible claimant, which BURNS chips (breaking conservation) and
            # can even assert mid-push. A free check strictly dominates folding, so
            # reject it as illegal rather than corrupt the pot.
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

    # ---- snapshot ---------------------------------------------------------

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
