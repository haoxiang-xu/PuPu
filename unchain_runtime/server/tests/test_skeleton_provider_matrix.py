"""M3 directed route matrix through actual Store, Main and Kernel adapters.

SDK clients are strict fakes (no sockets). Native ModelIO, preparation,
Context compiler, durable runner and credentials consumer are real. Real SDK
HTTP serialization is independently covered by test_skeleton_kernel_auth_boundary
and test_skeleton_workflow_tool_real_sdk; this file does not claim real services.
"""
from copy import deepcopy
from itertools import permutations
import json
import os
from pathlib import Path
import shutil
import subprocess
from types import SimpleNamespace

import anthropic
from google import genai
from google.genai import types
import httpx
import openai
import pytest

from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_credential_requirements import requirements_for_start
from skeleton_production_bindings import SkeletonProductionBindings
from skeleton_resource_store import SkeletonResourceStore
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
from unchain.journal import AttemptRef, GenerationRef
from unchain.persistence import SQLiteContextV2Store
from unchain.persistence.sqlite_context_compiler_v2 import SQLiteContextCompilerV2Store
from unchain.skeleton.agent_preparation import prepare_agent_graph
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.kernel_runtime import SkeletonKernelHandler, build_node_bundle


ROOT = Path(__file__).resolve().parents[3]
PRESETS = [row["provider"] for row in json.loads((ROOT / "src/SERVICEs/custom_provider_presets.json").read_text())]
ROUTES = [
    ("openai", "openai-responses", "https://api.openai.com/v1", "bearer"),
    ("anthropic", "anthropic", "https://api.anthropic.com", "x-api-key"),
    ("gemini", "gemini", "https://generativelanguage.googleapis.com", "api-key"),
    ("ollama", "ollama", "http://127.0.0.1:11434", "none"),
    *[("custom." + slug, row["protocol"], row["base_url"], row["auth"]["mode"])
      for slug in ("deepseek", "kimi", "kimi-cn")
      for row in PRESETS if row["id"] == slug],
    ("custom.hyperspace", "anthropic", "https://hyperspace.invalid/anthropic", "x-api-key"),
    ("custom.responses-a", "openai-responses", "https://route-a.invalid/v1", "bearer"),
    ("custom.responses-b", "openai-responses", "https://route-b.invalid/v1", "bearer"),
    ("custom.anthropic-bearer", "anthropic", "https://bearer.invalid/messages-api", "bearer"),
    ("custom.ollama", "ollama", "http://127.0.0.1:12345", "none"),
]
SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}},
          "required": ["answer"], "additionalProperties": False}


def _output(name, kind, path):
    return {"name": name, "source": {"kind": kind, "path": path}}


def _input(name, node):
    return {"name": name, "value": {"kind": "ref", "node_id": node, "path": ["answer"]}, "missing": "error"}


def _document(routes):
    nodes = [{"id": "start", "type": "start", "config": {"execution": {"outputs": []}}}]
    for index, (provider, protocol, endpoint, auth) in enumerate(routes):
        model = next((row["models"][0]["id"] for row in PRESETS if provider == "custom." + row["id"]), "shared-model")
        nodes.append({"id": "k" + str(index), "type": "agent", "config": {
            "execution": {"inputs": [_input("upstream", "k" + str(index - 1))] if index else [],
                "outputs": [_output("answer", "result", ["answer"])]},
            "kernel": {"schema_version": 1, "profile": {
                "id": "profile." + provider, "provider": provider, "model": model,
                "protocol": protocol, "endpoint": endpoint, "credential_ref": provider, "auth_mode": auth,
                "context_window": 8192 if provider.endswith("-a") else 16384, "output_limit": 512,
                "capabilities": {"json_schema": True, "images": False, "files": False}},
                "prompt": "PRIVATE_NODE_" + str(index), "max_iterations": 1, "output_tokens": 32 + index,
                "history": "root", "overflow": "error", "json_schema": deepcopy(SCHEMA)}}})
    nodes.append({"id": "end", "type": "end", "config": {"execution": {
        "inputs": [_input("message", "k" + str(len(routes) - 1))],
        "outputs": [_output("message", "input", ["message"])]}}})
    return {"schema_version": 1, "kind": "agent", "id": "route-matrix", "name": "Route matrix",
        "nodes": nodes, "edges": [{"id": "e" + str(index), "kind": "flow",
            "source_node_id": left["id"], "source_port_id": "out", "target_node_id": right["id"], "target_port_id": "in"}
            for index, (left, right) in enumerate(zip(nodes, nodes[1:]))]}


def _main_credentials(requirements, query, routes):
    registrations = [{"config_version": 1, "id": provider[7:], "enabled": True,
        "protocol": protocol, "base_url": endpoint, "auth": {"mode": auth}, "models": [{"id": "shared-model"}]}
        for provider, protocol, endpoint, auth in routes
        if provider.startswith("custom.") and not any(row["id"] == provider[7:] for row in PRESETS)]
    # Repeated A in A->B->C->A uses one unchanged registration.
    registrations = list({row["id"]: row for row in registrations}.values())
    script = """const fs=require('node:fs'),m=require(process.argv[1]);
      const x=JSON.parse(fs.readFileSync(0,'utf8'));
      const result=m.resolveSkeletonCredentials(x.requirements,x.query,{
        customProviders:m.trustedCustomProviders({status:'ready',providers:x.registrations}),
        readSecret:(kind,id)=>'SENTINEL_ONLY_'+id});
      process.stdout.write(JSON.stringify(result.credentials));"""
    result = subprocess.run([shutil.which("node"), "-e", script,
        str(ROOT / "electron/main/services/unchain/skeleton_credentials.js")],
        input=json.dumps({"requirements": requirements, "query": query, "registrations": registrations}),
        text=True, capture_output=True, check=True, timeout=15)
    return json.loads(result.stdout)


class _Events:
    def __init__(self, events):
        self.events = events
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        return False
    def __iter__(self):
        return iter(self.events)
    def raise_for_status(self):
        return None
    def iter_lines(self):
        return iter(self.events)


def _run(tmp_path, monkeypatch, routes):
    document = _document(routes)
    resources = SkeletonResourceStore(tmp_path / "resources")
    resources.save_draft(document)
    selector = {"schema": "pupu.skeleton_chat_selection.v1", "kind": "resource", "resource_id": document["id"]}
    selection = prepare_skeleton_chat_selection({"skeleton_selection": selector}, store=resources)
    workflows = freeze_skeleton_workflow_dependencies(selection, store=resources)
    query = {"schema": "pupu.skeleton_credential_query.v1", "mode": "start", "session_id": "matrix-session",
        "owner_chat_id": "matrix-owner", "interaction_id": "", "source_attempt_id": "", "selection": selector,
        "recipe_name": "", "memory_agent_config": None}
    requirements = requirements_for_start(query, memory_provider="ollama", store=resources)
    credentials = _main_credentials(requirements, query, routes)
    calls = []
    kernels = [node["config"]["kernel"] for node in document["nodes"] if node["type"] == "agent"]

    def sent(protocol, wire, client):
        index = len(calls)
        expected = kernels[index]
        profile = expected["profile"]
        assert profile["protocol"] == protocol
        assert wire["model"] == profile["model"]
        key = "SENTINEL_ONLY_" + profile["provider"]
        if protocol == "gemini":
            assert client["api_key"] == key
            assert client["http_options"]["base_url"] == profile["endpoint"]
            assert client["http_options"]["retry_options"] == {"attempts": 1}
            assert wire["config"]["max_output_tokens"] == expected["output_tokens"]
            assert wire["config"]["response_mime_type"] == "application/json"
            assert wire["config"]["response_json_schema"] == SCHEMA
        elif protocol == "ollama":
            assert client["url"] == profile["endpoint"] + "/api/chat"
            assert wire["options"]["num_ctx"] == profile["context_window"]
            assert wire["options"]["num_predict"] == expected["output_tokens"]
            assert wire["format"] == SCHEMA
            assert not client.get("headers", {}).get("Authorization")
        else:
            assert client["base_url"] == profile["endpoint"] and client["max_retries"] == 0
            if protocol == "anthropic":
                assert client["api_key"] == (key if profile["auth_mode"] == "x-api-key" else None)
                assert client["auth_token"] == (key if profile["auth_mode"] == "bearer" else None)
                assert wire["max_tokens"] == expected["output_tokens"]
                assert wire["output_config"]["format"] == {"type": "json_schema", "schema": SCHEMA}
            else:
                assert client["api_key"] == key
                assert wire["max_output_tokens"] == expected["output_tokens"]
                assert wire["text"]["format"] == {"type": "json_schema", "name": "kernel_output", "schema": SCHEMA, "strict": True}
        text = json.dumps(wire, ensure_ascii=False)
        assert "PRIVATE_NODE_" + str(index) in text
        assert all("PRIVATE_NODE_" + str(prior) not in text for prior in range(index))
        assert "private-response-handle-" not in text
        assert "SENTINEL_ONLY_" not in text
        if index:
            assert "neutral-" + str(index - 1) in text
        calls.append(deepcopy(wire))
        return index, json.dumps({"answer": "neutral-" + str(index)})

    def openai_client(**client):
        def create(**wire):
            index, text = sent("openai-responses", wire, client)
            return _Events([SimpleNamespace(type="response.completed", response=SimpleNamespace(
                id="private-response-handle-" + str(index), output=[{"type": "message", "role": "assistant",
                    "content": [{"type": "output_text", "text": text}]}],
                usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}))])
        return SimpleNamespace(responses=SimpleNamespace(create=create))

    def anthropic_client(**client):
        def stream(**wire):
            index, text = sent("anthropic", wire, client)
            return _Events([
                SimpleNamespace(type="message_start", message=SimpleNamespace(id="private-response-handle-" + str(index), usage={"input_tokens": 5})),
                SimpleNamespace(type="content_block_start", index=0, content_block=SimpleNamespace(type="text", text="")),
                SimpleNamespace(type="content_block_delta", index=0, delta=SimpleNamespace(type="text_delta", text=text)),
                SimpleNamespace(type="content_block_stop", index=0),
                SimpleNamespace(type="message_delta", delta=SimpleNamespace(stop_reason="end_turn"), usage=SimpleNamespace(output_tokens=2)),
                SimpleNamespace(type="message_stop")])
        return SimpleNamespace(messages=SimpleNamespace(stream=stream))

    def gemini_client(**client):
        def stream(**wire):
            native = {"model": wire["model"], "contents": [value.model_dump(mode="json", exclude_none=True) for value in wire["contents"]],
                "config": wire["config"].model_dump(mode="json", exclude_none=True)}
            _index, text = sent("gemini", native, client)
            return iter([types.GenerateContentResponse.model_validate({"candidates": [{"content": {
                "role": "model", "parts": [{"text": text}]}, "finish_reason": "STOP"}],
                "usage_metadata": {"prompt_token_count": 5, "candidates_token_count": 2}})])
        return SimpleNamespace(models=SimpleNamespace(generate_content_stream=stream), close=lambda: None)

    def ollama_stream(method, url, **kwargs):
        assert method == "POST"
        _index, text = sent("ollama", kwargs["json"], {"url": url, "headers": kwargs.get("headers", {})})
        return _Events([json.dumps({"model": kwargs["json"]["model"], "done": True,
            "message": {"role": "assistant", "content": text}, "prompt_eval_count": 5, "eval_count": 2})])

    monkeypatch.setattr(openai, "OpenAI", openai_client)
    monkeypatch.setattr(anthropic, "Anthropic", anthropic_client)
    monkeypatch.setattr(genai, "Client", gemini_client)
    monkeypatch.setattr(httpx, "stream", ollama_stream)
    host = SkeletonProductionBindings(selection, workflows, {"skeleton_credentials": credentials},
        session_id="matrix-session", workspace_root=None, resource_store=resources)
    disk = SQLiteContextV2Store(database_path=tmp_path / "context.sqlite", object_directory=tmp_path / "objects")
    compiler = SQLiteContextCompilerV2Store(context_store=disk)
    journal = disk.bind_execution("matrix-session")
    attempt = AttemptRef(GenerationRef("matrix-session", "matrix-generation"), "root")
    execution = WorkflowExecutionStore(journal, prepare_agent_graph(document), graph_id="matrix", attempt=attempt)
    def bundle(*, attempt, view, config):
        return build_node_bundle(journal=journal, compiler_store=compiler, view=view, config=config,
            parent_attempt_id="root", artifact_sanitizer=lambda content, _media: content,
            payload_sanitizer=lambda _kind, payload: payload, partial_attempt_sink=lambda *_args: None)
    runner = DurableWorkflowRunner(execution, {"agent": SkeletonKernelHandler(execution,
        bind_profile=host.bind_profile, bundle_builder=bundle)})
    try:
        runner.create({})
        result = runner.run()
        assert result.status == "completed", result.error
        assert result.outputs == {"message": "neutral-" + str(len(routes) - 1)}
        assert len(calls) == len(routes)
        assert runner.run().outputs == result.outputs and len(calls) == len(routes)
        assert "SENTINEL_ONLY_" not in repr(journal.capture_snapshot().events)
    finally:
        host.close()
    if os.environ.get("QA_OUT"):
        destination = Path(os.environ["QA_OUT"]) / ("matrix-" + "--".join(route[0] for route in routes) + ".json")
        destination.write_text(json.dumps({"routes": routes, "wire": calls, "outputs": result.outputs,
            "repeat_added_calls": 0, "provenance": "real Store/Main/native adapters; runtime identity recorded by QA probe; strict SDK fake, no sockets"}, indent=2) + "\n")


@pytest.mark.parametrize("routes", list(permutations(ROUTES, 2)), ids=lambda routes: "--".join(route[0] for route in routes))
def test_directed_supported_profile_pairs(tmp_path, monkeypatch, routes):
    _run(tmp_path, monkeypatch, routes)


@pytest.mark.parametrize("routes", [(ROUTES[0], ROUTES[1], ROUTES[2], ROUTES[0]),
    (ROUTES[0], ROUTES[8], ROUTES[0]), (ROUTES[8], ROUTES[9], ROUTES[8])],
    ids=["three-protocol-return", "native-custom-native", "same-model-other-endpoint-return"])
def test_return_chains_keep_private_history_and_profiles_separate(tmp_path, monkeypatch, routes):
    _run(tmp_path, monkeypatch, routes)
