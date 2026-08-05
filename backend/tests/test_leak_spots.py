"""Leak-detector battery. Asymmetric on purpose: every standard play must come back
with ZERO leaks, while the two true positives must still flag.
scripts/leak_spot_check.py prints the readable table.
"""

from poker.coach import review_hand
from scripts.leak_spot_check import battery


def _hero_decision(rev, action):
    decs = [d for d in rev["decisions"] if d["action"] == action]
    return decs[-1] if decs else None


def test_correct_plays_are_never_flagged():
    for name, (data, action, _forbidden) in battery().items():
        if name.startswith("TRUE POSITIVE"):
            continue
        rev = review_hand(data, equity_trials=3000)
        d = _hero_decision(rev, action)
        assert d is not None, f"{name}: no hero {action} decision found"
        assert d["leaks"] == [], f"{name}: falsely flagged {[l['type'] for l in d['leaks']]}"


def test_true_positives_still_flag():
    expect = {
        "TRUE POSITIVE: loose RFI open 96o (no limper)": "loose_open",
        "TRUE POSITIVE: hero calls nit pot river bet": "call_no_odds",
    }
    spots = battery()
    for name, want in expect.items():
        data, action, _ = spots[name]
        rev = review_hand(data, equity_trials=3000)
        d = _hero_decision(rev, action)
        types = [l["type"] for l in d["leaks"]]
        assert want in types, f"{name}: expected {want}, got {types}"
