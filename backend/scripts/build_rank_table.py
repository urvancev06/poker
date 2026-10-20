"""Build the rank table, ``poker/math/data/ranktable.npz``.

Every hand value the app computes comes from this one table (see
``poker/math/ranktable.py`` for how it is read). It has two parts:

* **Rank multisets.** Every multiset of 5, 6 or 7 ranks with each rank at most
  4 times: 6,175 + 18,395 + 49,205 = 73,775 entries. Each is given suits by
  cycling s, h, d, c over the sorted cards, which keeps every suit to at most
  two cards (so no flush) and puts copies of a rank on distinct suits, and is
  scored by treys. The value is the best non-flush five of those ranks. The
  key is the base-5 rank count ``sum(count[r] * 5**r)``, so the table is sorted
  by key for ``numpy.searchsorted``.
* **Flush masks.** For each 13-bit rank mask with 5-7 bits set, the best five
  of those ranks in one suit (a flush or a straight flush), scored by treys.
  Other masks hold 0.

Values are ``7463 - treys score``: 1 is 7-5-4-3-2, 7462 is the royal flush.

The build is deterministic and the file is byte-reproducible. ``stamp`` is the
sha256 of the build parameters and this script's source, so any edit here
asks for a rebuild (``tests/test_ranktable.py::test_build_is_deterministic``).

    cd backend && PYTHONPATH=. .venv/bin/python -m scripts.build_rank_table
"""

from __future__ import annotations

import hashlib
import itertools
import json
from pathlib import Path

import numpy as np
from treys import Card, Evaluator

from scripts._npz import write_npz

OUT = Path(__file__).resolve().parent.parent / "poker" / "math" / "data" / "ranktable.npz"

RANKS = "23456789TJQKA"
SUIT_CYCLE = "shdc"
PRIMES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41)  # treys' rank primes, 2..A
BUILD_PARAMS = {
    "format": 1,
    "sizes": [5, 6, 7],
    "max_count": 4,
    "suit_cycle": SUIT_CYCLE,
    "flush_bits": [5, 6, 7],
    "value": "7463 - treys",
}


def build_stamp() -> str:
    """sha256 of the build parameters and this script's source."""
    h = hashlib.sha256()
    h.update(json.dumps(BUILD_PARAMS, sort_keys=True).encode())
    h.update(b"\n")
    h.update(Path(__file__).read_bytes())
    return h.hexdigest()


def _score(evaluator: Evaluator, cards: list[str]) -> int:
    ints = [Card.new(c) for c in cards]
    return 7463 - evaluator.evaluate(ints[:2], ints[2:])


def _rank_multisets():
    for n in BUILD_PARAMS["sizes"]:
        for ranks in itertools.combinations_with_replacement(range(13), n):
            if max(ranks.count(r) for r in set(ranks)) <= BUILD_PARAMS["max_count"]:
                yield ranks


def build() -> dict[str, np.ndarray]:
    """The table's arrays, computed in memory (the same arrays the npz holds)."""
    evaluator = Evaluator()
    keys: list[int] = []
    values: list[int] = []
    for ranks in _rank_multisets():
        cards = [RANKS[r] + SUIT_CYCLE[i % 4] for i, r in enumerate(ranks)]
        keys.append(sum(5**r for r in ranks))
        values.append(_score(evaluator, cards))
    order = np.argsort(np.array(keys, dtype=np.int64), kind="stable")
    rank_keys = np.array(keys, dtype=np.int64)[order]
    rank_values = np.array(values, dtype=np.int16)[order]

    flush_values = np.zeros(8192, dtype=np.int16)
    for mask in range(8192):
        if bin(mask).count("1") in BUILD_PARAMS["flush_bits"]:
            flush_values[mask] = _score(evaluator, [RANKS[r] + "s" for r in range(13) if mask >> r & 1])

    return {
        "rank_keys": rank_keys,
        "rank_values": rank_values,
        "flush_values": flush_values,
        "primes": np.array(PRIMES, dtype=np.int64),
        "stamp": np.array(build_stamp()),
    }


def main() -> None:
    arrays = build()
    write_npz(OUT, **arrays)
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes): {len(arrays['rank_keys']):,} rank multisets, stamp {arrays['stamp']}")


if __name__ == "__main__":
    main()
