import json
import os
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import durable_interaction_host as host  # noqa: E402


class DurableGraphStepResumeContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        env_patcher = mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": self.temp_dir.name},
            clear=False,
        )
        env_patcher.start()
        self.addCleanup(env_patcher.stop)

    @staticmethod
    def _coordinator_binding() -> dict:
        return {
            "schema": "pupu.memory-v2-run-binding.v2",
            "owner_chat_id": "chat-graph",
            "session_id": "graph-execution",
            "generation_id": "generation-1",
            "head_revision": 1,
            "identity": {
                "execution_id": "graph-execution",
                "attempt_id": "workflow-attempt-1",
                "run_id": "workflow-attempt-1",
                "root_run_id": "workflow-attempt-1",
                "parent_run_id": None,
                "run_lineage": ["workflow-attempt-1"],
            },
            "grant": {
                "module_key": "memory_v2",
                "capabilities": [
                    "memory.candidate.propose",
                    "memory.context.read",
                    "memory.execution.complete",
                    "memory.workspace.read",
                ],
                "delegable_capabilities": [
                    "memory.candidate.propose",
                    "memory.context.read",
                    "memory.workspace.read",
                ],
                "authority": "graph-root-authority",
            },
            "current_input_draft": {
                "kind": "text",
                "content": "Build report token=raw-secret-value",
                "message_index": 0,
            },
        }

    def _save_kwargs(self) -> dict:
        return {
            "session_id": "graph-execution",
            "step_attempt_id": "graph-step-1",
            "operation_id": "graph-resume-operation-1",
            "owner_chat_id": "chat-graph",
            "graph_execution_id": "graph-execution",
            "coordinator_attempt_id": "workflow-attempt-1",
            "graph_plan_id": "graph-plan-1",
            "graph_scope_id": "graph-scope-1",
            "topology_sha256": "a" * 64,
            "step_index": 1,
            "node_id": "write-report",
            "predecessor_attempt_id": "graph-step-0",
            "provider": "OpenAI",
            "model": "gpt-5",
            "configuration_sha256": "b" * 64,
            "recipe_identity": {
                "name": "Report Recipe",
                "revision": 3,
                "sha256": "c" * 64,
            },
            "canonical_build_fingerprint": "d" * 64,
            "coordinator_binding_snapshot": self._coordinator_binding(),
            "options": {
                "modelId": "openai:gpt-5",
                "memory_enabled": True,
                "recipe_name": "report",
                "_context_composition_hint_v1": {
                    "category": "skills",
                    "subtype": "expanded_invocation",
                    "surface": "messages",
                    "utf8_bytes": 12,
                    "source_count": 1,
                },
                "openai_api_key": "must-not-persist",
                "custom_provider": {
                    "base_url": "https://models.example.test/v1",
                    "api_key": "nested-secret",
                },
            },
            "expected_revision": 0,
        }

    def _load(self) -> dict | None:
        return host.load_graph_step_resume_context(
            "graph-execution",
            "graph-step-1",
            expected_owner_chat_id="chat-graph",
            expected_provider="OPENAI",
            expected_model="gpt-5",
        )

    def test_round_trip_preserves_required_metadata_and_excludes_secrets(
        self,
    ) -> None:
        record = host.save_graph_step_resume_context(**self._save_kwargs())

        self.assertEqual(self._load(), record)
        self.assertEqual(record["schema_version"], 1)
        self.assertEqual(record["resume_kind"], "graph_step")
        self.assertEqual(record["revision"], 1)
        self.assertEqual(record["owner_chat_id"], "chat-graph")
        self.assertEqual(record["graph_execution_id"], "graph-execution")
        self.assertEqual(record["coordinator_attempt_id"], "workflow-attempt-1")
        self.assertEqual(record["graph_plan_id"], "graph-plan-1")
        self.assertEqual(record["graph_scope_id"], "graph-scope-1")
        self.assertEqual(record["step_index"], 1)
        self.assertEqual(record["node_id"], "write-report")
        self.assertEqual(record["step_attempt_id"], "graph-step-1")
        self.assertEqual(record["predecessor_attempt_id"], "graph-step-0")
        self.assertEqual(record["provider"], "openai")
        self.assertEqual(record["model"], "gpt-5")
        self.assertNotIn("role", record["coordinator_binding_snapshot"])
        self.assertEqual(
            record["coordinator_binding_snapshot"]["identity"]["run_lineage"],
            ["workflow-attempt-1"],
        )
        self.assertNotIn("openai_api_key", record["options"])
        self.assertEqual(
            record["options"]["_context_composition_hint_v1"],
            {
                "category": "skills",
                "subtype": "expanded_invocation",
                "surface": "messages",
                "utf8_bytes": 12,
                "source_count": 1,
            },
        )
        self.assertEqual(
            record["options"]["custom_provider"]["api_key"],
            "[REDACTED]",
        )
        serialized = json.dumps(record)
        self.assertNotIn("raw-secret-value", serialized)
        self.assertNotIn("must-not-persist", serialized)
        self.assertNotIn("nested-secret", serialized)

        path = host._graph_step_context_path(
            "graph-execution",
            "graph-step-1",
        )
        persisted = path.read_text(encoding="utf-8")
        self.assertNotIn("raw-secret-value", persisted)
        self.assertNotIn("must-not-persist", persisted)
        self.assertNotIn("nested-secret", persisted)

    def test_round_trip_preserves_canonical_vault_marker_for_resume_identity(
        self,
    ) -> None:
        handle = "pvh1_" + ("a" * 64)
        marker = (
            '<secret-handle label="Report password" '
            f'handle="{handle}"/>'
        )
        kwargs = self._save_kwargs()
        kwargs["coordinator_binding_snapshot"]["current_input_draft"][
            "content"
        ] = f"Use {marker} token=must-not-persist"

        record = host.save_graph_step_resume_context(**kwargs)

        content = record["coordinator_binding_snapshot"][
            "current_input_draft"
        ]["content"]
        self.assertEqual(content, f"Use {marker} token=[REDACTED]")
        self.assertEqual(self._load(), record)
        persisted = host._graph_step_context_path(
            "graph-execution",
            "graph-step-1",
        ).read_text(encoding="utf-8")
        self.assertIn(handle, persisted)
        self.assertNotIn("must-not-persist", persisted)

        bare_handle_kwargs = self._save_kwargs()
        bare_handle_kwargs["step_attempt_id"] = "graph-step-bare-handle"
        bare_handle_kwargs["operation_id"] = "graph-bare-handle-operation"
        bare_handle_kwargs["coordinator_binding_snapshot"][
            "current_input_draft"
        ]["content"] = f"Do not preserve bare {handle}"
        bare_record = host.save_graph_step_resume_context(
            **bare_handle_kwargs
        )
        self.assertEqual(
            bare_record["coordinator_binding_snapshot"][
                "current_input_draft"
            ]["content"],
            "Do not preserve bare [VAULT_HANDLE]",
        )

    def test_role_based_coordinator_snapshot_is_rejected_as_legacy(self) -> None:
        kwargs = self._save_kwargs()
        kwargs["coordinator_binding_snapshot"] = {
            "owner_chat_id": "chat-graph",
            "execution_id": "graph-execution",
            "session_id": "graph-execution",
            "generation_id": "generation-1",
            "head_revision": 1,
            "attempt_id": "workflow-attempt-1",
            "run_id": "workflow-attempt-1",
            "root_run_id": "workflow-attempt-1",
            "role": "root",
            "source_attempt_id": "",
            "current_input_draft": None,
        }

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.save_graph_step_resume_context(**kwargs)

        self.assertEqual(
            raised.exception.code,
            "legacy_coordinator_binding_snapshot",
        )

    def test_coordinator_snapshot_validates_identity_and_grant(self) -> None:
        mutations = (
            lambda snapshot: snapshot["identity"].update(
                {"run_lineage": ["another-run"]}
            ),
            lambda snapshot: snapshot["grant"].update(
                {"delegable_capabilities": ["memory.unknown"]}
            ),
            lambda snapshot: snapshot["grant"].update({"authority": None}),
        )
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                kwargs = self._save_kwargs()
                mutate(kwargs["coordinator_binding_snapshot"])
                with self.assertRaises(
                    host.DurableInteractionHostError
                ) as raised:
                    host.save_graph_step_resume_context(**kwargs)
                self.assertEqual(
                    raised.exception.code,
                    "invalid_coordinator_binding_snapshot",
                )

    def test_nested_coordinator_uses_lineage_and_delegated_grant(self) -> None:
        kwargs = self._save_kwargs()
        kwargs["coordinator_attempt_id"] = "workflow-child"
        binding = kwargs["coordinator_binding_snapshot"]
        binding["identity"] = {
            "execution_id": "graph-execution",
            "attempt_id": "workflow-child",
            "run_id": "workflow-child",
            "root_run_id": "workflow-root",
            "parent_run_id": "workflow-root",
            "run_lineage": ["workflow-root", "workflow-child"],
        }
        binding["grant"] = {
            "module_key": "memory_v2",
            "capabilities": [
                "memory.candidate.propose",
                "memory.context.read",
                "memory.workspace.read",
            ],
            "delegable_capabilities": [
                "memory.candidate.propose",
                "memory.context.read",
                "memory.workspace.read",
            ],
            "authority": None,
        }
        binding["current_input_draft"] = None

        record = host.save_graph_step_resume_context(**kwargs)

        snapshot = record["coordinator_binding_snapshot"]
        self.assertNotIn("role", snapshot)
        self.assertEqual(
            snapshot["identity"]["parent_run_id"],
            "workflow-root",
        )
        self.assertIsNone(snapshot["grant"]["authority"])

    def test_graph_record_is_isolated_from_ordinary_resume_schema(self) -> None:
        graph_record = host.save_graph_step_resume_context(
            **self._save_kwargs()
        )
        ordinary_record = host.save_resume_context(
            session_id="graph-execution",
            run_id="graph-step-1",
            options={"modelId": "openai:gpt-5"},
            provider="openai",
            model="gpt-5",
        )

        self.assertEqual(graph_record["resume_kind"], "graph_step")
        self.assertNotIn("resume_kind", ordinary_record)
        self.assertEqual(
            host.load_resume_context("graph-execution", "graph-step-1"),
            ordinary_record,
        )
        self.assertEqual(self._load(), graph_record)

    def test_resume_preserves_graph_base_model_and_overlays_only_fresh_keys(
        self,
    ) -> None:
        kwargs = self._save_kwargs()
        kwargs["options"]["modelId"] = "openai:graph-base"
        host.save_graph_step_resume_context(**kwargs)

        resolved = host.resolve_graph_step_resume_options(
            session_id="graph-execution",
            step_attempt_id="graph-step-1",
            owner_chat_id="chat-graph",
            fresh_options={
                "openai_api_key": "fresh-key",
                "modelId": "anthropic:must-not-overlay",
            },
            expected_provider="openai",
            expected_model="gpt-5",
        )

        self.assertEqual(resolved["modelId"], "openai:graph-base")
        self.assertEqual(resolved["openai_api_key"], "fresh-key")
        self.assertNotEqual(
            resolved["modelId"],
            "openai:gpt-5",
        )

    def test_same_payload_is_idempotent_and_drift_conflicts(self) -> None:
        first = host.save_graph_step_resume_context(**self._save_kwargs())
        second = host.save_graph_step_resume_context(**self._save_kwargs())
        self.assertEqual(second, first)

        drifted = self._save_kwargs()
        drifted["graph_plan_id"] = "graph-plan-2"
        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.save_graph_step_resume_context(**drifted)
        self.assertEqual(
            raised.exception.code,
            "durable_graph_resume_context_conflict",
        )

    def test_concurrent_identical_writes_converge_on_one_record(self) -> None:
        def save_once(_index: int) -> dict:
            return host.save_graph_step_resume_context(**self._save_kwargs())

        with ThreadPoolExecutor(max_workers=8) as executor:
            records = list(executor.map(save_once, range(16)))

        self.assertTrue(
            all(record == records[0] for record in records[1:])
        )
        root = Path(self.temp_dir.name) / "durable_graph_step_resumes"
        self.assertEqual(len(list(root.rglob("*.json"))), 1)
        self.assertEqual(self._load(), records[0])

    def test_load_requires_exact_owner_provider_and_model(self) -> None:
        host.save_graph_step_resume_context(**self._save_kwargs())
        mismatches = (
            {
                "expected_owner_chat_id": "chat-other",
                "expected_provider": "openai",
                "expected_model": "gpt-5",
            },
            {
                "expected_owner_chat_id": "chat-graph",
                "expected_provider": "anthropic",
                "expected_model": "gpt-5",
            },
            {
                "expected_owner_chat_id": "chat-graph",
                "expected_provider": "openai",
                "expected_model": "gpt-5-mini",
            },
        )
        for expected in mismatches:
            with self.subTest(expected=expected):
                with self.assertRaises(
                    host.DurableInteractionHostError
                ) as raised:
                    host.load_graph_step_resume_context(
                        "graph-execution",
                        "graph-step-1",
                        **expected,
                    )
                self.assertEqual(
                    raised.exception.code,
                    "durable_graph_resume_context_subject_mismatch",
                )

    def test_corrupt_payload_fails_closed(self) -> None:
        host.save_graph_step_resume_context(**self._save_kwargs())
        path = host._graph_step_context_path(
            "graph-execution",
            "graph-step-1",
        )
        record = json.loads(path.read_text(encoding="utf-8"))
        record["payload_sha256"] = "not-a-sha256"
        path.write_text(json.dumps(record), encoding="utf-8")

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            self._load()
        self.assertEqual(
            raised.exception.code,
            "durable_graph_resume_context_corrupt",
        )

    def test_clear_uses_payload_hash_as_compare_and_swap(self) -> None:
        record = host.save_graph_step_resume_context(**self._save_kwargs())

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.clear_graph_step_resume_context(
                "graph-execution",
                "graph-step-1",
                expected_payload_sha256="e" * 64,
            )
        self.assertEqual(
            raised.exception.code,
            "durable_graph_resume_context_conflict",
        )
        self.assertIsNotNone(self._load())

        self.assertTrue(
            host.clear_graph_step_resume_context(
                "graph-execution",
                "graph-step-1",
                expected_payload_sha256=record["payload_sha256"],
            )
        )
        self.assertFalse(
            host.clear_graph_step_resume_context(
                "graph-execution",
                "graph-step-1",
                expected_payload_sha256=record["payload_sha256"],
            )
        )
        self.assertIsNone(self._load())

    def test_creation_rejects_nonzero_expected_revision(self) -> None:
        kwargs = self._save_kwargs()
        kwargs["expected_revision"] = 1

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.save_graph_step_resume_context(**kwargs)
        self.assertEqual(
            raised.exception.code,
            "durable_graph_resume_revision_conflict",
        )


if __name__ == "__main__":
    unittest.main()
