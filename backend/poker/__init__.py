"""Poker — the backend brain.

Module map (see ARCHITECTURE.md):
    poker.api     FastAPI app
    poker.engine  PokerKit wrapper — game state, legal actions, pots
    poker.math    equity / pot odds / EV / hand classifier / ranges
    poker.bots    archetype strategies
    poker.sim     simulation harness + stats
    poker.coach   computed advice + hand review
    poker.game    interactive session, hero vs bots
    poker.db      SQLAlchemy models + persistence
    poker.learn   from-scratch CFR on toy games
"""

__version__ = "0.1.0"
