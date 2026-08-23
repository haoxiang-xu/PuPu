from __future__ import annotations

import base64
import hashlib
import inspect
import sys
import unittest
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from memory_v2_toolkit import (  # noqa: E402
    MAX_FULL_READ_BYTES,
    MemoryV2ToolkitError,
    build_memory_v2_toolkit,
)


class FakeRuntime:
    def __init__(self) -> None:
        self.calls = []
        self.space_revision = 1
        self.entries = {}
        self.decide_promotion_called = False

    def _record(self, name, arguments):
        self.calls.append((name, dict(arguments)))

    def ensure_space(self, **arguments):
        self._record("ensure_space", arguments)
        location = arguments["scope_kind"]
        return {
            "space_id": "space_chat" if location == "chat" else "space_long",
            "revision": self.space_revision,
        }

    def list_entries(self, **arguments):
        self._record("list_entries", arguments)
        return {
            "owner_chat_id": arguments["owner_chat_id"],
            "space_id": arguments["space_id"],
            "space_revision": self.space_revision,
            "entries": list(self.entries.values()),
        }

    def search_entries(self, **arguments):
        self._record("search_entries", arguments)
        return {
            "owner_chat_id": arguments["owner_chat_id"],
            "query": arguments["query"],
            "backend": "fts5",
            "vector_status": "degraded",
            "results": [],
        }

    def read_scoped_content(self, **arguments):
        self._record("read_scoped_content", arguments)
        raw = b"hello memory"
        return {
            "ref": arguments["ref"],
            "owner_chat_id": arguments["owner_chat_id"],
            "mime_type": "text/markdown",
            "offset": arguments["offset"],
            "limit": arguments["limit"],
            "total_bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "next_offset": None,
            "truncated": False,
            "encoding": "base64",
            "data": base64.b64encode(raw).decode("ascii"),
        }

    def read_long_term_content(self, **arguments):
        self._record("read_long_term_content", arguments)
        raw = b"long-term memory"
        return {
            "ref": arguments["ref"],
            "namespace": arguments["namespace"],
            "mime_type": "text/markdown",
            "offset": arguments["offset"],
            "limit": arguments["limit"],
            "total_bytes": len(raw),
            "next_offset": None,
            "truncated": False,
            "encoding": "base64",
            "data": base64.b64encode(raw).decode("ascii"),
        }

    def read_checkpoint_events(self, **arguments):
        self._record("read_checkpoint_events", arguments)
        checkpoint_ref = arguments["checkpoint_ref"]
        return {
            "schema_version": "context_checkpoint_events.v1",
            "owner_chat_id": arguments["owner_chat_id"],
            "checkpoint_ref": checkpoint_ref,
            "coverage": {
                "event_count": 2,
                "ceiling_position": 2,
                "sha256": "a" * 64,
                "generation_pinned": True,
            },
            "after_position": arguments["after_position"],
            "next_after_position": 1,
            "has_more": True,
            "events": [
                {
                    "position": 1,
                    "event_id": "event_1",
                    "payload_ref": f"{checkpoint_ref}/event/1",
                    "event": {"type": "message.user", "payload": {"content": "x"}},
                }
            ],
        }

    def create_candidate(self, **arguments):
        self._record("create_candidate", arguments)
        return {
            "candidate_id": "candidate_1",
            "owner_chat_id": arguments["owner_chat_id"],
            "status": "pending",
        }

    def read_job_candidate_content(self, **arguments):
        self._record("read_job_candidate_content", arguments)
        raw = b"frozen candidate content"
        return {
            "candidate_ref": arguments["candidate_ref"],
            "mime_type": "text/markdown",
            "offset": arguments["offset"],
            "limit": arguments["limit"],
            "total_bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "next_offset": None,
            "truncated": False,
            "encoding": "base64",
            "data": base64.b64encode(raw).decode("ascii"),
        }

    def apply_job_candidate_new(self, **arguments):
        self._record("apply_job_candidate_new", arguments)
        return {
            "candidate_ref": arguments["candidate_ref"],
            "outcome": "applied",
        }

    def propose_job_candidate_review(self, **arguments):
        self._record("propose_job_candidate_review", arguments)
        return {
            "candidate_ref": arguments["candidate_ref"],
            "outcome": "awaiting_user",
            "review_id": "review_1",
        }

    def create_entry(self, **arguments):
        self._record("create_entry", arguments)
        self.space_revision += 1
        entry_id = "entry_1"
        response = {
            "entry_id": entry_id,
            "space_id": arguments["space_id"],
            "path": arguments["path"],
            "kind": arguments["kind"],
            "description": arguments["description"],
            "mime_type": arguments["mime_type"],
            "revision": 1,
            "space_revision": self.space_revision,
            "ref": f"pupu://memory/{arguments['space_id']}/{entry_id}@1",
        }
        self.entries[entry_id] = response
        return response

    def get_entry(self, **arguments):
        self._record("get_entry", arguments)
        revision = arguments.get("revision") or 1
        entry = dict(
            self.entries.get(
                arguments["entry_id"],
                {
                    "entry_id": arguments["entry_id"],
                    "space_id": arguments["space_id"],
                    "path": "/decisions/model.md",
                    "kind": "file",
                    "description": "Model choice and the reason behind it",
                    "mime_type": "text/markdown",
                },
            )
        )
        entry["revision"] = revision
        entry["ref"] = (
            f"pupu://memory/{arguments['space_id']}/{arguments['entry_id']}@{revision}"
        )
        return entry

    def update_entry(self, **arguments):
        self._record("update_entry", arguments)
        self.space_revision += 1
        return {
            "entry_id": arguments["entry_id"],
            "space_id": arguments["space_id"],
            "revision": arguments["expected_revision"] + 1,
            "space_revision": self.space_revision,
        }

    def delete_entry(self, **arguments):
        self._record("delete_entry", arguments)
        self.space_revision += 1
        return {
            "entry_id": arguments["entry_id"],
            "space_id": arguments["space_id"],
            "space_revision": self.space_revision,
            "deleted": True,
        }

    def propose_promotion(self, **arguments):
        self._record("propose_promotion", arguments)
        return {
            "promotion_id": "promotion_1",
            "owner_chat_id": arguments["owner_chat_id"],
            "status": "pending",
        }

    def decide_promotion(self, **_arguments):
        self.decide_promotion_called = True
        raise AssertionError("toolkit must never decide or apply a promotion")


def callable_for(toolkit, name):
    return toolkit._pupu_memory_v2_callables[name]


class MemoryV2ToolkitTests(unittest.TestCase):
    def build(self, *, curator=False, namespace="", **options):
        runtime = FakeRuntime()
        toolkit = build_memory_v2_toolkit(
            runtime,
            owner_chat_id="chat_123",
            session_id="session_456",
            attempt_id="attempt_789",
            run_id="run_abc",
            curator=curator,
            namespace=namespace,
            **options,
        )
        return runtime, toolkit

    def test_regular_and_curator_capability_sets_are_exact(self):
        _, regular = self.build()
        self.assertEqual(
            regular._pupu_memory_v2_tool_names,
            (
                "context_content_read",
                "context_checkpoint_events_read",
                "memory_list",
                "memory_search",
                "memory_read",
                "memory_propose",
            ),
        )
        _, curator = self.build(curator=True, namespace="user:123")
        self.assertEqual(
            curator._pupu_memory_v2_tool_names,
            (
                "context_content_read",
                "context_checkpoint_events_read",
                "memory_list",
                "memory_search",
                "memory_read",
                "memory_source_read",
                "memory_upsert",
                "memory_move",
                "memory_link",
                "memory_promote",
                "memory_supersede",
                "memory_archive",
                "memory_history",
                "memory_update_task_state",
            ),
        )

    def test_consolidation_curator_has_only_candidate_bound_mutations(self):
        candidate_ref = "pupu://memory/candidate/candidate_1@1"
        runtime, toolkit = self.build(
            curator=True,
            namespace="user:123",
            consolidation_job_id="job_1",
            consolidation_candidate_refs=[candidate_ref],
            consolidation_source_refs=["pupu://context/event/event_1"],
        )
        self.assertEqual(
            toolkit._pupu_memory_v2_tool_names,
            (
                "context_content_read",
                "context_checkpoint_events_read",
                "memory_list",
                "memory_search",
                "memory_read",
                "memory_candidate_read",
                "memory_candidate_source_read",
                "memory_candidate_apply_new",
                "memory_candidate_propose_review",
            ),
        )
        for forbidden in (
            "memory_upsert",
            "memory_move",
            "memory_link",
            "memory_promote",
            "memory_archive",
            "memory_update_task_state",
            "memory_propose",
        ):
            self.assertNotIn(forbidden, toolkit._pupu_memory_v2_callables)

        content = callable_for(toolkit, "memory_candidate_read")(candidate_ref)
        self.assertEqual(content["text"], "frozen candidate content")
        source = callable_for(toolkit, "memory_candidate_source_read")(
            "pupu://context/event/event_1"
        )
        self.assertEqual(source["text"], "hello memory")
        applied = callable_for(toolkit, "memory_candidate_apply_new")(
            candidate_ref,
            expected_binding_revision=2,
            expected_space_revision=3,
        )
        self.assertEqual(applied["outcome"], "applied")
        review = callable_for(toolkit, "memory_candidate_propose_review")(
            candidate_ref,
            expected_binding_revision=2,
            target_entry_id="entry_1",
            expected_target_revision=4,
            mode="overwrite",
        )
        self.assertEqual(review["outcome"], "awaiting_user")
        self.assertEqual(
            [name for name, _ in runtime.calls[-4:]],
            [
                "read_job_candidate_content",
                "read_scoped_content",
                "apply_job_candidate_new",
                "propose_job_candidate_review",
            ],
        )

    def test_consolidation_curator_rejects_unbound_candidate_ref(self):
        _, toolkit = self.build(
            curator=True,
            consolidation_job_id="job_1",
            consolidation_candidate_refs=[
                "pupu://memory/candidate/candidate_1@1"
            ],
        )
        with self.assertRaises(MemoryV2ToolkitError):
            callable_for(toolkit, "memory_candidate_read")(
                "pupu://memory/candidate/candidate_2@1"
            )
        with self.assertRaises(MemoryV2ToolkitError):
            callable_for(toolkit, "memory_candidate_source_read")(
                "pupu://context/event/event_2"
            )

    def test_task_state_curator_is_separate_from_candidate_consolidation(self):
        _, toolkit = self.build(
            curator=True,
            task_state_curator=True,
        )
        self.assertEqual(
            toolkit._pupu_memory_v2_tool_names,
            (
                "context_content_read",
                "context_checkpoint_events_read",
                "memory_list",
                "memory_search",
                "memory_read",
                "memory_source_read",
                "memory_update_task_state",
            ),
        )
        with self.assertRaises(MemoryV2ToolkitError):
            self.build(
                curator=True,
                task_state_curator=True,
                consolidation_job_id="job_1",
                consolidation_candidate_refs=[
                    "pupu://memory/candidate/candidate_1@1"
                ],
            )

    def test_context_content_read_is_disclosed_bound_paginated_and_untrusted(self):
        runtime = FakeRuntime()
        allowed = "pupu://artifact/artifact_1@1"
        toolkit = build_memory_v2_toolkit(
            runtime,
            owner_chat_id="chat_123",
            session_id="session_456",
            attempt_id="attempt_789",
            run_id="run_abc",
            content_ref_authorizer=lambda ref: ref == allowed,
        )
        read = callable_for(toolkit, "context_content_read")
        result = read(allowed, offset=2, limit=7)

        self.assertEqual(result["trust"], "UNTRUSTED_DATA")
        self.assertEqual(result["ref"], allowed)
        self.assertEqual(result["media_type"], "text/markdown")
        self.assertEqual(result["bytes"], len(b"hello memory"))
        self.assertEqual(result["sha256"], hashlib.sha256(b"hello memory").hexdigest())
        self.assertEqual(result["content"]["text"], "hello memory")
        self.assertNotIn("owner_chat_id", result)
        call = next(
            arguments
            for name, arguments in runtime.calls
            if name == "read_scoped_content"
        )
        self.assertEqual(call["owner_chat_id"], "chat_123")
        self.assertEqual(call["ref"], allowed)
        self.assertEqual(call["offset"], 2)
        self.assertEqual(call["limit"], 7)

        for rejected in (
            "pupu://artifact/not_disclosed@1",
            "pupu://context/event/event_1",
            "pupu://memory/space_chat/entry_1@1",
            "/host/path/result.json",
        ):
            with self.subTest(ref=rejected), self.assertRaises(
                MemoryV2ToolkitError
            ):
                read(rejected)
        with self.assertRaises(MemoryV2ToolkitError):
            read(allowed, limit=32 * 1024 + 1)

    def test_checkpoint_event_pages_and_derived_payload_reads_reuse_base_disclosure(self):
        runtime = FakeRuntime()
        checkpoint_ref = "pupu://context/checkpoint/checkpoint_1"
        authorized = []

        def authorizer(ref):
            authorized.append(ref)
            return ref == checkpoint_ref

        toolkit = build_memory_v2_toolkit(
            runtime,
            owner_chat_id="chat_123",
            session_id="session_456",
            attempt_id="attempt_789",
            run_id="run_abc",
            content_ref_authorizer=authorizer,
        )
        event_page = callable_for(toolkit, "context_checkpoint_events_read")(
            checkpoint_ref,
            after_position=0,
            limit=1,
        )
        self.assertEqual(event_page["trust"], "UNTRUSTED_DATA")
        self.assertNotIn("owner_chat_id", event_page)
        self.assertEqual(event_page["coverage"]["ceiling_position"], 2)
        page_call = next(
            arguments
            for name, arguments in runtime.calls
            if name == "read_checkpoint_events"
        )
        self.assertEqual(page_call["owner_chat_id"], "chat_123")
        self.assertEqual(page_call["session_id"], "session_456")
        self.assertEqual(page_call["after_position"], 0)
        self.assertEqual(page_call["limit"], 1)

        derived_ref = f"{checkpoint_ref}/event/1"
        content = callable_for(toolkit, "context_content_read")(
            derived_ref,
            limit=16,
        )
        self.assertEqual(content["schema_version"], "context_content.v2")
        self.assertEqual(content["trust"], "UNTRUSTED_DATA")
        content_call = [
            arguments
            for name, arguments in runtime.calls
            if name == "read_scoped_content"
        ][-1]
        self.assertEqual(content_call["ref"], derived_ref)
        self.assertEqual(content_call["session_id"], "session_456")
        self.assertEqual(authorized, [checkpoint_ref, checkpoint_ref])

        with self.assertRaises(MemoryV2ToolkitError):
            callable_for(toolkit, "context_checkpoint_events_read")(
                "pupu://context/checkpoint/not_disclosed"
            )

    def test_memory_model_reads_are_explicitly_untrusted(self):
        runtime, regular = self.build()
        memory = callable_for(regular, "memory_read")(
            "pupu://memory/space_chat/entry_1@1",
            limit=64,
        )
        self.assertEqual(memory["schema_version"], "memory_content.v2")
        self.assertEqual(memory["trust"], "UNTRUSTED_DATA")

        runtime, curator = self.build(curator=True, namespace="user:123")
        source = callable_for(curator, "memory_source_read")(
            "pupu://artifact/artifact_1@1",
            limit=64,
        )
        self.assertEqual(source["schema_version"], "memory_content.v2")
        self.assertEqual(source["trust"], "UNTRUSTED_DATA")

    def test_no_tool_signature_exposes_a_scope_identifier(self):
        _, toolkit = self.build(curator=True, namespace="user:123")
        forbidden = {
            "owner",
            "owner_chat_id",
            "chat_id",
            "session_id",
            "attempt_id",
            "run_id",
            "namespace",
            "global_scope",
            "location",
        }
        for name, function in toolkit._pupu_memory_v2_callables.items():
            with self.subTest(tool=name):
                self.assertTrue(forbidden.isdisjoint(inspect.signature(function).parameters))

    def test_regular_proposal_is_bound_and_never_formally_upserts(self):
        runtime, toolkit = self.build()
        propose = callable_for(toolkit, "memory_propose")
        first = propose(
            path="/decisions/provider-selection.md",
            description="Chosen provider and the constraints that justify the choice",
            content="# Decision\nUse the selected provider.",
            source_refs=["pupu://context/event/event_1"],
            rationale="Needed in later implementation turns",
            confidence=0.9,
        )
        second = propose(
            path="/decisions/provider-selection.md",
            description="Chosen provider and the constraints that justify the choice",
            content="# Decision\nUse the selected provider.",
            source_refs=["pupu://context/event/event_1"],
            rationale="Needed in later implementation turns",
            confidence=0.9,
        )
        calls = [arguments for name, arguments in runtime.calls if name == "create_candidate"]
        self.assertEqual(first["status"], "pending")
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["operation_id"], calls[1]["operation_id"])
        self.assertEqual(calls[0]["owner_chat_id"], "chat_123")
        self.assertEqual(calls[0]["session_id"], "session_456")
        self.assertEqual(calls[0]["attempt_id"], "attempt_789")
        self.assertEqual(calls[0]["source_agent_run_id"], "run_abc")
        self.assertEqual(calls[0]["target_space_id"], "space_chat")
        self.assertEqual(calls[0]["source_event_ids"], ["event_1"])
        self.assertNotIn("owner_chat_id", first)
        self.assertFalse(any(name == "create_entry" for name, _ in runtime.calls))

    def test_mutation_id_changes_with_payload(self):
        runtime, toolkit = self.build()
        propose = callable_for(toolkit, "memory_propose")
        for content in ("first", "second"):
            propose(
                path="/facts/release-window.md",
                description="Release timing used when planning the rollout",
                content=content,
            )
        calls = [arguments for name, arguments in runtime.calls if name == "create_candidate"]
        self.assertNotEqual(calls[0]["operation_id"], calls[1]["operation_id"])

    def test_reads_require_pupu_refs_and_decode_text(self):
        runtime, toolkit = self.build()
        read = callable_for(toolkit, "memory_read")
        result = read("pupu://memory/space_chat/entry_1@1", limit=64)
        self.assertEqual(result["text"], "hello memory")
        self.assertNotIn("owner_chat_id", result)
        call = next(arguments for name, arguments in runtime.calls if name == "read_scoped_content")
        self.assertEqual(call["owner_chat_id"], "chat_123")
        with self.assertRaises(MemoryV2ToolkitError):
            read("/host/path/secrets.md")
        with self.assertRaises(MemoryV2ToolkitError):
            read("entry:entry_1@1")

    def test_full_read_preflights_and_refuses_oversized_content(self):
        runtime, toolkit = self.build()

        def oversized(**arguments):
            runtime._record("read_scoped_content", arguments)
            return {
                "ref": arguments["ref"],
                "mime_type": "text/plain",
                "total_bytes": MAX_FULL_READ_BYTES + 1,
                "data": base64.b64encode(b"x").decode("ascii"),
            }

        runtime.read_scoped_content = oversized
        result = callable_for(toolkit, "memory_read")(
            "pupu://memory/space_chat/entry_1@1",
            full=True,
        )
        self.assertFalse(result["full_read_allowed"])
        self.assertEqual(len([call for call in runtime.calls if call[0] == "read_scoped_content"]), 1)

    def test_curator_long_term_source_read_uses_namespace_bound_reader(self):
        runtime, toolkit = self.build(curator=True, namespace="user:123")
        result = callable_for(toolkit, "memory_source_read")(
            "pupu://memory/space_long/entry_1@1",
            limit=64,
        )
        self.assertEqual(result["text"], "long-term memory")
        call = next(
            arguments
            for name, arguments in runtime.calls
            if name == "read_long_term_content"
        )
        self.assertEqual(call["namespace"], "user:123")
        self.assertEqual(call["ref"], "pupu://memory/space_long/entry_1@1")
        self.assertFalse(
            any(
                name == "read_scoped_content"
                and arguments.get("ref") == "pupu://memory/space_long/entry_1@1"
                for name, arguments in runtime.calls
            )
        )

    def test_meaningful_path_and_indexed_description_are_enforced(self):
        _, toolkit = self.build()
        propose = callable_for(toolkit, "memory_propose")
        with self.assertRaises(MemoryV2ToolkitError):
            propose(path="/untitled.md", description="Useful details", content="x")
        with self.assertRaises(MemoryV2ToolkitError):
            propose(path="/facts/customer.md", description="", content="x")
        tool = toolkit.get("memory_propose")
        self.assertIn("indexed description", tool.description)

    def test_curator_cannot_recursively_create_candidates(self):
        runtime, toolkit = self.build(curator=True, namespace="user:123")
        self.assertNotIn("memory_propose", toolkit._pupu_memory_v2_callables)
        self.assertIsNone(toolkit.get("memory_propose"))
        self.assertFalse(any(name == "create_candidate" for name, _ in runtime.calls))

    def test_curator_upsert_is_chat_scoped_and_cas_protected(self):
        runtime, toolkit = self.build(curator=True, namespace="user:123")
        result = callable_for(toolkit, "memory_upsert")(
            path="/constraints/runtime.md",
            description="Runtime constraints that must remain true during implementation",
            expected_space_revision=1,
            content="No silent provider fallback.",
            source_ref="pupu://context/event/event_2",
        )
        call = next(arguments for name, arguments in runtime.calls if name == "create_entry")
        self.assertEqual(call["owner_chat_id"], "chat_123")
        self.assertEqual(call["space_id"], "space_chat")
        self.assertEqual(call["expected_space_revision"], 1)
        self.assertEqual(call["source_event_id"], "event_2")
        self.assertEqual(result["space_revision"], 2)

    def test_promotion_only_creates_user_confirmed_proposal(self):
        runtime, toolkit = self.build(curator=True, namespace="user:123")
        result = callable_for(toolkit, "memory_promote")(
            source_ref="pupu://memory/space_chat/entry_1@3",
            target_path="/preferences/model-provider.md",
        )
        call = next(arguments for name, arguments in runtime.calls if name == "propose_promotion")
        self.assertEqual(call["owner_chat_id"], "chat_123")
        self.assertEqual(call["target_namespace"], "user:123")
        self.assertEqual(call["source_entry_revision"], 3)
        self.assertTrue(result["requires_user_confirmation"])
        self.assertFalse(runtime.decide_promotion_called)

    def test_history_is_bounded_and_scope_checked(self):
        runtime, toolkit = self.build(curator=True, namespace="user:123")
        result = callable_for(toolkit, "memory_history")(
            "pupu://memory/space_chat/entry_1@3",
            limit=2,
        )
        self.assertEqual([entry["revision"] for entry in result["revisions"]], [3, 2])
        with self.assertRaises(MemoryV2ToolkitError):
            callable_for(toolkit, "memory_history")(
                "pupu://memory/space_other/entry_1@1"
            )
        read_revisions = [
            arguments["revision"]
            for name, arguments in runtime.calls
            if name == "get_entry" and "revision" in arguments
        ]
        self.assertEqual(read_revisions, [3, 2])

    def test_task_state_update_is_curator_only_bound_cas_and_provenance_checked(self):
        regular_runtime, regular = self.build()
        self.assertNotIn("memory_update_task_state", regular._pupu_memory_v2_callables)
        self.assertFalse(
            any(name == "update_task_state" for name, _ in regular_runtime.calls)
        )

        runtime, curator = self.build(curator=True, namespace="user:123")

        def update_task_state(**arguments):
            runtime._record("update_task_state", arguments)
            return {
                **arguments["patch"],
                "revision": arguments["expected_revision"] + 1,
                "source_event_refs": [
                    f"pupu://context/event/{event_id}"
                    for event_id in arguments["source_event_ids"]
                ],
            }

        runtime.update_task_state = update_task_state
        update = callable_for(curator, "memory_update_task_state")
        patch = {
            "objective": "Ship Memory V2 P0 safely",
            "success_criteria": ["Tool results survive restart"],
            "constraints": ["Never store secret plaintext"],
            "confirmed_decisions": ["Use one canonical journal"],
            "open_questions": ["When should canary advance?"],
            "active_plan": ["Run the recovery matrix"],
            "artifact_memory_refs": [
                "pupu://artifact/artifact_1@1",
                "pupu://memory/space_chat/entry_1@1",
            ],
        }
        result = update(
            expected_revision=3,
            patch=patch,
            source_refs=["pupu://context/event/event_9"],
        )
        call = next(
            arguments
            for name, arguments in runtime.calls
            if name == "update_task_state"
        )
        self.assertEqual(call["owner_chat_id"], "chat_123")
        self.assertEqual(call["session_id"], "session_456")
        self.assertEqual(call["expected_revision"], 3)
        self.assertEqual(call["patch"], patch)
        self.assertEqual(call["source_event_ids"], ["event_9"])
        self.assertEqual(result["revision"], 4)

        with self.assertRaises(MemoryV2ToolkitError):
            update(
                expected_revision=4,
                patch={"unknown": ["must fail"]},
                source_refs=["pupu://context/event/event_9"],
            )
        with self.assertRaises(MemoryV2ToolkitError):
            update(
                expected_revision=4,
                patch={"constraints": ["source required"]},
                source_refs=[],
            )
        with self.assertRaises(MemoryV2ToolkitError):
            update(
                expected_revision=4,
                patch={"artifact_memory_refs": ["/host/path"]},
                source_refs=["pupu://context/event/event_9"],
            )
        with self.assertRaises(MemoryV2ToolkitError):
            update(
                expected_revision=4,
                patch={
                    "artifact_memory_refs": [
                        "pupu://context/event/event_9"
                    ]
                },
                source_refs=["pupu://context/event/event_9"],
            )


if __name__ == "__main__":
    unittest.main()
