"""Compare frozen candidates in separate processes; no provider call or sleep.

Run from the ticket clone with MODE SERVER_SNAPSHOT arguments. Measures real
SQLite host admission and the moved registration/invoker construction only.
"""
from pathlib import Path
import hashlib
import json
import os
import statistics
import sys
import tempfile
import time

root = Path.cwd()
mode, snapshot = sys.argv[1:]
snapshot = Path(snapshot).resolve()
installed = root / ".local/ticket-349-live-timing/installed-wheel"
os.environ["UNCHAIN_SOURCE_PATH"] = str(installed)
sys.path[:0] = [str(snapshot), str(installed),
                str(root / ".local/ticket-349-cache-checkpoint/extra312"),
                str(root / "unchain_runtime/server/tests")]
import pytest
import memory_v2_background_worker as background
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
from test_memory_v2_unchain_graph_root_completion import _active_bridge, _run
from unchain.runtime.runtime_protocol import runtime_protocol_manifest

rows = []
for repetition in range(31):
    with tempfile.TemporaryDirectory(prefix="pupu349-defer-") as directory:
        patch = pytest.MonkeyPatch()
        patch.setattr(background, "_DISPATCHER", None)
        real_register = background.register_background_host
        marks = {"register_ms": 0, "invoker_ms": 0}
        def register(**kwargs):
            start = time.perf_counter()
            try:
                return real_register(**kwargs)
            finally:
                marks["register_ms"] += (time.perf_counter() - start) * 1000
        class Factory(PupuOfficialMemoryAgentInvokerFactory):
            def __call__(self, codec):
                start = time.perf_counter()
                try:
                    return super().__call__(codec)
                finally:
                    marks["invoker_ms"] += (time.perf_counter() - start) * 1000
        patch.setattr(background, "register_background_host", register)
        try:
            for turn in (1, 2):
                marks.update(register_ms=0, invoker_ms=0)
                start = time.perf_counter()
                bridge = _active_bridge(Path(directory), patch, run=_run(
                    execution_id="defer-bench-execution", attempt_id=f"defer-bench-{turn}",
                    content="synthetic benchmark input"), owner_chat_id="defer-bench-chat",
                    invoker_factory=Factory(options={}, provider="ollama", model_id="test-model"))
                admission_ms = (time.perf_counter() - start) * 1000
                before = dict(marks)
                deferred_ms = None
                if mode == "after":
                    assert before == {"register_ms": 0, "invoker_ms": 0}
                    start = time.perf_counter()
                    # Isolate moved setup. Correct terminal/enqueue ordering is
                    # separately exercised by real normal/graph contract tests.
                    bridge.preparation.host_factory.prepare_memory_completion()
                    deferred_ms = (time.perf_counter() - start) * 1000
                rows.append(dict(repetition=repetition, warmup=repetition == 0, turn=turn,
                                 admission_ms=admission_ms, deferred_ms=deferred_ms, **before))
        finally:
            patch.undo()

summary = []
for turn in (1, 2):
    selected = [row for row in rows if row["turn"] == turn and not row["warmup"]]
    summary.append(dict(turn=turn, samples=len(selected), **{
        key: round(statistics.median(row[key] for row in selected), 4)
        for key in ("admission_ms", "register_ms", "invoker_ms")},
        deferred_ms=(round(statistics.median(row["deferred_ms"] for row in selected), 4)
                     if mode == "after" else None)))
identity = json.loads((snapshot.parent / "identity.json").read_text())
assert hashlib.sha256(Path(identity["wheel_path"]).read_bytes()).hexdigest() == identity["wheel_sha256"]
print(json.dumps(dict(mode=mode, kind="real SQLite preparation; no model/network/artificial delay",
                     manifest=runtime_protocol_manifest()["manifest_digest"], candidate=identity,
                     summary=summary, samples=rows), indent=2))
