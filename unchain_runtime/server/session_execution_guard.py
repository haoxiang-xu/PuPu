from __future__ import annotations

import hashlib
import json
import os
import subprocess
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator


_PROTOCOL_SCHEMA = "pupu.session-execution-guard.protocol.v1"
_PROTOCOL_VERSION = 1
_RECORD_SCHEMA_VERSION = 1
_GUARD_DIRECTORY = "session_execution_guards"
_PROTOCOL_FILE = "protocol.json"
_STOP_THE_WORLD_ENV = "UNCHAIN_SESSION_GUARD_STOP_THE_WORLD"
_LOCK_ACQUIRE_TIMEOUT_SECONDS = 0.25
_LOCK_POLL_INTERVAL_SECONDS = 0.01
_VALID_STATES = frozenset({"active", "parked"})
_VALID_OPERATIONS = frozenset({"run", "rebase"})
_PROCESS_OWNER_ID = uuid.uuid4().hex
_MIGRATION_RECEIPT_SCHEMA = "pupu.session-guard-migration"
_MIGRATION_RECEIPT_VERSION = 1
_WINDOWS_BINARY_FLAG = getattr(os, "O_BINARY", 0)


class SessionExecutionGuardError(RuntimeError):
    """A fail-closed session guard failure."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 503,
        retryable: bool = True,
    ) -> None:
        super().__init__(message)
        self.code = str(code or "session_execution_guard_unavailable")
        self.status_code = int(status_code)
        self.retryable = bool(retryable)


class SessionExecutionInProgress(SessionExecutionGuardError):
    """Another active or durably parked owner holds the session."""

    def __init__(self, *, session_id: str, state: str) -> None:
        self.session_id = session_id
        self.state = state
        super().__init__(
            "session_execution_in_progress",
            "another execution currently owns this session",
            status_code=409,
            retryable=True,
        )


class SessionExecutionGuardBusy(SessionExecutionGuardError):
    """A bounded guard-lock attempt lost to another process."""

    def __init__(self) -> None:
        super().__init__(
            "session_execution_in_progress",
            "another execution is changing this session guard",
            status_code=409,
            retryable=True,
        )


@dataclass(frozen=True, slots=True)
class SessionExecutionGuardSnapshot:
    session_id: str
    state: str
    operation: str
    attempt_id: str
    execution_id: str
    owner_id: str
    owner_pid: int
    process_incarnation: str
    interaction_id: str
    interaction_source_attempt_id: str
    receipt_id: str
    revision: int
    created_at_ms: int
    updated_at_ms: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": _RECORD_SCHEMA_VERSION,
            "session_id": self.session_id,
            "state": self.state,
            "operation": self.operation,
            "attempt_id": self.attempt_id,
            "execution_id": self.execution_id,
            "owner_id": self.owner_id,
            "owner_pid": self.owner_pid,
            "process_incarnation": self.process_incarnation,
            "interaction_id": self.interaction_id,
            "interaction_source_attempt_id": self.interaction_source_attempt_id,
            "receipt_id": self.receipt_id,
            "revision": self.revision,
            "created_at_ms": self.created_at_ms,
            "updated_at_ms": self.updated_at_ms,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> "SessionExecutionGuardSnapshot":
        expected_keys = {
            "schema_version",
            "session_id",
            "state",
            "operation",
            "attempt_id",
            "execution_id",
            "owner_id",
            "owner_pid",
            "process_incarnation",
            "interaction_id",
            "interaction_source_attempt_id",
            "receipt_id",
            "revision",
            "created_at_ms",
            "updated_at_ms",
        }
        if not isinstance(raw, dict) or set(raw) != expected_keys:
            raise ValueError("session guard record shape is invalid")
        if raw.get("schema_version") != _RECORD_SCHEMA_VERSION:
            raise ValueError("session guard record schema is unsupported")
        session_id = _identifier(raw.get("session_id"), "session_id")
        state = str(raw.get("state") or "")
        operation = str(raw.get("operation") or "")
        attempt_id = _identifier(raw.get("attempt_id"), "attempt_id")
        execution_id = _identifier(raw.get("execution_id"), "execution_id")
        owner_id = _identifier(raw.get("owner_id"), "owner_id")
        process_incarnation = _identifier(
            raw.get("process_incarnation"),
            "process_incarnation",
        )
        if state not in _VALID_STATES or operation not in _VALID_OPERATIONS:
            raise ValueError("session guard state or operation is invalid")
        owner_pid = _positive_int(raw.get("owner_pid"), "owner_pid")
        revision = _positive_int(raw.get("revision"), "revision")
        created_at_ms = _non_negative_int(raw.get("created_at_ms"), "created_at_ms")
        updated_at_ms = _non_negative_int(raw.get("updated_at_ms"), "updated_at_ms")
        if updated_at_ms < created_at_ms:
            raise ValueError("session guard timestamps are not monotonic")
        interaction_id = _optional_identifier(raw.get("interaction_id"), "interaction_id")
        source_attempt_id = _optional_identifier(
            raw.get("interaction_source_attempt_id"),
            "interaction_source_attempt_id",
        )
        receipt_id = _optional_identifier(raw.get("receipt_id"), "receipt_id")
        if state == "active" and any((interaction_id, source_attempt_id, receipt_id)):
            raise ValueError("active session guard carries parked interaction state")
        if state == "parked" and (not interaction_id or not source_attempt_id):
            raise ValueError("parked session guard has no exact interaction lineage")
        if operation == "rebase" and state != "active":
            raise ValueError("rebase session guard cannot be parked")
        return cls(
            session_id=session_id,
            state=state,
            operation=operation,
            attempt_id=attempt_id,
            execution_id=execution_id,
            owner_id=owner_id,
            owner_pid=owner_pid,
            process_incarnation=process_incarnation,
            interaction_id=interaction_id,
            interaction_source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
            revision=revision,
            created_at_ms=created_at_ms,
            updated_at_ms=updated_at_ms,
        )


@dataclass(frozen=True, slots=True)
class SessionExecutionGuardTransfer:
    """Exact rollback token for one parked-to-active continuation transfer."""

    previous: SessionExecutionGuardSnapshot
    transferred_attempt_id: str
    active_revision: int


class SessionExecutionGuardRegistry:
    """One durable run-or-rebase owner for each exact session.

    A parked owner represents a durable interaction suspension. It deliberately
    outlives its process and can only move through exact interaction lineage.
    """

    def __init__(
        self,
        data_dir: str | Path | None = None,
        *,
        clock_ms: Callable[[], int] | None = None,
        process_owner_id: str | None = None,
        process_pid: int | None = None,
        process_incarnation: str | None = None,
        process_identity: Callable[[int], tuple[str, str]] | None = None,
    ) -> None:
        self._data_dir = Path(data_dir).expanduser() if data_dir is not None else None
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))
        self._process_owner_id = _identifier(
            process_owner_id or _PROCESS_OWNER_ID,
            "process_owner_id",
        )
        self._process_pid = int(process_pid if process_pid is not None else os.getpid())
        if self._process_pid <= 0:
            raise ValueError("process_pid must be positive")
        self._process_identity = process_identity or _process_identity
        if process_incarnation is None:
            state, token = self._process_identity(self._process_pid)
            if state != "alive" or not token:
                raise SessionExecutionGuardError(
                    "session_guard_process_identity_unavailable",
                    "current process incarnation cannot be verified",
                )
            process_incarnation = token
        self._process_incarnation = _identifier(
            process_incarnation,
            "process_incarnation",
        )

    def initialize_protocol(self, *, stop_the_world: bool = False) -> None:
        root = self._root(create=True)
        marker = root / _PROTOCOL_FILE
        with _exclusive_file_lock(root / f".{_PROTOCOL_FILE}.lock"):
            current = self._read_protocol(marker)
            if current is not None:
                self._validate_protocol(current)
                return
            explicit_stop = stop_the_world or os.environ.get(
                _STOP_THE_WORLD_ENV,
                "",
            ).strip() == "1"
            if self._legacy_execution_records_exist() and not explicit_stop:
                raise SessionExecutionGuardError(
                    "session_guard_stop_the_world_required",
                    "existing execution data requires one stop-the-world guard migration",
                    status_code=503,
                    retryable=False,
                )
            payload = {
                "schema": _PROTOCOL_SCHEMA,
                "protocol_version": _PROTOCOL_VERSION,
                "compatibility": "exact",
            }
            self._write_json(marker, payload)

    def acquire(
        self,
        session_id: str,
        attempt_id: str,
        *,
        operation: str,
        execution_id: str = "",
    ) -> str:
        session = _identifier(session_id, "session_id")
        attempt = _identifier(attempt_id, "attempt_id")
        execution = _identifier(execution_id or session, "execution_id")
        normalized_operation = str(operation or "").strip()
        if normalized_operation not in _VALID_OPERATIONS:
            raise ValueError("operation must be run or rebase")
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session)
            disposition = "acquired"
            if current is not None:
                if current.state == "parked":
                    raise SessionExecutionInProgress(session_id=session, state="parked")
                owner_state = self._owner_state(current)
                if owner_state == "owned":
                    if (
                        current.operation == normalized_operation
                        and current.attempt_id == attempt
                        and current.execution_id == execution
                    ):
                        return "reentrant"
                    raise SessionExecutionInProgress(session_id=session, state="active")
                if owner_state == "foreign":
                    raise SessionExecutionInProgress(session_id=session, state="active")
                disposition = "reclaimed"
            now_ms = self._now_ms()
            replacement = SessionExecutionGuardSnapshot(
                session_id=session,
                state="active",
                operation=normalized_operation,
                attempt_id=attempt,
                execution_id=execution,
                owner_id=self._process_owner_id,
                owner_pid=self._process_pid,
                process_incarnation=self._process_incarnation,
                interaction_id="",
                interaction_source_attempt_id="",
                receipt_id="",
                revision=(current.revision + 1 if current is not None else 1),
                created_at_ms=(current.created_at_ms if current is not None else now_ms),
                updated_at_ms=now_ms,
            )
            self._write_json(path, replacement.to_dict())
        return disposition

    def release_run(self, session_id: str, attempt_id: str) -> str:
        return self._release(
            session_id,
            attempt_id,
            operation="run",
        )

    def release_rebase(self, session_id: str, attempt_id: str) -> str:
        return self._release(
            session_id,
            attempt_id,
            operation="rebase",
        )

    def park(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        owner_attempt_id: str = "",
    ) -> str:
        return self._park(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            owner_attempt_id=owner_attempt_id,
            require_current_owner=True,
        )

    def park_from_durable_interaction(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        owner_attempt_id: str,
    ) -> str:
        return self._park(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            owner_attempt_id=owner_attempt_id,
            require_current_owner=False,
        )

    def bind_receipt(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        receipt_id: str,
    ) -> str:
        session, interaction, source = self._interaction_identifiers(
            session_id,
            interaction_id,
            source_attempt_id,
        )
        receipt = _identifier(receipt_id, "receipt_id")
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session)
            if current is None:
                return "no_guard"
            self._require_parked_lineage(current, interaction, source)
            if current.receipt_id:
                if current.receipt_id == receipt:
                    return "unchanged"
                raise SessionExecutionGuardError(
                    "session_guard_receipt_conflict",
                    "parked session guard is bound to another receipt",
                    status_code=409,
                    retryable=False,
                )
            replacement = self._replace(
                current,
                receipt_id=receipt,
            )
            self._write_json(path, replacement.to_dict())
        return "bound"

    def resume_live(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        receipt_id: str,
    ) -> str:
        session, interaction, source = self._interaction_identifiers(
            session_id,
            interaction_id,
            source_attempt_id,
        )
        receipt = _identifier(receipt_id, "receipt_id")
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session)
            if current is None:
                return "no_guard"
            self._require_parked_lineage(current, interaction, source)
            if current.receipt_id != receipt:
                raise SessionExecutionGuardError(
                    "session_guard_receipt_mismatch",
                    "persisted receipt does not match the parked session guard",
                    status_code=409,
                    retryable=False,
                )
            if self._owner_state(current, parked_owner_check=True) != "owned":
                raise SessionExecutionGuardError(
                    "session_guard_live_owner_mismatch",
                    "only the original live waiter can resume this parked guard",
                    status_code=409,
                    retryable=True,
                )
            replacement = self._replace(
                current,
                state="active",
                interaction_id="",
                interaction_source_attempt_id="",
                receipt_id="",
            )
            self._write_json(path, replacement.to_dict())
        return "resumed"

    def transfer_parked(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        receipt_id: str,
        attempt_id: str,
    ) -> str:
        self.prepare_parked_transfer(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
            attempt_id=attempt_id,
        )
        return "transferred"

    def prepare_parked_transfer(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        receipt_id: str,
        attempt_id: str,
    ) -> SessionExecutionGuardTransfer:
        session, interaction, source = self._interaction_identifiers(
            session_id,
            interaction_id,
            source_attempt_id,
        )
        receipt = _identifier(receipt_id, "receipt_id")
        attempt = _identifier(attempt_id, "attempt_id")
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session)
            if current is None:
                raise SessionExecutionGuardError(
                    "session_guard_parked_owner_missing",
                    "durable resume has no parked session guard",
                    status_code=409,
                    retryable=False,
                )
            self._require_parked_lineage(current, interaction, source)
            if current.receipt_id != receipt:
                raise SessionExecutionGuardError(
                    "session_guard_receipt_mismatch",
                    "durable resume receipt does not match the parked session guard",
                    status_code=409,
                    retryable=False,
                )
            replacement = self._replace(
                current,
                state="active",
                operation="run",
                attempt_id=attempt,
                execution_id=session,
                owner_id=self._process_owner_id,
                owner_pid=self._process_pid,
                process_incarnation=self._process_incarnation,
                interaction_id="",
                interaction_source_attempt_id="",
                receipt_id="",
            )
            self._write_json(path, replacement.to_dict())
        return SessionExecutionGuardTransfer(
            previous=current,
            transferred_attempt_id=attempt,
            active_revision=replacement.revision,
        )

    def rollback_parked_transfer(
        self,
        transfer: SessionExecutionGuardTransfer,
    ) -> str:
        previous = self._transfer_previous(transfer)
        self.initialize_protocol()
        path = self._record_path(previous.session_id)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, previous.session_id)
            self._require_active_transfer(current, transfer)
            replacement = self._replace(
                current,
                state="parked",
                operation=previous.operation,
                attempt_id=previous.attempt_id,
                execution_id=previous.execution_id,
                owner_id=previous.owner_id,
                owner_pid=previous.owner_pid,
                process_incarnation=previous.process_incarnation,
                interaction_id=previous.interaction_id,
                interaction_source_attempt_id=(
                    previous.interaction_source_attempt_id
                ),
                receipt_id=previous.receipt_id,
            )
            self._write_json(path, replacement.to_dict())
        return "rolled_back"

    def validate_parked_transfer(
        self,
        transfer: SessionExecutionGuardTransfer,
    ) -> str:
        previous = self._transfer_previous(transfer)
        self.initialize_protocol()
        path = self._record_path(previous.session_id)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, previous.session_id)
            self._require_active_transfer(current, transfer)
        return "active"

    def release_parked_transfer(
        self,
        transfer: SessionExecutionGuardTransfer,
    ) -> str:
        previous = self._transfer_previous(transfer)
        self.initialize_protocol()
        path = self._record_path(previous.session_id)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, previous.session_id)
            self._require_active_transfer(current, transfer)
            self._unlink_record(path)
        return "released"

    @staticmethod
    def _transfer_previous(
        transfer: SessionExecutionGuardTransfer,
    ) -> SessionExecutionGuardSnapshot:
        if not isinstance(transfer, SessionExecutionGuardTransfer):
            raise SessionExecutionGuardError(
                "session_guard_transfer_token_invalid",
                "session guard transfer token is invalid",
                status_code=409,
                retryable=False,
            )
        return transfer.previous

    def _require_active_transfer(
        self,
        current: SessionExecutionGuardSnapshot | None,
        transfer: SessionExecutionGuardTransfer,
    ) -> None:
        previous = transfer.previous
        if (
            current is None
            or current.state != "active"
            or current.operation != "run"
            or current.execution_id != previous.session_id
            or current.attempt_id != transfer.transferred_attempt_id
            or current.revision != transfer.active_revision
            or current.created_at_ms != previous.created_at_ms
            or self._owner_state(current) != "owned"
        ):
            raise SessionExecutionGuardError(
                "session_guard_transfer_rollback_conflict",
                "session guard changed after the continuation transfer",
                status_code=409,
                retryable=False,
            )

    def consume_parked(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
    ) -> str:
        session, interaction, source = self._interaction_identifiers(
            session_id,
            interaction_id,
            source_attempt_id,
        )
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session)
            if current is None:
                return "no_guard"
            self._require_parked_lineage(current, interaction, source)
            self._unlink_record(path)
        return "consumed"

    def snapshot(self, session_id: str) -> SessionExecutionGuardSnapshot | None:
        session = _identifier(session_id, "session_id")
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            return self._read_record(path, session)

    def _release(self, session_id: str, attempt_id: str, *, operation: str) -> str:
        session = _identifier(session_id, "session_id")
        attempt = _identifier(attempt_id, "attempt_id")
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session)
            if current is None:
                return "unchanged"
            if current.state == "parked":
                return "parked"
            if (
                current.operation != operation
                or current.attempt_id != attempt
                or self._owner_state(current) != "owned"
            ):
                return "stale_owner"
            self._unlink_record(path)
        return "released"

    def _park(
        self,
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        owner_attempt_id: str,
        require_current_owner: bool,
    ) -> str:
        session, interaction, source = self._interaction_identifiers(
            session_id,
            interaction_id,
            source_attempt_id,
        )
        owner_attempt = _identifier(
            owner_attempt_id or source,
            "owner_attempt_id",
        )
        self.initialize_protocol()
        path = self._record_path(session)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session)
            if current is None:
                if require_current_owner:
                    return "no_guard"
                now_ms = self._now_ms()
                replacement = SessionExecutionGuardSnapshot(
                    session_id=session,
                    state="parked",
                    operation="run",
                    attempt_id=owner_attempt,
                    execution_id=session,
                    owner_id=self._process_owner_id,
                    owner_pid=self._process_pid,
                    process_incarnation=self._process_incarnation,
                    interaction_id=interaction,
                    interaction_source_attempt_id=source,
                    receipt_id="",
                    revision=1,
                    created_at_ms=now_ms,
                    updated_at_ms=now_ms,
                )
                self._write_json(path, replacement.to_dict())
                return "parked_from_durable_interaction"
            if current.state == "parked":
                self._require_parked_lineage(current, interaction, source)
                if current.attempt_id != owner_attempt:
                    raise SessionExecutionGuardError(
                        "session_guard_interaction_attempt_mismatch",
                        "parked guard owner does not match durable authority",
                        status_code=409,
                        retryable=False,
                    )
                return "unchanged"
            if current.operation != "run":
                raise SessionExecutionGuardError(
                    "session_guard_interaction_operation_mismatch",
                    "a rebase guard cannot become an interaction suspension",
                    status_code=409,
                    retryable=False,
                )
            if current.attempt_id != owner_attempt:
                raise SessionExecutionGuardError(
                    "session_guard_interaction_attempt_mismatch",
                    "durable interaction guard owner does not match the active attempt",
                    status_code=409,
                    retryable=False,
                )
            owner_state = self._owner_state(current)
            if not require_current_owner and owner_state == "owned":
                return "active_live"
            if owner_state == "foreign" or (
                require_current_owner and owner_state != "owned"
            ):
                raise SessionExecutionGuardError(
                    "session_guard_interaction_owner_mismatch",
                    "only the active run owner can park its session guard",
                    status_code=409,
                    retryable=True,
                )
            replacement = self._replace(
                current,
                state="parked",
                interaction_id=interaction,
                interaction_source_attempt_id=source,
                receipt_id="",
            )
            self._write_json(path, replacement.to_dict())
        return "parked"

    def _owner_state(
        self,
        current: SessionExecutionGuardSnapshot,
        *,
        parked_owner_check: bool = False,
    ) -> str:
        exact_owner = (
            current.owner_id == self._process_owner_id
            and current.owner_pid == self._process_pid
            and current.process_incarnation == self._process_incarnation
        )
        if exact_owner:
            return "owned"
        if parked_owner_check:
            return "foreign"
        if current.owner_id == self._process_owner_id:
            raise SessionExecutionGuardError(
                "session_guard_owner_identity_drift",
                "session guard owner identity changed unexpectedly",
                status_code=503,
                retryable=False,
            )
        state, incarnation = self._process_identity(current.owner_pid)
        if state == "dead":
            return "reclaimable"
        if state != "alive" or not incarnation:
            raise SessionExecutionGuardError(
                "session_guard_owner_identity_unavailable",
                "session guard owner liveness cannot be verified",
                status_code=503,
                retryable=True,
            )
        if incarnation != current.process_incarnation:
            return "reclaimable"
        return "foreign"

    def _replace(
        self,
        current: SessionExecutionGuardSnapshot,
        **changes: Any,
    ) -> SessionExecutionGuardSnapshot:
        values = current.to_dict()
        values.pop("schema_version")
        values.update(changes)
        values["revision"] = current.revision + 1
        values["updated_at_ms"] = self._now_ms()
        return SessionExecutionGuardSnapshot(**values)

    @staticmethod
    def _require_parked_lineage(
        current: SessionExecutionGuardSnapshot,
        interaction_id: str,
        source_attempt_id: str,
    ) -> None:
        if current.state != "parked":
            raise SessionExecutionGuardError(
                "session_guard_not_parked",
                "session guard is not durably parked",
                status_code=409,
                retryable=True,
            )
        if (
            current.interaction_id != interaction_id
            or current.interaction_source_attempt_id != source_attempt_id
        ):
            raise SessionExecutionGuardError(
                "session_guard_interaction_mismatch",
                "interaction lineage does not match the parked session guard",
                status_code=409,
                retryable=False,
            )

    @staticmethod
    def _interaction_identifiers(
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
    ) -> tuple[str, str, str]:
        return (
            _identifier(session_id, "session_id"),
            _identifier(interaction_id, "interaction_id"),
            _identifier(source_attempt_id, "source_attempt_id"),
        )

    def _root(self, *, create: bool) -> Path:
        data_dir = self._data_dir
        if data_dir is None:
            raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
            if not raw:
                raise SessionExecutionGuardError(
                    "session_execution_guard_unavailable",
                    "UNCHAIN_DATA_DIR is not configured",
                )
            data_dir = Path(raw).expanduser()
        root = data_dir.resolve() / _GUARD_DIRECTORY
        if create:
            try:
                root.mkdir(parents=True, exist_ok=True, mode=0o700)
                if os.name != "nt":
                    os.chmod(root, 0o700)
            except OSError as exc:
                raise SessionExecutionGuardError(
                    "session_execution_guard_unavailable",
                    "session guard directory is unavailable",
                ) from exc
        return root

    def _legacy_execution_records_exist(self) -> bool:
        root = self._root(create=True).parent / "executions"
        try:
            return root.exists() and any(root.rglob("*.json"))
        except OSError as exc:
            raise SessionExecutionGuardError(
                "session_execution_guard_unavailable",
                "existing execution state cannot be inspected",
            ) from exc

    def _record_path(self, session_id: str) -> Path:
        return self._root(create=True) / f"{_digest(session_id)}.json"

    @staticmethod
    def _lock_path(path: Path) -> Path:
        return path.with_name(f".{path.name}.lock")

    @staticmethod
    def _read_protocol(path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise SessionExecutionGuardError(
                "session_guard_protocol_corrupt",
                "session guard protocol marker is unreadable",
                retryable=False,
            ) from exc
        if not isinstance(raw, dict):
            raise SessionExecutionGuardError(
                "session_guard_protocol_corrupt",
                "session guard protocol marker has an invalid shape",
                retryable=False,
            )
        return raw

    @staticmethod
    def _validate_protocol(raw: dict[str, Any]) -> None:
        expected = {
            "schema": _PROTOCOL_SCHEMA,
            "protocol_version": _PROTOCOL_VERSION,
            "compatibility": "exact",
        }
        if raw != expected:
            raise SessionExecutionGuardError(
                "session_guard_protocol_incompatible",
                "session guard protocol marker is incompatible",
                retryable=False,
            )

    @staticmethod
    def _read_record(
        path: Path,
        session_id: str,
    ) -> SessionExecutionGuardSnapshot | None:
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
            snapshot = SessionExecutionGuardSnapshot.from_dict(raw)
        except (
            OSError,
            UnicodeError,
            json.JSONDecodeError,
            ValueError,
            SessionExecutionGuardError,
        ) as exc:
            raise SessionExecutionGuardError(
                "session_execution_guard_corrupt",
                "session guard record is unreadable or invalid",
                retryable=False,
            ) from exc
        if snapshot.session_id != session_id:
            raise SessionExecutionGuardError(
                "session_execution_guard_identity_mismatch",
                "session guard record identity does not match its path",
                retryable=False,
            )
        return snapshot

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        serialized = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        try:
            file_descriptor = os.open(
                temporary,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
                handle.write(serialized)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
            if os.name != "nt":
                os.chmod(path, 0o600)
                directory_descriptor = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_descriptor)
                finally:
                    os.close(directory_descriptor)
        except OSError as exc:
            raise SessionExecutionGuardError(
                "session_execution_guard_unavailable",
                "session guard record could not be committed",
            ) from exc
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass

    @staticmethod
    def _unlink_record(path: Path) -> None:
        try:
            path.unlink(missing_ok=True)
            if os.name != "nt":
                directory_descriptor = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_descriptor)
                finally:
                    os.close(directory_descriptor)
        except OSError as exc:
            raise SessionExecutionGuardError(
                "session_execution_guard_unavailable",
                "session guard record could not be released",
            ) from exc

    def _now_ms(self) -> int:
        return _non_negative_int(self._clock_ms(), "clock_ms")


def _identifier(value: Any, field_name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be text")
    normalized = value.strip()
    if not normalized or len(normalized) > 512 or "\x00" in normalized:
        raise ValueError(f"{field_name} is invalid")
    return normalized


def _optional_identifier(value: Any, field_name: str) -> str:
    if value == "":
        return ""
    return _identifier(value, field_name)


def _positive_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} must be a positive integer")
    return value


def _non_negative_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field_name} must be a non-negative integer")
    return value


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _process_identity(process_id: int) -> tuple[str, str]:
    try:
        os.kill(process_id, 0)
    except ProcessLookupError:
        return "dead", ""
    except PermissionError:
        return "unknown", ""
    except OSError:
        return "unknown", ""

    proc_stat = Path(f"/proc/{process_id}/stat")
    if proc_stat.exists():
        try:
            raw = proc_stat.read_text(encoding="utf-8")
            close_paren = raw.rfind(")")
            fields = raw[close_paren + 2 :].split()
            start_ticks = fields[19]
            return "alive", _digest(f"proc:{process_id}:{start_ticks}")
        except (OSError, UnicodeError, IndexError, ValueError):
            return "unknown", ""

    if os.name == "nt":  # pragma: no cover - exercised by packaged Windows smoke
        return _windows_process_identity(process_id)
    try:
        completed = subprocess.run(
            ["ps", "-o", "lstart=", "-p", str(process_id)],
            check=False,
            capture_output=True,
            text=True,
            timeout=1.0,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown", ""
    started = completed.stdout.strip()
    if completed.returncode != 0 or not started:
        try:
            os.kill(process_id, 0)
        except ProcessLookupError:
            return "dead", ""
        except OSError:
            pass
        return "unknown", ""
    return "alive", _digest(f"ps:{process_id}:{started}")


def _windows_process_identity(process_id: int) -> tuple[str, str]:
    try:
        import ctypes
        from ctypes import wintypes

        query_limited_information = 0x1000
        kernel32 = ctypes.windll.kernel32
        filetime_pointer = ctypes.POINTER(wintypes.FILETIME)
        # ctypes defaults function results to c_int. That truncates a 64-bit
        # Windows HANDLE before GetProcessTimes receives it, which makes a
        # fresh sidecar fail closed while establishing its own identity.
        kernel32.OpenProcess.argtypes = (
            wintypes.DWORD,
            wintypes.BOOL,
            wintypes.DWORD,
        )
        kernel32.OpenProcess.restype = wintypes.HANDLE
        kernel32.GetProcessTimes.argtypes = (
            wintypes.HANDLE,
            filetime_pointer,
            filetime_pointer,
            filetime_pointer,
            filetime_pointer,
        )
        kernel32.GetProcessTimes.restype = wintypes.BOOL
        kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
        kernel32.CloseHandle.restype = wintypes.BOOL
        is_current_process = process_id == os.getpid()
        if is_current_process:
            # A pseudo-handle is always valid for the current process and
            # avoids an access-checked OpenProcess call during sidecar import.
            # It must not be passed to CloseHandle.
            kernel32.GetCurrentProcess.argtypes = ()
            kernel32.GetCurrentProcess.restype = wintypes.HANDLE
            handle = kernel32.GetCurrentProcess()
        else:
            handle = kernel32.OpenProcess(
                query_limited_information,
                False,
                process_id,
            )
        if not handle:
            return "unknown", ""
        try:
            creation = wintypes.FILETIME()
            exit_time = wintypes.FILETIME()
            kernel = wintypes.FILETIME()
            user = wintypes.FILETIME()
            if not kernel32.GetProcessTimes(
                handle,
                ctypes.byref(creation),
                ctypes.byref(exit_time),
                ctypes.byref(kernel),
                ctypes.byref(user),
            ):
                return "unknown", ""
            ticks = (creation.dwHighDateTime << 32) | creation.dwLowDateTime
            return "alive", _digest(f"win:{process_id}:{ticks}")
        finally:
            if not is_current_process:
                kernel32.CloseHandle(handle)
    except Exception:
        return "unknown", ""


@contextmanager
def _exclusive_file_lock(path: Path) -> Iterator[None]:
    open_flags = os.O_RDWR | os.O_CREAT
    if os.name == "nt":
        # msvcrt.locking requires the backing file descriptor to be opened
        # in binary mode. Without this flag, a fresh Windows data directory
        # makes the session-guard migration receipt fail closed at startup.
        open_flags |= _WINDOWS_BINARY_FLAG
    try:
        file_descriptor = os.open(path, open_flags, 0o600)
    except OSError as exc:
        raise SessionExecutionGuardError(
            "session_execution_guard_unavailable",
            "session guard lock could not be opened",
        ) from exc
    try:
        if os.name != "nt":
            os.chmod(path, 0o600)
        if os.name == "nt":
            import msvcrt

            if os.fstat(file_descriptor).st_size == 0:
                os.write(file_descriptor, b"\0")
                os.fsync(file_descriptor)
            deadline = time.monotonic() + _LOCK_ACQUIRE_TIMEOUT_SECONDS
            while True:
                try:
                    os.lseek(file_descriptor, 0, os.SEEK_SET)
                    msvcrt.locking(file_descriptor, msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise SessionExecutionGuardBusy()
                    time.sleep(_LOCK_POLL_INTERVAL_SECONDS)
            try:
                yield
            finally:
                os.lseek(file_descriptor, 0, os.SEEK_SET)
                msvcrt.locking(file_descriptor, msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            deadline = time.monotonic() + _LOCK_ACQUIRE_TIMEOUT_SECONDS
            while True:
                try:
                    fcntl.flock(
                        file_descriptor,
                        fcntl.LOCK_EX | fcntl.LOCK_NB,
                    )
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise SessionExecutionGuardBusy()
                    time.sleep(_LOCK_POLL_INTERVAL_SECONDS)
            try:
                yield
            finally:
                fcntl.flock(file_descriptor, fcntl.LOCK_UN)
    except OSError as exc:
        raise SessionExecutionGuardError(
            "session_execution_guard_unavailable",
            "session guard lock operation failed",
        ) from exc
    finally:
        os.close(file_descriptor)


_DEFAULT_REGISTRY = SessionExecutionGuardRegistry()


def get_session_execution_guard_registry() -> SessionExecutionGuardRegistry:
    return _DEFAULT_REGISTRY


def initialize_session_guard_protocol(*, stop_the_world: bool = False) -> None:
    _DEFAULT_REGISTRY.initialize_protocol(stop_the_world=stop_the_world)


def session_guard_migration_receipt() -> dict[str, Any]:
    """Return a content-free launcher receipt after atomic marker validation."""

    status = "ready"
    try:
        _DEFAULT_REGISTRY.initialize_protocol()
    except SessionExecutionGuardError as exc:
        status = (
            "migration_required"
            if exc.code == "session_guard_stop_the_world_required"
            else "unavailable"
        )
    return {
        "schema": _MIGRATION_RECEIPT_SCHEMA,
        "version": _MIGRATION_RECEIPT_VERSION,
        "status": status,
        "protocol_version": _PROTOCOL_VERSION,
    }


def acquire_run_guard(session_id: str, attempt_id: str) -> str:
    return _DEFAULT_REGISTRY.acquire(
        session_id,
        attempt_id,
        operation="run",
        execution_id=session_id,
    )


def release_run_guard(session_id: str, attempt_id: str) -> str:
    return _DEFAULT_REGISTRY.release_run(session_id, attempt_id)


def acquire_rebase_guard(
    session_id: str,
    operation_id: str,
    *,
    execution_id: str,
) -> str:
    return _DEFAULT_REGISTRY.acquire(
        session_id,
        operation_id,
        operation="rebase",
        execution_id=execution_id,
    )


def release_rebase_guard(session_id: str, operation_id: str) -> str:
    return _DEFAULT_REGISTRY.release_rebase(session_id, operation_id)


def park_session_guard(
    *,
    session_id: str,
    interaction_id: str,
    source_attempt_id: str,
    owner_attempt_id: str = "",
) -> str:
    return _DEFAULT_REGISTRY.park(
        session_id=session_id,
        interaction_id=interaction_id,
        source_attempt_id=source_attempt_id,
        owner_attempt_id=owner_attempt_id,
    )


def park_session_guard_from_durable_interaction(
    *,
    session_id: str,
    interaction_id: str,
    source_attempt_id: str,
    owner_attempt_id: str,
) -> str:
    return _DEFAULT_REGISTRY.park_from_durable_interaction(
        session_id=session_id,
        interaction_id=interaction_id,
        source_attempt_id=source_attempt_id,
        owner_attempt_id=owner_attempt_id,
    )


def bind_session_guard_receipt(
    *,
    session_id: str,
    interaction_id: str,
    source_attempt_id: str,
    receipt_id: str,
) -> str:
    return _DEFAULT_REGISTRY.bind_receipt(
        session_id=session_id,
        interaction_id=interaction_id,
        source_attempt_id=source_attempt_id,
        receipt_id=receipt_id,
    )


def resume_live_session_guard(
    *,
    session_id: str,
    interaction_id: str,
    source_attempt_id: str,
    receipt_id: str,
) -> str:
    return _DEFAULT_REGISTRY.resume_live(
        session_id=session_id,
        interaction_id=interaction_id,
        source_attempt_id=source_attempt_id,
        receipt_id=receipt_id,
    )


def transfer_parked_session_guard(
    *,
    session_id: str,
    interaction_id: str,
    source_attempt_id: str,
    receipt_id: str,
    attempt_id: str,
) -> str:
    return _DEFAULT_REGISTRY.transfer_parked(
        session_id=session_id,
        interaction_id=interaction_id,
        source_attempt_id=source_attempt_id,
        receipt_id=receipt_id,
        attempt_id=attempt_id,
    )


def prepare_parked_session_guard_transfer(
    *,
    session_id: str,
    interaction_id: str,
    source_attempt_id: str,
    receipt_id: str,
    attempt_id: str,
) -> SessionExecutionGuardTransfer:
    return _DEFAULT_REGISTRY.prepare_parked_transfer(
        session_id=session_id,
        interaction_id=interaction_id,
        source_attempt_id=source_attempt_id,
        receipt_id=receipt_id,
        attempt_id=attempt_id,
    )


def rollback_parked_session_guard_transfer(
    *,
    transfer: SessionExecutionGuardTransfer,
) -> str:
    return _DEFAULT_REGISTRY.rollback_parked_transfer(transfer)


def validate_parked_session_guard_transfer(
    *,
    transfer: SessionExecutionGuardTransfer,
) -> str:
    return _DEFAULT_REGISTRY.validate_parked_transfer(transfer)


def release_parked_session_guard_transfer(
    *,
    transfer: SessionExecutionGuardTransfer,
) -> str:
    return _DEFAULT_REGISTRY.release_parked_transfer(transfer)


def consume_parked_session_guard(
    *,
    session_id: str,
    interaction_id: str,
    source_attempt_id: str,
) -> str:
    return _DEFAULT_REGISTRY.consume_parked(
        session_id=session_id,
        interaction_id=interaction_id,
        source_attempt_id=source_attempt_id,
    )


def snapshot_session_guard(
    *,
    session_id: str,
) -> SessionExecutionGuardSnapshot | None:
    return _DEFAULT_REGISTRY.snapshot(session_id)


@contextmanager
def session_rebase_guard(
    *,
    session_id: str,
    operation_id: str,
    execution_id: str,
    data_dir: str | Path | None = None,
) -> Iterator[None]:
    registry = (
        _DEFAULT_REGISTRY
        if data_dir is None
        else SessionExecutionGuardRegistry(data_dir=data_dir)
    )
    registry.acquire(
        session_id,
        operation_id,
        operation="rebase",
        execution_id=execution_id,
    )
    try:
        yield
    finally:
        registry.release_rebase(session_id, operation_id)


__all__ = [
    "SessionExecutionGuardError",
    "SessionExecutionGuardBusy",
    "SessionExecutionGuardRegistry",
    "SessionExecutionGuardSnapshot",
    "SessionExecutionGuardTransfer",
    "SessionExecutionInProgress",
    "acquire_rebase_guard",
    "acquire_run_guard",
    "bind_session_guard_receipt",
    "consume_parked_session_guard",
    "get_session_execution_guard_registry",
    "initialize_session_guard_protocol",
    "park_session_guard",
    "park_session_guard_from_durable_interaction",
    "prepare_parked_session_guard_transfer",
    "release_rebase_guard",
    "release_parked_session_guard_transfer",
    "release_run_guard",
    "resume_live_session_guard",
    "rollback_parked_session_guard_transfer",
    "session_guard_migration_receipt",
    "session_rebase_guard",
    "snapshot_session_guard",
    "transfer_parked_session_guard",
    "validate_parked_session_guard_transfer",
]
