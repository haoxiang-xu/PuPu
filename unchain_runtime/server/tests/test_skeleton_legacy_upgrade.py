"""Closed, read-only inventory tests for explicit legacy Agent upgrades."""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import pytest

from recipe_seeds import DEFAULT_RECIPE, EXPLORE_RECIPE
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from skeleton_legacy_upgrade import inspect_legacy_upgrade


@pytest.mark.parametrize("pool_type,native", [
    ("toolkit_pool", True), ("subagent_pool", True),
    ("toolkit_pool", False), ("subagent_pool", False),
])
def test_pool_provenance_precedence_is_typed_and_owner_local(tmp_path, pool_type, native):
    store = SkeletonResourceStore(tmp_path / "resources")
    migrated = store.migrate_legacy(source_identity="precedence.recipe", source_scope="recipes",
        source_kind="recipe", source=json.dumps(DEFAULT_RECIPE))
    resource = store.get_resource(migrated["target_id"])
    document = deepcopy(resource["document"])
    owner = next(node["id"] for node in document["nodes"] if node["type"] == "agent")
    config = {"legacy_fields": False if native else None}
    if native:
        config.update({"toolkits": [], "merge_with_user_selected": False}
                      if pool_type == "toolkit_pool" else {"subagents": []})
    pool_index = len(document["nodes"])
    document["nodes"].append({"id": "precedence-pool", "type": pool_type, "config": config})
    document["edges"].append({"id": "precedence-attachment", "kind": "attach",
        "source_node_id": owner, "source_port_id": "attach_bot",
        "target_node_id": "precedence-pool", "target_port_id": "attach_top"})
    stored = store.save_draft(document, expected_edit_token=resource["edit_token"])
    report = inspect_legacy_upgrade(stored["document"], edit_token=stored["edit_token"],
                                    source_identity=stored["source_identity"])
    reviews = [item for item in report["requirements"]
               if item["code"] == "legacy_value_review_required"
               and item["path"] == ["nodes", pool_index, "config", "legacy_fields"]]
    # Authored native settings outrank obsolete provenance. Without native
    # settings, explicit null provenance needs a typed review rather than silence.
    assert bool(reviews) is (not native)


def kernel_config():
    return {
        "schema_version": 1,
        "profile": {
            "id": "author-choice", "provider": "openai", "model": "test-model",
            "protocol": "openai-responses", "endpoint": "https://example.test/v1",
            "credential_ref": "test.key", "context_window": 8192, "output_limit": 2048,
            "capabilities": {"json_schema": True, "images": False, "files": False},
        },
        "prompt": "author prompt", "max_iterations": 8, "output_tokens": 512,
        "history": "root", "overflow": "error", "json_schema": None,
    }


class LegacyUpgradeInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "resources"
        self.store = SkeletonResourceStore(self.root)

    def migrate(self, identity, source, *, source_kind="recipe"):
        raw = json.dumps(source, ensure_ascii=False, separators=(",", ":"))
        status = self.store.migrate_legacy(
            source_identity=identity, source_scope="recipes", source_kind=source_kind,
            source=raw,
        )
        resource = self.store.get_resource(status["target_id"])
        return raw, resource

    @staticmethod
    def requirement_codes(report):
        return [item["code"] for item in report["requirements"]]

    def inventory(self, resource):
        return inspect_legacy_upgrade(
            resource["document"], edit_token=resource["edit_token"],
            source_identity=resource["source_identity"],
        )

    def database_rows(self):
        with sqlite3.connect(self.store.database_path) as connection:
            tables = [row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )]
            return {
                table: connection.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall()
                for table in tables
            }

    def test_real_default_and_explore_migrations_are_detached_repeatable_inventories(self):
        cases = (("default.recipe", DEFAULT_RECIPE), ("explore.recipe", EXPLORE_RECIPE))
        for identity, source in cases:
            with self.subTest(identity=identity):
                raw, resource = self.migrate(identity, source)
                original_document = deepcopy(resource["document"])
                original_rows = self.database_rows()
                original_db = self.store.database_path.read_bytes()

                first = self.inventory(resource)
                second = self.inventory(resource)

                self.assertEqual(first, second)
                self.assertEqual(resource["document"], original_document)
                self.assertEqual(self.database_rows(), original_rows)
                self.assertEqual(self.store.database_path.read_bytes(), original_db)
                with sqlite3.connect(self.store.database_path) as connection:
                    stored_hash = connection.execute(
                        "SELECT source_sha256 FROM legacy_migrations WHERE source_identity=?",
                        (identity,),
                    ).fetchone()[0]
                self.assertEqual(stored_hash, hashlib.sha256(raw.encode()).hexdigest())
                self.assertEqual(set(first), {
                    "schema", "resource_id", "edit_token", "source_identity", "state", "requirements",
                })
                self.assertEqual(first["resource_id"], resource["id"])
                self.assertEqual(first["edit_token"], resource["edit_token"])
                self.assertEqual(first["source_identity"], identity)
                self.assertEqual(first["state"], "needs_upgrade")
                codes = self.requirement_codes(first)
                self.assertIn("kernel_required", codes)
                self.assertIn("toolkit_pool_conversion_required", codes)
                if identity == "default.recipe":
                    self.assertIn("builtin_prompt_review_required", codes)
                self.assertEqual(len(first["requirements"]), len({
                    (item["code"], tuple(item["path"])) for item in first["requirements"]
                }))
                self.assertTrue(all(set(item) == {"code", "path", "message"}
                                    and type(item["message"]) is str
                                    for item in first["requirements"]))

    def test_graphless_recipe_keeps_root_capabilities_visible_without_synthetic_nodes(self):
        source = {
            "name": "Graphless custom", "description": "legacy root config",
            "model": None, "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "Read and summarize."},
            "toolkits": [{"id": "core", "enabled_tools": []}],
            "subagent_pool": [{"kind": "recipe_ref", "recipe_name": "Explore"}],
            "nodes": [],
        }
        _, resource = self.migrate("graphless.recipe", source)
        original = deepcopy(resource["document"])

        report = self.inventory(resource)

        by_code = {item["code"]: item for item in report["requirements"]}
        self.assertIn("root_toolkit_pool_required", by_code)
        self.assertIn("root_subagent_pool_required", by_code)
        self.assertEqual(by_code["root_toolkit_pool_required"]["path"],
                         ["nodes", 1, "config", "legacy_recipe", "toolkits"])
        self.assertEqual(by_code["root_subagent_pool_required"]["path"],
                         ["nodes", 1, "config", "legacy_recipe", "subagent_pool"])
        self.assertEqual(resource["document"], original)
        self.assertEqual(len(resource["document"]["nodes"]), 3)

    def test_graphless_root_capabilities_are_satisfied_only_by_pools_attached_to_its_agent(self):
        source = {
            "name": "Graphless ownership", "description": "legacy root config",
            "model": None, "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "Read and summarize."},
            "toolkits": [{"id": "core", "enabled_tools": []}],
            "subagent_pool": [{"kind": "recipe_ref", "recipe_name": "Explore"}],
            "nodes": [],
        }
        _, resource = self.migrate("graphless-ownership.recipe", source)
        document = deepcopy(resource["document"])
        document["nodes"].extend([
            {"id": "other-agent", "type": "agent", "config": {"kernel": kernel_config()}},
            {"id": "other-tools", "type": "toolkit_pool", "config": {
                "toolkits": [], "merge_with_user_selected": False}},
            {"id": "other-subs", "type": "subagent_pool", "config": {"subagents": []}},
        ])
        document["edges"].extend([
            {"id": "other-tool-attach", "kind": "attach", "source_node_id": "other-agent",
             "source_port_id": "attach_top", "target_node_id": "other-tools", "target_port_id": "attach_bot"},
            {"id": "other-sub-attach", "kind": "attach", "source_node_id": "other-agent",
             "source_port_id": "attach_top", "target_node_id": "other-subs", "target_port_id": "attach_bot"},
        ])
        other_owner = self.store.save_draft(document, expected_edit_token=resource["edit_token"])

        report = self.inventory(other_owner)
        codes = self.requirement_codes(report)
        self.assertIn("root_toolkit_pool_required", codes)
        self.assertIn("root_subagent_pool_required", codes)

        document = deepcopy(other_owner["document"])
        root_agent = next(node for node in document["nodes"] if node["id"] == "agent")
        tools = next(node for node in document["nodes"] if node["id"] == "other-tools")
        subs = next(node for node in document["nodes"] if node["id"] == "other-subs")
        tools["id"] = "root-tools"
        subs["id"] = "root-subs"
        document["edges"][-2]["target_node_id"] = "root-tools"
        document["edges"][-1]["target_node_id"] = "root-subs"
        document["edges"].extend([
            {"id": "root-tool-attach", "kind": "attach", "source_node_id": root_agent["id"],
             "source_port_id": "attach_top", "target_node_id": "root-tools", "target_port_id": "attach_bot"},
            {"id": "root-sub-attach", "kind": "attach", "source_node_id": root_agent["id"],
             "source_port_id": "attach_top", "target_node_id": "root-subs", "target_port_id": "attach_bot"},
        ])
        saved = self.store.save_draft(document, expected_edit_token=other_owner["edit_token"])
        report = self.inventory(saved)
        codes = self.requirement_codes(report)
        self.assertNotIn("root_toolkit_pool_required", codes)
        self.assertNotIn("root_subagent_pool_required", codes)
        self.assertNotIn("tool_selection_required", codes)
        self.assertNotIn("toolkit_pool_conversion_required", codes)
        self.assertNotIn("subagent_pool_conversion_required", codes)

    def test_authored_empty_native_pools_ignore_obsolete_legacy_rows_but_malformed_native_is_reported(self):
        source = {
            "name": "Native wins", "description": "", "model": None,
            "agent": {"prompt_format": "soul", "prompt": "Review."},
            "toolkits": [], "subagent_pool": [],
            "nodes": [
                {"id": "start", "type": "start"},
                {"id": "agent", "type": "agent", "override": {"prompt_format": "soul", "prompt": "Review."}},
                {"id": "tools", "type": "toolkit_pool", "toolkits": ["obsolete malformed ref"]},
                {"id": "subs", "type": "subagent_pool", "subagents": ["obsolete malformed ref"]},
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {"id": "a", "source_node_id": "start", "source_port_id": "out", "target_node_id": "agent", "target_port_id": "in"},
                {"id": "b", "source_node_id": "agent", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
                {"id": "c", "source_node_id": "tools", "source_port_id": "attach_top", "target_node_id": "agent", "target_port_id": "attach_bot"},
                {"id": "d", "source_node_id": "subs", "source_port_id": "attach_top", "target_node_id": "agent", "target_port_id": "attach_bot"},
            ],
        }
        _, resource = self.migrate("native-wins.recipe", source)
        document = deepcopy(resource["document"])
        next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"] = kernel_config()
        tools = next(node for node in document["nodes"] if node["id"] == "tools")
        tools["config"]["toolkits"] = []
        tools["config"]["merge_with_user_selected"] = False
        subs = next(node for node in document["nodes"] if node["id"] == "subs")
        subs["config"]["subagents"] = []
        saved = self.store.save_draft(document, expected_edit_token=resource["edit_token"])

        report = self.inventory(saved)

        self.assertEqual(report["state"], "native_draft")
        self.assertEqual(report["requirements"], [])
        self.assertEqual(saved["document"], document)

        document = deepcopy(saved["document"])
        tools = next(node for node in document["nodes"] if node["id"] == "tools")
        tools["config"]["toolkits"] = "malformed native selection"
        malformed = self.store.save_draft(document, expected_edit_token=saved["edit_token"])
        malformed_report = self.inventory(malformed)
        self.assertIn(["nodes", 2, "config", "toolkits"], [item["path"]
                      for item in malformed_report["requirements"]
                      if item["code"] == "legacy_value_review_required"])
        self.assertNotIn("tool_selection_required", self.requirement_codes(malformed_report))

        document = deepcopy(malformed["document"])
        tools = next(node for node in document["nodes"] if node["id"] == "tools")
        tools["config"]["toolkits"] = []
        subs = next(node for node in document["nodes"] if node["id"] == "subs")
        subs["config"]["subagents"] = "malformed native subagents"
        malformed_subagents = self.store.save_draft(
            document, expected_edit_token=malformed["edit_token"],
        )
        subagent_report = self.inventory(malformed_subagents)
        self.assertIn(["nodes", 3, "config", "subagents"], [item["path"]
                      for item in subagent_report["requirements"]
                      if item["code"] == "legacy_value_review_required"])
        self.assertNotIn("subagent_pool_conversion_required",
                         self.requirement_codes(subagent_report))

    def test_empty_and_null_allowlists_are_distinct_and_unknown_config_requires_review(self):
        source = {
            "name": "Pool choices", "description": "", "model": None,
            "agent": {"prompt_format": "soul", "prompt": "Review."},
            "toolkits": [], "subagent_pool": [],
            "nodes": [
                {"id": "start", "type": "start"},
                {"id": "agent", "type": "agent", "override": {
                    "prompt_format": "soul", "prompt": "Review."}},
                {"id": "tools", "type": "toolkit_pool", "toolkits": [
                    {"id": "empty", "enabled_tools": []},
                    {"id": "all", "enabled_tools": None},
                    {"id": "configured", "enabled_tools": ["read"],
                     "config": {"endpoint": "legacy-value"}, "future": True},
                    {"id": "missing-selection"},
                ]},
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {"id": "a", "source_node_id": "start", "source_port_id": "out",
                 "target_node_id": "agent", "target_port_id": "in"},
                {"id": "b", "source_node_id": "agent", "source_port_id": "out",
                 "target_node_id": "end", "target_port_id": "in"},
                {"id": "c", "source_node_id": "tools", "source_port_id": "attach_top",
                 "target_node_id": "agent", "target_port_id": "attach_bot"},
            ],
        }
        _, resource = self.migrate("pool-choices.recipe", source)

        report = self.inventory(resource)

        codes = self.requirement_codes(report)
        self.assertIn("tool_selection_required", codes)
        self.assertIn("toolkit_config_review_required", codes)
        selection_paths = [item["path"] for item in report["requirements"]
                           if item["code"] == "tool_selection_required"]
        self.assertNotIn(["nodes", 2, "config", "legacy_fields", "toolkits", 0, "enabled_tools"],
                         selection_paths)
        self.assertNotIn(["nodes", 2, "config", "legacy_fields", "toolkits", 1, "enabled_tools"],
                         selection_paths)
        self.assertIn(["nodes", 2, "config", "legacy_fields", "toolkits", 3, "enabled_tools"],
                      selection_paths)
        self.assertIn(["nodes", 2, "config", "legacy_fields", "toolkits", 2, "config"],
                      [item["path"] for item in report["requirements"]
                       if item["code"] == "toolkit_config_review_required"])

    def test_malformed_legacy_pool_metadata_is_reported_at_the_stored_field(self):
        source = {
            "name": "Malformed pool", "description": "", "model": None,
            "agent": {"prompt_format": "soul", "prompt": "Review."},
            "toolkits": [], "subagent_pool": [],
            "nodes": [
                {"id": "start", "type": "start"},
                {"id": "agent", "type": "agent", "override": {
                    "prompt_format": "soul", "prompt": "Review."}},
                {"id": "tools", "type": "toolkit_pool", "toolkits": [
                    "not-a-row", {"id": "bad", "enabled_tools": "read"},
                ]},
                {"id": "subs", "type": "subagent_pool", "subagents": "bad-list"},
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {"id": "a", "source_node_id": "start", "source_port_id": "out",
                 "target_node_id": "agent", "target_port_id": "in"},
                {"id": "b", "source_node_id": "agent", "source_port_id": "out",
                 "target_node_id": "end", "target_port_id": "in"},
                {"id": "c", "source_node_id": "tools", "source_port_id": "attach_top",
                 "target_node_id": "agent", "target_port_id": "attach_bot"},
                {"id": "d", "source_node_id": "subs", "source_port_id": "attach_top",
                 "target_node_id": "agent", "target_port_id": "attach_bot"},
            ],
        }
        _, resource = self.migrate("malformed-pools.recipe", source)

        report = self.inventory(resource)

        malformed = [item["path"] for item in report["requirements"]
                     if item["code"] == "legacy_value_review_required"]
        self.assertIn(["nodes", 2, "config", "legacy_fields", "toolkits", 0], malformed)
        self.assertIn(["nodes", 2, "config", "legacy_fields", "toolkits", 1, "enabled_tools"], malformed)
        self.assertIn(["nodes", 3, "config", "legacy_fields", "subagents"], malformed)

    def test_lossy_legacy_skeleton_prompt_and_malformed_origin_metadata_need_review(self):
        source = {
            "name": "Prompt provenance", "description": "", "model": None,
            "agent": {"prompt_format": "skeleton",
                      "prompt": json.dumps({"instructions": "Summarize.", "temperature": 0.2})},
            "toolkits": [], "subagent_pool": [], "nodes": [],
        }
        _, resource = self.migrate("prompt-provenance.recipe", source)
        report = self.inventory(resource)
        prompt_issue = next(item for item in report["requirements"]
                            if item["code"] == "legacy_prompt_review_required")
        self.assertEqual(prompt_issue["path"],
                         ["nodes", 1, "config", "legacy_recipe", "agent", "prompt"])

        document = deepcopy(resource["document"])
        owner = next(node for node in document["nodes"] if node["type"] == "agent")
        owner["config"]["legacy_recipe"] = ["malformed legacy source"]
        owner["config"]["kernel"] = kernel_config()
        malformed = self.store.save_draft(document, expected_edit_token=resource["edit_token"])
        malformed_report = self.inventory(malformed)
        self.assertIn(["nodes", 1, "config", "legacy_recipe"], [item["path"]
                      for item in malformed_report["requirements"]
                      if item["code"] == "legacy_value_review_required"])
        self.assertNotIn("kernel_required", self.requirement_codes(malformed_report))

    def test_authored_native_kernel_and_pools_are_preserved_and_invalid_kernel_is_precise(self):
        _, resource = self.migrate("authored.recipe", DEFAULT_RECIPE)
        document = deepcopy(resource["document"])
        agent = next(node for node in document["nodes"] if node["type"] == "agent")
        pool = next(node for node in document["nodes"] if node["type"] == "toolkit_pool")
        subagent_pool = next(node for node in document["nodes"]
                             if node["type"] == "subagent_pool")
        authored_kernel = kernel_config()
        authored_toolkits = [{"id": "core", "enabled_tools": []}]
        agent["config"]["kernel"] = deepcopy(authored_kernel)
        pool["config"]["toolkits"] = deepcopy(authored_toolkits)
        pool["config"]["merge_with_user_selected"] = False
        authored_subagents = []
        subagent_pool["config"]["subagents"] = authored_subagents
        saved = self.store.save_draft(document, expected_edit_token=resource["edit_token"])
        before = deepcopy(saved["document"])

        report = self.inventory(saved)

        self.assertNotIn("kernel_required", self.requirement_codes(report))
        self.assertNotIn("kernel_invalid", self.requirement_codes(report))
        self.assertNotIn("toolkit_pool_conversion_required", self.requirement_codes(report))
        self.assertNotIn("subagent_pool_conversion_required", self.requirement_codes(report))
        self.assertEqual(saved["document"], before)
        self.assertEqual(agent["config"]["kernel"], authored_kernel)
        self.assertEqual(pool["config"]["toolkits"], authored_toolkits)

        document = deepcopy(saved["document"])
        agent = next(node for node in document["nodes"] if node["type"] == "agent")
        agent["config"]["kernel"] = {"schema_version": 1}
        invalid = self.store.save_draft(document, expected_edit_token=saved["edit_token"])
        invalid_report = self.inventory(invalid)
        kernel_issue = next(item for item in invalid_report["requirements"]
                            if item["code"] == "kernel_invalid")
        self.assertEqual(kernel_issue["path"], ["nodes", 1, "config", "kernel", "history"])

    def test_identity_types_kind_and_core_invalid_documents_are_rejected(self):
        _, resource = self.migrate("invalid-identity.recipe", EXPLORE_RECIPE)
        document = resource["document"]
        for field, value in (("edit_token", None), ("edit_token", " "),
                             ("source_identity", []), ("source_identity", "")):
            with self.subTest(field=field, value=value):
                with self.assertRaises(SkeletonResourceError):
                    inspect_legacy_upgrade(document, edit_token=resource["edit_token"] if field != "edit_token" else value,
                                           source_identity=resource["source_identity"] if field != "source_identity" else value)
        workflow = deepcopy(document)
        workflow = {
            "schema_version": 1, "kind": "workflow", "id": "workflow", "name": "Workflow",
            "nodes": [
                {"id": "start", "type": "start", "config": {}},
                {"id": "code", "type": "code", "config": {}},
                {"id": "end", "type": "end", "config": {}},
            ],
            "edges": [
                {"id": "a", "kind": "flow", "source_node_id": "start", "source_port_id": "out",
                 "target_node_id": "code", "target_port_id": "in"},
                {"id": "b", "kind": "flow", "source_node_id": "code", "source_port_id": "out",
                 "target_node_id": "end", "target_port_id": "in"},
            ],
        }
        with self.assertRaises(SkeletonResourceError) as wrong_kind:
            inspect_legacy_upgrade(workflow, edit_token=resource["edit_token"],
                                   source_identity=resource["source_identity"])
        self.assertEqual(wrong_kind.exception.code, "wrong_kind")
        invalid = deepcopy(document)
        invalid["nodes"] = "not-nodes"
        with self.assertRaises(SkeletonResourceError):
            inspect_legacy_upgrade(invalid, edit_token=resource["edit_token"],
                                   source_identity=resource["source_identity"])
        invalid = deepcopy(document)
        invalid["schema_version"] = 2
        with self.assertRaises(SkeletonResourceError):
            inspect_legacy_upgrade(invalid, edit_token=resource["edit_token"],
                                   source_identity=resource["source_identity"])


if __name__ == "__main__":
    unittest.main()
