from __future__ import annotations

import base64
import copy
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from memory_v2_legacy_adapter import (  # noqa: E402
    LegacyV1CompositeRuntime,
    LegacyV1LongTermAdapter,
    LegacyV1LongTermAdapterError,
    is_legacy_v1_memory_ref,
    merge_long_term_search_results,
)
from memory_v2_recall import recall_long_term_references  # noqa: E402


class MemoryV2LegacyAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary.name)
        self.namespace = "user:local"
        self.space_id = "mem_space_server_bound"

    def tearDown(self):
        self.temporary.cleanup()

    def _adapter(self, profile, *, namespace=None, space_id=None):
        snapshot = copy.deepcopy(profile)

        def loader(profiles_dir, bound_namespace):
            self.assertEqual(
                profiles_dir,
                (self.data_dir / "memory" / "long_term_profiles").resolve(),
            )
            self.assertEqual(bound_namespace, namespace or self.namespace)
            return copy.deepcopy(snapshot)

        return LegacyV1LongTermAdapter(
            data_dir=self.data_dir,
            namespace=namespace or self.namespace,
            space_id=space_id or self.space_id,
            _profile_loader=loader,
        )

    def test_search_is_reference_only_and_marks_legacy_provenance(self):
        secret_value = "VS Code editor with private profile details"
        adapter = self._adapter(
            {
                "preferences": {
                    "editor": secret_value,
                    "theme": "dark",
                },
                "identity": {"display_name": "Ada"},
            }
        )

        result = adapter.search(query="editor", limit=5, min_score=0.8)

        self.assertEqual(result["backend"], "legacy_v1_lexical")
        self.assertEqual(result["vector_status"], "degraded")
        self.assertEqual(len(result["results"]), 1)
        row = result["results"][0]
        self.assertTrue(is_legacy_v1_memory_ref(row["ref"]))
        self.assertTrue(row["ref"].startswith(f"pupu://memory/{self.space_id}/"))
        self.assertEqual(row["provenance"]["source"], "legacy_v1")
        self.assertTrue(row["provenance"]["legacy_v1"])
        self.assertTrue(row["provenance"]["read_only"])
        self.assertNotIn(secret_value, json.dumps(result, ensure_ascii=False))
        self.assertNotIn("content", row)
        self.assertNotIn("preview", row)

    def test_no_match_is_empty_without_vector_dependency(self):
        adapter = self._adapter({"preferences": {"editor": "VS Code"}})

        result = adapter.search(query="completely unrelated", limit=5, min_score=0.8)

        self.assertEqual(result["results"], [])
        self.assertEqual(result["backend"], "legacy_v1_lexical")
        self.assertEqual(result["vector_status"], "degraded")

    def test_reference_is_stable_and_content_change_advances_revision(self):
        profile = {"preferences": {"editor": "VS Code editor"}, "identity": "Ada"}

        first = self._adapter(profile).search(query="editor", min_score=0.8)
        reordered = self._adapter(
            {"identity": "Ada", "preferences": {"editor": "VS Code editor"}}
        ).search(query="editor", min_score=0.8)
        changed = self._adapter(
            {"identity": "Ada", "preferences": {"editor": "Zed editor"}}
        ).search(query="editor", min_score=0.8)

        first_ref = first["results"][0]["ref"]
        reordered_ref = reordered["results"][0]["ref"]
        changed_ref = changed["results"][0]["ref"]
        self.assertEqual(first_ref, reordered_ref)
        self.assertNotEqual(first_ref, changed_ref)
        self.assertEqual(first_ref.rsplit("@", 1)[0], changed_ref.rsplit("@", 1)[0])

    def test_paginated_read_returns_only_bound_current_revision(self):
        adapter = self._adapter(
            {"preferences": {"editor": "VS Code", "notes": "x" * 200}}
        )
        ref = adapter.search(query="editor", min_score=0.8)["results"][0]["ref"]
        chunks = []
        offset = 0
        while True:
            page = adapter.read(ref=ref, offset=offset, limit=17)
            chunks.append(base64.b64decode(page["data"], validate=True))
            if page["next_offset"] is None:
                break
            self.assertTrue(page["truncated"])
            offset = page["next_offset"]

        payload = json.loads(b"".join(chunks).decode("utf-8"))
        self.assertEqual(payload["trust"], "UNTRUSTED_DATA")
        self.assertEqual(payload["value"]["editor"], "VS Code")
        self.assertEqual(payload["provenance"]["source"], "legacy_v1")
        self.assertFalse(page["truncated"])
        self.assertEqual(page["provenance"]["source"], "legacy_v1")

        changed_adapter = self._adapter(
            {"preferences": {"editor": "Zed", "notes": "x" * 200}}
        )
        with self.assertRaisesRegex(
            LegacyV1LongTermAdapterError,
            "not found at this revision",
        ):
            changed_adapter.read(ref=ref)

    def test_namespace_and_space_are_bound_and_cannot_be_overridden(self):
        adapter = self._adapter({"identity": "Ada"})
        ref = adapter.search(query="identity", min_score=0.8)["results"][0]["ref"]
        other_space = self._adapter(
            {"identity": "Ada"},
            space_id="mem_space_other",
        )
        with self.assertRaisesRegex(
            LegacyV1LongTermAdapterError,
            "outside the bound namespace",
        ):
            other_space.read(ref=ref)

        for namespace in ("../../global", "space with spaces", "/tmp/profile"):
            with self.subTest(namespace=namespace):
                with self.assertRaisesRegex(
                    LegacyV1LongTermAdapterError,
                    "namespace is invalid",
                ):
                    LegacyV1LongTermAdapter(
                        data_dir=self.data_dir,
                        namespace=namespace,
                        space_id=self.space_id,
                    )

    def test_virtual_paths_cannot_traverse(self):
        adapter = self._adapter({"../../credentials": "legacy credential marker"})

        result = adapter.search(query="credential", min_score=0.8)

        path = result["results"][0]["path"]
        self.assertTrue(path.startswith("/legacy_v1/profile/"))
        self.assertNotIn("/../", path)
        self.assertNotIn("credentials/", path)

    def test_official_store_path_is_contained_and_never_saved(self):
        profiles_dir = self.data_dir / "memory" / "long_term_profiles"
        profiles_dir.mkdir(parents=True)
        calls = {"load": 0, "save": 0, "base_dir": None}

        class FakeOfficialStore:
            def __init__(self, *, base_dir):
                calls["base_dir"] = Path(base_dir)

            def _path(self, namespace):
                return calls["base_dir"] / f"{namespace.replace(':', '_')}.json"

            def load(self, namespace):
                calls["load"] += 1
                return {"preferences": {"editor": "VS Code editor"}}

            def save(self, _namespace, _profile):
                calls["save"] += 1
                raise AssertionError("read-only adapter must never save")

        unchain_module = types.ModuleType("unchain")
        memory_module = types.ModuleType("unchain.memory")
        memory_module.JsonFileLongTermProfileStore = FakeOfficialStore
        unchain_module.memory = memory_module
        with mock.patch.dict(
            sys.modules,
            {"unchain": unchain_module, "unchain.memory": memory_module},
        ):
            adapter = LegacyV1LongTermAdapter(
                data_dir=self.data_dir,
                namespace=self.namespace,
                space_id=self.space_id,
            )
            result = adapter.search(query="editor", min_score=0.8)

        self.assertEqual(len(result["results"]), 1)
        self.assertEqual(calls["load"], 1)
        self.assertEqual(calls["save"], 0)
        self.assertEqual(calls["base_dir"], profiles_dir.resolve())

    def test_official_store_escape_fails_closed_before_load(self):
        profiles_dir = self.data_dir / "memory" / "long_term_profiles"
        profiles_dir.mkdir(parents=True)
        calls = {"load": 0}

        class EscapingStore:
            def __init__(self, *, base_dir):
                self.base_dir = Path(base_dir)

            def _path(self, _namespace):
                return self.base_dir.parent.parent / "escaped.json"

            def load(self, _namespace):
                calls["load"] += 1
                return {"must": "not load"}

        unchain_module = types.ModuleType("unchain")
        memory_module = types.ModuleType("unchain.memory")
        memory_module.JsonFileLongTermProfileStore = EscapingStore
        unchain_module.memory = memory_module
        with mock.patch.dict(
            sys.modules,
            {"unchain": unchain_module, "unchain.memory": memory_module},
        ):
            adapter = LegacyV1LongTermAdapter(
                data_dir=self.data_dir,
                namespace=self.namespace,
                space_id=self.space_id,
            )
            result = adapter.search(query="anything", min_score=0.8)

        self.assertEqual(result["results"], [])
        self.assertEqual(result["backend"], "legacy_v1_lexical_unavailable")
        self.assertEqual(result["fallback_reason"], "profile_load_failed")
        self.assertEqual(calls["load"], 0)

    def test_merge_combines_v2_and_legacy_without_content(self):
        legacy = self._adapter(
            {"preferences": {"editor": "VS Code editor"}}
        ).search(query="editor", min_score=0.8)
        primary = {
            "namespace": self.namespace,
            "query": "editor",
            "backend": "fts5",
            "vector_status": "degraded",
            "results": [
                {
                    "ref": f"pupu://memory/{self.space_id}/mem_entry_native@1",
                    "name": "Native choice",
                    "path": "/preferences/native.md",
                    "description": "V2 entry",
                    "score": 0.95,
                    "provenance": {"source": "memory_v2"},
                }
            ],
        }

        merged = merge_long_term_search_results(primary, legacy, limit=5)

        self.assertEqual(len(merged["results"]), 2)
        self.assertEqual(merged["results"][0]["provenance"]["source"], "memory_v2")
        self.assertEqual(merged["results"][1]["provenance"]["source"], "legacy_v1")
        self.assertEqual(merged["sources"]["memory_v2"], "fts5")
        self.assertEqual(merged["sources"]["legacy_v1"], "legacy_v1_lexical")
        self.assertNotIn("value", json.dumps(merged, ensure_ascii=False))

    def test_merged_results_feed_reference_only_first_message_recall(self):
        legacy = self._adapter(
            {"preferences": {"editor": "VS Code editor"}}
        ).search(query="editor", min_score=0.8)
        primary = {
            "namespace": self.namespace,
            "query": "editor",
            "backend": "fts5",
            "vector_status": "degraded",
            "results": [
                {
                    "ref": f"pupu://memory/{self.space_id}/mem_entry_native@1",
                    "name": "Native editor",
                    "path": "/preferences/native-editor.md",
                    "description": "V2 editor preference",
                    "score": 0.99,
                    "provenance": {"source": "memory_v2"},
                }
            ],
        }
        merged = merge_long_term_search_results(primary, legacy, limit=5)

        class CompositeRuntime:
            def search_long_term(self, **_arguments):
                return copy.deepcopy(merged)

            def read_long_term_content(self, **_arguments):
                raise AssertionError("first-message recall must remain reference-only")

        recalled = recall_long_term_references(
            CompositeRuntime(),
            self.namespace,
            "editor",
        )

        self.assertFalse(recalled["requires_curator"])
        self.assertEqual(len(recalled["references"]), 2)
        self.assertEqual(
            {item["provenance"]["source"] for item in recalled["references"]},
            {"memory_v2", "legacy_v1"},
        )
        self.assertEqual(recalled["context_message"]["role"], "user")
        self.assertIn("UNTRUSTED_DATA", recalled["context_message"]["content"])


class MemoryV2LegacyCompositeRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary.name)
        self.namespace = "user:local"
        self.space_id = "mem_space_server_bound"

    def tearDown(self):
        self.temporary.cleanup()

    def _v2_ref(self, entry_id="mem_entry_native", revision=1, *, space_id=None):
        return (
            f"pupu://memory/{space_id or self.space_id}/"
            f"{entry_id}@{revision}"
        )

    def _primary_response(self, *, results=None, namespace=None):
        return {
            "namespace": namespace or self.namespace,
            "query": "editor",
            "backend": "fts5",
            "vector_status": "degraded",
            "results": list(results or []),
        }

    def _primary(self, *, response=None):
        parent = self

        class PrimaryRuntime:
            def __init__(self):
                self.data_dir = parent.data_dir
                self.search_calls = []
                self.read_calls = []
                self.delegate_marker = object()

            def search_long_term(self, **arguments):
                self.search_calls.append(copy.deepcopy(arguments))
                return copy.deepcopy(
                    response
                    if response is not None
                    else parent._primary_response()
                )

            def read_long_term_content(self, **arguments):
                self.read_calls.append(copy.deepcopy(arguments))
                return {"source": "memory_v2", **copy.deepcopy(arguments)}

            def delegated_method(self, value):
                return f"delegated:{value}"

        return PrimaryRuntime()

    def _wrapper(self, primary, profile):
        snapshot = copy.deepcopy(profile)

        def loader(profiles_dir, namespace):
            self.assertEqual(
                profiles_dir,
                (self.data_dir / "memory" / "long_term_profiles").resolve(),
            )
            self.assertEqual(namespace, self.namespace)
            return copy.deepcopy(snapshot)

        return LegacyV1CompositeRuntime(
            runtime=primary,
            namespace=self.namespace,
            space_id=self.space_id,
            _profile_loader=loader,
        )

    def test_search_merges_primary_and_reference_only_legacy_results(self):
        primary = self._primary(
            response=self._primary_response(
                results=[
                    {
                        "ref": self._v2_ref(),
                        "name": "Native editor",
                        "path": "/preferences/editor.md",
                        "description": "V2 preference",
                        "score": 0.99,
                        "provenance": {"source": "memory_v2"},
                    }
                ]
            )
        )
        wrapper = self._wrapper(
            primary,
            {"preferences": {"editor": "VS Code editor"}},
        )

        result = wrapper.search_long_term(
            namespace=self.namespace,
            query=" editor ",
            limit=4,
            min_score=0.8,
        )

        self.assertEqual(len(result["results"]), 2)
        self.assertEqual(result["results"][0]["provenance"]["source"], "memory_v2")
        self.assertEqual(result["results"][1]["provenance"]["source"], "legacy_v1")
        self.assertNotIn(
            "VS Code editor",
            json.dumps(result, ensure_ascii=False),
        )
        self.assertEqual(
            primary.search_calls,
            [
                {
                    "namespace": self.namespace,
                    "query": "editor",
                    "limit": 4,
                    "min_score": 0.8,
                }
            ],
        )

    def test_non_long_term_methods_and_attributes_delegate_unchanged(self):
        primary = self._primary()
        wrapper = self._wrapper(primary, {})

        self.assertIs(wrapper.delegate_marker, primary.delegate_marker)
        self.assertEqual(wrapper.delegated_method("ok"), "delegated:ok")
        self.assertIs(wrapper.primary_runtime, primary)

    def test_read_routes_legacy_only_to_adapter_and_v2_to_primary(self):
        primary = self._primary()
        wrapper = self._wrapper(
            primary,
            {"preferences": {"editor": "VS Code editor"}},
        )
        legacy_ref = wrapper.search_long_term(
            namespace=self.namespace,
            query="editor",
            min_score=0.8,
        )["results"][0]["ref"]
        self.assertTrue(is_legacy_v1_memory_ref(legacy_ref))

        legacy_page = wrapper.read_long_term_content(
            namespace=self.namespace,
            ref=legacy_ref,
            offset=1,
            limit=23,
        )
        native_page = wrapper.read_long_term_content(
            namespace=self.namespace,
            ref=self._v2_ref(),
            offset=2,
            limit=31,
        )

        self.assertEqual(legacy_page["provenance"]["source"], "legacy_v1")
        self.assertEqual(primary.read_calls, [
            {
                "namespace": self.namespace,
                "ref": self._v2_ref(),
                "offset": 2,
                "limit": 31,
            }
        ])
        self.assertEqual(native_page["source"], "memory_v2")

    def test_same_binding_is_idempotent_and_conflicting_nesting_is_rejected(self):
        primary = self._primary()
        wrapper = self._wrapper(primary, {})

        same = LegacyV1CompositeRuntime(
            runtime=wrapper,
            namespace=self.namespace,
            space_id=self.space_id,
        )
        self.assertIs(same, wrapper)
        self.assertIs(same.primary_runtime, primary)

        with self.assertRaisesRegex(
            LegacyV1LongTermAdapterError,
            "already bound to a different scope",
        ):
            LegacyV1CompositeRuntime(
                runtime=wrapper,
                namespace="agent:other",
                space_id=self.space_id,
            )
        with self.assertRaisesRegex(
            LegacyV1LongTermAdapterError,
            "already bound to a different scope",
        ):
            LegacyV1CompositeRuntime(
                runtime=wrapper,
                namespace=self.namespace,
                space_id="mem_space_other",
            )

    def test_wrong_namespace_and_space_fail_before_primary_access(self):
        primary = self._primary()
        wrapper = self._wrapper(primary, {})

        for operation in (
            lambda: wrapper.search_long_term(
                namespace="user:other",
                query="editor",
            ),
            lambda: wrapper.read_long_term_content(
                namespace="user:other",
                ref=self._v2_ref(),
            ),
            lambda: wrapper.read_long_term_content(
                namespace=self.namespace,
                ref=self._v2_ref(space_id="mem_space_other"),
            ),
            lambda: wrapper.read_long_term_content(
                namespace=self.namespace,
                ref=f"pupu://memory/{self.space_id}/legacy_v1_not-a-digest@1",
            ),
            lambda: wrapper.read_long_term_content(
                namespace=self.namespace,
                ref="not-a-memory-ref",
            ),
        ):
            with self.subTest(operation=operation):
                with self.assertRaises(LegacyV1LongTermAdapterError):
                    operation()

        self.assertEqual(primary.search_calls, [])
        self.assertEqual(primary.read_calls, [])

    def test_primary_search_scope_and_refs_fail_closed(self):
        invalid_responses = (
            self._primary_response(namespace="user:other"),
            self._primary_response(
                results=[
                    {
                        "ref": self._v2_ref(space_id="mem_space_other"),
                        "score": 1.0,
                    }
                ]
            ),
            self._primary_response(
                results=[{"ref": "not-a-ref", "score": 1.0}]
            ),
            self._primary_response(
                results=[
                    {
                        "ref": (
                            f"pupu://memory/{self.space_id}/"
                            f"legacy_v1_{'a' * 40}@1"
                        ),
                        "score": 1.0,
                    }
                ]
            ),
        )
        for response in invalid_responses:
            with self.subTest(response=response):
                wrapper = self._wrapper(self._primary(response=response), {})
                with self.assertRaises(LegacyV1LongTermAdapterError):
                    wrapper.search_long_term(
                        namespace=self.namespace,
                        query="editor",
                        min_score=0.8,
                    )

    def test_missing_legacy_directory_is_not_created(self):
        primary = self._primary()
        memory_dir = self.data_dir / "memory"
        self.assertFalse(memory_dir.exists())
        wrapper = LegacyV1CompositeRuntime(
            runtime=primary,
            namespace=self.namespace,
            space_id=self.space_id,
        )

        result = wrapper.search_long_term(
            namespace=self.namespace,
            query="editor",
            min_score=0.8,
        )

        self.assertEqual(result["results"], [])
        self.assertFalse(memory_dir.exists())

    def test_profile_load_failure_degrades_legacy_without_hiding_primary(self):
        primary_row = {
            "ref": self._v2_ref(),
            "name": "Native editor",
            "path": "/preferences/editor.md",
            "description": "V2 preference",
            "score": 0.99,
            "provenance": {"source": "memory_v2"},
        }
        primary = self._primary(
            response=self._primary_response(results=[primary_row])
        )

        def failing_loader(_profiles_dir, _namespace):
            raise OSError("unavailable")

        wrapper = LegacyV1CompositeRuntime(
            runtime=primary,
            namespace=self.namespace,
            space_id=self.space_id,
            _profile_loader=failing_loader,
        )

        result = wrapper.search_long_term(
            namespace=self.namespace,
            query="editor",
            min_score=0.8,
        )

        self.assertEqual(result["results"], [primary_row])
        self.assertEqual(
            result["sources"]["legacy_v1"],
            "legacy_v1_lexical_unavailable",
        )


if __name__ == "__main__":
    unittest.main()
