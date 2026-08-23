from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from memory_v2_recall import (  # noqa: E402
    MemoryV2RecallError,
    recall_long_term_references,
)


def _result(
    suffix: str,
    *,
    score: float = 0.9,
    path: str | None = None,
    provenance=None,
    **extra,
):
    return {
        "name": f"Preference {suffix}",
        "path": path or f"/preferences/{suffix}.md",
        "description": f"Durable preference {suffix} used for future choices",
        "score": score,
        "ref": f"pupu://memory/space_long/entry_{suffix}@1",
        "provenance": provenance or {"source_event_id": f"event_{suffix}"},
        "content": "must never escape",
        "object_id": "must-never-escape",
        **extra,
    }


class FakeRuntime:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []
        self.read_calls = 0

    def search_long_term(self, **arguments):
        self.calls.append(dict(arguments))
        return {"results": copy.deepcopy(self.results)}

    def read_long_term_content(self, **_arguments):
        self.read_calls += 1
        raise AssertionError("lightweight recall must never read content")


class MemoryV2RecallTests(unittest.TestCase):
    def test_safe_match_is_reference_only_untrusted_user_data(self):
        runtime = FakeRuntime([_result("editor", score=0.91)])
        recalled = recall_long_term_references(
            runtime,
            "user:123",
            "preferred editor",
        )

        self.assertEqual(
            runtime.calls,
            [
                {
                    "namespace": "user:123",
                    "query": "preferred editor",
                    "limit": 5,
                    "min_score": 0.8,
                }
            ],
        )
        self.assertEqual(runtime.read_calls, 0)
        self.assertFalse(recalled["requires_curator"])
        self.assertEqual(recalled["context_message"]["role"], "user")
        self.assertIn("UNTRUSTED_DATA", recalled["context_message"]["content"])
        self.assertNotIn("must never escape", recalled["context_message"]["content"])
        self.assertEqual(
            set(recalled["references"][0]),
            {"name", "path", "description", "score", "ref", "provenance"},
        )
        self.assertNotIn(recalled["context_message"]["role"], {"system", "developer"})

    def test_empty_or_low_confidence_results_have_no_context_cost(self):
        for results in ([], [_result("weak", score=0.4)]):
            with self.subTest(results=results):
                runtime = FakeRuntime(results)
                recalled = recall_long_term_references(
                    runtime,
                    "user:123",
                    "unrelated question",
                )
                self.assertEqual(recalled["references"], [])
                self.assertFalse(recalled["requires_curator"])
                self.assertIsNone(recalled["context_message"])
                self.assertEqual(recalled["reason"], "no_high_confidence_matches")
                self.assertEqual(runtime.read_calls, 0)

    def test_close_scores_require_curator_and_are_not_directly_injected(self):
        runtime = FakeRuntime(
            [
                _result("one", score=0.92),
                _result("two", score=0.88),
            ]
        )
        recalled = recall_long_term_references(
            runtime,
            "user:123",
            "preference",
        )
        self.assertTrue(recalled["requires_curator"])
        self.assertEqual(recalled["reason"], "ambiguous_close_scores")
        self.assertIsNone(recalled["context_message"])
        self.assertEqual(len(recalled["references"]), 2)

    def test_casefolded_path_conflict_requires_curator(self):
        runtime = FakeRuntime(
            [
                _result("one", score=0.96, path="/Preferences/Editor.md"),
                _result("two", score=0.85, path="/preferences/editor.md"),
            ]
        )
        recalled = recall_long_term_references(
            runtime,
            "user:123",
            "editor",
        )
        self.assertTrue(recalled["requires_curator"])
        self.assertEqual(recalled["reason"], "path_conflict")
        self.assertIsNone(recalled["context_message"])

    def test_more_than_three_high_confidence_results_require_curator(self):
        runtime = FakeRuntime(
            [_result(str(index), score=0.99 - index * 0.06) for index in range(4)]
        )
        recalled = recall_long_term_references(
            runtime,
            "user:123",
            "preference",
        )
        self.assertTrue(recalled["requires_curator"])
        self.assertEqual(recalled["reason"], "too_many_high_confidence_results")
        self.assertEqual(len(recalled["references"]), 4)

    def test_legacy_v1_provenance_is_preserved(self):
        provenance = {
            "source": "legacy_v1",
            "legacy_v1": True,
            "source_id": "old-entry-7",
        }
        recalled = recall_long_term_references(
            FakeRuntime([_result("legacy", provenance=provenance)]),
            "user:123",
            "legacy preference",
        )
        self.assertEqual(recalled["references"][0]["provenance"], provenance)

    def test_fingerprint_is_order_independent_and_changes_with_query(self):
        results = [
            _result("one", score=0.95),
            _result("two", score=0.84),
        ]
        first = recall_long_term_references(
            FakeRuntime(results),
            "user:123",
            "preference",
        )
        reordered = recall_long_term_references(
            FakeRuntime(list(reversed(results))),
            "user:123",
            "preference",
        )
        changed_query = recall_long_term_references(
            FakeRuntime(results),
            "user:123",
            "another preference",
        )
        self.assertEqual(first["fingerprint"], reordered["fingerprint"])
        self.assertNotEqual(first["fingerprint"], changed_query["fingerprint"])
        self.assertRegex(first["fingerprint"], r"^lt-recall:[0-9a-f]{64}$")

    def test_invalid_refs_are_ignored_without_content_read(self):
        runtime = FakeRuntime(
            [
                {
                    **_result("bad"),
                    "ref": "https://example.com/not-memory",
                }
            ]
        )
        recalled = recall_long_term_references(
            runtime,
            "user:123",
            "preference",
        )
        self.assertEqual(recalled["references"], [])
        self.assertIsNone(recalled["context_message"])
        self.assertEqual(runtime.read_calls, 0)

    def test_namespace_and_threshold_fail_closed(self):
        runtime = FakeRuntime([])
        for namespace in ("", "../../global", "space with spaces"):
            with self.subTest(namespace=namespace):
                with self.assertRaises(MemoryV2RecallError):
                    recall_long_term_references(runtime, namespace, "query")
        with self.assertRaises(MemoryV2RecallError):
            recall_long_term_references(
                runtime,
                "user:123",
                "query",
                min_score=0.5,
            )
        self.assertEqual(runtime.calls, [])


if __name__ == "__main__":
    unittest.main()
