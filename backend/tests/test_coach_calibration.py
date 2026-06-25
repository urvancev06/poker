"""Calibration guard (the 'error reduced, not moved' proof, as a test).

Runs the river-spot probe at a modest sample and asserts the conditioned range
both REDUCES the static range's over-calling bias and does NOT over-correct into
over-folding. See scripts/coach_calibration.py and validation/coach_calibration.txt
for the full committed record.
"""

from scripts.coach_calibration import _summary, run_probe


def test_conditioned_range_reduces_river_overcall_bias():
    rows = run_probe(hands=2200, seed=0, eq_trials=300)
    _, (bias_old, bias_new, n) = _summary(rows)
    assert n > 150, f"too few river spots to judge ({n})"
    # The problem exists: the static preflop range over-rates hero equity on the river.
    assert bias_old > 0.02, f"static range should over-rate the call (bias {bias_old:+.3f})"
    # The fix REDUCES the error magnitude...
    assert abs(bias_new) < abs(bias_old), f"conditioned should shrink bias ({bias_new:+.3f} vs {bias_old:+.3f})"
    # ...without merely MOVING it into over-folding.
    assert bias_new > -0.08, f"conditioned must not over-correct into over-folding ({bias_new:+.3f})"
