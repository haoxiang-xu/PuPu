"""Real producer/consumer regressions from the step 3 audit."""
import copy
import json
import sqlite3
import threading
from contextlib import ExitStack
from types import SimpleNamespace
from unittest import mock

import pytest

import memory_v2_background_worker as background
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
from memory_v2_unchain_curator_query import open_pupu_unchain_curator_query_api
from memory_v2_unchain_graph_checkpoint import prepare_pupu_unchain_graph_checkpoint_host
from memory_v2_unchain_graph_root_completion import complete_pupu_unchain_graph_root
from memory_v2_unchain_runtime_factory import _PupuUnchainReferenceCodec
from test_memory_v2_background_worker import _queued, _jobs, _await
from test_memory_v2_deferred_preparation import _bridge
from test_memory_v2_unchain_graph_root_completion import _descriptors, _finish_graph, _propose_from_step, _ApplyMemoryAgent
from unchain.journal import ResourceRef
from unchain.memory.toolkit import MemoryToolkitError, ReferencePurpose


def _unavailable(*args, **kwargs):
    raise sqlite3.OperationalError("injected registry outage")


def test_registry_failure_keeps_normal_and_graph_stream_completed(tmp_path, monkeypatch):
    from test_memory_v2_unchain_runtime_factory import test_active_host_builds_agent_with_only_official_normal_memory_tools
    from test_memory_v2_unchain_graph_root_completion_entry import _entry_stack, _recipe, _root_options, _runtime_context, adapter
    monkeypatch.setattr(background, "register_background_host", _unavailable)
    test_active_host_builds_agent_with_only_official_normal_memory_tools(tmp_path / "normal")
    with ExitStack() as stack:
        _entry_stack(stack, tmp_path=tmp_path / "graph", mode="active", execution_id="audit-execution")
        events = list(adapter._stream_recipe_graph_events(recipe=_recipe(), message="report",
            history=[], attachments=[], options=_root_options(owner_chat_id="audit-chat",
            execution_id="audit-execution", run_id="audit-root"), session_id="audit-execution",
            run_id_override="audit-root", runtime_context=_runtime_context(
                execution_id="audit-execution", run_id="audit-root")))
    assert any(e.get("type") == "final_message" for e in events)
    summaries = [e for e in events if e.get("type") == "stream_summary"]
    assert summaries[-1]["bundle"]["lifecycle"]["status"] == "completed"


def test_registration_outage_cold_restart_restores_selection_and_applies_once(tmp_path, monkeypatch):
    monkeypatch.setattr(background, "_DISPATCHER", None)
    bridge = _bridge(tmp_path, monkeypatch, PupuOfficialMemoryAgentInvokerFactory(
        options={"api_key": "must-stay-ephemeral"}, provider="ollama", model_id="selected-model"))
    host = prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge, steps=_descriptors())
    _finish_graph(host)
    _propose_from_step(host)
    with mock.patch.object(background.MemoryBackgroundRegistry, "_connect", side_effect=_unavailable):
        receipt = complete_pupu_unchain_graph_root(host, agent_name="Root")
    registry = background._DISPATCHER.registry
    paths = list((registry.database_path.parent / "background_registration_retries").glob("*.json"))
    assert len(paths) == 1
    assert "must-stay-ephemeral" not in paths[0].read_text()
    cold = background.MemoryBackgroundRegistry(registry.database_path)
    query = open_pupu_unchain_curator_query_api(root_dir=registry.database_path.parent,
                                             owner_chat_id="chat-deferred")
    jobs = lambda: query.list_consolidation_jobs(owner_chat_id="chat-deferred")["jobs"]
    assert len(jobs()) == 1 and jobs()[0]["status"] == "pending"
    calls = []
    def resolve(config, options):
        assert config["provider"] == "ollama" and config["model_id"] == "selected-model"
        assert options == {}
        calls.append(1)
        return _ApplyMemoryAgent
    monkeypatch.setattr(background, "resolve_invoker_factory", resolve)
    worker = background.MemoryBackgroundDispatcher(cold, poll_seconds=0.02)
    worker.start()
    try:
        _await(lambda: jobs()[0]["status"] == "completed")
        assert calls == [1] and jobs()[0]["job_id"] == receipt.memory.job_id
        assert not paths[0].exists()
        assert background.process_owner(cold, cold.page()[0], threading.Event()) == "idle"
    finally:
        worker.stop()


def test_pending_registration_fences_old_selection_and_retries_without_new_turn(tmp_path, monkeypatch):
    monkeypatch.setattr(background, "_DISPATCHER", None)
    _, _, registry = _queued(tmp_path, monkeypatch)
    selected = background.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(
        options={}, provider="ollama", model_id="new-model"))
    registry.defer("chat-background", "unchain", *selected)
    assert background.process_owner(registry, registry.page()[0], threading.Event()) == "unavailable"
    with mock.patch.object(registry, "_connect", side_effect=_unavailable):
        registry.recover_deferred(threading.Event())
    assert registry._retry_path("chat-background", "unchain").exists()
    registry.recover_deferred(threading.Event())
    assert json.loads(registry.page()[0]["config_json"])["model_id"] == "new-model"


def test_deferred_registration_does_not_resurrect_deleted_chat(tmp_path, monkeypatch):
    from memory_v2_unchain_deletion_adapter import delete_pupu_unchain_chat
    from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
    monkeypatch.setattr(background, "_DISPATCHER", None)
    _, _, registry = _queued(tmp_path, monkeypatch)
    SQLitePromotionV2Store(database_path=registry.database_path,
                          object_directory=registry.database_path.parent / "objects")
    registry.defer("chat-background", "unchain", *background.configuration_from_factory(
        PupuOfficialMemoryAgentInvokerFactory(options={}, provider="ollama", model_id="model")))
    delete_pupu_unchain_chat(database_path=registry.database_path,
        owner_chat_id="chat-background", operation_id="delete-deferred-chat")
    registry.recover_deferred(threading.Event())
    assert not registry._retry_path("chat-background", "unchain").exists()
    assert registry.page() == ()


@pytest.mark.parametrize("mutation", ["unknown", "version", "owner", "backend"])
def test_registration_retry_rejects_wrong_envelope_and_identity(tmp_path, mutation):
    database = tmp_path / "context_v2.sqlite3"
    sqlite3.connect(database).close()
    registry = background.MemoryBackgroundRegistry(database)
    selected = background.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(
        options={}, provider="ollama", model_id="model"))
    registry.defer("chat-a", "unchain", *selected)
    path = registry._retry_path("chat-a", "unchain")
    raw = json.loads(path.read_text())
    if mutation == "unknown": raw["extra"] = True
    elif mutation == "version": raw["schema"] = "v2"
    elif mutation == "owner": raw["owner_chat_id"] = "chat-b"
    else: raw["backend"] = "other"
    path.write_text(json.dumps(raw))
    registry.recover_deferred(threading.Event())
    assert registry.page() == () and path.exists()


def test_official_nine_tool_producer_reaches_strict_raw_factory_and_completes_job(tmp_path, monkeypatch):
    import unchain_adapter as adapter
    from memory_v2_unchain_agent_factory import build_pupu_official_memory_agent_invoker
    from test_memory_v2_unchain_agent_factory import _ToolsModule, _PoliciesModule
    from memory_v2_unchain_model_invoker import _CONSOLIDATION_TOOL_NAMES
    monkeypatch.setattr(background, "_DISPATCHER", None)
    _, _, registry = _queued(tmp_path, monkeypatch)
    calls = []
    class RawAgent:
        def __init__(self, **kwargs):
            self.provider, self.model = kwargs["provider"], kwargs["model"]
            self.toolkit = kwargs["modules"][0].tools[0]
            assert set(kwargs["allowed_tools"]) == _CONSOLIDATION_TOOL_NAMES
            assert set(self.toolkit.tools) == _CONSOLIDATION_TOOL_NAMES
            assert set(self.toolkit._unchain_memory_v2_callables) == _CONSOLIDATION_TOOL_NAMES
            calls.append(1)
        def run(self, *, messages, payload, callback):
            task = json.loads(messages[0]["content"])
            for candidate in task["candidates"]:
                self.toolkit.tools["memory_candidate_read"].func(candidate_ref=candidate["candidate_ref"])
                self.toolkit.tools["memory_candidate_apply_new"].func(
                    candidate_ref=candidate["candidate_ref"], expected_binding_revision=candidate["binding_revision"])
            return SimpleNamespace(status="completed")
    monkeypatch.setattr(adapter, "_UnchainAgent", RawAgent)
    monkeypatch.setattr(adapter, "_ToolsModule", _ToolsModule)
    monkeypatch.setattr(adapter, "_PoliciesModule", _PoliciesModule)
    monkeypatch.setattr(adapter, "_resolve_agent_api_key", lambda *a, **kw: "test-key")
    monkeypatch.setattr(background, "resolve_invoker_factory", lambda config, options: lambda codec:
        build_pupu_official_memory_agent_invoker(options={}, provider="openai",
            model_id="memory-model", reference_codec=codec))
    background.process_owner(registry, registry.page()[0], threading.Event())
    assert _jobs(registry)[0]["status"] == "completed", _jobs(registry)[0].get("last_error_code")
    assert calls == [1]


@pytest.mark.parametrize("mutation", ["extra", "missing", "partial_reads"])
def test_toolkit_projection_does_not_allow_unknown_or_partial_shapes(mutation):
    from test_memory_v2_unchain_model_invoker import _toolkit, _request, _candidate, _Codec
    from memory_v2_unchain_model_invoker import _recording_toolkit, _TerminalEffectRecorder
    toolkit = _toolkit(_request(_candidate()), _Codec())
    if mutation == "missing": toolkit.tools.pop("memory_candidate_read")
    else: toolkit.tools["unknown" if mutation == "extra" else "memory_read"] = copy.copy(next(iter(toolkit.tools.values())))
    with pytest.raises(Exception, match="memory_agent_toolkit_scope_invalid"):
        _recording_toolkit(toolkit, _TerminalEffectRecorder())


def test_real_candidate_proposal_uri_is_lossless_and_replayable(tmp_path):
    from test_memory_v2_unchain_runtime_factory import _factory, _context, _attachment_request, _NeverRunOfficialMemoryAgent
    host = _factory(tmp_path, production_enabled=True, memory_agent_enabled=True,
                    memory_agent_model_invoker=_NeverRunOfficialMemoryAgent())
    host.context_module.runtime.bind_context(_context(execution_id="execution-a", generation_id="generation-a",
        attempt_id="attempt-a", current_input="Remember the test marker"))
    request = _attachment_request(agent_name="normal", execution_id="execution-a", attempt_id="attempt-a",
        run_id="attempt-a", completion_authority=True)
    attachment = host.normal_attachment_factory.attach(request)
    toolkit = host.memory_host.build_normal_toolkit(attachment.binding, attachment.capabilities)
    event = host.attempt(execution_id="execution-a", attempt_id="attempt-a").bundle.journal.capture_snapshot().events[0]
    args = dict(path="/test/marker.md", description="Synthetic marker", content="violet lighthouse",
        source_refs=[host.reference_codec.encode(ResourceRef("context_event", event.event_id, 1))])
    first = toolkit.tools["memory_propose"].func(**args)
    second = toolkit.tools["memory_propose"].func(**args)
    assert first["content_ref"] == second["content_ref"]
    uri = first["content_ref"]
    ref = host.reference_codec.decode(uri, purpose=ReferencePurpose.MEMORY)
    assert ref.kind == "memory_candidate_content" and ref.fragment == host.chat_space_id
    assert host.reference_codec.encode(ref) == uri
    # URI support does not turn candidate content into a granted memory read.
    with pytest.raises(Exception):
        toolkit.tools["memory_read"].func(ref=uri)


def test_populated_official_memory_tools_disclose_entry_ref_and_keep_content_private(
    tmp_path,
):
    from test_memory_v2_unchain_runtime_factory import (
        _NeverRunOfficialMemoryAgent,
        _attachment_request,
        _context,
        _factory,
    )

    host = _factory(
        tmp_path,
        owner_chat_id="chat-memory-list-owner-a",
        root_run_id="attempt-a",
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
    )
    host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
            current_input="Remember the violet lighthouse.",
        )
    )
    source = host.attempt(
        execution_id="execution-a",
        attempt_id="attempt-a",
    ).bundle.journal.capture_snapshot().events[0]
    created = host.workspace.write_markdown(
        path="/verification/defer-fix.md",
        description="Exact violet lighthouse marker for retrieval verification",
        content="violet lighthouse",
        expected_space_revision=host.workspace.space.revision,
        source_refs=(ResourceRef("context_event", source.event_id, 1),),
        operation_id="populate-memory-list-regression",
    )
    assert created.content_ref is not None
    assert created.content_ref.kind == "memory_content"
    assert created.content_ref.resource_id != created.entry_id

    request = _attachment_request(
        agent_name="normal",
        execution_id="execution-a",
        attempt_id="attempt-a",
        run_id="attempt-a",
        completion_authority=True,
    )
    attachment = host.normal_attachment_factory.attach(request)
    toolkit = host.memory_host.build_normal_toolkit(
        attachment.binding,
        attachment.capabilities,
    )

    listing = toolkit.tools["memory_list"].func(path="/", recursive=True, limit=20)
    assert len(listing["entries"]) == 1
    visible = listing["entries"][0]
    assert "content_ref" not in visible
    entry_ref = visible["entry_ref"]
    assert entry_ref == host.reference_codec.encode(
        ResourceRef("memory", created.entry_id, created.revision, created.space_id)
    )
    assert created.content_ref.resource_id not in entry_ref

    search = toolkit.tools["memory_search"].func(query="violet lighthouse", limit=20)
    assert len(search["results"]) == 1
    assert search["results"][0]["entry"]["entry_ref"] == entry_ref
    read = toolkit.tools["memory_read"].func(ref=entry_ref, full=True)
    assert read["text"] == "violet lighthouse"

    with pytest.raises(MemoryToolkitError, match="memory ref|invalid|canonical"):
        toolkit.tools["memory_read"].func(
            ref=f"pupu://memory/{created.space_id}/{created.entry_id}@0"
        )

    foreign_host = _factory(
        tmp_path,
        owner_chat_id="chat-memory-list-owner-b",
        root_run_id="attempt-b",
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
    )
    foreign_host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-b",
            generation_id="generation-b",
            attempt_id="attempt-b",
        )
    )
    foreign_request = _attachment_request(
        agent_name="normal",
        execution_id="execution-b",
        attempt_id="attempt-b",
        run_id="attempt-b",
        completion_authority=True,
    )
    foreign_attachment = foreign_host.normal_attachment_factory.attach(
        foreign_request
    )
    foreign_toolkit = foreign_host.memory_host.build_normal_toolkit(
        foreign_attachment.binding,
        foreign_attachment.capabilities,
    )
    with pytest.raises(MemoryToolkitError, match="bound scope|outside"):
        foreign_toolkit.tools["memory_read"].func(ref=entry_ref)


@pytest.mark.parametrize("fragment", ["", "space/other", "space%2Fother"])
def test_candidate_content_encode_rejects_invalid_space(fragment):
    with pytest.raises(ValueError):
        _PupuUnchainReferenceCodec("binding-a").encode(ResourceRef(
            "memory_candidate_content", "candidate-a", 1, fragment))


@pytest.mark.parametrize("uri", [
    "pupu://memory/candidate-content//id@1", "pupu://memory/candidate-content/space/id@0",
    "pupu://memory/candidate-content/space/id@01", "pupu://memory/candidate-content/space/id@1/extra",
    "pupu://memory/candidate-content/space%2Fother/id@1",
])
def test_candidate_content_uri_rejects_noncanonical_shapes(uri):
    with pytest.raises(ValueError):
        _PupuUnchainReferenceCodec("binding-a").decode(uri, purpose=ReferencePurpose.MEMORY)
