"""Turn engine/session objects into JSON-friendly dicts for the API."""

from __future__ import annotations

from ..engine import GameState, LegalActions
from ..game import GameSession
from ..math import classify


def legal_to_dict(legal: LegalActions | None) -> dict | None:
    if legal is None:
        return None
    return {
        "can_fold": legal.can_fold,
        "can_check": legal.can_check,
        "can_call": legal.can_call,
        "call_amount": legal.call_amount,
        "can_bet": legal.can_bet,
        "can_raise": legal.can_raise,
        "min_raise_to": legal.min_raise_to,
        "max_raise_to": legal.max_raise_to,
    }


def seat_to_dict(seat, board: list[str]) -> dict:
    # When a seat's cards are visible (hero always; villains at showdown), label
    # the made hand so the UI can show "what do I/they have" — updates per street.
    hand_label = None
    if seat.hole_cards and len(seat.hole_cards) == 2:
        hand_label = classify(seat.hole_cards, board).label
    return {
        "seat": seat.seat,
        "position": seat.position,
        "stack": seat.stack,
        "bet": seat.bet,
        "folded": seat.folded,
        "all_in": seat.all_in,
        "is_actor": seat.is_actor,
        "hole_cards": seat.hole_cards,
        "hand_label": hand_label,
    }


def history_to_dict(state: GameState) -> list[dict]:
    """The action log for the table feed. Deliberately omits each entry's
    hole_cards so a mid-hand snapshot never leaks villain cards to the hero."""
    return [
        {
            "seat": e.seat,
            "position": e.position,
            "street": e.street,
            "action": e.action,
            "to_amount": e.to_amount,
        }
        for e in state.history
    ]


def state_to_dict(state: GameState) -> dict:
    return {
        "table_size": state.table_size,
        "button": state.button,
        "blinds": list(state.blinds),
        "street": state.street,
        "board": state.board,
        "pot": state.total_pot,
        # Side pots were computed by the engine and dropped here, so a multi-way
        # all-in showed only a single total (audit F-28).
        "pots": [
            {"amount": p.amount, "eligible_seats": list(p.eligible_seats)}
            for p in state.pots
        ],
        "actor": state.actor,
        "is_over": state.is_over,
        "seats": [seat_to_dict(s, state.board) for s in state.seats],
        "legal_actions": legal_to_dict(state.legal_actions),
        "results": state.results,
        "history": history_to_dict(state),
    }


def session_to_dict(session: GameSession) -> dict:
    state = session.state()
    return {
        "session_id": session.session_id,
        "hand_index": session.hand_index,
        "hand_over": session.hand_over,
        "hero_seat": session.hero_seat,
        "hero_to_act": session.hero_to_act,
        "stacks_by_player": session.stacks,
        "archetypes": session.archetype_of,
        "seat_to_player": session.seat_to_player,
        "button_player": session.button_player,
        "state": state_to_dict(state),
        "last_result": session.last_result,
    }
