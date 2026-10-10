"""CP17 / AC-021: recursive Workflow admission and frozen resolution probes."""
from __future__ import annotations

from copy import deepcopy
import importlib
import json
import os
import sqlite3
import subprocess
import sys
import threading
from unittest.mock import Mock

import pytest

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_store import agent, workflow, code_workflow, binding, output
from test_skeleton_chat_selection import _options, _resource
from unchain.journal import AttemptRef, GenerationRef
from unchain.persistence import SQLiteContextV2Store
from unchain.skeleton import WorkflowNodeCompleted, prepare_agent_graph, prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime


def _api():
    # Resolve inside each test so the producer/helper absence is reported as RED,
    # rather than preventing the rest of the module from being collected.
    return importlib.import_module("skeleton_workflow_snapshot")


def _publish(store, document):
    saved = store.save_draft(document)
    return store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])


def _publish_chain(store, count, prefix):
    """Publish count Workflow frames, each calling the next fixed revision."""
    reference = None
    versions = []
    for index in reversed(range(count)):
        resource_id = f"{prefix}-{index}"
        version = _publish(store, workflow(resource_id, call=reference))
        versions.insert(0, version)
        reference = (resource_id, version["revision_id"])
    return versions


def _hook(document, workflow_id, revision_id):
    document = deepcopy(document)
    kernel = next(node for node in document["nodes"] if node["type"] == "agent")
    document["nodes"].append({"id": "hooks", "type": "hooks_pool", "config": {"hooks": [{
        "id": "policy", "order": 10, "event": "before_tool_call", "tool_name": None,
        "workflow": {"workflow_id": workflow_id, "revision_id": revision_id},
        "force_approval": False,
    }]}})
    document["edges"].append({"id": "attach-hooks", "kind": "attach",
        "source_node_id": kernel["id"], "source_port_id": "attach_bot",
        "target_node_id": "hooks", "target_port_id": "attach_top"})
    return document


def _hooks(document, refs):
    document = deepcopy(document)
    kernel = next(node for node in document["nodes"] if node["type"] == "agent")
    document["nodes"].append({"id": "hooks", "type": "hooks_pool", "config": {"hooks": [
        {"id": f"policy-{index}", "order": index, "event": "before_tool_call",
         "tool_name": None, "workflow": {"workflow_id": workflow_id,
                                             "revision_id": revision_id},
         "force_approval": False}
        for index, (workflow_id, revision_id) in enumerate(refs)
    ]}})
    document["edges"].append({"id": "attach-hooks", "kind": "attach",
        "source_node_id": kernel["id"], "source_port_id": "attach_bot",
        "target_node_id": "hooks", "target_port_id": "attach_top"})
    return document


def _select_agent(store, resource_id):
    selection_api = importlib.import_module("skeleton_chat_selection")
    return selection_api.prepare_skeleton_chat_selection(
        _options(_resource(resource_id)), store=store)


def _selection_copy(selection, **changes):
    value = selection.to_dict()
    value.update(changes)
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"),
                           ensure_ascii=False, allow_nan=False).encode("utf-8")
    return type(selection)(canonical)


def _agent_with_own_workflow_call(resource_id, revision_id):
    document = agent(resource_id)
    call = {"id": "call-self", "type": "workflow_call", "config": {
        "workflow": {"workflow_id": resource_id, "revision_id": revision_id},
        "execution": {"inputs": [binding("value", "kernel", ["message"])],
                      "outputs": [output("value", "result", ["value"])]},
    }}
    document["nodes"].insert(2, call)
    document["nodes"][-1]["config"]["execution"]["inputs"] = [
        binding("message", "call-self", ["value"])]
    document["edges"][1]["target_node_id"] = "call-self"
    document["edges"].append({"id": "call-end", "kind": "flow",
        "source_node_id": "call-self", "source_port_id": "out",
        "target_node_id": "end", "target_port_id": "in"})
    return document


def test_real_preflight_unions_root_hook_and_transitive_workflow_dependencies(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    leaf = _publish(store, workflow("leaf"))
    through_call = _publish(store, workflow("call-parent", call=("leaf", leaf["revision_id"])))
    hook_leaf = _publish(store, workflow("hook-leaf"))

    child = _hook(agent("child"), hook_leaf["workflow_id"], hook_leaf["revision_id"])

    root = agent("root", child_source={"kind": "embedded", "document": child})
    root = _hook(root, through_call["workflow_id"], through_call["revision_id"])
    saved = store.save_draft(root)
    admitted = store.preflight(saved["id"])
    expected = [
        (leaf["workflow_id"], leaf["revision_id"], leaf["definition_digest"]),
        (through_call["workflow_id"], through_call["revision_id"], through_call["definition_digest"]),
        (hook_leaf["workflow_id"], hook_leaf["revision_id"], hook_leaf["definition_digest"]),
    ]
    actual = [(item["workflow_id"], item["revision_id"], item["definition_digest"])
              for item in admitted["dependencies"]]
    assert actual == sorted(expected)
    assert set(admitted) == {"ok", "id", "kind", "definition_digest", "edit_token",
                             "document", "diagnostics", "dependencies", "subagents"}


def test_recursive_hook_reference_missing_is_rejected_by_real_preflight(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    broken = _hook(agent("broken"), "absent-workflow", "rev-absent")
    saved = store.save_draft(broken)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.code == "resource_missing"
    assert rejected.value.path == ("document", "nodes", 3, "config", "hooks", 0, "workflow")


def test_referenced_child_hooks_and_nested_workflow_calls_join_the_root_closure(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    leaf = _publish(store, workflow("nested-leaf"))
    middle = _publish(store, workflow("nested-middle", call=("nested-leaf", leaf["revision_id"])))
    child = _hooks(agent("referenced-child"), [
        (middle["workflow_id"], middle["revision_id"]),
        (middle["workflow_id"], middle["revision_id"]),
    ])
    child_saved = store.save_draft(child)
    root = agent("referencing-root", child_source={"kind": "agent_ref", "agent_id": child_saved["id"]})
    root_saved = store.save_draft(root)
    admitted = store.preflight(root_saved["id"])
    assert [(item["workflow_id"], item["revision_id"], item["definition_digest"])
            for item in admitted["dependencies"]] == sorted([
                (leaf["workflow_id"], leaf["revision_id"], leaf["definition_digest"]),
                (middle["workflow_id"], middle["revision_id"], middle["definition_digest"]),
            ])
    assert admitted["subagents"][0]["agent_id"] == child_saved["id"]


def test_root_dependency_union_deduplicates_pairs_but_keeps_distinct_revisions(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    first = _publish(store, workflow("two-revisions", "v1"))
    changed = workflow("two-revisions", "v2")
    token = store.get_resource("two-revisions")["edit_token"]
    draft = store.save_draft(changed, expected_edit_token=token)
    second = store.publish_workflow("two-revisions", expected_edit_token=draft["edit_token"])
    assert first["revision_id"] != second["revision_id"]
    root = _hooks(agent("revision-root"), [
        ("two-revisions", first["revision_id"]),
        ("two-revisions", first["revision_id"]),
        ("two-revisions", second["revision_id"]),
    ])
    saved = store.save_draft(root)
    admitted = store.preflight(saved["id"])
    expected = sorted([
        ("two-revisions", first["revision_id"], first["definition_digest"]),
        ("two-revisions", second["revision_id"], second["definition_digest"]),
    ])
    actual = [(item["workflow_id"], item["revision_id"], item["definition_digest"])
              for item in admitted["dependencies"]]
    assert actual == expected


@pytest.mark.parametrize("count,should_pass", [(256, True), (257, False)])
def test_preflight_enforces_global_unique_workflow_limit(tmp_path, count, should_pass):
    store = SkeletonResourceStore(tmp_path / "resources")
    refs = []
    for index in range(count):
        workflow_id = f"limit-{index:03d}"
        published = _publish(store, workflow(workflow_id))
        refs.append((workflow_id, published["revision_id"]))
    saved = store.save_draft(_hooks(agent("limit-root"), refs))
    if should_pass:
        result = store.preflight(saved["id"])
        assert len(result["dependencies"]) == count
    else:
        with pytest.raises(SkeletonResourceError) as rejected:
            store.preflight(saved["id"])
        assert rejected.value.code in {"limit_dependencies", "limit_total"}


def test_preflight_keeps_one_sqlite_snapshot_during_author_cas(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    first = _publish(store, workflow("cas-child", "v1"))
    token = store.get_resource("cas-child")["edit_token"]
    second_doc = workflow("cas-child", "v2")
    second_draft = store.save_draft(second_doc, expected_edit_token=token)
    second = store.publish_workflow("cas-child", expected_edit_token=second_draft["edit_token"])
    parent = store.save_draft(_hooks(agent("cas-parent"), [
        ("cas-child", first["revision_id"]), ("cas-child", second["revision_id"]),
    ]))
    original = store._published_row
    first_read = threading.Event()
    writer_done = threading.Event()
    calls = 0

    def writer():
        first_read.wait(timeout=5)
        latest = store.get_resource("cas-child")
        store.archive("cas-child", expected_edit_token=latest["edit_token"])
        writer_done.set()

    worker = threading.Thread(target=writer, daemon=True)
    worker.start()

    def observed(connection, workflow_id, revision_id):
        nonlocal calls
        result = original(connection, workflow_id, revision_id)
        calls += 1
        if calls == 1:
            first_read.set()
            assert writer_done.wait(timeout=5)
        return result

    store._published_row = observed
    admitted = store.preflight(parent["id"])
    # If current code never scans the Hook refs, release the waiting author so
    # this expected RED leaves no background thread mutating the fixture.
    if not first_read.is_set():
        first_read.set()
    worker.join(timeout=5)
    assert not worker.is_alive()
    assert calls >= 2
    assert {item["revision_id"] for item in admitted["dependencies"]} == {
        first["revision_id"], second["revision_id"]}
    with pytest.raises(SkeletonResourceError) as fresh:
        store.preflight(parent["id"])
    assert fresh.value.code == "resource_archived"


def test_child_hook_workflow_with_invalid_python_profile_is_rejected(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    store.save_python_profile("nested-profile", sys.executable)
    code_document = code_workflow("profiled-workflow", profile_id="nested-profile")
    published = _publish(store, code_document)
    child = _hook(agent("profile-child"), published["workflow_id"], published["revision_id"])
    child_saved = store.save_draft(child)
    root = agent("profile-root", child_source={"kind": "agent_ref", "agent_id": child_saved["id"]})
    root_saved = store.save_draft(root)
    with sqlite3.connect(store.database_path) as connection:
        connection.execute("UPDATE python_profiles SET executable=? WHERE profile_id=?",
                           (str(tmp_path / "removed-python"), "nested-profile"))
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(root_saved["id"])
    assert rejected.value.code in {"missing_runtime", "profile_unavailable"}
    assert "resolved_document" in rejected.value.path


def test_direct_embedded_agent_cannot_call_workflow_with_its_own_resource_id(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("embedded-self"))
    child = _agent_with_own_workflow_call("embedded-self", published["revision_id"])
    root = agent("direct-owner", child_source={"kind": "embedded", "document": child})
    saved = store.save_draft(root)
    try:
        store.preflight(saved["id"])
        admission_error = None
    except SkeletonResourceError as exc:
        admission_error = exc

    # Keep the independent Unchain consumer's established behavior in view:
    # when handed the actual embedded graph it rejects this recursive call.
    journal = SQLiteContextV2Store(
        database_path=tmp_path / "runtime-journal.sqlite3",
        object_directory=tmp_path / "runtime-objects",
    ).bind_execution("embedded-self-runtime")
    graph = prepare_agent_graph(child)
    execution_store = WorkflowExecutionStore(
        journal, graph, graph_id="embedded-self", attempt=AttemptRef(
            GenerationRef("embedded-self-runtime", "generation"), "attempt"),
    )
    with pytest.raises(SkeletonValidationError) as runtime_error:
        SkeletonWorkflowCallRuntime(execution_store, store.resolve_published_workflow)
    assert runtime_error.value.code == "recursive_reference"
    assert admission_error is not None
    assert admission_error.code == "recursive_reference"


def test_transitive_embedded_agent_cannot_call_workflow_with_its_own_id(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("deep-self"))
    leaf = _agent_with_own_workflow_call("deep-self", published["revision_id"])
    middle = agent("middle-embedded", child_source={"kind": "embedded", "document": leaf})
    root = agent("transitive-owner", child_source={"kind": "embedded", "document": middle})
    saved = store.save_draft(root)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.code == "recursive_reference"


def test_freezer_rechecks_mutated_valid_embedded_child_identity_at_consumer_boundary(tmp_path):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("embedded-self"))
    valid_child = agent("embedded-self")
    root = agent("consumer-boundary", child_source={
        "kind": "embedded", "document": valid_child,
    })
    root = _hook(root, "embedded-self", published["revision_id"])
    saved = store.save_draft(root)
    selected = _select_agent(store, saved["id"])

    # Fault injection at the producer/consumer boundary: retain a genuine
    # FrozenSkeletonChatSelection but replace both embedded document copies and
    # their computed execution digests with a well-formed self-reference.
    mutated = selected.to_dict()
    child = _agent_with_own_workflow_call("embedded-self", published["revision_id"])
    child_digest = execution_definition_digest(prepare_agent_graph(child))
    pool = next(node for node in mutated["document"]["nodes"]
                if node["type"] == "subagent_pool")
    pool["config"]["subagents"][0]["source"]["document"] = deepcopy(child)
    child_record = mutated["subagents"][0]
    child_record["document"] = deepcopy(child)
    child_record["definition_digest"] = child_digest
    mutated["definition_digest"] = execution_definition_digest(
        prepare_agent_graph(mutated["document"]))
    injected = _selection_copy(selected, **mutated)
    with pytest.raises((SkeletonResourceError, SkeletonValidationError)) as rejected:
        snapshot_api.freeze_skeleton_workflow_dependencies(injected, store=store)
    assert rejected.value.code in {"recursive_reference", "dependency_conflict"}


def test_workflow_snapshot_freezes_real_selected_versions_for_runtime(tmp_path):
    selection_api = importlib.import_module("skeleton_chat_selection")
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    leaf = _publish(store, workflow("leaf", "Leaf v1"))
    root = _publish(store, workflow("root", "Root v1", ("leaf", leaf["revision_id"])))
    agent_draft = store.save_draft(_hook(agent("agent"), "root", root["revision_id"]))
    selected = selection_api.prepare_skeleton_chat_selection(
        _options(_resource(agent_draft["id"])), store=store)
    frozen = snapshot_api.freeze_skeleton_workflow_dependencies(selected, store=store)
    before = frozen.to_dict()
    digest = frozen.snapshot_digest
    assert set(before) == {"schema", "workflows"}
    assert before["schema"] == "pupu.skeleton_workflow_snapshot.v1"
    assert [set(item) for item in before["workflows"]] == [
        {"workflow_id", "revision_id", "definition_digest", "document"},
        {"workflow_id", "revision_id", "definition_digest", "document"}]
    assert frozen.resolve("leaf", leaf["revision_id"]).document["name"] == "Leaf v1"
    detached = frozen.to_dict()
    detached["workflows"][0]["document"]["name"] = "caller mutation"
    assert frozen.to_dict() == before and frozen.snapshot_digest == digest
    from unchain.skeleton.errors import SkeletonValidationError
    with pytest.raises(SkeletonValidationError):
        frozen.resolve("unknown", "revision")


def test_workflow_snapshot_resolver_does_not_fall_back_to_live_store(tmp_path):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("fixed"))
    agent_draft = store.save_draft(_hook(agent("agent"), "fixed", published["revision_id"]))
    selected = _select_agent(store, agent_draft["id"])
    frozen = snapshot_api.freeze_skeleton_workflow_dependencies(selected, store=store)
    store.get_workflow_version = lambda *_args: (_ for _ in ()).throw(
        AssertionError("frozen resolver consulted live store"))
    assert frozen.resolve("fixed", published["revision_id"]).document["id"] == "fixed"


@pytest.mark.parametrize("mutation,code,status", [
    ("extra", "skeleton_dependency_snapshot_invalid", 503),
    ("identity", "dependency_conflict", 409),
    ("digest", "dependency_conflict", 409),
    ("document-id", "dependency_conflict", 409),
    ("private", "skeleton_dependency_snapshot_failed", 503),
])
def test_snapshot_rejects_bad_real_store_version_payload_without_leaking_private_error(
        tmp_path, mutation, code, status):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("strict"))
    agent_draft = store.save_draft(_hook(agent("strict-agent"), "strict", published["revision_id"]))
    selected = _select_agent(store, agent_draft["id"])
    original = store.get_workflow_version
    calls = []

    def malformed(workflow_id, revision_id):
        calls.append((workflow_id, revision_id))
        if mutation == "private":
            raise RuntimeError("private-sentinel-4d66b7")
        payload = original(workflow_id, revision_id)
        if mutation == "extra":
            return {**payload, "unexpected": "field"}
        if mutation == "identity":
            return {**payload, "workflow_id": "other-id"}
        if mutation == "digest":
            return {**payload, "definition_digest": "0" * 64}
        return {**payload, "document": {**payload["document"], "id": "other-id"}}

    store.get_workflow_version = malformed
    with pytest.raises(SkeletonResourceError) as rejected:
        snapshot_api.freeze_skeleton_workflow_dependencies(selected, store=store)
    assert (rejected.value.code, rejected.value.status) == (code, status)
    assert len(calls) == 1
    assert "private-sentinel-4d66b7" not in str(rejected.value)


@pytest.mark.parametrize("corruption,error_code", [
    ("duplicate-same-value-key", "duplicate_name"),
    ("nonfinite-json", "invalid_json"),
])
def test_freezer_preserves_strict_store_parse_error_from_corrupted_version_artifact(
        tmp_path, corruption, error_code):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("corrupt-version"))
    agent_saved = store.save_draft(_hook(
        agent("corrupt-version-agent"), "corrupt-version", published["revision_id"]))
    selected = _select_agent(store, agent_saved["id"])
    original = store.get_workflow_version("corrupt-version", published["revision_id"])
    canonical = json.dumps(original["document"], sort_keys=True, separators=(",", ":"),
                           ensure_ascii=False, allow_nan=False)
    if corruption == "duplicate-same-value-key":
        marker = '"id":"corrupt-version"'
        assert canonical.count(marker) == 1
        corrupted = canonical.replace(marker, marker + ',' + marker, 1)
    else:
        corrupted = canonical[:-1] + ',"injected_nonfinite":NaN}'
    with sqlite3.connect(store.database_path) as connection:
        connection.execute(
            "UPDATE workflow_versions SET definition_json=? WHERE workflow_id=? AND revision_id=?",
            (corrupted, "corrupt-version", published["revision_id"]),
        )

    # This is deliberate on-disk artifact fault injection after a valid publish
    # and selection, not a producer-generated invalid resource.
    with pytest.raises(SkeletonResourceError) as direct_read:
        store.get_workflow_version("corrupt-version", published["revision_id"])
    assert direct_read.value.code == error_code
    with pytest.raises(SkeletonResourceError) as consumer_read:
        snapshot_api.freeze_skeleton_workflow_dependencies(selected, store=store)
    assert (consumer_read.value.code, consumer_read.value.path,
            consumer_read.value.status) == (direct_read.value.code, direct_read.value.path,
                                             direct_read.value.status)


def test_archived_workflow_version_remains_readable_and_freezable(tmp_path):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("archive-retained"))
    agent_saved = store.save_draft(_hook(
        agent("archive-retained-agent"), "archive-retained", published["revision_id"]))
    selected = _select_agent(store, agent_saved["id"])
    resource = store.get_resource("archive-retained")
    store.archive("archive-retained", expected_edit_token=resource["edit_token"])
    fetched = store.get_workflow_version("archive-retained", published["revision_id"])
    assert fetched["revision_id"] == published["revision_id"]
    frozen = snapshot_api.freeze_skeleton_workflow_dependencies(selected, store=store)
    assert frozen.resolve("archive-retained", published["revision_id"]).document["id"] == "archive-retained"


@pytest.mark.parametrize("closure_change", ["missing", "extra"])
def test_snapshot_rejects_selected_metadata_that_does_not_match_actual_hook_closure(
        tmp_path, closure_change):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    target = _publish(store, workflow("selected-dependency"))
    other = _publish(store, workflow("unselected-dependency"))
    agent_saved = store.save_draft(_hook(agent("closure-agent"),
                                         "selected-dependency", target["revision_id"]))
    selected = _select_agent(store, agent_saved["id"])
    item = {"workflow_id": other["workflow_id"], "revision_id": other["revision_id"],
            "definition_digest": other["definition_digest"]}
    dependencies = selected.to_dict()["dependencies"]
    if closure_change == "missing":
        dependencies = []
    else:
        dependencies = [*dependencies, item]
    malformed = _selection_copy(selected, dependencies=dependencies)
    with pytest.raises(SkeletonResourceError) as rejected:
        snapshot_api.freeze_skeleton_workflow_dependencies(malformed, store=store)
    assert (rejected.value.code, rejected.value.status) == ("dependency_conflict", 409)


def test_snapshot_reads_each_fixed_version_once_and_survives_edit_publish_archive_and_reopen(tmp_path):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    child_v1 = _publish(store, workflow("frozen-child", "Child v1"))
    parent = _publish(store, workflow("frozen-parent", "Parent v1",
                                       ("frozen-child", child_v1["revision_id"])))
    agent_saved = store.save_draft(_hook(agent("frozen-agent"), "frozen-parent",
                                         parent["revision_id"]))
    selected = _select_agent(store, agent_saved["id"])
    original_get = store.get_workflow_version
    reads = Mock(wraps=original_get)
    store.get_workflow_version = reads
    frozen = snapshot_api.freeze_skeleton_workflow_dependencies(selected, store=store)
    assert reads.call_count == 2
    assert {(args.args[0], args.args[1]) for args in reads.call_args_list} == {
        ("frozen-parent", parent["revision_id"]),
        ("frozen-child", child_v1["revision_id"]),
    }
    before = frozen.to_dict()
    digest = frozen.snapshot_digest
    edited = store.save_draft(workflow("frozen-child", "Child v2"),
                              expected_edit_token=store.resolve(resource_id="frozen-child")["edit_token"])
    store.publish_workflow("frozen-child", expected_edit_token=edited["edit_token"])
    store.archive("frozen-child", expected_edit_token=edited["edit_token"])
    detached = frozen.to_dict()
    detached["workflows"][0]["document"]["name"] = "caller-corruption"
    cold_store = SkeletonResourceStore(store.root)
    cold_store.get_workflow_version = lambda *_args: (_ for _ in ()).throw(
        AssertionError("frozen object attempted cold-store lookup"))
    assert frozen.to_dict() == before
    assert frozen.snapshot_digest == digest
    assert frozen.resolve("frozen-child", child_v1["revision_id"]).document["name"] == "Child v1"


@pytest.mark.parametrize("surface", ["call", "hook"])
@pytest.mark.parametrize("field", ["workflow_id", "revision_id"])
def test_preflight_rejects_noncanonical_workflow_identity_without_metadata_rewrite(
    tmp_path, surface, field,
):
    store = SkeletonResourceStore(tmp_path / "resources")
    published = _publish(store, workflow("exact-target"))
    exact = {"workflow_id": published["workflow_id"],
             "revision_id": published["revision_id"]}

    if surface == "call":
        valid = _agent_with_own_workflow_call("valid-root", exact["revision_id"])
        valid["nodes"][2]["config"]["workflow"]["workflow_id"] = exact["workflow_id"]
        invalid = _agent_with_own_workflow_call("invalid-root", exact["revision_id"])
        invalid["nodes"][2]["config"]["workflow"]["workflow_id"] = exact["workflow_id"]
        reference_path = ("document", "nodes", 2, "config", "workflow")
    else:
        valid = _hook(agent("valid-root"), exact["workflow_id"], exact["revision_id"])
        invalid = _hook(agent("invalid-root"), exact["workflow_id"], exact["revision_id"])
        reference_path = ("document", "nodes", 3, "config", "hooks", 0, "workflow")

    invalid_ref = (
        invalid["nodes"][2]["config"]["workflow"]
        if surface == "call"
        else invalid["nodes"][3]["config"]["hooks"][0]["workflow"]
    )
    invalid_ref[field] = f" {exact[field]} "

    valid_saved = store.save_draft(valid)
    assert store.preflight(valid_saved["id"])["dependencies"]
    selected = _select_agent(store, valid_saved["id"])
    frozen = _api().freeze_skeleton_workflow_dependencies(selected, store=store)
    assert frozen.resolve(exact["workflow_id"], exact["revision_id"]).document == published["document"]

    invalid_saved = store.save_draft(invalid)
    assert invalid_saved["document"] == invalid
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(invalid_saved["id"])
    assert rejected.value.code == "invalid_value"
    expected_field = "workflow_id" if field == "workflow_id" else "revision_id"
    assert rejected.value.path == reference_path + (expected_field,)


@pytest.mark.parametrize("count,accepted", [(31, True), (32, False)])
def test_root_agent_workflow_depth_matches_runtime_stack_limit(tmp_path, count, accepted):
    store = SkeletonResourceStore(tmp_path / "resources")
    versions = _publish_chain(store, count, f"root-depth-{count}")
    root = _agent_with_own_workflow_call(
        f"root-depth-agent-{count}", versions[0]["revision_id"],
    )
    root["nodes"][2]["config"]["workflow"]["workflow_id"] = versions[0]["workflow_id"]
    saved = store.save_draft(root)

    if accepted:
        admitted = store.preflight(saved["id"])
        selected = _select_agent(store, saved["id"])
        frozen = _api().freeze_skeleton_workflow_dependencies(selected, store=store)
        assert len(admitted["dependencies"]) == count
        assert len(frozen.dependencies) == count
    else:
        with pytest.raises(SkeletonResourceError) as rejected:
            store.preflight(saved["id"])
        assert rejected.value.code == "limit_depth"


@pytest.mark.parametrize("count,accepted", [(30, True), (31, False)])
def test_embedded_subagent_hook_depth_counts_both_agent_frames(tmp_path, count, accepted):
    store = SkeletonResourceStore(tmp_path / "resources")
    versions = _publish_chain(store, count, f"child-depth-{count}")
    child = _hook(agent(f"child-depth-agent-{count}"),
                  versions[0]["workflow_id"], versions[0]["revision_id"])
    root = agent(f"parent-depth-agent-{count}",
                 child_source={"kind": "embedded", "document": child})
    saved = store.save_draft(root)

    if accepted:
        admitted = store.preflight(saved["id"])
        selected = _select_agent(store, saved["id"])
        frozen = _api().freeze_skeleton_workflow_dependencies(selected, store=store)
        assert len(admitted["dependencies"]) == count
        assert len(frozen.dependencies) == count
    else:
        with pytest.raises(SkeletonResourceError) as rejected:
            store.preflight(saved["id"])
        assert rejected.value.code == "limit_depth"


def test_shared_workflow_subtree_is_rechecked_at_deeper_hook_placement(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    chain = _publish_chain(store, 31, "shared-depth")
    wrapper = _publish(store, workflow(
        "shared-depth-wrapper",
        call=(chain[0]["workflow_id"], chain[0]["revision_id"]),
    ))
    # The shallow hook is encountered first. The wrapper then places the same
    # 31-frame subtree at depth three, beyond the root-inclusive limit of 32.
    root = _hooks(agent("shared-depth-root"), [
        (chain[0]["workflow_id"], chain[0]["revision_id"]),
        (wrapper["workflow_id"], wrapper["revision_id"]),
    ])
    saved = store.save_draft(root)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.code == "limit_depth"

    # Exercise the freezer independently with a strict, internally consistent
    # selection envelope so Store rejection cannot mask a freezer regression.
    freezer_root = _hooks(agent("shared-depth-freezer-root"), [
        (chain[0]["workflow_id"], chain[0]["revision_id"]),
        (wrapper["workflow_id"], wrapper["revision_id"]),
    ])
    baseline = store.save_draft(agent("shared-depth-freezer-root"))
    selected = _select_agent(store, baseline["id"])
    dependencies = [*chain, wrapper]
    frozen_selection = _selection_copy(
        selected,
        document=freezer_root,
        definition_digest=execution_definition_digest(prepare_agent_graph(freezer_root)),
        dependencies=[{
            "workflow_id": version["workflow_id"],
            "revision_id": version["revision_id"],
            "definition_digest": version["definition_digest"],
        } for version in sorted(dependencies, key=lambda item: (
            item["workflow_id"], item["revision_id"],
        ))],
    )
    with pytest.raises(SkeletonResourceError) as freezer_rejected:
        _api().freeze_skeleton_workflow_dependencies(frozen_selection, store=store)
    assert freezer_rejected.value.code == "dependency_conflict"


def test_official_workflow_call_runtime_uses_frozen_published_workflow(tmp_path):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    child = _publish(store, workflow("runtime-child", "Frozen runtime child"))
    parent = _publish(store, workflow("runtime-parent", "Parent",
                                      ("runtime-child", child["revision_id"])))
    agent_saved = store.save_draft(_hook(agent("runtime-agent"), "runtime-parent",
                                         parent["revision_id"]))
    frozen = snapshot_api.freeze_skeleton_workflow_dependencies(
        _select_agent(store, agent_saved["id"]), store=store)
    resolved = frozen.resolve("runtime-child", child["revision_id"])
    from unchain.skeleton.workflow_runtime import PublishedWorkflow
    assert type(resolved) is PublishedWorkflow
    journal = SQLiteContextV2Store(
        database_path=tmp_path / "runtime-journal.sqlite3",
        object_directory=tmp_path / "runtime-objects",
    ).bind_execution("frozen-workflow-run")
    plan = prepare_workflow(parent["document"])
    execution_store = WorkflowExecutionStore(
        journal, plan, graph_id="frozen-parent",
        attempt=AttemptRef(GenerationRef("frozen-workflow-run", "generation"), "attempt"),
    )
    calls = []

    def run_code(context, inputs):
        calls.append(context.graph_id)
        return WorkflowNodeCompleted({"value": inputs["value"] + "-frozen"})

    handler = SkeletonWorkflowCallRuntime(
        execution_store, frozen.resolve, handlers={"code": run_code})
    runner = DurableWorkflowRunner(execution_store, {"workflow_call": handler})
    runner.create({"value": "input"})
    result = runner.run()
    assert result.outputs == {"value": "input-frozen"}
    assert len(calls) == 1


def test_cold_source_reopens_store_and_reconstructs_same_retained_snapshot(tmp_path):
    snapshot_api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    child = _publish(store, workflow("cold-child", "Cold child"))
    parent = _publish(store, workflow("cold-parent", "Cold parent",
                                      ("cold-child", child["revision_id"])))
    agent_saved = store.save_draft(_hook(agent("cold-agent"), "cold-parent",
                                         parent["revision_id"]))
    selected = _select_agent(store, agent_saved["id"])
    expected = snapshot_api.freeze_skeleton_workflow_dependencies(selected, store=store)
    code = """
import sys
from skeleton_resource_store import SkeletonResourceStore
from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
store = SkeletonResourceStore(sys.argv[1])
options = {"skeleton_selection": {"schema": "pupu.skeleton_chat_selection.v1",
                                  "kind": "resource", "resource_id": sys.argv[2]}}
selection = prepare_skeleton_chat_selection(options, store=store)
print(freeze_skeleton_workflow_dependencies(selection, store=store).snapshot_digest)
"""
    environment = dict(os.environ)
    result = subprocess.run(
        [sys.executable, "-c", code, str(store.root), agent_saved["id"]],
        check=True, capture_output=True, text=True, env=environment, timeout=30,
    )
    assert result.stdout.strip() == expected.snapshot_digest
