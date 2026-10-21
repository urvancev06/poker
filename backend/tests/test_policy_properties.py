"""P3.9: the policy properties of design §5 L2 over seeded self-play nodes.

The checks live in ``validation/properties.py`` (``scripts/policy_properties.py``
runs them over more nodes); the preflop properties are P3.4's tests, imported.
"""

from __future__ import annotations

import pytest

from tests.test_preflop_policy import test_aa_in_bb_raises_limpers as _p3  # noqa: F401
from tests.test_preflop_policy import test_aa_never_folds_to_a_4bet as _p5  # noqa: F401
from tests.test_preflop_policy import test_ak_never_folds_to_a_single_open as _p4  # noqa: F401
from tests.test_preflop_policy import test_ranges_nest_nit_tag_lag as _p2  # noqa: F401
from tests.test_preflop_policy import test_tag_open_1_0_matches_rfi_lists as _p1  # noqa: F401
from validation import properties as P
from validation.nodes import TYPES, play_hands, sample_nodes


@pytest.fixture(scope="module")
def nodes():
    return list(sample_nodes(600, seed=1))


def test_sample_nodes_cover_the_types_streets_and_stacks(nodes):
    assert len(nodes) == 600
    assert {n[2].type_key for n in nodes} == set(TYPES)
    streets = {n[0].street for n in nodes}
    assert streets == {"preflop", "flop", "turn", "river"}
    facing = [n for n in nodes if n[0].street != "preflop" and n[0].to_call > 0]
    first_in = [n for n in nodes if n[0].street != "preflop" and n[0].to_call == 0]
    assert len(facing) >= 60 and len(first_in) >= 100
    assert any(n[0].eff_stack <= 60 for n in nodes)


def test_sample_nodes_is_deterministic_under_seed():
    a = [(s.history, p.hole) for s, p, _ in sample_nodes(40, seed=9)]
    b = [(s.history, p.hole) for s, p, _ in sample_nodes(40, seed=9)]
    assert a == b and a != [(s.history, p.hole) for s, p, _ in sample_nodes(40, seed=10)]


@pytest.mark.parametrize("name", list(P.CHECKS))
def test_property(nodes, name):
    bad = P.CHECKS[name](nodes)
    assert not bad, f"{name}: {len(bad)} violations, e.g.\n" + "\n".join(bad[:5])


def test_v2_bots_always_legal_short_stacks():
    """Review Focus 5: 1-6bb stacks, so min-raise = all-in, all-in calls for
    less and check-or-fold-only sets come up all the time."""
    decisions, results = play_hands(300, seed=5, stacks_bb=(1, 6))
    assert len(results) == 300 and all(sum(r) == 0 for r in results)
    bad = [(spot.position, spot.street, str(a)) for spot, legal, a in decisions if not P.legal_action(a, legal)]
    assert not bad
    degenerate = [legal for _s, legal, _a in decisions
                  if legal.can_aggress and legal.min_raise_to == legal.max_raise_to]
    assert degenerate, "no min-raise = all-in node was reached"
