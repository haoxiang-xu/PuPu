"""Fresh-interpreter acceptance for public Skeleton approval resume."""
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

import unchain_adapter as adapter
from test_skeleton_agent_runtime import _OpenAIStream
from test_skeleton_production_bindings import _pool
from test_skeleton_production_chat import production
from test_skeleton_resource_store import agent


def _fresh_resume_script():
    return r'''
import builtins, json, socket, sys, types
from functools import wraps
from types import SimpleNamespace

sdk = types.ModuleType("openai")
sdk.__cold_resume_fake__ = True
sdk_calls = []
class Stream:
    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def __iter__(self):
        yield SimpleNamespace(type="response.completed", response=SimpleNamespace(
            id="cold-resume-final", output=[{"type":"message", "role":"assistant",
                "content":[{"type":"output_text", "text":"Cold resume End"}]}],
            usage={"input_tokens": 3, "output_tokens": 2, "total_tokens": 5}))
class OpenAI:
    def __init__(self, **kwargs): self.options = kwargs; self.responses = SimpleNamespace(create=self.create)
    def create(self, **wire):
        sdk_calls.append({"client": self.options, "wire": wire})
        return Stream()
sdk.OpenAI = OpenAI
sys.modules["openai"] = sdk
def deny_network(*_args, **_kwargs): raise AssertionError("network access is forbidden in cold resume")
socket.create_connection = deny_network
socket.socket.connect = deny_network
socket.socket.connect_ex = deny_network

from skeleton_resource_store import SkeletonResourceStore
def forbidden_lookup(*_args, **_kwargs): raise AssertionError("cold resume read mutable resource storage")
SkeletonResourceStore.get_resource = forbidden_lookup
SkeletonResourceStore.get_workflow_version = forbidden_lookup
SkeletonResourceStore.resolve = forbidden_lookup
from unchain.toolkits.builtin.core.core import CoreToolkit
tool_effects = []
original_write = CoreToolkit.write
@wraps(original_write)
def counted_write(self, path, content):
    tool_effects.append({"path": path, "content": content})
    return original_write(self, path, content)
CoreToolkit.write = counted_write

import unchain_adapter as adapter
assert sys.modules["openai"].__cold_resume_fake__ is True
options = json.loads(sys.argv[1])
events = list(adapter.resume_chat_interaction_events(
    session_id=sys.argv[2], interaction_id=sys.argv[3], options=options,
    attempt_id=sys.argv[4], source_attempt_id=sys.argv[5]))
roots = [event for event in events if event.get("type") == "final_message" and event.get("scope") == "root"]
print(json.dumps({"finals": roots, "sdk_calls": sdk_calls, "tool_effects": tool_effects}, sort_keys=True))
'''


def _fresh_stale_resume_script():
    return r'''
import json, socket, sys, types
from types import SimpleNamespace
sdk = types.ModuleType("openai")
sdk.__cold_resume_fake__ = True
sdk_constructions = []
class OpenAI:
    def __init__(self, **kwargs):
        sdk_constructions.append(kwargs)
        raise AssertionError("stale resume must not construct an SDK client")
sdk.OpenAI = OpenAI
sys.modules["openai"] = sdk
def deny_network(*_args, **_kwargs): raise AssertionError("network access is forbidden")
socket.create_connection = deny_network
socket.socket.connect = deny_network
socket.socket.connect_ex = deny_network
from skeleton_resource_store import SkeletonResourceStore
def forbidden_lookup(*_args, **_kwargs): raise AssertionError("stale resume read mutable resource storage")
SkeletonResourceStore.get_resource = forbidden_lookup
SkeletonResourceStore.get_workflow_version = forbidden_lookup
SkeletonResourceStore.resolve = forbidden_lookup
import unchain_adapter as adapter
from durable_interaction_host import DurableInteractionHostError
try:
    list(adapter.resume_chat_interaction_events(session_id=sys.argv[2], interaction_id=sys.argv[3],
        options=json.loads(sys.argv[1]), attempt_id=sys.argv[4], source_attempt_id=sys.argv[5]))
except DurableInteractionHostError as error:
    print(json.dumps({"code": error.code, "sdk_constructions": sdk_constructions}, sort_keys=True))
else:
    raise AssertionError("stale generation was accepted")
'''


def _fresh_invalid_credentials_resume_script():
    return r'''
import json, socket, sys, types
sdk = types.ModuleType("openai")
sdk.__cold_resume_fake__ = True
sdk_constructions = []
class OpenAI:
    def __init__(self, **kwargs):
        sdk_constructions.append(kwargs)
        raise AssertionError("credential admission must fail before SDK construction")
sdk.OpenAI = OpenAI
sys.modules["openai"] = sdk
def deny_network(*_args, **_kwargs): raise AssertionError("network access is forbidden")
socket.create_connection = deny_network
socket.socket.connect = deny_network
socket.socket.connect_ex = deny_network
import unchain_adapter as adapter
from session_execution_guard import snapshot_session_guard
failures = []
for index in range(2):
    try:
        list(adapter.resume_chat_interaction_events(session_id=sys.argv[2], interaction_id=sys.argv[3],
            options=json.loads(sys.argv[1]), attempt_id=sys.argv[4] + "-" + str(index), source_attempt_id=sys.argv[5]))
    except Exception as error:
        snapshot = snapshot_session_guard(session_id=sys.argv[2])
        failures.append({"error_type": type(error).__name__, "code": getattr(error, "code", ""),
            "guard": None if snapshot is None else snapshot.to_dict()})
    else:
        raise AssertionError("invalid credential binding was accepted")
print(json.dumps({"failures": failures, "sdk_constructions": sdk_constructions}, sort_keys=True))
'''


def _run_cold_resume(tmp_path, options, interaction_id, attempt_id, source_attempt_id,
                     *, script=None, session_id="cold-approval-session"):
    server = Path(__file__).resolve().parents[1]
    unchain_src = Path(os.environ["UNCHAIN_SOURCE_PATH"]) / "src"
    tests = server / "tests"
    env = dict(os.environ)
    env.update({
        "HOME": str(tmp_path),
        "UNCHAIN_DATA_DIR": str(tmp_path / "data"),
        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain",
        "PUPU_FEATURE_MEMORY_V2": "all",
        "PUPU_MEMORY_V2_MODE": "all",
        "PUPU_MEMORY_V2_CANARY_PERCENT": "100",
        "PYTHONPATH": os.pathsep.join((str(server), str(unchain_src), str(tests))),
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "RUN_PROVIDER_SMOKE": "0",
    })
    result = subprocess.run([
        sys.executable, "-c", _fresh_resume_script() if script is None else script, json.dumps(options),
        session_id, interaction_id, attempt_id, source_attempt_id,
    ], cwd=str(server), env=env, text=True, capture_output=True, timeout=60)
    return result


def test_public_approval_resumes_in_fresh_process_without_resource_reads(production, monkeypatch, tmp_path):
    import durable_interaction_host as interactions

    store, options, parent_sdk_calls = production
    monkeypatch.setenv("HOME", str(tmp_path))
    resource = store.get_resource("production-agent")
    store.save_draft(_pool(agent("production-agent")),
        expected_edit_token=resource["edit_token"])
    options["toolkits"] = ["CoreToolkit"]
    target = tmp_path / "approved-once.txt"
    response = SimpleNamespace(id="write-turn", output=[{
        "type": "function_call", "call_id": "write-call", "name": "write",
        "arguments": json.dumps({"path": str(target), "content": "approved effect exactly once\n"}),
    }], usage={"input_tokens": 4, "output_tokens": 2, "total_tokens": 6})
    from test_skeleton_agent_runtime import _OpenAIStream
    import openai
    def parent_client(**kwargs):
        def create(**wire):
            parent_sdk_calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            assert len(parent_sdk_calls) == 1
            return _OpenAIStream(response)
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", parent_client)

    events = list(adapter.stream_chat_events(message="write after approval", history=[], options=options,
        session_id="cold-approval-session", attempt_id="cold-approval-root"))
    assert not any(event.get("type") == "final_message" and event.get("scope") == "root" for event in events)
    assert not target.exists()
    pending = interactions.get_pending_interaction("cold-approval-session")
    assert pending["status"] == "awaiting_response"
    assert pending["source_run_id"] == "cold-approval-root"
    receipt = interactions.record_interaction_receipt(
        session_id="cold-approval-session", interaction_id=pending["interaction_id"], approved=True)
    repeated = interactions.record_interaction_receipt(
        session_id="cold-approval-session", interaction_id=pending["interaction_id"], approved=True)
    assert receipt["receipt_id"] == repeated["receipt_id"]

    # The child process can use its fake SDK only for the post-effect final turn;
    # all mutable Agent/Workflow Store lookups and sockets are hard failures there.
    child = _run_cold_resume(tmp_path, options, pending["interaction_id"],
        "cold-resume-attempt", "cold-approval-root")
    assert child.returncode == 0, child.stderr
    result = json.loads(child.stdout.strip().splitlines()[-1])
    assert len(result["finals"]) == 1
    assert result["finals"][0]["content"] == "Cold resume End"
    assert len(result["sdk_calls"]) == 1
    assert result["sdk_calls"][0]["client"]["api_key"] == "production-test-secret"
    assert result["sdk_calls"][0]["client"]["base_url"] == "https://example.test/v1"
    assert len(result["tool_effects"]) == 1
    assert result["tool_effects"][0]["path"] == str(target)
    assert target.read_text() == "approved effect exactly once\n"
    assert interactions.get_pending_interaction("cold-approval-session")["status"] == "none"

    # A new root advances the same session generation. Replaying the old root
    # descriptor after this point must fail before constructing its fake SDK.
    next_target = tmp_path / "must-not-be-written.txt"
    next_response = SimpleNamespace(id="next-write-turn", output=[{
        "type": "function_call", "call_id": "next-write-call", "name": "write",
        "arguments": json.dumps({"path": str(next_target), "content": "stale must not run"}),
    }], usage={"input_tokens": 4, "output_tokens": 2, "total_tokens": 6})
    def next_parent_client(**kwargs):
        def create(**wire):
            parent_sdk_calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            return _OpenAIStream(next_response)
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", next_parent_client)
    next_events = list(adapter.stream_chat_events(message="start a newer root", history=[], options=options,
        session_id="cold-approval-session", attempt_id="newer-root"))
    assert not any(event.get("type") == "final_message" and event.get("scope") == "root"
                   for event in next_events)
    next_pending = interactions.get_pending_interaction("cold-approval-session")
    assert next_pending["source_run_id"] == "newer-root"
    assert next_pending["interaction_id"] != pending["interaction_id"]
    interactions.record_interaction_receipt(
        session_id="cold-approval-session", interaction_id=next_pending["interaction_id"], approved=True)
    stale = _run_cold_resume(tmp_path, options, next_pending["interaction_id"],
        "stale-resume-attempt", "cold-approval-root", script=_fresh_stale_resume_script())
    assert stale.returncode == 0, stale.stderr
    stale_result = json.loads(stale.stdout.strip().splitlines()[-1])
    assert stale_result["code"] == "execution_attempt_binding_conflict"
    assert stale_result["sdk_constructions"] == []
    assert target.read_text() == "approved effect exactly once\n"
    assert not next_target.exists()


def test_credential_setup_failure_keeps_same_public_approval_resumable(production, monkeypatch, tmp_path):
    import durable_interaction_host as interactions

    store, options, parent_sdk_calls = production
    monkeypatch.setenv("HOME", str(tmp_path))
    resource = store.get_resource("production-agent")
    store.save_draft(_pool(agent("production-agent")), expected_edit_token=resource["edit_token"])
    options["toolkits"] = ["CoreToolkit"]
    target = tmp_path / "credential-retry-effect.txt"
    response = SimpleNamespace(id="credential-wait-turn", output=[{
        "type": "function_call", "call_id": "credential-write-call", "name": "write",
        "arguments": json.dumps({"path": str(target), "content": "continued same approval\n"}),
    }], usage={"input_tokens": 4, "output_tokens": 2, "total_tokens": 6})
    import openai
    def parent_client(**kwargs):
        def create(**wire):
            parent_sdk_calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            return _OpenAIStream(response)
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", parent_client)

    list(adapter.stream_chat_events(message="wait for credential retry", history=[], options=options,
        session_id="credential-retry-session", attempt_id="credential-retry-root"))
    pending = interactions.get_pending_interaction("credential-retry-session")
    assert pending["status"] == "awaiting_response"
    interactions.record_interaction_receipt(session_id="credential-retry-session",
        interaction_id=pending["interaction_id"], approved=True)

    invalid_options = deepcopy(options)
    invalid_options["skeleton_credentials"]["test.key"]["endpoint"] = "https://wrong.example/v1"
    failed = _run_cold_resume(tmp_path, invalid_options, pending["interaction_id"],
        "bad-credential-resume", "credential-retry-root", script=_fresh_invalid_credentials_resume_script(),
        session_id="credential-retry-session")
    assert failed.returncode == 0, failed.stderr
    failure = json.loads(failed.stdout.strip().splitlines()[-1])
    assert len(failure["failures"]) == 2
    assert all(item["error_type"] == "SkeletonResourceError" for item in failure["failures"]), failure
    assert all(item["code"] == "credential_conflict" for item in failure["failures"])
    assert failure["sdk_constructions"] == []
    assert not target.exists()

    corrected = _run_cold_resume(tmp_path, options, pending["interaction_id"],
        "corrected-credential-resume", "credential-retry-root", session_id="credential-retry-session")
    for item in failure["failures"]:
        assert item["guard"] is not None, failure
        assert item["guard"]["state"] == "parked"
        assert item["guard"]["interaction_id"] == pending["interaction_id"]
    assert corrected.returncode == 0, corrected.stderr
    result = json.loads(corrected.stdout.strip().splitlines()[-1])
    assert len(result["finals"]) == 1
    assert result["finals"][0]["content"] == "Cold resume End"
    assert len(result["sdk_calls"]) == 1
    assert result["sdk_calls"][0]["client"]["api_key"] == "production-test-secret"
    assert len(result["tool_effects"]) == 1
    assert target.read_text() == "continued same approval\n"
    assert interactions.get_pending_interaction("credential-retry-session")["status"] == "none"
