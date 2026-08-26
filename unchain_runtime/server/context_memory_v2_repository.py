"""Scope-bound Unchain Context/Memory V2 ports over PuPu schema-v4 storage.

This module is the product boundary.  It is intentionally the only place that
translates provider-neutral ``ResourceRef`` values to PuPu's stable public
``pupu://`` references or accepts product chat ownership identifiers.
"""

from __future__ import annotations

import base64
import binascii
import copy
import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from typing import Any, Mapping

from memory_v2_store import (
    MAX_CONTENT_READ_BYTES,
    MAX_PAGE_SIZE,
    MemoryV2Error,
    MemoryV2Store,
)
from unchain.context import (
    MAX_ARTIFACT_BYTES,
    CheckpointWriteStatus,
    ContextBuildEnvelope,
    ContextBuildReceipt,
    PinnedTaskState,
    PreparedCheckpoint,
)
from unchain.context.ports import (
    BoundArtifactRepository,
    BoundCheckpointRepository,
    BoundContextBuildRepository,
    ContextConflictError,
    ContextRepositoryError,
    ContextScopeError,
)
from unchain.journal import (
    ArtifactRef,
    AttemptRef,
    EventCursor,
    EventRange,
    GenerationRef,
    JournalAppendResult,
    JournalAppendRequest,
    JournalEvent,
    JournalPage,
    JournalSnapshot,
    OperationRef,
    ResourceRef,
    SemanticEventDraft,
    capture_journal_snapshot,
)
from unchain.journal.ports import (
    BoundExecutionJournal,
    JournalConflictError,
    JournalRepositoryError,
    JournalScopeError,
)
from unchain.memory.workspace import (
    MemoryEntry,
    MemoryEntryKind,
    MemoryEntryPage,
    MemorySpace,
    canonical_virtual_path,
)
from unchain.memory.workspace.ports import (
    BoundMemoryWorkspaceRepository,
    BoundPinnedTaskStateRepository,
    RepositoryConflictError,
    RepositoryNotFoundError,
    RepositoryScopeError,
    WorkspaceContentPage,
    WorkspaceMutationRequest,
    WorkspaceRepositoryError,
)


_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$")
_OWNER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
_ARTIFACT_RE = re.compile(
    r"^pupu://artifact/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_MEMORY_RE = re.compile(
    r"^pupu://memory/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})/"
    r"([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_CANDIDATE_RE = re.compile(
    r"^pupu://memory/candidate/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@"
    r"([1-9][0-9]*)$"
)
_REVIEW_RE = re.compile(
    r"^pupu://memory/review/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@"
    r"([1-9][0-9]*)(?:/(diff|proposed))?$"
)
_EVENT_RE = re.compile(
    r"^pupu://context/event/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})"
    r"(?:/(content))?$"
)
_CHECKPOINT_RE = re.compile(
    r"^pupu://context/checkpoint/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})"
    r"(?:/event/([1-9][0-9]*))?$"
)
_CONFLICT_CODES = frozenset(
    {
        "context_v2_attempt_sealed",
        "context_v2_event_conflict",
        "context_v2_event_sequence_conflict",
        "context_v2_idempotency_conflict",
        "context_v2_operation_conflict",
        "context_v2_path_conflict",
        "context_v2_revision_conflict",
        "context_v2_space_conflict",
        "context_v2_invalid_source",
    }
)
_JOURNAL_SCOPE_CODES = frozenset(
    {
        "context_v2_attempt_generation_conflict",
        "context_v2_generation_conflict",
    }
)
_NOT_FOUND_CODES = frozenset(
    {
        "context_v2_content_not_found",
        "context_v2_not_found",
        "context_v2_space_deleted",
    }
)


def _identifier(value: str, field_name: str, *, owner: bool = False) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field_name} must be text")
    pattern = _OWNER_RE if owner else _IDENTIFIER_RE
    if pattern.fullmatch(value) is None:
        raise ValueError(f"{field_name} is invalid")
    return value


def _positive_limit(value: int, *, maximum: int = MAX_PAGE_SIZE) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("limit must be a positive integer")
    return min(value, maximum)


def _journal_failure(exc: MemoryV2Error) -> None:
    if exc.code in _JOURNAL_SCOPE_CODES:
        raise JournalScopeError(str(exc)) from exc
    if exc.code in _CONFLICT_CODES:
        raise JournalConflictError(str(exc)) from exc
    if exc.code in _NOT_FOUND_CODES or exc.status_code in {403, 404, 410}:
        raise JournalScopeError(str(exc)) from exc
    raise JournalRepositoryError(str(exc)) from exc


def _context_failure(exc: MemoryV2Error) -> None:
    if exc.code in _JOURNAL_SCOPE_CODES:
        raise ContextScopeError(str(exc)) from exc
    if exc.code in _CONFLICT_CODES:
        raise ContextConflictError(str(exc)) from exc
    if exc.code in _NOT_FOUND_CODES or exc.status_code in {403, 404, 410}:
        raise ContextScopeError(str(exc)) from exc
    raise ContextRepositoryError(str(exc)) from exc


def _workspace_failure(exc: MemoryV2Error) -> None:
    if exc.code in _CONFLICT_CODES or exc.status_code == 409:
        raise RepositoryConflictError(str(exc)) from exc
    if exc.code in _NOT_FOUND_CODES or exc.status_code in {403, 404, 410}:
        raise RepositoryNotFoundError(str(exc)) from exc
    raise WorkspaceRepositoryError(str(exc)) from exc


class PupuRefCodec:
    """Strict, path-free translation for PuPu's stable public references."""

    @staticmethod
    def encode(ref: ResourceRef, *, bound_space_id: str = "") -> str:
        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        identifier = ref.resource_id
        revision = ref.revision
        if ref.kind == "artifact" and not ref.fragment:
            return f"pupu://artifact/{identifier}@{revision}"
        if ref.kind == "memory":
            space_id = ref.fragment or bound_space_id
            _identifier(space_id, "space_id")
            return f"pupu://memory/{space_id}/{identifier}@{revision}"
        if ref.kind == "memory_candidate" and not ref.fragment:
            return f"pupu://memory/candidate/{identifier}@{revision}"
        if ref.kind == "memory_review" and ref.fragment in {"", "diff", "proposed"}:
            suffix = f"/{ref.fragment}" if ref.fragment else ""
            return f"pupu://memory/review/{identifier}@{revision}{suffix}"
        if ref.kind == "context_event" and revision == 1 and ref.fragment in {"", "content"}:
            suffix = "/content" if ref.fragment else ""
            return f"pupu://context/event/{identifier}{suffix}"
        if ref.kind == "checkpoint" and revision == 1:
            if not ref.fragment:
                return f"pupu://context/checkpoint/{identifier}"
            match = re.fullmatch(r"event/([1-9][0-9]*)", ref.fragment)
            if match is not None:
                return f"pupu://context/checkpoint/{identifier}/event/{match.group(1)}"
        raise ValueError("resource reference cannot be represented as a PuPu URI")

    @staticmethod
    def decode(uri: str) -> ResourceRef:
        if not isinstance(uri, str) or uri != uri.strip() or "%" in uri or len(uri) > 1024:
            raise ValueError("PuPu reference is not canonical")
        match = _CANDIDATE_RE.fullmatch(uri)
        if match is not None:
            identifier, revision = match.groups()
            return ResourceRef("memory_candidate", identifier, int(revision))
        match = _REVIEW_RE.fullmatch(uri)
        if match is not None:
            identifier, revision, fragment = match.groups()
            return ResourceRef("memory_review", identifier, int(revision), fragment or "")
        match = _MEMORY_RE.fullmatch(uri)
        if match is not None:
            space_id, entry_id, revision = match.groups()
            return ResourceRef("memory", entry_id, int(revision), space_id)
        match = _ARTIFACT_RE.fullmatch(uri)
        if match is not None:
            identifier, revision = match.groups()
            return ResourceRef("artifact", identifier, int(revision))
        match = _EVENT_RE.fullmatch(uri)
        if match is not None:
            identifier, fragment = match.groups()
            return ResourceRef("context_event", identifier, 1, fragment or "")
        match = _CHECKPOINT_RE.fullmatch(uri)
        if match is not None:
            identifier, position = match.groups()
            fragment = f"event/{position}" if position else ""
            return ResourceRef("checkpoint", identifier, 1, fragment)
        raise ValueError("PuPu reference is invalid or unsupported")


@dataclass(frozen=True)
class PupuExecutionScope:
    owner_chat_id: str
    session_id: str
    generation_id: str
    attempt_id: str

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "owner_chat_id",
            _identifier(self.owner_chat_id, "owner_chat_id", owner=True),
        )
        for field_name in ("session_id", "generation_id", "attempt_id"):
            object.__setattr__(
                self,
                field_name,
                _identifier(getattr(self, field_name), field_name),
            )


def _logical_generation_rows(
    store: MemoryV2Store,
    scope: PupuExecutionScope,
    *,
    start_position: int,
    limit: int,
    include_payload: bool,
) -> list[dict[str, Any]]:
    """Read one execution-local range from a single SQLite snapshot."""

    if (
        isinstance(start_position, bool)
        or not isinstance(start_position, int)
        or start_position <= 0
    ):
        raise ValueError("start_position must be a positive integer")
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 0:
        raise ValueError("limit must be a non-negative integer")
    try:
        with store._read() as connection:
            connection.execute("BEGIN")
            session = connection.execute(
                "SELECT current_generation_id FROM sessions "
                "WHERE owner_chat_id=? AND session_id=? "
                "AND deleted_at_ms IS NULL",
                (scope.owner_chat_id, scope.session_id),
            ).fetchone()
            if (
                session is None
                or str(session["current_generation_id"] or "")
                != scope.generation_id
            ):
                raise JournalScopeError("bound generation is no longer current")
            rows = connection.execute(
                "SELECT events.* FROM events "
                "WHERE events.owner_chat_id=? AND events.session_id=? "
                "AND events.generation_id=? AND events.deleted_at_ms IS NULL "
                "AND NOT (events.event_type='context.build' AND EXISTS ("
                "SELECT 1 FROM operations WHERE "
                "operations.operation_kind='append_semantic_event' AND "
                "CAST(json_extract(operations.response_json, '$.store_seq') "
                "AS INTEGER)=events.store_seq AND "
                "json_extract(operations.response_json, '$.event_id')="
                "events.event_id AND ((length(operations.operation_id)="
                "length('context-build-trigger.')+64 AND "
                "operations.operation_id LIKE 'context-build-trigger.%' AND "
                "substr(operations.operation_id, "
                "length('context-build-trigger.')+1) NOT GLOB '*[^0-9a-f]*') "
                "OR operations.operation_id='context-build.' || COALESCE(("
                "SELECT json_extract(context_builds.context_json, '$.build_id') "
                "FROM context_builds WHERE "
                "context_builds.event_store_seq=events.store_seq), '')))) "
                "ORDER BY events.store_seq ASC LIMIT ? OFFSET ?",
                (
                    scope.owner_chat_id,
                    scope.session_id,
                    scope.generation_id,
                    limit,
                    start_position - 1,
                ),
            ).fetchall()
            selected: list[dict[str, Any]] = []
            for offset, row in enumerate(rows):
                item = dict(row)
                item["type"] = str(row["event_type"])
                item["logical_store_seq"] = start_position + offset
                if include_payload:
                    item["event"] = store._event_payload(row)
                selected.append(item)
            return selected
    except MemoryV2Error as exc:
        _journal_failure(exc)
    except sqlite3.Error as exc:
        raise JournalRepositoryError(
            "SQLite execution journal snapshot failed"
        ) from exc


def _logical_event_rows_for_range(
    store: MemoryV2Store,
    scope: PupuExecutionScope,
    source_range: EventRange,
) -> list[dict[str, Any]]:
    if not isinstance(source_range, EventRange):
        raise TypeError("source_range must be an EventRange")
    expected_count = source_range.end.store_seq - source_range.start.store_seq + 1
    try:
        rows = _logical_generation_rows(
            store,
            scope,
            start_position=source_range.start.store_seq,
            limit=expected_count,
            include_payload=False,
        )
    except JournalScopeError as exc:
        raise ContextScopeError(str(exc)) from exc
    except JournalRepositoryError as exc:
        raise ContextRepositoryError(str(exc)) from exc
    if (
        len(rows) != expected_count
        or rows[0].get("event_id") != source_range.start.event_id
        or rows[-1].get("event_id") != source_range.end.event_id
    ):
        raise ContextScopeError("event range does not belong to the bound execution")
    return rows


class _ExecutionBinding:
    def __init__(self, store: MemoryV2Store, scope: PupuExecutionScope) -> None:
        self._store = store
        self._scope = scope
        self._attempt_ref = AttemptRef(
            GenerationRef(scope.session_id, scope.generation_id),
            scope.attempt_id,
        )
        self._operation_receipts: dict[int, dict[str, str]] = {}
        self._receipt_scan_through = 0
        self._operation_receipts_initialized = False

    @property
    def scope(self) -> PupuExecutionScope:
        """Return the immutable execution scope captured by this capability."""

        return self._scope

    def require_current_attempt(self) -> PupuExecutionScope:
        """Fail closed unless the exact bound attempt still exists and is current."""

        try:
            head = self._store.get_session_head(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
            )
            state = self._store.get_capture_task_state(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                attempt_id=self._scope.attempt_id,
            )
        except MemoryV2Error as exc:
            _journal_failure(exc)
        if head.get("current_generation_id") != self._scope.generation_id:
            raise JournalScopeError("bound generation is no longer current")
        if state is None:
            raise JournalScopeError("bound attempt does not exist")
        if str(state.get("generation_id") or "") != self._scope.generation_id:
            raise JournalScopeError("bound attempt belongs to a different generation")
        return self._scope

    def _attach_operation_receipts(
        self,
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not rows:
            return rows
        high_water = max(
            (int(row.get("store_seq", 0)) for row in rows),
            default=self._receipt_scan_through,
        )
        unseen_rows = [
            int(row.get("store_seq", 0))
            for row in rows
            if int(row.get("store_seq", 0)) > self._receipt_scan_through
        ]
        needs_refresh = not self._operation_receipts_initialized or any(
            store_seq not in self._operation_receipts for store_seq in unseen_rows
        )
        if needs_refresh:
            try:
                self._operation_receipts = (
                    self._store.load_event_operation_receipts(
                        owner_chat_id=self._scope.owner_chat_id,
                        session_id=self._scope.session_id,
                        generation_id=self._scope.generation_id,
                    )
                )
            except MemoryV2Error as exc:
                _journal_failure(exc)
            self._operation_receipts_initialized = True
            self._receipt_scan_through = max(
                high_water,
                max(self._operation_receipts, default=0),
            )
        elif unseen_rows:
            self._receipt_scan_through = max(
                self._receipt_scan_through,
                high_water,
            )
        for row in rows:
            receipt = self._operation_receipts.get(
                int(row.get("store_seq", 0))
            )
            if receipt is not None:
                row["operation_receipt"] = receipt
        return rows

    def _generation_page(
        self,
        *,
        after: int,
        limit: int,
        after_event_id: str = "",
        attach_operation_receipts: bool = True,
    ) -> tuple[list[dict[str, Any]], bool]:
        try:
            page = self._store.load_events(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                after=after,
                after_event_id=after_event_id,
                limit=limit,
                include_payload=True,
            )
        except MemoryV2Error as exc:
            _journal_failure(exc)
        rows = [dict(row) for row in page.get("events", ())]
        if any(
            row.get("generation_id") != self._scope.generation_id
            for row in rows
        ):
            raise JournalScopeError("bound generation is no longer current")
        if attach_operation_receipts:
            rows = self._attach_operation_receipts(rows)
        return rows, bool(page.get("has_more"))

    def _all_generation_rows(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        after = 0
        while True:
            try:
                page = self._store.load_events(
                    owner_chat_id=self._scope.owner_chat_id,
                    session_id=self._scope.session_id,
                    after=after,
                    limit=MAX_PAGE_SIZE,
                    include_payload=True,
                )
            except MemoryV2Error as exc:
                _context_failure(exc)
            rows.extend(
                dict(row)
                for row in page.get("events", ())
                if row.get("generation_id") == self._scope.generation_id
            )
            next_after = int(page.get("next_after", after))
            if not page.get("has_more") or next_after <= after:
                break
            after = next_after
        return self._attach_operation_receipts(rows)

    def _row_at(
        self,
        cursor: EventCursor,
        *,
        operation_receipt: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        rows, _has_more = self._generation_page(
            after=max(0, cursor.store_seq - 1),
            limit=1,
            attach_operation_receipts=operation_receipt is None,
        )
        if rows and int(rows[0].get("store_seq", 0)) == cursor.store_seq:
            if rows[0].get("event_id") != cursor.event_id:
                raise JournalScopeError("cursor does not belong to the bound execution")
            if operation_receipt is not None:
                receipt = {
                    "operation_id": str(operation_receipt["operation_id"]),
                    "payload_sha256": str(operation_receipt["payload_sha256"]),
                }
                self._operation_receipts[cursor.store_seq] = receipt
                rows[0]["operation_receipt"] = receipt
            return rows[0]
        raise JournalScopeError("cursor does not belong to the bound execution")

    def _event_rows(self, source_range: EventRange) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        after = max(0, source_range.start.store_seq - 1)
        while after < source_range.end.store_seq:
            try:
                page, has_more = self._generation_page(
                    after=after,
                    limit=MAX_PAGE_SIZE,
                )
            except JournalScopeError as exc:
                raise ContextScopeError(str(exc)) from exc
            except JournalRepositoryError as exc:
                raise ContextRepositoryError(str(exc)) from exc
            selected = [
                row
                for row in page
                if int(row.get("store_seq", 0))
                <= source_range.end.store_seq
            ]
            rows.extend(selected)
            if not page:
                break
            after = int(page[-1].get("store_seq", after))
            if after >= source_range.end.store_seq or not has_more:
                break
        if (
            not rows
            or rows[0].get("event_id") != source_range.start.event_id
            or rows[-1].get("event_id") != source_range.end.event_id
        ):
            raise ContextScopeError("event range does not belong to the bound execution")
        return rows


class _StoredReferenceDeclarationError(JournalRepositoryError):
    pass


def _declared_refs(value: Mapping[str, Any]) -> tuple[ResourceRef, ...]:
    found: list[ResourceRef] = []
    links = value.get("links")
    if links is None:
        return ()
    if not isinstance(links, Mapping):
        raise _StoredReferenceDeclarationError(
            "stored resource reference declaration is malformed"
        )
    if "resource_refs" not in links:
        return ()
    raw_refs = links.get("resource_refs")
    if not isinstance(raw_refs, (list, tuple)):
        raise _StoredReferenceDeclarationError(
            "stored resource reference declaration is malformed"
        )
    for item in raw_refs:
        if not isinstance(item, str):
            raise _StoredReferenceDeclarationError(
                "stored resource reference declaration is malformed"
            )
        try:
            ref = PupuRefCodec.decode(item)
        except (TypeError, ValueError) as exc:
            raise _StoredReferenceDeclarationError(
                "stored resource reference declaration is malformed"
            ) from exc
        if ref in found:
            raise _StoredReferenceDeclarationError(
                "stored resource reference declaration contains duplicates"
            )
        found.append(ref)
    return tuple(found)


def _journal_event(
    scope: PupuExecutionScope,
    row: Mapping[str, Any],
    *,
    attempt: AttemptRef | None = None,
    declared_refs: tuple[ResourceRef, ...] | None = None,
) -> JournalEvent:
    event_id = str(row["event_id"])
    store_seq = int(row["store_seq"])
    stored_event = row.get("event") or {}
    if not isinstance(stored_event, Mapping):
        stored_event = {}
    semantic_payload = stored_event.get("payload")
    payload = (
        semantic_payload
        if isinstance(semantic_payload, Mapping)
        else stored_event
    )
    event_type = str(row.get("type") or payload.get("type") or "unknown")
    event_attempt = attempt or AttemptRef(
            GenerationRef(scope.session_id, scope.generation_id),
            str(row.get("attempt_id") or scope.attempt_id),
        )
    resource_refs = (
        _declared_refs(stored_event)
        if declared_refs is None
        else declared_refs
    )
    receipt = row.get("operation_receipt")
    operation_id = (
        str(receipt["operation_id"])
        if receipt is not None
        else f"persisted.{event_id}"
    )
    operation = (
        OperationRef(
            operation_id=operation_id,
            payload_sha256=str(receipt["payload_sha256"]),
        )
        if receipt is not None
        else SemanticEventDraft(
            event_id=event_id,
            event_type=event_type,
            attempt=event_attempt,
            operation_id=operation_id,
            payload=payload,
            resource_refs=resource_refs,
        ).operation
    )
    return JournalEvent(
        event_id=event_id,
        event_type=event_type,
        attempt=event_attempt,
        operation=operation,
        store_seq=store_seq,
        payload=payload,
        resource_refs=resource_refs,
    )


def _portable_journal_event(event: JournalEvent) -> JournalEvent:
    from memory_v2_context_reference_policy import (
        normalize_semantic_refs_for_context,
    )

    plain_payload = event.to_dict()["payload"]
    portable_payload = normalize_semantic_refs_for_context(
        event.event_type,
        plain_payload,
    )
    return JournalEvent(
        event_id=event.event_id,
        event_type=event.event_type,
        attempt=event.attempt,
        operation=SemanticEventDraft(
            event_id=event.event_id,
            event_type=event.event_type,
            attempt=event.attempt,
            operation_id=event.operation.operation_id,
            payload=portable_payload,
            resource_refs=event.resource_refs,
        ).operation,
        store_seq=event.store_seq,
        payload=portable_payload,
        resource_refs=event.resource_refs,
    )


class PupuExecutionJournal(_ExecutionBinding, BoundExecutionJournal):
    def __init__(self, store: MemoryV2Store, scope: PupuExecutionScope) -> None:
        BoundExecutionJournal.__init__(self, scope.session_id)
        _ExecutionBinding.__init__(self, store, scope)
        self._context_reference_policy: object | None = None

    def bind_context_reference_policy(self, policy: object) -> None:
        """Install one exact Context reference gate for this journal binding."""

        from memory_v2_context_reference_policy import PupuContextReferencePolicy

        if type(policy) is not PupuContextReferencePolicy:
            raise TypeError("policy must be an exact PupuContextReferencePolicy")
        if not policy.is_bound_to_journal(self):
            raise JournalScopeError(
                "context reference policy belongs to a different journal"
            )
        if self._context_reference_policy is policy:
            return
        if self._context_reference_policy is not None:
            raise JournalScopeError("journal already has a context reference policy")
        self._context_reference_policy = policy

    def append(self, *, request: JournalAppendRequest) -> JournalAppendResult:
        attempt = request.attempt
        if (
            attempt.generation.execution_id != self._scope.session_id
            or attempt.generation.generation_id != self._scope.generation_id
            or attempt.attempt_id != self._scope.attempt_id
        ):
            raise JournalScopeError("event belongs to a different bound execution")
        reference_policy = self._context_reference_policy
        if reference_policy is None:
            if request.resource_refs:
                raise JournalScopeError(
                    "resource references require a bound context reference policy"
                )
        else:
            reference_policy.authorize_append(request)
        event = {
            "schema_version": "unchain.journal_event.v1",
            "event_id": request.event_id,
            "type": request.event_type,
            "session_id": self._scope.session_id,
            "run_id": self._scope.attempt_id,
            "payload": request.to_dict()["payload"],
        }
        if request.resource_refs:
            event["links"] = {
                "resource_refs": [
                    PupuRefCodec.encode(ref) for ref in request.resource_refs
                ]
            }
        try:
            persisted = self._store.append_semantic_event(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                attempt_id=self._scope.attempt_id,
                event=event,
                operation_id=request.operation.operation_id,
                operation_payload_hash=request.operation.payload_sha256,
                expected_generation_id=self._scope.generation_id,
            )
        except MemoryV2Error as exc:
            _journal_failure(exc)
        if persisted.get("generation_id") != self._scope.generation_id:
            raise JournalScopeError("bound generation is no longer current")
        cursor = EventCursor(int(persisted["store_seq"]), str(persisted["event_id"]))
        if persisted.get("replayed"):
            row = self._row_at(cursor)
        else:
            row = self._row_at(
                cursor,
                operation_receipt={
                    "operation_id": request.operation.operation_id,
                    "payload_sha256": request.operation.payload_sha256,
                },
            )
        event_record = _journal_event(
            self._scope,
            row,
            attempt=self._attempt_ref,
        )
        return JournalAppendResult(
            event=event_record,
            cursor=cursor,
            duplicate=bool(persisted.get("replayed")),
        )

    def read(self, *, after: EventCursor | None = None, limit: int = 100) -> JournalPage:
        page_size = _positive_limit(limit)
        selected, has_more = self._generation_page(
            after=after.store_seq if after else 0,
            after_event_id=after.event_id if after else "",
            limit=page_size,
        )
        events_list: list[JournalEvent] = []
        for row in selected:
            attempt = (
                self._attempt_ref
                if str(row.get("attempt_id") or self._scope.attempt_id)
                == self._scope.attempt_id
                else None
            )
            try:
                event = _journal_event(self._scope, row, attempt=attempt)
            except _StoredReferenceDeclarationError:
                reference_policy = self._context_reference_policy
                if reference_policy is None:
                    raise
                event = _journal_event(
                    self._scope,
                    row,
                    attempt=attempt,
                    declared_refs=(),
                )
                reference_policy.revalidate_read(
                    event,
                    stored_event=row.get("event"),
                )
                raise
            if self._context_reference_policy is not None:
                self._context_reference_policy.revalidate_read(
                    event,
                    stored_event=row.get("event"),
                )
            events_list.append(event)
        events = tuple(events_list)
        next_cursor = (
            EventCursor(events[-1].store_seq, events[-1].event_id)
            if events
            else after
        )
        return JournalPage(
            events=events,
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def capture_snapshot(
        self,
        *,
        max_events: int = 10_000,
        max_bytes: int = 32 * 1024 * 1024,
    ) -> JournalSnapshot:
        if isinstance(max_events, bool) or not isinstance(max_events, int):
            raise TypeError("max_events must be an integer")
        if isinstance(max_bytes, bool) or not isinstance(max_bytes, int):
            raise TypeError("max_bytes must be an integer")
        if max_events < 0:
            raise ValueError("max_events must be non-negative")
        if max_bytes < 0:
            raise ValueError("max_bytes must be non-negative")
        rows = _logical_generation_rows(
            self._store,
            self._scope,
            start_position=1,
            limit=max_events + 1,
            include_payload=True,
        )
        if len(rows) > max_events:
            raise JournalRepositoryError("journal snapshot event limit exceeded")
        rows = self._attach_operation_receipts(rows)
        events_list: list[JournalEvent] = []
        for row in rows:
            logical_row = dict(row)
            logical_row["store_seq"] = int(row["logical_store_seq"])
            stored_event = logical_row.get("event")
            if isinstance(stored_event, Mapping) and isinstance(
                stored_event.get("payload"),
                Mapping,
            ):
                snapshot_event = dict(stored_event)
                snapshot_payload = dict(stored_event["payload"])
                for field_name in (
                    "run_id",
                    "agent_id",
                    "turn_id",
                    "parent_run_id",
                    "tool_call_id",
                    "visibility",
                    "timestamp",
                    "workflow_node_id",
                    "workflow_step_index",
                    "workflow_step_count",
                    "iteration",
                ):
                    value = stored_event.get(field_name)
                    if field_name not in snapshot_payload and value not in (
                        None,
                        "",
                    ):
                        snapshot_payload[field_name] = value
                links = stored_event.get("links")
                if isinstance(links, Mapping):
                    for field_name in ("parent_run_id", "tool_call_id"):
                        value = links.get(field_name)
                        if field_name not in snapshot_payload and value not in (
                            None,
                            "",
                        ):
                            snapshot_payload[field_name] = value
                snapshot_event["payload"] = snapshot_payload
                logical_row["event"] = snapshot_event
            attempt = (
                self._attempt_ref
                if str(row.get("attempt_id") or self._scope.attempt_id)
                == self._scope.attempt_id
                else None
            )
            try:
                event = _journal_event(
                    self._scope,
                    logical_row,
                    attempt=attempt,
                )
            except _StoredReferenceDeclarationError:
                reference_policy = self._context_reference_policy
                if reference_policy is None:
                    raise
                event = _journal_event(
                    self._scope,
                    logical_row,
                    attempt=attempt,
                    declared_refs=(),
                )
                reference_policy.revalidate_read(
                    event,
                    stored_event=row.get("event"),
                )
                raise
            if self._context_reference_policy is not None:
                self._context_reference_policy.revalidate_read(
                    event,
                    stored_event=row.get("event"),
                )
            events_list.append(_portable_journal_event(event))
        events = tuple(events_list)
        encoded = json.dumps(
            [event.to_dict() for event in events],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        if len(encoded) > max_bytes:
            raise JournalRepositoryError("journal snapshot byte limit exceeded")
        try:
            return capture_journal_snapshot(
                execution_id=self.execution_id,
                events=events,
            )
        except (TypeError, ValueError) as exc:
            raise JournalRepositoryError(
                "execution journal snapshot is invalid"
            ) from exc

    def authorize_event_ref(self, ref: ResourceRef) -> ResourceRef:
        """Resolve a bare event ref only within the exact bound attempt."""

        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind != "context_event" or ref.revision != 1 or ref.fragment:
            raise JournalScopeError("event reference is not canonical")
        scope = self.require_current_attempt()
        after = 0
        while True:
            try:
                page = self._store.load_events(
                    owner_chat_id=scope.owner_chat_id,
                    session_id=scope.session_id,
                    attempt_id=scope.attempt_id,
                    after=after,
                    limit=MAX_PAGE_SIZE,
                    include_payload=False,
                )
            except MemoryV2Error as exc:
                _journal_failure(exc)
            rows = tuple(page.get("events") or ())
            if any(
                row.get("generation_id") != scope.generation_id
                or row.get("attempt_id") != scope.attempt_id
                for row in rows
            ):
                raise JournalScopeError(
                    "event lookup escaped the exact bound attempt"
                )
            for row in rows:
                if row.get("event_id") == ref.resource_id:
                    return ref
            if not page.get("has_more"):
                break
            next_after = int(page.get("next_after", after))
            if next_after <= after:
                raise JournalRepositoryError(
                    "journal pagination did not advance while authorizing an event"
                )
            after = next_after
        raise JournalScopeError("event does not belong to the bound attempt")


class PupuArtifactRepository(_ExecutionBinding, BoundArtifactRepository):
    def __init__(self, store: MemoryV2Store, scope: PupuExecutionScope) -> None:
        BoundArtifactRepository.__init__(self, scope.session_id)
        _ExecutionBinding.__init__(self, store, scope)

    def put(
        self,
        *,
        content: bytes,
        media_type: str,
        operation: OperationRef,
        preview: str = "",
    ) -> ArtifactRef:
        try:
            response = self._store.record_artifact(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                attempt_id=self._scope.attempt_id,
                operation_id=operation.operation_id,
                operation_payload_hash=operation.payload_sha256,
                expected_generation_id=self._scope.generation_id,
                artifact={"kind": "unchain.artifact", "preview": preview},
                content=content,
                mime_type=media_type,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        raw = response["artifact_ref"]
        return ArtifactRef(
            ref=PupuRefCodec.decode(str(raw["uri"])),
            media_type=str(raw["media_type"]),
            byte_length=int(raw["bytes"]),
            sha256=str(raw["sha256"]),
            preview=str(raw.get("preview") or ""),
        )

    def authorize_ref(self, ref: ResourceRef) -> ResourceRef:
        """Scope-authorize an artifact ref without requiring its descriptor."""

        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind != "artifact" or ref.fragment:
            raise ContextScopeError(
                "artifact does not belong to the bound execution"
            )
        self.require_current_attempt()
        try:
            page = self._store.read_scoped_content(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                generation_id=self._scope.generation_id,
                ref=PupuRefCodec.encode(ref),
                offset=0,
                limit=1,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        if page.get("ref") != PupuRefCodec.encode(ref):
            raise ContextScopeError(
                "artifact lookup returned a different reference"
            )
        return ref

    def read_verified(
        self,
        *,
        artifact: ArtifactRef,
        offset: int = 0,
        limit: int = 65_536,
    ) -> bytes:
        if not isinstance(artifact, ArtifactRef):
            artifact = ArtifactRef.from_dict(artifact)
        ref = artifact.ref
        if ref.kind != "artifact" or ref.fragment:
            raise ContextScopeError("artifact does not belong to the bound execution")
        uri = PupuRefCodec.encode(ref)
        store_limit = 1 if limit == 0 else limit
        try:
            page = self._store.read_scoped_content(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                generation_id=self._scope.generation_id,
                ref=uri,
                offset=offset,
                limit=store_limit,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        data = self._verified_page_data(
            page,
            artifact=artifact,
            uri=uri,
            offset=offset,
            requested_limit=store_limit,
        )
        return data if limit else b""

    def read_full_verified(self, *, artifact: ArtifactRef) -> bytes:
        if not isinstance(artifact, ArtifactRef):
            artifact = ArtifactRef.from_dict(artifact)
        ref = artifact.ref
        if ref.kind != "artifact" or ref.fragment:
            raise ContextScopeError("artifact does not belong to the bound execution")
        if artifact.byte_length > MAX_ARTIFACT_BYTES:
            raise ContextRepositoryError("artifact exceeds the 32 MiB P0 limit")
        uri = PupuRefCodec.encode(ref)
        probe_limit = min(max(artifact.byte_length, 1), MAX_CONTENT_READ_BYTES)
        try:
            page = self._store.read_scoped_content(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                generation_id=self._scope.generation_id,
                ref=uri,
                offset=0,
                limit=probe_limit,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        page_data = self._verified_page_data(
            page,
            artifact=artifact,
            uri=uri,
            offset=0,
            requested_limit=probe_limit,
        )
        if artifact.byte_length <= MAX_CONTENT_READ_BYTES:
            content = page_data
        else:
            try:
                content = self._store._read_object_bytes(artifact.sha256)
            except MemoryV2Error as exc:
                _context_failure(exc)
        if len(content) != artifact.byte_length:
            raise ContextRepositoryError("artifact full read byte_length mismatch")
        if hashlib.sha256(content).hexdigest() != artifact.sha256:
            raise ContextRepositoryError("artifact full read sha256 mismatch")
        return content

    def _verified_page_data(
        self,
        page: Mapping[str, Any],
        *,
        artifact: ArtifactRef,
        uri: str,
        offset: int,
        requested_limit: int,
    ) -> bytes:
        try:
            if not isinstance(page, Mapping):
                raise ContextRepositoryError("artifact response is not an object")
            if page.get("ref") != uri:
                raise ContextRepositoryError("artifact response ref mismatch")
            if page.get("owner_chat_id") != self._scope.owner_chat_id:
                raise ContextRepositoryError("artifact response owner mismatch")
            if page.get("mime_type") != artifact.media_type:
                raise ContextRepositoryError("artifact response media_type mismatch")
            total = page.get("total_bytes")
            response_offset = page.get("offset")
            response_limit = page.get("limit")
            if isinstance(total, bool) or not isinstance(total, int):
                raise ContextRepositoryError("artifact response byte_length is invalid")
            if total != artifact.byte_length:
                raise ContextRepositoryError("artifact byte_length descriptor mismatch")
            if page.get("sha256") != artifact.sha256:
                raise ContextRepositoryError("artifact sha256 descriptor mismatch")
            if (
                isinstance(response_offset, bool)
                or not isinstance(response_offset, int)
                or response_offset != offset
            ):
                raise ContextRepositoryError("artifact response offset mismatch")
            expected_limit = min(requested_limit, MAX_CONTENT_READ_BYTES)
            if (
                isinstance(response_limit, bool)
                or not isinstance(response_limit, int)
                or response_limit != expected_limit
            ):
                raise ContextRepositoryError("artifact response limit mismatch")
            if offset < 0 or offset > total:
                raise ContextRepositoryError("artifact response range is invalid")
            if page.get("encoding") != "base64":
                raise ContextRepositoryError("artifact response encoding is invalid")
            encoded = page.get("data")
            if not isinstance(encoded, str):
                raise ContextRepositoryError("artifact response base64 data is invalid")
            try:
                data = base64.b64decode(encoded, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ContextRepositoryError(
                    "artifact response base64 data is invalid"
                ) from exc
            expected_length = min(expected_limit, total - offset)
            if len(data) != expected_length:
                raise ContextRepositoryError("artifact response page length is invalid")
            end = offset + len(data)
            expected_next = end if end < total else None
            expected_truncated = end < total
            response_next = page.get("next_offset")
            if response_next is not None and (
                isinstance(response_next, bool)
                or not isinstance(response_next, int)
            ):
                raise ContextRepositoryError("artifact response range is invalid")
            if (
                response_next != expected_next
                or page.get("truncated") is not expected_truncated
            ):
                raise ContextRepositoryError("artifact response range is invalid")
            return data
        except ContextRepositoryError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            raise ContextRepositoryError("artifact response is malformed") from exc


class PupuCheckpointRepository(_ExecutionBinding, BoundCheckpointRepository):
    _PREPARATION_SCHEMA = "pupu.unchain_checkpoint_preparation.v1"
    _PREPARATION_OPERATION_KIND = "unchain_checkpoint_prepare_v1"

    def __init__(self, store: MemoryV2Store, scope: PupuExecutionScope) -> None:
        BoundCheckpointRepository.__init__(self, scope.session_id)
        _ExecutionBinding.__init__(self, store, scope)

    @staticmethod
    def _commit_operation_id(operation: OperationRef) -> str:
        return "ctx_checkpoint_commit_" + hashlib.sha256(
            operation.operation_id.encode("utf-8")
        ).hexdigest()[:40]

    @staticmethod
    def _checkpoint_id(commit_operation_id: str) -> str:
        return "ctx_checkpoint_" + hashlib.sha256(
            f"checkpoint:{commit_operation_id}".encode("utf-8")
        ).hexdigest()[:40]

    def _prepared_from_record(
        self,
        record: Mapping[str, Any],
        *,
        operation: OperationRef,
        duplicate: bool,
    ) -> PreparedCheckpoint:
        try:
            if record.get("schema") != self._PREPARATION_SCHEMA:
                raise ValueError("schema")
            if record.get("owner_chat_id") != self._scope.owner_chat_id:
                raise ContextScopeError(
                    "checkpoint preparation belongs to a different chat"
                )
            if (
                record.get("session_id") != self._scope.session_id
                or record.get("generation_id") != self._scope.generation_id
                or record.get("attempt_id") != self._scope.attempt_id
            ):
                raise ContextScopeError(
                    "checkpoint preparation belongs to a different execution"
                )
            if record.get("operation_id") != operation.operation_id:
                raise ContextConflictError(
                    "checkpoint preparation operation changed"
                )
            if (
                record.get("operation_payload_sha256")
                != operation.payload_sha256
            ):
                raise ContextConflictError(
                    "checkpoint preparation operation payload changed"
                )
            preparation_id = _identifier(
                record.get("preparation_id"),
                "preparation_id",
            )
            checkpoint_ref = PupuRefCodec.decode(record.get("checkpoint_ref"))
            if checkpoint_ref.kind != "checkpoint" or checkpoint_ref.fragment:
                raise ValueError("checkpoint_ref")
            checkpoint_id = checkpoint_ref.resource_id
            with self._store._read() as connection:
                committed = connection.execute(
                    "SELECT 1 FROM checkpoints JOIN sessions "
                    "ON sessions.session_key=checkpoints.session_key "
                    "WHERE checkpoints.checkpoint_id=? "
                    "AND checkpoints.owner_chat_id=? "
                    "AND checkpoints.session_id=? "
                    "AND checkpoints.generation_id=? "
                    "AND checkpoints.attempt_id=? "
                    "AND sessions.current_generation_id=checkpoints.generation_id "
                    "AND sessions.deleted_at_ms IS NULL LIMIT 1",
                    (
                        checkpoint_id,
                        self._scope.owner_chat_id,
                        self._scope.session_id,
                        self._scope.generation_id,
                        self._scope.attempt_id,
                    ),
                ).fetchone()
            return PreparedCheckpoint(
                preparation_id=preparation_id,
                checkpoint_ref=checkpoint_ref,
                operation=operation,
                status=(
                    CheckpointWriteStatus.COMMITTED
                    if committed is not None
                    else CheckpointWriteStatus.PREPARED
                ),
                duplicate=duplicate,
            )
        except (ContextConflictError, ContextScopeError):
            raise
        except MemoryV2Error as exc:
            _context_failure(exc)
        except (KeyError, TypeError, ValueError, sqlite3.Error) as exc:
            raise ContextRepositoryError(
                "stored checkpoint preparation is invalid"
            ) from exc

    def _preparation_record(
        self,
        *,
        operation: OperationRef,
    ) -> Mapping[str, Any] | None:
        self.require_current_attempt()
        try:
            with self._store._read() as connection:
                row = connection.execute(
                    "SELECT operation_kind, payload_hash, response_json "
                    "FROM operations WHERE operation_id=?",
                    (operation.operation_id,),
                ).fetchone()
        except MemoryV2Error as exc:
            _context_failure(exc)
        except sqlite3.Error as exc:
            raise ContextRepositoryError(
                "checkpoint preparation lookup failed"
            ) from exc
        if row is None:
            return None
        if row["operation_kind"] != self._PREPARATION_OPERATION_KIND:
            raise ContextConflictError(
                "operation is already used by a different mutation"
            )
        try:
            record = json.loads(str(row["response_json"]))
        except json.JSONDecodeError as exc:
            raise ContextRepositoryError(
                "stored checkpoint preparation is invalid"
            ) from exc
        if (
            not isinstance(record, Mapping)
            or record.get("intent_sha256") != row["payload_hash"]
        ):
            raise ContextRepositoryError(
                "stored checkpoint preparation is invalid"
            )
        return record

    def prepare(
        self,
        *,
        source_range: EventRange,
        summary: str,
        refs: tuple[ResourceRef, ...],
        operation: OperationRef,
    ) -> PreparedCheckpoint:
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        if not isinstance(summary, str):
            raise TypeError("summary must be text")
        if not isinstance(refs, tuple):
            raise TypeError("refs must be a tuple")
        rows = _logical_event_rows_for_range(
            self._store,
            self._scope,
            source_range,
        )
        try:
            redacted = self._store._redactor({"summary": summary})
        except Exception as exc:
            raise ContextRepositoryError(
                "checkpoint summary could not be prepared for storage"
            ) from exc
        if not isinstance(redacted, Mapping) or not isinstance(
            redacted.get("summary"),
            str,
        ):
            raise ContextRepositoryError(
                "checkpoint summary could not be prepared for storage"
            )
        stored_summary = str(redacted["summary"])
        encoded_refs = [PupuRefCodec.encode(ref) for ref in refs]
        manifest = {
            "schema": "unchain.checkpoint_manifest.v1",
            "source_event_range": {
                "event_count": len(rows),
                "start": source_range.start.to_dict(),
                "end": source_range.end.to_dict(),
            },
            "refs": encoded_refs,
        }
        commit_operation_id = self._commit_operation_id(operation)
        checkpoint_id = self._checkpoint_id(commit_operation_id)
        preparation_id = "ctx_checkpoint_preparation_" + hashlib.sha256(
            operation.operation_id.encode("utf-8")
        ).hexdigest()[:40]
        intent = {
            "owner_chat_id": self._scope.owner_chat_id,
            "session_id": self._scope.session_id,
            "generation_id": self._scope.generation_id,
            "attempt_id": self._scope.attempt_id,
            "operation_id": operation.operation_id,
            "operation_payload_sha256": operation.payload_sha256,
            "manifest": manifest,
            "summary_sha256": hashlib.sha256(
                stored_summary.encode("utf-8")
            ).hexdigest(),
            "source_event_ids": [str(row["event_id"]) for row in rows],
            "source_event_store_seqs": [int(row["store_seq"]) for row in rows],
        }
        intent_sha256 = hashlib.sha256(
            json.dumps(
                intent,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        ).hexdigest()
        record = {
            "schema": self._PREPARATION_SCHEMA,
            **intent,
            "intent_sha256": intent_sha256,
            "preparation_id": preparation_id,
            "commit_operation_id": commit_operation_id,
            "checkpoint_ref": f"pupu://context/checkpoint/{checkpoint_id}",
            "summary": stored_summary,
        }
        try:
            with self._store._write() as connection:
                replay = self._store._receipt_replay(
                    connection,
                    operation.operation_id,
                    self._PREPARATION_OPERATION_KIND,
                    intent_sha256,
                )
                if replay is not None:
                    return self._prepared_from_record(
                        replay,
                        operation=operation,
                        duplicate=True,
                    )
                self._store._record_receipt(
                    connection,
                    operation.operation_id,
                    self._PREPARATION_OPERATION_KIND,
                    intent_sha256,
                    record,
                )
        except MemoryV2Error as exc:
            _context_failure(exc)
        return self._prepared_from_record(
            record,
            operation=operation,
            duplicate=False,
        )

    def get_by_operation(
        self,
        *,
        operation: OperationRef,
    ) -> PreparedCheckpoint | None:
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        record = self._preparation_record(operation=operation)
        if record is None:
            return None
        return self._prepared_from_record(
            record,
            operation=operation,
            duplicate=False,
        )

    def commit(self, *, prepared: PreparedCheckpoint) -> PreparedCheckpoint:
        if not isinstance(prepared, PreparedCheckpoint):
            raise TypeError("prepared must be a PreparedCheckpoint")
        current = self.get_by_operation(operation=prepared.operation)
        if current is None:
            raise ContextScopeError("checkpoint preparation was not found")
        if (
            current.preparation_id != prepared.preparation_id
            or current.checkpoint_ref != prepared.checkpoint_ref
        ):
            raise ContextConflictError("checkpoint preparation changed")
        if current.status is CheckpointWriteStatus.COMMITTED:
            return PreparedCheckpoint(
                preparation_id=current.preparation_id,
                checkpoint_ref=current.checkpoint_ref,
                operation=current.operation,
                status=CheckpointWriteStatus.COMMITTED,
                duplicate=True,
            )
        record = self._preparation_record(operation=prepared.operation)
        if record is None:
            raise ContextScopeError("checkpoint preparation was not found")
        try:
            response = self._store.record_checkpoint(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                attempt_id=self._scope.attempt_id,
                manifest=record["manifest"],
                content=str(record["summary"]).encode("utf-8"),
                source_event_ids=record["source_event_ids"],
                source_event_store_seqs=record["source_event_store_seqs"],
                operation_id=str(record["commit_operation_id"]),
                operation_payload_hash=prepared.operation.payload_sha256,
                expected_generation_id=self._scope.generation_id,
                mime_type="text/markdown",
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        if response.get("checkpoint_ref") != PupuRefCodec.encode(
            prepared.checkpoint_ref
        ):
            raise ContextRepositoryError(
                "checkpoint commit returned a different reference"
            )
        return PreparedCheckpoint(
            preparation_id=prepared.preparation_id,
            checkpoint_ref=prepared.checkpoint_ref,
            operation=prepared.operation,
            status=CheckpointWriteStatus.COMMITTED,
            duplicate=bool(response.get("replayed")),
        )

    def write(
        self,
        *,
        source_range: EventRange,
        summary: str,
        refs: tuple[ResourceRef, ...],
        operation: OperationRef,
    ) -> ResourceRef:
        rows = self._event_rows(source_range)
        manifest = {
            "schema": "unchain.checkpoint_manifest.v1",
            "source_event_range": {
                "event_count": len(rows),
                "start": source_range.start.to_dict(),
                "end": source_range.end.to_dict(),
            },
            "refs": [ref.to_dict() for ref in refs],
        }
        try:
            response = self._store.record_checkpoint(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                attempt_id=self._scope.attempt_id,
                manifest=manifest,
                content=summary.encode("utf-8"),
                source_event_ids=[str(row["event_id"]) for row in rows],
                source_event_store_seqs=[int(row["store_seq"]) for row in rows],
                operation_id=operation.operation_id,
                operation_payload_hash=operation.payload_sha256,
                expected_generation_id=self._scope.generation_id,
                mime_type="text/markdown",
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        return PupuRefCodec.decode(str(response["checkpoint_ref"]))

    def read(self, *, ref: ResourceRef, offset: int = 0, limit: int = 65_536) -> bytes:
        if ref.kind != "checkpoint" or ref.fragment:
            raise ContextScopeError("checkpoint reference is outside the bound execution")
        try:
            page = self._store.read_scoped_content(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                generation_id=self._scope.generation_id,
                ref=PupuRefCodec.encode(ref),
                offset=offset,
                limit=limit,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        return base64.b64decode(page["data"], validate=True)


class PupuContextBuildRepository(_ExecutionBinding, BoundContextBuildRepository):
    _CLAIM_SCHEMA = "pupu.unchain_context_build_claim.v1"
    _OPERATION_CLAIM_KIND = "unchain_context_build_operation_claim_v1"
    _TRIGGER_CLAIM_KIND = "unchain_context_build_trigger_claim_v1"

    def __init__(self, store: MemoryV2Store, scope: PupuExecutionScope) -> None:
        BoundContextBuildRepository.__init__(self, scope.session_id)
        _ExecutionBinding.__init__(self, store, scope)

    def _operation_claim_id(self, operation_id: str) -> str:
        return "ctx_build_operation_claim_" + hashlib.sha256(
            (
                f"{self._scope.owner_chat_id}\0{self._scope.session_id}\0"
                f"{self._scope.generation_id}\0{operation_id}"
            ).encode("utf-8")
        ).hexdigest()[:40]

    def _trigger_claim_id(self, trigger_cursor: EventCursor) -> str:
        return "ctx_build_trigger_claim_" + hashlib.sha256(
            (
                f"{self._scope.owner_chat_id}\0{self._scope.session_id}\0"
                f"{self._scope.generation_id}\0{trigger_cursor.store_seq}\0"
                f"{trigger_cursor.event_id}"
            ).encode("utf-8")
        ).hexdigest()[:40]

    @staticmethod
    def _envelope_sha256(envelope: ContextBuildEnvelope) -> str:
        return hashlib.sha256(
            json.dumps(
                envelope.to_dict(),
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        ).hexdigest()

    def _claim_record(
        self,
        *,
        envelope: ContextBuildEnvelope,
        operation: OperationRef,
        trigger_cursor: EventCursor,
    ) -> Mapping[str, Any]:
        record = {
            "schema": self._CLAIM_SCHEMA,
            "owner_chat_id": self._scope.owner_chat_id,
            "session_id": self._scope.session_id,
            "generation_id": self._scope.generation_id,
            "attempt_id": self._scope.attempt_id,
            "operation_id": operation.operation_id,
            "operation_payload_sha256": operation.payload_sha256,
            "trigger_cursor": trigger_cursor.to_dict(),
            "envelope_sha256": self._envelope_sha256(envelope),
        }
        intent_sha256 = hashlib.sha256(
            json.dumps(
                record,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        ).hexdigest()
        record = {**record, "intent_sha256": intent_sha256}
        claims = (
            (
                self._operation_claim_id(operation.operation_id),
                self._OPERATION_CLAIM_KIND,
            ),
            (
                self._trigger_claim_id(trigger_cursor),
                self._TRIGGER_CLAIM_KIND,
            ),
        )
        try:
            with self._store._write() as connection:
                for claim_id, operation_kind in claims:
                    replay = self._store._receipt_replay(
                        connection,
                        claim_id,
                        operation_kind,
                        intent_sha256,
                    )
                    if replay is None:
                        self._store._record_receipt(
                            connection,
                            claim_id,
                            operation_kind,
                            intent_sha256,
                            record,
                        )
        except MemoryV2Error as exc:
            _context_failure(exc)
        return record

    def _read_claim(
        self,
        *,
        claim_id: str,
        expected_kind: str,
    ) -> Mapping[str, Any] | None:
        try:
            with self._store._read() as connection:
                row = connection.execute(
                    "SELECT operation_kind, payload_hash, response_json "
                    "FROM operations WHERE operation_id=?",
                    (claim_id,),
                ).fetchone()
        except MemoryV2Error as exc:
            _context_failure(exc)
        except sqlite3.Error as exc:
            raise ContextRepositoryError("context build claim lookup failed") from exc
        if row is None:
            return None
        if row["operation_kind"] != expected_kind:
            raise ContextConflictError(
                "context build claim is used by a different mutation"
            )
        try:
            record = json.loads(str(row["response_json"]))
        except json.JSONDecodeError as exc:
            raise ContextRepositoryError("stored context build claim is invalid") from exc
        if (
            not isinstance(record, Mapping)
            or record.get("schema") != self._CLAIM_SCHEMA
            or record.get("intent_sha256") != row["payload_hash"]
            or record.get("owner_chat_id") != self._scope.owner_chat_id
            or record.get("session_id") != self._scope.session_id
            or record.get("generation_id") != self._scope.generation_id
            or record.get("attempt_id") != self._scope.attempt_id
        ):
            raise ContextRepositoryError("stored context build claim is invalid")
        return record

    def get_by_operation(
        self,
        *,
        operation: OperationRef,
    ) -> ContextBuildReceipt | None:
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        self.require_current_attempt()
        claim = self._read_claim(
            claim_id=self._operation_claim_id(operation.operation_id),
            expected_kind=self._OPERATION_CLAIM_KIND,
        )
        if claim is None:
            return None
        if claim.get("operation_id") != operation.operation_id:
            raise ContextConflictError("context build operation changed")
        if claim.get("operation_payload_sha256") != operation.payload_sha256:
            raise ContextConflictError("context build operation payload changed")
        try:
            trigger_cursor = EventCursor.from_dict(claim["trigger_cursor"])
            with self._store._read() as connection:
                operation_row = connection.execute(
                    "SELECT operation_kind, response_json FROM operations "
                    "WHERE operation_id=?",
                    (operation.operation_id,),
                ).fetchone()
                if operation_row is None:
                    return None
                if operation_row["operation_kind"] != "append_semantic_event":
                    raise ContextConflictError(
                        "operation is already used by a different mutation"
                    )
                operation_response = json.loads(
                    str(operation_row["response_json"])
                )
                if (
                    operation_response.get("operation_payload_hash")
                    != operation.payload_sha256
                ):
                    raise ContextConflictError(
                        "context build operation payload changed"
                    )
                event_id = _identifier(
                    operation_response.get("event_id"),
                    "event_id",
                )
                row = connection.execute(
                    "SELECT context_builds.context_json FROM context_builds "
                    "JOIN events ON events.store_seq=context_builds.event_store_seq "
                    "JOIN sessions ON sessions.session_key=events.session_key "
                    "WHERE events.event_id=? AND events.owner_chat_id=? "
                    "AND events.session_id=? AND events.generation_id=? "
                    "AND events.event_type='context.build' "
                    "AND events.deleted_at_ms IS NULL "
                    "AND sessions.current_generation_id=events.generation_id "
                    "AND sessions.deleted_at_ms IS NULL LIMIT 1",
                    (
                        event_id,
                        self._scope.owner_chat_id,
                        self._scope.session_id,
                        self._scope.generation_id,
                    ),
                ).fetchone()
            if row is None:
                raise ContextRepositoryError(
                    "context build operation projection is unavailable"
                )
            envelope = ContextBuildEnvelope.from_dict(
                json.loads(str(row["context_json"]))
            )
        except (ContextConflictError, ContextRepositoryError):
            raise
        except MemoryV2Error as exc:
            _context_failure(exc)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError, sqlite3.Error) as exc:
            raise ContextRepositoryError(
                "stored context build receipt is invalid"
            ) from exc
        if self._envelope_sha256(envelope) != claim.get("envelope_sha256"):
            raise ContextRepositoryError("stored context build receipt is invalid")
        return ContextBuildReceipt(
            envelope=envelope,
            operation=operation,
            trigger_cursor=trigger_cursor,
            duplicate=False,
        )

    def get_by_trigger(
        self,
        *,
        trigger_cursor: EventCursor,
    ) -> ContextBuildReceipt | None:
        if not isinstance(trigger_cursor, EventCursor):
            trigger_cursor = EventCursor.from_dict(trigger_cursor)
        _logical_event_rows_for_range(
            self._store,
            self._scope,
            EventRange(trigger_cursor, trigger_cursor),
        )
        claim = self._read_claim(
            claim_id=self._trigger_claim_id(trigger_cursor),
            expected_kind=self._TRIGGER_CLAIM_KIND,
        )
        if claim is None:
            return None
        if EventCursor.from_dict(claim["trigger_cursor"]) != trigger_cursor:
            raise ContextRepositoryError("stored context build claim is invalid")
        try:
            operation = OperationRef(
                claim["operation_id"],
                claim["operation_payload_sha256"],
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ContextRepositoryError("stored context build claim is invalid") from exc
        receipt = self.get_by_operation(operation=operation)
        if receipt is not None and receipt.trigger_cursor != trigger_cursor:
            raise ContextRepositoryError("stored context build receipt is invalid")
        return receipt

    def record(
        self,
        *,
        envelope: ContextBuildEnvelope,
        operation: OperationRef,
        trigger_cursor: EventCursor | None = None,
    ) -> ContextBuildEnvelope | ContextBuildReceipt:
        if (
            envelope.execution_id != self._scope.session_id
            or envelope.generation_id != self._scope.generation_id
            or envelope.attempt_id != self._scope.attempt_id
        ):
            raise ContextScopeError("context build belongs to a different execution")
        if trigger_cursor is None:
            source_ids: list[str] = []
            ranges = (envelope.source_range,) if envelope.source_range else ()
            for source_range in (*ranges, *envelope.included_ranges):
                for row in self._event_rows(source_range):
                    event_id = str(row["event_id"])
                    if event_id not in source_ids:
                        source_ids.append(event_id)
            try:
                self._store.record_context_build(
                    owner_chat_id=self._scope.owner_chat_id,
                    session_id=self._scope.session_id,
                    attempt_id=self._scope.attempt_id,
                    operation_id=operation.operation_id,
                    operation_payload_hash=operation.payload_sha256,
                    expected_generation_id=self._scope.generation_id,
                    context=envelope.to_dict(),
                    source_event_ids=source_ids,
                )
            except MemoryV2Error as exc:
                _context_failure(exc)
            return envelope
        if not isinstance(trigger_cursor, EventCursor):
            trigger_cursor = EventCursor.from_dict(trigger_cursor)
        _logical_event_rows_for_range(
            self._store,
            self._scope,
            EventRange(trigger_cursor, trigger_cursor),
        )
        existing = self.get_by_operation(operation=operation)
        if existing is not None:
            if (
                existing.envelope != envelope
                or existing.trigger_cursor != trigger_cursor
            ):
                raise ContextConflictError("context build operation changed")
            return ContextBuildReceipt(
                envelope=existing.envelope,
                operation=existing.operation,
                trigger_cursor=existing.trigger_cursor,
                duplicate=True,
            )
        self._claim_record(
            envelope=envelope,
            operation=operation,
            trigger_cursor=trigger_cursor,
        )
        existing = self.get_by_operation(operation=operation)
        if existing is not None:
            if (
                existing.envelope != envelope
                or existing.trigger_cursor != trigger_cursor
            ):
                raise ContextConflictError("context build operation changed")
            return ContextBuildReceipt(
                envelope=existing.envelope,
                operation=existing.operation,
                trigger_cursor=existing.trigger_cursor,
                duplicate=True,
            )
        source_ids: list[str] = []
        ranges = (envelope.source_range,) if envelope.source_range else ()
        for source_range in (*ranges, *envelope.included_ranges):
            for row in _logical_event_rows_for_range(
                self._store,
                self._scope,
                source_range,
            ):
                event_id = str(row["event_id"])
                if event_id not in source_ids:
                    source_ids.append(event_id)
        try:
            response = self._store.record_context_build(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                attempt_id=self._scope.attempt_id,
                operation_id=operation.operation_id,
                operation_payload_hash=operation.payload_sha256,
                expected_generation_id=self._scope.generation_id,
                context=envelope.to_dict(),
                source_event_ids=source_ids,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        receipt = self.get_by_operation(operation=operation)
        if (
            receipt is None
            or receipt.envelope != envelope
            or receipt.trigger_cursor != trigger_cursor
        ):
            raise ContextRepositoryError(
                "context build operation receipt is unavailable"
            )
        return ContextBuildReceipt(
            envelope=receipt.envelope,
            operation=receipt.operation,
            trigger_cursor=receipt.trigger_cursor,
            duplicate=bool(response.get("replayed")),
        )

    def latest(self, *, generation_id: str) -> ContextBuildEnvelope | None:
        if generation_id != self._scope.generation_id:
            raise ContextScopeError("generation is outside the bound execution")
        try:
            payload = self._store.get_latest_context_build_projection(
                owner_chat_id=self._scope.owner_chat_id,
                session_id=self._scope.session_id,
                generation_id=generation_id,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        if payload is None:
            return None
        try:
            return ContextBuildEnvelope.from_dict(payload)
        except (TypeError, ValueError) as exc:
            raise ContextRepositoryError(
                "stored context build projection is invalid"
            ) from exc


@dataclass(frozen=True)
class PupuExecutionCapabilities:
    journal: PupuExecutionJournal
    artifacts: PupuArtifactRepository
    checkpoints: PupuCheckpointRepository
    context_builds: PupuContextBuildRepository

    @property
    def scope(self) -> PupuExecutionScope:
        return self.journal.scope

    def require_current_attempt(self) -> PupuExecutionScope:
        return self.journal.require_current_attempt()

    def authorize_event_ref(self, ref: ResourceRef) -> ResourceRef:
        return self.journal.authorize_event_ref(ref)


class PupuPinnedTaskStateRepository(BoundPinnedTaskStateRepository):
    """Schema-v4 task-state CAS bound to one exact Unchain execution."""

    def __init__(
        self,
        execution: PupuExecutionCapabilities,
        *,
        binding_id: str,
    ) -> None:
        if not isinstance(execution, PupuExecutionCapabilities):
            raise TypeError("execution must be PupuExecutionCapabilities")
        try:
            scope = execution.require_current_attempt()
        except JournalScopeError as exc:
            raise RepositoryScopeError(str(exc)) from exc
        except JournalRepositoryError as exc:
            raise WorkspaceRepositoryError(
                "bound execution validation failed"
            ) from exc
        stable_state_id = "task-state-" + hashlib.sha256(
            (
                f"{scope.owner_chat_id}\0{scope.session_id}\0"
                f"{scope.generation_id}"
            ).encode("utf-8")
        ).hexdigest()[:32]
        super().__init__(binding_id, stable_state_id)
        # This class is part of the repository boundary itself. Keeping the
        # backing store here avoids exposing it to service/toolkit adapters.
        self._store = execution.journal._store
        self._execution = execution
        self._scope = scope

    def _require_scope(self) -> PupuExecutionScope:
        try:
            scope = self._execution.require_current_attempt()
        except JournalScopeError as exc:
            raise RepositoryScopeError(str(exc)) from exc
        except JournalRepositoryError as exc:
            raise WorkspaceRepositoryError(
                "bound execution validation failed"
            ) from exc
        if scope != self._scope:
            raise RepositoryScopeError("task state execution binding changed")
        return scope

    def redact_patch_for_storage(
        self,
        patch: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Run the exact product redactor before Unchain hashes a mutation."""

        if not isinstance(patch, Mapping):
            raise TypeError("patch must be an object")
        original = copy.deepcopy(dict(patch))
        list_fields = (
            "success_criteria",
            "constraints",
            "confirmed_decisions",
            "open_questions",
            "active_plan",
        )
        ref_fields = {"artifact_refs", "memory_refs"}
        supported_fields = {
            "objective",
            *list_fields,
            *ref_fields,
            "status",
        }
        if set(original) - supported_fields:
            raise WorkspaceRepositoryError("task state patch redaction failed")
        storage_patch: dict[str, Any] = {}
        if "objective" in original:
            storage_patch["objective"] = original["objective"]
        for field_name in list_fields:
            if field_name not in original:
                continue
            value = original[field_name]
            if not isinstance(value, (list, tuple)):
                raise WorkspaceRepositoryError("task state patch redaction failed")
            storage_patch[field_name] = list(value)
        if ref_fields.intersection(original):
            encoded_refs: list[str] = []
            for field_name in ("artifact_refs", "memory_refs"):
                values = original.get(field_name, ())
                if not isinstance(values, (list, tuple)):
                    raise WorkspaceRepositoryError(
                        "task state patch redaction failed"
                    )
                try:
                    encoded_refs.extend(PupuRefCodec.encode(ref) for ref in values)
                except (TypeError, ValueError):
                    raise WorkspaceRepositoryError(
                        "task state patch redaction failed"
                    ) from None
            storage_patch["artifact_memory_refs"] = encoded_refs
        if "status" in original:
            storage_patch["status"] = original["status"]
        try:
            redacted = self._store._redactor(copy.deepcopy(storage_patch))
        except Exception:
            raise WorkspaceRepositoryError(
                "task state patch redaction failed"
            ) from None
        if not isinstance(redacted, Mapping) or set(redacted) != set(storage_patch):
            raise WorkspaceRepositoryError("task state patch redaction failed")
        normalized: dict[str, Any] = {}
        for field_name in original:
            if field_name in ref_fields:
                continue
            value = redacted[field_name]
            if field_name in list_fields:
                if not isinstance(value, list):
                    raise WorkspaceRepositoryError(
                        "task state patch redaction failed"
                    )
                normalized[field_name] = tuple(value)
            else:
                normalized[field_name] = copy.deepcopy(value)
        if ref_fields.intersection(original):
            raw_refs = redacted["artifact_memory_refs"]
            if not isinstance(raw_refs, list):
                raise WorkspaceRepositoryError("task state patch redaction failed")
            decoded_refs: list[ResourceRef] = []
            try:
                for raw_ref in raw_refs:
                    decoded = PupuRefCodec.decode(raw_ref)
                    if decoded.kind not in {"artifact", "memory"}:
                        raise ValueError("unsupported task state reference")
                    decoded_refs.append(decoded)
            except (TypeError, ValueError):
                raise WorkspaceRepositoryError(
                    "task state patch redaction failed"
                ) from None
            artifacts = tuple(ref for ref in decoded_refs if ref.kind == "artifact")
            memories = tuple(ref for ref in decoded_refs if ref.kind == "memory")
            if artifacts and "artifact_refs" not in original:
                raise WorkspaceRepositoryError("task state patch redaction failed")
            if memories and "memory_refs" not in original:
                raise WorkspaceRepositoryError("task state patch redaction failed")
            if "artifact_refs" in original:
                normalized["artifact_refs"] = artifacts
            if "memory_refs" in original:
                normalized["memory_refs"] = memories
        return normalized

    @staticmethod
    def _decode_refs(
        values: object,
        *,
        allowed_kinds: frozenset[str],
        field_name: str,
    ) -> tuple[ResourceRef, ...]:
        if not isinstance(values, list):
            raise WorkspaceRepositoryError(
                f"stored {field_name} is not an array"
            )
        refs: list[ResourceRef] = []
        for value in values:
            try:
                ref = PupuRefCodec.decode(value)
            except (TypeError, ValueError) as exc:
                raise WorkspaceRepositoryError(
                    f"stored {field_name} contains an invalid reference"
                ) from exc
            if ref.kind not in allowed_kinds:
                raise WorkspaceRepositoryError(
                    f"stored {field_name} contains a disallowed reference"
                )
            refs.append(ref)
        return tuple(refs)

    def _state(
        self,
        row: Mapping[str, Any],
        *,
        operation_sources: bool = False,
    ) -> PinnedTaskState:
        raw_refs = self._decode_refs(
            row.get("artifact_memory_refs", []),
            allowed_kinds=frozenset({"artifact", "memory"}),
            field_name="artifact_memory_refs",
        )
        source_key = (
            "operation_source_event_refs"
            if operation_sources
            else "source_event_refs"
        )
        source_refs = self._decode_refs(
            row.get(source_key, []),
            allowed_kinds=frozenset({"context_event"}),
            field_name=source_key,
        )
        if any(ref.revision != 1 or ref.fragment for ref in source_refs):
            raise WorkspaceRepositoryError(
                "stored task-state provenance is not canonical"
            )
        try:
            return PinnedTaskState(
                state_id=self.state_id,
                revision=int(row["revision"]),
                objective=row.get("objective", ""),
                success_criteria=tuple(row.get("success_criteria", [])),
                constraints=tuple(row.get("constraints", [])),
                confirmed_decisions=tuple(row.get("confirmed_decisions", [])),
                open_questions=tuple(row.get("open_questions", [])),
                active_plan=tuple(row.get("active_plan", [])),
                artifact_refs=tuple(
                    ref for ref in raw_refs if ref.kind == "artifact"
                ),
                memory_refs=tuple(ref for ref in raw_refs if ref.kind == "memory"),
                source_event_refs=source_refs,
                status=row.get("status", "in_progress"),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkspaceRepositoryError(
                "stored pinned task state is invalid"
            ) from exc

    def current(self) -> PinnedTaskState | None:
        scope = self._require_scope()
        try:
            row = self._store.get_task_state(
                owner_chat_id=scope.owner_chat_id,
                session_id=scope.session_id,
                attempt_id=scope.attempt_id,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        if row is None:
            return None
        if row.get("generation_id") != scope.generation_id:
            raise RepositoryScopeError("pinned task state belongs to another generation")
        return self._state(row)

    def replay(self, *, operation: OperationRef) -> PinnedTaskState | None:
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        scope = self._require_scope()
        try:
            response = self._store.get_task_state(
                owner_chat_id=scope.owner_chat_id,
                session_id=scope.session_id,
                attempt_id=scope.attempt_id,
                expected_generation_id=scope.generation_id,
                replay_operation_id=operation.operation_id,
                replay_operation_payload_hash=operation.payload_sha256,
            )
        except MemoryV2Error as exc:
            if exc.code in {
                "context_v2_attempt_generation_conflict",
                "context_v2_generation_conflict",
            }:
                raise RepositoryScopeError(str(exc)) from exc
            _workspace_failure(exc)
        if response is None:
            return None
        return self._state(response, operation_sources=True)

    def compare_and_swap(
        self,
        *,
        state: PinnedTaskState,
        expected_revision: int | None,
        operation: OperationRef,
    ) -> PinnedTaskState:
        if not isinstance(state, PinnedTaskState):
            raise TypeError("state must be a PinnedTaskState")
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        if state.state_id != self.state_id:
            raise RepositoryScopeError("task state identity does not match its binding")
        if expected_revision is None:
            raise WorkspaceRepositoryError(
                "schema-v4 task state must be bootstrapped before CAS"
            )
        if state.revision != expected_revision + 1:
            raise RepositoryConflictError("task state revision must advance once")
        scope = self._require_scope()
        for ref in state.source_event_refs:
            try:
                if self._execution.authorize_event_ref(ref) != ref:
                    raise RepositoryScopeError(
                        "task state source provenance changed during authorization"
                    )
            except JournalScopeError as exc:
                raise RepositoryScopeError(
                    "task state source event is outside the bound attempt"
                ) from exc
            except JournalRepositoryError as exc:
                raise WorkspaceRepositoryError(
                    "task state source event lookup failed"
                ) from exc
        patch = {
            "objective": state.objective,
            "success_criteria": list(state.success_criteria),
            "constraints": list(state.constraints),
            "confirmed_decisions": list(state.confirmed_decisions),
            "open_questions": list(state.open_questions),
            "active_plan": list(state.active_plan),
            "artifact_memory_refs": [
                PupuRefCodec.encode(ref)
                for ref in (*state.artifact_refs, *state.memory_refs)
            ],
            "status": state.status,
        }
        try:
            response = self._store.update_task_state(
                owner_chat_id=scope.owner_chat_id,
                session_id=scope.session_id,
                expected_revision=expected_revision,
                patch=patch,
                source_event_ids=[ref.resource_id for ref in state.source_event_refs],
                operation_id=operation.operation_id,
                operation_payload_hash=operation.payload_sha256,
                expected_generation_id=scope.generation_id,
                expected_attempt_id=scope.attempt_id,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        persisted = self._state(response, operation_sources=True)
        if persisted != state:
            raise WorkspaceRepositoryError(
                "schema-v4 returned a divergent task-state revision"
            )
        return persisted


class PupuMemoryWorkspaceRepository(BoundMemoryWorkspaceRepository):
    def __init__(
        self,
        store: MemoryV2Store,
        *,
        owner_chat_id: str,
        space: MemorySpace,
        allow_long_term: bool = False,
        namespace: str = "",
    ) -> None:
        super().__init__(space)
        self._store = store
        self._owner_chat_id = _identifier(owner_chat_id, "owner_chat_id", owner=True)
        self._allow_long_term = bool(allow_long_term)
        self._namespace = namespace

    @property
    def owner_chat_id(self) -> str:
        """Return the immutable chat owner without exposing storage scope controls."""

        return self._owner_chat_id

    @property
    def is_chat_workspace(self) -> bool:
        return not self._allow_long_term and not self._namespace

    def is_same_binding(self, other: object) -> bool:
        """Compare opaque host bindings without exposing the backing store."""

        return (
            isinstance(other, PupuMemoryWorkspaceRepository)
            and self._store is other._store
            and self._owner_chat_id == other._owner_chat_id
            and self.space.space_id == other.space.space_id
            and self._allow_long_term == other._allow_long_term
            and self._namespace == other._namespace
        )

    def is_bound_to_execution(self, execution: object) -> bool:
        """Confirm that an execution capability shares this host/chat binding."""

        # This is the single contained host-store identity seam.  It compares
        # opaque in-process bindings without returning storage or scope values.
        if type(execution) is not PupuExecutionCapabilities:
            return False
        scope = execution.scope
        components = (
            (execution.journal, PupuExecutionJournal),
            (execution.artifacts, PupuArtifactRepository),
            (execution.checkpoints, PupuCheckpointRepository),
            (execution.context_builds, PupuContextBuildRepository),
        )
        return (
            self._owner_chat_id == scope.owner_chat_id
            and all(
                type(component) is expected_type
                and component._store is self._store
                and component.scope == scope
                for component, expected_type in components
            )
        )

    @staticmethod
    def _kind(row: Mapping[str, Any]) -> MemoryEntryKind:
        kind = str(row.get("kind") or "")
        if kind == "folder":
            return MemoryEntryKind.FOLDER
        if kind == "link":
            return MemoryEntryKind.LINK
        if kind == "file" and str(row.get("mime_type") or "").startswith("image/"):
            return MemoryEntryKind.IMAGE
        if kind == "file":
            return MemoryEntryKind.MARKDOWN
        raise WorkspaceRepositoryError("stored entry has an unsupported kind")

    def _entry(self, row: Mapping[str, Any], *, deleted: bool = False) -> MemoryEntry:
        kind = self._kind(row)
        source_event_id = str(row.get("source_event_id") or "")
        return MemoryEntry(
            entry_id=str(row["entry_id"]),
            space_id=str(row["space_id"]),
            path=str(row["path"]),
            name=str(row["name"]),
            description=str(row.get("description") or ""),
            kind=kind,
            revision=int(row["revision"]),
            updated_seq=int(row.get("space_revision") or 0),
            content_ref=(
                PupuRefCodec.decode(str(row["content_ref"]))
                if row.get("content_ref")
                else None
            ),
            source_refs=(
                (ResourceRef("context_event", source_event_id, 1),)
                if source_event_id
                else ()
            ),
            media_type=str(row.get("mime_type") or "") if kind in {
                MemoryEntryKind.MARKDOWN,
                MemoryEntryKind.IMAGE,
            } else "",
            link_url=str(row.get("link_url") or "") if kind is MemoryEntryKind.LINK else "",
            deleted=deleted,
        )

    def persist_schema_v4_mutation(
        self,
        *,
        execution: PupuExecutionCapabilities,
        request: WorkspaceMutationRequest,
        source_event_id: str,
        created_by: str,
    ) -> MemoryEntry:
        """Translate one pre-authorized Unchain mutation into schema-v4 storage."""

        if not isinstance(request, WorkspaceMutationRequest):
            raise TypeError("request must be a WorkspaceMutationRequest")
        if type(execution) is not PupuExecutionCapabilities:
            raise TypeError("execution must be an exact PupuExecutionCapabilities")
        if not self.is_bound_to_execution(execution):
            raise RepositoryScopeError(
                "workspace and execution have different host bindings"
            )
        try:
            scope = execution.require_current_attempt()
        except JournalScopeError as exc:
            raise RepositoryScopeError(str(exc)) from exc
        except JournalRepositoryError as exc:
            raise WorkspaceRepositoryError(
                "bound execution validation failed"
            ) from exc
        if scope != execution.scope or scope.owner_chat_id != self._owner_chat_id:
            raise RepositoryScopeError("workspace execution binding changed")
        entry = request.entry
        if entry.space_id != self.space.space_id:
            raise RepositoryScopeError("entry belongs to another workspace")
        source_id = _identifier(source_event_id, "source_event_id")
        actor = _identifier(created_by, "created_by")
        host_kind = (
            "folder"
            if entry.kind is MemoryEntryKind.FOLDER
            else "link"
            if entry.kind is MemoryEntryKind.LINK
            else "file"
        )
        mime_type = (
            entry.media_type
            if entry.kind in {MemoryEntryKind.MARKDOWN, MemoryEntryKind.IMAGE}
            else "application/octet-stream"
        )
        link_url = entry.link_url if entry.kind is MemoryEntryKind.LINK else ""
        if entry.deleted:
            raise WorkspaceRepositoryError(
                "schema-v4 mutation boundary does not accept archive requests"
            )
        try:
            if request.expected_revision is None:
                response = self._store.create_entry(
                    owner_chat_id=self._owner_chat_id,
                    space_id=self.space.space_id,
                    entry_id=entry.entry_id,
                    path=entry.path,
                    kind=host_kind,
                    expected_space_revision=request.expected_space_revision,
                    operation_id=request.operation.operation_id,
                    operation_payload_hash=request.operation.payload_sha256,
                    description=entry.description,
                    mime_type=mime_type,
                    content=request.content,
                    link_url=link_url,
                    source_event_id=source_id,
                    created_by=actor,
                    allow_long_term=self._allow_long_term,
                    namespace=self._namespace,
                    expected_session_id=scope.session_id,
                    expected_generation_id=scope.generation_id,
                    expected_attempt_id=scope.attempt_id,
                )
            else:
                response = self._store.update_entry(
                    owner_chat_id=self._owner_chat_id,
                    space_id=self.space.space_id,
                    entry_id=entry.entry_id,
                    expected_revision=request.expected_revision,
                    expected_space_revision=request.expected_space_revision,
                    operation_id=request.operation.operation_id,
                    operation_payload_hash=request.operation.payload_sha256,
                    path=entry.path,
                    description=entry.description,
                    mime_type=mime_type if host_kind == "file" else None,
                    content=request.content,
                    link_url=link_url if host_kind == "link" else None,
                    source_event_id=source_id,
                    created_by=actor,
                    allow_long_term=self._allow_long_term,
                    namespace=self._namespace,
                    expected_session_id=scope.session_id,
                    expected_generation_id=scope.generation_id,
                    expected_attempt_id=scope.attempt_id,
                )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        persisted_space_revision = int(response.get("space_revision") or 0)
        if persisted_space_revision != request.expected_space_revision + 1:
            raise WorkspaceRepositoryError(
                "schema-v4 returned a divergent workspace revision"
            )
        if persisted_space_revision > self.space.revision:
            self._space = MemorySpace(
                space_id=self.space.space_id,
                namespace=self.space.namespace,
                name=self.space.name,
                description=self.space.description,
                revision=persisted_space_revision,
            )
        return self._entry(response)

    def read_content_page(
        self,
        *,
        ref: ResourceRef,
        offset: int = 0,
        limit: int = 32 * 1024,
    ) -> WorkspaceContentPage:
        """Read one exact public memory URI through the bound chat scope."""

        if (
            not isinstance(ref, ResourceRef)
            or ref.kind != "memory"
            or ref.fragment != self.space.space_id
        ):
            raise RepositoryScopeError(
                "content reference does not belong to the bound workspace"
            )
        uri = PupuRefCodec.encode(ref, bound_space_id=self.space.space_id)
        try:
            response = self._store.read_scoped_content(
                owner_chat_id=self._owner_chat_id,
                ref=uri,
                offset=offset,
                limit=limit,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        if response.get("ref") != uri:
            raise RepositoryScopeError(
                "content capability returned a foreign reference"
            )
        try:
            data = base64.b64decode(str(response["data"]), validate=True)
            page_offset = int(response["offset"])
            total_bytes = int(response["total_bytes"])
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkspaceRepositoryError(
                "schema-v4 returned invalid content metadata"
            ) from exc
        if page_offset != offset or offset > total_bytes or len(data) > limit:
            raise WorkspaceRepositoryError(
                "schema-v4 returned an invalid content range"
            )
        return WorkspaceContentPage(
            ref=ref,
            media_type=str(response.get("mime_type") or "application/octet-stream"),
            data=data,
            offset=page_offset,
            total_bytes=total_bytes,
        )

    def _store_entry(self, entry_id: str, revision: int | None = None) -> dict[str, Any]:
        try:
            return self._store.get_entry(
                owner_chat_id=self._owner_chat_id,
                space_id=self.space.space_id,
                entry_id=entry_id,
                revision=revision,
                allow_long_term=self._allow_long_term,
                namespace=self._namespace,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)

    def _current_space_revision(self) -> int:
        try:
            listing = self._store.list_entries(
                owner_chat_id=self._owner_chat_id,
                space_id=self.space.space_id,
                allow_long_term=self._allow_long_term,
                namespace=self._namespace,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        revision = int(listing["space_revision"])
        self._space = MemorySpace(
            self.space.space_id,
            self.space.namespace,
            self.space.name,
            self.space.description,
            revision,
        )
        return revision

    def _source_event_id(self, entry: MemoryEntry) -> str:
        if entry.tags:
            raise WorkspaceRepositoryError("schema-v4 does not persist portable tags")
        if len(entry.source_refs) > 1:
            raise WorkspaceRepositoryError("schema-v4 accepts one source event per entry")
        if not entry.source_refs:
            return ""
        source = entry.source_refs[0]
        if source.kind != "context_event" or source.revision != 1 or source.fragment:
            raise RepositoryScopeError("entry source must be a canonical event reference")
        return source.resource_id

    def _entry_content(self, entry: MemoryEntry) -> tuple[bytes | None, str, str]:
        if entry.kind is MemoryEntryKind.FOLDER:
            return None, "application/octet-stream", ""
        if entry.kind is MemoryEntryKind.LINK:
            return None, "application/octet-stream", entry.link_url
        if entry.content_ref is None:
            raise WorkspaceRepositoryError("file entries require a durable content reference")
        ref = entry.content_ref
        if ref.kind == "memory" and ref.fragment not in {"", self.space.space_id}:
            raise RepositoryScopeError("content reference belongs to another workspace")
        try:
            page = self._store.read_scoped_content(
                owner_chat_id=self._owner_chat_id,
                ref=PupuRefCodec.encode(ref, bound_space_id=self.space.space_id),
                offset=0,
                limit=128 * 1024,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        if page.get("truncated"):
            chunks = [base64.b64decode(page["data"], validate=True)]
            offset = int(page["next_offset"])
            while True:
                try:
                    page = self._store.read_scoped_content(
                        owner_chat_id=self._owner_chat_id,
                        ref=PupuRefCodec.encode(ref, bound_space_id=self.space.space_id),
                        offset=offset,
                        limit=128 * 1024,
                    )
                except MemoryV2Error as exc:
                    _workspace_failure(exc)
                chunks.append(base64.b64decode(page["data"], validate=True))
                if not page.get("truncated"):
                    break
                offset = int(page["next_offset"])
            content = b"".join(chunks)
        else:
            content = base64.b64decode(page["data"], validate=True)
        media_type = entry.media_type or (
            "text/markdown" if entry.kind is MemoryEntryKind.MARKDOWN else str(page["mime_type"])
        )
        return content, media_type, ""

    def list_entries(
        self,
        *,
        parent_path: str = "/",
        include_deleted: bool = False,
        limit: int = 100,
        cursor: str | None = None,
    ) -> MemoryEntryPage:
        page_size = _positive_limit(limit)
        parent_path = canonical_virtual_path(parent_path, "parent_path")
        if include_deleted and hasattr(self._store, "list_repository_entries"):
            try:
                listing = self._store.list_repository_entries(
                    owner_chat_id=self._owner_chat_id,
                    space_id=self.space.space_id,
                    include_deleted=True,
                    allow_long_term=self._allow_long_term,
                    namespace=self._namespace,
                )
            except MemoryV2Error as exc:
                _workspace_failure(exc)
        else:
            try:
                listing = self._store.list_entries(
                    owner_chat_id=self._owner_chat_id,
                    space_id=self.space.space_id,
                    allow_long_term=self._allow_long_term,
                    namespace=self._namespace,
                )
            except MemoryV2Error as exc:
                _workspace_failure(exc)
        rows = list(listing.get("entries") or ())
        prefix = parent_path.rstrip("/") + "/"
        rows = [
            row
            for row in rows
            if (parent_path == "/" or str(row.get("path") or "").startswith(prefix))
            and (include_deleted or not bool(row.get("deleted")))
        ]
        rows.sort(key=lambda row: str(row.get("path") or "").casefold())
        start = 0
        if cursor is not None:
            positions = [index for index, row in enumerate(rows) if row.get("entry_id") == cursor]
            if not positions:
                raise RepositoryScopeError("cursor does not belong to the bound workspace")
            start = positions[0] + 1
        selected = rows[start : start + page_size]
        has_more = start + len(selected) < len(rows)
        entries = tuple(
            self._entry(row, deleted=bool(row.get("deleted"))) for row in selected
        )
        return MemoryEntryPage(
            entries=entries,
            next_cursor=(entries[-1].entry_id if entries and has_more else None),
            has_more=has_more,
        )

    def search(self, *, query: str, limit: int = 20) -> tuple[MemoryEntry, ...]:
        try:
            response = self._store.search_entries(
                owner_chat_id=self._owner_chat_id,
                space_id=self.space.space_id,
                query=query,
                limit=_positive_limit(limit),
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        return tuple(self._entry(row) for row in response.get("results") or ())

    def read_entry(self, *, ref: ResourceRef) -> MemoryEntry:
        if (
            ref.kind != "memory"
            or ref.fragment not in {"", self.space.space_id}
        ):
            raise RepositoryScopeError("reference does not belong to the bound workspace")
        row = self._store_entry(ref.resource_id, ref.revision)
        deleted = False
        try:
            self._store_entry(ref.resource_id)
        except RepositoryNotFoundError:
            try:
                self._store_entry(ref.resource_id, ref.revision + 1)
            except RepositoryNotFoundError:
                deleted = True
        return self._entry(row, deleted=deleted)

    def read_current_entry(self, *, entry_id: str) -> MemoryEntry:
        return self._entry(self._store_entry(entry_id))

    def compare_and_swap(
        self,
        *,
        entry: MemoryEntry,
        expected_revision: int | None,
        operation: OperationRef,
    ) -> MemoryEntry:
        if entry.space_id != self.space.space_id:
            raise RepositoryScopeError("entry belongs to another workspace")
        if entry.path.rsplit("/", 1)[-1] != entry.name:
            raise WorkspaceRepositoryError("entry name must match the virtual path")
        required_revision = 1 if expected_revision is None else expected_revision + 1
        if entry.revision != required_revision:
            raise RepositoryConflictError("entry revision must advance exactly once")
        source_event_id = self._source_event_id(entry)
        content, media_type, link_url = self._entry_content(entry)
        host_kind = (
            "folder"
            if entry.kind is MemoryEntryKind.FOLDER
            else "link"
            if entry.kind is MemoryEntryKind.LINK
            else "file"
        )
        if expected_revision is None:
            expected_space_revision = self._current_space_revision()
            try:
                prior = self._store.get_entry(
                    owner_chat_id=self._owner_chat_id,
                    space_id=self.space.space_id,
                    entry_id=entry.entry_id,
                    revision=1,
                    allow_long_term=self._allow_long_term,
                    namespace=self._namespace,
                )
            except MemoryV2Error as exc:
                if exc.code not in _NOT_FOUND_CODES:
                    _workspace_failure(exc)
            else:
                expected_space_revision = int(prior["space_revision"]) - 1
            try:
                response = self._store.create_entry(
                    owner_chat_id=self._owner_chat_id,
                    space_id=self.space.space_id,
                    entry_id=entry.entry_id,
                    path=entry.path,
                    kind=host_kind,
                    expected_space_revision=expected_space_revision,
                    operation_id=operation.operation_id,
                    operation_payload_hash=operation.payload_sha256,
                    description=entry.description,
                    mime_type=media_type,
                    content=content,
                    link_url=link_url,
                    source_event_id=source_event_id,
                    created_by="unchain_context_v2",
                    allow_long_term=self._allow_long_term,
                    namespace=self._namespace,
                )
            except (MemoryV2Error, TypeError) as exc:
                if isinstance(exc, MemoryV2Error):
                    _workspace_failure(exc)
                raise
            self._space = MemorySpace(
                self.space.space_id,
                self.space.namespace,
                self.space.name,
                self.space.description,
                int(response["space_revision"]),
            )
            return self._entry(response)

        self._store_entry(entry.entry_id, expected_revision)
        expected_space_revision = self._current_space_revision()
        try:
            resulting_revision = self._store_entry(entry.entry_id, entry.revision)
        except RepositoryNotFoundError:
            pass
        else:
            expected_space_revision = int(resulting_revision["space_revision"]) - 1
        if entry.deleted:
            try:
                response = self._store.delete_entry(
                    owner_chat_id=self._owner_chat_id,
                    space_id=self.space.space_id,
                    entry_id=entry.entry_id,
                    expected_revision=expected_revision,
                    expected_space_revision=expected_space_revision,
                    operation_id=operation.operation_id,
                    operation_payload_hash=operation.payload_sha256,
                    allow_long_term=self._allow_long_term,
                    namespace=self._namespace,
                )
            except MemoryV2Error as exc:
                _workspace_failure(exc)
            self._space = MemorySpace(
                self.space.space_id,
                self.space.namespace,
                self.space.name,
                self.space.description,
                int(response["space_revision"]),
            )
            tombstone = self._store_entry(entry.entry_id, entry.revision)
            return self._entry(tombstone, deleted=True)
        try:
            response = self._store.update_entry(
                owner_chat_id=self._owner_chat_id,
                space_id=self.space.space_id,
                entry_id=entry.entry_id,
                expected_revision=expected_revision,
                expected_space_revision=expected_space_revision,
                operation_id=operation.operation_id,
                operation_payload_hash=operation.payload_sha256,
                path=entry.path,
                description=entry.description,
                mime_type=media_type,
                content=content,
                link_url=link_url,
                source_event_id=source_event_id,
                created_by="unchain_context_v2",
                allow_long_term=self._allow_long_term,
                namespace=self._namespace,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        self._space = MemorySpace(
            self.space.space_id,
            self.space.namespace,
            self.space.name,
            self.space.description,
            int(response["space_revision"]),
        )
        return self._entry(response)


class PupuContextMemoryV2Repository:
    """Host-only scope resolver for Unchain's bound Context/Memory ports."""

    def __init__(self, store: MemoryV2Store) -> None:
        if not isinstance(store, MemoryV2Store):
            raise TypeError("store must be a MemoryV2Store")
        self._store = store

    def bind_execution(self, scope: PupuExecutionScope) -> PupuExecutionCapabilities:
        if not isinstance(scope, PupuExecutionScope):
            raise TypeError("scope must be a PupuExecutionScope")
        try:
            head = self._store.get_session_head(
                owner_chat_id=scope.owner_chat_id,
                session_id=scope.session_id,
            )
        except MemoryV2Error as exc:
            _context_failure(exc)
        if head.get("current_generation_id") != scope.generation_id:
            raise ContextScopeError("generation is not current for the bound execution")
        return PupuExecutionCapabilities(
            journal=PupuExecutionJournal(self._store, scope),
            artifacts=PupuArtifactRepository(self._store, scope),
            checkpoints=PupuCheckpointRepository(self._store, scope),
            context_builds=PupuContextBuildRepository(self._store, scope),
        )

    def ensure_chat_workspace(
        self,
        *,
        owner_chat_id: str,
        name: str,
        description: str,
        operation: OperationRef,
    ) -> PupuMemoryWorkspaceRepository:
        owner = _identifier(owner_chat_id, "owner_chat_id", owner=True)
        try:
            row = self._store.ensure_space(
                scope_kind="chat",
                scope_key=owner,
                owner_chat_id=owner,
                name=name,
                description=description,
                operation_id=operation.operation_id,
                operation_payload_hash=operation.payload_sha256,
            )
        except MemoryV2Error as exc:
            _workspace_failure(exc)
        space = MemorySpace(
            space_id=str(row["space_id"]),
            namespace="chat",
            name=str(row["name"]),
            description=str(row.get("description") or ""),
            revision=int(row["revision"]),
        )
        return PupuMemoryWorkspaceRepository(
            self._store,
            owner_chat_id=owner,
            space=space,
        )


__all__ = [
    "PupuArtifactRepository",
    "PupuCheckpointRepository",
    "PupuContextBuildRepository",
    "PupuContextMemoryV2Repository",
    "PupuExecutionCapabilities",
    "PupuExecutionJournal",
    "PupuExecutionScope",
    "PupuMemoryWorkspaceRepository",
    "PupuPinnedTaskStateRepository",
    "PupuRefCodec",
]
