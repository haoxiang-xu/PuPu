"""Retained launch identity survives a compatible runtime minor upgrade."""
from copy import deepcopy
import json
from pathlib import Path

import pytest

from skeleton_production_state import canonical, validate_launch_descriptor
from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError, require_skeleton_runtime
from test_skeleton_credential_requirements import _agent, _frozen, _launch, _profile
from test_skeleton_runtime_capability import _signed, _skeleton_protocol
from unchain.runtime import runtime_protocol


def _retained_manifest():
    # Byte capture from the retained installed 17b04aea wheel, not a hand-built
    # approximation of the previous producer. Provenance is in the close log.
    return json.loads((Path(__file__).parent / "fixtures" /
        "ticket_356_retained_runtime_manifest.json").read_text())


@pytest.mark.parametrize("child", [False, True])
def test_actual_old_launch_keeps_its_original_manifest_and_digest(tmp_path, child):
    document = _agent("root", child=_agent("child") if child else None)
    _, selection, workflows = _frozen(tmp_path, document)
    descriptor = _launch(selection, workflows).descriptor
    descriptor["runtime_manifest"] = _retained_manifest()
    before = canonical(descriptor)
    result = validate_launch_descriptor(descriptor, session_id="session",
        root_run_id="root-run", expected_owner_chat_id="owner")
    assert result[0].to_dict() == selection.to_dict()
    assert canonical(descriptor) == before
    assert descriptor["runtime_manifest"]["manifest_digest"] == (
        "sha256:827adc5644e00dbb8e67fe5ecf6f7e88d9f542b1c4aff37744e0311c0acc2fe3")


def test_current_launch_still_uses_the_actual_current_manifest(tmp_path):
    _, selection, workflows = _frozen(tmp_path)
    descriptor = _launch(selection, workflows).descriptor
    assert descriptor["runtime_manifest"] == require_skeleton_runtime()
    validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run")


@pytest.mark.parametrize("mutation", ["digest", "major", "future-minor", "feature",
    "baseline", "missing-protocol", "unknown-protocol"])
def test_incompatible_retained_protocol_is_rejected_without_rewriting(tmp_path, mutation):
    _, selection, workflows = _frozen(tmp_path)
    descriptor = _launch(selection, workflows).descriptor
    manifest = _retained_manifest()
    protocol = _skeleton_protocol(manifest)
    if mutation == "major":
        protocol["major"] += 1
    elif mutation == "future-minor":
        protocol["minor"] = _skeleton_protocol(require_skeleton_runtime())["minor"] + 1
    elif mutation == "feature":
        protocol["features"] = sorted(protocol["features"] + ["unsupported_feature_v1"])
    elif mutation == "baseline":
        protocol["features"].remove("explicit_bindings_v1")
    elif mutation == "missing-protocol":
        manifest["protocols"].remove(protocol)
    elif mutation == "unknown-protocol":
        manifest["protocols"].append({"id": "unsupported", "major": 1, "minor": 0, "features": []})
        manifest["protocols"].sort(key=lambda row: row["id"])
    descriptor["runtime_manifest"] = _signed(manifest)
    if mutation == "digest":
        descriptor["runtime_manifest"]["manifest_digest"] = "sha256:" + "0" * 64
    before = canonical(descriptor)
    with pytest.raises(SkeletonRuntimeCompatibilityError):
        validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run")
    assert canonical(descriptor) == before


@pytest.mark.parametrize("placement", ["root", "child"])
def test_explicit_authentication_cannot_claim_a_pre_auth_launch(tmp_path, placement):
    child = _agent("child")
    document = _agent("root", child=child)
    _profile(child if placement == "child" else document)["auth_mode"] = "bearer"
    _, selection, workflows = _frozen(tmp_path, document)
    descriptor = _launch(selection, workflows).descriptor
    descriptor["runtime_manifest"] = _retained_manifest()
    with pytest.raises(SkeletonRuntimeCompatibilityError):
        validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run")


def test_old_launch_does_not_authorize_an_old_current_runtime(tmp_path, monkeypatch):
    _, selection, workflows = _frozen(tmp_path)
    descriptor = _launch(selection, workflows).descriptor
    descriptor["runtime_manifest"] = _retained_manifest()
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", _retained_manifest)
    with pytest.raises(SkeletonRuntimeCompatibilityError):
        validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run")


@pytest.mark.parametrize("mutation", ["other-major", "other-minor", "other-feature",
    "lying-auth-minor", "lying-projection-minor"])
def test_retained_manifest_checks_other_protocols_and_feature_introduction(tmp_path, mutation):
    _, selection, workflows = _frozen(tmp_path)
    descriptor = _launch(selection, workflows).descriptor
    manifest = _retained_manifest()
    if mutation.startswith("other-"):
        old = next(row for row in manifest["protocols"] if row["id"] != "skeleton_execution")
        actual = next(row for row in require_skeleton_runtime()["protocols"] if row["id"] == old["id"])
        if mutation == "other-major": old["major"] = actual["major"] + 1
        elif mutation == "other-minor": old["minor"] = actual["minor"] + 1
        else: old["features"] = sorted(old["features"] + ["unsupported_feature_v1"])
    else:
        feature = ("kernel_profile_auth_v1" if mutation == "lying-auth-minor"
            else "subagent_tool_settlement_projection_v1")
        _skeleton_protocol(manifest)["features"] = sorted(_skeleton_protocol(manifest)["features"] + [feature])
    descriptor["runtime_manifest"] = _signed(manifest)
    with pytest.raises(SkeletonRuntimeCompatibilityError):
        validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run")


def test_workflow_tool_launch_requires_its_original_settlement_feature(tmp_path):
    from skeleton_chat_selection import prepare_skeleton_chat_selection
    from skeleton_resource_store import SkeletonResourceStore
    from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
    from test_skeleton_credential_requirements import _query
    from test_skeleton_workflow_tools import workflow

    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(workflow())
    published = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    document = _agent("root")
    document["nodes"].append({"id": "tools", "type": "toolkit_pool", "config": {
        "toolkits": [], "merge_with_user_selected": False, "workflow_tools": [{
            "id": "echo", "workflow": {"workflow_id": saved["id"], "revision_id": published["revision_id"]}}]}})
    document["edges"].append({"id": "attach-tools", "kind": "attach", "source_node_id": "kernel",
        "source_port_id": "attach_bot", "target_node_id": "tools", "target_port_id": "attach_top"})
    store.save_draft(document)
    selection = prepare_skeleton_chat_selection({"skeleton_selection": _query()["selection"]}, store=store)
    workflows = freeze_skeleton_workflow_dependencies(selection, store=store)
    descriptor = _launch(selection, workflows).descriptor
    descriptor["runtime_manifest"] = _retained_manifest()
    with pytest.raises(SkeletonRuntimeCompatibilityError):
        validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run")
    manifest = deepcopy(descriptor["runtime_manifest"])
    protocol = _skeleton_protocol(manifest)
    protocol["minor"] = 5
    protocol["features"] = sorted(protocol["features"] + ["subagent_tool_settlement_projection_v1"])
    descriptor["runtime_manifest"] = _signed(manifest)
    validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run")
