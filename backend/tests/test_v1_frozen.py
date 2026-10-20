"""The v1 bots are frozen until the v2 bots replace them (phase 5).

Phases 2 and 3 rewrite shared code under the v1 archetypes (the classifier, the
equity maths, the engine's bookkeeping), and the v1 validation gate is only
meaningful while the bots it measured still play the same way. This pin hashes
every deal, board and ``(seat, action, to_amount)`` of a fixed seeded run of the
default lineup at 5/10 and 100bb (``poker.sim.fingerprint``), so a change that
moves a single v1 decision fails here.

Pinned in P1.12 at the run that ``backend/validation/phase3_gate.txt`` records.
If this fails, a change reached the v1 bots: find it, do not re-pin.
"""

from __future__ import annotations

from poker.sim.fingerprint import v1_fingerprint

V1_FINGERPRINT_300_SEED_0 = "85c459962ac2f573"


def test_v1_action_log_is_pinned():
    assert v1_fingerprint(300, 0) == V1_FINGERPRINT_300_SEED_0


def test_gate_record_header_names_the_unit_streams_commit_and_pin():
    """``validation/phase3_gate.txt`` says what it measured: the chip unit, the
    seeded streams, the date, the commit and the v1 pin of that code."""
    from scripts.gen_baseline import header

    text = header(commit="abc1234", date="2026-10-20", fingerprint="85c459962ac2f573")
    assert "5/10" in text and "1,000-chip" in text and "streams" in text
    assert "2026-10-20" in text and "abc1234" in text and "85c459962ac2f573" in text
    assert "100,000 hands, seed 0" in text
