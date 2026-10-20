"""Build the preflop equity table, ``poker/math/data/preflop_eq.npz``.

For each of the 169 hero classes (``poker.math.suits.CLASSES_169``) the build
deals 20,000 five-card boards from the 50 cards the class representative does
not hold, drawn from the seeded stream ``stream(0, "preflop_table", cls)``.
Each villain combo is scored over the boards that miss its cards (about 16,000):
wins count 1 and ties 1/2. The counts are then pooled over the suit
permutations that fix the representative (``suits.STABILIZERS``: 4 for a pair,
6 for a suited hand, 2 for an offsuit hand), which is the same estimate on more
boards and makes the table exactly invariant under suit renaming. Finally each
matchup is averaged with one minus its reverse (the villain's class row against
the hero), an independent estimate of the same number, which makes
``e(h, v) + e(v, h) = 1`` exact. Combos that share a card with the
representative hold 0 and are never read.

The equity is stored as uint16 (``round(equity * 65535)``), a 169 x 1,326
table. Against exact enumeration over 300 random matchups, one raw row's entries
measured 0.36 pp rms (max 1.1 pp) and the stored entries 0.24 pp rms (max 0.68
pp), with no bias.

The build is deterministic and the file byte-reproducible for any ``--workers``.
``stamp`` is the sha256 of the build parameters (including the rank table's
stamp) and of this script's and ``poker/math/suits.py``'s source. It takes about
1-2 minutes with 4 workers, about 4 with one.

    cd backend && PYTHONPATH=. .venv/bin/python -m scripts.build_preflop_table --workers 4
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from poker.math import ranktable, suits
from poker.math.vector import COMBOS, INCIDENCE, values_matrix
from poker.rng import stream
from scripts._npz import write_npz

OUT = Path(__file__).resolve().parent.parent / "poker" / "math" / "data" / "preflop_eq.npz"

BUILD_PARAMS = {
    "format": 1,
    "classes": list(suits.CLASSES_169),
    "boards_per_class": 20_000,
    "stream": [0, "preflop_table"],
    "score": "win 1, tie 1/2, over boards that miss the villain combo",
    "pooling": "suit permutations that fix the representative",
    "reverse": "each matchup averaged with 1 - its reverse",
    "quantization": 65535,
    "ranktable": ranktable.STAMP,
}
_CHUNK = 2_000


def build_stamp() -> str:
    """sha256 of the build parameters and the sources the table depends on."""
    h = hashlib.sha256()
    h.update(json.dumps(BUILD_PARAMS, sort_keys=True).encode())
    for source in (Path(__file__), Path(suits.__file__)):
        h.update(b"\n")
        h.update(source.read_bytes())
    return h.hexdigest()


def _counts(cls: str) -> tuple[np.ndarray, np.ndarray]:
    """Twice the pot share (2 per win, 1 per tie) and the boards scored, per
    villain combo, before pooling."""
    hero = suits.REPRESENTATIVES[suits.CLASS_INDEX[cls]]
    rest = [c for c in range(52) if c not in hero]
    rng = stream(BUILD_PARAMS["stream"][0], BUILD_PARAMS["stream"][1], cls)
    boards = np.array([rng.sample(rest, 5) for _ in range(BUILD_PARAMS["boards_per_class"])], dtype=np.int8)
    share2 = np.zeros(1326, dtype=np.int64)
    scored = np.zeros(1326, dtype=np.int64)
    hero_hole = np.array([hero])
    for start in range(0, len(boards), _CHUNK):
        chunk = boards[start : start + _CHUNK].astype(np.intp)
        villain = values_matrix(chunk, COMBOS)
        mine = values_matrix(chunk, hero_hole)  # (n, 1)
        open_ = np.ones(villain.shape, dtype=bool)
        for col in range(5):
            open_ &= ~INCIDENCE[:, chunk[:, col]].T
        share2 += (2 * ((mine > villain) & open_)).sum(axis=0) + ((mine == villain) & open_).sum(axis=0)
        scored += open_.sum(axis=0)
    blocked = INCIDENCE[:, list(hero)].any(axis=1)
    share2[blocked] = 0
    scored[blocked] = 0
    return share2, scored


def build_row(cls: str) -> np.ndarray:
    """The pooled equity of class ``cls`` against each combo, float64 (1326,)."""
    share2, scored = _counts(cls)
    k = suits.CLASS_INDEX[cls]
    pooled_share = np.zeros(1326, dtype=np.int64)
    pooled_scored = np.zeros(1326, dtype=np.int64)
    for p in suits.STABILIZERS[k]:
        image = suits.COMBO_PERM[p].astype(np.intp)  # combo c becomes image[c]
        pooled_share += share2[image]
        pooled_scored += scored[image]
    return np.divide(pooled_share, 2 * pooled_scored, out=np.zeros(1326), where=pooled_scored > 0)


def quantize(row: np.ndarray) -> np.ndarray:
    return np.round(row * BUILD_PARAMS["quantization"]).astype(np.uint16)


def reverse_cells(k: int) -> tuple[np.ndarray, np.ndarray]:
    """For row ``k`` (class k's representative against each combo c), the cell
    of the reverse matchup (c against the representative): its class row and
    its column, each (1326,)."""
    a, b = suits.REPRESENTATIVES[k]
    rep = a * (a - 1) // 2 + b if a > b else b * (b - 1) // 2 + a
    rows = suits.HERO_CLASS.astype(np.intp)
    cols = suits.COMBO_PERM[suits.HERO_PERM.astype(np.intp), rep].astype(np.intp)
    return rows, cols


def combine(raw: np.ndarray) -> np.ndarray:
    """Average every matchup with its reverse: ``(e(h, v) + 1 - e(v, h)) / 2``.

    The two are independent estimates (different classes' boards) of the same
    number, so this halves the variance and makes ``e(h, v) + e(v, h) = 1``
    exact. Cells that share a card with the representative stay 0.
    """
    out = np.zeros_like(raw)
    for k in range(len(raw)):
        rows, cols = reverse_cells(k)
        a, b = suits.REPRESENTATIVES[k]
        open_ = ~(INCIDENCE[:, a] | INCIDENCE[:, b])
        out[k] = np.where(open_, (raw[k] + 1 - raw[rows, cols]) / 2, 0.0)
    return out


def build(workers: int = 1) -> dict[str, np.ndarray]:
    classes = BUILD_PARAMS["classes"]
    t0 = time.perf_counter()
    with ProcessPoolExecutor(max_workers=workers) as pool:
        raw = []
        for i, row in enumerate(pool.map(build_row, classes)):
            raw.append(row)
            if (i + 1) % 13 == 0:
                print(f"  {i + 1}/{len(classes)} classes, {time.perf_counter() - t0:.0f} s", flush=True)
    return {
        "table": quantize(combine(np.stack(raw))),
        "classes": np.array(classes),
        "boards_per_class": np.array(BUILD_PARAMS["boards_per_class"]),
        "stamp": np.array(build_stamp()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--out", type=Path, default=OUT, help="where to write (default: the package's data file)")
    args = parser.parse_args()
    t0 = time.perf_counter()
    arrays = build(args.workers)
    write_npz(args.out, **arrays)
    print(
        f"wrote {args.out} ({args.out.stat().st_size:,} bytes) in {time.perf_counter() - t0:.0f} s"
        f" with {args.workers} worker(s), stamp {arrays['stamp']}"
    )


if __name__ == "__main__":
    main()
