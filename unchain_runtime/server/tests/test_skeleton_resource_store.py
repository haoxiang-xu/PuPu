import json
import os
import subprocess
import sys
import tempfile
import unittest
import venv
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import app as pupu_app
from unchain.journal import AttemptRef, GenerationRef
from unchain.skeleton.errors import SkeletonValidationError
from unchain.persistence import SQLiteContextV2Store
from unchain.skeleton import (
    FileCodeSourceResolver,
    validate_subagent_pool_config,
    SkeletonCodeRuntime,
    WorkflowNodeCompleted,
    WorkflowNodeWaiting,
    prepare_agent_graph,
    prepare_workflow,
)
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime

from skeleton_resource_store import (
    SkeletonResourceError,
    SkeletonResourceStore,
    migrate_known_legacy_sources,
)


def output(name, kind, path):
    return {"name": name, "source": {"kind": kind, "path": path}}


def binding(name, node, path):
    return {"name": name, "value": {"kind": "ref", "node_id": node, "path": path}, "missing": "error"}


def kernel_config():
    return {
        "schema_version": 1,
        "profile": {
            "id": "test", "provider": "openai", "model": "test-model",
            "protocol": "openai-responses", "endpoint": "https://example.test/v1",
            "credential_ref": "test.key", "context_window": 8192,
            "output_limit": 2048,
            "capabilities": {"json_schema": True, "images": True, "files": True},
        },
        "prompt": "resolved builtin", "max_iterations": 8, "output_tokens": 512,
        "history": "root", "overflow": "error", "json_schema": None,
    }


def workflow(resource_id="workflow", name="Workflow", call=None):
    middle = {"id": "code", "type": "code", "config": {
        "execution": {"inputs": [binding("value", "start", ["value"])],
                      "outputs": [output("value", "result", ["value"])]}}}
    if call is not None:
        middle = {"id": "code", "type": "workflow_call", "config": {
            "workflow": {"workflow_id": call[0], "revision_id": call[1]},
            "execution": {"inputs": [binding("value", "start", ["value"])],
                          "outputs": [output("value", "result", ["value"])]}}}
    return {
        "schema_version": 1, "kind": "workflow", "id": resource_id, "name": name,
        "nodes": [
            {"id": "start", "type": "start", "config": {
                "execution": {"outputs": [output("value", "result", ["value"])]}}},
            middle,
            {"id": "end", "type": "end", "config": {
                "execution": {"inputs": [binding("value", "code", ["value"])],
                              "outputs": [output("value", "input", ["value"])]}}},
        ],
        "edges": [
            {"id": "a", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "code", "target_port_id": "in"},
            {"id": "b", "kind": "flow", "source_node_id": "code", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ],
    }


def code_workflow(resource_id="code-workflow", profile_id="builtin"):
    document = workflow(resource_id)
    code = next(node for node in document["nodes"] if node["type"] == "code")
    code["config"]["code"] = {
        "source": {"kind": "file", "path": "main.py"},
        "environment_profile_id": profile_id,
        "timeout_ms": 5000,
        "max_result_bytes": 1048576,
        "max_log_bytes": 65536,
        "result_schema": {"type": "object"},
    }
    return document


def agent(resource_id="agent", name="Agent", child_source=None):
    document = {
        "schema_version": 1, "kind": "agent", "id": resource_id, "name": name,
        "nodes": [
            {"id": "start", "type": "start", "config": {
                "execution": {"outputs": [output("message", "result", ["message"])]}}},
            {"id": "kernel", "type": "agent", "config": {
                "execution": {
                    "inputs": [binding("message", "start", ["message"])],
                    "outputs": [output("message", "result", ["message"]),
                                output("context", "result", ["context"])],
                },
                "kernel": kernel_config(),
            }},
            {"id": "end", "type": "end", "config": {
                "execution": {
                    "inputs": [binding("message", "kernel", ["message"])],
                    "outputs": [output("message", "input", ["message"])],
                }}},
        ],
        "edges": [
            {"id": "a", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "kernel", "target_port_id": "in"},
            {"id": "b", "kind": "flow", "source_node_id": "kernel", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ],
    }
    if child_source is not None:
        document["nodes"].append({
            "id": "children", "type": "subagent_pool", "config": {"subagents": [{
                "id": "reviewer", "name": "Reviewer", "description": "review",
                "source": child_source,
                "allowed_modes": ["delegate", "handoff", "worker"],
                "output_mode": "summary", "memory_policy": "ephemeral",
                "parallel_safe": True, "allowed_tools": None, "disabled_tools": [],
            }]},
        })
        document["edges"].append({
            "id": "attach", "kind": "attach", "source_node_id": "kernel",
            "source_port_id": "attach_bot", "target_node_id": "children",
            "target_port_id": "attach_top",
        })
    return document


class SkeletonResourceStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "skeletons"
        self.store = SkeletonResourceStore(self.root)

    def test_draft_save_diagnoses_incomplete_and_cas_conflict(self):
        draft = {"schema_version": 1, "kind": "workflow", "id": "draft", "name": "Draft",
                 "nodes": [], "edges": []}
        first = self.store.save_draft(draft)
        self.assertTrue(first["diagnostics"])
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.preflight("draft")
        self.assertIn(caught.exception.code, {"start_count", "end_count"})
        second_doc = deepcopy(draft); second_doc["description"] = "second"
        second = self.store.save_draft(second_doc, expected_edit_token=first["edit_token"])
        self.assertNotEqual(first["edit_token"], second["edit_token"])
        with self.assertRaises(SkeletonResourceError) as conflict:
            self.store.save_draft(draft, expected_edit_token=first["edit_token"])
        self.assertEqual(conflict.exception.code, "edit_conflict")
        self.assertEqual(conflict.exception.status, 409)
        invalid_id = deepcopy(draft); invalid_id["id"] = "folder/draft"
        with self.assertRaises(SkeletonResourceError) as invalid:
            self.store.save_draft(invalid_id)
        self.assertEqual(invalid.exception.code, "invalid_value")
        self.assertEqual(invalid.exception.path, ("document", "id"))

    def test_preflight_returns_one_fixed_executable_snapshot_and_rejects_archive(self):
        saved = self.store.save_draft(workflow("snapshot", "Before"))
        snapshot = self.store.preflight("snapshot")
        changed = workflow("snapshot", "After")
        edited = self.store.save_draft(changed, expected_edit_token=saved["edit_token"])
        self.assertEqual(snapshot["document"]["name"], "Before")
        self.assertEqual(snapshot["edit_token"], saved["edit_token"])
        self.assertNotEqual(snapshot["edit_token"], edited["edit_token"])
        archived = self.store.archive("snapshot", expected_edit_token=edited["edit_token"])
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.preflight("snapshot")
        self.assertTrue(archived["archived"])
        self.assertEqual(caught.exception.code, "resource_archived")

    def test_preflight_resolves_exact_workflow_dependency_closure(self):
        parent = self.store.save_draft(workflow("parent", call=("missing", "rev-1")))
        with self.assertRaises(SkeletonResourceError) as missing:
            self.store.preflight(parent["id"])
        self.assertEqual(missing.exception.code, "resource_missing")

        child = self.store.save_draft(workflow("child"))
        published = self.store.publish_workflow(
            "child", expected_edit_token=child["edit_token"],
        )
        parent_document = workflow("parent", call=("child", published["revision_id"]))
        parent = self.store.save_draft(
            parent_document, expected_edit_token=parent["edit_token"],
        )
        preflight = self.store.preflight("parent")
        self.assertEqual(preflight["dependencies"], [{
            "workflow_id": "child", "revision_id": published["revision_id"],
            "definition_digest": published["definition_digest"],
        }])
        self.store.archive("child", expected_edit_token=child["edit_token"])
        with self.assertRaises(SkeletonResourceError) as archived:
            self.store.preflight("parent")
        self.assertEqual(archived.exception.code, "resource_archived")

    def test_agent_preflight_fixes_referenced_and_embedded_subagent_snapshots(self):
        shared = self.store.save_draft(agent("shared", "Before"))
        embedded = agent("embedded", "Embedded")
        parent_document = agent("parent", child_source={
            "kind": "agent_ref", "agent_id": "shared",
        })
        parent = self.store.save_draft(parent_document)

        first = self.store.preflight(parent["id"])
        self.assertEqual(first["subagents"][0]["agent_id"], "shared")
        self.assertEqual(first["subagents"][0]["document"]["name"], "Before")
        self.assertEqual(first["subagents"][0]["edit_token"], shared["edit_token"])

        edited = self.store.save_draft(
            agent("shared", "After"), expected_edit_token=shared["edit_token"],
        )
        second = self.store.preflight(parent["id"])
        self.assertEqual(first["subagents"][0]["document"]["name"], "Before")
        self.assertEqual(second["subagents"][0]["document"]["name"], "After")
        self.assertEqual(second["subagents"][0]["edit_token"], edited["edit_token"])

        embedded_parent = self.store.save_draft(agent("embedded-parent", child_source={
            "kind": "embedded", "document": embedded,
        }))
        embedded_run = self.store.preflight(embedded_parent["id"])
        self.assertEqual(embedded_run["subagents"][0]["source_kind"], "embedded")
        self.assertIsNone(embedded_run["subagents"][0]["agent_id"])
        self.assertIsNone(embedded_run["subagents"][0]["edit_token"])

    def test_subagent_preflight_rejects_workflow_archive_missing_and_cycles(self):
        self.store.save_draft(workflow("not-agent"))
        wrong = self.store.save_draft(agent("wrong-parent", child_source={
            "kind": "agent_ref", "agent_id": "not-agent",
        }))
        with self.assertRaises(SkeletonResourceError) as wrong_kind:
            self.store.preflight(wrong["id"])
        self.assertEqual(wrong_kind.exception.code, "wrong_kind")

        missing = self.store.save_draft(agent("missing-parent", child_source={
            "kind": "agent_ref", "agent_id": "absent",
        }))
        with self.assertRaises(SkeletonResourceError) as absent:
            self.store.preflight(missing["id"])
        self.assertEqual(absent.exception.code, "resource_missing")

        child = self.store.save_draft(agent("archived-child"))
        archived_parent = self.store.save_draft(agent("archived-parent", child_source={
            "kind": "agent_ref", "agent_id": child["id"],
        }))
        self.store.archive(child["id"], expected_edit_token=child["edit_token"])
        with self.assertRaises(SkeletonResourceError) as archived:
            self.store.preflight(archived_parent["id"])
        self.assertEqual(archived.exception.code, "resource_archived")

        left = self.store.save_draft(agent("left", child_source={
            "kind": "agent_ref", "agent_id": "right",
        }))
        self.store.save_draft(agent("right", child_source={
            "kind": "agent_ref", "agent_id": left["id"],
        }))
        with self.assertRaises(SkeletonResourceError) as cycle:
            self.store.preflight(left["id"])
        self.assertEqual(cycle.exception.code, "recursive_reference")

    def test_python_profiles_are_probed_cas_saved_and_reference_protected(self):
        profiles = self.store.list_python_profiles()
        self.assertEqual(profiles[0]["id"], "builtin")
        self.assertTrue(profiles[0]["available"])
        self.assertTrue(self.store.probe_python_profile("builtin")["ok"])

        draft = self.store.save_draft(code_workflow(profile_id="project-venv"))
        with self.assertRaises(SkeletonResourceError) as missing:
            self.store.preflight(draft["id"])
        self.assertEqual(missing.exception.code, "profile_missing")

        saved = self.store.save_python_profile("project-venv", sys.executable)
        self.assertTrue(saved["available"])
        self.assertEqual(saved["probe"]["implementation"], "cpython")
        preflight = self.store.preflight(draft["id"])
        self.assertEqual(preflight["id"], draft["id"])
        published = self.store.publish_workflow(
            draft["id"], expected_edit_token=draft["edit_token"],
        )
        self.assertEqual(published["workflow_id"], draft["id"])

        second_store = SkeletonResourceStore(self.root)
        updated = second_store.save_python_profile(
            "project-venv", sys.executable,
            expected_edit_token=saved["edit_token"],
        )
        with self.assertRaises(SkeletonResourceError) as stale:
            self.store.save_python_profile(
                "project-venv", sys.executable,
                expected_edit_token=saved["edit_token"],
            )
        self.assertEqual(stale.exception.code, "edit_conflict")
        with self.assertRaises(SkeletonResourceError) as referenced:
            self.store.delete_python_profile(
                "project-venv", expected_edit_token=updated["edit_token"],
            )
        self.assertEqual(referenced.exception.code, "profile_referenced")

        temporary = self.store.save_python_profile("temporary", sys.executable)
        self.store.delete_python_profile(
            "temporary", expected_edit_token=temporary["edit_token"],
        )
        self.assertNotIn(
            "temporary", {item["id"] for item in self.store.list_python_profiles()},
        )
        with self.assertRaises(SkeletonResourceError) as immutable:
            self.store.save_python_profile("builtin", sys.executable)
        self.assertEqual(immutable.exception.code, "profile_immutable")
        with self.assertRaises(SkeletonResourceError) as unavailable:
            self.store.save_python_profile("missing", sys.executable + "-missing")
        self.assertEqual(unavailable.exception.code, "missing_runtime")
        with self.assertRaises(SkeletonResourceError) as relative:
            self.store.save_python_profile("relative", "python")
        self.assertEqual(relative.exception.code, "invalid_path")

    def test_saved_venv_profile_runs_a_published_workflow_in_real_python(self):
        source_root = Path(self.tmp.name) / "code-source"
        source_root.mkdir()
        (source_root / "main.py").write_text(
            "def main(input, context):\n"
            "    return {'value': input['value'] + '-python'}\n",
            encoding="utf-8",
        )
        self.store.save_python_profile("project-venv", sys.executable)
        draft = self.store.save_draft(code_workflow(profile_id="project-venv"))
        published = self.store.publish_workflow(
            draft["id"], expected_edit_token=draft["edit_token"],
        )
        plan = prepare_workflow(published["document"])
        journal = SQLiteContextV2Store(
            database_path=Path(self.tmp.name) / "code-journal.sqlite3",
            object_directory=Path(self.tmp.name) / "code-objects",
        ).bind_execution("code-execution")
        execution_store = WorkflowExecutionStore(
            journal, plan, graph_id="code-root",
            attempt=AttemptRef(GenerationRef("code-execution", "generation"), "attempt"),
        )
        runtime = SkeletonCodeRuntime(
            plan,
            source_resolver=FileCodeSourceResolver(source_root),
            profile_resolver=self.store.resolve_python_profile,
            staging_root=Path(self.tmp.name) / "code-staging",
            poll_interval_s=0.01,
        )
        runner = DurableWorkflowRunner(execution_store, {"code": runtime})
        runner.create({"value": "real"})
        self.assertEqual(runner.run().outputs, {"value": "real-python"})

    def test_saved_venv_profile_preserves_its_site_packages(self):
        venv_root = Path(self.tmp.name) / "custom-venv"
        venv.EnvBuilder(with_pip=False, symlinks=os.name != "nt").create(venv_root)
        executable = venv_root / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        site_path = Path(subprocess.check_output([
            str(executable), "-I", "-c",
            "import sysconfig; print(sysconfig.get_path('purelib'))",
        ], text=True).strip())
        (site_path / "pupu_profile_probe.py").write_text("VALUE = 42\n", encoding="utf-8")
        command = ["-I", "-c", "import pupu_profile_probe; print(pupu_profile_probe.VALUE)"]
        direct = subprocess.run([str(executable), *command], capture_output=True, text=True)
        self.assertEqual((direct.returncode, direct.stdout.strip()), (0, "42"), direct.stderr)

        self.store.save_python_profile("custom", str(executable))
        profile = self.store.resolve_python_profile("custom")
        selected = subprocess.run([*profile.command, *command], capture_output=True, text=True)
        self.assertEqual((selected.returncode, selected.stdout.strip()), (0, "42"), selected.stderr)
        self.assertEqual(profile.command[0], os.path.normpath(str(executable)))

    def test_saved_venv_profile_detects_removed_configuration(self):
        venv_root = Path(self.tmp.name) / "damaged-venv"
        venv.EnvBuilder(with_pip=False, symlinks=os.name != "nt").create(venv_root)
        executable = venv_root / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        configuration = venv_root / "pyvenv.cfg"
        self.store.save_python_profile("damaged", str(executable))
        self.store.save_draft(code_workflow(profile_id="damaged"))
        self.assertTrue(self.store.preflight("code-workflow")["ok"])

        configuration.unlink()
        with self.assertRaises(SkeletonResourceError) as changed:
            self.store.preflight("code-workflow")
        self.assertEqual(changed.exception.code, "environment_changed")

    def test_parent_preflight_validates_referenced_workflow_python_profile(self):
        venv_root = Path(self.tmp.name) / "dependency-venv"
        venv.EnvBuilder(with_pip=False, symlinks=os.name != "nt").create(venv_root)
        executable = venv_root / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        self.store.save_python_profile("dependency", str(executable))
        child = self.store.save_draft(code_workflow("child", profile_id="dependency"))
        published = self.store.publish_workflow(
            "child", expected_edit_token=child["edit_token"],
        )
        self.store.save_draft(workflow(
            "parent", call=("child", published["revision_id"]),
        ))
        self.assertTrue(self.store.preflight("parent")["ok"])
        executable.unlink()
        with self.assertRaises(SkeletonResourceError) as direct:
            self.store.preflight("child")
        self.assertIn(direct.exception.code, {"missing_runtime", "profile_unavailable"})
        with self.assertRaises(SkeletonResourceError) as transitive:
            self.store.preflight("parent")
        self.assertEqual(transitive.exception.code, direct.exception.code)
        self.assertIn("resolved_document", transitive.exception.path)

    def test_publish_is_immutable_and_fixed_dependency_closure_survives_archive(self):
        child = self.store.save_draft(workflow("child", "Child"))
        child_v1 = self.store.publish_workflow("child", expected_edit_token=child["edit_token"])
        parent = self.store.save_draft(workflow("parent", "Parent",
                                                ("child", child_v1["revision_id"])))
        parent_v1 = self.store.publish_workflow("parent", expected_edit_token=parent["edit_token"])
        self.assertEqual(parent_v1["dependencies"], [{
            "workflow_id": "child", "revision_id": child_v1["revision_id"],
            "definition_digest": child_v1["definition_digest"],
        }])
        child_doc = deepcopy(child["document"]); child_doc["name"] = "Child v2"
        child2 = self.store.save_draft(child_doc, expected_edit_token=child["edit_token"])
        child_v2 = self.store.publish_workflow("child", expected_edit_token=child2["edit_token"])
        self.assertNotEqual(child_v1["revision_id"], child_v2["revision_id"])
        self.assertEqual(self.store.get_workflow_version("parent", parent_v1["revision_id"])["dependencies"][0]["revision_id"], child_v1["revision_id"])
        archived = self.store.archive("child", expected_edit_token=child2["edit_token"])
        self.assertTrue(archived["archived"])
        self.assertEqual(self.store.get_workflow_version("child", child_v1["revision_id"])["revision_id"], child_v1["revision_id"])
        parent2_doc = workflow("parent2", "Parent 2", ("child", child_v2["revision_id"]))
        parent2 = self.store.save_draft(parent2_doc)
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.publish_workflow("parent2", expected_edit_token=parent2["edit_token"])
        self.assertEqual(caught.exception.code, "resource_archived")

    def test_cycle_missing_revision_and_physical_delete_are_rejected(self):
        root = self.store.save_draft(workflow("root"))
        version = self.store.publish_workflow("root", expected_edit_token=root["edit_token"])
        recursive = workflow("root", call=("root", version["revision_id"]))
        edited = self.store.save_draft(recursive, expected_edit_token=root["edit_token"])
        with self.assertRaises(SkeletonResourceError) as cycle:
            self.store.publish_workflow("root", expected_edit_token=edited["edit_token"])
        self.assertEqual(cycle.exception.code, "recursive_reference")
        with self.assertRaises(SkeletonResourceError) as retained:
            self.store.delete("root", expected_edit_token=edited["edit_token"])
        self.assertEqual(retained.exception.code, "resource_referenced")
        missing = self.store.save_draft(workflow("bad", call=("ghost", "rev-1")))
        with self.assertRaises(SkeletonResourceError) as absent:
            self.store.publish_workflow("bad", expected_edit_token=missing["edit_token"])
        self.assertEqual(absent.exception.code, "resource_missing")

    def test_publish_checks_transitive_archives_and_dependency_depth(self):
        leaf = self.store.save_draft(workflow("leaf"))
        leaf_version = self.store.publish_workflow("leaf", expected_edit_token=leaf["edit_token"])
        middle = self.store.save_draft(workflow(
            "middle", call=("leaf", leaf_version["revision_id"]),
        ))
        middle_version = self.store.publish_workflow(
            "middle", expected_edit_token=middle["edit_token"],
        )
        self.store.archive("leaf", expected_edit_token=leaf["edit_token"])
        root = self.store.save_draft(workflow(
            "archive-root", call=("middle", middle_version["revision_id"]),
        ))
        with self.assertRaises(SkeletonResourceError) as archived:
            self.store.publish_workflow(
                "archive-root", expected_edit_token=root["edit_token"],
            )
        self.assertEqual(archived.exception.code, "resource_archived")

        previous_id = "depth-0"
        previous = self.store.save_draft(workflow(previous_id))
        previous_version = self.store.publish_workflow(
            previous_id, expected_edit_token=previous["edit_token"],
        )
        # The published Workflow itself occupies the first runtime call-stack
        # frame, so 31 nested references is the largest valid chain.
        for depth in range(1, 32):
            resource_id = f"depth-{depth}"
            saved = self.store.save_draft(workflow(
                resource_id,
                call=(previous_id, previous_version["revision_id"]),
            ))
            previous_version = self.store.publish_workflow(
                resource_id, expected_edit_token=saved["edit_token"],
            )
            previous_id = resource_id
        too_deep = self.store.save_draft(workflow(
            "depth-32", call=(previous_id, previous_version["revision_id"]),
        ))
        with self.assertRaises(SkeletonResourceError) as depth_error:
            self.store.publish_workflow(
                "depth-32", expected_edit_token=too_deep["edit_token"],
            )
        self.assertEqual(depth_error.exception.code, "limit_depth")

    def test_publish_rejects_whitespace_padded_workflow_identity(self):
        target = self.store.save_draft(workflow("identity-target"))
        target_version = self.store.publish_workflow(
            "identity-target", expected_edit_token=target["edit_token"],
        )
        for field in ("workflow_id", "revision_id"):
            document = workflow(
                f"identity-owner-{field}",
                call=(target_version["workflow_id"], target_version["revision_id"]),
            )
            reference = next(node["config"]["workflow"] for node in document["nodes"]
                             if node["type"] == "workflow_call")
            reference[field] = f" {reference[field]} "
            saved = self.store.save_draft(document)
            with self.assertRaises(SkeletonResourceError) as rejected:
                self.store.publish_workflow(
                    saved["id"], expected_edit_token=saved["edit_token"],
                )
            self.assertEqual(rejected.exception.code, "invalid_value")
            self.assertEqual(rejected.exception.path[-1], field)

    def test_real_store_revision_drives_durable_nested_runtime_and_new_publish_does_not_retarget(self):
        child = self.store.save_draft(workflow("child", "Child"))
        child_v1 = self.store.publish_workflow("child", expected_edit_token=child["edit_token"])
        parent = self.store.save_draft(workflow("parent", "Parent", ("child", child_v1["revision_id"])))
        parent_v1 = self.store.publish_workflow("parent", expected_edit_token=parent["edit_token"])

        journal = SQLiteContextV2Store(
            database_path=Path(self.tmp.name) / "journal.sqlite3",
            object_directory=Path(self.tmp.name) / "objects",
        ).bind_execution("execution")
        plan = prepare_workflow(parent_v1["document"])
        execution_store = WorkflowExecutionStore(journal, plan, graph_id="root",
            attempt=AttemptRef(GenerationRef("execution", "generation"), "attempt"))
        calls = []
        def code(context, inputs):
            calls.append(context.graph_id)
            return WorkflowNodeCompleted({"value": inputs["value"] + "-v1"})
        runtime = SkeletonWorkflowCallRuntime(execution_store,
            self.store.resolve_published_workflow, handlers={"code": code})
        runner = DurableWorkflowRunner(execution_store, {"workflow_call": runtime})
        runner.create({"value": "fixed"})

        edited_doc = deepcopy(child["document"]); edited_doc["name"] = "Child v2"
        child2 = self.store.save_draft(edited_doc, expected_edit_token=child["edit_token"])
        self.store.publish_workflow("child", expected_edit_token=child2["edit_token"])

        result = runner.run()
        self.assertEqual(result.outputs, {"value": "fixed-v1"})
        self.assertEqual(len(calls), 1)
        self.assertIn(".child.", calls[0])

    def test_paused_child_cold_resume_keeps_the_original_published_revision(self):
        child = self.store.save_draft(workflow("child", "Child v1"))
        child_v1 = self.store.publish_workflow("child", expected_edit_token=child["edit_token"])
        parent = self.store.save_draft(workflow(
            "parent", "Parent", ("child", child_v1["revision_id"]),
        ))
        parent_v1 = self.store.publish_workflow(
            "parent", expected_edit_token=parent["edit_token"],
        )
        journal = SQLiteContextV2Store(
            database_path=Path(self.tmp.name) / "cold-journal.sqlite3",
            object_directory=Path(self.tmp.name) / "cold-objects",
        ).bind_execution("cold-execution")
        attempt = AttemptRef(GenerationRef("cold-execution", "generation"), "attempt")
        plan = prepare_workflow(parent_v1["document"])
        store = WorkflowExecutionStore(journal, plan, graph_id="cold-root", attempt=attempt)

        def waiting(_context, inputs):
            return WorkflowNodeWaiting("interaction", "child-wait", {"value": inputs["value"]})

        runtime = SkeletonWorkflowCallRuntime(
            store, self.store.resolve_published_workflow, handlers={"code": waiting},
        )
        runner = DurableWorkflowRunner(store, {"workflow_call": runtime})
        runner.create({"value": "fixed"})
        self.assertEqual(runner.run().status, "waiting")

        child_v2_document = deepcopy(child["document"])
        child_v2_document["name"] = "Child v2"
        child_v2 = self.store.save_draft(
            child_v2_document, expected_edit_token=child["edit_token"],
        )
        published_v2 = self.store.publish_workflow(
            "child", expected_edit_token=child_v2["edit_token"],
        )
        self.assertNotEqual(child_v1["revision_id"], published_v2["revision_id"])

        cold_store = WorkflowExecutionStore(journal, plan, graph_id="cold-root", attempt=attempt)
        cold_runtime = SkeletonWorkflowCallRuntime(
            cold_store, self.store.resolve_published_workflow, handlers={"code": waiting},
        )
        cold_runner = DurableWorkflowRunner(
            cold_store, {"workflow_call": cold_runtime},
        )
        root_state = cold_store.load().state
        root_invocation = root_state["active"]["node_invocation_id"]
        _record, _active, _wait, cold_child, _child_runtime = cold_runtime._active_child(
            cold_runner, root_invocation,
        )
        self.assertEqual(cold_child.store.plan.snapshot()["name"], "Child v1")
        child_state = cold_child.store.load().state
        cold_child.complete_wait(
            "child-wait", {"value": "done"},
            node_invocation_id=child_state["active"]["node_invocation_id"],
        )
        self.assertEqual(cold_child.run().status, "completed")
        completed = cold_runtime.resume_child(
            cold_runner, node_invocation_id=root_invocation,
        )
        self.assertEqual(completed.status, "completed")
        self.assertEqual(completed.outputs, {"value": "done"})

    def test_rename_preserves_identity_and_duplicate_allocates_new_identity(self):
        original = self.store.save_draft(workflow("shared", "Shared"))
        renamed = self.store.rename("shared", "Renamed", expected_edit_token=original["edit_token"])
        copied = self.store.duplicate("shared", new_id="shared-copy", name="Copy")
        self.assertEqual(renamed["id"], "shared")
        self.assertEqual(copied["id"], "shared-copy")
        self.assertNotEqual(copied["edit_token"], renamed["edit_token"])

    def test_import_is_idempotent_for_exact_content_and_rejects_identity_collision(self):
        document = workflow("imported", "Imported")
        first = self.store.import_resource(document)
        repeated = self.store.import_resource(deepcopy(document))
        self.assertEqual(repeated["id"], first["id"])
        self.assertEqual(repeated["edit_token"], first["edit_token"])
        conflicting = deepcopy(document); conflicting["name"] = "Different"
        with self.assertRaises(SkeletonResourceError) as collision:
            self.store.import_resource(conflicting)
        self.assertEqual(collision.exception.code, "import_conflict")

    def test_three_legacy_formats_resume_each_stage_and_never_change_sources(self):
        recipe = json.dumps({"name": "Legacy Recipe", "description": "old", "model": None,
                             "max_iterations": None, "agent": {"prompt_format": "soul", "prompt": "hello"},
                             "toolkits": [], "subagent_pool": []})
        template = json.dumps({"name": "Legacy Template", "description": "old",
                               "instructions": "inspect", "allowed_modes": ["delegate"],
                               "output_mode": "summary", "memory_policy": "ephemeral",
                               "parallel_safe": False, "allowed_tools": ["read"], "model": None})
        soul = "---\nname: Legacy Soul\ndescription: old\ntools: [read]\n---\nReview carefully\n"
        for index, (kind, source) in enumerate((("recipe", recipe), ("skeleton_template", template), ("soul", soul))):
            identity = f"source-{index}"
            for stage in ("discovered", "written", "validated"):
                status = self.store.migrate_legacy(source_identity=identity,
                    source_scope=f"scope-{index}", source_kind=kind, source=source,
                    stop_after_stage=stage)
                self.assertEqual(status["stage"], stage)
            active = self.store.migrate_legacy(source_identity=identity,
                source_scope=f"scope-{index}", source_kind=kind, source=source)
            self.assertEqual(active["stage"], "active")
            repeated = self.store.migrate_legacy(source_identity=identity,
                source_scope=f"scope-{index}", source_kind=kind, source=source)
            self.assertEqual(repeated["target_id"], active["target_id"])
        self.assertEqual(len(self.store.list_resources()), 3)

    def test_explicit_missing_legacy_selection_never_falls_back_to_default(self):
        default_source = json.dumps({"name": "Default", "description": "", "model": None,
            "max_iterations": None, "agent": {"prompt_format": "soul", "prompt": "default"},
            "toolkits": [], "subagent_pool": []})
        self.store.migrate_legacy(source_identity="default.recipe", source_scope="recipes",
                                  source_kind="recipe", source=default_source)
        self.assertEqual(self.store.resolve(default_if_unselected=True)["name"], "Default")
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.resolve(legacy_name="Missing", source_scope="recipes",
                               default_if_unselected=True)
        self.assertEqual(caught.exception.code, "resource_missing")
        with self.assertRaises(SkeletonResourceError) as orphan_revision:
            self.store.resolve(revision_id="rev-1", default_if_unselected=True)
        self.assertEqual(orphan_revision.exception.code, "invalid_shape")

    def test_same_name_sources_are_ambiguous_and_source_changes_fail_closed(self):
        def legacy(prompt):
            return json.dumps({"name": "Shared Legacy", "description": "", "model": None,
                "max_iterations": None,
                "agent": {"prompt_format": "soul", "prompt": prompt},
                "toolkits": [], "subagent_pool": []})

        self.store.migrate_legacy(source_identity="one.recipe", source_scope="recipes",
                                  source_kind="recipe", source=legacy("one"))
        with self.assertRaises(SkeletonResourceError) as collision:
            self.store.migrate_legacy(source_identity="two.recipe", source_scope="recipes",
                                      source_kind="recipe", source=legacy("two"))
        self.assertEqual(collision.exception.code, "legacy_name_ambiguous")
        with self.assertRaises(SkeletonResourceError) as ambiguous:
            self.store.resolve(legacy_name="Shared Legacy", source_scope="recipes")
        self.assertEqual(ambiguous.exception.code, "legacy_name_ambiguous")
        with self.assertRaises(SkeletonResourceError) as changed:
            self.store.migrate_legacy(source_identity="one.recipe", source_scope="recipes",
                                      source_kind="recipe", source=legacy("changed"))
        self.assertEqual(changed.exception.code, "migration_source_changed")

    def test_same_legacy_name_in_distinct_source_scopes_resolves_exactly(self):
        recipe = json.dumps({
            "name": "Shared", "description": "recipe", "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "recipe"},
            "toolkits": [], "subagent_pool": [],
        })
        template = json.dumps({
            "name": "Shared", "description": "template", "instructions": "template",
            "allowed_modes": ["delegate"], "output_mode": "summary",
            "memory_policy": "ephemeral", "parallel_safe": False,
            "allowed_tools": [], "model": None,
        })
        recipe_status = self.store.migrate_legacy(
            source_identity="shared.recipe", source_scope="recipes",
            source_kind="recipe", source=recipe,
        )
        template_status = self.store.migrate_legacy(
            source_identity="shared.skeleton", source_scope="subagents",
            source_kind="skeleton_template", source=template,
        )
        self.assertNotEqual(recipe_status["target_id"], template_status["target_id"])
        self.assertEqual(self.store.resolve(
            legacy_name="Shared", source_scope="recipes",
        )["id"], recipe_status["target_id"])
        self.assertEqual(self.store.resolve(
            legacy_name="Shared", source_scope="subagents",
        )["id"], template_status["target_id"])

    def test_two_store_instances_cannot_overwrite_the_same_edit_token(self):
        first_store = SkeletonResourceStore(self.root)
        second_store = SkeletonResourceStore(self.root)
        original = first_store.save_draft(workflow("shared-edit"))
        first_document = deepcopy(original["document"]); first_document["name"] = "First"
        second_document = deepcopy(original["document"]); second_document["name"] = "Second"
        saved = first_store.save_draft(
            first_document, expected_edit_token=original["edit_token"],
        )
        with self.assertRaises(SkeletonResourceError) as conflict:
            second_store.save_draft(
                second_document, expected_edit_token=original["edit_token"],
            )
        self.assertEqual(conflict.exception.code, "edit_conflict")
        self.assertEqual(second_store.get_resource("shared-edit")["name"], "First")
        self.assertEqual(second_store.get_resource("shared-edit")["edit_token"], saved["edit_token"])

    def test_real_seed_scan_is_idempotent_and_preserves_old_files(self):
        home = Path(self.tmp.name) / "home"
        recipes = home / ".pupu" / "agent_recipes"; recipes.mkdir(parents=True)
        source = recipes / "Default.recipe"
        raw = json.dumps({"name": "Default", "description": "", "model": None,
            "max_iterations": None, "agent": {"prompt_format": "soul", "prompt": "default"},
            "toolkits": [], "subagent_pool": []})
        source.write_text(raw, encoding="utf-8")
        with patch("pathlib.Path.home", return_value=home):
            first = migrate_known_legacy_sources(self.store)
            second = migrate_known_legacy_sources(self.store)
        self.assertEqual(first[0]["target_id"], second[0]["target_id"])
        self.assertEqual(source.read_text(encoding="utf-8"), raw)
        self.assertEqual(len(self.store.list_resources()), 1)

    def test_bad_legacy_file_does_not_block_later_seed_migration(self):
        home = Path(self.tmp.name) / "home"
        recipes = home / ".pupu" / "agent_recipes"; recipes.mkdir(parents=True)
        bad = recipes / "A-Broken.recipe"; bad.write_text("{broken", encoding="utf-8")
        default = recipes / "Default.recipe"
        default.write_text(json.dumps({
            "name": "Default", "description": "", "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "default"},
            "toolkits": [], "subagent_pool": [],
        }), encoding="utf-8")
        with patch("pathlib.Path.home", return_value=home):
            results = migrate_known_legacy_sources(self.store)
        self.assertEqual(results[0]["stage"], "failed")
        self.assertEqual(results[0]["error"]["code"], "invalid_json")
        self.assertEqual(results[1]["stage"], "active")
        self.assertEqual(self.store.resolve(
            legacy_name="Default", source_scope="user:agent_recipes",
        )["name"], "Default")
        self.assertEqual(bad.read_text(encoding="utf-8"), "{broken")

    def test_real_default_and_explore_seeds_migrate_once_and_default_is_unique(self):
        from recipe_seeds import ensure_recipe_seeds_written
        from subagent_seeds import ensure_seeds_written

        home = Path(self.tmp.name) / "seed-home"
        recipes = home / ".pupu" / "agent_recipes"
        subagents = home / ".pupu" / "subagents"
        ensure_seeds_written(subagents)
        ensure_recipe_seeds_written(recipes)
        with patch("pathlib.Path.home", return_value=home):
            first = migrate_known_legacy_sources(self.store)
            second = migrate_known_legacy_sources(self.store)
        self.assertEqual(
            {item["target_id"] for item in first},
            {item["target_id"] for item in second},
        )
        resources = self.store.list_resources()
        self.assertEqual({item["name"] for item in resources}, {"Default", "Explore"})
        self.assertEqual(len(resources), 2)
        recipe_explore = self.store.resolve(
            legacy_name="Explore", source_scope="user:agent_recipes",
        )
        template_explore = self.store.resolve(
            legacy_name="Explore", source_scope="user:subagents",
        )
        self.assertEqual(recipe_explore["id"], template_explore["id"])
        self.assertEqual(self.store.resolve(default_if_unselected=True)["name"], "Default")
        self.assertTrue((recipes / "Default.recipe").is_file())
        self.assertTrue((recipes / "Explore.recipe").is_file())
        self.assertTrue((subagents / "Explore.skeleton").is_file())
        with self.assertRaises(SkeletonResourceError) as unresolved_profile:
            self.store.preflight(recipe_explore["id"])
        self.assertEqual(unresolved_profile.exception.code, "legacy_profile_required")
        for selected in (recipe_explore, self.store.resolve(
                legacy_name="Default", source_scope="user:agent_recipes")):
            preflight = self.store.preflight(selected["id"], legacy_kernel=kernel_config())
            plan = prepare_agent_graph(preflight["document"])
            journal = SQLiteContextV2Store(
                database_path=Path(self.tmp.name) / f"{selected['id']}.sqlite3",
                object_directory=Path(self.tmp.name) / f"{selected['id']}-objects",
            ).bind_execution(selected["id"])
            runtime_store = WorkflowExecutionStore(
                journal, plan, graph_id="root",
                attempt=AttemptRef(GenerationRef(selected["id"], "generation"), "attempt"),
            )
            runner = DurableWorkflowRunner(runtime_store, {
                "agent": lambda _context, inputs: WorkflowNodeCompleted({
                    "message": inputs.get("text", ""), "context": {"provider": "openai"},
                }),
            })
            runner.create({"text": "hello", "images": [], "files": []})
            self.assertEqual(runner.run().outputs["message"], "hello")

        renamed = self.store.rename(
            recipe_explore["id"], "My Explore",
            expected_edit_token=self.store.get_resource(recipe_explore["id"])["edit_token"],
        )
        self.assertEqual(renamed["name"], "My Explore")
        with patch("pathlib.Path.home", return_value=home):
            rescanned = migrate_known_legacy_sources(self.store)
        self.assertTrue(all(item["stage"] == "active" for item in rescanned), rescanned)
        self.assertEqual(self.store.resolve(
            legacy_name="Explore", source_scope="user:subagents",
        )["name"], "My Explore")


class SkeletonResourceRouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.home_patch = patch("pathlib.Path.home", return_value=self.home)
        self.home_patch.start(); self.addCleanup(self.home_patch.stop)
        self.client = pupu_app.create_app().test_client()

    def test_real_http_roundtrip_draft_publish_conflict_and_resolve(self):
        create = self.client.post("/skeleton_resources", json={"document": workflow("route")})
        self.assertEqual(create.status_code, 200)
        saved = create.get_json()
        listed = self.client.get("/skeleton_resources").get_json()["resources"]
        self.assertEqual([item["id"] for item in listed], ["route"])
        publish = self.client.post("/skeleton_resources/route/publish",
            json={"expected_edit_token": saved["edit_token"]})
        self.assertEqual(publish.status_code, 200)
        revision = publish.get_json()["revision_id"]
        resolved = self.client.post("/skeleton_resources/resolve",
            json={"resource_id": "route", "revision_id": revision})
        self.assertEqual(resolved.status_code, 200)
        stale = self.client.post("/skeleton_resources", json={
            "document": workflow("route", "stale"), "expected_edit_token": "wrong"})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.get_json()["error"]["code"], "edit_conflict")
        imported = workflow("route-import", "Imported")
        first_import = self.client.post(
            "/skeleton_resources/import", json={"document": imported},
        )
        second_import = self.client.post(
            "/skeleton_resources/import", json={"document": imported},
        )
        self.assertEqual(first_import.status_code, 200)
        self.assertEqual(
            first_import.get_json()["edit_token"],
            second_import.get_json()["edit_token"],
        )

    def test_unknown_version_and_bad_explicit_ref_return_structured_errors(self):
        unknown = workflow("unknown"); unknown["schema_version"] = 2
        response = self.client.post("/skeleton_resources", json={"document": unknown})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "invalid_value")
        missing = self.client.post("/skeleton_resources/resolve", json={"resource_id": "missing"})
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.get_json()["error"]["code"], "resource_missing")

    def test_resource_routes_require_the_sidecar_auth_token(self):
        self.client.application.config["UNCHAIN_AUTH_TOKEN"] = "resource-secret"
        denied = self.client.get("/skeleton_resources")
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(denied.get_json()["error"]["path"], [])
        allowed = self.client.get(
            "/skeleton_resources",
            headers={"x-unchain-auth": "resource-secret"},
        )
        self.assertEqual(allowed.status_code, 200)

    def test_route_payloads_are_closed_and_malformed_json_is_structured(self):
        array_body = self.client.post("/skeleton_resources", json=[])
        self.assertEqual(array_body.status_code, 400)
        self.assertEqual(array_body.get_json()["error"]["code"], "invalid_type")
        malformed = self.client.post(
            "/skeleton_resources",
            data="{broken",
            content_type="application/json",
        )
        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(malformed.get_json()["error"]["code"], "invalid_json")
        unknown = self.client.post(
            "/skeleton_resources/resolve",
            json={"resource_id": "missing", "path": "/arbitrary"},
        )
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(unknown.get_json()["error"], {
            "code": "unknown_field",
            "path": ["body", "path"],
            "message": "request body contains an unknown field",
        })
        base = {
            "source_identity": "test", "source_scope": "user:agent_recipes",
            "source_kind": "recipe",
            "source": json.dumps({
                "name": "Legacy", "agent": {"prompt_format": "soul", "prompt": "hello"},
            }),
        }
        for field, value in (("source_kind", []), ("source_kind", {}), ("stop_after_stage", [])):
            response = self.client.post(
                "/skeleton_resources/migrate", json={**base, field: value},
            )
            self.assertGreaterEqual(response.status_code, 400)
            self.assertLess(response.status_code, 500)
            self.assertIn(response.get_json()["error"]["code"], {"invalid_type", "unknown_variant"})

    def test_python_profile_http_roundtrip(self):
        listed = self.client.get("/skeleton_python_profiles")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.get_json()["profiles"][0]["id"], "builtin")
        saved_response = self.client.post("/skeleton_python_profiles", json={
            "profile_id": "route-venv", "executable": sys.executable,
        })
        self.assertEqual(saved_response.status_code, 200)
        saved = saved_response.get_json()
        probe = self.client.post("/skeleton_python_profiles/route-venv/probe")
        self.assertEqual(probe.status_code, 200)
        self.assertTrue(probe.get_json()["ok"])
        stale = self.client.delete("/skeleton_python_profiles/route-venv", json={
            "expected_edit_token": "stale",
        })
        self.assertEqual(stale.status_code, 409)
        deleted = self.client.delete("/skeleton_python_profiles/route-venv", json={
            "expected_edit_token": saved["edit_token"],
        })
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.get_json()["ok"])


LEGACY_KERNEL = {
    "schema_version": 1,
    "profile": {
        "id": "legacy-choice", "provider": "openai", "model": "gpt-4.1",
        "protocol": "openai-responses",
        "endpoint": "https://api.openai.com/v1/responses",
        "credential_ref": "openai", "context_window": 128000, "output_limit": 4096,
        "capabilities": {"json_schema": True, "images": False, "files": False},
    },
    "prompt": "placeholder", "max_iterations": 1, "output_tokens": 1024,
    "history": "none", "overflow": "error", "json_schema": None,
}


def legacy_recipe(name, *, pool=None, profile=None):
    """A legacy recipe as the old builder saved one."""
    document = {
        "name": name, "description": f"{name} description",
        "model": "openai:gpt-4.1", "max_iterations": 4,
        "toolkits": [], "subagent_pool": [], "merge_with_user_selected": True,
        "nodes": [
            {"id": "start", "type": "start",
             "outputs": [{"name": "text", "type": "string"}]},
            {"id": "a1", "type": "agent", "override": {
                "prompt_format": "soul", "prompt": f"Do {name}",
                "model": "openai:gpt-4.1"}},
            {"id": "end", "type": "end"},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "start", "source_port_id": "out",
             "target_node_id": "a1", "target_port_id": "in"},
            {"id": "e2", "source_node_id": "a1", "source_port_id": "out",
             "target_node_id": "end", "target_port_id": "in"},
        ],
    }
    if profile is not None:
        document["subagent_profile"] = profile
    if pool is not None:
        document["nodes"].append(
            {"id": "pool", "type": "subagent_pool", "subagents": pool})
        document["edges"].append(
            {"id": "e3", "source_node_id": "pool", "source_port_id": "attach_top",
             "target_node_id": "a1", "target_port_id": "attach_bot"})
    return json.dumps(document)


class LegacySubagentPoolConversionTests(unittest.TestCase):
    """Acceptance 7: a legacy pool entry becomes a real Agent entry, and stays.

    The store already performed this conversion for every run, in memory, and
    threw it away afterwards; the draft kept its `legacy_fields`. So the
    settings were preserved at run time and invisible in the document, and
    nothing an author could press made it permanent.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = SkeletonResourceStore(Path(self.tmp.name) / "skeletons")

    def migrate(self, name, **kwargs):
        return self.store.migrate_legacy(
            source_identity=f"/legacy/{name}.recipe", source_scope="recipes",
            source_kind="recipe", source=legacy_recipe(name, **kwargs))

    def pool_of(self, resource_id):
        document = self.store.get_resource(resource_id)["document"]
        return next(node["config"] for node in document["nodes"]
                    if node["type"] == "subagent_pool")

    def parent_with(self, pool, *, profile=None, also=()):
        """A migrated legacy Agent whose pool holds the given legacy entries."""
        self.migrate("Summarizer", profile=profile)
        for name in also:
            self.migrate(name)
        self.migrate("Reviewer", pool=pool)
        resource_id = next(row["id"] for row in self.store.list_resources()
                           if row["name"] == "Reviewer")
        return resource_id, self.store.get_resource(resource_id)

    def test_a_referenced_legacy_subagent_is_converted_and_stored(self):
        resource_id, before = self.parent_with(
            [{"kind": "recipe_ref", "recipe_name": "Summarizer"}])
        self.assertIn("legacy_fields", self.pool_of(resource_id))

        after = self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"])

        config = self.pool_of(resource_id)
        self.assertEqual(set(config), {"subagents"})
        entry = config["subagents"][0]
        self.assertEqual(entry["name"], "Summarizer")
        self.assertEqual(entry["source"]["kind"], "agent_ref")
        self.assertEqual(
            entry["source"]["agent_id"],
            next(row["id"] for row in self.store.list_resources()
                 if row["name"] == "Summarizer"))
        self.assertNotEqual(after["edit_token"], before["edit_token"])

    def test_the_settings_are_carried_and_not_defaulted(self):
        """Tools, delegation modes, memory and parallel safety, not just a prompt."""
        resource_id, before = self.parent_with(
            [{"kind": "recipe_ref", "recipe_name": "Summarizer"}],
            profile={"allowed_modes": ["delegate", "handoff"],
                     "output_mode": "full_trace",
                     "memory_policy": "scoped_persistent",
                     "parallel_safe": False,
                     "allowed_tools": ["write", "web_fetch"],
                     "description": "summarises things"})
        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"])
        entry = self.pool_of(resource_id)["subagents"][0]
        self.assertEqual(entry["allowed_modes"], ["delegate", "handoff"])
        self.assertEqual(entry["output_mode"], "full_trace")
        self.assertEqual(entry["memory_policy"], "scoped_persistent")
        self.assertFalse(entry["parallel_safe"])
        self.assertEqual(entry["allowed_tools"], ["write", "web_fetch"])
        self.assertEqual(entry["description"], "summarises things")

    def test_an_inline_subagent_needs_a_kernel_and_says_so(self):
        """It cannot be materialised without one, and the refusal is typed."""
        resource_id, before = self.parent_with(
            [{"kind": "inline", "name": "Shortener", "prompt_format": "soul",
              "template": {"prompt": "Be brief"}}])
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.convert_legacy_pools(
                resource_id, expected_edit_token=before["edit_token"])
        self.assertEqual(caught.exception.code, "legacy_profile_required")
        self.assertIn("legacy_fields", self.pool_of(resource_id))

    def test_an_inline_subagent_becomes_an_embedded_agent_graph(self):
        resource_id, before = self.parent_with(
            [{"kind": "inline", "name": "Shortener", "prompt_format": "soul",
              "template": {"prompt": "Be brief"}}])
        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"],
            legacy_kernel=deepcopy(LEGACY_KERNEL))
        entry = self.pool_of(resource_id)["subagents"][0]
        self.assertEqual(entry["source"]["kind"], "embedded")
        child = entry["source"]["document"]
        self.assertEqual(child["kind"], "agent")
        kernels = [node for node in child["nodes"]
                   if node["type"] == "agent" and "kernel" in node["config"]]
        self.assertEqual(len(kernels), 1)
        self.assertIn("Be brief", kernels[0]["config"]["kernel"]["prompt"])
        prepare_agent_graph(deepcopy(child))

    def test_a_stale_token_changes_nothing(self):
        resource_id, before = self.parent_with(
            [{"kind": "recipe_ref", "recipe_name": "Summarizer"}])
        self.store.save_draft(before["document"],
                              expected_edit_token=before["edit_token"])
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.convert_legacy_pools(
                resource_id, expected_edit_token=before["edit_token"])
        self.assertEqual(caught.exception.code, "edit_conflict")
        self.assertIn("legacy_fields", self.pool_of(resource_id))

    def test_a_resource_with_nothing_to_convert_is_refused_rather_than_rewritten(self):
        self.migrate("Summarizer")
        resource_id = next(row["id"] for row in self.store.list_resources()
                           if row["name"] == "Summarizer")
        token = self.store.get_resource(resource_id)["edit_token"]
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.convert_legacy_pools(resource_id, expected_edit_token=token)
        self.assertEqual(caught.exception.code, "legacy_pool_absent")
        self.assertEqual(self.store.get_resource(resource_id)["edit_token"], token)

    def test_converting_twice_is_refused_the_second_time(self):
        resource_id, before = self.parent_with(
            [{"kind": "recipe_ref", "recipe_name": "Summarizer"}])
        after = self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"])
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.convert_legacy_pools(
                resource_id, expected_edit_token=after["edit_token"])
        self.assertEqual(caught.exception.code, "legacy_pool_absent")

    def test_the_converted_pool_is_one_the_runtime_admits(self):
        resource_id, before = self.parent_with(
            [{"kind": "recipe_ref", "recipe_name": "Summarizer"},
             {"kind": "ref", "template_name": "Checker"}],
            also=("Checker",))
        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"])
        config = self.pool_of(resource_id)
        validate_subagent_pool_config(
            config, ("config",),
            validate_embedded=lambda child, path: prepare_agent_graph(deepcopy(child)))
        self.assertEqual(len(config["subagents"]), 2)
        ids = [entry["id"] for entry in config["subagents"]]
        names = [entry["name"] for entry in config["subagents"]]
        self.assertEqual(len(set(ids)), 2)
        self.assertEqual(sorted(names), ["Checker", "Summarizer"])

    def test_a_malformed_kernel_keeps_its_field_diagnostic(self):
        """The runtime names the field; the author has to be told which one.

        `validate_kernel_config` answers `missing_field` at
        `legacy_kernel.profile.endpoint` and the like. Those arrived here as a
        raw `SkeletonValidationError`, which is not this store's error type, so
        the route turned every one of them into a 500 with no path at all — a
        model configuration refused for a reason nobody could read.
        """
        resource_id, before = self.parent_with(
            [{"kind": "inline", "name": "Shortener", "prompt_format": "soul",
              "template": {"prompt": "Be brief"}}])
        malformed = deepcopy(LEGACY_KERNEL)
        del malformed["profile"]["endpoint"]
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.convert_legacy_pools(
                resource_id, expected_edit_token=before["edit_token"],
                legacy_kernel=malformed)
        self.assertEqual(caught.exception.code, "missing_field")
        self.assertEqual(list(caught.exception.path),
                         ["legacy_kernel", "profile", "endpoint"])
        self.assertEqual(caught.exception.status, 400)
        self.assertIn("legacy_fields", self.pool_of(resource_id))

    def test_every_malformed_kernel_is_typed_rather_than_a_crash(self):
        resource_id, before = self.parent_with(
            [{"kind": "inline", "name": "Shortener", "prompt_format": "soul",
              "template": {"prompt": "Be brief"}}])
        cases = {
            "missing_field": {k: v for k, v in deepcopy(LEGACY_KERNEL).items()
                              if k != "profile"},
            "invalid_type": {**deepcopy(LEGACY_KERNEL), "profile": "openai:gpt-4.1"},
            "unknown_field": {**deepcopy(LEGACY_KERNEL), "temperature": 0.2},
            "unknown_variant": {**deepcopy(LEGACY_KERNEL), "history": "all"},
        }
        for code, kernel in cases.items():
            with self.subTest(code=code):
                with self.assertRaises(SkeletonResourceError) as caught:
                    self.store.convert_legacy_pools(
                        resource_id, expected_edit_token=before["edit_token"],
                        legacy_kernel=kernel)
                self.assertEqual(caught.exception.code, code)
                self.assertEqual(list(caught.exception.path)[0], "legacy_kernel")

    def test_two_legacy_entries_naming_one_Agent_are_both_kept(self):
        """Faithfully, which means the duplicate name comes with them.

        An entry is named after its target, and a legacy pool may list one
        Agent twice — or two legacy sources may share a display name. The
        runtime refuses a pool with a duplicated entry name, so such a pool
        could never run, before this conversion or after it. What changes is
        that the entries are now in the document, where the editor shows the
        duplicate and the author can rename one. Choosing a name for them here
        would be inventing user-facing data to make a validator happy.
        """
        resource_id, before = self.parent_with(
            [{"kind": "recipe_ref", "recipe_name": "Summarizer"},
             {"kind": "ref", "template_name": "Summarizer"}])
        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"])
        config = self.pool_of(resource_id)
        self.assertEqual(len(config["subagents"]), 2)
        self.assertEqual([entry["name"] for entry in config["subagents"]],
                         ["Summarizer", "Summarizer"])
        self.assertEqual(len({entry["id"] for entry in config["subagents"]}), 2)
        with self.assertRaises(SkeletonValidationError) as caught:
            validate_subagent_pool_config(
                config, ("config",),
                validate_embedded=lambda child, path: None)
        self.assertEqual(caught.exception.code, "duplicate_name")


class LegacyKernelIdentityTests(unittest.TestCase):
    """Which model the supplied Kernel may be, and where it is required.

    Tripwires for the editor's mirror. PuPu's Subagent Pool panel now decides
    whether to offer the conversion by answering these rules itself, so if the
    runtime's answers move, these go red and the mirror in
    `legacy_conversion.js` — and its frozen capture — has to move with them.
    Nothing here is a new requirement on the runtime; each case was measured
    before the mirror was written.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = SkeletonResourceStore(Path(self.tmp.name) / "skeletons")

    def migrated(self, name="Reviewer", *, pool=None):
        self.store.migrate_legacy(
            source_identity=f"/legacy/{name}.recipe", source_scope="recipes",
            source_kind="recipe", source=legacy_recipe(name, pool=pool))
        resource_id = next(row["id"] for row in self.store.list_resources()
                           if row["name"] == name)
        return resource_id, self.store.get_resource(resource_id)

    def pool_of(self, resource_id):
        document = self.store.get_resource(resource_id)["document"]
        return next(node["config"] for node in document["nodes"]
                    if node["type"] == "subagent_pool")

    @staticmethod
    def inline(model, prompt_format="skeleton"):
        template = {"prompt": "Be brief."}
        if model is not None:
            template["model"] = model
        return {"kind": "inline", "name": "Shortener",
                "prompt_format": prompt_format, "template": template}

    @staticmethod
    def kernel_for(provider, model, **over):
        kernel = deepcopy(LEGACY_KERNEL)
        kernel["profile"]["provider"] = provider
        kernel["profile"]["model"] = model
        kernel.update(over)
        return kernel

    def test_an_inline_entry_keeps_the_model_it_declares(self):
        """A conversion onto a different model is refused, not performed."""
        resource_id, before = self.migrated(
            pool=[self.inline("openai:gpt-4.1")])
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.convert_legacy_pools(
                resource_id, expected_edit_token=before["edit_token"],
                legacy_kernel=self.kernel_for("anthropic", "claude-x"))
        self.assertEqual(caught.exception.code, "identity_mismatch")
        self.assertEqual(caught.exception.status, 400)
        # Nothing is written, so the entries are still legacy afterwards.
        self.assertIn("legacy_fields", self.pool_of(resource_id))

        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"],
            legacy_kernel=deepcopy(LEGACY_KERNEL))
        entry = self.pool_of(resource_id)["subagents"][0]
        self.assertEqual(entry["source"]["kind"], "embedded")

    def test_the_declared_model_is_compared_on_pythons_own_stripping(self):
        """`str.strip()`, which is not `trim()`: five characters differ.

        The editor mirrors this with a measured Python whitespace set rather
        than `trim()`, because the two disagree in both directions — a C1
        control is stripped by Python and kept by JavaScript, a byte order
        mark the other way round.
        """
        cases = [("\u001fopenai:gpt-4.1", True),
                 ("openai:gpt-4.1\u0085", True),
                 ("\u00a0openai:gpt-4.1", True),
                 ("\ufeffopenai:gpt-4.1", False),
                 ("openai:gpt-4.1\ufeff", False)]
        for index, (model, accepted) in enumerate(cases):
            with self.subTest(model=model.encode("unicode_escape").decode()):
                resource_id, before = self.migrated(
                    name=f"Padded {index}", pool=[self.inline(model)])
                if accepted:
                    self.store.convert_legacy_pools(
                        resource_id, expected_edit_token=before["edit_token"],
                        legacy_kernel=deepcopy(LEGACY_KERNEL))
                    self.assertEqual(
                        set(self.pool_of(resource_id)), {"subagents"})
                else:
                    with self.assertRaises(SkeletonResourceError) as caught:
                        self.store.convert_legacy_pools(
                            resource_id,
                            expected_edit_token=before["edit_token"],
                            legacy_kernel=deepcopy(LEGACY_KERNEL))
                    self.assertEqual(caught.exception.code, "identity_mismatch")

    def test_the_declared_model_splits_on_the_first_colon_only(self):
        """So a tagged Ollama name is a model, and bare it is a provider."""
        resource_id, before = self.migrated(pool=[self.inline("ollama:llama3:8b")])
        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"],
            legacy_kernel=self.kernel_for("ollama", "llama3:8b"))
        self.assertEqual(set(self.pool_of(resource_id)), {"subagents"})

        other_id, other = self.migrated(name="Bare", pool=[self.inline("llama3:8b")])
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.convert_legacy_pools(
                other_id, expected_edit_token=other["edit_token"],
                legacy_kernel=self.kernel_for("ollama", "llama3:8b"))
        self.assertEqual(caught.exception.code, "identity_mismatch")

    def test_a_soul_format_inline_entry_loses_the_model_it_declared(self):
        """Recorded as it is, not worked around.

        The store builds the soul text itself and its frontmatter carries no
        model line, so an entry's `template["model"]` never reaches the
        runtime and every profile is accepted. That is a gap on this side of
        acceptance 7 — the model is lost rather than preserved — and the
        editor states nothing about a soul entry's model because of it.
        Repairing it here should turn this test red.
        """
        resource_id, before = self.migrated(
            pool=[self.inline("openai:gpt-4.1", prompt_format="soul")])
        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"],
            legacy_kernel=self.kernel_for("anthropic", "claude-x"))
        child = self.pool_of(resource_id)["subagents"][0]["source"]["document"]
        kernel = next(node["config"]["kernel"] for node in child["nodes"]
                      if node["type"] == "agent" and "kernel" in node["config"])
        self.assertEqual(kernel["profile"]["model"], "claude-x")

    def test_the_supplied_kernel_is_carried_except_for_the_prompt(self):
        """Which is why the editor drops the parent's schema before handing it.

        `materialize_legacy_agent` copies the supplied Kernel into every
        Agent it builds and replaces only the prompt, so a `json_schema` left
        in would be the parent's output contract imposed on each subagent.
        """
        resource_id, before = self.migrated(pool=[self.inline(None)])
        supplied = self.kernel_for(
            "openai", "gpt-4.1", history="none", overflow="compress",
            output_tokens=999,
            json_schema={"type": "object", "properties": {"a": {"type": "string"}},
                         "required": ["a"], "additionalProperties": False})
        self.store.convert_legacy_pools(
            resource_id, expected_edit_token=before["edit_token"],
            legacy_kernel=deepcopy(supplied))
        child = self.pool_of(resource_id)["subagents"][0]["source"]["document"]
        kernel = next(node["config"]["kernel"] for node in child["nodes"]
                      if node["type"] == "agent" and "kernel" in node["config"])
        self.assertEqual(kernel["prompt"], "Be brief.")
        self.assertEqual(kernel["json_schema"], supplied["json_schema"])
        self.assertEqual(kernel["history"], "none")
        self.assertEqual(kernel["overflow"], "compress")
        self.assertEqual(kernel["output_tokens"], 999)

    def test_checking_a_migrated_agent_needs_the_same_kernel(self):
        """"Check it can run" could not succeed on a migrated Agent at all.

        `preflight` asks for a Kernel for ANY migrated Agent, pool or no
        pool, because it builds the executable document out of the legacy
        data and the one supplied. Nothing in PuPu was passing one.
        """
        resource_id, _ = self.migrated(name="Plain")
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.preflight(resource_id)
        self.assertEqual(caught.exception.code, "legacy_profile_required")
        self.assertEqual(list(caught.exception.path), ["legacy_kernel"])
        self.assertEqual(caught.exception.status, 400)

        admitted = self.store.preflight(
            resource_id, legacy_kernel=deepcopy(LEGACY_KERNEL))
        self.assertTrue(admitted["ok"])
        self.assertTrue(admitted["definition_digest"])

    def test_checking_it_also_holds_the_agent_to_its_own_declared_model(self):
        resource_id, _ = self.migrated(name="Plain")
        with self.assertRaises(SkeletonResourceError) as caught:
            self.store.preflight(
                resource_id,
                legacy_kernel=self.kernel_for("anthropic", "claude-x"))
        self.assertEqual(caught.exception.code, "identity_mismatch")


if __name__ == "__main__":
    unittest.main()
