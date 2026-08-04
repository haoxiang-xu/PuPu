from __future__ import annotations

from pathlib import Path

import pytest

from memory_v2_context_adapter import (
    list_pupu_unchain_ownership_lifecycles,
    prepare_pupu_unchain_ownership_attachment,
)
from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from unchain.agent.modules import ContextModule
from unchain.agent.modules.memory_v2 import (
    MemoryV2AgentAttachmentRequest,
    MemoryV2RunRole,
)
from unchain.context import (
    ArtifactService,
    ContextCompileCoordinator,
    ContextRuntime,
    DurableHandoffRecorder,
    HandoffService,
)
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import AttemptRef, DurableEventSink, GenerationRef, ResourceRef
from unchain.memory.curator import RootRunCompletion
from unchain.memory.workspace import MemorySpace, MemoryWorkspaceService
from unchain.memory.workspace.ports import BoundWorkspaceReferenceAuthorizer
from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
from unchain.persistence.sqlite_memory_host_v2 import (
    SQLiteConsolidationCapabilityFactory,
    SQLiteMemoryV2AgentAttachmentFactory,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


class _References(BoundWorkspaceReferenceAuthorizer):
    def __init__(self, binding_id: str, allowed: set[ResourceRef]) -> None:
        super().__init__(binding_id)
        self.allowed = allowed

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if ref not in self.allowed:
            raise ValueError("reference is outside the test binding")
        return ref


class _Codec:
    def __init__(self, binding_id: str) -> None:
        self.binding_id = binding_id

    def encode(self, ref: ResourceRef) -> str:
        return (
            f"pupu://{ref.kind}/{ref.fragment + '/' if ref.fragment else ''}"
            f"{ref.resource_id}@{ref.revision}"
        )

    def decode(self, value: str, *, purpose):
        del value, purpose
        raise AssertionError("decode is not exercised by ownership preparation")


class _ContextCapability:
    def __init__(self, binding_id: str) -> None:
        self.binding_id = binding_id


class _CompletionFactory:
    def build(self, *, result):
        del result
        return RootRunCompletion(
            session_id="session-a",
            attempt_id="attempt-a",
            run_id="run-a",
            is_root_run=True,
            run_status="completed",
            capture_status="complete",
        )


class _CheckpointRepository:
    execution_id = "session-a"

    def prepare(self, **kwargs):
        raise AssertionError(kwargs)

    def commit(self, **kwargs):
        raise AssertionError(kwargs)

    def get_by_operation(self, **kwargs):
        del kwargs
        return None


class _BuildRepository:
    execution_id = "session-a"

    def record(self, **kwargs):
        raise AssertionError(kwargs)

    def get_by_operation(self, **kwargs):
        del kwargs
        return None

    def get_by_trigger(self, **kwargs):
        del kwargs
        return None


def _stack(tmp_path: Path):
    database_path = tmp_path / "context_v2.sqlite3"
    object_directory = tmp_path / "objects"
    admission = admit_context_v2_store_owner(
        root_dir=tmp_path,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    assert admission.database_path == database_path
    attempt = AttemptRef(
        GenerationRef("session-a", "generation-a"),
        "attempt-a",
    )
    context_store = SQLiteContextV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    context_repository = context_store.bind_execution("session-a")
    artifacts = ArtifactService(
        context_repository,
        sanitizer=lambda content, media_type: content,
    )
    projector = CanonicalSemanticEventProjector(
        attempt=attempt,
        artifacts=artifacts,
        payload_sanitizer=lambda event_type, payload: payload,
    )
    sink = DurableEventSink(context_repository, attempt, projector)
    coordinator = ContextCompileCoordinator(
        journal=context_repository,
        checkpoint_repository=_CheckpointRepository(),
        build_repository=_BuildRepository(),
        partial_attempt_sink=lambda request, error: None,
    )
    context_module = ContextModule(
        runtime=ContextRuntime(
            owner_id="pupu-context-v2",
            request_factory=lambda context: None,
            durable_event_sink=sink,
            partial_attempt_sink=lambda event, error: None,
            compiler=coordinator,
        )
    )
    recorder = DurableHandoffRecorder(
        attempt=attempt,
        handoffs=HandoffService(artifacts),
        projector=projector,
        sink=sink,
    )

    memory_store = SQLiteMemoryV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    space = MemorySpace(
        space_id="space-chat-a",
        namespace="chat",
        name="Chat memory",
        description="PuPu chat Memory V2 workspace",
        revision=1,
    )
    workspace_repository = memory_store.bind_workspace(
        space=space,
        owner_chat_id="chat-a",
    )
    workspace = MemoryWorkspaceService(
        repository=workspace_repository,
        mutations=workspace_repository,
        content=workspace_repository,
        history=workspace_repository,
        links=workspace_repository,
        references=_References("binding-chat-a", set()),
    )
    curator_store = SQLiteCuratorV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    curator_repository = curator_store.bind_curation(
        binding_id="binding-chat-a",
        owner_chat_id="chat-a",
        target_space_id=space.space_id,
    )
    return {
        "owner_chat_id": "chat-a",
        "execution_id": "session-a",
        "generation_id": "generation-a",
        "attempt_id": "attempt-a",
        "root_run_id": "run-a",
        "binding_id": "binding-chat-a",
        "chat_space_id": "space-chat-a",
        "operation_id": "bind-chat-a-attempt-a",
        "expected_revision": 0,
        "database_path": database_path,
        "context_module": context_module,
        "event_projector": projector,
        "handoff_recorder": recorder,
        "curation_repository": curator_repository,
        "workspace": workspace,
        "references": _Codec("binding-chat-a"),
        "context": _ContextCapability("binding-chat-a"),
        "root_completion_factory": _CompletionFactory(),
    }


def test_preparation_binds_official_unchain_ownership_with_gate_closed(
    tmp_path: Path,
) -> None:
    values = _stack(tmp_path)

    attachment = prepare_pupu_unchain_ownership_attachment(**values)

    assert attachment.lifecycle.to_dict() == {
        "owner_chat_id": "chat-a",
        "execution_id": "session-a",
        "session_id": "session-a",
        "generation_id": "generation-a",
        "attempt_id": "attempt-a",
        "root_run_id": "run-a",
        "binding_id": "binding-chat-a",
        "chat_space_id": "space-chat-a",
    }
    assert attachment.context_module is values["context_module"]
    assert attachment.event_projector is values["event_projector"]
    assert attachment.artifact_handoff.recorder is values["handoff_recorder"]
    assert isinstance(
        attachment.normal_attachment_factory,
        SQLiteMemoryV2AgentAttachmentFactory,
    )
    assert isinstance(
        attachment.consolidation_factory,
        SQLiteConsolidationCapabilityFactory,
    )
    assert attachment.memory_host.enabled is False
    assert attachment.memory_module.host is attachment.memory_host
    assert attachment.production_enabled is False
    assert attachment.lifecycle_revision == 1
    assert attachment.lifecycle_replayed is False
    assert attachment.modules_for_shadow() == ()
    assert attachment.readiness()["production_gate"] == "closed"


def test_lifecycle_binding_is_idempotent_and_readable_after_cold_restart(
    tmp_path: Path,
) -> None:
    values = _stack(tmp_path)
    first = prepare_pupu_unchain_ownership_attachment(**values)
    replay = prepare_pupu_unchain_ownership_attachment(**values)

    reopened = list_pupu_unchain_ownership_lifecycles(
        database_path=values["database_path"],
        owner_chat_id="chat-a",
    )

    assert first.lifecycle_revision == 1
    assert replay.lifecycle_revision == 1
    assert replay.lifecycle_replayed is True
    assert reopened == (first.lifecycle,)


def test_lifecycle_binding_uses_create_cas_and_rejects_operation_drift(
    tmp_path: Path,
) -> None:
    values = _stack(tmp_path)
    prepare_pupu_unchain_ownership_attachment(**values)

    wrong_cas = dict(values, operation_id="bind-second", expected_revision=0)
    with pytest.raises(RuntimeError, match="revision"):
        prepare_pupu_unchain_ownership_attachment(**wrong_cas)

    changed_replay = dict(values, root_run_id="run-other")
    with pytest.raises(RuntimeError, match="operation"):
        prepare_pupu_unchain_ownership_attachment(**changed_replay)


def test_root_completion_resolver_never_promotes_a_subagent_to_root(
    tmp_path: Path,
) -> None:
    attachment = prepare_pupu_unchain_ownership_attachment(**_stack(tmp_path))
    resolver = attachment.normal_attachment_factory.completion_factory_resolver

    root = resolver.resolve(
        MemoryV2AgentAttachmentRequest(
            agent_name="root-agent",
            mode="resume_interaction",
            session_id="session-a",
            attempt_id="attempt-a",
            run_id="resume-run-a",
            role=MemoryV2RunRole.ROOT,
            root_run_id="run-a",
        )
    )
    child = resolver.resolve(
        MemoryV2AgentAttachmentRequest(
            agent_name="child-agent",
            mode="run",
            session_id="session-a",
            attempt_id="attempt-a",
            run_id="child-run-a",
            role=MemoryV2RunRole.SUBAGENT,
            root_run_id="run-a",
        )
    )
    graph_step = resolver.resolve(
        MemoryV2AgentAttachmentRequest(
            agent_name="graph-agent",
            mode="run",
            session_id="session-a",
            attempt_id="attempt-a",
            run_id="graph-step-a",
            role=MemoryV2RunRole.GRAPH_STEP,
            root_run_id="run-a",
        )
    )

    assert root is not None
    assert child is None
    assert graph_step is None


def test_preparation_rejects_a_durably_deleted_chat(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from unchain.persistence import sqlite_chat_deletion_v2

    values = _stack(tmp_path)
    monkeypatch.setattr(
        sqlite_chat_deletion_v2,
        "is_chat_deleted",
        lambda **kwargs: kwargs["owner_chat_id"] == "chat-a",
    )

    with pytest.raises(RuntimeError, match="deleted"):
        prepare_pupu_unchain_ownership_attachment(**values)


@pytest.mark.parametrize(
    ("field_name", "foreign_value", "match"),
    (
        ("owner_chat_id", "chat-other", "owner"),
        ("execution_id", "session-other", "execution"),
        ("attempt_id", "attempt-other", "attempt"),
        ("binding_id", "binding-other", "binding"),
        ("chat_space_id", "space-other", "space"),
    ),
)
def test_preparation_rejects_cross_scope_ownership(
    tmp_path: Path,
    field_name: str,
    foreign_value: str,
    match: str,
) -> None:
    values = _stack(tmp_path)
    values[field_name] = foreign_value

    with pytest.raises(RuntimeError, match=match):
        prepare_pupu_unchain_ownership_attachment(**values)
