"""Builder tests freeze the exact saved root without widening ordinary chat."""
from copy import deepcopy
import pytest
from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from skeleton_chat_selection import prepare_skeleton_chat_selection
from test_skeleton_workflow_parameters import workflow
from test_skeleton_resource_store import agent


def test_workflow_test_admits_exact_saved_signature_and_retains_old_snapshot(tmp_path):
    from skeleton_code_admission import prepare_test_execution_material
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(workflow())
    selected, dependencies = prepare_test_execution_material(saved["id"], saved["edit_token"], "workflow", store=store)
    assert selected.to_dict()["kind"] == "workflow"
    assert selected.to_dict()["document"] == saved["document"]
    assert selected.to_dict()["edit_token"] == saved["edit_token"]
    assert dependencies.to_dict()["workflows"] == []
    changed = deepcopy(saved["document"])
    changed["input_schema"]["properties"]["days"]["default"] = 7
    store.save_draft(changed, expected_edit_token=saved["edit_token"])
    assert selected.to_dict()["document"]["input_schema"]["properties"]["days"]["default"] == 1
    with pytest.raises(SkeletonResourceError) as error:
        prepare_test_execution_material(saved["id"], saved["edit_token"], "workflow", store=store)
    assert error.value.code == "edit_conflict"


def test_agent_test_admission_does_not_admit_workflow_as_an_ordinary_chat(tmp_path):
    from skeleton_code_admission import prepare_test_execution_material
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(agent("test-agent"))
    selected, _ = prepare_test_execution_material(saved["id"], saved["edit_token"], "agent", store=store)
    assert selected.to_dict()["document"] == saved["document"]
    other = store.save_draft(workflow())
    with pytest.raises(SkeletonResourceError) as error:
        prepare_test_execution_material(other["id"], other["edit_token"], "agent", store=store)
    assert error.value.code == "wrong_kind"
    with pytest.raises(SkeletonResourceError) as error:
        prepare_skeleton_chat_selection({"skeleton_selection": {"schema":"pupu.skeleton_chat_selection.v1", "kind":"resource", "resource_id": other["id"]}}, store=store)
    assert error.value.code == "wrong_kind"
