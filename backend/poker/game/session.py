"""Interactive game session: one human hero vs archetype bots.

Unlike the headless simulation (bots only, stacks reset each hand), a session is
something a person plays: the hero is player 0, stacks carry over hand to hand
(busted players auto-rebuy to the buy-in), the button rotates, and bots act
automatically until it's the hero's turn or the hand ends.

Player/seat mapping follows the engine convention (PokerKit seats the SB at 0):
seat k holds player ``(button + 1 + k) % n`` for the hand's button player.

Randomness comes from seeded streams (``poker.rng``): hand h is dealt from
``stream(seed, "deck", h)`` and decision k of player p in hand h draws from
``stream(seed, "decision", h, p, k)``. The same seed and the same hero actions
replay the session exactly, and a different hero line never changes a later
deal. The seed reveals every future deck, so it is kept server-side: it is
stored in the hand record's ``truth`` and never sent to the client.

Chips: new sessions play 5/10 with 1,000-chip (100bb) buy-ins; every amount the
UI shows is in big blinds. Stored hands carry their own ``blinds`` (the live
database holds hands at 1/2), so readers must never assume a level.

Concurrency: the API serves requests on a thread pool, so two requests for one
session (a double-click, a coach fetch during ``/advance``) can arrive together.
``lock`` (re-entrant) serialises them: every public mutator takes it, and the API
holds it across each route's read-check-act-persist sequence.
"""

from __future__ import annotations

import threading
from collections import Counter
from dataclasses import asdict, dataclass, field
from enum import Enum

from ..bots import Bot, archetypes, build_context
from ..bots.bot_v2 import PersonaBot
from ..bots.personas import make_persona
from ..engine import Action, GameState, Hand
from ..engine.ledger import LEDGER_VERSION
from ..math.vector import flop_matrix, is_flop_warm
from ..rng import new_seed, shuffled_deck, stream
from ..sim.stats import StatsAccumulator
from ..sim.summarize import summarize_hand
from ..strategy.dials import TYPE_DIALS
from ..strategy.policy import policy_hash

ENGINES = ("v1", "v2")
# The Classic lineup the v2 beta table seats (owner decision: the Realistic pool
# is the phase-4 default), in seats shuffled by ``stream(seed, "seating")``.
CLASSIC_LINEUP = ["nit", "tag", "lag", "station", "maniac"]

HERO = 0
# Hands observed vs a bot before its HUD read is shown (STRATEGY.md §5 sample-size).
HUD_MIN_HANDS = 30

# Keys of a hand record that stay on the server (the seed reveals future decks).
SERVER_ONLY_KEYS = ("truth",)


def public_result(result: dict | None) -> dict | None:
    """A hand record with its server-only keys removed (for API responses)."""
    if result is None:
        return None
    return {k: v for k, v in result.items() if k not in SERVER_ONLY_KEYS}


@dataclass
class GameSession:
    session_id: str
    villains: list[str]              # archetype names for players 1..n-1
    blinds: tuple[int, int] = (5, 10)
    buy_in: int = 1000
    # The session's master seed; a fresh 63-bit one when not given.
    seed: int | None = None
    # When False, bots do NOT auto-act to the hero's turn; the caller steps them
    # one action at a time via advance_one() so the UI can watch the hand unfold.
    auto_advance: bool = True
    # Which bot engine plays the villains: "v1" archetype bots (the default) or
    # "v2" PersonaBots (the beta table). v2 seats ``villains or CLASSIC_LINEUP``
    # in shuffled seats, each with its own jittered persona.
    engine: str = "v1"

    n: int = field(init=False)
    stacks: list[int] = field(init=False)       # carried, per player
    archetype_of: list[str] = field(init=False)  # per player ("hero" for 0)
    hand_index: int = field(init=False, default=0)
    # Serialises every read and mutation of this session (see the module docstring).
    lock: threading.RLock = field(init=False, repr=False, compare=False, default_factory=threading.RLock)

    def __post_init__(self) -> None:
        if self.seed is None:
            self.seed = new_seed()
        if self.engine not in ENGINES:
            raise ValueError(f"unknown engine: {self.engine!r}; choose from {list(ENGINES)}")
        self._policy_hash: str | None = None
        if self.engine == "v2":
            types = [v.lower().replace(" ", "") for v in (self.villains or CLASSIC_LINEUP)]
            for t in types:
                if t not in TYPE_DIALS:
                    raise ValueError(f"unknown player type: {t!r}; choose from {list(TYPE_DIALS)}")
            stream(self.seed, "seating").shuffle(types)
            self.villains = types
            self._policy_hash = policy_hash()
        self.n = len(self.villains) + 1
        self.stacks = [self.buy_in] * self.n
        self._bots: dict[int, Bot | PersonaBot] = {
            p: self._make_bot(p) for p in range(1, self.n)
        }
        # Use the bots' canonical display names ("Nit", "Calling Station", …) so
        # frontend labels and the coach's per-archetype range model both match.
        self.archetype_of = ["hero"] + [self._bots[p].name for p in range(1, self.n)]
        self._hand: Hand | None = None
        self._decisions: Counter[int] = Counter()  # per-player decision number this hand
        # Placeholder; start_hand() sets the real button to `hand_index % n`.
        self._button = self.n - 1
        self._seat_to_player: list[int] = []
        self._player_to_seat: dict[int, int] = {}
        self._last_result: dict | None = None
        self._decision_ms: list[int] = []
        self._hero_hole: list[str] = []  # captured at deal (folding clears it later)
        self._dealt_holes: list[list[str]] = []  # all seats' cards, captured at deal
        # Per-player observed stats (keyed by player index).
        self._reads = StatsAccumulator(big_blind=self.blinds[1])
        # v2: every bot decision's trace this hand (server-only, D26).
        self._traces: list[dict] = []

    def _make_bot(self, p: int) -> Bot | PersonaBot:
        name = self.villains[p - 1]
        if self.engine == "v2":
            return PersonaBot(make_persona(name, stream(self.seed, "persona", p), f"p{p}"))
        return Bot(archetypes.make(name))

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
        with self.lock:
            self._start_hand()

    def _start_hand(self) -> None:
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
            deck=shuffled_deck(stream(self.seed, "deck", self.hand_index)),
        )
        self._last_result = None
        self._decision_ms = []
        self._decisions = Counter()
        self._traces = []
        # Every seat's cards as dealt: PokerKit clears them on fold/muck, but we
        # want to reveal non-folded hands at a showdown (and the hero always).
        self._dealt_holes = self._hand.dealt_holes()
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
        k = self._decisions[player]
        self._decisions[player] += 1
        rng = stream(self.seed, "decision", self.hand_index, player, k)
        bot = self._bots[player]
        action = bot.act(ctx, rng)
        if isinstance(bot, PersonaBot) and bot.last_trace is not None:
            self._traces.append({"player": player, "seat": seat, **_jsonable(asdict(bot.last_trace))})
        h.apply(action)

    def advance_one(self) -> bool:
        """Step a single bot action. Returns True if one was applied, False when
        it's the hero's turn or the hand is over (the UI stops stepping then)."""
        with self.lock:
            return self._advance_one()

    def _advance_one(self) -> bool:
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
        with self.lock:
            self._submit_hero_action(action, decision_ms)

    def _submit_hero_action(self, action: Action, decision_ms: int | None) -> None:
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
                # Lossless amounts from the engine ledger (absent on old rows).
                "added": e.added,
                "street_total": e.street_total,
                "all_in": e.all_in,
                "stack_after": e.stack_after,
            }
            for e in snap.history
        ]
        # Villain cards, kept so a hand review can show what the opponent held.
        # Non-folded seats only, and only at a showdown: this must never record
        # cards that were not actually turned face up.
        shown = (
            {
                str(s): "".join(self._dealt_holes[s])
                for s in live
                if self._dealt_holes[s]
            }
            if showdown
            else {}
        )
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
            # The ledger pot: chips in the middle net of uncalled bets, before rake.
            "pot": h.ledger.pot,
            "rake": h.ledger.rake,
            "hero_net": results[hero_seat],
            "went_to_showdown": showdown and hero_seat in live,
            "results_by_player": {self._seat_to_player[s]: results[s] for s in range(self.n)},
            "actions": actions,
            "lineup": self.archetype_of,
            "shown_cards": shown,
            # Raw wall-clock per hero decision this hand (ms); summarised only as a
            # median, since it also contains tab switches and interruptions.
            "hero_decision_ms": list(self._decision_ms),
            "seat_to_player": list(self._seat_to_player),
            "ledger": h.ledger.as_dict(),
            "versions": {"engine": self.engine, "ledger": LEDGER_VERSION},
            # Server-only: never in an API response (see public_result).
            "truth": {"seed": self.seed},
        }
        if self.engine == "v2":
            result["versions"]["policy_hash"] = self._policy_hash
            result["truth"]["personas"] = self.personas()
            result["truth"]["traces"] = list(self._traces)

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

    def personas(self) -> list[dict]:
        """v2: who sits where (server-only truth): each villain's type, persona id,
        handle, dials and leaks."""
        out = []
        for p in range(1, self.n):
            bot = self._bots[p]
            if not isinstance(bot, PersonaBot):
                continue
            per = bot.persona
            out.append({
                "player": p,
                "type": per.type_key,
                "persona_id": per.persona_id,
                "handle": per.handle,
                "dials": _jsonable(asdict(per.dials)),
                "leaks": [{"name": lk.name, "intensity": round(lk.intensity, 4)} for lk in per.leaks],
            })
        return out

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
        """The finished hand's full record, as persisted (includes ``truth``)."""
        return self._last_result

    @property
    def public_last_result(self) -> dict | None:
        """``last_result`` without the server-only ``truth``."""
        return public_result(self._last_result)

    # ------------------------------------------------------------------ #
    def state(self) -> GameState:
        """Snapshot from the hero's viewpoint (hero's cards visible, others hidden
        unless the hand is over)."""
        h = self._hand
        assert h is not None
        snap = h.snapshot(viewer=self._player_to_seat[HERO], reveal_all=h.is_over)
        # PokerKit mucks a losing hand at showdown and clears its hole cards, so
        # overlay the cards captured at the deal. The hero always sees their own
        # cards, including a folded hand once the hand is over (for review), but
        # not while a hand they folded is still running.
        hero = snap.seats[self._player_to_seat[HERO]]
        if self._hero_hole and not hero.hole_cards and (h.is_over or not hero.folded):
            hero.hole_cards = list(self._hero_hole)
        # At a finished hand with 2+ players standing (including an all-in runout),
        # reveal every non-folded hand; PokerKit mucks the losers.
        if h.is_over:
            live = [s for s in range(self.n) if not snap.seats[s].folded]
            if len(live) >= 2:
                for s in live:
                    if not snap.seats[s].hole_cards and s < len(self._dealt_holes) and self._dealt_holes[s]:
                        snap.seats[s].hole_cards = list(self._dealt_holes[s])
        return snap

    def warm_coach_matrix(self) -> bool:
        """Build the flop's equity matrix (``math.vector.flop_matrix``, cached per
        flop) when the hand is on the flop and the hero is still in it, so the
        coach's flop equity reads it warm (D18). Returns whether the matrix is warm
        for this flop afterwards; False when there is no flop to warm."""
        with self.lock:
            h = self._hand
            if h is None or h.is_over or len(h.board) != 3:
                return False
            if h.snapshot(reveal_all=True).seats[self._player_to_seat[HERO]].folded:
                return False
            board = tuple(h.board)
            if not is_flop_warm(board):
                flop_matrix(board)
            return True

    def live_villain_seats(self) -> list[int]:
        """Seats of bots still in the hand (for coaching equity)."""
        h = self._hand
        assert h is not None
        snap = h.snapshot(reveal_all=True)
        hero_seat = self._player_to_seat[HERO]
        return [s for s in range(self.n) if s != hero_seat and not snap.seats[s].folded]

    def archetype_at_seat(self, seat: int) -> str:
        return self.archetype_of[self._seat_to_player[seat]]


def _jsonable(value):
    """A trace or persona as plain JSON: enums by value, tuples as lists, floats
    rounded to 4 places."""
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, float):
        return round(value, 4)
    if isinstance(value, dict):
        return {str(_jsonable(k)): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(v) for v in value]
    if value is None or isinstance(value, (str, int, bool)):
        return value
    return str(value)
