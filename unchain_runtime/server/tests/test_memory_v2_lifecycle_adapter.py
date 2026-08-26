from __future__ import annotations

import base64
import copy
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
UNCHAIN_SRC = Path(__file__).resolve().parents[4] / "unchain" / "src"
for candidate in (SERVER_ROOT, UNCHAIN_SRC):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from context_memory_v2_capability import (  # noqa: E402
    ContextMemoryV2CapabilityVerdict,
)
import unchain_adapter as ua  # noqa: E402


_CAPABILITY_PATCHER = None


def setUpModule() -> None:
    global _CAPABILITY_PATCHER
    _CAPABILITY_PATCHER = mock.patch(
        "memory_v2_context.resolve_context_memory_v2_capability",
        return_value=ContextMemoryV2CapabilityVerdict(
            ready=True,
            reason="unchain_context_memory_ready",
            verification="exact_sha",
            immutable=True,
            unchain_revision="a" * 40,
        ),
    )
    _CAPABILITY_PATCHER.start()


def tearDownModule() -> None:
    if _CAPABILITY_PATCHER is not None:
        _CAPABILITY_PATCHER.stop()


from memory_v2_context import (  # noqa: E402
    ContextBuildEnvelope,
    bootstrap_memory_v2_current_request,
    compile_context_envelope,
    persist_memory_v2_semantic_event,
    resolve_memory_v2_admission,
)
from memory_v2_runtime import MemoryV2Runtime  # noqa: E402
from memory_v2_legacy_adapter import (  # noqa: E402
    LegacyV1CompositeRuntime,
    is_legacy_v1_memory_ref,
)
from memory_v2_store import MemoryV2Store  # noqa: E402
from memory_v2_toolkit import (  # noqa: E402
    MemoryV2ToolkitError,
    build_memory_v2_toolkit,
)


class MemoryV2LifecycleAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp.name)
        self.root_dir = self.data_dir / "memory_v2"
        self.store = MemoryV2Store(self.root_dir)
        self.runtime = MemoryV2Runtime(
            data_dir=self.data_dir,
            root_dir=self.root_dir,
            store=self.store,
        )
        self.env = mock.patch.dict(
            os.environ,
            {
                "PUPU_FEATURE_MEMORY_V2": "all",
                "PUPU_MEMORY_V2_MODE": "all",
            },
            clear=False,
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.store.close()
        self.temp.cleanup()

    def admission(self, attempt_id="attempt_a"):
        return resolve_memory_v2_admission(
            {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": "chat_a",
                "_memory_v2_attempt_id": attempt_id,
                "_memory_v2_runtime": self.runtime,
            },
            provider="openai",
            model="gpt-test",
            real_context_window_tokens=128_000,
            session_id="session_a",
        )

    def bootstrap(self, admission, content):
        return bootstrap_memory_v2_current_request(
            admission,
            {"role": "user", "content": content},
        )

    def test_failed_run_summary_projects_only_the_typed_canonical_carrier(self):
        from unchain.kernel.failure import attach_kernel_run_failure
        from unchain.run_bundle import (
            RunBundleReducer,
            RunIdentity,
            RunLifecycle,
        )

        failed_bundle = RunBundleReducer.reduce(
            identity=RunIdentity(
                execution_id="chat-failed",
                attempt_id="attempt-failed",
                root_run_id="run-failed",
                run_id="run-failed",
                parent_run_id=None,
                relation="root",
            ),
            lifecycle=RunLifecycle(
                status="failed",
                started_at="2026-08-14T00:00:00.000000000Z",
                completed_at="2026-08-14T00:00:01.000000000Z",
            ),
            receipts=(),
        )
        error = RuntimeError("secret provider payload")
        attach_kernel_run_failure(
            error,
            error_category="provider_runtime",
            error_code="provider_send_failed",
            run_bundle=failed_bundle,
        )

        summary = ua._failed_run_summary_event(
            error,
            admission=None,
            active_context_bridge=None,
            run_id="run-failed",
            iteration=1,
        )

        self.assertIsNotNone(summary)
        self.assertEqual(summary["type"], "stream_summary")
        self.assertEqual(summary["bundle"], failed_bundle.to_dict())
        self.assertEqual(summary["bundle"]["lifecycle"]["status"], "failed")
        self.assertNotIn("secret provider payload", json.dumps(summary["bundle"]))

    def write_legacy_profile(self, profile):
        from unchain.memory import JsonFileLongTermProfileStore

        profiles_dir = self.data_dir / "memory" / "long_term_profiles"
        store = JsonFileLongTermProfileStore(base_dir=profiles_dir)
        profile_path = store._path("user:local")
        profile_path.write_text(
            json.dumps(profile, ensure_ascii=False, sort_keys=True),
            encoding="utf-8",
        )
        return profile_path

    def test_normal_toolkit_pages_only_disclosed_durable_content_refs(self):
        admission = self.admission()
        self.bootstrap(admission, "Inspect the durable tool output")
        artifact = self.runtime.record_artifact(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            operation_id="test-readable-artifact",
            artifact={"kind": "tool_result_full_output"},
            content=b"durable output",
            mime_type="text/plain",
        )
        toolkits = ua._append_memory_v2_normal_toolkit(
            [],
            admission,
            run_id="attempt_a",
        )
        read = toolkits[0]._pupu_memory_v2_callables["context_content_read"]
        result = read(artifact["content_ref"], offset=0, limit=8)
        self.assertEqual(result["trust"], "UNTRUSTED_DATA")
        self.assertEqual(result["content"]["text"], "durable ")
        self.assertEqual(result["next_offset"], 8)

        argument_only_ref = "pupu://artifact/argument_only@1"
        self.runtime.append_semantic_event(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            event={
                "event_id": "argument_only_event",
                "type": "tool_call",
                "arguments": {"ref": argument_only_ref},
            },
            operation_id="test-argument-only-event",
        )
        with self.assertRaises(MemoryV2ToolkitError):
            read(argument_only_ref)

        self.runtime.bootstrap_current_request(
            owner_chat_id="chat_b",
            session_id="session_b",
            attempt_id="attempt_b",
            message={"role": "user", "content": "other chat"},
            operation_id="test-other-chat-bootstrap",
        )
        foreign = self.runtime.record_artifact(
            owner_chat_id="chat_b",
            session_id="session_b",
            attempt_id="attempt_b",
            operation_id="test-other-chat-artifact",
            artifact={"kind": "tool_result_full_output"},
            content=b"foreign output",
            mime_type="text/plain",
        )
        with self.assertRaises(MemoryV2ToolkitError):
            read(foreign["content_ref"])

    def test_first_message_recall_is_reference_only_untrusted_and_never_reads_content(self):
        long_term = self.runtime.ensure_space(
            scope_kind="long_term",
            scope_key="user:local",
            owner_chat_id="",
            namespace="user:local",
            name="user:local",
            description="Long-term memory",
            operation_id="test-long-term-space",
        )
        self.runtime.create_entry(
            owner_chat_id="chat_a",
            space_id=long_term["space_id"],
            path="/tea.md",
            kind="file",
            expected_space_revision=long_term["revision"],
            operation_id="test-long-term-entry",
            description="Preferred tea for planning future purchases",
            mime_type="text/markdown",
            content=b"PLAINTEXT_CONTENT_MUST_NOT_BE_RECALLED",
            created_by="test",
            allow_long_term=True,
            namespace="user:local",
        )
        admission = self.admission()
        message = {"role": "user", "content": "/tea.md"}
        receipt = self.bootstrap(admission, message["content"])
        with mock.patch.object(
            MemoryV2Runtime,
            "read_long_term_content",
            side_effect=AssertionError("recall must not read entry content"),
        ):
            summary = ua._prepare_memory_v2_first_message_recall(
                admission,
                message,
                receipt,
            )

        self.assertEqual(summary["status"], "InjectedReferences")
        self.assertEqual(summary["reference_count"], 1)
        self.assertFalse(summary["content_inlined"])
        self.assertEqual(len(admission.handoff_messages), 1)
        recall_message = admission.handoff_messages[0]
        self.assertEqual(recall_message["role"], "user")
        self.assertIn("UNTRUSTED_DATA", recall_message["content"])
        self.assertNotIn("PLAINTEXT_CONTENT_MUST_NOT_BE_RECALLED", recall_message["content"])
        toolkits = ua._append_memory_v2_normal_toolkit(
            [],
            admission,
            run_id="attempt_a",
        )
        read = toolkits[0]._pupu_memory_v2_callables["memory_read"]
        recalled_content = read(summary["input_refs"][0], limit=128)
        self.assertEqual(
            recalled_content["text"],
            "PLAINTEXT_CONTENT_MUST_NOT_BE_RECALLED",
        )
        denied_ref = (
            summary["input_refs"][0].rsplit("/", 1)[0]
            + "/entry_not_allowed@1"
        )
        with self.assertRaises(Exception):
            read(denied_ref, limit=128)
        events = self.runtime.load_events(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            include_payload=True,
        )["events"]
        self.assertIn("memory.recall.completed", [item["type"] for item in events])

    def test_first_message_recall_binds_legacy_refs_for_paginated_toolkit_read(self):
        marker = "LEGACY_PROFILE_CONTENT_MUST_REQUIRE_EXPLICIT_READ"
        profile_path = self.write_legacy_profile(
            {
                "preferences": {
                    "editor": "VS Code",
                    "notes": marker + ("x" * 180),
                }
            }
        )
        profiles_dir = profile_path.parent
        before_bytes = profile_path.read_bytes()
        before_files = sorted(path.name for path in profiles_dir.iterdir())
        admission = self.admission()
        message = {"role": "user", "content": "preferences"}
        receipt = self.bootstrap(admission, message["content"])
        ensure_calls = []
        original_ensure_space = MemoryV2Store.ensure_space

        def tracking_ensure_space(store_self, **arguments):
            ensure_calls.append(copy.deepcopy(arguments))
            return original_ensure_space(store_self, **arguments)

        with mock.patch.object(
            MemoryV2Store,
            "ensure_space",
            tracking_ensure_space,
        ):
            summary = ua._prepare_memory_v2_first_message_recall(
                admission,
                message,
                receipt,
            )
            first_runtime = admission.runtime
            rebound = ua._memory_v2_bind_legacy_v1_runtime(admission)

        self.assertEqual(summary["status"], "InjectedReferences")
        self.assertEqual(summary["reference_count"], 1)
        legacy_ref = summary["input_refs"][0]
        self.assertTrue(is_legacy_v1_memory_ref(legacy_ref))
        self.assertIsInstance(first_runtime, LegacyV1CompositeRuntime)
        self.assertIs(rebound, first_runtime)
        self.assertIs(admission.runtime, first_runtime)
        binding_calls = [
            call
            for call in ensure_calls
            if call.get("scope_kind") == "long_term"
        ]
        self.assertEqual(len(binding_calls), 2)
        self.assertEqual(
            {call["operation_id"] for call in binding_calls},
            {binding_calls[0]["operation_id"]},
        )
        self.assertEqual(binding_calls[0]["scope_key"], "user:local")
        self.assertEqual(binding_calls[0]["namespace"], "user:local")
        self.assertEqual(binding_calls[0]["name"], "user:local")
        self.assertEqual(binding_calls[0]["description"], "Long-term memory")
        self.assertNotIn(marker, admission.handoff_messages[0]["content"])

        toolkits = ua._append_memory_v2_normal_toolkit(
            [],
            admission,
            run_id="attempt_a",
        )
        memory_read = toolkits[0]._pupu_memory_v2_callables["memory_read"]
        chunks = []
        offset = 0
        while True:
            page = memory_read(legacy_ref, offset=offset, limit=23)
            if "text" in page:
                chunks.append(page["text"].encode("utf-8"))
            else:
                chunks.append(
                    base64.b64decode(page["data_base64"], validate=True)
                )
            if page["next_offset"] is None:
                break
            offset = page["next_offset"]
        payload = json.loads(b"".join(chunks).decode("utf-8"))
        self.assertEqual(payload["trust"], "UNTRUSTED_DATA")
        self.assertIn(marker, payload["value"]["notes"])
        self.assertEqual(page["provenance"]["source"], "legacy_v1")
        self.assertEqual(profile_path.read_bytes(), before_bytes)
        self.assertEqual(
            sorted(path.name for path in profiles_dir.iterdir()),
            before_files,
        )
        self.assertFalse((self.data_dir / "memory" / "qdrant").exists())

    def test_first_message_recall_merges_v2_and_legacy_references(self):
        self.write_legacy_profile(
            {"preferences": {"editor": "VS Code editor"}}
        )
        long_term = self.runtime.ensure_space(
            scope_kind="long_term",
            scope_key="user:local",
            owner_chat_id="",
            namespace="user:local",
            name="user:local",
            description="Long-term memory",
            operation_id="test-merged-long-term-space",
        )
        native = self.runtime.create_entry(
            owner_chat_id="chat_a",
            space_id=long_term["space_id"],
            path="/editor",
            kind="file",
            expected_space_revision=long_term["revision"],
            operation_id="test-merged-native-entry",
            description="Native V2 editor preference",
            mime_type="text/markdown",
            content=b"Native V2 content",
            created_by="test",
            allow_long_term=True,
            namespace="user:local",
        )
        admission = self.admission()
        message = {"role": "user", "content": "editor"}
        receipt = self.bootstrap(admission, message["content"])

        summary = ua._prepare_memory_v2_first_message_recall(
            admission,
            message,
            receipt,
        )

        self.assertEqual(summary["status"], "InjectedReferences")
        self.assertEqual(summary["reference_count"], 2)
        self.assertIn(native["ref"], summary["input_refs"])
        self.assertEqual(
            sum(is_legacy_v1_memory_ref(ref) for ref in summary["input_refs"]),
            1,
        )
        self.assertIsInstance(admission.runtime, LegacyV1CompositeRuntime)

    def test_missing_legacy_profile_directory_is_not_created_by_recall(self):
        legacy_root = self.data_dir / "memory"
        self.assertFalse(legacy_root.exists())
        admission = self.admission()
        message = {"role": "user", "content": "missing legacy profile"}
        receipt = self.bootstrap(admission, message["content"])

        summary = ua._prepare_memory_v2_first_message_recall(
            admission,
            message,
            receipt,
        )

        self.assertEqual(summary["status"], "NoOp")
        self.assertIsInstance(admission.runtime, LegacyV1CompositeRuntime)
        self.assertFalse(legacy_root.exists())

    def test_legacy_runtime_binding_failure_uses_existing_degraded_audit(self):
        admission = self.admission()
        message = {"role": "user", "content": "editor"}
        receipt = self.bootstrap(admission, message["content"])

        def fail_ensure_space(_runtime_self, **_arguments):
            raise RuntimeError("long-term space unavailable")

        with mock.patch.object(
            MemoryV2Store,
            "ensure_space",
            fail_ensure_space,
        ), mock.patch(
            "memory_v2_recall.recall_long_term_references",
        ) as recall:
            summary = ua._prepare_memory_v2_first_message_recall(
                admission,
                message,
                receipt,
            )

        recall.assert_not_called()
        self.assertEqual(summary["status"], "Degraded")
        self.assertEqual(summary["input_refs"], [])
        self.assertIs(admission.runtime, self.runtime)
        self.assertEqual(admission.handoff_messages, [])
        self.assertFalse((self.data_dir / "memory").exists())
        events = self.runtime.load_events(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            include_payload=True,
        )["events"]
        recall_events = [
            item["event"]
            for item in events
            if item["type"] == "memory.recall.completed"
        ]
        self.assertEqual(len(recall_events), 1)
        self.assertEqual(recall_events[0]["status"], "Degraded")

    def test_completed_root_enqueues_one_pending_job_and_partial_or_child_does_not(self):
        admission = self.admission("attempt_complete")
        receipt = self.bootstrap(admission, "remember the rollout constraint")
        source_event_id = receipt["event"]["event_id"]
        chat_space = self.runtime.ensure_space(
            scope_kind="chat",
            scope_key="chat_a",
            owner_chat_id="chat_a",
            namespace="",
            name="Chat memory",
            description="Curated files for this chat",
            operation_id="candidate-complete-space",
        )
        self.runtime.create_candidate(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_complete",
            source_agent_run_id="attempt_complete",
            source_event_ids=(source_event_id,),
            target_space_id=chat_space["space_id"],
            target_path="/rollout-constraint.md",
            kind="file",
            description="rollout_constraint",
            mime_type="text/markdown",
            content=b"Canary must pass before all rollout.",
            rationale="User requested this durable constraint.",
            confidence=1.0,
            sensitivity="normal",
            operation_id="candidate-complete",
        )
        persist_memory_v2_semantic_event(
            admission,
            {
                "type": "run_completed",
                "run_id": "attempt_complete",
                "status": "completed",
            },
        )
        options = {
            "_memory_v2_memory_agent_config": {
                "displayName": "Memory Agent",
                "additionalInstructions": "",
                "provider": "",
                "modelId": "",
            }
        }
        factory_calls = []

        class InlineCuratorAgent:
            def __init__(self, toolkit):
                self.toolkit = toolkit

            def run(self, request):
                factory_calls.append(request)
                candidate = request["candidates"][0]
                self.toolkit._pupu_memory_v2_callables[
                    "memory_candidate_apply_new"
                ](
                    candidate_ref=candidate["candidate_ref"],
                    expected_binding_revision=candidate["binding_revision"],
                    expected_space_revision=chat_space["revision"],
                )
                return {
                    "status": "completed",
                    "proposal_count": 0,
                    "consumed_tokens": 23,
                    "cost": 0,
                }

        with mock.patch.object(
            ua,
            "_memory_v2_curator_agent_factory",
            return_value=lambda **kwargs: InlineCuratorAgent(kwargs["toolkit"]),
        ):
            first = ua._finalize_memory_v2_curator(
                admission,
                options,
                run_id="attempt_complete",
                lifecycle="normal",
            )
            second = ua._finalize_memory_v2_curator(
                admission,
                options,
                run_id="attempt_complete",
                lifecycle="resume",
            )
        self.assertEqual(first["status"], "Completed")
        self.assertEqual(first["worker_status"], "Completed")
        self.assertEqual(first["reason"], "curation_completed")
        self.assertEqual(first["token_usage"], 23)
        self.assertEqual(len(factory_calls), 1)
        self.assertEqual(second["job_id"], first["job_id"])
        self.assertEqual(second["status"], "AlreadyCompleted")
        bundle = {"memory_v2": {"context_marker": "preserved"}}
        ua._refresh_memory_v2_bundle(bundle, admission)
        self.assertEqual(bundle["memory_v2"]["context_marker"], "preserved")
        self.assertEqual(
            bundle["memory_v2"]["memory_curator"]["status"],
            "AlreadyCompleted",
        )
        self.assertEqual(
            bundle["memory_v2"]["memory_curator"]["input_refs"][0]["candidate_id"],
            first["input_refs"][0]["candidate_id"],
        )
        jobs = self.runtime.list_consolidation_jobs(
            owner_chat_id="chat_a",
            limit=100,
        )["jobs"]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["status"], "completed")
        self.assertEqual(jobs[0]["payload"]["model"]["provider"], "openai")

        partial = self.admission("attempt_partial")
        partial_receipt = self.bootstrap(partial, "failed source")
        self.runtime.create_candidate(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_partial",
            source_agent_run_id="attempt_partial",
            source_event_ids=(partial_receipt["event"]["event_id"],),
            target_space_id="",
            target_path="",
            kind="file",
            description="failed_source",
            mime_type="text/markdown",
            content=b"must stay isolated",
            rationale="test",
            confidence=1.0,
            sensitivity="normal",
            operation_id="candidate-partial",
        )
        persist_memory_v2_semantic_event(
            partial,
            {
                "type": "run_failed",
                "run_id": "attempt_partial",
                "status": "failed",
            },
        )
        isolated = ua._finalize_memory_v2_curator(
            partial,
            options,
            run_id="attempt_partial",
            lifecycle="graph",
        )
        self.assertEqual(isolated["status"], "Isolated")
        jobs = self.runtime.list_consolidation_jobs(
            owner_chat_id="chat_a",
            limit=100,
        )["jobs"]
        self.assertEqual(len(jobs), 1)

        child = ua._finalize_memory_v2_curator(
            admission,
            {**options, "_recipe_subagent_run": True},
            run_id="child_run",
            lifecycle="graph",
        )
        self.assertIsNone(child)
        self.assertEqual(
            len(
                self.runtime.list_consolidation_jobs(
                    owner_chat_id="chat_a",
                    limit=100,
                )["jobs"]
            ),
            1,
        )

    def test_refresh_memory_v2_bundle_keeps_canonical_run_bundle_immutable(self):
        admission = self.admission("attempt_canonical_bundle")
        bundle = {
            "schema": "unchain.run_bundle.v1",
            "bundle_id": "bundle-canonical",
            "bundle_digest": "a" * 64,
        }
        expected = copy.deepcopy(bundle)

        ua._refresh_memory_v2_bundle(bundle, admission)

        self.assertEqual(bundle, expected)

    def test_curator_finalizer_exposes_content_free_memory_agent_trace_run(self):
        admission = self.admission("attempt_trace")
        receipt = self.bootstrap(admission, "remember the trace constraint")
        source_event_id = receipt["event"]["event_id"]
        chat_space = self.runtime.ensure_space(
            scope_kind="chat",
            scope_key="chat_a",
            owner_chat_id="chat_a",
            namespace="",
            name="Chat memory",
            description="Curated files for this chat",
            operation_id="candidate-trace-space",
        )
        self.runtime.create_candidate(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_trace",
            source_agent_run_id="attempt_trace",
            source_event_ids=(source_event_id,),
            target_space_id=chat_space["space_id"],
            target_path="/trace-constraint.md",
            kind="file",
            description="trace_constraint",
            mime_type="text/markdown",
            content=b"candidate-content-must-not-enter-trace",
            rationale="candidate-rationale-must-not-enter-trace",
            confidence=1.0,
            sensitivity="normal",
            operation_id="candidate-trace",
        )
        persist_memory_v2_semantic_event(
            admission,
            {
                "type": "run_completed",
                "run_id": "attempt_trace",
                "status": "completed",
            },
        )
        with mock.patch.object(
            ua,
            "_memory_v2_curator_agent_factory",
            return_value=lambda **kwargs: SimpleNamespace(
                run=lambda request: (
                    kwargs["toolkit"]._pupu_memory_v2_callables[
                        "memory_candidate_apply_new"
                    ](
                        candidate_ref=request["candidates"][0]["candidate_ref"],
                        expected_binding_revision=request["candidates"][0][
                            "binding_revision"
                        ],
                        expected_space_revision=chat_space["revision"],
                    ),
                    {
                        "status": "completed",
                        "proposal_count": 0,
                        "consumed_tokens": 11,
                        "cost": 0,
                    },
                )[1]
            ),
        ):
            summary = ua._finalize_memory_v2_curator(
                admission,
                {
                    "_memory_v2_memory_agent_config": {
                        "displayName": "Memory Agent",
                        "additionalInstructions": "instruction-must-not-enter-trace",
                        "provider": "",
                        "modelId": "",
                    }
                },
                run_id="attempt_trace",
                lifecycle="normal",
            )
        bundle = {}
        ua._refresh_memory_v2_bundle(bundle, admission)

        self.assertEqual(summary["status"], "Completed")
        trace_runs = bundle["memory_v2"]["memory_agent_runs"]
        self.assertEqual(len(trace_runs), 1)
        self.assertEqual(trace_runs[0]["status"], "Completed")
        self.assertEqual(trace_runs[0]["provider"], "openai")
        self.assertTrue(trace_runs[0]["model_id"])
        self.assertEqual(trace_runs[0]["consumed_tokens"], 11)
        self.assertEqual(
            trace_runs[0]["input_refs"],
            [{"candidate_id": summary["input_refs"][0]["candidate_id"], "revision": 1}],
        )
        serialized = str(trace_runs)
        self.assertNotIn("candidate-content-must-not-enter-trace", serialized)
        self.assertNotIn("candidate-rationale-must-not-enter-trace", serialized)
        self.assertNotIn("instruction-must-not-enter-trace", serialized)
        self.assertIn("memory_curator", bundle["memory_v2"])

    def test_no_candidate_finalizer_never_builds_or_invokes_curator_agent(self):
        admission = self.admission("attempt_no_candidate")
        self.bootstrap(admission, "ordinary turn without a memory proposal")
        persist_memory_v2_semantic_event(
            admission,
            {
                "type": "run_completed",
                "run_id": "attempt_no_candidate",
                "status": "completed",
            },
        )
        with mock.patch.object(
            ua,
            "_memory_v2_curator_agent_factory",
            side_effect=AssertionError("zero candidates must not build a model factory"),
        ):
            summary = ua._finalize_memory_v2_curator(
                admission,
                {},
                run_id="attempt_no_candidate",
                lifecycle="normal",
            )
        self.assertEqual(summary["status"], "NoOp")
        self.assertEqual(summary["candidate_count"], 0)
        self.assertEqual(
            self.runtime.list_consolidation_jobs(
                owner_chat_id="chat_a",
                limit=100,
            )["jobs"],
            [],
        )

    def test_production_curator_adapter_uses_exact_raw_agent_contract_and_toolkit(self):
        toolkit = object()
        constructor_calls = []
        run_calls = []

        class FakeToolsModule:
            def __init__(self, *, tools):
                self.tools = tools

        class FakePoliciesModule:
            def __init__(self, *, max_iterations):
                self.max_iterations = max_iterations

        class FakeRawAgent:
            def __init__(self, **kwargs):
                constructor_calls.append(kwargs)
                self.provider = kwargs["provider"]
                self.model = kwargs["model"]

            def run(self, *, messages, payload, callback):
                run_calls.append(
                    {
                        "messages": messages,
                        "payload": payload,
                        "callback": callback,
                    }
                )
                callback(
                    {
                        "type": "tool_result",
                        "tool_name": "memory_promote",
                        "call_id": "promotion_call_a",
                        "result": {"private_candidate": "must not enter audit"},
                    }
                )
                callback(
                    {
                        "type": "tool_result",
                        "tool_name": "memory_promote",
                        "call_id": "promotion_call_a",
                        "result": {"duplicate": True},
                    }
                )
                return SimpleNamespace(status="completed", consumed_tokens=41)

        with mock.patch.object(ua, "_UnchainAgent", FakeRawAgent), mock.patch.object(
            ua,
            "_ToolsModule",
            FakeToolsModule,
        ), mock.patch.object(
            ua,
            "_PoliciesModule",
            FakePoliciesModule,
        ), mock.patch.object(
            ua,
            "_resolve_agent_api_key",
            return_value="ephemeral-provider-key",
        ):
            adapter = ua._create_memory_v2_curator_agent(
                options={"temperature": 0.2, "maxTokens": 512},
                provider="openai",
                model_id="frozen-curator-model",
                system_prompt="locked prompt plus ephemeral instructions",
                toolkit=toolkit,
                display_name="Memory Gardener",
            )
            request = {
                "task": "curate",
                "candidates": [{"candidate_id": "candidate_a", "revision": 1}],
            }
            result = adapter.run(request)

        self.assertEqual(len(constructor_calls), 1)
        created = constructor_calls[0]
        self.assertEqual(created["provider"], "openai")
        self.assertEqual(created["model"], "frozen-curator-model")
        self.assertEqual(created["instructions"], "locked prompt plus ephemeral instructions")
        self.assertEqual(len(created["modules"]), 2)
        self.assertEqual(created["modules"][0].tools, (toolkit,))
        self.assertEqual(created["modules"][1].max_iterations, 32)
        self.assertFalse(hasattr(adapter, "_memory_v2_admission"))
        self.assertEqual(len(run_calls), 1)
        self.assertEqual(
            json.loads(run_calls[0]["messages"][0]["content"]),
            request,
        )
        self.assertEqual(run_calls[0]["messages"][0]["role"], "user")
        self.assertEqual(run_calls[0]["payload"]["temperature"], 0.2)
        self.assertEqual(run_calls[0]["payload"]["max_output_tokens"], 512)
        self.assertEqual(result["proposal_count"], 1)
        self.assertEqual(result["consumed_tokens"], 41)
        self.assertEqual(result["cost"], 0)

    def test_curator_agent_integrity_and_audit_projection_fail_closed(self):
        class WrongProviderAgent:
            provider = "anthropic"
            model = "frozen-model"

            def __init__(self, **_kwargs):
                pass

        with mock.patch.object(ua, "_UnchainAgent", WrongProviderAgent), mock.patch.object(
            ua,
            "_ToolsModule",
            lambda **_kwargs: object(),
        ), mock.patch.object(
            ua,
            "_PoliciesModule",
            lambda **_kwargs: object(),
        ), mock.patch.object(
            ua,
            "_resolve_agent_api_key",
            return_value="ephemeral-provider-key",
        ):
            with self.assertRaises(ua._MemoryV2CuratorAgentError) as raised:
                ua._create_memory_v2_curator_agent(
                    options={},
                    provider="openai",
                    model_id="frozen-model",
                    system_prompt="locked",
                    toolkit=object(),
                    display_name="Memory Curator",
                )
        self.assertEqual(raised.exception.code, "curator_provider_integrity_failed")

        projected = ua._memory_v2_curator_audit_fields(
            {
                "job_id": "job_a",
                "provider": "openai",
                "model_id": "frozen-model",
                "candidate_count": 2,
                "proposal_count": 1,
                "duration_ms": 15,
                "token_usage": 41,
                "cost": 0,
                "candidate_content": "must-not-be-audited",
                "additionalInstructions": "must-not-be-audited",
                "reasoning": "must-not-be-audited",
            }
        )
        self.assertEqual(projected["job_id"], "job_a")
        self.assertEqual(projected["token_usage"], 41)
        self.assertNotIn("candidate_content", projected)
        self.assertNotIn("additionalInstructions", projected)
        self.assertNotIn("reasoning", projected)

    def test_ambiguous_recall_creates_source_readable_candidate_without_root_injection(self):
        admission = self.admission("attempt_ambiguous")
        message = {"role": "user", "content": "which preference applies?"}
        receipt = self.bootstrap(admission, message["content"])
        recalled = {
            "fingerprint": "lt-recall:test",
            "requires_curator": True,
            "reason": "ambiguous_close_scores",
            "context_message": None,
            "references": [
                {
                    "name": "Preference A",
                    "path": "/preference-a.md",
                    "description": "First candidate preference",
                    "score": 0.91,
                    "ref": "pupu://memory/space_long/entry_a@1",
                    "provenance": {"source": "test"},
                },
                {
                    "name": "Preference B",
                    "path": "/preference-b.md",
                    "description": "Second candidate preference",
                    "score": 0.9,
                    "ref": "pupu://memory/space_long/entry_b@1",
                    "provenance": {"source": "test"},
                },
            ],
        }
        with mock.patch(
            "memory_v2_recall.recall_long_term_references",
            return_value=recalled,
        ):
            summary = ua._prepare_memory_v2_first_message_recall(
                admission,
                message,
                receipt,
            )
        self.assertEqual(summary["status"], "CandidateCreated")
        self.assertEqual(admission.handoff_messages, [])
        candidates = self.runtime.list_candidates(
            owner_chat_id="chat_a",
            status="pending",
            limit=100,
        )["candidates"]
        self.assertEqual(len(candidates), 1)
        source_ids = candidates[0]["source_event_ids"]
        events = self.runtime.load_events(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_ambiguous",
            include_payload=True,
        )["events"]
        by_id = {item["event_id"]: item for item in events}
        self.assertTrue(
            any(
                by_id[event_id]["type"] == "memory.recall.completed"
                for event_id in source_ids
            )
        )
        review_event = next(
            item["event"]
            for item in events
            if item["type"] == "memory.recall.completed"
        )
        self.assertEqual(review_event["status"], "NeedsCurator")
        self.assertEqual(review_event["input_refs"], summary["input_refs"])

    def test_curator_task_state_cas_requires_sources_and_compiler_pins_update(self):
        admission = self.admission("attempt_task_state")
        receipt = self.bootstrap(admission, "initial objective")
        source_ref = receipt["event_ref"]
        state = self.runtime.get_task_state(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_task_state",
        )
        toolkit = build_memory_v2_toolkit(
            self.runtime,
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_task_state",
            run_id="attempt_task_state",
            curator=True,
            namespace="user:local",
        )
        update = toolkit._pupu_memory_v2_callables["memory_update_task_state"]
        updated = update(
            expected_revision=state["revision"],
            patch={
                "objective": "Ship the recoverable Memory V2 slice",
                "constraints": ["Never persist secret plaintext"],
                "confirmed_decisions": ["Use one canonical journal"],
                "open_questions": ["When can canary advance?"],
                "active_plan": ["Complete the recovery matrix"],
                "artifact_memory_refs": [],
            },
            source_refs=[source_ref],
        )
        self.assertEqual(updated["revision"], state["revision"] + 1)
        with self.assertRaises(Exception):
            update(
                expected_revision=state["revision"],
                patch={"objective": "stale overwrite"},
                source_refs=[source_ref],
            )

        result = compile_context_envelope(
            ContextBuildEnvelope(
                mode="active",
                owner_chat_id="chat_a",
                session_id="session_a",
                attempt_id="attempt_task_state",
                run_id="attempt_task_state",
                agent_id="developer",
                provider="openai",
                model="gpt-test",
                iteration=1,
                source_messages=({"role": "user", "content": "continue"},),
                task_state=updated,
            ),
            admission,
        )
        pinned = next(
            item
            for item in result.messages
            if "MEMORY_V2_UNTRUSTED_PINNED_CONTEXT"
            in str(item.get("content") or "")
        )
        self.assertEqual(pinned["role"], "user")
        self.assertIn("Ship the recoverable Memory V2 slice", pinned["content"])
        self.assertIn("Never persist secret plaintext", pinned["content"])

    def test_off_and_shadow_helpers_are_strict_noops(self):
        class ForbiddenRuntime:
            def __getattr__(self, name):
                raise AssertionError(f"inactive Memory V2 called {name}")

        for mode in ("off", "shadow"):
            admission = SimpleNamespace(
                is_active=False,
                mode=mode,
                runtime=ForbiddenRuntime(),
            )
            with self.subTest(mode=mode):
                self.assertIsNone(
                    ua._prepare_memory_v2_first_message_recall(
                        admission,
                        {"role": "user", "content": "hello"},
                        {"pinned_task_state_created": True},
                    )
                )
                self.assertIsNone(
                    ua._finalize_memory_v2_curator(
                        admission,
                        {},
                        run_id="run",
                        lifecycle="normal",
                    )
                )
                bundle = {"legacy": True}
                ua._refresh_memory_v2_bundle(bundle, admission)
                self.assertEqual(bundle, {"legacy": True})

    def test_normal_and_resume_streams_reach_the_shared_root_finalizer(self):
        admission = SimpleNamespace(
            is_active=True,
            mode="active",
            diagnostics=lambda: {
                "schema_version": "memory_v2.context.v1",
                "requested_mode": "active",
                "mode": "active",
            },
        )

        class FakeAgent:
            provider = "openai"
            model = "gpt-test"
            max_iterations = 2
            _max_context_window_tokens = 128_000
            _display_model = "openai:gpt-test"
            _toolkits = []
            _memory_v2_admission = admission
            _memory_runtime = {
                "requested": True,
                "available": True,
                "reason": "",
            }

            def run(self, **kwargs):
                kwargs["callback"](
                    {
                        "type": "final_message",
                        "run_id": kwargs["run_id"],
                        "iteration": 1,
                        "timestamp": time.time(),
                        "content": "done",
                    }
                )
                return SimpleNamespace(messages=[{"role": "assistant", "content": "done"}])

            def resume_interaction(self, **kwargs):
                kwargs["callback"](
                    {
                        "type": "final_message",
                        "run_id": kwargs["run_id"],
                        "iteration": 1,
                        "timestamp": time.time(),
                        "content": "resumed",
                    }
                )
                return SimpleNamespace(messages=[{"role": "assistant", "content": "resumed"}])

        fake_agent = FakeAgent()
        common_patches = (
            mock.patch.object(ua, "_create_agent", return_value=fake_agent),
            mock.patch.object(ua, "_load_recipe_from_options", return_value=None),
            mock.patch.object(ua, "_persist_memory_v2_semantic_event"),
            mock.patch.object(ua, "_persist_memory_v2_run_started"),
            mock.patch.object(ua, "_build_memory_v2_tool_runtime_config", return_value={}),
            mock.patch.object(
                ua,
                "_build_bundle_from_result",
                return_value={"memory_v2": {"mode": "active"}},
            ),
            mock.patch.object(ua, "_refresh_memory_v2_bundle"),
        )
        started = []
        try:
            for patcher in common_patches:
                started.append(patcher.start())
            with mock.patch.object(ua, "_finalize_memory_v2_curator") as finalize:
                events = list(
                    ua.stream_chat_events(
                        message="hello",
                        history=[{"role": "user", "content": "old"}],
                        attachments=[],
                        options={},
                    )
                )
            self.assertTrue(any(item.get("type") == "stream_summary" for item in events))
            self.assertEqual(finalize.call_args.kwargs["lifecycle"], "normal")

            pending = {
                "status": "receipt_recorded",
                "session_id": "session_a",
                "interaction_id": "interaction_a",
                "source_run_id": "source_run",
                "provider": "openai",
                "model": "gpt-test",
                "resume_available": True,
            }
            with mock.patch.object(
                ua,
                "get_pending_interaction",
                return_value=pending,
            ), mock.patch.object(
                ua,
                "resolve_resume_options",
                return_value={"memory_enabled": True},
            ), mock.patch.object(
                ua,
                "save_resume_context",
            ), mock.patch.object(
                ua,
                "_cleanup_durable_resume_contexts",
            ), mock.patch.object(
                ua,
                "_finalize_memory_v2_curator",
            ) as finalize_resume:
                resumed = list(
                    ua.resume_chat_interaction_events(
                        session_id="session_a",
                        interaction_id="interaction_a",
                        options={
                            "_memory_v2_requested": True,
                            "_memory_v2_owner_chat_id": "chat_a",
                        },
                    )
                )
            self.assertTrue(any(item.get("type") == "stream_summary" for item in resumed))
            self.assertEqual(finalize_resume.call_args.kwargs["lifecycle"], "resume")
            forwarded = finalize_resume.call_args.args[1]
            self.assertTrue(forwarded["_memory_v2_requested"])
            self.assertEqual(forwarded["_memory_v2_owner_chat_id"], "chat_a")
        finally:
            for patcher in reversed(common_patches):
                patcher.stop()


if __name__ == "__main__":
    unittest.main()
