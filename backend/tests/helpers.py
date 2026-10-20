"""Test helpers shared by several test modules."""

from __future__ import annotations

from poker.engine import Hand


class HandSession:
    """Wraps a real engine ``Hand`` as ``build_coaching`` expects a session: the
    hero's seat, whether the hero is to act, the hero's view of the state, the
    live villain seats and each villain's archetype."""

    def __init__(self, hand: Hand, hero_seat: int, archetypes: dict[int, str]) -> None:
        self.hand = hand
        self._hero_seat = hero_seat
        self._archetypes = archetypes

    @property
    def hero_seat(self) -> int:
        return self._hero_seat

    @property
    def hero_to_act(self) -> bool:
        return not self.hand.is_over and self.hand.actor == self._hero_seat

    def state(self):
        return self.hand.snapshot(viewer=self._hero_seat)

    def live_villain_seats(self) -> list[int]:
        snap = self.hand.snapshot(reveal_all=True)
        return [s for s in range(self.hand.table_size) if s != self._hero_seat and not snap.seats[s].folded]

    def archetype_at_seat(self, seat: int) -> str:
        return self._archetypes[seat]


def stored_record(hand: Hand, hero_seat: int, lineup: list[str], hand_index: int = 0) -> dict:
    """A finished (or in-progress) ``Hand`` as a persisted hand record, with
    player = seat (button player n - 1), the way ``GameSession._finalize`` writes
    it."""
    snap = hand.snapshot(reveal_all=True)
    n = hand.table_size
    return {
        "session_id": "test",
        "hand_index": hand_index,
        "lineup": list(lineup),
        "hero_seat": hero_seat,
        "button_player": n - 1,
        "blinds": list(hand.blinds),
        "start_stacks": list(hand.ledger.starting_stacks),
        "hero_cards": "".join(hand.dealt_holes()[hero_seat]),
        "board": " ".join(snap.board),
        "actions": [
            {
                "player": e.seat,
                "seat": e.seat,
                "position": e.position,
                "street": e.street,
                "action": e.action,
                "to_amount": e.to_amount,
                "added": e.added,
                "street_total": e.street_total,
                "all_in": e.all_in,
                "stack_after": e.stack_after,
            }
            for e in snap.history
        ],
        "ledger": hand.ledger.as_dict(),
        "hero_net": (hand.results() or [0] * n)[hero_seat],
        "went_to_showdown": False,
    }
