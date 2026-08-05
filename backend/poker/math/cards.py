"""Card primitives shared by the math engine.

Cards are plain strings like ``"Ah"``, ``"Td"`` — the same format the engine and
PokerKit use, and exactly what ``treys.Card.new`` accepts. Rank order runs
2..A; a combo is an unordered pair of two distinct card strings.
"""

from __future__ import annotations

RANKS = "23456789TJQKA"
SUITS = "shdc"
RANK_INDEX = {r: i for i, r in enumerate(RANKS)}

# A two-card holding, canonicalised (higher card first, then by suit order).
Combo = tuple[str, str]


def make_deck() -> list[str]:
    """All 52 cards as strings."""
    return [r + s for r in RANKS for s in SUITS]


FULL_DECK = make_deck()
_CARD_SET = set(FULL_DECK)


def suit_of(card: str) -> str:
    return card[1]


def rank_value(card: str) -> int:
    return RANK_INDEX[card[0]]


def is_card(token: str) -> bool:
    return token in _CARD_SET


def canonical_combo(a: str, b: str) -> Combo:
    """Order a two-card combo deterministically (higher rank first; suit order
    breaks ties)."""
    if (rank_value(a), SUITS.index(suit_of(a))) >= (rank_value(b), SUITS.index(suit_of(b))):
        return (a, b)
    return (b, a)
