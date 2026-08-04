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
from dataclasses import asdict, dataclass, field

from ..bots import Bot, archetypes, build_context
from ..engine import Action, GameState, Hand
from ..sim.stats import StatsAccumulator
from ..sim.summarize import summarize_hand

HERO = 0
# Hands observed vs a bot before its HUD read is shown (STRATEGY.md §5 sample-size).
HUD_MIN_HANDS = 30


@dataclass
class GameSession:
    session_id: str
    villains: list[str]              # archetype names for players 1..n-1
    blinds: tuple[int, int] = (1, 2)
    buy_in: int = 200
    seed: int | None = None
    # When False, bots do NOT auto-act to the hero's turn; the caller steps them
    # one action at a time via advance_one() so the UI can watch the hand unfold.
    auto_advance: bool = True

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
        self._decision_ms: list[int] = []
        self._hero_hole: list[str] = []  # captured at deal (folding clears it later)
        self._dealt_holes: list[list[str]] = []  # all seats' cards, captured at deal
        self._reads = StatsAccumulator()  # per-player observed stats (keyed by player index)

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
        self._start_stacks = list(per_seat)

        self._hand = Hand.new(
            table_size=self.n,
            blinds=self.blinds,
            starting_stacks=per_seat,
            seed=self._rng.randint(0, 2**31 - 1),
        )
        self._last_result = None
        self._decision_ms = []
        # Capture every seat's cards now: PokerKit clears them on fold/muck, but we
        # want to reveal non-folded hands at a showdown (and the hero always).
        self._dealt_holes = [self._hand.hole_cards(s) or [] for s in range(self.n)]
        self._hero_hole = self._dealt_holes[self._player_to_seat[HERO]]
        if self.auto_advance:
            self._advance_bots()

    def _advance_bots(self) -> None:
        h = self._hand
        assert h is not None
        while not h.is_over and h.actor is not None and self._seat_to_player[h.actor] != HERO:
            self._apply_one_bot()
        if h.is_over:
            self._finalize()

    def _apply_one_bot(self) -> None:
        """Apply exactly one pending bot action (no finalize)."""
        h = self._hand
        assert h is not None and h.actor is not None
        seat = h.actor
        player = self._seat_to_player[seat]
        ctx = build_context(h, self.blinds[1])
        action = self._bots[player].act(ctx, self._rng)
        h.apply(action)

    def advance_one(self) -> bool:
        """Step a single bot action. Returns True if one was applied, False when
        it's the hero's turn or the hand is over (the UI stops stepping then)."""
        h = self._hand
        if h is None or h.is_over or h.actor is None:
            return False
        if self._seat_to_player[h.actor] == HERO:
            return False
        self._apply_one_bot()
        if h.is_over:
            self._finalize()
        return True

    def submit_hero_action(self, action: Action, decision_ms: int | None = None) -> None:
        if not self.hero_to_act:
            raise RuntimeError("it is not the hero's turn to act")
        if decision_ms is not None and decision_ms >= 0:
            self._decision_ms.append(int(decision_ms))
        self._hand.apply(action)  # type: ignore[union-attr]
        if self._hand.is_over:  # type: ignore[union-attr]
            self._finalize()
        elif self.auto_advance:
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
            "blinds": list(self.blinds),
            "start_stacks": getattr(self, "_start_stacks", [self.buy_in] * self.n),
            "hero_cards": "".join(self._hero_hole),
            "board": " ".join(snap.board),
            "pot": snap.total_pot,
            "hero_net": results[hero_seat],
            "went_to_showdown": showdown and hero_seat in live,
            "results_by_player": {self._seat_to_player[s]: results[s] for s in range(self.n)},
            "actions": actions,
            "lineup": self.archetype_of,
            # Raw wall-clock per hero decision this hand (ms). Includes thinking time,
            # tab switches and interruptions -- summarised only as a median.
            "hero_decision_ms": list(self._decision_ms),
        }

        # Per-player summaries: accumulate observed stats (HUD reads) and stash the
        # hero's summary for the stats-over-time dashboard.
        summaries = summarize_hand(h, self._seat_to_player, self.n)
        for p in range(self.n):
            summaries[p].archetype = str(p)
        self._reads.add_hand(summaries)
        result["hero_summary"] = asdict(summaries[HERO])

        self._last_result = result
        self.hand_index += 1
        return result

    def reads(self) -> dict[int, dict]:
        """Per-bot observed read for the HUD: hands seen + stats (revealed once the
        sample passes HUD_MIN_HANDS). Keyed by player index (1..n-1)."""
        out: dict[int, dict] = {}
        for player in range(1, self.n):
            line = self._reads.line(str(player))
            ready = line.hands >= HUD_MIN_HANDS
            out[player] = {
                "hands": line.hands,
                "min_hands": HUD_MIN_HANDS,
                "ready": ready,
                "stats": None
                if not ready
                else {
                    # None means "no sample" (e.g. a nit at 30 hands that has seen
                    # no flops), which the HUD must render as "—", not as 0.0.
                    "vpip": None if line.vpip is None else round(line.vpip, 1),
                    "pfr": None if line.pfr is None else round(line.pfr, 1),
                    "threebet": None if line.threebet is None else round(line.threebet, 1),
                    "af": None if line.af == float("inf") else round(line.af, 1),
                    "wtsd": None if line.wtsd is None else round(line.wtsd, 1),
                },
            }
        return out

    @property
    def last_result(self) -> dict | None:
        return self._last_result

    # ------------------------------------------------------------------ #
    def state(self) -> GameState:
        """Snapshot from the hero's viewpoint (hero's cards visible, others hidden
        unless the hand is over)."""
        h = self._hand
        assert h is not None
        snap = h.snapshot(viewer=self._player_to_seat[HERO], reveal_all=h.is_over)
        # At a showdown the hero lost, PokerKit mucks the losing hand and clears
        # its hole cards — so overlay the cards we captured at the deal. The hero
        # must always see their own cards (and at hand-over even if they folded,
        # for review). Mid-hand a folded hero stays "folded".
        hero = snap.seats[self._player_to_seat[HERO]]
        if self._hero_hole and not hero.hole_cards and (h.is_over or not hero.folded):
            hero.hole_cards = list(self._hero_hole)
        # At a finished hand that went to showdown (2+ players standing, incl. an
        # all-in runout), reveal every non-folded hand — PokerKit mucks the losers.
        if h.is_over:
            live = [s for s in range(self.n) if not snap.seats[s].folded]
            if len(live) >= 2:
                for s in live:
                    if not snap.seats[s].hole_cards and s < len(self._dealt_holes) and self._dealt_holes[s]:
                        snap.seats[s].hole_cards = list(self._dealt_holes[s])
        return snap

    def live_villain_seats(self) -> list[int]:
        """Seats of bots still in the hand (for coaching equity)."""
        h = self._hand
        assert h is not None
        snap = h.snapshot(reveal_all=True)
        hero_seat = self._player_to_seat[HERO]
        return [s for s in range(self.n) if s != hero_seat and not snap.seats[s].folded]

    def archetype_at_seat(self, seat: int) -> str:
        return self.archetype_of[self._seat_to_player[seat]]
