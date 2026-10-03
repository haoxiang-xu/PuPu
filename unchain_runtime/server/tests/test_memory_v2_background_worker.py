from __future__ import annotations

import json
import sqlite3
import threading
import time
from types import SimpleNamespace

import pytest

import memory_v2_background_worker as background
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
from memory_v2_unchain_curator_query import open_pupu_unchain_curator_query_api
from memory_v2_unchain_graph_checkpoint import prepare_pupu_unchain_graph_checkpoint_host
from memory_v2_unchain_graph_root_completion import complete_pupu_unchain_graph_root
from test_memory_v2_unchain_graph_root_completion import (
    _run, _active_bridge, _descriptors, _finish_graph, _propose_from_step,
    _NeverRunMemoryAgent, _ApplyMemoryAgent,
)


@pytest.fixture
def isolated_dispatcher(monkeypatch):
    monkeypatch.setattr(background, "_DISPATCHER", None)
    yield
    if background._DISPATCHER:
        background._DISPATCHER.stop()


def _queued(tmp_path, monkeypatch, *, candidate=True, provider="ollama"):
    bridge = _active_bridge(tmp_path, monkeypatch, run=_run(
        execution_id="execution-background", attempt_id="root-background", content="remember the decision"),
        owner_chat_id="chat-background", invoker_factory=lambda codec: _NeverRunMemoryAgent())
    host = prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge, steps=_descriptors())
    _finish_graph(host)
    if candidate:
        _propose_from_step(host)
    background.register_background_host(database_path=tmp_path / "memory_v2/context_v2.sqlite3",
        owner_chat_id="chat-background", invoker_factory=PupuOfficialMemoryAgentInvokerFactory(
            options={"api_key": "never-persist-secret", "messages": [{"content": "private-input"}]},
            provider=provider, model_id="memory-model"))
    receipt = complete_pupu_unchain_graph_root(host, agent_name="Root graph")
    return host, receipt, background._DISPATCHER.registry


def _jobs(registry):
    return open_pupu_unchain_curator_query_api(root_dir=registry.database_path.parent,
        owner_chat_id="chat-background").list_consolidation_jobs(owner_chat_id="chat-background")["jobs"]


def _await(predicate, timeout=4):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    assert predicate()


def test_graph_foreground_and_next_admission_finish_while_worker_blocked(tmp_path, monkeypatch, isolated_dispatcher):
    host, receipt, registry = _queued(tmp_path, monkeypatch)
    entered, release = threading.Event(), threading.Event()
    calls = []
    class Blocked(_ApplyMemoryAgent):
        def run(self, request, **kwargs):
            calls.append(request.job.job_id)
            entered.set()
            assert release.wait(4)
            return super().run(request, **kwargs)
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: Blocked)
    worker = background._DISPATCHER
    worker.start()
    try:
        assert entered.wait(3)
        assert receipt.memory.worker_receipt is None
        assert host.recover().is_complete
        assert _jobs(registry)[0]["status"] == "leased"
        # Actual next foreground admission in the same execution proceeds.
        next_bridge = _active_bridge(tmp_path, monkeypatch, run=_run(
            execution_id="execution-background", attempt_id="next-background", content="next question"),
            owner_chat_id="chat-background", invoker_factory=lambda codec: _NeverRunMemoryAgent())
        assert next_bridge.preparation.binding.attempt_id == "next-background"
        for _ in range(100):
            background.notify_memory_background()
        assert len(calls) == 1
        release.set()
        _await(lambda: _jobs(registry)[0]["status"] == "completed")
        assert len(calls) == 1
        assert receipt.memory.worker_receipt is None  # Frozen foreground receipt.
    finally:
        release.set()
        worker.stop()


def test_restart_discovers_job_without_wake_and_applies_once(tmp_path, monkeypatch, isolated_dispatcher):
    _, receipt, registry = _queued(tmp_path, monkeypatch)
    assert _jobs(registry)[0]["status"] == "pending"
    calls = []
    class Apply(_ApplyMemoryAgent):
        def run(self, request, **kwargs):
            calls.append(request.job.job_id)
            return super().run(request, **kwargs)
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: Apply)
    cold = background.MemoryBackgroundRegistry(registry.database_path)
    assert cold.options(cold.page()[0]) == {}
    worker = background.MemoryBackgroundDispatcher(cold, poll_seconds=0.02)
    worker.start()
    try:
        _await(lambda: _jobs(registry)[0]["status"] == "completed")
        assert calls == [receipt.memory.job_id]
        row = cold.page()[0]
        assert background.process_owner(cold, row, threading.Event()) == "idle"
        assert calls == [receipt.memory.job_id]
    finally:
        worker.stop()


def test_missing_credentials_after_restart_persists_retry_and_ignores_other_provider_key(tmp_path, monkeypatch, isolated_dispatcher):
    _, _, registry = _queued(tmp_path, monkeypatch, provider="openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "wrong-provider-secret")
    monkeypatch.setenv("UNCHAIN_API_KEY", "ambiguous-secret")
    cold = background.MemoryBackgroundRegistry(registry.database_path)
    assert background.process_owner(cold, cold.page()[0], threading.Event()) == "retry"
    job = _jobs(registry)[0]
    assert job["status"] == "pending"
    assert job["last_error_code"] == "memory_background_credentials_unavailable"
    assert job["next_attempt_at_ms"] > int(time.time() * 1000)
    assert background.process_owner(cold, cold.page()[0], threading.Event()) == "idle"


def test_no_candidate_does_not_construct_background_host(tmp_path, monkeypatch, isolated_dispatcher):
    _, receipt, registry = _queued(tmp_path, monkeypatch, candidate=False)
    import memory_v2_background_host
    monkeypatch.setattr(memory_v2_background_host, "build_background_memory_host",
                        lambda **kwargs: pytest.fail("no candidate must not build a worker"))
    assert receipt.memory.candidate_count == 0
    assert background.process_owner(registry, registry.page()[0], threading.Event()) == "idle"


def test_configuration_is_closed_content_free_and_does_not_retain_request(tmp_path):
    path = tmp_path / "context_v2.sqlite3"
    sqlite3.connect(path).close()
    registry = background.MemoryBackgroundRegistry(path)
    factory = PupuOfficialMemoryAgentInvokerFactory(options={"api_key": "secret-marker",
        "messages": ["prompt-marker"], "callback": lambda: None, "cancel_event": threading.Event()},
        provider="openai", model_id="memory-model")
    selected = background.configuration_from_factory(factory)
    registry.register("chat-a", "unchain", *selected)
    row = registry.page()[0]
    raw = json.loads(row["config_json"])
    assert set(raw) == {"schema", "status", "reason", "provider", "model_id", "custom"}
    assert set(factory._options) == {"api_key"}
    assert registry.options(row) == {"api_key": "secret-marker"}
    assert b"secret-marker" not in path.read_bytes()
    assert b"prompt-marker" not in path.read_bytes()
    for invalid in ({**raw, "extra": True}, {**raw, "schema": "v2"}, {**raw, "custom": 1}):
        with pytest.raises(ValueError):
            registry.register("chat-a", "unchain", invalid, {})


def test_shutdown_does_not_join_provider_and_cannot_start_second_worker(tmp_path):
    path = tmp_path / "context_v2.sqlite3"
    sqlite3.connect(path).close()
    registry = background.MemoryBackgroundRegistry(path)
    registry.register("chat-a", "unchain", *background.configuration_from_factory(
        PupuOfficialMemoryAgentInvokerFactory(options={}, provider="ollama", model_id="model")))
    entered, release = threading.Event(), threading.Event()
    calls = []
    def blocked(*args):
        calls.append(1)
        entered.set()
        release.wait(3)
        return "idle"
    worker = background.MemoryBackgroundDispatcher(registry, process=blocked, poll_seconds=0.01)
    worker.start()
    assert entered.wait(1)
    before = time.monotonic()
    worker.stop()
    assert time.monotonic() - before < 0.3
    worker.start()
    assert calls == [1]
    release.set()
    worker._thread.join(1)
    assert not worker._thread.is_alive()


def test_empty_startup_does_not_create_a_database(tmp_path):
    path = tmp_path / "memory_v2/context_v2.sqlite3"
    worker = background.MemoryBackgroundDispatcher(background.MemoryBackgroundRegistry(path), poll_seconds=0.01)
    worker.start()
    worker.stop()
    assert not path.exists()


def test_registry_pagination_does_not_starve_later_owners(tmp_path):
    path = tmp_path / "context_v2.sqlite3"
    sqlite3.connect(path).close()
    registry = background.MemoryBackgroundRegistry(path)
    selected = background.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(
        options={}, provider="ollama", model_id="model"))
    for number in range(40):
        registry.register(f"chat-{number:03}", "unchain", *selected)
    seen = set()
    done = threading.Event()
    def process(registry, row, stopped):
        seen.add(row["owner_chat_id"])
        if len(seen) == 40:
            done.set()
        return "idle"
    worker = background.MemoryBackgroundDispatcher(registry, process=process)
    worker.start()
    try:
        assert done.wait(2)
    finally:
        worker.stop()


def test_expired_claim_restarts_with_fresh_claim_identity(tmp_path, monkeypatch, isolated_dispatcher):
    host, _, registry = _queued(tmp_path, monkeypatch)
    from unchain.memory.curator import CuratorCoordinator
    repository = host.bridge.preparation.host_factory.curation_repository
    clock = int(time.time() * 1000)
    claimed = CuratorCoordinator(repository, clock_ms=lambda: clock).claim_next(
        worker_id="crashed-worker", lease_ms=1000, operation_id="crashed-claim")
    guard = repository.bind_mutation_guard(job=claimed)
    assert background.process_owner(registry, registry.page()[0], threading.Event()) == "idle"
    time.sleep(1.05)  # Real SQLite lease expiration, not an edited row.
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: _ApplyMemoryAgent)
    cold = background.MemoryBackgroundRegistry(registry.database_path)
    assert background.process_owner(cold, cold.page()[0], threading.Event()) == "processed"
    job = _jobs(registry)[0]
    assert job["status"] == "completed"
    assert job["attempt_count"] == 2
    with pytest.raises(Exception, match="lease"):
        guard.assert_active()


@pytest.mark.parametrize("change", ["delete", "rebase", "stop"])
def test_inflight_source_change_prevents_background_write(tmp_path, monkeypatch, isolated_dispatcher, change):
    host, receipt, registry = _queued(tmp_path, monkeypatch)
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    class Blocked(_ApplyMemoryAgent):
        def run(self, request, **kwargs):
            entered.set()
            assert release.wait(4)
            return super().run(request, **kwargs)
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: Blocked)
    stopped = threading.Event()
    failures = []
    def run():
        try:
            background.process_owner(registry, registry.page()[0], stopped)
        except Exception as error:
            failures.append(type(error).__name__)
        finally:
            finished.set()
    thread = threading.Thread(target=run)
    thread.start()
    try:
        assert entered.wait(3)
        if change == "delete":
            from memory_v2_unchain_deletion_adapter import delete_pupu_unchain_chat
            from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
            SQLitePromotionV2Store(database_path=registry.database_path,
                                   object_directory=registry.database_path.parent / "objects")
            delete_pupu_unchain_chat(database_path=registry.database_path,
                owner_chat_id="chat-background", operation_id="delete-while-background")
            assert registry.page() == ()
        elif change == "rebase":
            from unchain.persistence.sqlite_generation_rebase_v2 import (
                SQLiteGenerationRebaseV2Service, GenerationRebaseIntent, GenerationRebaseKind,
                GenerationRebasePreflight, GenerationRebaseRequest, build_generation_rebase_operation)
            from session_execution_guard import session_rebase_guard
            service = SQLiteGenerationRebaseV2Service(host.bridge.preparation.host_factory.context_store)
            head = service.current(owner_chat_id="chat-background", session_id="execution-background",
                                   execution_id="execution-background")
            intent = GenerationRebaseIntent(owner_chat_id="chat-background", session_id="execution-background",
                execution_id="execution-background", generation_id="edited-generation", attempt_id="edited-attempt",
                kind=GenerationRebaseKind.EDIT, previous_generation_id=head.current_generation_id,
                expected_head_revision=head.revision, source_revision="edited-source", messages=(),
                preflight=GenerationRebasePreflight(proof_id="edit-proof", host_snapshot_sanitized=True))
            with session_rebase_guard(session_id="execution-background", execution_id="execution-background",
                                      operation_id="rebase-during-background", data_dir=tmp_path):
                service.rebase(GenerationRebaseRequest(intent=intent,
                    operation=build_generation_rebase_operation(operation_id="rebase-during-background", intent=intent)))

        else:
            stopped.set()
        release.set()
        assert finished.wait(3)
        if change != "delete":
            listing = host.bridge.preparation.host_factory.workspace.list(parent_path="/", recursive=True, limit=20)
            assert not any(entry.path == "/graph/decision.md" for entry in listing.entries)
            job = _jobs(registry)[0]
            assert job["status"] == ("failed" if change == "rebase" else "pending")
            assert job["last_error_code"] == ("memory_background_source_superseded" if change == "rebase" else "memory_background_stopping")
        assert receipt.memory.worker_receipt is None
    finally:
        release.set()
        thread.join(4)


def test_stale_owner_or_backend_cannot_reconstruct_capabilities(tmp_path, monkeypatch, isolated_dispatcher):
    _, _, registry = _queued(tmp_path, monkeypatch)
    row = registry.page()[0]
    assert background.process_owner(registry, dict(row, backend="pupu_legacy"), threading.Event()) == "unavailable"
    with pytest.raises(Exception):
        background.process_owner(registry, dict(row, owner_chat_id="other-chat"), threading.Event())


def test_custom_transport_missing_after_restart_never_uses_builtin_fallback():
    from memory_v2_unchain_agent_selection import PupuUnavailableMemoryAgentInvokerFactory
    raw = dict(schema="pupu.memory-background-host.v1", status="Ready", reason="",
               provider="openai", model_id="custom-model", custom=True)
    resolved = background.resolve_invoker_factory(raw, {"api_key": "official-secret"})
    assert isinstance(resolved, PupuUnavailableMemoryAgentInvokerFactory)
    assert resolved.reason == "memory_background_provider_configuration_unavailable"


def test_memory_mutation_guard_never_takes_foreground_run_guard(tmp_path):
    from memory_v2_background_host import memory_background_source_guard
    from session_execution_guard import SessionExecutionGuardRegistry
    registry = SessionExecutionGuardRegistry(data_dir=tmp_path)
    with memory_background_source_guard(database_path=tmp_path / "memory_v2/context_v2.sqlite3", owner_chat_id="chat-a"):
        registry.acquire("session-a", "attempt-a", operation="run", execution_id="session-a")
        registry.release_run("session-a", "attempt-a")


def test_host_rebase_shares_background_mutation_lock(tmp_path):
    from memory_v2_background_host import memory_background_source_guard
    from memory_v2_unchain_generation_api import open_pupu_unchain_generation_api, MemoryV2UnchainGenerationAPIError
    from test_memory_v2_unchain_generation_api import _setup_generation_api, _rebase
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(root_dir=setup.root_dir, owner_chat_id=setup.owner_chat_id)
    with memory_background_source_guard(database_path=setup.root_dir / "context_v2.sqlite3", owner_chat_id=setup.owner_chat_id):
        with pytest.raises(MemoryV2UnchainGenerationAPIError):
            _rebase(api, setup)
    # A busy failure did not apply or poison the rebase's operation identity.
    result = _rebase(api, setup)
    assert result["generation_id"] != setup.receipt.generation_id


def test_startup_recovers_pre_upgrade_job_without_overwriting_authorized_config(tmp_path, monkeypatch, isolated_dispatcher):
    _, _, registry = _queued(tmp_path, monkeypatch)
    original = registry.page()[0]["config_json"]
    registry.recover_registrations(threading.Event())
    assert registry.page()[0]["config_json"] == original
    with sqlite3.connect(registry.database_path) as connection:
        connection.execute("DROP TABLE pupu_memory_background_hosts")
    cold = background.MemoryBackgroundRegistry(registry.database_path)
    cold.recover_registrations(threading.Event())
    row = cold.page()[0]
    assert json.loads(row["config_json"])["reason"] == "memory_background_configuration_unavailable"
    assert background.process_owner(cold, row, threading.Event()) == "retry"
    assert _jobs(registry)[0]["last_error_code"] == "memory_background_configuration_unavailable"


def test_retry_receipt_does_not_suppress_a_new_authorized_claim(tmp_path, monkeypatch, isolated_dispatcher):
    _, _, registry = _queued(tmp_path, monkeypatch)
    from unchain.memory.curator import CuratorRunnerFailure, FailureRetryability
    calls = []
    class RetryOnce(_ApplyMemoryAgent):
        def run(self, request, **kwargs):
            calls.append(request.job.job_id)
            if len(calls) == 1:
                raise CuratorRunnerFailure("provider_temporarily_unavailable",
                    retryability=FailureRetryability.RETRYABLE, retry_delay_ms=1)
            return super().run(request, **kwargs)
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: RetryOnce)
    row = registry.page()[0]
    assert background.process_owner(registry, row, threading.Event()) == "retry"
    time.sleep(0.02)
    assert background.process_owner(registry, row, threading.Event()) == "processed"
    assert len(calls) == 2 and calls[0] == calls[1]
    assert _jobs(registry)[0]["attempt_count"] == 2
    assert _jobs(registry)[0]["status"] == "completed"


def test_resumed_root_uses_actual_attempt_not_ancestor_root_for_source_scope(tmp_path, monkeypatch, isolated_dispatcher):
    from dataclasses import replace
    import memory_v2_unchain_ownership_adapter as ownership
    _, _, registry = _queued(tmp_path, monkeypatch)
    original = ownership.list_pupu_unchain_ownership_lifecycles
    # A resumed attempt keeps the original root as lineage metadata. Its
    # completion and source authority name the actual resumed run/attempt.
    def resumed(**kwargs):
        return tuple(replace(item, root_run_id="ancestor-root") for item in original(**kwargs))
    monkeypatch.setattr(ownership, "list_pupu_unchain_ownership_lifecycles", resumed)
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: _ApplyMemoryAgent)
    assert background.process_owner(registry, registry.page()[0], threading.Event()) == "processed"
    assert _jobs(registry)[0]["status"] == "completed"


def test_transient_startup_recovery_failure_is_retried_without_restart(tmp_path, monkeypatch):
    registry = background.MemoryBackgroundRegistry(tmp_path / "absent.sqlite3")
    calls = []
    recovered = threading.Event()
    def recover(stopped):
        calls.append(1)
        if len(calls) == 1:
            raise sqlite3.OperationalError("database is locked")
        recovered.set()
    monkeypatch.setattr(registry, "recover_registrations", recover)
    worker = background.MemoryBackgroundDispatcher(registry, poll_seconds=0.01)
    worker.start()
    try:
        assert recovered.wait(1)
        assert len(calls) == 2
    finally:
        worker.stop()
