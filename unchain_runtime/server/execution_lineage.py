from __future__ import annotations

import copy
import hashlib
import json
import os
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator


_SCHEMA_VERSION = 1
_LINEAGES_DIRECTORY = "execution_lineages"
_TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})
_VALID_STATUSES = frozenset(
    {
        "registered",
        "running",
        "abandoned",
        "waiting_interaction",
        "waiting_job",
        "completed",
        "failed",
        "cancelled",
    }
)


class ExecutionLineageError(RuntimeError):
    """Fail-closed error raised by the durable logical-execution registry."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 500,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = str(code or "execution_lineage_failed")
        self.status_code = int(status_code)
        self.retryable = bool(retryable)


@dataclass(frozen=True)
class ExecutionLineageSnapshot:
    session_id: str
    logical_execution_id: str
    root_attempt_id: str
    current_attempt_id: str
    status: str
    revision: int
    created_at_ms: int
    updated_at_ms: int
    owner_instance_id: str = ""
    terminal_at_ms: int | None = None
    reason: str = ""

    @property
    def terminal(self) -> bool:
        return self.status in _TERMINAL_STATUSES

    @property
    def cancelled(self) -> bool:
        return self.status == "cancelled"

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": _SCHEMA_VERSION,
            "session_id": self.session_id,
            "logical_execution_id": self.logical_execution_id,
            "root_attempt_id": self.root_attempt_id,
            "current_attempt_id": self.current_attempt_id,
            "status": self.status,
            "revision": self.revision,
            "created_at_ms": self.created_at_ms,
            "updated_at_ms": self.updated_at_ms,
            "owner_instance_id": self.owner_instance_id,
            "terminal_at_ms": self.terminal_at_ms,
            "reason": self.reason,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> "ExecutionLineageSnapshot":
        if not isinstance(raw, dict):
            raise ValueError("execution lineage record must be a JSON object")
        if raw.get("schema_version") != _SCHEMA_VERSION:
            raise ValueError("unsupported execution lineage schema version")

        session_id = _validated_identifier(raw.get("session_id"), "session_id")
        logical_execution_id = _validated_identifier(
            raw.get("logical_execution_id"),
            "logical_execution_id",
        )
        root_attempt_id = _validated_optional_identifier(
            raw.get("root_attempt_id"),
            "root_attempt_id",
        )
        current_attempt_id = _validated_optional_identifier(
            raw.get("current_attempt_id"),
            "current_attempt_id",
        )
        status = str(raw.get("status") or "")
        if status not in _VALID_STATUSES:
            raise ValueError("execution lineage status is invalid")
        revision = _validated_non_negative_int(raw.get("revision"), "revision")
        if revision <= 0:
            raise ValueError("execution lineage revision must be positive")
        created_at_ms = _validated_non_negative_int(
            raw.get("created_at_ms"),
            "created_at_ms",
        )
        updated_at_ms = _validated_non_negative_int(
            raw.get("updated_at_ms"),
            "updated_at_ms",
        )
        owner_instance_id = _validated_optional_identifier(
            raw.get("owner_instance_id"),
            "owner_instance_id",
        )
        terminal_at_ms = _validated_optional_timestamp(
            raw.get("terminal_at_ms"),
            "terminal_at_ms",
        )
        reason = raw.get("reason", "")
        if not isinstance(reason, str):
            raise ValueError("execution lineage reason must be a string")
        if updated_at_ms < created_at_ms:
            raise ValueError("execution lineage timestamps are not monotonic")
        if status in _TERMINAL_STATUSES and terminal_at_ms is None:
            raise ValueError("terminal execution lineage has no timestamp")
        if status not in _TERMINAL_STATUSES and terminal_at_ms is not None:
            raise ValueError("non-terminal execution lineage has a terminal timestamp")

        return cls(
            session_id=session_id,
            logical_execution_id=logical_execution_id,
            root_attempt_id=root_attempt_id,
            current_attempt_id=current_attempt_id,
            status=status,
            revision=revision,
            created_at_ms=created_at_ms,
            updated_at_ms=updated_at_ms,
            owner_instance_id=owner_instance_id,
            terminal_at_ms=terminal_at_ms,
            reason=reason,
        )


@dataclass(frozen=True)
class ExecutionLineageResult:
    disposition: str
    snapshot: ExecutionLineageSnapshot

    @property
    def status(self) -> str:
        return self.snapshot.status

    def to_dict(self) -> dict[str, Any]:
        return {
            "disposition": self.disposition,
            "lineage": self.snapshot.to_dict(),
        }


class ExecutionLineageRegistry:
    """Durable owner and cancellation tombstone for one user task.

    A chat session may contain many logical executions. Each logical execution
    may have many concrete attempts, but terminal state is monotonic and shared
    by all of them. A stale Stop therefore cancels only its own task lineage and
    can never cancel a newer task in the same chat.
    """

    def __init__(
        self,
        data_dir: str | Path | None = None,
        *,
        clock_ms: Callable[[], int] | None = None,
        instance_id: str | None = None,
    ) -> None:
        self._data_dir = Path(data_dir).expanduser() if data_dir is not None else None
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))
        self._instance_id = (
            _validated_identifier(instance_id, "instance_id")
            if instance_id is not None
            else uuid.uuid4().hex
        )

    def register_attempt(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
        *,
        source_attempt_id: str = "",
    ) -> ExecutionLineageResult:
        session_id, logical_execution_id = self._identifiers(
            session_id,
            logical_execution_id,
        )
        attempt_id = _validated_identifier(attempt_id, "attempt_id")
        source_attempt_id = _validated_optional_identifier(
            source_attempt_id,
            "source_attempt_id",
        )

        def transition(
            current: ExecutionLineageSnapshot | None,
            now_ms: int,
        ) -> tuple[ExecutionLineageSnapshot | None, str]:
            if current is None:
                return self._new_snapshot(
                    session_id,
                    logical_execution_id,
                    attempt_id=attempt_id,
                    status="registered",
                    now_ms=now_ms,
                    owner_instance_id=self._instance_id,
                ), "applied"
            if current.cancelled:
                return None, "cancelled"
            if current.terminal:
                return None, "already_terminal"
            if current.current_attempt_id == attempt_id:
                return None, "unchanged"
            waiting_handoff = current.status in {
                "abandoned",
                "waiting_interaction",
                "waiting_job",
            }
            restart_takeover = bool(
                source_attempt_id
                and current.owner_instance_id != self._instance_id
            )
            # A source-attempt match is checkpoint evidence, not permission to
            # steal an owner that is still active in this process.  Same-boot
            # handoff is legal only after the current attempt has published a
            # waiting boundary.  A restarted sidecar may recover an active
            # record only because the adapter has already validated the durable
            # checkpoint and supplied its source attempt.
            if not waiting_handoff and not restart_takeover:
                return None, "active_attempt_conflict"
            return self._advance(
                current,
                attempt_id=attempt_id,
                status="registered",
                now_ms=now_ms,
                owner_instance_id=self._instance_id,
            ), "applied"

        return self._mutate(session_id, logical_execution_id, transition)

    def mark_running(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
    ) -> ExecutionLineageResult:
        return self._mark_status(
            session_id,
            logical_execution_id,
            attempt_id,
            status="running",
        )

    def mark_waiting_interaction(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
    ) -> ExecutionLineageResult:
        return self._mark_status(
            session_id,
            logical_execution_id,
            attempt_id,
            status="waiting_interaction",
        )

    def mark_waiting_job(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
    ) -> ExecutionLineageResult:
        return self._mark_status(
            session_id,
            logical_execution_id,
            attempt_id,
            status="waiting_job",
        )

    def mark_abandoned(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
        *,
        reason: str = "",
    ) -> ExecutionLineageResult:
        return self._mark_status(
            session_id,
            logical_execution_id,
            attempt_id,
            status="abandoned",
            reason=_normalized_reason(reason),
        )

    def mark_completed(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
    ) -> ExecutionLineageResult:
        return self._mark_status(
            session_id,
            logical_execution_id,
            attempt_id,
            status="completed",
        )

    def mark_failed(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
        *,
        reason: str = "",
    ) -> ExecutionLineageResult:
        return self._mark_status(
            session_id,
            logical_execution_id,
            attempt_id,
            status="failed",
            reason=_normalized_reason(reason),
        )

    def request_cancel(
        self,
        session_id: str,
        logical_execution_id: str,
        *,
        attempt_id: str = "",
        reason: str = "user_stop",
    ) -> ExecutionLineageResult:
        session_id, logical_execution_id = self._identifiers(
            session_id,
            logical_execution_id,
        )
        attempt_id = _validated_optional_identifier(attempt_id, "attempt_id")
        reason = _normalized_reason(reason) or "user_stop"

        def transition(
            current: ExecutionLineageSnapshot | None,
            now_ms: int,
        ) -> tuple[ExecutionLineageSnapshot | None, str]:
            if current is None:
                return self._new_snapshot(
                    session_id,
                    logical_execution_id,
                    attempt_id=attempt_id,
                    status="cancelled",
                    now_ms=now_ms,
                    terminal_at_ms=now_ms,
                    reason=reason,
                    owner_instance_id=self._instance_id,
                ), "cancelled_before_register"
            if current.cancelled:
                return None, "unchanged"
            if current.terminal:
                return None, "already_terminal"
            return self._advance(
                current,
                attempt_id=current.current_attempt_id,
                status="cancelled",
                now_ms=now_ms,
                terminal_at_ms=now_ms,
                reason=reason,
            ), "applied"

        return self._mutate(session_id, logical_execution_id, transition)

    def snapshot(
        self,
        session_id: str,
        logical_execution_id: str,
    ) -> ExecutionLineageSnapshot | None:
        session_id, logical_execution_id = self._identifiers(
            session_id,
            logical_execution_id,
        )
        path = self._record_path(
            session_id,
            logical_execution_id,
            create_directory=True,
        )
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session_id, logical_execution_id)
        return copy.deepcopy(current)

    def is_cancelled(self, session_id: str, logical_execution_id: str) -> bool:
        current = self.snapshot(session_id, logical_execution_id)
        return bool(current is not None and current.cancelled)

    def _mark_status(
        self,
        session_id: str,
        logical_execution_id: str,
        attempt_id: str,
        *,
        status: str,
        reason: str = "",
    ) -> ExecutionLineageResult:
        session_id, logical_execution_id = self._identifiers(
            session_id,
            logical_execution_id,
        )
        attempt_id = _validated_identifier(attempt_id, "attempt_id")
        if status not in _VALID_STATUSES or status == "cancelled":
            raise ExecutionLineageError(
                "invalid_execution_lineage_status",
                f"unsupported execution lineage transition: {status!r}",
                status_code=400,
            )

        def transition(
            current: ExecutionLineageSnapshot | None,
            now_ms: int,
        ) -> tuple[ExecutionLineageSnapshot | None, str]:
            terminal_at_ms = now_ms if status in _TERMINAL_STATUSES else None
            if current is None:
                return self._new_snapshot(
                    session_id,
                    logical_execution_id,
                    attempt_id=attempt_id,
                    status=status,
                    now_ms=now_ms,
                    terminal_at_ms=terminal_at_ms,
                    reason=reason,
                    owner_instance_id=self._instance_id,
                ), "applied"
            if current.status == status and current.current_attempt_id == attempt_id:
                return None, "unchanged"
            if current.terminal:
                return None, "already_terminal"
            if current.current_attempt_id and current.current_attempt_id != attempt_id:
                return None, "stale_attempt"
            return self._advance(
                current,
                attempt_id=attempt_id,
                status=status,
                now_ms=now_ms,
                terminal_at_ms=terminal_at_ms,
                reason=reason,
            ), "applied"

        return self._mutate(session_id, logical_execution_id, transition)

    def _mutate(
        self,
        session_id: str,
        logical_execution_id: str,
        transition: Callable[
            [ExecutionLineageSnapshot | None, int],
            tuple[ExecutionLineageSnapshot | None, str],
        ],
    ) -> ExecutionLineageResult:
        path = self._record_path(
            session_id,
            logical_execution_id,
            create_directory=True,
        )
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session_id, logical_execution_id)
            replacement, disposition = transition(current, self._now_ms())
            if replacement is not None:
                self._write_record(path, replacement)
                current = replacement
            if current is None:
                raise ExecutionLineageError(
                    "execution_lineage_transition_failed",
                    "execution lineage transition produced no record",
                )
        return ExecutionLineageResult(
            disposition=disposition,
            snapshot=copy.deepcopy(current),
        )

    @staticmethod
    def _new_snapshot(
        session_id: str,
        logical_execution_id: str,
        *,
        attempt_id: str,
        status: str,
        now_ms: int,
        terminal_at_ms: int | None = None,
        reason: str = "",
        owner_instance_id: str = "",
    ) -> ExecutionLineageSnapshot:
        return ExecutionLineageSnapshot(
            session_id=session_id,
            logical_execution_id=logical_execution_id,
            root_attempt_id=attempt_id,
            current_attempt_id=attempt_id,
            status=status,
            revision=1,
            created_at_ms=now_ms,
            updated_at_ms=now_ms,
            owner_instance_id=owner_instance_id,
            terminal_at_ms=terminal_at_ms,
            reason=reason,
        )

    @staticmethod
    def _advance(
        current: ExecutionLineageSnapshot,
        *,
        attempt_id: str,
        status: str,
        now_ms: int,
        terminal_at_ms: int | None = None,
        reason: str = "",
        owner_instance_id: str | None = None,
    ) -> ExecutionLineageSnapshot:
        return ExecutionLineageSnapshot(
            session_id=current.session_id,
            logical_execution_id=current.logical_execution_id,
            root_attempt_id=current.root_attempt_id or attempt_id,
            current_attempt_id=attempt_id,
            status=status,
            revision=current.revision + 1,
            created_at_ms=current.created_at_ms,
            updated_at_ms=max(current.updated_at_ms, now_ms),
            owner_instance_id=(
                current.owner_instance_id
                if owner_instance_id is None
                else owner_instance_id
            ),
            terminal_at_ms=terminal_at_ms,
            reason=reason,
        )

    def _now_ms(self) -> int:
        now = self._clock_ms()
        if isinstance(now, bool) or not isinstance(now, int) or now < 0:
            raise ExecutionLineageError(
                "execution_lineage_clock_invalid",
                "clock_ms must return a non-negative integer epoch timestamp",
            )
        return now

    @staticmethod
    def _identifiers(session_id: str, logical_execution_id: str) -> tuple[str, str]:
        return (
            _validated_identifier(session_id, "session_id"),
            _validated_identifier(logical_execution_id, "logical_execution_id"),
        )

    def _root(self, *, create: bool) -> Path:
        data_dir = self._data_dir
        if data_dir is None:
            raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
            if not raw:
                raise ExecutionLineageError(
                    "execution_lineage_unavailable",
                    "UNCHAIN_DATA_DIR is not configured",
                    status_code=503,
                )
            data_dir = Path(raw).expanduser()
        root = data_dir.resolve() / _LINEAGES_DIRECTORY
        if create:
            root.mkdir(parents=True, exist_ok=True, mode=0o700)
            if os.name != "nt":
                os.chmod(root, 0o700)
        return root

    def _record_path(
        self,
        session_id: str,
        logical_execution_id: str,
        *,
        create_directory: bool,
    ) -> Path:
        root = self._root(create=create_directory)
        directory = root / _identifier_digest(session_id)[:32]
        if create_directory:
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            if os.name != "nt":
                os.chmod(directory, 0o700)
        return directory / f"{_identifier_digest(logical_execution_id)}.json"

    @staticmethod
    def _lock_path(record_path: Path) -> Path:
        return record_path.with_name(f".{record_path.name}.lock")

    @staticmethod
    def _read_record(
        path: Path,
        session_id: str,
        logical_execution_id: str,
    ) -> ExecutionLineageSnapshot | None:
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
            snapshot = ExecutionLineageSnapshot.from_dict(raw)
        except (
            OSError,
            UnicodeError,
            json.JSONDecodeError,
            ValueError,
            ExecutionLineageError,
        ) as exc:
            raise ExecutionLineageError(
                "execution_lineage_corrupt",
                "execution lineage record is unreadable or invalid: "
                f"session_id={session_id!r}, logical_execution_id={logical_execution_id!r}",
            ) from exc
        if (
            snapshot.session_id != session_id
            or snapshot.logical_execution_id != logical_execution_id
        ):
            raise ExecutionLineageError(
                "execution_lineage_identity_mismatch",
                "execution lineage identity does not match its path",
            )
        return snapshot

    @staticmethod
    def _write_record(path: Path, snapshot: ExecutionLineageSnapshot) -> None:
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        serialized = json.dumps(
            snapshot.to_dict(),
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
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def _validated_identifier(value: Any, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ExecutionLineageError(
            f"invalid_{field_name}",
            f"{field_name} is required",
            status_code=400,
        )
    return normalized


def _validated_optional_identifier(value: Any, field_name: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    return value.strip()


def _validated_non_negative_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field_name} must be a non-negative integer")
    return value


def _validated_optional_timestamp(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    return _validated_non_negative_int(value, field_name)


def _normalized_reason(value: Any) -> str:
    if not isinstance(value, str):
        raise ExecutionLineageError(
            "invalid_execution_lineage_reason",
            "execution lineage reason must be a string",
            status_code=400,
        )
    return value.strip()[:1024]


def _identifier_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@contextmanager
def _exclusive_file_lock(path: Path) -> Iterator[None]:
    file_descriptor = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        if os.name != "nt":
            os.chmod(path, 0o600)
        if os.name == "nt":  # pragma: no cover - Windows deployment guard
            import msvcrt

            if os.fstat(file_descriptor).st_size == 0:
                os.write(file_descriptor, b"\0")
                os.fsync(file_descriptor)
            os.lseek(file_descriptor, 0, os.SEEK_SET)
            msvcrt.locking(file_descriptor, msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                os.lseek(file_descriptor, 0, os.SEEK_SET)
                msvcrt.locking(file_descriptor, msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(file_descriptor, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(file_descriptor, fcntl.LOCK_UN)
    finally:
        os.close(file_descriptor)


_DEFAULT_REGISTRY = ExecutionLineageRegistry()


def get_registry() -> ExecutionLineageRegistry:
    return _DEFAULT_REGISTRY


def register_attempt(
    session_id: str,
    logical_execution_id: str,
    attempt_id: str,
    *,
    source_attempt_id: str = "",
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.register_attempt(
        session_id,
        logical_execution_id,
        attempt_id,
        source_attempt_id=source_attempt_id,
    )


def mark_running(
    session_id: str,
    logical_execution_id: str,
    attempt_id: str,
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.mark_running(
        session_id,
        logical_execution_id,
        attempt_id,
    )


def mark_waiting_interaction(
    session_id: str,
    logical_execution_id: str,
    attempt_id: str,
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.mark_waiting_interaction(
        session_id,
        logical_execution_id,
        attempt_id,
    )


def mark_waiting_job(
    session_id: str,
    logical_execution_id: str,
    attempt_id: str,
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.mark_waiting_job(
        session_id,
        logical_execution_id,
        attempt_id,
    )


def mark_abandoned(
    session_id: str,
    logical_execution_id: str,
    attempt_id: str,
    *,
    reason: str = "",
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.mark_abandoned(
        session_id,
        logical_execution_id,
        attempt_id,
        reason=reason,
    )


def mark_completed(
    session_id: str,
    logical_execution_id: str,
    attempt_id: str,
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.mark_completed(
        session_id,
        logical_execution_id,
        attempt_id,
    )


def mark_failed(
    session_id: str,
    logical_execution_id: str,
    attempt_id: str,
    *,
    reason: str = "",
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.mark_failed(
        session_id,
        logical_execution_id,
        attempt_id,
        reason=reason,
    )


def request_cancel(
    session_id: str,
    logical_execution_id: str,
    *,
    attempt_id: str = "",
    reason: str = "user_stop",
) -> ExecutionLineageResult:
    return _DEFAULT_REGISTRY.request_cancel(
        session_id,
        logical_execution_id,
        attempt_id=attempt_id,
        reason=reason,
    )


def snapshot(
    session_id: str,
    logical_execution_id: str,
) -> ExecutionLineageSnapshot | None:
    return _DEFAULT_REGISTRY.snapshot(session_id, logical_execution_id)


def is_cancelled(session_id: str, logical_execution_id: str) -> bool:
    return _DEFAULT_REGISTRY.is_cancelled(session_id, logical_execution_id)


__all__ = [
    "ExecutionLineageError",
    "ExecutionLineageRegistry",
    "ExecutionLineageResult",
    "ExecutionLineageSnapshot",
    "get_registry",
    "is_cancelled",
    "mark_abandoned",
    "mark_completed",
    "mark_failed",
    "mark_running",
    "mark_waiting_interaction",
    "mark_waiting_job",
    "register_attempt",
    "request_cancel",
    "snapshot",
]
