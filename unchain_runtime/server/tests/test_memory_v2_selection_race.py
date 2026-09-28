"""Real foreground/worker interleavings across the model-selection boundary."""
import json
import sqlite3
import threading
from dataclasses import replace
from pathlib import Path
from unittest import mock

import pytest

import memory_v2_background_worker as background
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
from memory_v2_unchain_graph_checkpoint import prepare_pupu_unchain_graph_checkpoint_host
from memory_v2_unchain_graph_root_completion import complete_pupu_unchain_graph_root
from test_memory_v2_background_worker import _queued, _jobs, _await
from test_memory_v2_unchain_graph_root_completion import (
    _active_bridge, _run, _descriptors, _finish_graph, _propose_from_step, _ApplyMemoryAgent,
)


def _new_job(tmp_path, monkeypatch, registry, *, fail_registration):
    bridge = _active_bridge(tmp_path, monkeypatch, run=_run(
        execution_id="execution-background", attempt_id="new-model-root", content="New decision"),
        owner_chat_id="chat-background", invoker_factory=PupuOfficialMemoryAgentInvokerFactory(
            options={"api_key": "new-key"}, provider="ollama", model_id="new-model"))
    host = prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge,
        steps=tuple(replace(step, attempt_id=step.attempt_id + "-new") for step in _descriptors()))
    _finish_graph(host)
    _propose_from_step(host)
    if fail_registration:
        with mock.patch.object(registry, "_connect", side_effect=sqlite3.OperationalError("registry outage")):
            return complete_pupu_unchain_graph_root(host, agent_name="New root")
    return complete_pupu_unchain_graph_root(host, agent_name="New root")


@pytest.mark.parametrize("registration", ["deferred", "registered", "restored"])
def test_new_root_between_discovery_and_claim_never_uses_old_model(tmp_path, monkeypatch, registration):
    monkeypatch.setattr(background, "_DISPATCHER", None)
    _, _, registry = _queued(tmp_path, monkeypatch, candidate=False)
    old_row = registry.page()[0]
    assert _jobs(registry) == []
    checked, resume = threading.Event(), threading.Event()
    results, errors, selections = [], [], []
    real_exists = Path.exists
    retry_path = registry._retry_path("chat-background", "unchain")
    def paused_exists(path):
        answer = real_exists(path)
        if path == retry_path and threading.current_thread() is thread and not checked.is_set():
            checked.set()
            assert resume.wait(5)
        return answer
    def resolve(config, options):
        selections.append((config["model_id"], options))
        return _ApplyMemoryAgent
    monkeypatch.setattr(background, "resolve_invoker_factory", resolve)
    def process():
        try:
            results.append(background.process_owner(registry, old_row, threading.Event()))
        except Exception as error:
            errors.append(error)
    thread = threading.Thread(target=process)
    with mock.patch.object(Path, "exists", paused_exists):
        thread.start()
        try:
            assert checked.wait(5)
            receipt = _new_job(tmp_path, monkeypatch, registry,
                               fail_registration=registration != "registered")
            if registration == "restored":
                registry.recover_deferred(threading.Event())
        finally:
            resume.set()
            thread.join(5)
    assert not thread.is_alive() and not errors
    assert len(_jobs(registry)) == 1
    assert _jobs(registry)[0]["run_id"] == "new-model-root"
    if registration == "deferred":
        assert selections == []  # No provider construction for stale selection.
        assert results == ["retry"]
        assert _jobs(registry)[0]["status"] == "pending"
        assert _jobs(registry)[0]["last_error_code"] == "memory_background_registration_pending"
        # Automatic cold recovery, no repeated foreground completion.
        cold = background.MemoryBackgroundRegistry(registry.database_path)
        worker = background.MemoryBackgroundDispatcher(cold, poll_seconds=0.02)
        worker.start()
        try:
            _await(lambda: _jobs(registry)[0]["status"] == "completed")
        finally:
            worker.stop()
        assert selections == [("new-model", {})]  # Credentials remain ephemeral.
    else:
        assert results == ["processed"]
        assert selections == [("new-model", {"api_key": "new-key"})]
    assert _jobs(registry)[0]["job_id"] == receipt.memory.job_id
    assert _jobs(registry)[0]["status"] == "completed"


@pytest.mark.parametrize("pending", [True, False])
def test_selection_change_after_host_build_before_claim(tmp_path, monkeypatch, pending):
    from unchain.memory.curator.host import MemoryAgentHostAdapter
    monkeypatch.setattr(background, "_DISPATCHER", None)
    _, _, registry = _queued(tmp_path, monkeypatch)
    selected = background.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(
        options={"api_key": "new-key"}, provider="ollama", model_id="new-model"))
    original = MemoryAgentHostAdapter.process_next
    selections = []
    def before_claim(host, **kwargs):
        (registry.defer if pending else registry.register)("chat-background", "unchain", *selected)
        return original(host, **kwargs)
    def resolve(config, options):
        selections.append((config["model_id"], options))
        return _ApplyMemoryAgent
    monkeypatch.setattr(MemoryAgentHostAdapter, "process_next", before_claim)
    monkeypatch.setattr(background, "resolve_invoker_factory", resolve)
    result = background.process_owner(registry, registry.page()[0], threading.Event())
    assert result == ("retry" if pending else "processed")
    assert selections == ([] if pending else [("new-model", {"api_key": "new-key"})])


def test_selected_invocation_does_not_lock_out_foreground_registration(tmp_path, monkeypatch):
    monkeypatch.setattr(background, "_DISPATCHER", None)
    _, _, registry = _queued(tmp_path, monkeypatch)
    entered, release, registered = threading.Event(), threading.Event(), threading.Event()
    selections, errors = [], []
    class Blocked(_ApplyMemoryAgent):
        def run(self, request, **kwargs):
            entered.set()
            assert release.wait(5)
            return super().run(request, **kwargs)
    def resolve(config, options):
        selections.append((config["model_id"], options))
        return Blocked
    monkeypatch.setattr(background, "resolve_invoker_factory", resolve)
    def process():
        try:
            background.process_owner(registry, registry.page()[0], threading.Event())
        except Exception as error:
            errors.append(error)
    worker = threading.Thread(target=process)
    worker.start()
    update = None
    try:
        assert entered.wait(5)
        def register():
            registry.register("chat-background", "unchain", *background.configuration_from_factory(
                PupuOfficialMemoryAgentInvokerFactory(options={"api_key": "next-key"},
                    provider="ollama", model_id="next-model")))
            registered.set()
        update = threading.Thread(target=register)
        update.start()
        assert registered.wait(2)
        assert selections == [("memory-model", {"api_key": "never-persist-secret"})]
    finally:
        release.set()
        worker.join(5)
        if update is not None:
            update.join(5)
    assert not errors and not worker.is_alive()
    assert _jobs(registry)[0]["status"] == "completed"
    assert json.loads(registry.page()[0]["config_json"])["model_id"] == "next-model"
