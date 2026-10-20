"""Run a headless simulation of N hands among a fixed lineup, accumulating stats.

Every random draw comes from a seeded stream (``poker.rng``): hand h is dealt
from ``stream(seed, "deck", h)`` and decision k of player p in hand h draws from
``stream(seed, "decision", h, p, k)``. A run therefore depends only on its
arguments, never on the global ``random`` state or on anything else running in
the process, and any hand can be replayed on its own.

That is also what makes shards exact: hands ``[start, stop)`` played anywhere
(another process, another order) give the same counts, and counts are integer
sums, so ``run(..., workers=4)`` equals ``run(..., workers=1)`` to the last chip.
"""

from __future__ import annotations

import dataclasses
import multiprocessing
from collections.abc import Callable, Iterator
from concurrent.futures import Executor, ProcessPoolExecutor

from ..bots import Bot, archetypes
from ..engine import Hand
from ..rng import shuffled_deck, stream
from .stats import StatsAccumulator
from .table import PlayerHandSummary, play_hand

# A representative 6-max field with every archetype present (TAG doubled as the
# benchmark/sixth seat). Stats aggregate by archetype across all seats.
DEFAULT_LINEUP = ["nit", "tag", "lag", "station", "maniac", "tag"]

# Decision 1: 5/10 blinds and 1,000-chip (100bb) stacks.
DEFAULT_BLINDS = (5, 10)
DEFAULT_STACK = 1000
DEFAULT_SHARD = 1000


def shard_spec(
    lineup: list[str] | None = None,
    seed: int = 0,
    blinds: tuple[int, int] = DEFAULT_BLINDS,
    starting_stack: int = DEFAULT_STACK,
    overrides: dict[str, dict[str, float]] | None = None,
) -> dict:
    """Everything a shard needs to play its hands: plain, picklable data."""
    return {
        "lineup": list(lineup or DEFAULT_LINEUP),
        "seed": seed,
        "blinds": tuple(blinds),
        "starting_stack": starting_stack,
        "overrides": dict(overrides or {}),
    }


def _bots(spec: dict) -> list[Bot]:
    """The lineup as bots. ``overrides`` maps an archetype key (``"tag"``,
    ``"station"``, …) to ``{field: value}`` pairs applied to every instance of
    that archetype; the caller validates which knobs are tunable."""

    def build(name: str) -> Bot:
        params = archetypes.make(name)
        ov = spec["overrides"].get(name.lower().replace(" ", ""))
        if ov:
            params = dataclasses.replace(params, **ov)
        return Bot(params)

    return [build(name) for name in spec["lineup"]]


def _play(
    spec: dict,
    bots: list[Bot],
    h: int,
    observer=None,
    on_end: Callable[[Hand, list[int]], None] | None = None,
) -> list[PlayerHandSummary]:
    """Play hand ``h`` of the run described by ``spec``."""
    seed = spec["seed"]

    def decision_rng(player: int, k: int):
        return stream(seed, "decision", h, player, k)

    return play_hand(
        bots, h % len(bots), decision_rng, blinds=spec["blinds"],
        starting_stack=spec["starting_stack"], observer=observer,
        deck=shuffled_deck(stream(seed, "deck", h)), on_end=on_end,
    )


def iter_hands(
    spec: dict, start: int, stop: int, on_end: Callable[[Hand, list[int]], None] | None = None,
) -> Iterator[list[PlayerHandSummary]]:
    """The summaries of hands ``start .. stop - 1``, one hand at a time."""
    bots = _bots(spec)
    for h in range(start, stop):
        yield _play(spec, bots, h, on_end=on_end)


def run_shard(spec: dict, start: int, stop: int) -> dict[str, dict[str, int]]:
    """Play hands ``[start, stop)`` and return their raw counts. A top-level
    function of plain data, so a process pool can run it."""
    acc = StatsAccumulator(big_blind=spec["blinds"][1])
    for summaries in iter_hands(spec, start, stop):
        acc.add_hand(summaries)
    return acc.to_counts()


def shard_bounds(hands: int, shard_size: int) -> list[tuple[int, int]]:
    size = max(1, int(shard_size))
    return [(lo, min(lo + size, hands)) for lo in range(0, hands, size)]


def process_pool(workers: int) -> ProcessPoolExecutor:
    """A pool of fresh interpreters. Spawn, not fork: the API server is threaded,
    and forking a threaded process can copy a held lock into the child."""
    return ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("spawn"))


def run(
    hands: int,
    lineup: list[str] | None = None,
    seed: int = 0,
    blinds: tuple[int, int] = DEFAULT_BLINDS,
    starting_stack: int = DEFAULT_STACK,
    progress_every: int | None = None,
    overrides: dict[str, dict[str, float]] | None = None,
    observer=None,
    workers: int = 1,
    shard_size: int = DEFAULT_SHARD,
    on_progress: Callable[[int], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
    executor: Executor | None = None,
) -> StatsAccumulator:
    """Simulate ``hands`` hands among ``lineup``.

    ``workers > 1`` plays shards of ``shard_size`` hands in a process pool (or on
    ``executor``) and merges them in order; the result is identical to one
    worker. ``on_progress(hands_done)`` is called after each shard, and
    ``cancelled()`` is checked before each one (a cancelled run returns the
    shards merged so far). An ``observer`` sees every decision, so it needs
    ``workers == 1``.
    """
    spec = shard_spec(lineup, seed, blinds, starting_stack, overrides)
    acc = StatsAccumulator(big_blind=blinds[1])
    bounds = shard_bounds(hands, shard_size)

    if workers > 1 or executor is not None:
        if observer is not None:
            raise ValueError("an observer sees every decision, so it needs workers == 1")
        pool = executor or process_pool(workers)
        try:
            futures = [pool.submit(run_shard, spec, lo, hi) for lo, hi in bounds]
            for (lo, hi), fut in zip(bounds, futures):
                if cancelled is not None and cancelled():
                    for f in futures:
                        f.cancel()
                    break
                acc.merge(fut.result())
                if on_progress is not None:
                    on_progress(hi)
        finally:
            if executor is None:
                pool.shutdown(cancel_futures=True)
        return acc

    bots = _bots(spec)
    for lo, hi in bounds:
        if cancelled is not None and cancelled():
            break
        for h in range(lo, hi):
            acc.add_hand(_play(spec, bots, h, observer=observer))
            if progress_every and (h + 1) % progress_every == 0:
                print(f"  ...{h + 1:,} hands")
        if on_progress is not None:
            on_progress(hi)
    return acc
