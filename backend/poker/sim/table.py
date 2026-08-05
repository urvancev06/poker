"""Play one hand among a fixed set of bots, rotating the button, and summarise
each player's behaviour for the stats module.

Players have a persistent identity (0..n-1) and stacks reset to the starting
stack each hand (standard for chip-EV stat simulation). The button rotates each
hand so positions cycle. PokerKit always seats the SB at seat 0, so we map
players to seats per hand: seat k holds player ``(button + 1 + k) % n``.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from ..bots import Bot, build_context
from ..engine import ActionType, Hand

_STEAL_POS = {"CO", "BTN", "SB"}


@dataclass
class PlayerHandSummary:
    player: int
    archetype: str
    # preflop
    vpip: bool = False
    pfr: bool = False
    threebet: bool = False
    threebet_opp: bool = False
    steal_attempt: bool = False
    steal_opp: bool = False
    faced_steal: bool = False
    folded_to_steal: bool = False
    # flow
    saw_flop: bool = False
    wtsd: bool = False
    won: bool = False
    won_at_showdown: bool = False
    was_pfr: bool = False
    cbet_flop: bool = False
    cbet_opp: bool = False
    # Postflop aggression counts (these feed AF). Rows persisted under the older
    # pf_* names are remapped on load by hero_stats._aggregate.
    postflop_bets: int = 0
    postflop_raises: int = 0
    postflop_calls: int = 0
    net: int = 0


def play_hand(
    bots: list[Bot],
    button: int,
    rng: random.Random,
    blinds: tuple[int, int] = (1, 2),
    starting_stack: int = 200,
    seed: int | None = None,
    observer=None,
) -> list[PlayerHandSummary]:
    n = len(bots)
    bb = blinds[1]
    seat_to_player = [(button + 1 + k) % n for k in range(n)]
    player_to_seat = {p: s for s, p in enumerate(seat_to_player)}

    hand = Hand.new(table_size=n, blinds=blinds, starting_stacks=starting_stack, seed=seed)
    summ = {p: PlayerHandSummary(player=p, archetype=bots[p].name) for p in range(n)}

    opener_position: str | None = None
    last_pf_raiser: int | None = None
    folded_street: dict[int, str] = {}

    while not hand.is_over:
        seat = hand.actor
        if seat is None:
            break
        player = seat_to_player[seat]
        ctx = build_context(hand, bb)
        action = bots[player].act(ctx, rng)
        # Optional measurement hook (e.g. bet-range composition); it must stay
        # read-only, since the validation gate runs with it off.
        if observer is not None:
            observer(bots[player].name, ctx, action)
        s = summ[player]
        a = action.type

        if ctx.street == "preflop":
            if ctx.facing_level == 1:
                s.threebet_opp = True
            if ctx.folded_to_me and ctx.position in _STEAL_POS:
                s.steal_opp = True
            if ctx.facing_level == 1 and opener_position in _STEAL_POS and ctx.position in ("SB", "BB"):
                s.faced_steal = True
                if a is ActionType.FOLD:
                    s.folded_to_steal = True

            if a in (ActionType.BET, ActionType.RAISE):
                s.vpip = True
                s.pfr = True
                if ctx.facing_level == 0:
                    if opener_position is None:
                        opener_position = ctx.position
                    if ctx.folded_to_me and ctx.position in _STEAL_POS:
                        s.steal_attempt = True
                elif ctx.facing_level == 1:
                    s.threebet = True
                last_pf_raiser = player
            elif a is ActionType.CALL:
                s.vpip = True
            elif a is ActionType.FOLD:
                folded_street.setdefault(player, "preflop")
        else:  # postflop
            if a is ActionType.BET:
                s.postflop_bets += 1
            elif a is ActionType.RAISE:
                s.postflop_raises += 1
            elif a is ActionType.CALL:
                s.postflop_calls += 1
            elif a is ActionType.FOLD:
                folded_street.setdefault(player, ctx.street)
            # A c-bet *opportunity* is the PFR facing an unbet flop (first to act
            # or checked to). If a villain donk-bets into them they never had the
            # chance to open a c-bet, so it must not count against their c-bet%.
            if ctx.is_pfr and ctx.street == "flop" and ctx.first_to_act:
                s.cbet_opp = True
                if a is ActionType.BET:
                    s.cbet_flop = True

        hand.apply(action)

    # --- end-of-hand summary ---
    final = hand.snapshot(reveal_all=True)
    results = hand.results() or [0] * n
    board_len = len(final.board)
    flop_reached = board_len >= 3
    live_players = [
        seat_to_player[seat] for seat in range(n) if not final.seats[seat].folded
    ]
    showdown = board_len == 5 and len(live_players) >= 2

    for p in range(n):
        s = summ[p]
        seat = player_to_seat[p]
        s.net = results[seat]
        s.won = s.net > 0
        s.was_pfr = p == last_pf_raiser
        s.saw_flop = flop_reached and folded_street.get(p) != "preflop"
        in_live = p in live_players
        s.wtsd = showdown and in_live
        s.won_at_showdown = s.wtsd and s.won

    return list(summ.values())
