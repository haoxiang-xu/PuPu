from __future__ import annotations

import json
from dataclasses import fields, replace
from pathlib import Path

import pytest

from memory_v2_unchain_derived_handoff import (
    PupuUnchainDerivedHandoffHostAdapter,
    PupuUnchainDerivedHandoffHostError,
    PupuUnchainDerivedHandoffRequest,
)
from memory_v2_unchain_run_binding import (
    PupuMemoryV2TextInputDraft,
    build_shadow_host_factory,
)
from unchain.context import ArtifactService, ContextConflictError, HandoffStatus
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import (
    AttemptRef,
    DurableEventSink,
    EventRange,
    GenerationRef,
    SemanticEventDraft,
)
from unchain.journal.models import _thaw_json
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.run_identity import MemoryV2RunRole


OWNER_CHAT_ID = "chat-derived"
EXECUTION_ID = "execution-derived"
SESSION_ID = "session-derived"
ROOT_RUN_ID = "root-derived"
CONSUMER_RUN_ID = "consumer-derived"


def _prepare(
    root: Path,
    *,
    role: MemoryV2RunRole = MemoryV2RunRole.GRAPH_STEP,
):
    prepared = build_shadow_host_factory(
        owner_chat_id=OWNER_CHAT_ID,
        execution_id=EXECUTION_ID,
        session_id=SESSION_ID,
        attempt_id=ROOT_RUN_ID,
        run_id=ROOT_RUN_ID,
        root_run_id=ROOT_RUN_ID,
        role=MemoryV2RunRole.ROOT,
        source_attempt_id="",
        current_input_draft=PupuMemoryV2TextInputDraft(content="root task"),
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
        model_window_fallback=lambda _provider, _model: 16_384,
        partial_attempt_sink=lambda _value, _error: None,
    )
    consumer = prepared.registry.register_attempt(
        owner_chat_id=OWNER_CHAT_ID,
        execution_id=EXECUTION_ID,
        session_id=SESSION_ID,
        attempt_id=CONSUMER_RUN_ID,
        run_id=CONSUMER_RUN_ID,
        root_run_id=ROOT_RUN_ID,
        role=role,
        source_attempt_id=ROOT_RUN_ID,
        current_input_draft=None,
    )
    store = SQLiteContextV2Store(
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    )
    journal = store.bind_execution(EXECUTION_ID)
    artifacts = ArtifactService(
        journal,
        sanitizer=lambda content, _media_type: content,
    )
    source_artifact = artifacts.persist(
        b'{"source":"artifact"}',
        media_type="application/json",
        operation_id="source-artifact-derived",
    )
    source_attempt = AttemptRef(
        GenerationRef(EXECUTION_ID, consumer.generation_id),
        ROOT_RUN_ID,
    )
    projector = CanonicalSemanticEventProjector(
        attempt=source_attempt,
        artifacts=artifacts,
        payload_sanitizer=lambda _event_type, payload: payload,
    )
    source = DurableEventSink(journal, source_attempt, projector).append_projected(
        SemanticEventDraft(
            event_id="event-derived-source-output",
            event_type="source.output",
            attempt=source_attempt,
            operation_id="operation-derived-source-output",
            payload={"run_id": ROOT_RUN_ID, "status": "complete"},
            resource_refs=(source_artifact.ref,),
        )
    )
    return prepared, consumer, source, source_artifact, journal


def _request(
    consumer,
    source,
    source_artifact,
    *,
    role: MemoryV2RunRole = MemoryV2RunRole.GRAPH_STEP,
):
    return PupuUnchainDerivedHandoffRequest(
        owner_chat_id=OWNER_CHAT_ID,
        execution_id=EXECUTION_ID,
        session_id=SESSION_ID,
        generation_id=consumer.generation_id,
        head_revision=consumer.head_revision,
        root_run_id=ROOT_RUN_ID,
        source_attempt_id=ROOT_RUN_ID,
        consumer_attempt_id=CONSUMER_RUN_ID,
        run_role=role,
        source_event_range=EventRange(source.cursor, source.cursor),
        operation_id="derived-handoff-root-to-consumer",
        status=HandoffStatus.COMPLETE,
        full_output={
            "summary": "source step complete",
            "output": "derived answer",
        },
        artifact_refs=(source_artifact.ref,),
        summary="source step complete",
    )


def _adapter(root: Path):
    return PupuUnchainDerivedHandoffHostAdapter(
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    )


def test_thin_adapter_binds_every_scope_and_delegates_to_official_unchain(
    tmp_path: Path,
) -> None:
    prepared, consumer, source, source_artifact, journal = _prepare(tmp_path)
    assert prepared.host_factory.production_enabled is False

    receipt = _adapter(tmp_path).persist(
        _request(consumer, source, source_artifact)
    )

    assert receipt.envelope.child_attempt.attempt_id == ROOT_RUN_ID
    assert receipt.envelope.child_attempt.generation.generation_id == (
        consumer.generation_id
    )
    assert receipt.envelope.artifact_refs == (source_artifact.ref,)
    assert receipt.handoff_duplicate is False
    assert receipt.input_duplicate is False
    events = journal.capture_snapshot().events
    assert [event.event_type for event in events] == [
        "source.output",
        "handoff.recorded",
        "message.user",
    ]
    derived = json.loads(events[-1].payload["message"]["content"])
    assert derived["source_attempt"]["attempt_id"] == ROOT_RUN_ID
    assert derived["consumer_attempt"]["attempt_id"] == CONSUMER_RUN_ID
    assert derived["handoff_envelope"] == receipt.envelope.to_dict()
    assert events[-1].resource_refs[1] == receipt.envelope.full_output_ref
    assert prepared.host_factory.production_enabled is False


def test_cold_open_replays_exactly_without_duplicate_events(tmp_path: Path) -> None:
    _prepared, consumer, source, source_artifact, journal = _prepare(tmp_path)
    request = _request(consumer, source, source_artifact)

    first = _adapter(tmp_path).persist(request)
    reopened = _adapter(tmp_path).persist(request)

    assert reopened.envelope == first.envelope
    assert reopened.full_output_artifact == first.full_output_artifact
    assert reopened.handoff_duplicate is True
    assert reopened.input_duplicate is True
    assert len(journal.capture_snapshot().events) == 3


def test_changed_replay_is_rejected_by_official_operation_cas(
    tmp_path: Path,
) -> None:
    _prepared, consumer, source, source_artifact, journal = _prepare(tmp_path)
    request = _request(consumer, source, source_artifact)
    first = _adapter(tmp_path).persist(request)

    with pytest.raises(ContextConflictError):
        _adapter(tmp_path).persist(
            replace(
                request,
                full_output={
                    "summary": "source step complete",
                    "output": "changed derived answer",
                },
            )
        )

    assert len(journal.capture_snapshot().events) == 3
    persisted = json.loads(
        journal.capture_snapshot().events[-1].payload["message"]["content"]
    )
    assert persisted["handoff_envelope"] == first.envelope.to_dict()


def test_root_and_durable_role_drift_fail_before_any_handoff_write(
    tmp_path: Path,
) -> None:
    _prepared, consumer, source, source_artifact, journal = _prepare(tmp_path)

    with pytest.raises(ValueError, match="root run"):
        _request(
            consumer,
            source,
            source_artifact,
            role=MemoryV2RunRole.ROOT,
        )

    mismatched = _request(
        consumer,
        source,
        source_artifact,
        role=MemoryV2RunRole.SUBAGENT,
    )
    with pytest.raises(
        PupuUnchainDerivedHandoffHostError,
        match="role or source binding changed",
    ):
        _adapter(tmp_path).persist(mismatched)
    assert [event.event_type for event in journal.capture_snapshot().events] == [
        "source.output"
    ]


def test_non_root_contract_has_no_generic_current_input_escape_hatch(
    tmp_path: Path,
) -> None:
    names = {field.name for field in fields(PupuUnchainDerivedHandoffRequest)}
    assert "content" not in names
    assert "current_input" not in names
    assert "current_input_draft" not in names
    _prepared, consumer, source, source_artifact, _journal = _prepare(
        tmp_path,
        role=MemoryV2RunRole.SUBAGENT,
    )
    request = _request(
        consumer,
        source,
        source_artifact,
        role=MemoryV2RunRole.SUBAGENT,
    )

    receipt = _adapter(tmp_path).persist(request)

    assert receipt.envelope.child_attempt.attempt_id == ROOT_RUN_ID
    assert _thaw_json(request.full_output)["output"] == "derived answer"


def test_generation_or_source_binding_drift_fails_closed(tmp_path: Path) -> None:
    _prepared, consumer, source, source_artifact, journal = _prepare(tmp_path)
    request = _request(consumer, source, source_artifact)

    with pytest.raises(
        PupuUnchainDerivedHandoffHostError,
        match="current generation head",
    ):
        _adapter(tmp_path).persist(
            replace(request, head_revision=request.head_revision + 1)
        )
    with pytest.raises(
        PupuUnchainDerivedHandoffHostError,
        match="not durably bound",
    ):
        _adapter(tmp_path).persist(
            replace(request, source_attempt_id="source-does-not-exist")
        )
    assert [event.event_type for event in journal.capture_snapshot().events] == [
        "source.output"
    ]
