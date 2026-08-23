"""PuPu host adapter for Unchain's atomic initial-generation bootstrap.

PuPu owns only the sanitized legacy chat snapshot and sticky-admission bridge.
Unchain owns the single transaction that writes the canonical journal,
generation lifecycle, manifest, operation receipt, and bootstrap-attempt
binding.  The synthetic bootstrap attempt is intentionally distinct from the
runtime attempt that will later execute the model/tool loop.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_admission_adapter import (
    PupuUnchainAdmissionAuthority,
    PupuUnchainAdmissionError,
)
from memory_v2_unchain_bootstrap_adapter import (
    PupuUnchainLegacyBootstrapError,
    derive_pupu_legacy_source_revision,
    normalize_pupu_legacy_history,
)
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_generation_rebase_v2 import (
    GenerationRebaseConflict,
    GenerationRebaseHead,
    GenerationRebaseIntent,
    GenerationRebaseKind,
    GenerationRebasePreflight,
    GenerationRebasePreflightBlocked,
    GenerationRebaseReceipt,
    GenerationRebaseRequest,
    GenerationRebaseUnavailable,
    GenerationSnapshotMessage,
    SQLiteGenerationRebaseV2Service,
    build_generation_rebase_operation,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA = (
    "pupu.unchain-active-atomic-bootstrap.v2"
)
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
_HISTORY_STATES = frozenset({"empty", "imported"})


class PupuUnchainAtomicBootstrapError(RuntimeError):
    """The exact chat could not create or verify its canonical generation."""

    def __init__(self, code: str, message: str) -> None:
        self.code = str(code or "context_v2_atomic_bootstrap_failed")
        super().__init__(message)


def _identifier(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_input_invalid",
            f"{field_name} must be text",
        )
    normalized = unicodedata.normalize("NFC", value.strip())
    if _IDENTIFIER_RE.fullmatch(normalized) is None:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_input_invalid",
            f"{field_name} is invalid",
        )
    return normalized


def _canonical_bytes(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_history_invalid",
            "atomic bootstrap input is not canonical JSON",
        ) from error


def _exact_bool(value: object, field_name: str) -> bool:
    if type(value) is not bool:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_input_invalid",
            f"{field_name} must be an exact boolean",
        )
    return value


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _stable_id(prefix: str, value: Mapping[str, Any]) -> str:
    return f"{prefix}-{_digest(dict(value))}"


def _snapshot(
    history: Sequence[Mapping[str, Any]],
) -> tuple[dict[str, Any], ...]:
    if isinstance(history, (str, bytes, bytearray)) or not isinstance(
        history,
        Sequence,
    ):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_history_invalid",
            "legacy history must be a host-sanitized message sequence",
        )
    if any(not isinstance(item, Mapping) for item in history):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_history_invalid",
            "legacy history must contain message objects",
        )
    try:
        frozen = tuple(copy.deepcopy(dict(item)) for item in history)
    except Exception as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_history_invalid",
            "legacy history could not be frozen",
        ) from error
    _canonical_bytes(frozen)
    return frozen


def _receipt_identity(receipt: GenerationRebaseReceipt) -> tuple[Any, ...]:
    return (
        receipt.owner_chat_id,
        receipt.session_id,
        receipt.execution_id,
        receipt.generation_id,
        receipt.attempt_id,
        receipt.kind,
        receipt.previous_generation_id,
        receipt.source_revision,
        receipt.head_revision,
        receipt.manifest_sha256,
        receipt.message_count,
        receipt.first_cursor,
        receipt.last_cursor,
        receipt.operation,
        receipt.lifecycle_operation,
        receipt.attempt_binding_operation,
        receipt.task_state,
    )


@dataclass(frozen=True, slots=True)
class PupuUnchainAtomicBootstrap:
    """Verified initial receipt plus the latest complete generation head."""

    database_path: Path
    object_directory: Path
    owner_chat_id: str
    session_id: str
    execution_id: str
    history_state: str
    capture_status: str
    bootstrap_receipt: GenerationRebaseReceipt = field(repr=False)
    current_head: GenerationRebaseHead

    def __post_init__(self) -> None:
        database = Path(self.database_path).expanduser().resolve()
        objects = Path(self.object_directory).expanduser().resolve()
        owner = _identifier(self.owner_chat_id, "owner_chat_id")
        session = _identifier(self.session_id, "session_id")
        execution = _identifier(self.execution_id, "execution_id")
        if database.name != "context_v2.sqlite3":
            raise ValueError("database_path must name context_v2.sqlite3")
        if objects != database.parent / "objects":
            raise ValueError("object_directory must be the sibling objects directory")
        if self.history_state not in _HISTORY_STATES:
            raise ValueError("history_state is invalid")
        expected_capture = (
            "empty_history" if self.history_state == "empty" else "legacy_partial"
        )
        if self.capture_status != expected_capture:
            raise ValueError("capture_status does not match history_state")
        receipt = self.bootstrap_receipt
        head = self.current_head
        if not isinstance(receipt, GenerationRebaseReceipt):
            raise TypeError("bootstrap_receipt must be a GenerationRebaseReceipt")
        if not isinstance(head, GenerationRebaseHead):
            raise TypeError("current_head must be a GenerationRebaseHead")
        if (
            receipt.owner_chat_id != owner
            or receipt.session_id != session
            or receipt.execution_id != execution
            or receipt.kind is not GenerationRebaseKind.CREATE
            or receipt.previous_generation_id
            or receipt.head_revision != 1
            or receipt.message_count < 0
            or (receipt.message_count == 0) != (self.history_state == "empty")
            or head.owner_chat_id != owner
            or head.session_id != session
            or head.execution_id != execution
            or head.revision < receipt.head_revision
        ):
            raise ValueError("atomic bootstrap receipt scope is inconsistent")
        object.__setattr__(self, "database_path", database)
        object.__setattr__(self, "object_directory", objects)
        object.__setattr__(self, "owner_chat_id", owner)
        object.__setattr__(self, "session_id", session)
        object.__setattr__(self, "execution_id", execution)

    @property
    def generation_id(self) -> str:
        return self.bootstrap_receipt.generation_id

    @property
    def bootstrap_attempt_id(self) -> str:
        return self.bootstrap_receipt.attempt_id

    @property
    def source_revision(self) -> str:
        return self.bootstrap_receipt.source_revision

    @property
    def message_count(self) -> int:
        return self.bootstrap_receipt.message_count

    def provenance(self, *, runtime_attempt_id: str) -> dict[str, Any]:
        runtime_attempt = _identifier(runtime_attempt_id, "runtime_attempt_id")
        receipt = self.bootstrap_receipt
        return {
            "schema": ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
            "owner_chat_id": self.owner_chat_id,
            "session_id": self.session_id,
            "execution_id": self.execution_id,
            "generation_id": receipt.generation_id,
            "bootstrap_attempt_id": receipt.attempt_id,
            "runtime_attempt_id": runtime_attempt,
            "source_revision": receipt.source_revision,
            "history_state": self.history_state,
            "message_count": receipt.message_count,
            "capture_status": self.capture_status,
            "preflight": {"host_snapshot_sanitized": True},
            "atomic_bootstrap": {
                "manifest_sha256": receipt.manifest_sha256,
                "message_count": receipt.message_count,
                "operation_id": receipt.operation.operation_id,
                "payload_sha256": receipt.operation.payload_sha256,
                "first_cursor": receipt.first_cursor.to_dict(),
                "last_cursor": receipt.last_cursor.to_dict(),
            },
        }


def _store_scope(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> tuple[SQLiteContextV2Store, PupuUnchainAdmissionAuthority]:
    owner = _identifier(owner_chat_id, "owner_chat_id")
    try:
        admitted = admit_context_v2_store_owner(
            root_dir=Path(root_dir).expanduser().resolve(),
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        objects = admitted.root_dir / "objects"
        if (
            admitted.owner != STORE_OWNER_UNCHAIN
            or admitted.database_state not in {"absent", STORE_OWNER_UNCHAIN}
            or admitted.database_path.is_symlink()
            or objects.is_symlink()
        ):
            raise PupuUnchainAtomicBootstrapError(
                "context_v2_atomic_bootstrap_store_unavailable",
                "official Unchain generation storage is unavailable",
            )
        if is_chat_deleted(
            database_path=admitted.database_path,
            owner_chat_id=owner,
        ):
            raise PupuUnchainAtomicBootstrapError(
                "context_v2_chat_deleted",
                "a durably deleted chat cannot be bootstrapped",
            )
        store = SQLiteContextV2Store(
            database_path=admitted.database_path,
            object_directory=objects,
        )
        authority = PupuUnchainAdmissionAuthority(
            owner_chat_id=owner,
            database_path=admitted.database_path,
            object_directory=objects,
        )
        return store, authority
    except PupuUnchainAtomicBootstrapError:
        raise
    except ContextV2StoreBoundaryError as error:
        raise PupuUnchainAtomicBootstrapError(
            error.code,
            "Context V2 store ownership could not be verified",
        ) from error
    except (ChatDeletionError, OSError, RuntimeError, TypeError, ValueError) as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_store_unavailable",
            "official Unchain generation storage could not be opened",
        ) from error


def _from_provenance(
    *,
    store: SQLiteContextV2Store,
    owner_chat_id: str,
    session_id: str,
    execution_id: str,
    provenance: Mapping[str, Any],
) -> PupuUnchainAtomicBootstrap:
    owner = _identifier(owner_chat_id, "owner_chat_id")
    session = _identifier(session_id, "session_id")
    execution = _identifier(execution_id, "execution_id")
    if (
        provenance.get("schema") != ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA
        or provenance.get("owner_chat_id") != owner
        or provenance.get("session_id") != session
        or provenance.get("execution_id") != execution
    ):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_provenance_invalid",
            "sticky atomic bootstrap scope is invalid",
        )
    generation_id = _identifier(provenance.get("generation_id"), "generation_id")
    bootstrap_attempt_id = _identifier(
        provenance.get("bootstrap_attempt_id"),
        "bootstrap_attempt_id",
    )
    source_revision = _identifier(
        provenance.get("source_revision"),
        "source_revision",
    )
    history_state = str(provenance.get("history_state") or "")
    capture_status = str(provenance.get("capture_status") or "")
    message_count = provenance.get("message_count")
    atomic = provenance.get("atomic_bootstrap")
    if (
        history_state not in _HISTORY_STATES
        or capture_status
        != ("empty_history" if history_state == "empty" else "legacy_partial")
        or isinstance(message_count, bool)
        or not isinstance(message_count, int)
        or message_count < 0
        or not isinstance(atomic, Mapping)
    ):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_provenance_invalid",
            "sticky atomic bootstrap metadata is invalid",
        )
    service = SQLiteGenerationRebaseV2Service(store)
    try:
        receipt = service.receipt_for_generation(
            owner_chat_id=owner,
            execution_id=execution,
            session_id=session,
            generation_id=generation_id,
        )
        head = service.current(
            owner_chat_id=owner,
            execution_id=execution,
            session_id=session,
        )
    except (GenerationRebaseConflict, GenerationRebaseUnavailable) as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_unavailable",
            "canonical generation state could not be verified",
        ) from error
    if (
        receipt is None
        or head is None
        or receipt.attempt_id != bootstrap_attempt_id
        or receipt.source_revision != source_revision
        or receipt.message_count != message_count
        or atomic.get("manifest_sha256") != receipt.manifest_sha256
        or atomic.get("message_count") != receipt.message_count
        or atomic.get("operation_id") != receipt.operation.operation_id
        or atomic.get("payload_sha256") != receipt.operation.payload_sha256
    ):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_provenance_invalid",
            "sticky atomic bootstrap receipt changed",
        )
    return PupuUnchainAtomicBootstrap(
        database_path=store.database_path,
        object_directory=store.object_directory,
        owner_chat_id=owner,
        session_id=session,
        execution_id=execution,
        history_state=history_state,
        capture_status=capture_status,
        bootstrap_receipt=receipt,
        current_head=head,
    )


def prepare_pupu_unchain_atomic_bootstrap(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
    session_id: str,
    execution_id: str,
    history: Sequence[Mapping[str, Any]],
    no_unfinished_durable_checkpoint: bool,
    no_pending_interaction: bool,
) -> PupuUnchainAtomicBootstrap:
    """Create/replay the initial generation, or verify a sticky chat's receipt."""

    owner = _identifier(owner_chat_id, "owner_chat_id")
    session = _identifier(session_id, "session_id")
    execution = _identifier(execution_id, "execution_id")
    checkpoint_clear = _exact_bool(
        no_unfinished_durable_checkpoint,
        "no_unfinished_durable_checkpoint",
    )
    interaction_clear = _exact_bool(
        no_pending_interaction,
        "no_pending_interaction",
    )
    store, authority = _store_scope(root_dir=root_dir, owner_chat_id=owner)
    try:
        admission = authority.get_chat_admission(owner_chat_id=owner)
    except PupuUnchainAdmissionError as error:
        raise PupuUnchainAtomicBootstrapError(
            error.code,
            "sticky chat admission could not be read",
        ) from error
    if admission is not None:
        if admission.get("first_session_id") != session:
            raise PupuUnchainAtomicBootstrapError(
                "context_v2_atomic_bootstrap_scope_mismatch",
                "sticky chat admission belongs to another session",
            )
        if admission.get("v2_bootstrapped") is True:
            provenance = admission.get("bootstrap_provenance")
            if not isinstance(provenance, Mapping):
                raise PupuUnchainAtomicBootstrapError(
                    "context_v2_atomic_bootstrap_provenance_invalid",
                    "sticky chat has no atomic bootstrap provenance",
                )
            return _from_provenance(
                store=store,
                owner_chat_id=owner,
                session_id=session,
                execution_id=execution,
                provenance=provenance,
            )

    if not checkpoint_clear or not interaction_clear:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_preflight_blocked",
            "unfinished legacy durable state blocks atomic bootstrap",
        )

    snapshot = _snapshot(history)
    try:
        normalized = (
            normalize_pupu_legacy_history(
                owner_chat_id=owner,
                history=snapshot,
            )
            if snapshot
            else ()
        )
        source_revision = derive_pupu_legacy_source_revision(
            owner_chat_id=owner,
            history=snapshot,
        )
    except PupuUnchainLegacyBootstrapError as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_history_invalid",
            "host-sanitized legacy history is invalid",
        ) from error
    messages = tuple(
        GenerationSnapshotMessage(
            message_id=item.message_id,
            role=item.role,
            content=item.content,
        )
        for item in normalized
    )
    semantic = {
        "schema": ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
        "owner_chat_id": owner,
        "session_id": session,
        "execution_id": execution,
        "source_revision": source_revision,
        "messages_sha256": _digest([item.to_dict() for item in messages]),
        "message_count": len(messages),
    }
    intent = GenerationRebaseIntent(
        owner_chat_id=owner,
        session_id=session,
        execution_id=execution,
        generation_id=_stable_id("pupu-bootstrap-generation", semantic),
        attempt_id=_stable_id("pupu-bootstrap-attempt", semantic),
        kind=GenerationRebaseKind.CREATE,
        previous_generation_id="",
        expected_head_revision=0,
        source_revision=source_revision,
        messages=messages,
        preflight=GenerationRebasePreflight(
            proof_id=_stable_id("pupu-bootstrap-preflight", semantic),
            host_snapshot_sanitized=True,
        ),
    )
    request = GenerationRebaseRequest(
        intent=intent,
        operation=build_generation_rebase_operation(
            operation_id=_stable_id("pupu-bootstrap-operation", semantic),
            intent=intent,
        ),
    )
    service = SQLiteGenerationRebaseV2Service(store)
    try:
        receipt = service.rebase(request)
        head = service.current(
            owner_chat_id=owner,
            execution_id=execution,
            session_id=session,
        )
    except GenerationRebasePreflightBlocked as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_preflight_blocked",
            "unfinished durable state blocks atomic bootstrap",
        ) from error
    except GenerationRebaseConflict as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_conflict",
            "atomic bootstrap conflicts with durable generation state",
        ) from error
    except GenerationRebaseUnavailable as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_unavailable",
            "atomic generation bootstrap is unavailable",
        ) from error
    if (
        head is None
        or receipt.owner_chat_id != owner
        or receipt.session_id != session
        or receipt.execution_id != execution
        or receipt.generation_id != intent.generation_id
        or receipt.attempt_id != intent.attempt_id
        or receipt.source_revision != source_revision
        or receipt.message_count != len(messages)
        or receipt.kind is not GenerationRebaseKind.CREATE
        or receipt.head_revision != 1
        or receipt.operation != request.operation
    ):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_receipt_mismatch",
            "atomic bootstrap receipt changed the host scope",
        )
    return PupuUnchainAtomicBootstrap(
        database_path=store.database_path,
        object_directory=store.object_directory,
        owner_chat_id=owner,
        session_id=session,
        execution_id=execution,
        history_state="imported" if messages else "empty",
        capture_status="legacy_partial" if messages else "empty_history",
        bootstrap_receipt=receipt,
        current_head=head,
    )


def pupu_unchain_sticky_active_required(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> bool:
    """Return the durable active obligation before rollout intent is applied."""

    owner = _identifier(owner_chat_id, "owner_chat_id")
    _, authority = _store_scope(root_dir=root_dir, owner_chat_id=owner)
    try:
        admission = authority.get_chat_admission(owner_chat_id=owner)
    except PupuUnchainAdmissionError as error:
        raise PupuUnchainAtomicBootstrapError(
            error.code,
            "sticky chat admission could not be read",
        ) from error
    if admission is None:
        return False
    target_mode = admission.get("target_mode")
    if target_mode != "active":
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_provenance_invalid",
            "persisted Unchain admission has an invalid target mode",
        )
    return True


def verify_pupu_unchain_atomic_bootstrap(
    *,
    bootstrap: PupuUnchainAtomicBootstrap,
    database_path: str | Path,
    object_directory: str | Path,
    owner_chat_id: str,
    session_id: str,
    execution_id: str,
) -> GenerationRebaseHead:
    """Re-read the receipt/head before an active factory may bind attempts."""

    if not isinstance(bootstrap, PupuUnchainAtomicBootstrap):
        raise TypeError("bootstrap must be a PupuUnchainAtomicBootstrap")
    database = Path(database_path).expanduser().resolve()
    objects = Path(object_directory).expanduser().resolve()
    expected_scope = (
        database,
        objects,
        _identifier(owner_chat_id, "owner_chat_id"),
        _identifier(session_id, "session_id"),
        _identifier(execution_id, "execution_id"),
    )
    if expected_scope != (
        bootstrap.database_path,
        bootstrap.object_directory,
        bootstrap.owner_chat_id,
        bootstrap.session_id,
        bootstrap.execution_id,
    ):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_scope_mismatch",
            "active factory scope does not match atomic bootstrap",
        )
    service = SQLiteGenerationRebaseV2Service(
        SQLiteContextV2Store(
            database_path=database,
            object_directory=objects,
        )
    )
    try:
        persisted = service.receipt_for_generation(
            owner_chat_id=bootstrap.owner_chat_id,
            execution_id=bootstrap.execution_id,
            session_id=bootstrap.session_id,
            generation_id=bootstrap.generation_id,
        )
        head = service.current(
            owner_chat_id=bootstrap.owner_chat_id,
            execution_id=bootstrap.execution_id,
            session_id=bootstrap.session_id,
        )
    except (GenerationRebaseConflict, GenerationRebaseUnavailable) as error:
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_unavailable",
            "active factory could not verify atomic generation state",
        ) from error
    if (
        persisted is None
        or head is None
        or _receipt_identity(persisted)
        != _receipt_identity(bootstrap.bootstrap_receipt)
        or head != bootstrap.current_head
    ):
        raise PupuUnchainAtomicBootstrapError(
            "context_v2_atomic_bootstrap_receipt_mismatch",
            "atomic bootstrap receipt or current head changed",
        )
    return head


__all__ = [
    "ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA",
    "PupuUnchainAtomicBootstrap",
    "PupuUnchainAtomicBootstrapError",
    "prepare_pupu_unchain_atomic_bootstrap",
    "pupu_unchain_sticky_active_required",
    "verify_pupu_unchain_atomic_bootstrap",
]
