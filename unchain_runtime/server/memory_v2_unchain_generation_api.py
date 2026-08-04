"""Cold-open PuPu's generation mutation API over Unchain's atomic service.

PuPu owns only the host boundary in this module: sticky admission, exact chat
scope, replacement-history sanitation, route reason mapping, and response
presentation.  The journal, generation lifecycle, operation receipt, durable
preflight, and compare-and-swap remain inside Unchain's single SQLite
transaction.

This boundary intentionally requires an initial generation already created by
the atomic service.  It does not adopt the older split lifecycle + legacy
bootstrap state.  Production admission must remain gated until that bootstrap
cutover is complete; incompatible state fails closed during cold-open.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from memory_v2_sanitizer import SanitizerError, sanitize_text
from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_admission_adapter import (
    PupuUnchainAdmissionAuthority,
    PupuUnchainAdmissionError,
)
from memory_v2_unchain_atomic_bootstrap import (
    ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
)
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_generation_rebase_v2 import (
    GenerationRebaseConflict,
    GenerationRebaseIntent,
    GenerationRebaseKind,
    GenerationRebasePreflight,
    GenerationRebasePreflightBlocked,
    GenerationRebaseRequest,
    GenerationRebaseUnavailable,
    GenerationSnapshotMessage,
    SQLiteGenerationRebaseV2Service,
    build_generation_rebase_operation,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
_FILE_URL_RE = re.compile(r"\bfile://", re.IGNORECASE)
_MAX_HISTORY_MESSAGES = 10_000
_MAX_HISTORY_BYTES = 32 * 1024 * 1024
_REBASE_REASONS = {
    "resend": GenerationRebaseKind.RETRY,
    "edit": GenerationRebaseKind.EDIT,
    "delete": GenerationRebaseKind.EDIT,
}


class MemoryV2UnchainGenerationAPIError(RuntimeError):
    """Stable host error suitable for later route translation."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 409,
        retryable: bool = False,
        expected_revision: int | None = None,
        actual_revision: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = str(code or "context_v2_generation_api_failed")
        self.status_code = int(status_code)
        self.retryable = bool(retryable)
        self.expected_revision = expected_revision
        self.actual_revision = actual_revision


def _required_identifier(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_invalid_request",
            f"{field_name} must be text",
            status_code=400,
        )
    normalized = unicodedata.normalize("NFC", value.strip())
    if _IDENTIFIER_RE.fullmatch(normalized) is None:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_invalid_request",
            f"{field_name} is invalid",
            status_code=400,
        )
    return normalized


def _canonical_bytes(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_invalid_history",
            "replacement history is not canonical JSON",
            status_code=400,
        ) from error


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _stable_identifier(prefix: str, value: Mapping[str, Any]) -> str:
    return f"{prefix}-{_digest(dict(value))}"


def _map_rebase_reason(reason: object) -> tuple[str, GenerationRebaseKind]:
    if not isinstance(reason, str):
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_invalid_reason",
            "turn mutation reason must be text",
            status_code=400,
        )
    normalized = unicodedata.normalize("NFC", reason.strip()).casefold()
    kind = _REBASE_REASONS.get(normalized)
    if kind is None:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_invalid_reason",
            "turn mutation reason is unsupported",
            status_code=400,
        )
    return normalized, kind


def _sanitize_replacement_history(
    replacement_history: object,
) -> tuple[dict[str, str], ...]:
    if isinstance(replacement_history, (str, bytes, bytearray)) or not isinstance(
        replacement_history,
        Sequence,
    ):
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_invalid_history",
            "replacement_history must be an array",
            status_code=400,
        )
    if len(replacement_history) > _MAX_HISTORY_MESSAGES:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_history_too_large",
            "replacement_history exceeds the message limit",
            status_code=413,
        )
    sanitized: list[dict[str, str]] = []
    for index, raw_message in enumerate(replacement_history):
        if not isinstance(raw_message, Mapping):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_history",
                "replacement_history messages must be objects",
                status_code=400,
            )
        message = dict(raw_message)
        if set(message) != {"role", "content"}:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_history",
                "replacement_history messages may contain only role and content",
                status_code=400,
            )
        role = message["role"]
        if not isinstance(role, str):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_history",
                f"replacement_history[{index}].role is invalid",
                status_code=400,
            )
        normalized_role = unicodedata.normalize("NFC", role.strip()).casefold()
        if normalized_role not in {"user", "assistant"}:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_history",
                "replacement_history may contain only user and assistant messages",
                status_code=400,
            )
        content = message["content"]
        if not isinstance(content, str):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_history",
                "replacement_history content must be text",
                status_code=400,
            )
        normalized_content = unicodedata.normalize("NFC", content)
        if (
            not normalized_content.strip()
            or "\x00" in normalized_content
            or _FILE_URL_RE.search(normalized_content)
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_history",
                "replacement_history content is empty or contains a host file URL",
                status_code=400,
            )
        try:
            safe_content = sanitize_text(normalized_content)
        except SanitizerError as error:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_redaction_failed",
                "replacement_history could not be sanitized",
                status_code=500,
            ) from error
        if not safe_content.strip() or "\x00" in safe_content:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_history",
                "replacement_history content is empty after sanitation",
                status_code=400,
            )
        sanitized.append({"role": normalized_role, "content": safe_content})
    if len(_canonical_bytes(sanitized)) > _MAX_HISTORY_BYTES:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_history_too_large",
            "replacement_history exceeds the byte limit",
            status_code=413,
        )
    return tuple(sanitized)


def _event_ref(event_id: str) -> str:
    return f"pupu://context/event/{event_id}"


def _provenance_identifier(
    provenance: Mapping[str, Any],
    field_name: str,
) -> str:
    try:
        return _required_identifier(provenance.get(field_name), field_name)
    except MemoryV2UnchainGenerationAPIError as error:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_bootstrap_provenance_invalid",
            "sticky bootstrap provenance is invalid",
        ) from error


@dataclass(frozen=True, slots=True)
class MemoryV2UnchainGenerationAPI:
    """Route-compatible host presentation bound to one durable chat."""

    owner_chat_id: str
    session_id: str
    execution_id: str
    _service: SQLiteGenerationRebaseV2Service = field(repr=False)
    _admission: Mapping[str, Any] = field(repr=False)

    def __post_init__(self) -> None:
        if not isinstance(self._service, SQLiteGenerationRebaseV2Service):
            raise TypeError("service must be a SQLiteGenerationRebaseV2Service")
        if not isinstance(self._admission, Mapping):
            raise TypeError("admission must be a mapping")
        _required_identifier(self.owner_chat_id, "owner_chat_id")
        _required_identifier(self.session_id, "session_id")
        _required_identifier(self.execution_id, "execution_id")

    def _require_scope(self, *, owner_chat_id: str, session_id: str) -> None:
        owner = _required_identifier(owner_chat_id, "owner_chat_id")
        session = _required_identifier(session_id, "session_id")
        if owner != self.owner_chat_id:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_owner_mismatch",
                "requested owner is outside the durable generation scope",
                status_code=404,
            )
        if session != self.session_id:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_session_mismatch",
                "requested session is outside the durable generation scope",
                status_code=404,
            )

    def _current_head(self):
        try:
            head = self._service.current(
                owner_chat_id=self.owner_chat_id,
                execution_id=self.execution_id,
                session_id=self.session_id,
            )
        except GenerationRebaseConflict as error:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_generation_conflict",
                "durable generation scope changed",
                retryable=True,
            ) from error
        except GenerationRebaseUnavailable as error:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_generation_unavailable",
                "durable generation head is unavailable",
                status_code=503,
                retryable=True,
            ) from error
        if head is None:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_not_found",
                "durable generation head was not found",
                status_code=404,
            )
        return head

    def get_session_head(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
    ) -> dict[str, Any]:
        self._require_scope(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
        )
        head = self._current_head()
        return {
            "owner_chat_id": self.owner_chat_id,
            "session_id": self.session_id,
            "admission_mode": self._admission["effective_mode"],
            "target_mode": self._admission["target_mode"],
            "bootstrap_status": self._admission["bootstrap_status"],
            "bootstrap_error_code": self._admission["bootstrap_error_code"],
            "v2_bootstrapped": self._admission["v2_bootstrapped"],
            "sticky": True,
            "session_exists": True,
            "mutation_ready": bool(
                self._admission["target_mode"] == "active"
                and self._admission["effective_mode"] == "active"
            ),
            "current_generation_id": head.current_generation_id,
            "current_generation_no": head.revision,
            "session_revision": head.revision,
        }

    def _translate_rebase_error(
        self,
        error: Exception,
        *,
        expected_revision: int,
    ) -> MemoryV2UnchainGenerationAPIError:
        if isinstance(error, GenerationRebasePreflightBlocked):
            return MemoryV2UnchainGenerationAPIError(
                "context_v2_rebase_in_progress",
                "unfinished durable state blocks generation rebase",
                retryable=True,
            )
        if isinstance(error, GenerationRebaseConflict):
            message = str(error).casefold()
            if "operation" in message or "payload" in message:
                return MemoryV2UnchainGenerationAPIError(
                    "context_v2_operation_conflict",
                    "generation operation identity conflicts with durable state",
                )
            actual_revision = None
            try:
                actual_revision = self._current_head().revision
            except MemoryV2UnchainGenerationAPIError:
                pass
            if "revision" in message:
                return MemoryV2UnchainGenerationAPIError(
                    "context_v2_revision_conflict",
                    "Context V2 session revision conflict",
                    retryable=True,
                    expected_revision=expected_revision,
                    actual_revision=actual_revision,
                )
            return MemoryV2UnchainGenerationAPIError(
                "context_v2_generation_conflict",
                "Context V2 source generation is no longer current",
                retryable=True,
                expected_revision=expected_revision,
                actual_revision=actual_revision,
            )
        return MemoryV2UnchainGenerationAPIError(
            "context_v2_rebase_unavailable",
            "durable generation rebase is unavailable",
            status_code=503,
            retryable=True,
        )

    def rebase_session(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        replacement_history: Sequence[Mapping[str, Any]],
        source_generation_id: str,
        expected_session_revision: int,
        operation_id: str,
        reason: str,
    ) -> dict[str, Any]:
        self._require_scope(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
        )
        source_generation = _required_identifier(
            source_generation_id,
            "source_generation_id",
        )
        operation = _required_identifier(operation_id, "operation_id")
        if (
            isinstance(expected_session_revision, bool)
            or not isinstance(expected_session_revision, int)
            or expected_session_revision < 1
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_invalid_request",
                "expected_session_revision must be a positive integer",
                status_code=400,
            )
        safe_reason, kind = _map_rebase_reason(reason)
        safe_history = _sanitize_replacement_history(replacement_history)
        replacement_hash = _digest(safe_history)
        semantic = {
            "schema": "pupu.unchain-generation-rebase.v1",
            "owner_chat_id": self.owner_chat_id,
            "session_id": self.session_id,
            "execution_id": self.execution_id,
            "source_generation_id": source_generation,
            "expected_session_revision": expected_session_revision,
            "operation_id": operation,
            "reason": safe_reason,
            "kind": kind.value,
            "replacement_history_hash": replacement_hash,
            "replacement_message_count": len(safe_history),
        }
        generation_id = _stable_identifier("pupu-generation", semantic)
        attempt_id = _stable_identifier("pupu-rebase-attempt", semantic)
        source_revision = _stable_identifier("pupu-source-revision", semantic)
        messages = tuple(
            GenerationSnapshotMessage(
                message_id=_stable_identifier(
                    "pupu-message",
                    {
                        "semantic_sha256": _digest(semantic),
                        "index": index,
                        **message,
                    },
                ),
                role=message["role"],
                content=message["content"],
            )
            for index, message in enumerate(safe_history)
        )
        intent = GenerationRebaseIntent(
            owner_chat_id=self.owner_chat_id,
            session_id=self.session_id,
            execution_id=self.execution_id,
            generation_id=generation_id,
            attempt_id=attempt_id,
            kind=kind,
            previous_generation_id=source_generation,
            expected_head_revision=expected_session_revision,
            source_revision=source_revision,
            messages=messages,
            preflight=GenerationRebasePreflight(
                proof_id=_stable_identifier("pupu-rebase-preflight", semantic),
                host_snapshot_sanitized=True,
            ),
        )
        request = GenerationRebaseRequest(
            intent=intent,
            operation=build_generation_rebase_operation(
                operation_id=operation,
                intent=intent,
            ),
        )
        try:
            receipt = self._service.rebase(request)
        except (GenerationRebaseConflict, GenerationRebaseUnavailable) as error:
            raise self._translate_rebase_error(
                error,
                expected_revision=expected_session_revision,
            ) from error
        if (
            receipt.owner_chat_id != self.owner_chat_id
            or receipt.session_id != self.session_id
            or receipt.execution_id != self.execution_id
            or receipt.generation_id != generation_id
            or receipt.attempt_id != attempt_id
            or receipt.previous_generation_id != source_generation
            or receipt.source_revision != source_revision
            or receipt.kind is not kind
            or receipt.message_count != len(messages)
            or receipt.operation != request.operation
            or receipt.head_revision != expected_session_revision + 1
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_rebase_receipt_mismatch",
                "durable generation rebase receipt changed scope",
                status_code=503,
            )
        first_ref = _event_ref(receipt.first_cursor.event_id)
        last_ref = _event_ref(receipt.last_cursor.event_id)
        event_refs = [first_ref] if first_ref == last_ref else [first_ref, last_ref]
        return {
            "owner_chat_id": self.owner_chat_id,
            "session_id": self.session_id,
            "attempt_id": receipt.attempt_id,
            "generation_id": receipt.generation_id,
            "generation_no": receipt.head_revision,
            "source_generation_id": source_generation,
            "source_generation_ref": (
                f"pupu://context/generation/{source_generation}"
            ),
            "session_revision": receipt.head_revision,
            "event_count": (
                receipt.last_cursor.store_seq
                - receipt.first_cursor.store_seq
                + 1
            ),
            "message_event_count": receipt.message_count,
            "event_refs": event_refs,
            "turn_mutation_event_ref": first_ref,
            "capture_quality": "partial",
            "capture_status": "legacy_partial",
            "journal_digest": receipt.manifest_sha256,
            "pinned_task_state_revision": (
                receipt.task_state.revision if receipt.task_state is not None else 0
            ),
            "replacement_history_hash": replacement_hash,
            "reason": safe_reason,
            "replayed": receipt.duplicate,
        }


def open_pupu_unchain_generation_api(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> MemoryV2UnchainGenerationAPI:
    """Cold-open the verified active generation scope for one sticky chat."""

    owner = _required_identifier(owner_chat_id, "owner_chat_id")
    try:
        store_admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if (
            store_admission.owner != STORE_OWNER_UNCHAIN
            or store_admission.database_state != STORE_OWNER_UNCHAIN
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_generation_store_unavailable",
                "official Unchain generation storage is unavailable",
                status_code=503,
            )
        if is_chat_deleted(
            database_path=store_admission.database_path,
            owner_chat_id=owner,
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_chat_deleted",
                "a durably deleted chat cannot open generation mutation",
                status_code=410,
            )
        object_directory = store_admission.root_dir / "objects"
        if (
            not object_directory.is_dir()
            or object_directory.is_symlink()
            or store_admission.database_path.is_symlink()
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_generation_store_unavailable",
                "official Unchain generation storage scope is invalid",
                status_code=503,
            )
        authority = PupuUnchainAdmissionAuthority(
            owner_chat_id=owner,
            database_path=store_admission.database_path,
            object_directory=object_directory,
        )
        admission = authority.get_chat_admission(owner_chat_id=owner)
        if admission is None:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_admission_missing",
                "sticky active admission was not found",
                status_code=404,
            )
        if (
            admission.get("owner_chat_id") != owner
            or admission.get("target_mode") not in {"active", "shadow"}
            or admission.get("effective_mode") not in {"active", "shadow"}
            or admission.get("bootstrap_status") != "complete"
            or admission.get("v2_bootstrapped") is not True
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_mutation_not_ready",
                "sticky chat admission is not mutation-ready",
            )
        provenance = admission.get("bootstrap_provenance")
        if (
            not isinstance(provenance, Mapping)
            or provenance.get("schema")
            != ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_bootstrap_provenance_invalid",
                "sticky atomic bootstrap provenance is unavailable",
            )
        if provenance.get("owner_chat_id") != owner:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_bootstrap_provenance_invalid",
                "sticky bootstrap owner changed",
            )
        session_id = _provenance_identifier(provenance, "session_id")
        execution_id = _provenance_identifier(provenance, "execution_id")
        generation_id = _provenance_identifier(provenance, "generation_id")
        bootstrap_attempt_id = _provenance_identifier(
            provenance,
            "bootstrap_attempt_id",
        )
        _provenance_identifier(provenance, "runtime_attempt_id")
        source_revision = _provenance_identifier(provenance, "source_revision")
        message_count = provenance.get("message_count")
        atomic_bootstrap = provenance.get("atomic_bootstrap")
        if (
            admission.get("first_session_id") != session_id
            or isinstance(message_count, bool)
            or not isinstance(message_count, int)
            or not 0 <= message_count <= _MAX_HISTORY_MESSAGES
            or not isinstance(atomic_bootstrap, Mapping)
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_bootstrap_provenance_invalid",
                "sticky bootstrap scope is inconsistent",
            )
        context_store = SQLiteContextV2Store(
            database_path=store_admission.database_path,
            object_directory=object_directory,
        )
        service = SQLiteGenerationRebaseV2Service(context_store)
        bootstrap_receipt = service.receipt_for_generation(
            owner_chat_id=owner,
            execution_id=execution_id,
            session_id=session_id,
            generation_id=generation_id,
        )
        if (
            bootstrap_receipt is None
            or bootstrap_receipt.kind is not GenerationRebaseKind.CREATE
            or bootstrap_receipt.previous_generation_id
            or bootstrap_receipt.head_revision != 1
            or bootstrap_receipt.attempt_id != bootstrap_attempt_id
            or bootstrap_receipt.source_revision != source_revision
            or bootstrap_receipt.message_count != message_count
            or atomic_bootstrap.get("manifest_sha256")
            != bootstrap_receipt.manifest_sha256
            or atomic_bootstrap.get("message_count")
            != bootstrap_receipt.message_count
            or atomic_bootstrap.get("operation_id")
            != bootstrap_receipt.operation.operation_id
            or atomic_bootstrap.get("payload_sha256")
            != bootstrap_receipt.operation.payload_sha256
            or atomic_bootstrap.get("first_cursor")
            != bootstrap_receipt.first_cursor.to_dict()
            or atomic_bootstrap.get("last_cursor")
            != bootstrap_receipt.last_cursor.to_dict()
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_bootstrap_provenance_invalid",
                "sticky atomic bootstrap receipt does not match canonical history",
            )
        current = service.current(
            owner_chat_id=owner,
            execution_id=execution_id,
            session_id=session_id,
        )
        if current is None:
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_not_found",
                "durable generation head was not found",
                status_code=404,
            )
        if (
            current.owner_chat_id != owner
            or current.session_id != session_id
            or current.execution_id != execution_id
            or current.revision < bootstrap_receipt.head_revision
        ):
            raise MemoryV2UnchainGenerationAPIError(
                "context_v2_bootstrap_provenance_invalid",
                "current generation head is outside the atomic bootstrap scope",
            )
        return MemoryV2UnchainGenerationAPI(
            owner_chat_id=owner,
            session_id=session_id,
            execution_id=execution_id,
            _service=service,
            _admission=dict(admission),
        )
    except MemoryV2UnchainGenerationAPIError:
        raise
    except ContextV2StoreBoundaryError as error:
        raise MemoryV2UnchainGenerationAPIError(
            error.code,
            "Context V2 store ownership could not be verified",
            status_code=503,
        ) from error
    except PupuUnchainAdmissionError as error:
        raise MemoryV2UnchainGenerationAPIError(
            error.code,
            "sticky active admission could not be verified",
        ) from error
    except ChatDeletionError as error:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_deletion_state_unavailable",
            "chat deletion state could not be verified",
            status_code=503,
        ) from error
    except (GenerationRebaseConflict, GenerationRebaseUnavailable) as error:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_atomic_generation_bootstrap_required",
            "an atomic generation bootstrap is required before mutation",
            status_code=503,
        ) from error
    except (OSError, TypeError, ValueError) as error:
        raise MemoryV2UnchainGenerationAPIError(
            "context_v2_generation_open_failed",
            "generation mutation scope could not be opened",
            status_code=503,
        ) from error


__all__ = [
    "MemoryV2UnchainGenerationAPI",
    "MemoryV2UnchainGenerationAPIError",
    "open_pupu_unchain_generation_api",
]
