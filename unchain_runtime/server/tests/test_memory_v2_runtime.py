import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from memory_v2_runtime import (
    MemoryV2Runtime,
    _reset_memory_v2_runtime_for_tests,
    get_memory_v2_runtime,
)
from memory_v2_store import MemoryV2Error


class MemoryV2RuntimeTests(unittest.TestCase):
    def tearDown(self):
        _reset_memory_v2_runtime_for_tests()

    def test_optional_without_data_dir_and_required_error(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(get_memory_v2_runtime())
            with self.assertRaises(MemoryV2Error) as raised:
                get_memory_v2_runtime(required=True)
        self.assertEqual(raised.exception.code, "context_v2_unavailable")

    def test_candidate_lifecycle_is_an_explicit_runtime_contract(self):
        expected = {
            "enqueue_curator_job_with_candidates",
            "list_job_candidates",
            "read_job_candidate_content",
            "apply_job_candidate_new",
            "propose_job_candidate_review",
            "list_candidate_reviews",
            "get_candidate_review",
            "read_candidate_review_content",
            "decide_candidate_review",
            "isolate_candidates_for_attempt",
        }
        self.assertTrue(expected.issubset(MemoryV2Runtime.__dict__))

    def test_lazy_singleton_uses_exact_root_and_replaces_on_change(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            with mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": first}, clear=True):
                runtime = get_memory_v2_runtime(required=True)
                self.assertIs(runtime, get_memory_v2_runtime(required=True))
                self.assertEqual(runtime.root_dir, Path(first).resolve() / "memory_v2")
                self.assertFalse((Path(first).resolve() / "context_v2.sqlite3").exists())
                admission = runtime.resolve_chat_admission(
                    owner_chat_id="chat_a",
                    session_id="session_a",
                    requested_rollout_mode="all",
                    effective_rollout_mode="all",
                    cohort="all_active",
                    target_mode="active",
                    decision_reason="",
                    canary_selected=True,
                    canary_percent=5,
                    canary_bucket=1,
                    hash_strategy="sha256_owner_v1",
                    provenance={"source": "runtime_test"},
                    operation_id="admission_1",
                )
                self.assertEqual(
                    runtime.get_chat_admission(owner_chat_id="chat_a")["admission_id"],
                    admission["admission_id"],
                )
                runtime.bootstrap_current_request(
                    owner_chat_id="chat_a",
                    session_id="session_a",
                    attempt_id="attempt_a",
                    message={"content": "Goal"},
                    operation_id="request_1",
                )
                self.assertEqual(
                    runtime.get_task_state(
                        owner_chat_id="chat_a",
                        session_id="session_a",
                        attempt_id="attempt_a",
                    )["objective"],
                    "Goal",
                )
                completed = runtime.mark_chat_bootstrap(
                    owner_chat_id="chat_a",
                    admission_id=admission["admission_id"],
                    expected_revision=admission["revision"],
                    succeeded=True,
                    provenance={"current_request": {"replayed": False}},
                    error_code="",
                    operation_id="admission_bootstrap_1",
                )
                self.assertTrue(completed["v2_bootstrapped"])
                runtime.seal_task(
                    owner_chat_id="chat_a",
                    session_id="session_a",
                    attempt_id="attempt_a",
                    outcome="completed",
                    operation_id="runtime_attempt_seal",
                )
                head = runtime.get_session_head(
                    owner_chat_id="chat_a",
                    session_id="session_a",
                )
                rebased = runtime.rebase_session(
                    owner_chat_id="chat_a",
                    session_id="session_a",
                    replacement_history=[
                        {"role": "user", "content": "Replacement goal"}
                    ],
                    source_generation_id=head["current_generation_id"],
                    expected_session_revision=head["session_revision"],
                    operation_id="runtime_rebase_1",
                    reason="edit",
                )
                self.assertEqual(rebased["generation_no"], 2)
                self.assertEqual(
                    runtime.get_session_head(
                        owner_chat_id="chat_a",
                        session_id="session_a",
                    )["current_generation_id"],
                    rebased["generation_id"],
                )
            with mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": second}, clear=True):
                replacement = get_memory_v2_runtime(required=True)
                self.assertIsNot(runtime, replacement)
                self.assertEqual(replacement.root_dir, Path(second).resolve() / "memory_v2")


if __name__ == "__main__":
    unittest.main()
