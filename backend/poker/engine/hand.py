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

import dataclasses
import functools
import math
import random
import warnings
from collections import deque
from collections.abc import Sequence

from pokerkit import Automation, Card, Mode, NoLimitTexasHoldem, State
from pokerkit.utilities import rake as pokerkit_rake

# PokerKit emits advisory UserWarnings that are irrelevant to our controlled use:
# a hint when a player folds while a free check is available (we allow it; it's
# legal), and a "card not recommended to be dealt" note during manual dealing in
# tests. Silence just these so the 100k-hand simulation output stays clean.
warnings.filterwarnings("ignore", message="There is no reason for this player to fold")
warnings.filterwarnings("ignore", message="A card being dealt")

from ..math.cards import FULL_DECK
from ..rng import shuffled_deck
from .ledger import DecisionFacts, Ledger, RakeConfig
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


def _rake_function(config: RakeConfig, big_blind: int):
    """PokerKit's own rake function with our parameters. It must stay pure:
    PokerKit calls it per pot every time the pots are read."""
    return functools.partial(
        pokerkit_rake,
        percentage=config.percentage,
        cap=math.floor(config.cap_bb * big_blind),
        no_flop_no_drop=config.no_flop_no_drop,
    )


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
        # Bumped on every change of state; keys the decision-facts cache (facts are
        # read both by apply() and by every snapshot a bot or the coach takes).
        self._version = 0
        self._facts_cache: tuple[int, DecisionFacts | None] | None = None
        # Chip bookkeeping beside PokerKit. The blinds are already posted when the
        # state is created; record them small blind first.
        self.ledger = Ledger(self._starting)
        posted = [i for i in range(table_size) if state.bets[i]]
        posted.sort(key=lambda i: ({"SB": 0, "BB": 1}.get(self._positions[i], 2), i))
        for i in posted:
            self.ledger.post(i, state.bets[i])

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
        rake: RakeConfig | None = None,
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

        ``rake`` is off (``None``) by default. With a ``RakeConfig`` the house
        takes its percentage of each pot, capped per pot (see ``RakeConfig``);
        the results then sum to ``-ledger.rake``.
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
            **({} if rake is None else {"rake": _rake_function(rake, bb)}),
        )
        hand = cls(state, stacks, blinds, table_size)
        if not manual_deal:
            state.deck_cards = deque(Card.parse("".join(deck)))
            hand._self_dealing = True
            # One card at a time around the table, twice: seat i gets deck[i] and
            # deck[i + n]. (Asking PokerKit can_deal_hole() before each card
            # doubles the cost of the deal, so count the cards instead.)
            for _ in range(2 * table_size):
                state.deal_hole(1)
            hand._capture_holes()
            hand._deal_pending()
        return hand

    def _deal_pending(self) -> None:
        """Deal the board cards the state is waiting for, from our deck (burns
        are automated and come off the same deck). No-op on manual-deal hands."""
        if not self._self_dealing:
            return
        s = self._state
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
        self._version += 1
        self._capture_holes()

    def deal_board(self, cards: str) -> None:
        """Deal board cards for the current street (manual-deal hands)."""
        self._state.deal_board(cards)
        self._version += 1

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
        s = self._state
        facts = self.decision_facts()
        stack_before = s.stacks[seat]
        bet_before = s.bets[seat]
        street_index_before = s.street_index

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
        self._version += 1

        aggressive = t in (ActionType.BET, ActionType.RAISE)
        if t is ActionType.CALL:
            added = legal.call_amount
        elif aggressive:
            added = action.to_amount - bet_before
        else:
            added = 0
        # One label per situation, whichever of BET/RAISE the caller sent: "bet"
        # opens a street, "raise" goes over a standing bet. Preflop the blinds are
        # bets, so every preflop wager is a raise (the BB's raise over limpers too).
        label = t.value
        if aggressive:
            bet_stands = street_at_action == "preflop" or max(self.ledger.street_bets) > 0
            label = "raise" if bet_stands else "bet"
        entry = self.ledger.record_action(
            seat,
            street_at_action,
            label,
            action.to_amount if aggressive else None,
            added,
            stack_before - added,
            facts,
        )
        # The betting round is over when the street moved on, the hand ended, or
        # nobody is left to act (a manual-deal hand waiting for its next cards).
        if self.is_over or s.street_index != street_index_before or s.actor_index is None:
            self.ledger.close_street(street_at_action)

        self._history.append(
            HistoryEntry(
                seat=seat,
                position=self._positions[seat],
                street=street_at_action,
                action=label,
                to_amount=entry.to_amount,
                hole_cards=hole,
                added=entry.added,
                street_total=entry.street_total,
                all_in=entry.all_in,
                stack_after=entry.stack_after,
            )
        )
        # Deal whatever the action unlocked: the next street, or an all-in runout
        # (which can end the hand).
        self._deal_pending()
        self._version += 1
        if self.is_over:
            self.ledger.rake = -sum(self.results())

    # ---- decision facts ---------------------------------------------------

    def decision_facts(self) -> DecisionFacts | None:
        """Facts for the player to act (see ``DecisionFacts``); ``None`` when
        nobody is to act."""
        cached = self._facts_cache
        if cached is not None and cached[0] == self._version:
            return cached[1]
        facts = self._compute_facts()
        self._facts_cache = (self._version, facts)
        return facts

    def _compute_facts(self) -> DecisionFacts | None:
        s = self._state
        if self.is_over or s.actor_index is None:
            return None
        seat = s.actor_index
        to_call = s.checking_or_calling_amount
        street = self.street.value
        to_act_after = sum(1 for i in s.actor_indices if i != seat)
        closes = to_act_after == 0
        live = [i for i in range(self.table_size) if i not in self._folded]
        with_chips_after_call = sum(
            1 for i in live if s.stacks[i] - (to_call if i == seat else 0) > 0
        )
        return DecisionFacts(
            seat=seat,
            street=street,
            to_call=to_call,
            pot=self.ledger.pot,
            winnable_if_call=self.ledger.winnable(seat, to_call),
            to_act_after_call=to_act_after,
            closes_on_call=closes,
            betting_over_after_call=closes and (street == "river" or with_chips_after_call <= 1),
            can_respond_to_raise=sum(1 for i in live if i != seat and s.stacks[i] > 0),
        )

    # ---- snapshot ---------------------------------------------------------

    @property
    def total_pot(self) -> int:
        """Collected pots plus chips in front, right now.

        PokerKit's CHIPS_PUSHING automation empties the pot when the hand ends,
        so this reads 0 afterwards; ``ledger.pot`` keeps the hand's pot."""
        return int(self._state.total_pot_amount)

    def _pots(self) -> list[PotState]:
        return [
            PotState(amount=p.amount, eligible_seats=list(p.player_indices))
            for p in self._state.pots
        ]

    def snapshot(
        self, viewer: int | None = None, reveal_all: bool = False
    ) -> GameState:
        """A serializable snapshot. Hole cards, on the seats and in the history,
        are shown for ``viewer`` only, unless ``reveal_all`` (e.g. at showdown /
        for tests)."""
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
            history=(
                list(self._history)
                if reveal_all
                else [
                    e if e.seat == viewer else dataclasses.replace(e, hole_cards=None)
                    for e in self._history
                ]
            ),
            results=self.results(),
            ledger=self.ledger.summary(),
            facts=self.decision_facts(),
        )
