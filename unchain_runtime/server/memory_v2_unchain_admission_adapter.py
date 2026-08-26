"""Host-owned sticky admission metadata for the Unchain Context V2 store.

This adapter is deliberately not a Context V2 data-plane runtime.  It cannot
append journal events, compile context, read artifacts, or execute tools.  Its
only authority is the immutable per-chat rollout choice and the CAS-protected
bootstrap outcome needed to recover that choice after a sidecar restart.

The database may be opened only after an internal active-host preflight has
already initialized and verified the official Unchain journal and object
store.  The boolean proof accepted here is a private host signal; it is not a
renderer feature flag and must never be copied from request ``options``.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import stat
import threading
import time
import uuid
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
    configured_context_v2_store_owner,
)


_ADMISSION_SCHEMA_VERSION = 1
_ADMISSION_SCHEMA = "pupu.unchain-context-v2-admission.v1"
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9._:-]{1,512}$")
_ROLLOUT_MODES = frozenset({"off", "shadow", "canary", "all"})


class PupuUnchainAdmissionError(RuntimeError):
    """The host could not safely read or mutate sticky admission state."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class PupuUnchainAdmissionScopeError(PupuUnchainAdmissionError):
    """A caller attempted to use an authority outside its bound chat."""


def _required_identifier(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise PupuUnchainAdmissionError(
            "context_v2_admission_invalid",
            f"{field_name} must be text",
        )
    normalized = value.strip()
    if not _IDENTIFIER_RE.fullmatch(normalized):
        raise PupuUnchainAdmissionError(
            "context_v2_admission_invalid",
            f"{field_name} is invalid",
        )
    return normalized


def _bounded_text(
    value: object,
    field_name: str,
    *,
    maximum: int,
    required: bool = False,
) -> str:
    if value is None:
        normalized = ""
    elif isinstance(value, str):
        normalized = value.strip()
    else:
        raise PupuUnchainAdmissionError(
            "context_v2_admission_invalid",
            f"{field_name} must be text",
        )
    if "\x00" in normalized or len(normalized) > maximum:
        raise PupuUnchainAdmissionError(
            "context_v2_admission_invalid",
            f"{field_name} is invalid",
        )
    if required and not normalized:
        raise PupuUnchainAdmissionError(
            "context_v2_admission_invalid",
            f"{field_name} is required",
        )
    return normalized


def _canonical_json(value: object) -> str:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuUnchainAdmissionError(
            "context_v2_admission_invalid",
            "admission metadata must be canonical JSON",
        ) from error
    if len(encoded.encode("utf-8")) > 64 * 1024:
        raise PupuUnchainAdmissionError(
            "context_v2_admission_invalid",
            "admission metadata exceeds the durable limit",
        )
    return encoded


def _payload_sha256(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _clock_ms() -> int:
    return time.time_ns() // 1_000_000


def validate_pupu_unchain_admission_row(
    row: Any,
    *,
    owner_chat_id: str,
    sticky: bool,
    replayed: bool = False,
) -> dict[str, Any]:
    """Validate one already-read admission row without opening storage."""

    owner = _required_identifier(owner_chat_id, "owner_chat_id")
    expected_scope_sha256 = hashlib.sha256(
        f"{_ADMISSION_SCHEMA}:{owner}".encode("utf-8")
    ).hexdigest()
    if (
        str(row["owner_chat_id"]) != owner
        or str(row["scope_sha256"]) != expected_scope_sha256
        or int(row["schema_version"]) != _ADMISSION_SCHEMA_VERSION
    ):
        raise PupuUnchainAdmissionScopeError(
            "context_v2_admission_scope_mismatch",
            "persisted admission state does not match the bound chat scope",
        )
    try:
        admission_provenance = json.loads(row["admission_provenance_json"])
        bootstrap_provenance = json.loads(row["bootstrap_provenance_json"])
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise PupuUnchainAdmissionError(
            "context_v2_admission_corrupt",
            "persisted admission metadata is unreadable",
        ) from error
    if not isinstance(admission_provenance, dict) or not isinstance(
        bootstrap_provenance,
        dict,
    ):
        raise PupuUnchainAdmissionError(
            "context_v2_admission_corrupt",
            "persisted admission metadata is invalid",
        )
    admission_id = _required_identifier(row["admission_id"], "admission_id")
    first_session_id = _required_identifier(
        row["first_session_id"],
        "first_session_id",
    )
    requested_rollout_mode = str(row["requested_rollout_mode"])
    effective_rollout_mode = str(row["effective_rollout_mode"])
    target_mode = str(row["target_mode"])
    effective_mode = str(row["effective_mode"])
    bootstrap_status = str(row["bootstrap_status"])
    bootstrap_error_code = _bounded_text(
        row["bootstrap_error_code"],
        "bootstrap_error_code",
        maximum=128,
    )
    canary_selected_raw = row["canary_selected"]
    canary_percent = int(row["canary_percent"])
    canary_bucket = int(row["canary_bucket"])
    v2_bootstrapped_raw = row["v2_bootstrapped"]
    revision = int(row["revision"])
    admitted_at_ms = int(row["admitted_at_ms"])
    updated_at_ms = int(row["updated_at_ms"])
    bootstrapped_at_raw = row["bootstrapped_at_ms"]
    if (
        requested_rollout_mode not in _ROLLOUT_MODES
        or effective_rollout_mode not in _ROLLOUT_MODES
        or target_mode != "active"
        or effective_mode not in {"shadow", "active"}
        or bootstrap_status not in {"pending", "complete", "failed"}
        or canary_selected_raw not in (0, 1)
        or v2_bootstrapped_raw not in (0, 1)
        or not 0 <= canary_percent <= 100
        or not 0 <= canary_bucket <= 9_999
        or revision <= 0
        or admitted_at_ms < 0
        or updated_at_ms < admitted_at_ms
    ):
        raise PupuUnchainAdmissionError(
            "context_v2_admission_corrupt",
            "persisted admission metadata is invalid",
        )
    v2_bootstrapped = bool(v2_bootstrapped_raw)
    bootstrapped_at_ms = (
        int(bootstrapped_at_raw) if bootstrapped_at_raw is not None else None
    )
    if (
        (
            bootstrap_status == "complete"
            and (
                not v2_bootstrapped
                or effective_mode not in {"active", "shadow"}
                or bootstrap_error_code
                or bootstrapped_at_ms is None
                or not bootstrap_provenance
            )
        )
        or (
            bootstrap_status == "pending"
            and (
                v2_bootstrapped
                or effective_mode != "shadow"
                or bootstrap_error_code
                or bootstrapped_at_ms is not None
            )
        )
        or (
            bootstrap_status == "failed"
            and (
                v2_bootstrapped
                or effective_mode != "shadow"
                or not bootstrap_error_code
                or bootstrapped_at_ms is not None
            )
        )
    ):
        raise PupuUnchainAdmissionError(
            "context_v2_admission_corrupt",
            "persisted admission bootstrap state is inconsistent",
        )
    return {
        "admission_id": admission_id,
        "owner_chat_id": str(row["owner_chat_id"]),
        "first_session_id": first_session_id,
        "requested_rollout_mode": requested_rollout_mode,
        "effective_rollout_mode": effective_rollout_mode,
        "cohort": str(row["cohort"]),
        "target_mode": target_mode,
        "effective_mode": effective_mode,
        "decision_reason": str(row["decision_reason"]),
        "canary_selected": bool(canary_selected_raw),
        "canary_percent": canary_percent,
        "canary_bucket": canary_bucket,
        "hash_strategy": str(row["hash_strategy"]),
        "bootstrap_status": bootstrap_status,
        "v2_bootstrapped": v2_bootstrapped,
        "bootstrap_error_code": bootstrap_error_code,
        "admission_provenance": admission_provenance,
        "bootstrap_provenance": bootstrap_provenance,
        "revision": revision,
        "admitted_at_ms": admitted_at_ms,
        "bootstrapped_at_ms": bootstrapped_at_ms,
        "sticky": bool(sticky),
        "replayed": bool(replayed),
    }


class PupuUnchainAdmissionAuthority:
    """One exact chat scope over host metadata in the Unchain-owned DB."""

    def __init__(
        self,
        *,
        owner_chat_id: str,
        database_path: Path,
        object_directory: Path,
    ) -> None:
        self.owner_chat_id = _required_identifier(owner_chat_id, "owner_chat_id")
        self.database_path = Path(database_path).expanduser().resolve()
        self.object_directory = Path(object_directory).expanduser().resolve()
        self._scope_sha256 = hashlib.sha256(
            f"{_ADMISSION_SCHEMA}:{self.owner_chat_id}".encode("utf-8")
        ).hexdigest()
        self._lock = threading.RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path,
            timeout=30.0,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA synchronous = FULL")
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    def _initialize(self) -> None:
        statements = (
            """
            CREATE TABLE IF NOT EXISTS pupu_context_v2_admissions (
              admission_id TEXT PRIMARY KEY,
              owner_chat_id TEXT NOT NULL UNIQUE,
              scope_sha256 TEXT NOT NULL,
              first_session_id TEXT NOT NULL,
              requested_rollout_mode TEXT NOT NULL,
              effective_rollout_mode TEXT NOT NULL,
              cohort TEXT NOT NULL,
              target_mode TEXT NOT NULL CHECK(target_mode='active'),
              effective_mode TEXT NOT NULL,
              decision_reason TEXT NOT NULL,
              canary_selected INTEGER NOT NULL,
              canary_percent INTEGER NOT NULL,
              canary_bucket INTEGER NOT NULL,
              hash_strategy TEXT NOT NULL,
              bootstrap_status TEXT NOT NULL DEFAULT 'pending',
              v2_bootstrapped INTEGER NOT NULL DEFAULT 0,
              bootstrap_error_code TEXT NOT NULL DEFAULT '',
              admission_provenance_json TEXT NOT NULL,
              bootstrap_provenance_json TEXT NOT NULL DEFAULT '{}',
              revision INTEGER NOT NULL DEFAULT 1,
              admitted_at_ms INTEGER NOT NULL,
              bootstrapped_at_ms INTEGER,
              updated_at_ms INTEGER NOT NULL,
              schema_version INTEGER NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS pupu_context_v2_admission_operations (
              operation_id TEXT PRIMARY KEY,
              owner_chat_id TEXT NOT NULL,
              operation_kind TEXT NOT NULL,
              payload_sha256 TEXT NOT NULL,
              receipt_json TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL
            )
            """,
        )
        with self._lock, self._connect() as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                for statement in statements:
                    connection.execute(statement)
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def _require_scope(self, owner_chat_id: object) -> str:
        owner = _required_identifier(owner_chat_id, "owner_chat_id")
        if owner != self.owner_chat_id:
            raise PupuUnchainAdmissionScopeError(
                "context_v2_admission_scope_mismatch",
                "admission authority does not match the requested chat scope",
            )
        return owner

    def _row_response(
        self,
        row: sqlite3.Row,
        *,
        sticky: bool,
        replayed: bool = False,
    ) -> dict[str, Any]:
        return validate_pupu_unchain_admission_row(
            row,
            owner_chat_id=self.owner_chat_id,
            sticky=sticky,
            replayed=replayed,
        )

    @staticmethod
    def _operation_id(value: object) -> str:
        return _bounded_text(value, "operation_id", maximum=256, required=True)

    def _operation_replay(
        self,
        connection: sqlite3.Connection,
        *,
        operation_id: str,
        operation_kind: str,
        payload_sha256: str,
    ) -> dict[str, Any] | None:
        row = connection.execute(
            "SELECT * FROM pupu_context_v2_admission_operations "
            "WHERE operation_id=?",
            (operation_id,),
        ).fetchone()
        if row is None:
            return None
        if (
            str(row["owner_chat_id"]) != self.owner_chat_id
            or str(row["operation_kind"]) != operation_kind
            or str(row["payload_sha256"]) != payload_sha256
        ):
            raise PupuUnchainAdmissionError(
                "context_v2_operation_conflict",
                "admission operation id was reused with a different scope or payload",
            )
        try:
            receipt = json.loads(row["receipt_json"])
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise PupuUnchainAdmissionError(
                "context_v2_admission_corrupt",
                "admission operation receipt is unreadable",
            ) from error
        if not isinstance(receipt, dict):
            raise PupuUnchainAdmissionError(
                "context_v2_admission_corrupt",
                "admission operation receipt is invalid",
            )
        return receipt

    def _record_operation(
        self,
        connection: sqlite3.Connection,
        *,
        operation_id: str,
        operation_kind: str,
        payload_sha256: str,
        receipt: Mapping[str, Any],
        now_ms: int,
    ) -> None:
        connection.execute(
            "INSERT INTO pupu_context_v2_admission_operations("
            "operation_id, owner_chat_id, operation_kind, payload_sha256, "
            "receipt_json, created_at_ms) VALUES(?, ?, ?, ?, ?, ?)",
            (
                operation_id,
                self.owner_chat_id,
                operation_kind,
                payload_sha256,
                _canonical_json(dict(receipt)),
                now_ms,
            ),
        )

    def get_chat_admission(self, *, owner_chat_id: str) -> dict[str, Any] | None:
        owner = self._require_scope(owner_chat_id)
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM pupu_context_v2_admissions WHERE owner_chat_id=?",
                (owner,),
            ).fetchone()
        return self._row_response(row, sticky=True) if row is not None else None

    def resolve_chat_admission(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        requested_rollout_mode: str,
        effective_rollout_mode: str,
        cohort: str,
        target_mode: str,
        decision_reason: str,
        canary_selected: bool,
        canary_percent: int,
        canary_bucket: int,
        hash_strategy: str,
        provenance: Mapping[str, Any],
        operation_id: str,
        allow_create: bool = True,
    ) -> dict[str, Any] | None:
        owner = self._require_scope(owner_chat_id)
        session = _bounded_text(session_id, "session_id", maximum=512)
        requested = _bounded_text(
            requested_rollout_mode,
            "requested_rollout_mode",
            maximum=32,
            required=True,
        )
        rollout = _bounded_text(
            effective_rollout_mode,
            "effective_rollout_mode",
            maximum=32,
            required=True,
        )
        normalized_cohort = _bounded_text(
            cohort,
            "cohort",
            maximum=64,
            required=True,
        )
        normalized_target = _bounded_text(
            target_mode,
            "target_mode",
            maximum=16,
            required=True,
        )
        reason = _bounded_text(decision_reason, "decision_reason", maximum=128)
        strategy = _bounded_text(
            hash_strategy,
            "hash_strategy",
            maximum=64,
            required=True,
        )
        if requested not in _ROLLOUT_MODES or rollout not in _ROLLOUT_MODES:
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "rollout mode is invalid",
            )
        if normalized_target != "active":
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "Unchain active admission authority accepts only active targets",
            )
        if type(canary_selected) is not bool or type(allow_create) is not bool:
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "admission boolean metadata is invalid",
            )
        if (
            type(canary_percent) is not int
            or type(canary_bucket) is not int
            or not 0 <= canary_percent <= 100
            or not 0 <= canary_bucket <= 9_999
        ):
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "canary metadata is invalid",
            )
        if not isinstance(provenance, Mapping):
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "admission provenance must be an object",
            )
        provenance_json = _canonical_json(dict(provenance))
        op_id = self._operation_id(operation_id)
        intent = {
            "owner_chat_id": owner,
            "session_id": session,
            "requested_rollout_mode": requested,
            "effective_rollout_mode": rollout,
            "cohort": normalized_cohort,
            "target_mode": normalized_target,
            "decision_reason": reason,
            "canary_selected": canary_selected,
            "canary_percent": canary_percent,
            "canary_bucket": canary_bucket,
            "hash_strategy": strategy,
            "provenance": dict(provenance),
        }
        payload_sha256 = _payload_sha256(intent)
        now_ms = _clock_ms()
        with self._lock, self._connect() as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                existing = connection.execute(
                    "SELECT * FROM pupu_context_v2_admissions "
                    "WHERE owner_chat_id=?",
                    (owner,),
                ).fetchone()
                if existing is not None:
                    connection.commit()
                    return self._row_response(
                        existing,
                        sticky=True,
                        replayed=True,
                    )
                if not allow_create:
                    connection.commit()
                    return None
                replay = self._operation_replay(
                    connection,
                    operation_id=op_id,
                    operation_kind="resolve_chat_admission",
                    payload_sha256=payload_sha256,
                )
                if replay is not None:
                    connection.commit()
                    replay["sticky"] = True
                    replay["replayed"] = True
                    return replay
                admission_id = f"pupu_admission_{uuid.uuid4().hex}"
                connection.execute(
                    "INSERT INTO pupu_context_v2_admissions("
                    "admission_id, owner_chat_id, scope_sha256, first_session_id, "
                    "requested_rollout_mode, effective_rollout_mode, cohort, "
                    "target_mode, effective_mode, decision_reason, canary_selected, "
                    "canary_percent, canary_bucket, hash_strategy, "
                    "admission_provenance_json, admitted_at_ms, updated_at_ms, "
                    "schema_version) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'shadow', ?, "
                    "?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        admission_id,
                        owner,
                        self._scope_sha256,
                        session,
                        requested,
                        rollout,
                        normalized_cohort,
                        normalized_target,
                        reason,
                        1 if canary_selected else 0,
                        canary_percent,
                        canary_bucket,
                        strategy,
                        provenance_json,
                        now_ms,
                        now_ms,
                        _ADMISSION_SCHEMA_VERSION,
                    ),
                )
                row = connection.execute(
                    "SELECT * FROM pupu_context_v2_admissions "
                    "WHERE admission_id=?",
                    (admission_id,),
                ).fetchone()
                response = self._row_response(row, sticky=False)
                self._record_operation(
                    connection,
                    operation_id=op_id,
                    operation_kind="resolve_chat_admission",
                    payload_sha256=payload_sha256,
                    receipt=response,
                    now_ms=now_ms,
                )
                connection.commit()
                return response
            except Exception:
                connection.rollback()
                raise

    def mark_chat_bootstrap(
        self,
        *,
        owner_chat_id: str,
        admission_id: str,
        expected_revision: int,
        succeeded: bool,
        provenance: Mapping[str, Any],
        error_code: str,
        operation_id: str,
    ) -> dict[str, Any]:
        owner = self._require_scope(owner_chat_id)
        admission_key = _required_identifier(admission_id, "admission_id")
        if type(expected_revision) is not int or expected_revision <= 0:
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "expected_revision must be a positive integer",
            )
        if type(succeeded) is not bool or not isinstance(provenance, Mapping):
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "bootstrap outcome is invalid",
            )
        safe_error = _bounded_text(error_code, "error_code", maximum=128)
        if succeeded and safe_error:
            raise PupuUnchainAdmissionError(
                "context_v2_admission_invalid",
                "successful bootstrap cannot include an error code",
            )
        provenance_json = _canonical_json(dict(provenance))
        op_id = self._operation_id(operation_id)
        intent = {
            "owner_chat_id": owner,
            "admission_id": admission_key,
            "expected_revision": expected_revision,
            "succeeded": succeeded,
            "provenance": dict(provenance),
            "error_code": safe_error,
        }
        payload_sha256 = _payload_sha256(intent)
        now_ms = _clock_ms()
        with self._lock, self._connect() as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                replay = self._operation_replay(
                    connection,
                    operation_id=op_id,
                    operation_kind="mark_chat_bootstrap",
                    payload_sha256=payload_sha256,
                )
                if replay is not None:
                    connection.commit()
                    replay["sticky"] = True
                    replay["replayed"] = True
                    return replay
                row = connection.execute(
                    "SELECT * FROM pupu_context_v2_admissions "
                    "WHERE admission_id=? AND owner_chat_id=?",
                    (admission_key, owner),
                ).fetchone()
                if row is None:
                    raise PupuUnchainAdmissionError(
                        "context_v2_not_found",
                        "chat admission was not found",
                    )
                self._row_response(row, sticky=True)
                if int(row["revision"]) != expected_revision:
                    raise PupuUnchainAdmissionError(
                        "context_v2_revision_conflict",
                        "chat admission revision conflict",
                    )
                next_revision = expected_revision + 1
                connection.execute(
                    "UPDATE pupu_context_v2_admissions SET "
                    "bootstrap_status=?, v2_bootstrapped=?, effective_mode=?, "
                    "bootstrap_error_code=?, bootstrap_provenance_json=?, "
                    "revision=?, bootstrapped_at_ms=?, updated_at_ms=? "
                    "WHERE admission_id=? AND owner_chat_id=? AND revision=?",
                    (
                        "complete" if succeeded else "failed",
                        1 if succeeded else 0,
                        "active" if succeeded else "shadow",
                        "" if succeeded else safe_error or "context_v2_bootstrap_failed",
                        provenance_json,
                        next_revision,
                        now_ms if succeeded else None,
                        now_ms,
                        admission_key,
                        owner,
                        expected_revision,
                    ),
                )
                if connection.execute("SELECT changes()").fetchone()[0] != 1:
                    raise PupuUnchainAdmissionError(
                        "context_v2_revision_conflict",
                        "chat admission revision conflict",
                    )
                updated = connection.execute(
                    "SELECT * FROM pupu_context_v2_admissions "
                    "WHERE admission_id=?",
                    (admission_key,),
                ).fetchone()
                response = self._row_response(updated, sticky=True)
                self._record_operation(
                    connection,
                    operation_id=op_id,
                    operation_kind="mark_chat_bootstrap",
                    payload_sha256=payload_sha256,
                    receipt=response,
                    now_ms=now_ms,
                )
                connection.commit()
                return response
            except Exception:
                connection.rollback()
                raise


def open_pupu_unchain_admission_authority(
    *,
    owner_chat_id: str,
    preflight_complete: bool,
) -> PupuUnchainAdmissionAuthority:
    """Open sticky metadata only after exact internal active-host preflight."""

    if type(preflight_complete) is not bool:
        raise TypeError("preflight_complete must be an exact boolean")
    if not preflight_complete:
        raise PupuUnchainAdmissionError(
            "context_v2_active_preflight_incomplete",
            "active Context V2 admission preflight is incomplete",
        )
    if configured_context_v2_store_owner() != STORE_OWNER_UNCHAIN:
        raise PupuUnchainAdmissionError(
            "context_v2_store_owner_conflict",
            "active Context V2 admission requires the Unchain store owner",
        )
    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise PupuUnchainAdmissionError(
            "context_v2_data_dir_unavailable",
            "active Context V2 admission requires UNCHAIN_DATA_DIR",
        )
    root = Path(raw_data_dir).expanduser().resolve() / "memory_v2"
    store_admission = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    if store_admission.database_state != STORE_OWNER_UNCHAIN:
        raise PupuUnchainAdmissionError(
            "context_v2_active_preflight_incomplete",
            "the official Unchain context store was not initialized by preflight",
        )
    database_path = store_admission.database_path
    object_directory = root / "objects"
    try:
        database_metadata = database_path.lstat()
        object_metadata = object_directory.lstat()
    except OSError as error:
        raise PupuUnchainAdmissionError(
            "context_v2_active_preflight_incomplete",
            "the official Unchain context storage is unavailable",
        ) from error
    if (
        database_path.is_symlink()
        or object_directory.is_symlink()
        or not stat.S_ISREG(database_metadata.st_mode)
        or not stat.S_ISDIR(object_metadata.st_mode)
    ):
        raise PupuUnchainAdmissionError(
            "context_v2_active_preflight_incomplete",
            "the official Unchain context storage scope is invalid",
        )
    return PupuUnchainAdmissionAuthority(
        owner_chat_id=owner_chat_id,
        database_path=database_path,
        object_directory=object_directory,
    )


__all__ = [
    "PupuUnchainAdmissionAuthority",
    "PupuUnchainAdmissionError",
    "PupuUnchainAdmissionScopeError",
    "open_pupu_unchain_admission_authority",
    "validate_pupu_unchain_admission_row",
]
