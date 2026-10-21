"""Calibration guard: the action-conditioned villain range must predict river
outcomes better than the static range, without over-correcting into over-folding.

Runs the river-spot probe at a modest sample. scripts/coach_calibration.py and
validation/coach_calibration.txt hold the full committed record.
"""

from scripts.coach_calibration import _summary, run_probe


def test_conditioned_range_reduces_river_overcall_bias():
    rows = run_probe(hands=2200, seed=0, eq_trials=300)
    _, (bias_old, bias_new, n) = _summary(rows)
    assert n > 150, f"too few river spots to judge ({n})"
    # The problem exists: the static preflop range over-rates hero equity on the river.
    assert bias_old > 0.02, f"static range should over-rate the call (bias {bias_old:+.3f})"
    # Conditioning must predict the river outcomes better, spot for spot. This is a
    # paired comparison on the same spots. Comparing the two mean biases instead is
    # a coin flip at this sample: |bias_new| < |bias_old| held for 3 of 8 seeds once
    # deals came from seeded streams (2,200 hands, ~430 spots, SE ~0.025), because
    # the conditioned range over-corrects by about as much as the static one
    # over-rates (6,000 hands: +0.043 static, -0.038 conditioned). The paired error
    # was lower for 8 of 8 seeds.
    mae_old = sum(abs(r[2] - r[1]) for r in rows) / len(rows)
    mae_new = sum(abs(r[3] - r[1]) for r in rows) / len(rows)
    assert mae_new < mae_old, f"conditioned should predict better (MAE {mae_new:.3f} vs {mae_old:.3f})"
    # ...without over-correcting into over-folding.
    assert bias_new > -0.08, f"conditioned must not over-correct into over-folding ({bias_new:+.3f})"


def test_probe_plays_at_5_10_and_100bb(monkeypatch):
    """Decision 1: the probe deals the table's chip unit (5/10, 1,000-chip stacks),
    and the bots size from the 10-chip big blind, as in the simulator and sessions."""
    import scripts.coach_calibration as probe

    hands, bigs = [], []
    real_new, real_ctx = probe.Hand.new, probe.build_context

    def spy_new(*args, **kwargs):
        hands.append((kwargs.get("blinds"), kwargs.get("starting_stacks")))
        return real_new(*args, **kwargs)

    def spy_ctx(hand, big_blind):
        bigs.append(big_blind)
        return real_ctx(hand, big_blind)

    monkeypatch.setattr(probe.Hand, "new", staticmethod(spy_new))
    monkeypatch.setattr(probe, "build_context", spy_ctx)
    probe.run_probe(hands=3, seed=0, eq_trials=20)
    assert hands and set(hands) == {((5, 10), 1000)}
    assert bigs and set(bigs) == {10}


def test_probe_is_reproducible_and_ignores_global_rng():
    import random

    random.seed(1)
    a = run_probe(hands=200, seed=0, eq_trials=50)
    random.seed(2)
    b = run_probe(hands=200, seed=0, eq_trials=50)
    assert a and a == b


def test_probe_prices_with_the_coachs_equity():
    """P2.10: the probe reads the equity the coach shows (``villains.villain_equity``),
    which is exact on a heads-up river, so its predicted columns carry no sampling noise."""
    from poker.coach.villains import villain_equity

    rows = run_probe(hands=200, seed=0)
    assert rows
    seen = []
    import scripts.coach_calibration as cal

    def spy(*a, **k):
        res = villain_equity(*a, **k)
        seen.append(res.method)
        return res

    orig = cal.villain_equity
    cal.villain_equity = spy
    try:
        assert run_probe(hands=200, seed=0) == rows
    finally:
        cal.villain_equity = orig
    assert seen and set(seen) == {"exact"}
