"""Thin PuPu host binding for Unchain's official derived-handoff ingress.

This module deliberately does not mount graph execution or open the Context
V2 production gate.  It verifies one already-durable non-root run binding,
then delegates all handoff, artifact, journal, and input semantics to Unchain.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from memory_v2_sanitizer import (
    StorageTrust,
    sanitize_for_storage,
    sanitize_value,
)
from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
    inspect_context_v2_database,
)
from memory_v2_unchain_run_binding import PupuMemoryV2RunBinding
from unchain.context import (
    ArtifactService,
    ContextInputIngress,
    DerivedHandoffInputIngress,
    DurableDerivedHandoffInputReceipt,
    DurableHandoffRecorder,
    HandoffService,
    HandoffStatus,
    HostResolvedDerivedHandoffInput,
)
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import (
    AttemptRef,
    DurableEventSink,
    EventRange,
    GenerationRef,
    ResourceRef,
)
from unchain.journal.models import (
    _freeze_json,
    _record_tuple,
    _required_text,
    _thaw_json,
)
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_generation_lifecycle_v2 import (
    HostGenerationAttemptBindingIntent,
    HostGenerationLifecycleError,
    SQLiteHostGenerationLifecycleV2,
    build_host_generation_attempt_binding_operation,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.run_identity import MemoryV2RunRole


class PupuUnchainDerivedHandoffHostError(RuntimeError):
    """PuPu could not prove one exact non-root derived-input binding."""


def _identifier(value: object, field_name: str) -> str:
    return _required_text(value, field_name, identifier=True)


def _positive_revision(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("head_revision must be a positive integer")
    return value


def _canonical_json(value: Mapping[str, Any]) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuUnchainDerivedHandoffHostError(
            "derived handoff binding is not canonical JSON"
        ) from error


def _stable_id(prefix: str, value: Mapping[str, Any]) -> str:
    return f"{prefix}-{hashlib.sha256(_canonical_json(value)).hexdigest()}"


def _sanitize_artifact(content: bytes, media_type: str) -> bytes:
    return sanitize_for_storage(
        content,
        declared_mime=media_type,
        trust=StorageTrust.JOURNAL,
    ).data


def _sanitize_event_payload(
    event_type: str,
    payload: Mapping[str, Any],
) -> Mapping[str, Any]:
    del event_type
    sanitized = sanitize_value(payload)
    if not isinstance(sanitized, Mapping):
        raise PupuUnchainDerivedHandoffHostError(
            "derived handoff event sanitizer changed the payload shape"
        )
    return sanitized


@dataclass(frozen=True, slots=True)
class PupuUnchainDerivedHandoffRequest:
    """Complete PuPu authority for one graph-step or subagent input."""

    owner_chat_id: str
    execution_id: str
    session_id: str
    generation_id: str
    head_revision: int
    root_run_id: str
    source_attempt_id: str
    consumer_attempt_id: str
    run_role: MemoryV2RunRole
    source_event_range: EventRange
    operation_id: str
    status: HandoffStatus
    full_output: Any
    artifact_refs: tuple[ResourceRef, ...] = ()
    summary: Any = None

    def __post_init__(self) -> None:
        for field_name in (
            "owner_chat_id",
            "execution_id",
            "session_id",
            "generation_id",
            "root_run_id",
            "source_attempt_id",
            "consumer_attempt_id",
            "operation_id",
        ):
            object.__setattr__(
                self,
                field_name,
                _identifier(getattr(self, field_name), field_name),
            )
        object.__setattr__(
            self,
            "head_revision",
            _positive_revision(self.head_revision),
        )
        if not isinstance(self.run_role, MemoryV2RunRole):
            raise TypeError("run_role must be a MemoryV2RunRole")
        if self.run_role is MemoryV2RunRole.ROOT:
            raise ValueError("root run cannot use derived handoff input")
        if self.run_role not in {
            MemoryV2RunRole.GRAPH_STEP,
            MemoryV2RunRole.SUBAGENT,
        }:
            raise ValueError("derived handoff run role is unsupported")
        if self.consumer_attempt_id == self.root_run_id:
            raise ValueError("derived handoff consumer cannot be the root run")
        if self.consumer_attempt_id == self.source_attempt_id:
            raise ValueError("derived handoff source and consumer must be distinct")
        if not isinstance(self.source_event_range, EventRange):
            object.__setattr__(
                self,
                "source_event_range",
                EventRange.from_dict(self.source_event_range),
            )
        object.__setattr__(
            self,
            "status",
            HandoffStatus(self.status),
        )
        refs = _record_tuple(self.artifact_refs, ResourceRef, "artifact_refs")
        if (
            len(set(refs)) != len(refs)
            or any(ref.kind != "artifact" or ref.fragment for ref in refs)
        ):
            raise ValueError(
                "artifact_refs must be distinct whole artifact references"
            )
        object.__setattr__(self, "artifact_refs", refs)
        object.__setattr__(
            self,
            "full_output",
            _freeze_json(self.full_output, path="full_output"),
        )
        if self.summary is not None:
            object.__setattr__(
                self,
                "summary",
                _freeze_json(self.summary, path="summary"),
            )


class PupuUnchainDerivedHandoffHostAdapter:
    """Cold-open adapter over an existing Unchain-owned Memory V2 store."""

    def __init__(
        self,
        *,
        database_path: str | Path,
        object_directory: str | Path,
    ) -> None:
        self.database_path = Path(database_path).expanduser().resolve()
        self.object_directory = Path(object_directory).expanduser().resolve()
        if self.database_path.name != "context_v2.sqlite3":
            raise ValueError("database_path must end with context_v2.sqlite3")
        if self.object_directory != self.database_path.parent / "objects":
            raise ValueError(
                "object_directory must be the sibling Memory V2 objects directory"
            )

    def _validated_store(
        self,
        request: PupuUnchainDerivedHandoffRequest,
    ) -> SQLiteContextV2Store:
        inspection = inspect_context_v2_database(self.database_path)
        if inspection.schema_family != STORE_OWNER_UNCHAIN:
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff requires an existing Unchain Context V2 store"
            )
        try:
            admission = admit_context_v2_store_owner(
                root_dir=self.database_path.parent,
                requested_owner=STORE_OWNER_UNCHAIN,
            )
        except ContextV2StoreBoundaryError as error:
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff store ownership is unavailable"
            ) from error
        if (
            admission.owner != STORE_OWNER_UNCHAIN
            or admission.database_path.resolve() != self.database_path
        ):
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff store ownership changed"
            )
        try:
            deleted = is_chat_deleted(
                database_path=self.database_path,
                owner_chat_id=request.owner_chat_id,
            )
        except ChatDeletionError as error:
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff chat deletion state is unavailable"
            ) from error
        if deleted:
            raise PupuUnchainDerivedHandoffHostError(
                "deleted chat cannot persist a derived handoff"
            )
        return SQLiteContextV2Store(
            database_path=self.database_path,
            object_directory=self.object_directory,
        )

    @staticmethod
    def _attempt_intent(
        request: PupuUnchainDerivedHandoffRequest,
        *,
        attempt_id: str,
    ) -> HostGenerationAttemptBindingIntent:
        return HostGenerationAttemptBindingIntent(
            owner_chat_id=request.owner_chat_id,
            execution_id=request.execution_id,
            session_id=request.session_id,
            generation_id=request.generation_id,
            attempt_id=attempt_id,
            expected_revision=request.head_revision,
        )

    def _verify_lifecycle(
        self,
        store: SQLiteContextV2Store,
        request: PupuUnchainDerivedHandoffRequest,
    ) -> None:
        lifecycle = SQLiteHostGenerationLifecycleV2(store)
        try:
            head = lifecycle.current(
                owner_chat_id=request.owner_chat_id,
                execution_id=request.execution_id,
                session_id=request.session_id,
            )
            source = lifecycle.attempt_binding(
                owner_chat_id=request.owner_chat_id,
                execution_id=request.execution_id,
                session_id=request.session_id,
                attempt_id=request.source_attempt_id,
            )
            consumer = lifecycle.attempt_binding(
                owner_chat_id=request.owner_chat_id,
                execution_id=request.execution_id,
                session_id=request.session_id,
                attempt_id=request.consumer_attempt_id,
            )
        except HostGenerationLifecycleError as error:
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff generation lifecycle is unavailable"
            ) from error
        if head is None or (
            head.current_generation_id,
            head.revision,
        ) != (request.generation_id, request.head_revision):
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff does not name the current generation head"
            )
        if source is None or consumer is None:
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff source or consumer attempt is not durably bound"
            )
        for binding, attempt_id in (
            (source, request.source_attempt_id),
            (consumer, request.consumer_attempt_id),
        ):
            if (
                binding.owner_chat_id != request.owner_chat_id
                or binding.execution_id != request.execution_id
                or binding.session_id != request.session_id
                or binding.generation_id != request.generation_id
                or binding.attempt_id != attempt_id
                or binding.head_revision != request.head_revision
            ):
                raise PupuUnchainDerivedHandoffHostError(
                    "derived handoff attempt binding changed scope"
                )
            expected_operation = build_host_generation_attempt_binding_operation(
                operation_id=binding.operation.operation_id,
                intent=self._attempt_intent(request, attempt_id=attempt_id),
            )
            if binding.operation != expected_operation:
                raise PupuUnchainDerivedHandoffHostError(
                    "derived handoff attempt binding operation is corrupt"
                )

        expected_binding = PupuMemoryV2RunBinding(
            owner_chat_id=request.owner_chat_id,
            execution_id=request.execution_id,
            session_id=request.session_id,
            generation_id=request.generation_id,
            head_revision=request.head_revision,
            attempt_id=request.consumer_attempt_id,
            run_id=request.consumer_attempt_id,
            root_run_id=request.root_run_id,
            role=request.run_role,
            source_attempt_id=request.source_attempt_id,
            current_input_draft=None,
        )
        expected_consumer_operation = build_host_generation_attempt_binding_operation(
            operation_id=_stable_id(
                "bind-current-attempt",
                expected_binding.canonical_value(),
            ),
            intent=self._attempt_intent(
                request,
                attempt_id=request.consumer_attempt_id,
            ),
        )
        if consumer.operation != expected_consumer_operation:
            raise PupuUnchainDerivedHandoffHostError(
                "derived handoff consumer role or source binding changed"
            )

    def persist(
        self,
        request: PupuUnchainDerivedHandoffRequest,
    ) -> DurableDerivedHandoffInputReceipt:
        if type(request) is not PupuUnchainDerivedHandoffRequest:
            raise TypeError(
                "request must be an exact PupuUnchainDerivedHandoffRequest"
            )
        store = self._validated_store(request)
        self._verify_lifecycle(store, request)
        generation = GenerationRef(
            request.execution_id,
            request.generation_id,
        )
        source_attempt = AttemptRef(generation, request.source_attempt_id)
        consumer_attempt = AttemptRef(generation, request.consumer_attempt_id)
        journal = store.bind_execution(request.execution_id)
        artifacts = ArtifactService(journal, sanitizer=_sanitize_artifact)
        projector = CanonicalSemanticEventProjector(
            attempt=consumer_attempt,
            artifacts=artifacts,
            payload_sanitizer=_sanitize_event_payload,
        )
        sink = DurableEventSink(journal, consumer_attempt, projector)
        handoffs = HandoffService(artifacts)
        recorder = DurableHandoffRecorder(
            attempt=consumer_attempt,
            handoffs=handoffs,
            projector=projector,
            sink=sink,
        )
        official = DerivedHandoffInputIngress(
            consumer_attempt=consumer_attempt,
            source_attempt=source_attempt,
            handoff_recorder=recorder,
            input_ingress=ContextInputIngress(
                attempt=consumer_attempt,
                projector=projector,
                sink=sink,
            ),
        )
        return official.persist(
            HostResolvedDerivedHandoffInput(
                consumer_attempt=consumer_attempt,
                source_attempt=source_attempt,
                status=request.status,
                full_output=_thaw_json(request.full_output),
                source_event_range=request.source_event_range,
                operation_id=request.operation_id,
                artifact_refs=request.artifact_refs,
                summary=(
                    None
                    if request.summary is None
                    else _thaw_json(request.summary)
                ),
            )
        )


__all__ = [
    "PupuUnchainDerivedHandoffHostAdapter",
    "PupuUnchainDerivedHandoffHostError",
    "PupuUnchainDerivedHandoffRequest",
]
