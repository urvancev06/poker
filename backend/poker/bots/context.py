"""Build a ``DecisionContext`` for the player to act, from a hand snapshot.

This derives the situational facts a bot needs — position, how many raises it
faces, whether it was the preflop aggressor, how many players remain — so the
strategy code reads cleanly instead of re-parsing history everywhere.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..engine import Hand, LegalActions


@dataclass
class DecisionContext:
    seat: int
    position: str
    hole: tuple[str, str]
    street: str
    board: list[str]
    legal: LegalActions

    pot: int            # total pot incl. current street bets
    to_call: int        # chips to call (0 if we can check)
    big_blind: int
    my_stack: int
    my_bet: int         # our chips already in this street

    # preflop situation (computed before our action)
    preflop_raises: int   # number of raises made preflop so far (1 = an open)
    num_limpers: int      # callers before the first raise
    folded_to_me: bool    # preflop, nobody has voluntarily entered yet

    # postflop situation
    is_pfr: bool          # we were the last preflop raiser (aggressor)
    players_in_hand: int  # players not folded
    first_to_act: bool    # no bet to face this street

    @property
    def facing_level(self) -> int:
        """0 unopened, 1 facing an open, 2 facing a 3-bet, 3+ facing a 4-bet+."""
        return self.preflop_raises


def build_context(hand: Hand, big_blind: int) -> DecisionContext:
    seat = hand.actor
    assert seat is not None, "no actor to build context for"
    snap = hand.snapshot(viewer=seat)
    legal = snap.legal_actions
    hole = tuple(snap.seats[seat].hole_cards)  # type: ignore[arg-type]

    preflop = [h for h in snap.history if h.street == "preflop"]
    preflop_raises = sum(1 for h in preflop if h.action in ("bet", "raise"))

    num_limpers = 0
    for h in preflop:
        if h.action in ("bet", "raise"):
            break
        if h.action == "call":
            num_limpers += 1

    last_pf_raiser = None
    for h in preflop:
        if h.action in ("bet", "raise"):
            last_pf_raiser = h.seat

    return DecisionContext(
        seat=seat,
        position=snap.seats[seat].position,
        hole=hole,
        street=snap.street,
        board=list(snap.board),
        legal=legal,
        pot=snap.total_pot,
        to_call=legal.call_amount,
        big_blind=big_blind,
        my_stack=snap.seats[seat].stack,
        my_bet=snap.seats[seat].bet,
        preflop_raises=preflop_raises,
        num_limpers=num_limpers,
        folded_to_me=(snap.street == "preflop" and preflop_raises == 0 and num_limpers == 0),
        is_pfr=(last_pf_raiser == seat),
        players_in_hand=sum(1 for s in snap.seats if not s.folded),
        first_to_act=(legal.call_amount == 0),
    )
