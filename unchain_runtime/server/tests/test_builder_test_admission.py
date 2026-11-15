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


def _unconfigured(resource_id="no-model"):
    from test_skeleton_resource_store import kernel_config
    document = agent(resource_id)
    kernel = document["nodes"][1]["config"].pop("kernel")
    document["nodes"][1]["config"]["kernel_draft"] = {"prompt": "Answer briefly.", "model": None, "max_iterations": 5}
    return document, kernel_config()


def test_agent_with_no_model_runs_its_test_with_the_chosen_kernel_and_keeps_its_draft(tmp_path):
    """BC: renderer fallback_model -> host catalog profile -> admitted Agent snapshot."""
    from skeleton_code_admission import prepare_test_execution_material
    store = SkeletonResourceStore(tmp_path / "resources")
    document, chosen = _unconfigured()
    saved = store.save_draft(document)
    with pytest.raises(SkeletonResourceError):
        prepare_test_execution_material(saved["id"], saved["edit_token"], "agent", store=store)
    selected, _ = prepare_test_execution_material(saved["id"], saved["edit_token"], "agent", store=store, draft_kernel=chosen)
    node = selected.to_dict()["document"]["nodes"][1]
    assert set(node["config"]) == {"execution", "kernel"}
    assert node["config"]["kernel"]["profile"] == chosen["profile"]
    assert node["config"]["kernel"]["prompt"] == "Answer briefly."
    assert node["config"]["kernel"]["max_iterations"] == 5
    # The stored draft is the author's and is not written.
    assert store.get_resource(saved["id"])["document"]["nodes"][1]["config"]["kernel_draft"]["max_iterations"] == 5


def test_an_authored_kernel_is_never_replaced_by_the_test_model(tmp_path):
    from skeleton_code_admission import prepare_test_execution_material
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(agent("configured"))
    _, other = _unconfigured()
    other = deepcopy(other)
    other["prompt"] = "not the author's"
    selected, _ = prepare_test_execution_material(saved["id"], saved["edit_token"], "agent", store=store, draft_kernel=other)
    assert selected.to_dict()["document"] == saved["document"]


def test_the_test_model_is_read_from_the_host_catalog_and_refused_when_absent(monkeypatch):
    import skeleton_builder_tests as tests
    import skeleton_kernel_profiles as profiles
    row = {"id": "openai:gpt-test", "provider": "openai", "model": "gpt-test", "protocol": "openai-responses",
           "endpoint": "https://api.openai.com/v1", "credential_ref": "openai", "context_window": 1000,
           "output_limit": 4000, "capabilities": {"json_schema": True, "images": False, "files": False}}
    monkeypatch.setattr(profiles, "kernel_profiles", lambda: {"profiles": [row], "unavailable": []})
    kernel = tests.fallback_kernel("openai:gpt-test")
    assert kernel["profile"] == row and kernel["output_tokens"] == 999 and kernel["max_iterations"] == 12
    with pytest.raises(SkeletonResourceError) as error:
        tests.fallback_kernel("openai:not-offered")
    assert error.value.code == "test_model_unavailable"


def test_a_referenced_subagent_with_no_model_runs_with_the_same_chosen_kernel(tmp_path):
    from skeleton_code_admission import prepare_test_execution_material
    store = SkeletonResourceStore(tmp_path / "resources")
    child, chosen = _unconfigured("child-no-model")
    store.save_draft(child)
    owner = agent("owner", child_source={"kind": "agent_ref", "agent_id": "child-no-model"})
    saved = store.save_draft(owner)
    selected, _ = prepare_test_execution_material(saved["id"], saved["edit_token"], "agent", store=store, draft_kernel=chosen)
    sub = selected.to_dict()["subagents"][0]["document"]["nodes"][1]["config"]
    assert set(sub) == {"execution", "kernel"} and sub["kernel"]["prompt"] == "Answer briefly."
    # The owner kept its own Kernel.
    assert selected.to_dict()["document"]["nodes"][1]["config"]["kernel"] == owner["nodes"][1]["config"]["kernel"]
