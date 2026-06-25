"""Post-hoc per-player hand summary, reconstructed from a finished hand's action
history. Used by the interactive session to compute the hero's stats over time
and each bot's *observed* stats (the read the player would form vs that bot).

This mirrors the stat definitions the simulation's table.py tracks live, but
derives them after the fact from `snapshot.history` + the final state, so it can
summarise any completed hand (interactive or replayed).
"""

from __future__ import annotations

from ..engine import Hand
from .table import PlayerHandSummary

_STEAL_POS = {"CO", "BTN", "SB"}


def summarize_hand(hand: Hand, seat_to_player: list[int], n: int) -> list[PlayerHandSummary]:
    snap = hand.snapshot(reveal_all=True)
    results = hand.results() or [0] * n
    history = snap.history

    summ = {
        p: PlayerHandSummary(player=p, archetype="")
        for p in range(n)
    }
    player_at = {seat: seat_to_player[seat] for seat in range(n)}

    # --- preflop replay (to derive facing levels in order) ---
    running_raises = 0
    running_limpers = 0
    opener_position: str | None = None
    last_pf_raiser_seat: int | None = None
    folded_street: dict[int, str] = {}
    street_has_bet = False
    current_street = "preflop"

    for e in history:
        s = summ[player_at[e.seat]]
        if e.street != current_street:
            current_street = e.street
            street_has_bet = False

        if e.street == "preflop":
            facing = running_raises
            folded_to_me = running_raises == 0 and running_limpers == 0
            if facing == 1:
                s.threebet_opp = True
            if folded_to_me and e.position in _STEAL_POS:
                s.steal_opp = True
            if facing == 1 and opener_position in _STEAL_POS and e.position in ("SB", "BB"):
                s.faced_steal = True
                if e.action == "fold":
                    s.folded_to_steal = True

            if e.action in ("bet", "raise"):
                s.vpip = True
                s.pfr = True
                if facing == 0:
                    if opener_position is None:
                        opener_position = e.position
                    if folded_to_me and e.position in _STEAL_POS:
                        s.steal_attempt = True
                elif facing == 1:
                    s.threebet = True
                running_raises += 1
                last_pf_raiser_seat = e.seat
            elif e.action == "call":
                s.vpip = True
                if running_raises == 0:
                    running_limpers += 1
            elif e.action == "fold":
                folded_street.setdefault(player_at[e.seat], "preflop")
        else:  # postflop
            if e.action == "bet":
                s.pf_bets += 1
            elif e.action == "raise":
                s.pf_raises += 1
            elif e.action == "call":
                s.pf_calls += 1
            elif e.action == "fold":
                folded_street.setdefault(player_at[e.seat], e.street)
            # C-bet opportunity = the PFR faces an unbet flop (first to act or
            # checked to). A donk-bet into them removes the chance to c-bet, so it
            # must not count against c-bet% (mirror of table.py's live tracker).
            is_aggressor = e.seat == last_pf_raiser_seat
            if is_aggressor and e.street == "flop" and not street_has_bet:
                s.cbet_opp = True
                if e.action == "bet":
                    s.cbet_flop = True

        if e.action in ("bet", "raise"):
            street_has_bet = True

    # --- end of hand ---
    board_len = len(snap.board)
    flop_reached = board_len >= 3
    live = [player_at[seat] for seat in range(n) if not snap.seats[seat].folded]
    showdown = board_len == 5 and len(live) >= 2
    pfr_player = player_at[last_pf_raiser_seat] if last_pf_raiser_seat is not None else None

    for p in range(n):
        s = summ[p]
        # find this player's seat
        seat = next(seat for seat in range(n) if player_at[seat] == p)
        s.net = results[seat]
        s.won = s.net > 0
        s.was_pfr = p == pfr_player
        s.saw_flop = flop_reached and folded_street.get(p) != "preflop"
        s.wtsd = showdown and p in live
        s.won_at_showdown = s.wtsd and s.won

    return [summ[p] for p in range(n)]
