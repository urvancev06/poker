"""Poker — the backend brain.

Module map (built out phase by phase; see ../ARCHITECTURE.md):
    poker.api     FastAPI app (Phase 0 stub, Phase 4 full)
    poker.engine  PokerKit wrapper — game state, legal actions, pots (Phase 1)
    poker.math    equity / pot odds / EV / hand classifier / ranges (Phase 2)
    poker.bots    archetype strategies (Phase 3)
    poker.sim     simulation harness + stats (Phase 3)
    poker.db      SQLAlchemy models + persistence (Phase 4)
"""

__version__ = "0.1.0"
