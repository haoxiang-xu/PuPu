#!/usr/bin/env python3
"""Export synthetic context-v2 goldens from the current PuPu P0 producers."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SERVER_ROOT = REPOSITORY_ROOT / "unchain_runtime" / "server"
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

try:
    import unchain  # noqa: F401
except ModuleNotFoundError as exc:
    if exc.name != "unchain":
        raise
    raise SystemExit(
        "Unable to import 'unchain'; run this exporter with the target "
        "Unchain checkout's virtual-environment Python."
    ) from exc

from memory_v2_context import (  # noqa: E402
    ContextBuildEnvelope,
    MemoryV2Admission,
    _journal_bootstrap_messages,
    _neutral_context_payload,
    compile_context_envelope,
    persist_memory_v2_semantic_event,
)
from memory_v2_curator import MemoryV2Curator  # noqa: E402
from memory_v2_legacy_adapter import LegacyV1LongTermAdapter  # noqa: E402


SOURCE_ALLOWLIST = (
    "unchain_runtime/server/memory_v2_context.py",
    "unchain_runtime/server/memory_v2_curator.py",
    "unchain_runtime/server/memory_v2_legacy_adapter.py",
    "unchain_runtime/server/memory_v2_rollout.py",
    "unchain_runtime/server/memory_v2_sanitizer.py",
    "unchain_runtime/server/memory_v2_toolkit.py",
)
FIXTURE_SCHEMA = "unchain.context_v2.fixture.v1"
PROJECTION_SCHEMA = "unchain.context_v2.comparable.v1"


class _CaptureRuntime:
    """Controlled equivalent of the context tests' fake durable runtime."""

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    def append_semantic_event(self, **kwargs: Any) -> dict[str, Any]:
        event = copy.deepcopy(kwargs["event"])
        self.events.append(event)
        return {"event_id": event.get("event_id", f"event-{len(self.events):03d}")}

    def record_artifact(self, **kwargs: Any) -> dict[str, Any]:
        call_id = str(kwargs.get("artifact", {}).get("call_id") or "synthetic")
        return {"content_ref": f"pupu://artifact/{call_id}@1"}

    def load_events(self, **_kwargs: Any) -> dict[str, Any]:
        return {"events": [], "next_after": 0, "has_more": False}

    def get_task_state(self, **_kwargs: Any) -> dict[str, Any]:
        return {}

    def list_pending_task_inputs(self, **_kwargs: Any) -> dict[str, Any]:
        return {"pending_task_inputs": []}

    def mark_attempt_outcome(self, **kwargs: Any) -> dict[str, Any]:
        return {"capture_outcome": kwargs["outcome"]}

    def record_checkpoint(self, **_kwargs: Any) -> dict[str, Any]:
        return {"checkpoint_ref": "pupu://context/checkpoint/synthetic"}

    def record_context_build(self, **_kwargs: Any) -> dict[str, Any]:
        return {"event_id": "context-build-001"}

    def record_handoff(self, **_kwargs: Any) -> dict[str, Any]:
        return {"event_id": "handoff-001"}

    def create_candidate(self, **_kwargs: Any) -> dict[str, Any]:
        return {"candidate_id": "candidate-001"}


class _PartialCaptureRuntime:
    """Minimal controlled seam from the curator partial-source test."""

    def __init__(self, job: dict[str, Any]) -> None:
        self.job = copy.deepcopy(job)

    def list_consolidation_jobs(self, **_kwargs: Any) -> dict[str, Any]:
        return {"jobs": [copy.deepcopy(self.job)]}

    def get_capture_task_state(self, **_kwargs: Any) -> dict[str, Any]:
        return {"capture_quality": "partial"}

    def fail_consolidation_job(self, **kwargs: Any) -> dict[str, Any]:
        terminal = copy.deepcopy(self.job)
        terminal.update(
            {
                "status": "failed",
                "revision": int(terminal["revision"]) + 1,
                "error_code": kwargs["error_code"],
            }
        )
        self.job = terminal
        return copy.deepcopy(terminal)


def _admission(runtime: Any = None, *, window: int = 200_000) -> MemoryV2Admission:
    output_reserve = 32_000
    transport_margin = 1_024
    available = window - output_reserve - transport_margin
    return MemoryV2Admission(
        requested_mode="all",
        effective_rollout_mode="all",
        mode="active",
        reason="golden_fixture",
        provider="fixture",
        model="fixture",
        owner_chat_id="chat-fixture",
        session_id="session-fixture",
        attempt_id="attempt-fixture",
        source_attempt_id="",
        real_context_window_tokens=window,
        output_reserve_tokens=output_reserve,
        transport_margin_tokens=transport_margin,
        available_input_tokens=available,
        compression_threshold_tokens=max(1, int(available * 0.9)),
        declared_context_window_tokens=window,
        context_window_source="golden_fixture",
        runtime=runtime,
    )


def _to_pupu_ref(value: dict[str, Any]) -> str:
    kind = value["kind"]
    identifier = value["id"]
    revision = int(value["revision"])
    if kind == "context_event":
        return f"pupu://context/event/{identifier}/content"
    return f"pupu://{kind}/{identifier}@{revision}"


def _structured_ref(value: str) -> dict[str, Any] | str:
    context_match = re.fullmatch(r"pupu://context/event/([^/]+)/content", value)
    if context_match:
        return {"kind": "context_event", "id": context_match.group(1), "revision": 1}
    versioned_match = re.fullmatch(r"pupu://([^/]+)/(.+)@([1-9][0-9]*)", value)
    if versioned_match:
        return {
            "kind": versioned_match.group(1),
            "id": versioned_match.group(2),
            "revision": int(versioned_match.group(3)),
        }
    return value


def _provider_neutral(value: Any) -> Any:
    if isinstance(value, str):
        return _structured_ref(value)
    if isinstance(value, dict):
        return {key: _provider_neutral(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_provider_neutral(item) for item in value]
    return copy.deepcopy(value)


def _pending_input(record: dict[str, Any]) -> dict[str, Any]:
    preview = str(record["preview"])
    return {
        "event_id": record["event_id"],
        "store_seq": record["store_seq"],
        "type": record["type"],
        "preview": preview,
        "preview_truncated": False,
        "content_ref": _to_pupu_ref(record["content_ref"]),
        "content_bytes": len(preview.encode("utf-8")),
        "content_sha256": hashlib.sha256(preview.encode("utf-8")).hexdigest(),
        "inline": False,
    }


def _below_pressure_case() -> dict[str, Any]:
    semantic_history = []
    for pair_index in range(1, 7):
        user_content = (
            "Constraint: retain all current-generation semantic history."
            if pair_index == 1
            else f"Synthetic user turn {pair_index}."
        )
        semantic_history.extend(
            [
                {
                    "role": "user",
                    "content": user_content,
                    "generation": "generation-0042",
                    "stable_id": f"msg-0042-{pair_index:02d}-user",
                },
                {
                    "role": "assistant",
                    "content": f"Synthetic assistant turn {pair_index} retained.",
                    "generation": "generation-0042",
                    "stable_id": f"msg-0042-{pair_index:02d}-assistant",
                },
            ]
        )
    fixture_input = {
        "schema": "unchain.context_v2.request.v1",
        "case": "below_pressure",
        "source_messages": semantic_history,
        "current_generation": "generation-0042",
        "fixed_overhead_tokens": 100,
    }
    envelope = ContextBuildEnvelope(
        mode="active",
        owner_chat_id="chat-fixture",
        session_id="session-fixture",
        attempt_id="attempt-fixture",
        run_id="run-below-pressure",
        agent_id="developer",
        provider="fixture",
        model="fixture",
        iteration=0,
        source_messages=tuple(copy.deepcopy(fixture_input["source_messages"])),
        fixed_overhead_tokens=fixture_input["fixed_overhead_tokens"],
    )
    result = compile_context_envelope(envelope, _admission())
    expected = {
        "schema": PROJECTION_SCHEMA,
        "compression_applied": result.diagnostics["compacted"],
        "messages": _provider_neutral(result.messages),
        "retained_stable_ids": [
            message["stable_id"] for message in result.messages if message.get("stable_id")
        ],
    }
    return {
        "schema": FIXTURE_SCHEMA,
        "case": "below_pressure",
        "source_contracts": [
            {
                "path": "unchain_runtime/server/memory_v2_context.py",
                "symbol": "compile_context_envelope",
            },
            {
                "path": "unchain_runtime/server/tests/test_memory_v2_context.py",
                "symbol": "test_compiler_uses_checkpoint_only_under_pressure_and_keeps_current_user",
            },
        ],
        "input": fixture_input,
        "expected": expected,
    }


def _tool_and_pinned_case() -> dict[str, Any]:
    fixture_input = {
        "schema": "unchain.context_v2.request.v1",
        "case": "tool_and_pinned",
        "source_messages": [
            {"role": "user", "content": "current native request", "stable_id": "msg-current"}
        ],
        "semantic_events": [
            {
                "type": "tool_call",
                "event_id": "evt-call-closed-001",
                "run_id": "run-tool",
                "call_id": "call-closed-001",
                "tool_name": "lookup",
                "arguments": {"query": "synthetic closed query"},
            },
            {
                "type": "tool_result",
                "event_id": "evt-result-closed-001",
                "run_id": "run-tool",
                "call_id": "call-closed-001",
                "tool_name": "lookup",
                "synthetic_result": {"field": "text", "fill": "x", "char_count": 20_000},
            },
            {
                "type": "tool_call",
                "event_id": "evt-call-open-001",
                "run_id": "run-tool",
                "call_id": "call-open-001",
                "tool_name": "lookup",
                "arguments": {"query": "synthetic open query"},
            },
            {
                "type": "interaction_requested",
                "event_id": "evt-interaction-001",
                "content_ref": {"kind": "artifact", "id": "interaction-001", "revision": 1},
                "interaction_request": {
                    "interaction_id": "interaction-001",
                    "kind": "tool_approval",
                    "payload": {"call_id": "call-open-001"},
                },
            },
        ],
        "task_state": {
            "stable_id": "task-state-001",
            "objective": "Finish the synthetic export",
            "status": "in_progress",
            "revision": 3,
        },
        "pending_task_inputs": [
            {
                "event_id": "pending-decision-001",
                "store_seq": 8,
                "type": "message.user",
                "preview": "earlier uncovered decision",
                "content_ref": {
                    "kind": "context_event",
                    "id": "pending-decision-001",
                    "revision": 1,
                },
            },
            {
                "event_id": "pending-current-001",
                "store_seq": 9,
                "type": "message.user",
                "preview": "current native request",
                "content_ref": {
                    "kind": "context_event",
                    "id": "pending-current-001",
                    "revision": 1,
                },
            }
        ],
    }
    runtime = _CaptureRuntime()
    admission = _admission(runtime)
    for contract_event in fixture_input["semantic_events"]:
        event = copy.deepcopy(contract_event)
        synthetic_result = event.pop("synthetic_result", None)
        if synthetic_result is not None:
            event["result"] = {
                synthetic_result["field"]: synthetic_result["fill"]
                * int(synthetic_result["char_count"])
            }
        if isinstance(event.get("content_ref"), dict):
            event["content_ref"] = _to_pupu_ref(event["content_ref"])
        persist_memory_v2_semantic_event(admission, event)

    pending_inputs = tuple(_pending_input(item) for item in fixture_input["pending_task_inputs"])
    envelope = ContextBuildEnvelope(
        mode="active",
        owner_chat_id="chat-fixture",
        session_id="session-fixture",
        attempt_id="attempt-fixture",
        run_id="run-tool",
        agent_id="developer",
        provider="fixture",
        model="fixture",
        iteration=1,
        source_messages=tuple(copy.deepcopy(fixture_input["source_messages"])),
        journal_events=tuple(copy.deepcopy(runtime.events)),
        task_state=copy.deepcopy(fixture_input["task_state"]),
        pending_task_inputs=pending_inputs,
    )
    compiled = compile_context_envelope(envelope, admission)
    neutral = _neutral_context_payload(envelope, native_call_ids=set())
    persisted_result = next(event for event in runtime.events if event["type"] == "tool_result")
    open_calls = neutral.get("unfinished_tool_pairs", [])
    mandatory_ids = [item["call_id"] for item in open_calls if item.get("call_id")]
    mandatory_ids.extend(item["event_id"] for item in pending_inputs)
    pending_interaction = neutral.get("pending_interaction", {})
    request = pending_interaction.get("request", {}).get("interaction_request", {})
    if request.get("interaction_id"):
        mandatory_ids.append(request["interaction_id"])
    produced_task_state = neutral["pinned_task_state"]
    if produced_task_state.get("stable_id"):
        mandatory_ids.append(produced_task_state["stable_id"])
    expected = {
        "schema": PROJECTION_SCHEMA,
        "compression_applied": compiled.diagnostics["compacted"],
        "closed_tool_exchanges": _provider_neutral(
            [
                {
                    "call_id": persisted_result["call_id"],
                    "tool_name": persisted_result["tool_name"],
                    "result": persisted_result["result"],
                    "result_bytes": persisted_result["result_bytes"],
                    "result_sha256": persisted_result["result_sha256"],
                    "full_output_ref": persisted_result["full_output_ref"],
                }
            ]
        ),
        "open_tool_calls": _provider_neutral(open_calls),
        "atomic_call_ids": sorted(
            item["call_id"] for item in open_calls if item.get("call_id")
        ),
        "pinned_task_state": _provider_neutral(produced_task_state),
        "pending_task_inputs": _provider_neutral(neutral["pending_task_inputs"]),
        "pending_interaction": _provider_neutral(pending_interaction),
        "mandatory_ids": mandatory_ids,
    }
    return {
        "schema": FIXTURE_SCHEMA,
        "case": "tool_and_pinned",
        "source_contracts": [
            {
                "path": "unchain_runtime/server/memory_v2_context.py",
                "symbol": "persist_memory_v2_semantic_event",
            },
            {
                "path": "unchain_runtime/server/memory_v2_context.py",
                "symbol": "compile_context_envelope",
            },
            {
                "path": "unchain_runtime/server/tests/test_memory_v2_context.py",
                "symbol": "test_tool_result_is_artifact_first_and_request_snapshot_is_compact",
            },
            {
                "path": "unchain_runtime/server/tests/test_memory_v2_context.py",
                "symbol": "test_pinned_v2_includes_uncovered_inputs_without_duplicating_current_user",
            },
        ],
        "input": fixture_input,
        "expected": expected,
    }


def _legacy_partial_case() -> dict[str, Any]:
    fixture_input = {
        "schema": "unchain.context_v2.request.v1",
        "case": "legacy_partial",
        "source_messages": [{"role": "user", "content": "current legacy-aware request"}],
        "legacy_profile": {
            "preferences": {"editor": "Synthetic editor", "theme": "dark"},
            "identity": {"display_name": "Synthetic Person"},
        },
        "legacy_query": "editor",
        "capture_quality": "partial",
    }
    profile = copy.deepcopy(fixture_input["legacy_profile"])
    with tempfile.TemporaryDirectory() as data_dir:
        adapter = LegacyV1LongTermAdapter(
            data_dir=data_dir,
            namespace="user:local",
            space_id="mem-space-fixture",
            _profile_loader=lambda _profiles_dir, _namespace: copy.deepcopy(profile),
        )
        legacy_search = adapter.search(query=fixture_input["legacy_query"], limit=5, min_score=0.8)

    job = {
        "job_id": "job-partial-001",
        "owner_chat_id": "chat-fixture",
        "session_id": "session-fixture",
        "attempt_id": "attempt-fixture",
        "job_type": "memory_curator",
        "status": "leased",
        "revision": 2,
        "lease_owner": "worker-fixture",
        "lease_token": "lease-job-partial-001",
    }
    partial_runtime = _PartialCaptureRuntime(job)
    curator_result = MemoryV2Curator(
        partial_runtime,
        agent_factory=lambda **_kwargs: (_ for _ in ()).throw(AssertionError("model invoked")),
        toolkit_factory=lambda *_args, **_kwargs: object(),
        clock_ms=lambda: 1_000,
    ).run_job(job=job, worker_id="worker-fixture")

    legacy_ref = legacy_search["results"][0]["ref"]
    envelope = ContextBuildEnvelope(
        mode="active",
        owner_chat_id="chat-fixture",
        session_id="session-fixture",
        attempt_id="attempt-fixture",
        run_id="run-legacy",
        agent_id="developer",
        provider="fixture",
        model="fixture",
        iteration=0,
        source_messages=tuple(copy.deepcopy(fixture_input["source_messages"])),
        handoff_messages=({"role": "user", "content": legacy_ref},),
    )
    compiled = compile_context_envelope(envelope, _admission())
    neutral = _neutral_context_payload(envelope, native_call_ids=set())
    noncanonical_legacy_event = {
        "type": "legacy.tool_result",
        "payload": {"message": {"role": "assistant", "content": "legacy result"}},
    }
    canonical_messages = _journal_bootstrap_messages([noncanonical_legacy_event])
    capture_quality = curator_result["reason"].removeprefix("source_capture_")
    expected = {
        "schema": PROJECTION_SCHEMA,
        "compression_applied": compiled.diagnostics["compacted"],
        "capture_quality": capture_quality,
        "legacy_references": _provider_neutral(legacy_search["results"]),
        "legacy_backend": legacy_search["backend"],
        "inherited_context": _provider_neutral(neutral["inherited_context"]),
        "canonical_tool_events": canonical_messages,
        "promotion_allowed": bool(canonical_messages),
        "curator": {
            "status": curator_result["status"],
            "reason": curator_result["reason"],
            "model_invoked": curator_result["audit"][0]["model_invoked"],
        },
    }
    return {
        "schema": FIXTURE_SCHEMA,
        "case": "legacy_partial",
        "source_contracts": [
            {
                "path": "unchain_runtime/server/memory_v2_legacy_adapter.py",
                "symbol": "LegacyV1LongTermAdapter.search",
            },
            {
                "path": "unchain_runtime/server/memory_v2_curator.py",
                "symbol": "MemoryV2Curator.run_job",
            },
            {
                "path": "unchain_runtime/server/memory_v2_context.py",
                "symbol": "_journal_bootstrap_messages",
            },
            {
                "path": "unchain_runtime/server/tests/test_memory_v2_curator.py",
                "symbol": "test_leased_job_from_partial_source_is_terminally_isolated_without_model",
            },
            {
                "path": "unchain_runtime/server/tests/test_memory_v2_legacy_adapter.py",
                "symbol": "test_search_is_reference_only_and_marks_legacy_provenance",
            },
        ],
        "input": fixture_input,
        "expected": expected,
    }


def _fixtures() -> dict[str, dict[str, Any]]:
    return {
        "below_pressure": _below_pressure_case(),
        "legacy_partial": _legacy_partial_case(),
        "tool_and_pinned": _tool_and_pinned_case(),
    }


def _canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _source_sha256() -> str:
    digest = hashlib.sha256()
    for relative_path in SOURCE_ALLOWLIST:
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update((REPOSITORY_ROOT / relative_path).read_bytes())
    return digest.hexdigest()


def _current_head_sha() -> str:
    actual = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if re.fullmatch(r"[0-9a-f]{40}", actual) is None:
        raise RuntimeError("PuPu HEAD is not a full 40-character Git SHA")
    return actual


def _source_is_dirty() -> bool:
    status = subprocess.run(
        [
            "git",
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--",
            *SOURCE_ALLOWLIST,
        ],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return bool(status.strip())


def export(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    fixtures = _fixtures()
    entries = []
    for case in sorted(fixtures):
        filename = f"{case}.json"
        raw = _canonical_bytes(fixtures[case])
        (output_dir / filename).write_bytes(raw)
        entries.append({"case": case, "file": filename, "sha256": hashlib.sha256(raw).hexdigest()})
    manifest = {
        "schema": "unchain.context_v2.golden.v1",
        "exporter_version": 1,
        "memory_schema_version": 4,
        "source": {
            "repository": "PuPu",
            "head_sha": _current_head_sha(),
            "dirty": _source_is_dirty(),
            "files": list(SOURCE_ALLOWLIST),
            "sha256": _source_sha256(),
        },
        "fixtures": entries,
    }
    (output_dir / "manifest.json").write_bytes(_canonical_bytes(manifest))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path)
    export(parser.parse_args().output_dir)


if __name__ == "__main__":
    main()
