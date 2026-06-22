"""Play one hand of 6-max NLHE cash in the console by typing actions.

This is the Phase 1 interactive proof that the engine works end to end. There are
no bots yet (Phase 3) — you drive every seat yourself, typing the action for
whoever is to act. Showdown and side pots are handled by the engine.

    backend/.venv/bin/python scripts/play_console.py            # random hand
    backend/.venv/bin/python scripts/play_console.py --seed 42  # reproducible

Commands at the prompt:
    f / fold            fold
    x / check           check
    c / call            call
    b <amt>             bet to <amt>      (when opening)
    r <amt>             raise to <amt>
    min | max | pot     bet/raise to the min, all-in, or ~pot-sized
    q / quit            abandon the hand
"""

from __future__ import annotations

import argparse
import sys

from poker.engine import Action, ActionType, Hand, LegalActions

RED_SUITS = {"h", "d"}


def color_card(card: str) -> str:
    """Dim-colour a card string for the terminal (red suits red)."""
    suit = card[-1]
    code = "31" if suit in RED_SUITS else "37"
    return f"\033[{code}m{card}\033[0m"


def render(hand: Hand) -> None:
    snap = hand.snapshot(reveal_all=hand.is_over)
    board = " ".join(color_card(c) for c in snap.board) or "—"
    print("\n" + "═" * 56)
    print(f"  {snap.street.upper():<8}   board: {board}   pot: {snap.total_pot}")
    print("─" * 56)
    for s in snap.seats:
        here = "►" if s.is_actor else " "
        tag = ""
        if s.folded:
            tag = "folded"
        elif s.all_in:
            tag = "all-in"
        cards = (
            " ".join(color_card(c) for c in s.hole_cards)
            if s.hole_cards
            else ("xx xx" if not s.folded else "     ")
        )
        bet = f"bet {s.bet}" if s.bet else ""
        print(
            f"  {here} seat {s.seat} {s.position:<3}  {cards:<14} "
            f"stack {s.stack:<4} {bet:<7} {tag}"
        )
    print("═" * 56)


def describe_legal(legal: LegalActions) -> str:
    parts = []
    if legal.can_fold:
        parts.append("(f)old")
    if legal.can_check:
        parts.append("(x)check")
    if legal.can_call:
        parts.append(f"(c)all {legal.call_amount}")
    if legal.can_bet:
        parts.append(f"(b)et {legal.min_raise_to}–{legal.max_raise_to}")
    if legal.can_raise:
        parts.append(f"(r)aise to {legal.min_raise_to}–{legal.max_raise_to}")
    return "  ".join(parts)


def parse_action(text: str, legal: LegalActions, pot: int) -> Action | str | None:
    """Return an Action, the string 'quit', or None if the input is invalid."""
    text = text.strip().lower()
    if text in ("q", "quit", "exit"):
        return "quit"
    parts = text.split()
    word = parts[0] if parts else ""
    amount_word = parts[1] if len(parts) > 1 else None

    if word in ("f", "fold"):
        return Action(ActionType.FOLD) if legal.can_fold else None
    if word in ("x", "check"):
        return Action(ActionType.CHECK) if legal.can_check else None
    if word in ("c", "call"):
        return Action(ActionType.CALL) if legal.can_call else None

    if word in ("b", "bet", "r", "raise", "min", "max", "allin", "pot"):
        if not legal.can_aggress:
            return None
        kind = ActionType.BET if legal.can_bet else ActionType.RAISE
        if word in ("min",):
            to = legal.min_raise_to
        elif word in ("max", "allin"):
            to = legal.max_raise_to
        elif word in ("pot",):
            to = min(max(legal.min_raise_to, legal.call_amount + pot), legal.max_raise_to)
        else:
            if amount_word is None or not amount_word.isdigit():
                return None
            to = int(amount_word)
        if to < legal.min_raise_to or to > legal.max_raise_to:
            print(f"  ! amount must be {legal.min_raise_to}–{legal.max_raise_to}")
            return None
        return Action(kind, to)
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Play one NLHE hand in the console.")
    parser.add_argument("--seed", type=int, default=None, help="reproducible deal")
    parser.add_argument("--table-size", type=int, default=6)
    parser.add_argument("--stack", type=int, default=200, help="starting stack (chips)")
    parser.add_argument("--blinds", type=int, nargs=2, default=(1, 2), metavar=("SB", "BB"))
    args = parser.parse_args(argv)

    hand = Hand.new(
        table_size=args.table_size,
        blinds=tuple(args.blinds),
        starting_stacks=args.stack,
        seed=args.seed,
    )

    while not hand.is_over:
        render(hand)
        legal = hand.legal_actions()
        if legal is None:
            break
        actor = hand.actor
        print(f"  seat {actor} ({hand.snapshot().seats[actor].position}) to act:  {describe_legal(legal)}")
        try:
            line = input("  > ")
        except EOFError:
            print("\n  (end of input — abandoning hand)")
            return 1
        action = parse_action(line, legal, hand.snapshot().total_pot)
        if action == "quit":
            print("  quit.")
            return 0
        if action is None:
            print("  ! invalid action, try again")
            continue
        hand.apply(action)

    render(hand)
    results = hand.results()
    print("\n  RESULT (net chips):")
    snap = hand.snapshot(reveal_all=True)
    for s in snap.seats:
        delta = results[s.seat]
        sign = "+" if delta > 0 else ""
        print(f"    seat {s.seat} {s.position:<3}  {sign}{delta}")
    assert sum(results) == 0, "chips not conserved!"
    print("  (chips conserved ✓)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
