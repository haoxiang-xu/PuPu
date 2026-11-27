"""Strict parsing for explicit legacy-upgrade choices."""

from copy import deepcopy

import pytest

from skeleton_resource_store import SkeletonResourceError
from skeleton_legacy_upgrade_choices import parse_upgrade_choices


SCHEMA = "pupu.skeleton-legacy-upgrade.choices.v1"


def valid_kernel():
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


def choices():
    return {
        "schema": SCHEMA,
        "kernels": [{"path": ["nodes", 1, "config", "kernel"], "kernel": valid_kernel(),
                     "model_policy": "preserve", "prompt_policy": "replace",
                     "accept_projection": True}],
        "toolkits": [{"path": ["nodes", "toolkit-pool"], "toolkit_id": "files",
                      "enabled_tools": ["read", "write"], "discard_unsupported": False}],
        "references": [{"path": ["nodes", 3, "config", "agent_id"],
                         "source_scope": "recipes", "agent_id": "child.agent-1"}],
        "acknowledged": [{"path": ["agent", "prompt"],
                          "code": "legacy_prompt_review_required"}],
    }


def test_closed_request_is_normalized_and_deeply_detached():
    source = choices()
    original = deepcopy(source)
    result = parse_upgrade_choices(source)
    assert result == original
    assert result is not source
    assert result["kernels"] is not source["kernels"]
    assert result["kernels"][0]["kernel"] is not source["kernels"][0]["kernel"]
    result["kernels"][0]["kernel"]["profile"]["model"] = "mutated"
    result["toolkits"][0]["enabled_tools"].append("delete")
    assert source == original


@pytest.mark.parametrize("change,path", [
    (lambda v: v.update(extra=1), ("choices", "extra")),
    (lambda v: v.update(schema="wrong"), ("choices", "schema")),
    (lambda v: v["kernels"][0].update(accept_projection=1), ("choices", "kernels", 0, "accept_projection")),
    (lambda v: v["kernels"][0].update(model_policy="default"), ("choices", "kernels", 0, "model_policy")),
    (lambda v: v["toolkits"][0].update(enabled_tools=["read", "read"]), ("choices", "toolkits", 0, "enabled_tools", 1)),
    (lambda v: v["references"][0].update(agent_id=" child"), ("choices", "references", 0, "agent_id")),
    (lambda v: v["acknowledged"][0].update(code="unknown"), ("choices", "acknowledged", 0, "code")),
    (lambda v: v["kernels"].append(deepcopy(v["kernels"][0])), ("choices", "kernels", 1, "path")),
])
def test_invalid_choices_raise_typed_errors_at_exact_paths(change, path):
    value = choices()
    change(value)
    with pytest.raises(SkeletonResourceError) as error:
        parse_upgrade_choices(value)
    assert error.value.path == path


def test_category_paths_are_unique_but_acknowledgement_codes_can_share_path():
    value = choices()
    value["acknowledged"].append({"path": ["agent", "prompt"],
                                  "code": "legacy_setting_ignored"})
    assert len(parse_upgrade_choices(value)["acknowledged"]) == 2
    value["toolkits"].append(deepcopy(value["toolkits"][0]))
    with pytest.raises(SkeletonResourceError) as error:
        parse_upgrade_choices(value)
    assert error.value.path == ("choices", "toolkits", 1, "path")


@pytest.mark.parametrize("bad", [float("nan"), ("tuple",), {1: "non-string key"}, object()])
def test_non_json_values_are_rejected(bad):
    value = choices()
    value["toolkits"][0]["toolkit_id"] = bad
    with pytest.raises(SkeletonResourceError) as error:
        parse_upgrade_choices(value)
    assert error.value.code == "invalid_json"
    assert error.value.path == ("choices", "toolkits", 0, "toolkit_id")


def test_invalid_kernel_is_mapped_to_request_path():
    value = choices()
    value["kernels"][0]["kernel"]["schema_version"] = 2
    with pytest.raises(SkeletonResourceError) as error:
        parse_upgrade_choices(value)
    assert error.value.path == ("choices", "kernels", 0, "kernel", "schema_version")
