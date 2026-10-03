"""Background-only preparation must not run during foreground admission."""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

import memory_v2_background_worker as background
import memory_v2_unchain_runtime_factory as runtime
from memory_v2_unchain_graph_checkpoint import prepare_pupu_unchain_graph_checkpoint_host
from memory_v2_unchain_graph_root_completion import complete_pupu_unchain_graph_root
from memory_v2_unchain_root_completion import build_pupu_memory_v2_root_completion_resolver
from test_memory_v2_unchain_graph_root_completion import (
    _active_bridge, _run, _descriptors, _finish_graph, _propose_from_step,
    _NeverRunMemoryAgent,
)
from test_memory_v2_unchain_root_completion import _request, _result, _event, _snapshot


def _bridge(tmp_path, monkeypatch, construct):
    return _active_bridge(tmp_path, monkeypatch, run=_run(
        execution_id="execution-deferred", attempt_id="root-deferred", content="remember"),
        owner_chat_id="chat-deferred", invoker_factory=construct)


def test_admission_defers_invoker_and_registration_then_graph_registers_before_enqueue(tmp_path, monkeypatch):
    constructed, registered = [], []
    monkeypatch.setattr(background, "register_background_host", lambda **kwargs: registered.append(kwargs))
    def construct(codec):
        constructed.append(codec)
        return _NeverRunMemoryAgent()
    bridge = _bridge(tmp_path, monkeypatch, construct)
    assert constructed == []
    assert registered == []
    host = prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge, steps=_descriptors())
    _finish_graph(host)
    _propose_from_step(host)
    real_enqueue = type(bridge.preparation.host_factory.memory_host).enqueue_root_completion
    def enqueue(self, completion):
        assert len(registered) == 1
        return real_enqueue(self, completion)
    monkeypatch.setattr(type(bridge.preparation.host_factory.memory_host), "enqueue_root_completion", enqueue)
    receipt = complete_pupu_unchain_graph_root(host, agent_name="Root")
    assert receipt.memory.candidate_count == 1
    assert constructed == []
    bridge.preparation.host_factory.prepare_memory_completion()
    assert len(registered) == 1
    assert registered[0]["owner_chat_id"] == "chat-deferred"


def test_registration_failure_is_deferred_without_failing_completion(tmp_path, monkeypatch):
    calls = []
    def register(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise OSError("registry unavailable")
    monkeypatch.setattr(background, "register_background_host", register)
    bridge = _bridge(tmp_path, monkeypatch, lambda codec: _NeverRunMemoryAgent())
    factory = bridge.preparation.host_factory
    assert calls == []
    factory.prepare_memory_completion()
    factory.prepare_memory_completion()
    assert len(calls) == 1


@pytest.mark.parametrize("status,complete,expected", [
    ("completed", True, 1), ("completed", False, 0),
    ("failed", True, 0), ("cancelled", True, 0), ("suspended", True, 0),
])
def test_normal_completion_prepares_only_after_complete_terminal_proof(status, complete, expected):
    order = []
    result = _result(status)
    events = (
        _event("final_message", 1, content=result.messages[-1]["content"]),
        _event("run_completed", 2, status="completed"),
    ) if complete else ()
    def capture(request):
        order.append("capture")
        return _snapshot(*events)
    resolver = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=capture, before_enqueue=lambda: order.append("prepare"))
    assert resolver.resolve(_request(completion_granted=False)) is None
    factory = resolver.resolve(_request())
    assert order == []
    factory.build(result=result)
    assert order.count("prepare") == expected
    if expected:
        assert order == ["capture", "prepare"]


def test_lazy_invoker_concurrent_construction_and_exact_arguments():
    built, seen = [], []
    codec, request, toolkit, binding = (object() for _ in range(4))
    def construct(value):
        built.append(value)
        def run(req, **kwargs):
            seen.append((req, kwargs))
            return "result"
        return SimpleNamespace(run=run)
    invoker = runtime._DeferredMemoryAgentInvoker(construct, codec)
    assert built == []
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: invoker.run(request, toolkit=toolkit, binding=binding), range(8)))
    assert results == ["result"] * 8
    assert built == [codec]
    assert seen == [(request, {"toolkit": toolkit, "binding": binding})] * 8


@pytest.mark.parametrize("invalid", [True, False])
def test_lazy_invoker_rejects_bad_factory_only_when_invoked(invalid):
    def construct(codec):
        if invalid:
            return object()
        raise RuntimeError("provider setup failed")
    invoker = runtime._DeferredMemoryAgentInvoker(construct, object())
    with pytest.raises(runtime.PupuUnchainHostFactoryError):
        invoker.run(object(), toolkit=object(), binding=object())


def test_normal_official_module_registers_before_enqueue(tmp_path, monkeypatch):
    from test_memory_v2_unchain_runtime_factory import (
        test_active_host_builds_agent_with_only_official_normal_memory_tools,
    )
    from unchain.memory.curator.host import MemoryAgentHostAdapter
    order = []
    monkeypatch.setattr(background, "register_background_host", lambda **kwargs: order.append("register"))
    real_enqueue = MemoryAgentHostAdapter.enqueue_root_completion
    def enqueue(self, completion):
        assert order == ["register"]
        order.append("enqueue")
        return real_enqueue(self, completion)
    monkeypatch.setattr(MemoryAgentHostAdapter, "enqueue_root_completion", enqueue)
    # Uses real factory, canonical terminal journal, AgentBuilder and official hooks.
    test_active_host_builds_agent_with_only_official_normal_memory_tools(tmp_path)
    assert order == ["register", "enqueue"]


def test_deferred_real_registration_survives_cold_worker_restart(tmp_path, monkeypatch):
    from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
    from test_memory_v2_background_worker import _await
    from test_memory_v2_unchain_graph_root_completion import _ApplyMemoryAgent
    from memory_v2_unchain_curator_query import open_pupu_unchain_curator_query_api
    monkeypatch.setattr(background, "_DISPATCHER", None)
    bridge = _bridge(tmp_path, monkeypatch, PupuOfficialMemoryAgentInvokerFactory(
        options={}, provider="ollama", model_id="test-model"))
    assert background._DISPATCHER is None
    host = prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge, steps=_descriptors())
    _finish_graph(host)
    _propose_from_step(host)
    receipt = complete_pupu_unchain_graph_root(host, agent_name="Root")
    registry = background._DISPATCHER.registry
    assert registry.page()[0]["owner_chat_id"] == "chat-deferred"
    cold = background.MemoryBackgroundRegistry(registry.database_path)
    assert cold.options(cold.page()[0]) == {}
    worker = background.MemoryBackgroundDispatcher(cold, poll_seconds=0.02)
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: _ApplyMemoryAgent)
    query = open_pupu_unchain_curator_query_api(root_dir=registry.database_path.parent,
                                             owner_chat_id="chat-deferred")
    def jobs():
        return query.list_consolidation_jobs(owner_chat_id="chat-deferred")["jobs"]
    assert jobs()[0]["status"] == "pending"
    worker.start()
    try:
        _await(lambda: jobs()[0]["status"] == "completed")
        assert jobs()[0]["job_id"] == receipt.memory.job_id
        assert len(jobs()) == 1
    finally:
        worker.stop()


def test_graph_registration_failure_still_enqueues_once(tmp_path, monkeypatch):
    from memory_v2_unchain_curator_query import open_pupu_unchain_curator_query_api
    bridge = _bridge(tmp_path, monkeypatch, lambda codec: _NeverRunMemoryAgent())
    host = prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge, steps=_descriptors())
    _finish_graph(host)
    _propose_from_step(host)
    calls = []
    def register(**kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise OSError("registry unavailable")
    monkeypatch.setattr(background, "register_background_host", register)
    complete_pupu_unchain_graph_root(host, agent_name="Root")
    query = open_pupu_unchain_curator_query_api(root_dir=tmp_path / "memory_v2",
                                             owner_chat_id="chat-deferred")
    assert len(query.list_consolidation_jobs(owner_chat_id="chat-deferred")["jobs"]) == 1
    receipt = complete_pupu_unchain_graph_root(host, agent_name="Root")
    assert receipt.memory.candidate_count == 1
    assert len(query.list_consolidation_jobs(owner_chat_id="chat-deferred")["jobs"]) == 1
