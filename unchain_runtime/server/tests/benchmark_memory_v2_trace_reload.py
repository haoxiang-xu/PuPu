#!/usr/bin/env python3
"""Deterministic acceptance benchmark for Memory V2 journal reload.

This is intentionally not named ``test_*.py``: populating the canonical store
through its public append API is realistic but too expensive for every unit-test
run. Execute it explicitly from ``unchain_runtime/server``:

    ../../../unchain/.venv/bin/python \
      tests/benchmark_memory_v2_trace_reload.py

The measured region reads all event payloads in 500-event pages, validates the
cursor chain, and serializes every response as compact JSON (the work performed
before an Electron/UI consumer can project the reloaded Trace). Fixture writes,
warmups, and garbage collection before each sample are outside the measurement.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import platform
import sqlite3
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Sequence


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from memory_v2_store import MAX_PAGE_SIZE, MemoryV2Store  # noqa: E402


OWNER_CHAT_ID = "trace_reload_benchmark_chat"
SESSION_ID = "trace_reload_benchmark_session"
ATTEMPT_ID = "trace_reload_benchmark_attempt"
PAYLOAD_TEXT = "memory-v2-trace-reload-" + ("x" * 192)


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be a positive integer")
    return parsed


def _non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be a non-negative integer")
    return parsed


def _positive_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed) or parsed <= 0:
        raise argparse.ArgumentTypeError("value must be a positive finite number")
    return parsed


def _page_size(value: str) -> int:
    parsed = _positive_int(value)
    if parsed > MAX_PAGE_SIZE:
        raise argparse.ArgumentTypeError(
            f"value must not exceed the store limit ({MAX_PAGE_SIZE})"
        )
    return parsed


def _nearest_rank_percentile(samples: Sequence[float], percentile: float) -> float:
    if not samples:
        raise ValueError("at least one sample is required")
    ordered = sorted(float(sample) for sample in samples)
    rank = max(1, math.ceil(percentile * len(ordered)))
    return ordered[rank - 1]


def _populate_fixture(store: MemoryV2Store, event_count: int) -> float:
    started = time.perf_counter()
    for index in range(event_count):
        store.append_semantic_event(
            owner_chat_id=OWNER_CHAT_ID,
            session_id=SESSION_ID,
            attempt_id=ATTEMPT_ID,
            event={
                "event_id": f"trace_reload_evt_{index + 1:05d}",
                "type": "trace.reload.sample",
                "seq": index + 1,
                "run_id": "trace_reload_benchmark_run",
                "payload": {
                    "index": index,
                    "phase": index % 8,
                    "summary": PAYLOAD_TEXT,
                },
            },
        )
    return (time.perf_counter() - started) * 1000.0


def _reload_once(
    store: MemoryV2Store,
    *,
    expected_events: int,
    page_size: int,
) -> dict[str, Any]:
    after = 0
    pages = 0
    events_seen = 0
    encoded_bytes = 0
    last_cursor = 0
    digest = hashlib.sha256()

    while True:
        page = store.load_events(
            owner_chat_id=OWNER_CHAT_ID,
            after=after,
            limit=page_size,
            include_payload=True,
        )
        encoded_bytes += len(
            json.dumps(
                page,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        )
        pages += 1
        records = page["events"]
        for record in records:
            cursor = int(record["cursor"])
            if cursor <= last_cursor:
                raise AssertionError("journal cursor did not increase monotonically")
            last_cursor = cursor
            digest.update(str(record["event_id"]).encode("utf-8"))
            digest.update(str(record["payload_hash"]).encode("ascii"))
            if record.get("event", {}).get("payload", {}).get("index") != events_seen:
                raise AssertionError("journal payload order or content changed")
            events_seen += 1

        next_after = int(page["next_after"])
        if records and next_after <= after:
            raise AssertionError("journal pagination cursor stalled")
        after = next_after
        if not page["has_more"]:
            break

    expected_pages = math.ceil(expected_events / page_size)
    if events_seen != expected_events or pages != expected_pages:
        raise AssertionError(
            f"expected {expected_events} events/{expected_pages} pages, "
            f"received {events_seen} events/{pages} pages"
        )
    return {
        "events": events_seen,
        "pages": pages,
        "encoded_bytes": encoded_bytes,
        "last_cursor": last_cursor,
        "digest": digest.hexdigest(),
    }


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", type=_positive_int, default=10_000)
    parser.add_argument("--page-size", type=_page_size, default=MAX_PAGE_SIZE)
    parser.add_argument("--warmups", type=_non_negative_int, default=5)
    parser.add_argument("--samples", type=_positive_int, default=30)
    parser.add_argument("--threshold-ms", type=_positive_float, default=500.0)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    with tempfile.TemporaryDirectory(prefix="pupu-trace-reload-") as directory:
        store = MemoryV2Store(Path(directory))
        fixture_ms = _populate_fixture(store, args.events)

        expected_result = None
        for _ in range(args.warmups):
            result = _reload_once(
                store,
                expected_events=args.events,
                page_size=args.page_size,
            )
            expected_result = expected_result or result
            if result != expected_result:
                raise AssertionError("warmup reloads were not deterministic")

        samples_ms: list[float] = []
        for _ in range(args.samples):
            gc.collect()
            started = time.perf_counter()
            result = _reload_once(
                store,
                expected_events=args.events,
                page_size=args.page_size,
            )
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            expected_result = expected_result or result
            if result != expected_result:
                raise AssertionError("measured reloads were not deterministic")
            samples_ms.append(elapsed_ms)

        p95_ms = _nearest_rank_percentile(samples_ms, 0.95)
        status = store.status()
        report = {
            "benchmark": "memory_v2_trace_reload_10k",
            "result": "pass" if p95_ms < args.threshold_ms else "fail",
            "threshold": {
                "metric": "p95_ms",
                "comparison": "strictly_less_than",
                "value": args.threshold_ms,
            },
            "workload": {
                "events": args.events,
                "page_size": args.page_size,
                "pages_per_reload": expected_result["pages"],
                "include_payload": True,
                "json_serialization": True,
                "encoded_bytes_per_reload": expected_result["encoded_bytes"],
                "payload_text_bytes": len(PAYLOAD_TEXT.encode("utf-8")),
                "fixture_build_ms": round(fixture_ms, 3),
                "warmups": args.warmups,
                "samples": args.samples,
            },
            "timing_ms": {
                "minimum": round(min(samples_ms), 3),
                "median": round(statistics.median(samples_ms), 3),
                "p95": round(p95_ms, 3),
                "maximum": round(max(samples_ms), 3),
                "samples": [round(sample, 3) for sample in samples_ms],
            },
            "integrity": {
                "events": expected_result["events"],
                "last_cursor": expected_result["last_cursor"],
                "digest": expected_result["digest"],
            },
            "environment": {
                "platform": platform.platform(),
                "machine": platform.machine(),
                "cpu_count": os.cpu_count(),
                "python": platform.python_version(),
                "python_implementation": platform.python_implementation(),
                "sqlite": sqlite3.sqlite_version,
                "journal_mode": status["journal_mode"],
                "database_bytes": store.db_path.stat().st_size,
            },
            "scope": {
                "included": [
                    "SQLite WAL event paging",
                    "event object integrity verification",
                    "payload JSON decoding",
                    "page JSON serialization",
                    "cursor and payload-order validation",
                ],
                "excluded": [
                    "HTTP socket transport",
                    "Electron IPC structured cloning",
                    "React rendering",
                    "cold filesystem cache",
                ],
            },
        }
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
