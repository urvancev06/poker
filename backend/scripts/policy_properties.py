"""Run the policy properties of design §5 L2 over many seeded self-play nodes.

The same checks as ``tests/test_policy_properties.py`` (``validation/properties.py``),
over more nodes; prints each property's node count and violations.

    PYTHONPATH=. .venv/bin/python -m scripts.policy_properties --nodes 5000
"""

from __future__ import annotations

import argparse
import sys
import time

from validation.nodes import play_hands, sample_nodes
from validation.properties import CHECKS, legal_action


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nodes", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--short-hands", type=int, default=300)
    args = ap.parse_args(argv)

    t0 = time.perf_counter()
    nodes = list(sample_nodes(args.nodes, seed=args.seed))
    streets = {s: sum(n[0].street == s for n in nodes) for s in ("preflop", "flop", "turn", "river")}
    print(f"{len(nodes)} nodes (seed {args.seed}) in {time.perf_counter() - t0:.1f}s: {streets}")
    failed = 0
    for name, check in CHECKS.items():
        t = time.perf_counter()
        bad = check(nodes)
        failed += bool(bad)
        print(f"  {'FAIL' if bad else 'ok  '} {name}: {len(bad)} violations ({time.perf_counter() - t:.1f}s)")
        for line in bad[:5]:
            print(f"         {line}")
    decisions, results = play_hands(args.short_hands, seed=args.seed + 4, stacks_bb=(1, 6))
    illegal = [d for d in decisions if not legal_action(d[2], d[1])]
    unbalanced = [r for r in results if sum(r) != 0]
    ok = not illegal and not unbalanced
    failed += not ok
    print(f"  {'ok  ' if ok else 'FAIL'} short_stacks_always_legal: {len(results)} hands at 1-6bb, "
          f"{len(decisions)} decisions, {len(illegal)} illegal, {len(unbalanced)} unbalanced")
    print("PASS" if not failed else f"FAIL ({failed} properties)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
