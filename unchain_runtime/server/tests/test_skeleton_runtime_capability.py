"""BC-019 / SEQ-022: actual runtime capability before Skeleton host effects."""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import importlib
import inspect
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

import app as pupu_app
import skeleton_agent_runtime as host_runtime
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_store import agent, workflow
from unchain.runtime import runtime_protocol


BASELINE_FEATURES = (
    "code_python_v1", "draft_diagnostics_v1", "durable_exclusive_dag_v2",
    "end_only_root_completion_v1", "explicit_bindings_v1", "hook_phase_receipts_v1",
    "kernel_profiles_v1", "legacy_conversion_v1", "non_llm_workflow_v1",
    "pinned_workflow_calls_v1", "production_host_bindings_v1", "skill_read_v1", "structured_output_v1",
    "subagent_graphs_v1", "tool_call_v1",
)
DIGEST_DOMAIN = b"unchain.runtime_protocol_manifest.v1\\u0000"


def _api():
    # Keep the new module lazy: resource/constructor reproductions execute even
    # before this API exists, instead of turning the module into a collection error.
    return importlib.import_module("skeleton_runtime_capability")


def _signed(manifest):
    value = deepcopy(manifest)
    body = {name: value[name] for name in ("protocols", "runtime", "schema")}
    canonical = json.dumps(body, ensure_ascii=False, allow_nan=False,
                           sort_keys=True, separators=(",", ":")).encode("utf-8", "surrogatepass")
    value["manifest_digest"] = "sha256:" + sha256(DIGEST_DOMAIN + canonical).hexdigest()
    return value


def _compatible_manifest():
    # Mutate an actual producer wire value, independently signing the test
    # mutation. Never invoke its parser/canonicalizer to prove our consumer.
    value = deepcopy(runtime_protocol.runtime_protocol_manifest())
    if not any(item["id"] == "skeleton_execution" for item in value["protocols"]):
        value["protocols"].append({"id": "skeleton_execution", "major": 1, "minor": 0,
                                   "features": list(BASELINE_FEATURES)})
        value["protocols"].sort(key=lambda item: item["id"].encode("utf-8"))
    return _signed(value)


def _without_skeleton(value):
    result = deepcopy(value)
    result["protocols"] = [item for item in result["protocols"] if item["id"] != "skeleton_execution"]
    return _signed(result)


def _skeleton_protocol(value):
    return next(item for item in value["protocols"] if item["id"] == "skeleton_execution")


def _rows(store):
    with sqlite3.connect(store.database_path) as connection:
        return {
            table: connection.execute(f"SELECT * FROM {table} ORDER BY 1,2").fetchall()
            for table in ("resources", "workflow_versions", "workflow_dependencies")
        }


@pytest.mark.parametrize("operation", ["preflight", "publish"])
@pytest.mark.parametrize("producer_case,expected_code", [
    ("none", "runtime_protocol_manifest_missing"),
    ("missing-protocol", "skeleton_runtime_incompatible"),
    ("invalid-digest", "runtime_protocol_manifest_invalid"),
])
def test_real_resource_runtime_rejection_has_no_profile_dependency_or_revision_effects(
        tmp_path, monkeypatch, operation, producer_case, expected_code):
    manifest = _compatible_manifest()
    if producer_case == "none":
        manifest = None
    elif producer_case == "missing-protocol":
        manifest = _without_skeleton(manifest)
    else:
        manifest["manifest_digest"] = "sha256:" + "0" * 64
    store = SkeletonResourceStore(tmp_path / "resources")
    document = workflow("capability-gated")
    saved = store.save_draft(document)
    before = _rows(store)
    effects = []
    original_profiles, original_dependencies = store._validate_local_profiles, store._resolve_closure

    def profiles(*args, **kwargs):
        effects.append("profiles")
        return original_profiles(*args, **kwargs)

    def dependencies(*args, **kwargs):
        effects.append("dependencies")
        return original_dependencies(*args, **kwargs)

    monkeypatch.setattr(store, "_validate_local_profiles", profiles)
    monkeypatch.setattr(store, "_resolve_closure", dependencies)
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: deepcopy(manifest))
    # Draft paths intentionally remain usable under the same incompatible runtime.
    assert store.diagnose(document) == []
    assert store.get_resource(saved["id"]) == saved
    with pytest.raises(SkeletonResourceError) as rejected:
        if operation == "preflight":
            store.preflight(saved["id"])
        else:
            store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    assert (rejected.value.code, rejected.value.path, rejected.value.status) == (
        expected_code, ("runtime_protocol_manifest",), 409)
    assert effects == []
    assert _rows(store) == before
    assert store.get_resource(saved["id"])["document"] == document
    assert store.list_resources()[0]["published_revisions"] == 0


def test_actual_http_runtime_gate_keeps_closed_error_and_draft_cas(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    flask = pupu_app.create_app()
    flask.config["UNCHAIN_AUTH_TOKEN"] = "capability-test-token"
    client = flask.test_client()
    headers = {"x-unchain-auth": "capability-test-token"}
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: None)
    document = workflow("http-runtime")
    saved = client.post("/skeleton_resources", headers=headers, json={"document": document})
    assert saved.status_code == 200
    saved = saved.get_json()
    token = saved["edit_token"]
    diagnosed = client.post("/skeleton_resources/diagnose", headers=headers,
                            json={"document": document})
    assert diagnosed.status_code == 200 and diagnosed.get_json() == {"diagnostics": []}
    for operation, body in (("preflight", {}), ("publish", {"expected_edit_token": token})):
        rejected = client.post(f"/skeleton_resources/http-runtime/{operation}",
                               headers=headers, json=body)
        assert rejected.status_code == 409
        error = rejected.get_json()
        assert set(error) == {"error"} and set(error["error"]) == {"code", "path", "message"}
        assert error["error"]["code"] == "runtime_protocol_manifest_missing"
        assert error["error"]["path"] == ["runtime_protocol_manifest"]
    document["name"] = "Edited while runtime is incompatible"
    edited = client.post("/skeleton_resources", headers=headers,
                         json={"document": document, "expected_edit_token": token})
    assert edited.status_code == 200
    assert edited.get_json()["edit_token"] != token
    stale = client.post("/skeleton_resources/http-runtime/publish", headers=headers,
                        json={"expected_edit_token": token})
    assert stale.status_code == 409 and stale.get_json()["error"]["code"] == "edit_conflict"
    loaded = client.get("/skeleton_resources/http-runtime", headers=headers).get_json()
    assert loaded == edited.get_json()
    assert client.get("/skeleton_resources", headers=headers).get_json()["resources"][0]["published_revisions"] == 0


def test_resource_rechecks_restored_then_incompatible_runtime_even_for_existing_revision(
        tmp_path, monkeypatch):
    compatible = _compatible_manifest()
    current = {"manifest": None}
    calls = []

    def producer():
        calls.append(current["manifest"] is not None)
        return deepcopy(current["manifest"])

    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", producer)
    store = SkeletonResourceStore(tmp_path / "resources")
    document = workflow("runtime-sequence")
    saved = store.save_draft(document)
    edited_document = deepcopy(document)
    edited_document["name"] = "Draft editor stays available"
    edited = store.save_draft(edited_document, expected_edit_token=saved["edit_token"])
    assert calls == []
    before = _rows(store)
    with pytest.raises(SkeletonResourceError) as missing:
        store.preflight(saved["id"])
    assert missing.value.code == "runtime_protocol_manifest_missing"
    assert _rows(store) == before
    current["manifest"] = compatible
    assert store.preflight(saved["id"])["edit_token"] == edited["edit_token"]
    published = store.publish_workflow(saved["id"], expected_edit_token=edited["edit_token"])
    assert published["document"] == edited_document
    after_publish = _rows(store)
    assert store.publish_workflow(saved["id"], expected_edit_token=edited["edit_token"]) == published
    assert _rows(store) == after_publish
    current["manifest"] = _without_skeleton(compatible)
    for operation in ("preflight", "publish"):
        with pytest.raises(SkeletonResourceError) as incompatible:
            if operation == "preflight":
                store.preflight(saved["id"])
            else:
                store.publish_workflow(saved["id"], expected_edit_token=edited["edit_token"])
        assert incompatible.value.code == "skeleton_runtime_incompatible"
        assert _rows(store) == after_publish
    assert store.get_workflow_version(saved["id"], published["revision_id"]) == published
    assert store.get_resource(saved["id"]) == edited
    assert len(calls) == 6


def test_old_validation_and_stale_cas_precede_new_runtime_gate(tmp_path, monkeypatch):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = agent("unfinished-capability-agent")
    document["nodes"][1]["config"].pop("kernel")
    saved = store.save_draft(document)
    producer_calls = []
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest",
                        lambda: producer_calls.append("unexpected") or None)
    with pytest.raises(SkeletonResourceError) as old_validation:
        store.preflight(saved["id"])
    assert old_validation.value.path[:4] == ("document", "nodes", 1, "config")
    assert producer_calls == []
    valid = store.save_draft(workflow("stale-capability"))
    updated = deepcopy(valid["document"])
    updated["name"] = "next edit"
    store.save_draft(updated, expected_edit_token=valid["edit_token"])
    with pytest.raises(SkeletonResourceError) as stale:
        store.publish_workflow(valid["id"], expected_edit_token=valid["edit_token"])
    assert stale.value.code == "edit_conflict"
    assert producer_calls == []


def test_pure_workflow_admission_requires_no_api_key_or_model_factory(tmp_path, monkeypatch):
    from unchain.skeleton import kernel_profile
    from unchain.providers import model_io
    compatible = _compatible_manifest()
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: deepcopy(compatible))
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    factory_calls = []

    def unexpected_factory(*args, **kwargs):
        factory_calls.append((args, kwargs))
        raise AssertionError("pure Workflow must not initialize a model or bind a profile")

    monkeypatch.setattr(kernel_profile, "bind_kernel_profile", unexpected_factory)
    for name in ("OpenAIModelIO", "AnthropicModelIO", "GeminiModelIO", "OllamaModelIO"):
        if hasattr(model_io, name):
            monkeypatch.setattr(model_io, name, unexpected_factory)
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(workflow("provider-free-capability"))
    assert store.preflight(saved["id"])["document"] == saved["document"]
    assert store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])["document"] == saved["document"]
    assert factory_calls == []


def test_real_valid_host_rejects_before_context_store_profile_and_graph_effects(tmp_path, monkeypatch):
    from test_skeleton_agent_runtime import _bridge, _single_plan, _host_execution, _StrictOpenAIClient
    from unchain.execution import ExecutionRuntime
    from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
    bridge = _bridge(tmp_path, monkeypatch, execution_id="capability-rejected-host")
    plan = _single_plan()
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    memory = KernelMemoryRuntime.from_config(store=memory_store)
    client = _StrictOpenAIClient([])
    effects, sdk_calls = [], []
    context_runtime = bridge.preparation.host_factory.context_module.runtime
    original_bind = type(context_runtime).bind_context
    original_store = host_runtime.WorkflowExecutionStore

    def bind_context(self, *args, **kwargs):
        effects.append("context_bind")
        return original_bind(self, *args, **kwargs)

    def store(*args, **kwargs):
        effects.append("workflow_store")
        return original_store(*args, **kwargs)

    monkeypatch.setattr(type(context_runtime), "bind_context", bind_context)
    monkeypatch.setattr(host_runtime, "WorkflowExecutionStore", store)
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: None)
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        guard.assert_active()
        error = None
        try:
            _host_execution(plan, bridge, client=client, guard=guard, memory=memory, sdk_calls=sdk_calls)
        except Exception as exc:
            error = exc
        assert getattr(error, "code", None) == "runtime_protocol_manifest_missing"
        assert effects == [] and sdk_calls == [] and client.requests == []


def test_compatible_real_host_fixture_constructs_and_runs_with_isolated_sdk(tmp_path, monkeypatch):
    from test_skeleton_agent_runtime import (
        _bridge, _single_plan, _host_execution, _StrictOpenAIClient, _final_response,
    )
    from unchain.execution import ExecutionRuntime
    from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
    compatible = _compatible_manifest()
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: deepcopy(compatible))
    bridge = _bridge(tmp_path, monkeypatch, execution_id="capability-compatible-host")
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    client = _StrictOpenAIClient([_final_response()])
    sdk_calls = []
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(_single_plan(), bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store), sdk_calls=sdk_calls)
        assert client.requests == []
        execution.create({"task": "isolated compatibility control"})
        result, receipt = execution.run(original_task="isolated compatibility control")
    assert result.status == "completed" and receipt is not None
    assert result.outputs["message"] == "postprocessed End reply"
    assert len(client.requests) == 1 and sdk_calls


def test_old_malformed_host_constructor_preserves_type_error_before_runtime_loading(monkeypatch):
    calls = []
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: calls.append(True) or None)
    with pytest.raises(TypeError, match="Agent plan and active PuPu bridge"):
        host_runtime.PupuSkeletonAgentExecution(None, None, graph_id="malformed-old-call",
            bind_profile=lambda value: value, durability_runtime=None)
    assert calls == []


def test_actual_producer_is_admitted_by_independent_consumer_without_parser(monkeypatch):
    manifest = runtime_protocol.runtime_protocol_manifest()
    assert "skeleton_execution" in {item["id"] for item in manifest["protocols"]}
    assert _skeleton_protocol(manifest) == {
        "id": "skeleton_execution", "major": 1, "minor": 4,
        "features": sorted([*BASELINE_FEATURES, "hook_enable_v1", "hook_tool_set_v1", "hook_embedded_workflow_v1"])}
    assert _signed(manifest) == manifest
    parser_calls = []

    def forbidden_parser(*args, **kwargs):
        parser_calls.append(True)
        raise AssertionError("consumer called the producer parser")

    monkeypatch.setattr(runtime_protocol.RuntimeProtocolManifest, "from_dict", forbidden_parser)
    monkeypatch.setattr(runtime_protocol.RuntimeProtocol, "from_dict", forbidden_parser)
    api = _api()
    normalized = api.validate_skeleton_runtime_manifest(manifest)
    assert normalized == manifest and normalized is not manifest
    assert api.require_skeleton_runtime() == manifest
    assert parser_calls == []
    manifest["protocols"][0]["features"].clear()
    assert normalized["protocols"][0]["features"]


@pytest.mark.parametrize("missing_feature", BASELINE_FEATURES)
def test_each_skeleton_baseline_feature_is_required(missing_feature):
    manifest = _compatible_manifest()
    _skeleton_protocol(manifest)["features"].remove(missing_feature)
    manifest = _signed(manifest)
    api = _api()
    with pytest.raises(api.SkeletonRuntimeCompatibilityError) as incompatible:
        api.validate_skeleton_runtime_manifest(manifest)
    assert incompatible.value.code == "skeleton_runtime_incompatible"


@pytest.mark.parametrize("mutation", [
    "envelope-extra", "protocol-extra", "schema", "runtime", "digest",
    "major-bool", "minor-negative", "minor-unsafe", "major-string",
    "protocols-tuple", "features-string", "feature-type", "duplicate-protocol",
    "protocol-order", "duplicate-feature", "feature-order", "non-nfc", "surrogate",
])
def test_strict_manifest_shape_identity_types_digest_and_canonical_order(mutation):
    manifest = _compatible_manifest()
    protocol = _skeleton_protocol(manifest)
    if mutation == "envelope-extra": manifest["extra"] = 1
    elif mutation == "protocol-extra": protocol["extra"] = 1
    elif mutation == "schema": manifest["schema"] = "unchain.runtime_protocol_manifest.v2"
    elif mutation == "runtime": manifest["runtime"] = "different-runtime"
    elif mutation == "major-bool": protocol["major"] = True
    elif mutation == "minor-negative": protocol["minor"] = -1
    elif mutation == "minor-unsafe": protocol["minor"] = 1 << 53
    elif mutation == "major-string": protocol["major"] = "1"
    elif mutation == "protocols-tuple": manifest["protocols"] = tuple(manifest["protocols"])
    elif mutation == "features-string": protocol["features"] = "one-string"
    elif mutation == "feature-type": protocol["features"][0] = 17
    elif mutation == "duplicate-protocol": manifest["protocols"].insert(0, deepcopy(manifest["protocols"][0]))
    elif mutation == "protocol-order": manifest["protocols"].reverse()
    elif mutation == "duplicate-feature": protocol["features"].insert(0, protocol["features"][0])
    elif mutation == "feature-order": protocol["features"].reverse()
    elif mutation == "non-nfc": protocol["features"].append("e\u0301"); protocol["features"].sort()
    elif mutation == "surrogate": protocol["features"].append("\ud800")
    manifest = _signed(manifest)
    if mutation == "digest": manifest["manifest_digest"] = "sha256:" + "0" * 64
    api = _api()
    with pytest.raises(api.SkeletonRuntimeCompatibilityError) as invalid:
        api.validate_skeleton_runtime_manifest(manifest)
    assert invalid.value.code == "runtime_protocol_manifest_invalid"


@pytest.mark.parametrize("mutation", ["missing-protocol", "major-zero", "major-next"])
def test_structurally_valid_but_incompatible_skeleton_manifest(mutation):
    manifest = _compatible_manifest()
    if mutation == "missing-protocol": manifest = _without_skeleton(manifest)
    else: _skeleton_protocol(manifest)["major"] = 0 if mutation == "major-zero" else 2
    api = _api()
    with pytest.raises(api.SkeletonRuntimeCompatibilityError) as incompatible:
        api.validate_skeleton_runtime_manifest(_signed(manifest))
    assert incompatible.value.code == "skeleton_runtime_incompatible"


def test_future_minor_feature_and_protocol_are_forward_compatible():
    manifest = _compatible_manifest()
    protocol = _skeleton_protocol(manifest)
    protocol["minor"] = 7
    protocol["features"] = sorted(protocol["features"] + ["future_skeleton_feature_v2"])
    manifest["protocols"].append({"id": "future_protocol", "major": 4, "minor": 2,
                                   "features": ["future_feature"]})
    manifest["protocols"].sort(key=lambda item: item["id"].encode("utf-8"))
    manifest = _signed(manifest)
    assert _api().validate_skeleton_runtime_manifest(manifest) == manifest


@pytest.mark.parametrize("producer_case", ["absent", "not-callable", "none", "hostile-exception"])
def test_actual_imported_producer_failures_are_missing_and_sanitized(monkeypatch, producer_case):
    api = _api()
    if producer_case == "absent": monkeypatch.delattr(runtime_protocol, "runtime_protocol_manifest")
    elif producer_case == "not-callable": monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", True)
    elif producer_case == "none": monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: None)
    else:
        class HostileError(Exception):
            def __str__(self):
                raise AssertionError("SECRET-PRODUCER-STRING-SENTINEL")

        def hostile_producer():
            raise HostileError("SECRET-PRODUCER-STRING-SENTINEL")

        monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", hostile_producer)
    monkeypatch.setenv("PUPU_SKELETON_RUNTIME_DEV_BYPASS", "1")
    with pytest.raises(api.SkeletonRuntimeCompatibilityError) as missing:
        api.require_skeleton_runtime()
    assert missing.value.code == "runtime_protocol_manifest_missing"
    assert "SECRET-PRODUCER-STRING-SENTINEL" not in str(missing.value)
    assert inspect.signature(api.require_skeleton_runtime).parameters == {}


def test_existing_context_active_and_off_accept_old_non_skeleton_protocol(monkeypatch):
    import context_memory_v2_capability as old_gate
    old_manifest = _without_skeleton(_compatible_manifest())
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: deepcopy(old_manifest))
    active = old_gate.resolve_context_memory_v2_capability(requested_mode="all")
    assert active.ready and active.reason == "unchain_runtime_protocol_compatible"
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: None)
    off = old_gate.resolve_context_memory_v2_capability(requested_mode="off")
    assert off.ready and off.reason == "protocol_not_required"


def test_cold_source_process_rechecks_runtime_and_preserves_store_identity(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(workflow("cold-capability"))
    script = """
import json,sys
from pathlib import Path
from skeleton_resource_store import SkeletonResourceError,SkeletonResourceStore
from unchain.runtime import runtime_protocol
producer=runtime_protocol.runtime_protocol_manifest
store=SkeletonResourceStore(Path(sys.argv[1]));saved=store.get_resource('cold-capability')
results=[]
for available,operation in [(False,'preflight'),(True,'publish'),(False,'publish')]:
 runtime_protocol.runtime_protocol_manifest=producer if available else lambda:None
 try:
  value=store.preflight(saved['id']) if operation=='preflight' else store.publish_workflow(saved['id'],expected_edit_token=saved['edit_token'])
  results.append({'code':None,'token':store.get_resource(saved['id'])['edit_token'],'revisions':store.list_resources()[0]['published_revisions']})
 except SkeletonResourceError as error:
  results.append({'code':error.code,'token':store.get_resource(saved['id'])['edit_token'],'revisions':store.list_resources()[0]['published_revisions']})
print(json.dumps({'results':results,'module':runtime_protocol.__file__,'document':store.get_resource(saved['id'])['document']}))
"""
    process = subprocess.run([sys.executable, "-c", script, str(store.root)],
                             env=dict(os.environ, PYTHONHASHSEED="61"),
                             capture_output=True, text=True, check=True)
    observed = json.loads(process.stdout)
    assert Path(observed["module"]).resolve().is_relative_to(Path(os.environ["UNCHAIN_SOURCE_PATH"]).resolve())
    assert observed["results"] == [
        {"code": "runtime_protocol_manifest_missing", "token": saved["edit_token"], "revisions": 0},
        {"code": None, "token": saved["edit_token"], "revisions": 1},
        {"code": "runtime_protocol_manifest_missing", "token": saved["edit_token"], "revisions": 1},
    ]
    assert observed["document"] == saved["document"]
