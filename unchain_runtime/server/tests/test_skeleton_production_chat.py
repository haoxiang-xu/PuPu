"""Real public chat entry -> fixed Skeleton -> native SDK wire -> durable End."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import unchain_adapter as adapter
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_resource_store import agent


class Stream:
    def __init__(self, text): self.text = text
    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def __iter__(self):
        yield SimpleNamespace(type="response.completed", response=SimpleNamespace(
            id="production-response", output=[{"type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": self.text}]}],
            usage={"input_tokens": 8, "output_tokens": 3, "total_tokens": 11}))


@pytest.fixture
def production(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    for key, value in {"UNCHAIN_DATA_DIR": str(tmp_path / "data"),
            "PUPU_CONTEXT_V2_STORE_OWNER": "unchain", "PUPU_FEATURE_MEMORY_V2": "all",
            "PUPU_MEMORY_V2_MODE": "all", "PUPU_MEMORY_V2_CANARY_PERCENT": "100"}.items():
        monkeypatch.setenv(key, value)
    store = SkeletonResourceStore()
    store.save_draft(agent("production-agent"))
    calls = []
    import openai
    def client_factory(**kwargs):
        def create(**wire):
            calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            assert set(wire) in ({"input", "model", "stream", "tools", "max_output_tokens"},
                                {"input", "model", "stream", "max_output_tokens"})
            return Stream("End production reply")
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", client_factory)
    options = {"skeleton_selection": {"schema": "pupu.skeleton_chat_selection.v1", "kind": "resource",
        "resource_id": "production-agent"}, "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": "production-chat", "durable_interactions_required": True,
        "workspace_root": str(tmp_path), "skeleton_credentials": {"test.key": {
            "provider": "openai", "endpoint": "https://example.test/v1", "api_key": "production-test-secret"}}}
    return store, options, calls


def test_public_skeleton_chat_runs_and_commits_only_end(production):
    store, options, calls = production
    events = list(adapter.stream_chat_events(message="first input", history=[], options=options,
        session_id="production-session", attempt_id="production-root-1"))
    roots = [event for event in events if event.get("type") == "final_message" and event.get("scope") == "root"]
    assert len(roots) == 1
    assert roots[0]["content"] == "End production reply"
    assert len(calls) == 1
    assert calls[0]["client"]["api_key"] == "production-test-secret"
    assert calls[0]["client"]["base_url"] == "https://example.test/v1"
    assert calls[0]["client"]["max_retries"] == 0
    from skeleton_production_state import load_launch
    launch = load_launch("production-session", "production-root-1", expected_owner_chat_id="production-chat")
    assert launch.store.load().state["status"] == "completed"
    assert launch.store.load().state["root_committed"] is True
    assert "production-test-secret" not in json.dumps(launch.descriptor)


def test_stream_worker_preserves_only_typed_committed_child_end_final():
    from skeleton_child_events import ChildEndAttribution, attach_end_attribution
    from skeleton_production_chat import _stream_worker_event

    node_final = _stream_worker_event({
        "type": "final_message", "scope": "node", "run_id": "node-N",
        "content": "raw model final",
    })
    node_lifecycle = _stream_worker_event({
        "type": "run_completed", "scope": "node", "run_id": "node-N",
    })
    child_end = attach_end_attribution({
        "type": "final_message", "scope": "child_end", "run_id": "child-C",
        "content": "committed graph End",
    }, ChildEndAttribution(
        root_run_id="root-R", parent_run_id="parent-P", child_run_id="child-C",
        graph_id="child-G",
    ))
    untyped_end = {
        "type": "final_message", "scope": "child_end", "run_id": "child-C",
        "content": "untyped final",
    }
    mapping_attribution_end = {
        **untyped_end,
        "_pupu_skeleton_child_attribution": {
            "child_run_id": "child-C", "root_run_id": "root-R",
        },
    }
    wrong_identity_end = {
        **child_end,
        "run_id": "other-child-C",
    }

    assert node_final["type"] == "workflow_step_final"
    assert node_lifecycle is None
    assert _stream_worker_event(child_end) == child_end
    assert _stream_worker_event(untyped_end) is None
    assert _stream_worker_event(mapping_attribution_end) is None
    assert _stream_worker_event(wrong_identity_end) is None


def test_second_chat_uses_new_root_and_keeps_prior_root_history(production):
    _store, options, calls = production
    for index, text in enumerate(("first request", "second request"), 1):
        events = list(adapter.stream_chat_events(message=text, history=[], options=options,
            session_id="production-session", attempt_id=f"production-root-{index}"))
        assert len([e for e in events if e.get("type") == "final_message" and e.get("scope") == "root"]) == 1
    assert len(calls) == 2
    wire = json.dumps(calls[1]["wire"])
    assert "first request" in wire and "second request" in wire
    assert "End production reply" in wire


def _approval_fixture(production, monkeypatch, *, count=2):
    from unchain.tools import Toolkit
    from test_skeleton_production_bindings import _pool
    store, options, calls = production
    old = store.get_resource("production-agent")
    store.save_draft(_pool(agent("production-agent")), expected_edit_token=old["edit_token"])
    toolkit = Toolkit()
    effects = []
    @toolkit.tool(name="dangerous_tool", requires_confirmation=True)
    def dangerous_tool(value: str) -> str:
        effects.append(value)
        return value
    adapter._set_runtime_toolkit_metadata(toolkit, toolkit_id="core", toolkit_name="Core")
    monkeypatch.setattr(adapter, "_build_selected_toolkits", lambda *args, **kwargs: [toolkit])
    from test_skeleton_agent_runtime import _OpenAIStream
    responses = [SimpleNamespace(id=f"response-{i}", output=[{"type": "function_call", "call_id": f"call-{i}",
        "name": "dangerous_tool", "arguments": json.dumps({"value": f"effect-{i}"})}],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}) for i in range(count)]
    responses.append(SimpleNamespace(id="done", output=[{"type": "message", "role": "assistant",
        "content": [{"type": "output_text", "text": "Approved End"}]}],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}))
    import openai
    def client_factory(**kwargs):
        def create(**wire):
            calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            assert responses, "completed model request must not replay"
            return _OpenAIStream(responses.pop(0))
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", client_factory)
    return options, effects, calls


def test_public_twice_approval_freezes_graph_and_cold_resumes_exact_request(production, monkeypatch):
    import durable_interaction_host as interactions
    from skeleton_resource_store import SkeletonResourceStore
    options, effects, calls = _approval_fixture(production, monkeypatch)
    events = list(adapter.stream_chat_events(message="approve twice", history=[], options=options,
        session_id="approval-session", attempt_id="approval-root"))
    assert not any(e.get("type") == "final_message" for e in events)
    assert effects == [] and len(calls) == 1
    # A cold resume must not read any mutable Agent/Workflow resource.
    monkeypatch.setattr(SkeletonResourceStore, "get_resource", lambda *args, **kwargs: pytest.fail("live graph lookup during resume"))
    for index in range(2):
        pending = interactions.get_pending_interaction("approval-session")
        assert pending["source_run_id"] == "approval-root"
        receipt = interactions.record_interaction_receipt(session_id="approval-session", interaction_id=pending["interaction_id"], approved=True)
        repeat = interactions.record_interaction_receipt(session_id="approval-session", interaction_id=pending["interaction_id"], approved=True)
        assert receipt["receipt_id"] == repeat["receipt_id"]
        with pytest.raises(interactions.DurableInteractionHostError):
            interactions.record_interaction_receipt(session_id="approval-session", interaction_id=pending["interaction_id"], approved=False)
        events = list(adapter.resume_chat_interaction_events(session_id="approval-session", interaction_id=pending["interaction_id"],
            options=options, attempt_id=f"approval-resume-{index}", source_attempt_id="approval-root"))
        assert len(effects) == index + 1 and len(calls) == index + 2
    roots = [e for e in events if e.get("type") == "final_message"]
    assert len(roots) == 1 and roots[0]["content"] == "Approved End"
    assert interactions.get_pending_interaction("approval-session")["status"] == "none"


def test_public_native_child_observations_bind_canonical_root_to_cold_transport(production, monkeypatch):
    import durable_interaction_host as interactions
    from skeleton_child_events import ChildEndAttribution, ChildNodeAttribution, strip_attribution
    from skeleton_production_state import load_launch
    from skeleton_resource_store import SkeletonResourceStore
    from skeleton_chat_selection import prepare_skeleton_chat_selection
    from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
    from test_skeleton_agent_runtime import _final_response, _handoff_response
    from test_skeleton_production_bindings import _api as bindings_api, _pool

    store, options, calls = production
    old = store.get_resource("production-agent")
    child = agent("reviewer-agent")
    child_end = next(node for node in child["nodes"] if node["id"] == "end")
    child_end["config"]["execution"] = {
        "inputs": [{"name": "message", "value": {
            "kind": "literal", "value": "Public child End sentinel",
        }, "missing": "error"}],
        "outputs": [{"name": "message", "source": {"kind": "input", "path": ["message"]}}],
    }
    child = _pool(child, toolkit_id="CoreToolkit", enabled=["write"])
    document = agent("production-agent", child_source={"kind": "embedded", "document": child})
    subagent = next(node for node in document["nodes"] if node["type"] == "subagent_pool")["config"]["subagents"][0]
    subagent["allowed_tools"] = ["write"]
    store.save_draft(document, expected_edit_token=old["edit_token"])
    options["toolkits"] = ["CoreToolkit"]
    selection = prepare_skeleton_chat_selection(options, store=store)
    frozen = freeze_skeleton_workflow_dependencies(selection, store=store)
    profile = next(node for node in document["nodes"] if node["id"] == "kernel")["config"]["kernel"]["profile"]
    assert profile["credential_ref"] == "test.key"
    assert profile["credential_ref"] in options["skeleton_credentials"]
    assert frozen is not None
    bindings = bindings_api()(
        selection, frozen, options, session_id="public-native-child-session",
        workspace_root=options["workspace_root"], resource_store=store,
    )
    try:
        child_tools = bindings.tools_for_node(SimpleNamespace(document_id="reviewer-agent", node_id="kernel"))
        assert [tool.name for tool in child_tools] == ["write"]
        assert bindings.tool_presentation("write")["toolkit_id"] == "core"
    finally:
        bindings.close()
    target = Path(options["workspace_root"]) / "approved-child-write.txt"
    target_text = "approved child write exactly once\n"
    from test_skeleton_agent_runtime import _OpenAIStream
    responses = [
        _handoff_response(),
        SimpleNamespace(id="child-write-turn", output=[{
            "type": "function_call", "call_id": "child-write-call", "name": "write",
            "arguments": json.dumps({"path": str(target), "content": target_text}),
        }], usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}),
        _final_response("child model final"),
    ]
    import openai

    def client_factory(**kwargs):
        def create(**wire):
            calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            assert responses, "cold child observation must not replay the provider request"
            return _OpenAIStream(responses.pop(0))
        return SimpleNamespace(responses=SimpleNamespace(create=create))

    monkeypatch.setattr(openai, "OpenAI", client_factory)
    root_run_id = "public-native-root-R"
    transport_attempt_id = "public-native-resume-T"
    initial = list(adapter.stream_chat_events(
        message="approve child", history=[], options=options,
        session_id="public-native-child-session", attempt_id=root_run_id,
    ))
    assert not target.exists()
    assert len(calls) == 2
    assert not [event for event in initial if event.get("type") == "final_message" and event.get("scope") == "root"]
    pending = interactions.get_pending_interaction("public-native-child-session")
    assert pending["source_run_id"] == root_run_id
    launch_before = load_launch("public-native-child-session", root_run_id)
    assert launch_before.descriptor["root_run_id"] == root_run_id
    interactions.record_interaction_receipt(
        session_id="public-native-child-session",
        interaction_id=pending["interaction_id"], approved=True,
    )
    monkeypatch.setattr(
        SkeletonResourceStore, "get_resource",
        lambda *args, **kwargs: pytest.fail("mutable Skeleton resource lookup during cold resume"),
    )
    resumed = list(adapter.resume_chat_interaction_events(
        session_id="public-native-child-session",
        interaction_id=pending["interaction_id"], options=options,
        attempt_id=transport_attempt_id, source_attempt_id=root_run_id,
    ))

    assert target.read_text(encoding="utf-8") == target_text
    assert len(calls) == 3
    launch_after = load_launch("public-native-child-session", root_run_id)
    assert launch_after.descriptor == launch_before.descriptor
    assert launch_after.plan.snapshot() == launch_before.plan.snapshot()
    child_node_events = []
    child_ends = []
    for event in resumed:
        clean, attribution = strip_attribution(event)
        if type(attribution) is ChildNodeAttribution:
            assert attribution.root_run_id == root_run_id
            assert attribution.transport_attempt_id == transport_attempt_id
            assert clean.get("run_id") == attribution.node_run_id
            child_node_events.append((clean, attribution))
        elif type(attribution) is ChildEndAttribution:
            assert attribution.root_run_id == root_run_id
            assert attribution.transport_attempt_id == transport_attempt_id
            assert clean.get("run_id") == attribution.child_run_id
            child_ends.append((clean, attribution))
    assert any(event.get("type") == "request_messages" for event, _ in child_node_events)
    assert any(event.get("type") == "response_received" for event, _ in child_node_events)
    assert len(child_ends) == 1
    assert child_ends[0][0]["content"] == "Public child End sentinel"
    assert len({child_ends[0][1].root_run_id, child_ends[0][1].transport_attempt_id}) == 2
    roots = [event for event in resumed if event.get("type") == "final_message" and event.get("scope") == "root"]
    assert len(roots) == 1
    assert roots[0]["run_id"] == root_run_id
    assert roots[0]["content"] == "Public child End sentinel"
    assert interactions.get_pending_interaction("public-native-child-session")["status"] == "none"


def test_public_cancel_wait_blocks_late_answer_and_releases_guard(production, monkeypatch):
    import durable_interaction_host as interactions
    from session_execution_guard import snapshot_session_guard
    options, effects, calls = _approval_fixture(production, monkeypatch, count=1)
    list(adapter.stream_chat_events(message="cancel approval", history=[], options=options,
        session_id="cancel-session", attempt_id="cancel-root"))
    pending = interactions.get_pending_interaction("cancel-session")
    cancelled = interactions.cancel_chat_execution(session_id="cancel-session", attempt_id="cancel-root",
        owner_chat_id="production-chat", expected_interaction_id=pending["interaction_id"])
    assert cancelled["state"] == "cancelled"
    assert effects == [] and len(calls) == 1
    with pytest.raises(interactions.DurableInteractionHostError):
        interactions.record_interaction_receipt(session_id="cancel-session", interaction_id=pending["interaction_id"], approved=True)
    assert snapshot_session_guard(session_id="cancel-session") is None


def test_disconnection_revokes_execution_authority_before_end_commit(production, monkeypatch):
    import skeleton_production_chat as wiring
    from threading import Event
    from types import SimpleNamespace
    from test_skeleton_production_chat import Stream
    from skeleton_production_state import load_launch
    release = Event()
    worker_stopped = Event()
    _store, options, _calls = production
    original_clear = wiring.clear_execution_attempt_binding
    def cleared(*args, **kwargs):
        try: return original_clear(*args, **kwargs)
        finally: worker_stopped.set()
    monkeypatch.setattr(wiring, "clear_execution_attempt_binding", cleared)
    # Instrument only a progress signal so the public consumer can disconnect
    # while the real graph has an in-flight native SDK call. Preserve the real
    # execution object, runner, guard, callback handling and End commit.
    actual_execution = wiring.PupuSkeletonAgentExecution
    emit_holder = {}
    def capture_execution(*args, **kwargs):
        emit_holder["emit"] = kwargs["callback"]
        return actual_execution(*args, **kwargs)
    monkeypatch.setattr(wiring, "PupuSkeletonAgentExecution", capture_execution)
    def create(**wire):
        emit_holder["emit"]({"type": "probe_sdk_entered"})
        assert release.wait(5), "offline SDK synchronization timed out"
        return Stream("must not commit after disconnect")
    import openai
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: SimpleNamespace(
        responses=SimpleNamespace(create=create)))
    stream = adapter.stream_chat_events(message="disconnect probe", history=[], options=options,
        session_id="disconnect-session", attempt_id="disconnect-root")
    try:
        for event in stream:
            if event.get("type") == "probe_sdk_entered":
                break
        else:
            pytest.fail("SDK entry signal was not forwarded")
        stream.close()
    finally:
        release.set()
    assert worker_stopped.wait(5), "worker did not finish cleanup"
    launch = load_launch("disconnect-session", "disconnect-root")
    state = launch.store.load().state
    assert (state["status"], state["root_committed"]) == ("cancelled", False)
