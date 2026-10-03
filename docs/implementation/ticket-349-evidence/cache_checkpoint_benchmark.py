"""Checkpoint A/B: fixed imported wheel, untraced timings, separate SQL/memory probes.

SQL bytes mean UTF-8 textual values / raw BLOB bytes returned to Python, NOT
disk bytes, SQLite pages, query text, or network traffic. Transaction counts
classify explicit BEGIN IMMEDIATE as write and BEGIN as read. Tracing never
runs inside the performance samples. No provider or network is invoked.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import asdict
import gc
import hashlib
import json
from pathlib import Path
import platform
import sqlite3
import sys
import tempfile
import tracemalloc

import unchain
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
from cache_checkpoint_fixture import fixture, context_sample, summarize


@contextmanager
def sql_metrics():
    counts = dict(read_transactions=0, write_transactions=0, selects=0,
                  write_statements=0, changed_rows_including_triggers=0,
                  returned_rows=0, returned_value_bytes=0)
    original = sqlite3.connect

    class Cursor(sqlite3.Cursor):
        def execute(self, sql, parameters=()):
            verb = sql.lstrip().upper()
            if verb.startswith('BEGIN'):
                counts['write_transactions' if 'IMMEDIATE' in verb else 'read_transactions'] += 1
            if verb.startswith('SELECT') or verb.startswith('WITH'):
                counts['selects'] += 1
            if verb.startswith(('INSERT', 'UPDATE', 'DELETE', 'REPLACE')):
                counts['write_statements'] += 1
            before = self.connection.total_changes
            result = super().execute(sql, parameters)
            counts['changed_rows_including_triggers'] += self.connection.total_changes - before
            return result

        def counted(self, row):
            if row is not None:
                counts['returned_rows'] += 1
                counts['returned_value_bytes'] += sum(
                    len(v) if isinstance(v, bytes) else len(str(v).encode('utf-8'))
                    for v in row if v is not None)
            return row

        def fetchone(self):
            return self.counted(super().fetchone())

        def fetchall(self):
            return [self.counted(row) for row in super().fetchall()]

        def fetchmany(self, size=None):
            rows = super().fetchmany() if size is None else super().fetchmany(size)
            return [self.counted(row) for row in rows]

        def __next__(self):
            return self.counted(super().__next__())

    class Connection(sqlite3.Connection):
        def cursor(self, factory=Cursor):
            return super().cursor(factory)

        def execute(self, sql, parameters=()):
            return self.cursor().execute(sql, parameters)

    def connect(*args, **kwargs):
        kwargs['factory'] = Connection
        return original(*args, **kwargs)

    sqlite3.connect = connect
    try:
        yield counts
    finally:
        sqlite3.connect = original


def diagnostic(root, turns, tail, enabled):
    with sql_metrics() as setup:
        parts = fixture(root, turns, after_tool=tail, cache_enabled=enabled)
    if not tail:
        context_sample(*parts)
    cache = parts[1]._journal_snapshot_source
    before = asdict(cache.metrics()) if enabled else None
    with sql_metrics() as sql:
        sample = context_sample(*parts)
    after = asdict(cache.metrics()) if enabled else None
    if enabled:
        snapshot_bytes = len(json.dumps(cache._snapshot.to_dict(), ensure_ascii=False,
                                       sort_keys=True, separators=(',', ':')).encode())
    else:
        snapshot_bytes = 0
    gc.collect()
    tracemalloc.start()
    context_sample(*parts)
    retained, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    # Separate acquisition probe: allocations still owned by the cache after
    # capture, and its transient peak. Excludes pre-existing journal objects.
    cache_allocations = None
    if enabled:
        cache.invalidate()
        gc.collect()
        tracemalloc.start()
        cache.capture_snapshot()
        cache_retained, cache_peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        cache_allocations = dict(retained_bytes=cache_retained, peak_bytes=cache_peak)
    return dict(sql=sql, fixture_setup_sql=setup, journal_counts=sample,
                cache_metrics_delta={k: after[k] - before[k] for k in before} if enabled else None,
                cached_snapshot_serialized_bytes=snapshot_bytes,
                warm_build_allocations=dict(retained_bytes=retained, peak_bytes=peak),
                cache_acquisition_allocations=cache_allocations)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples', type=int, default=100)
    parser.add_argument('--warmups', type=int, default=10)
    parser.add_argument('--turns', type=int, nargs='+', default=[1, 25, 100])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    imported = str(unchain.__file__)
    assert '.whl/' in imported, imported
    wheel = Path(imported.split('.whl/')[0] + '.whl')
    result = dict(python=platform.python_version(), imported_from=imported,
                  wheel_sha256=hashlib.sha256(wheel.read_bytes()).hexdigest(),
                  manifest=runtime_protocol_manifest(), samples=args.samples,
                  warmups=args.warmups, cells=[])
    with tempfile.TemporaryDirectory(prefix='349-checkpoint-') as folder:
        root = Path(folder)
        for turns in args.turns:
            for tail in (False, True):
                # Alternate mode order across history sizes; no parallel load.
                for enabled in ((False, True) if turns != 25 else (True, False)):
                    name = f'{turns}-{tail}-{enabled}'
                    samples = []
                    if not tail:
                        parts = fixture(root / name, turns, cache_enabled=enabled)
                    for index in range(args.warmups + args.samples):
                        if tail:
                            parts = fixture(root / name / str(index), turns,
                                            after_tool=True, cache_enabled=enabled)
                        gc.collect()
                        sample = context_sample(*parts)
                        if index >= args.warmups:
                            samples.append(sample)
                    cell = dict(turns=turns, scenario='tool_continuation' if tail else 'unchanged_history',
                                cache_enabled=enabled, summary=summarize(samples), raw_samples=samples,
                                diagnostics=diagnostic(root / ('diag-' + name), turns, tail, enabled))
                    result['cells'].append(cell)
                    args.output.write_text(json.dumps(result, indent=2) + '\n')
                    print(name, cell['summary']['total_ms'], flush=True)


if __name__ == '__main__':
    main()
