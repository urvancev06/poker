"""Interactive game session: one human hero vs archetype bots.

Unlike the headless simulation (bots only, stacks reset each hand), a session is
something a person plays: the hero is player 0, stacks carry over hand to hand
(busted players auto-rebuy to the buy-in), the button rotates, and bots act
automatically until it's the hero's turn or the hand ends.

Player/seat mapping follows the engine convention (PokerKit seats the SB at 0):
seat k holds player ``(button + 1 + k) % n`` for the hand's button player.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from ..bots import Bot, archetypes, build_context
from ..engine import Action, GameState, Hand

HERO = 0


@dataclass
class GameSession:
    session_id: str
    villains: list[str]              # archetype names for players 1..n-1
    blinds: tuple[int, int] = (1, 2)
    buy_in: int = 200
    seed: int | None = None

    n: int = field(init=False)
    stacks: list[int] = field(init=False)       # carried, per player
    archetype_of: list[str] = field(init=False)  # per player ("hero" for 0)
    hand_index: int = field(init=False, default=0)

    def __post_init__(self) -> None:
        self.n = len(self.villains) + 1
        self.stacks = [self.buy_in] * self.n
        self._bots: dict[int, Bot] = {
            p: Bot(archetypes.make(self.villains[p - 1])) for p in range(1, self.n)
        }
        # Use the bots' canonical display names ("Nit", "Calling Station", …) so
        # frontend labels and the coach's per-archetype range model both match.
        self.archetype_of = ["hero"] + [self._bots[p].name for p in range(1, self.n)]
        self._rng = random.Random(self.seed)
        self._hand: Hand | None = None
        self._button = self.n - 1  # so hero (player 0) is SB on hand 0
        self._seat_to_player: list[int] = []
        self._player_to_seat: dict[int, int] = {}
        self._last_result: dict | None = None
        self._hero_hole: list[str] = []  # captured at deal (folding clears it later)

    # ------------------------------------------------------------------ #
    @property
    def hand(self) -> Hand | None:
        return self._hand

    @property
    def hero_seat(self) -> int:
        return self._player_to_seat[HERO]

    @property
    def seat_to_player(self) -> list[int]:
        """Player identity occupying each PokerKit seat this hand."""
        return list(self._seat_to_player)

    @property
    def button_player(self) -> int:
        return self._button

    @property
    def hand_over(self) -> bool:
        return self._hand is None or self._hand.is_over

    @property
    def hero_to_act(self) -> bool:
        h = self._hand
        return (
            h is not None
            and not h.is_over
            and h.actor is not None
            and self._seat_to_player[h.actor] == HERO
        )

    # ------------------------------------------------------------------ #
    def start_hand(self) -> None:
        """Deal a new hand: rotate the button, rebuy busted players, then let the
        bots act up to the hero's first decision."""
        bb = self.blinds[1]
        for p in range(self.n):
            if self.stacks[p] < bb:  # busted -> rebuy to the buy-in
                self.stacks[p] = self.buy_in

        self._button = self.hand_index % self.n
        self._seat_to_player = [(self._button + 1 + k) % self.n for k in range(self.n)]
        self._player_to_seat = {p: s for s, p in enumerate(self._seat_to_player)}
        per_seat = [self.stacks[self._seat_to_player[s]] for s in range(self.n)]

        self._hand = Hand.new(
            table_size=self.n,
            blinds=self.blinds,
            starting_stacks=per_seat,
            seed=self._rng.randint(0, 2**31 - 1),
        )
        self._last_result = None
        self._hero_hole = self._hand.hole_cards(self._player_to_seat[HERO]) or []
        self._advance_bots()

    def _advance_bots(self) -> None:
        h = self._hand
        assert h is not None
        while not h.is_over and h.actor is not None and self._seat_to_player[h.actor] != HERO:
            seat = h.actor
            player = self._seat_to_player[seat]
            ctx = build_context(h, self.blinds[1])
            action = self._bots[player].act(ctx, self._rng)
            h.apply(action)
        if h.is_over:
            self._finalize()

    def submit_hero_action(self, action: Action) -> None:
        if not self.hero_to_act:
            raise RuntimeError("it is not the hero's turn to act")
        self._hand.apply(action)  # type: ignore[union-attr]
        if self._hand.is_over:  # type: ignore[union-attr]
            self._finalize()
        else:
            self._advance_bots()

    # ------------------------------------------------------------------ #
    def _finalize(self) -> dict:
        h = self._hand
        assert h is not None and h.is_over
        snap = h.snapshot(reveal_all=True)
        results = h.results() or [0] * self.n

        # carry stacks back to players
        for seat in range(self.n):
            self.stacks[self._seat_to_player[seat]] = snap.seats[seat].stack

        hero_seat = self._player_to_seat[HERO]
        board_len = len(snap.board)
        live = [s for s in range(self.n) if not snap.seats[s].folded]
        showdown = board_len == 5 and len(live) >= 2

        actions = [
            {
                "player": self._seat_to_player[e.seat],
                "seat": e.seat,
                "position": e.position,
                "street": e.street,
                "action": e.action,
                "to_amount": e.to_amount,
            }
            for e in snap.history
        ]
        result = {
            "session_id": self.session_id,
            "hand_index": self.hand_index,
            "button_player": self._button,
            "hero_seat": hero_seat,
            "hero_position": snap.seats[hero_seat].position,
            "hero_cards": "".join(self._hero_hole),
            "board": " ".join(snap.board),
            "pot": snap.total_pot,
            "hero_net": results[hero_seat],
            "went_to_showdown": showdown and hero_seat in live,
            "results_by_player": {self._seat_to_player[s]: results[s] for s in range(self.n)},
            "actions": actions,
            "lineup": self.archetype_of,
        }
        self._last_result = result
        self.hand_index += 1
        return result

    @property
    def last_result(self) -> dict | None:
        return self._last_result

    # ------------------------------------------------------------------ #
    def state(self) -> GameState:
        """Snapshot from the hero's viewpoint (hero's cards visible, others hidden
        unless the hand is over)."""
        h = self._hand
        assert h is not None
        return h.snapshot(viewer=self._player_to_seat[HERO], reveal_all=h.is_over)

    def live_villain_seats(self) -> list[int]:
        """Seats of bots still in the hand (for coaching equity)."""
        h = self._hand
        assert h is not None
        snap = h.snapshot(reveal_all=True)
        hero_seat = self._player_to_seat[HERO]
        return [s for s in range(self.n) if s != hero_seat and not snap.seats[s].folded]

    def archetype_at_seat(self, seat: int) -> str:
        return self.archetype_of[self._seat_to_player[seat]]
