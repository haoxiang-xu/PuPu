"""Real saved profile -> requirements -> Main authorization -> actual SDK wire.

Pure Main module execution is intentional; this is not packaged App/HTTP proof.
The last HTTP transport is local and no socket is created.
"""
from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess

import anthropic
import httpx
import pytest

from skeleton_credential_requirements import requirements_for_start
from skeleton_production_bindings import SkeletonProductionBindings
from test_skeleton_credential_requirements import _agent, _frozen, _profile, _query
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.kernel_config import validate_kernel_config


REPO = Path(__file__).resolve().parents[3]
PRESETS = json.loads((REPO / "src/SERVICEs/custom_provider_presets.json").read_text())


@pytest.mark.parametrize("slug", ["deepseek", "kimi", "kimi-cn"])
def test_saved_shipped_profile_preserves_authentication_through_the_real_main_consumer(tmp_path, monkeypatch, slug):
    preset = next(row["provider"] for row in PRESETS if row["provider"]["id"] == slug)
    document = _agent("auth-" + slug)
    profile = _profile(document)
    profile.update(id="profile." + slug, provider="custom." + slug,
        credential_ref="custom." + slug, protocol=preset["protocol"],
        endpoint=preset["base_url"], model=preset["models"][0]["id"], auth_mode=preset["auth"]["mode"])
    store, selection, workflows = _frozen(tmp_path, document)
    query = _query(document["id"])
    requirements = requirements_for_start(query, memory_provider="ollama", store=store)
    assert requirements["profiles"] == [{key: profile[key] for key in
        ["id", "credential_ref", "provider", "model", "protocol", "endpoint", "auth_mode"]}]
    node = shutil.which("node")
    assert node is not None, "exact-pair acceptance needs the real Main JavaScript consumer"
    javascript = """
      const fs = require('node:fs');
      const m = require(process.argv[1]);
      const input = JSON.parse(fs.readFileSync(0, 'utf8'));
      const reads = [];
      const result = m.resolveSkeletonCredentials(input.requirements, input.query, {
        customProviders: m.trustedCustomProviders({status: 'missing'}),
        readSecret(kind, id) { reads.push([kind,id]); return 'sentinel-' + id; }
      });
      process.stdout.write(JSON.stringify({result, reads}));
    """
    reply = subprocess.run([node, "-e", javascript,
        str(REPO / "electron/main/services/unchain/skeleton_credentials.js")],
        input=json.dumps({"requirements": requirements, "query": query}),
        capture_output=True, text=True, timeout=15, check=True)
    main = json.loads(reply.stdout)
    assert main["reads"] == [["custom_provider", "custom." + slug]]
    credentials = main["result"]["credentials"]
    assert set(credentials) == {"custom." + slug}
    expected_key = "sentinel-custom." + slug
    requests = []
    real_sdk = anthropic.Anthropic

    def respond(request):
        requests.append({"url": str(request.url), "body": json.loads(request.content)})
        assert str(request.url) == preset["base_url"].rstrip("/") + "/v1/messages"
        assert request.headers.get("authorization") == ("Bearer " + expected_key if profile["auth_mode"] == "bearer" else None)
        assert request.headers.get("x-api-key") == (expected_key if profile["auth_mode"] == "x-api-key" else None)
        return httpx.Response(200, json={"id": "msg_offline", "type": "message", "role": "assistant",
            "model": profile["model"], "content": [{"type": "text", "text": "offline wire"}],
            "stop_reason": "end_turn", "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}})

    monkeypatch.setenv("ANTHROPIC_API_KEY", "foreign-env-key")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "foreign-env-token")
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kwargs:
        real_sdk(**kwargs, http_client=httpx.Client(transport=httpx.MockTransport(respond))))
    host = SkeletonProductionBindings(selection, workflows, {"skeleton_credentials": credentials},
        session_id="session", workspace_root=None, resource_store=store)
    try:
        kernel = document["nodes"][1]["config"]["kernel"]
        binding = host.bind_profile(kernel)
        with binding.model_io._client_factory(api_key=binding.model_io.api_key) as sdk:
            result = sdk.messages.create(model=profile["model"], max_tokens=4,
                messages=[{"role": "user", "content": "isolated"}])
        assert result.content[0].text == "offline wire"
    finally:
        host.close()
    assert len(requests) == 1
    assert expected_key not in json.dumps(selection.to_dict())
    assert expected_key not in json.dumps(requirements)
    if os.environ.get("QA_OUT"):
        (Path(os.environ["QA_OUT"]) / ("auth-" + slug + ".json")).write_text(json.dumps({
            "profile": profile, "query": query, "requirements": requirements,
            "secret_reads": main["reads"], "wire_without_headers": requests}, indent=2) + "\n")


def test_auth_mode_actual_validator_capture(tmp_path):
    kernel = _agent("auth-capture")["nodes"][1]["config"]["kernel"]
    kernel["profile"]["provider"] = "custom.route"
    kernel["profile"]["protocol"] = "anthropic"
    rows = []
    for mode in ["x-api-key", "bearer", None, False, 0, "", " bearer", "header"]:
        value = deepcopy(kernel)
        value["profile"]["auth_mode"] = mode
        try:
            validate_kernel_config(value)
            verdict = {"accepted": True}
        except SkeletonValidationError as error:
            verdict = {"accepted": False, "code": error.code, "path": list(error.path)}
        rows.append({"kernel": value, **verdict})
    assert [row["accepted"] for row in rows] == [True, True, False, False, False, False, False, False]
    if os.environ.get("QA_OUT"):
        (Path(os.environ["QA_OUT"]) / "kernel-auth-validator-capture.json").write_text(json.dumps(rows, indent=2) + "\n")


@pytest.mark.parametrize("mutation", ["missing-feature", "old-minor"])
def test_missing_auth_capability_is_rejected_by_independent_host_consumer(mutation):
    from skeleton_runtime_capability import require_skeleton_runtime, validate_skeleton_runtime_manifest, SkeletonRuntimeCompatibilityError
    from test_skeleton_runtime_capability import _signed
    manifest = deepcopy(require_skeleton_runtime())
    protocol = next(row for row in manifest["protocols"] if row["id"] == "skeleton_execution")
    if mutation == "missing-feature":
        protocol["features"].remove("kernel_profile_auth_v1")
    else:
        protocol["minor"] = 5
    with pytest.raises(SkeletonRuntimeCompatibilityError) as error:
        validate_skeleton_runtime_manifest(_signed(manifest))
    assert error.value.code == "skeleton_runtime_incompatible"


@pytest.mark.parametrize("child_mode,conflict", [("bearer", True), ("x-api-key", False)])
def test_direct_host_binding_cannot_bypass_shared_reference_auth_conflicts(tmp_path, child_mode, conflict):
    from skeleton_resource_store import SkeletonResourceError
    child = _agent("child")
    root = _agent("root", child=child)
    for item in [root, child]:
        _profile(item).update(provider="custom.shared", protocol="anthropic",
            endpoint="https://shared.invalid", credential_ref="custom.shared")
    _profile(child)["auth_mode"] = child_mode
    store, selection, workflows = _frozen(tmp_path, root)
    if conflict:
        host = None
        try:
            with pytest.raises(SkeletonResourceError) as error:
                host = SkeletonProductionBindings(selection, workflows, {},
                    session_id="session", workspace_root=None, resource_store=store)
            assert error.value.code == "credential_conflict"
            assert error.value.path == ("profile", "credential_ref")
        finally:
            if host is not None:
                host.close()
    else:
        # Explicit x-api-key and the historical omitted Anthropic mode are
        # equivalent targets. No provider is constructed in this control.
        host = SkeletonProductionBindings(selection, workflows, {},
            session_id="session", workspace_root=None, resource_store=store)
        host.close()
