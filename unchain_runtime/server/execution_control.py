from __future__ import annotations

import copy
import hashlib
import json
import os
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator


_SCHEMA_VERSION = 1
_EXECUTIONS_DIRECTORY = "executions"
_TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})
_VALID_STATUSES = frozenset(
    {"registered", "running", "completed", "failed", "cancelled"}
)
_TOKEN_REFRESH_INTERVAL_SECONDS = 0.05
_PROCESS_OWNER_ID = uuid.uuid4().hex


class ExecutionControlError(RuntimeError):
    """Fail-closed error raised by the durable execution control registry."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 500,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = str(code or "execution_control_failed")
        self.status_code = int(status_code)
        self.retryable = bool(retryable)


class ExecutionAttemptCancelled(ExecutionControlError):
    """Raised when cooperative work observes an exact-attempt cancellation."""

    def __init__(self, *, session_id: str, attempt_id: str, reason: str) -> None:
        self.session_id = session_id
        self.attempt_id = attempt_id
        self.reason = reason
        super().__init__(
            "execution_cancelled",
            "execution attempt was cancelled: "
            f"session_id={session_id!r}, attempt_id={attempt_id!r}",
            status_code=409,
        )


@dataclass(frozen=True)
class ExecutionControlSnapshot:
    session_id: str
    attempt_id: str
    status: str
    revision: int
    created_at_ms: int
    updated_at_ms: int
    registered_at_ms: int | None = None
    running_at_ms: int | None = None
    terminal_at_ms: int | None = None
    reason: str = ""
    owner_id: str = ""
    owner_pid: int | None = None

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
            "attempt_id": self.attempt_id,
            "status": self.status,
            "revision": self.revision,
            "created_at_ms": self.created_at_ms,
            "updated_at_ms": self.updated_at_ms,
            "registered_at_ms": self.registered_at_ms,
            "running_at_ms": self.running_at_ms,
            "terminal_at_ms": self.terminal_at_ms,
            "reason": self.reason,
            "owner_id": self.owner_id,
            "owner_pid": self.owner_pid,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> "ExecutionControlSnapshot":
        if not isinstance(raw, dict):
            raise ValueError("execution control record must be a JSON object")
        if raw.get("schema_version") != _SCHEMA_VERSION:
            raise ValueError("unsupported execution control schema version")

        session_id = _validated_identifier(raw.get("session_id"), "session_id")
        attempt_id = _validated_identifier(raw.get("attempt_id"), "attempt_id")
        status = str(raw.get("status") or "")
        if status not in _VALID_STATUSES:
            raise ValueError("execution control status is invalid")

        revision = _validated_non_negative_int(raw.get("revision"), "revision")
        if revision <= 0:
            raise ValueError("execution control revision must be positive")
        created_at_ms = _validated_non_negative_int(
            raw.get("created_at_ms"),
            "created_at_ms",
        )
        updated_at_ms = _validated_non_negative_int(
            raw.get("updated_at_ms"),
            "updated_at_ms",
        )
        registered_at_ms = _validated_optional_timestamp(
            raw.get("registered_at_ms"),
            "registered_at_ms",
        )
        running_at_ms = _validated_optional_timestamp(
            raw.get("running_at_ms"),
            "running_at_ms",
        )
        terminal_at_ms = _validated_optional_timestamp(
            raw.get("terminal_at_ms"),
            "terminal_at_ms",
        )
        reason = raw.get("reason", "")
        if not isinstance(reason, str):
            raise ValueError("execution control reason must be a string")
        owner_id = raw.get("owner_id", "")
        if not isinstance(owner_id, str):
            raise ValueError("execution control owner_id must be a string")
        owner_pid = _validated_optional_positive_int(
            raw.get("owner_pid"),
            "owner_pid",
        )
        if updated_at_ms < created_at_ms:
            raise ValueError("execution control timestamps are not monotonic")
        if status in _TERMINAL_STATUSES and terminal_at_ms is None:
            raise ValueError("terminal execution control record has no timestamp")
        if status not in _TERMINAL_STATUSES and terminal_at_ms is not None:
            raise ValueError("non-terminal execution control record has a terminal timestamp")

        return cls(
            session_id=session_id,
            attempt_id=attempt_id,
            status=status,
            revision=revision,
            created_at_ms=created_at_ms,
            updated_at_ms=updated_at_ms,
            registered_at_ms=registered_at_ms,
            running_at_ms=running_at_ms,
            terminal_at_ms=terminal_at_ms,
            reason=reason,
            owner_id=owner_id.strip(),
            owner_pid=owner_pid,
        )


@dataclass(frozen=True)
class ExecutionControlResult:
    disposition: str
    snapshot: ExecutionControlSnapshot

    @property
    def status(self) -> str:
        return self.snapshot.status

    def to_dict(self) -> dict[str, Any]:
        return {
            "disposition": self.disposition,
            "execution": self.snapshot.to_dict(),
        }


class ExecutionCancellationToken:
    """Read-only cooperative token for one exact execution attempt."""

    def __init__(
        self,
        *,
        registry: "ExecutionControlRegistry",
        session_id: str,
        attempt_id: str,
        event: threading.Event,
    ) -> None:
        self._registry = registry
        self.session_id = session_id
        self.attempt_id = attempt_id
        self.event = event
        self._refresh_lock = threading.Lock()
        self._next_refresh_at = 0.0

    @property
    def cancelled(self) -> bool:
        return self.is_cancelled()

    @property
    def reason(self) -> str:
        snapshot = self._registry.snapshot(self.session_id, self.attempt_id)
        if snapshot is None or not snapshot.cancelled:
            return ""
        self.event.set()
        return snapshot.reason

    def is_cancelled(self) -> bool:
        if self.event.is_set():
            return True
        now = time.monotonic()
        if now < self._next_refresh_at:
            return False
        with self._refresh_lock:
            if self.event.is_set():
                return True
            now = time.monotonic()
            if now < self._next_refresh_at:
                return False
            snapshot = self._registry.snapshot(self.session_id, self.attempt_id)
            self._next_refresh_at = now + _TOKEN_REFRESH_INTERVAL_SECONDS
            if snapshot is not None and snapshot.cancelled:
                self.event.set()
        return self.event.is_set()

    def wait(self, timeout: float | None = None) -> bool:
        if timeout is not None:
            timeout = max(0.0, float(timeout))
        deadline = None if timeout is None else time.monotonic() + timeout
        while not self.is_cancelled():
            remaining = None if deadline is None else deadline - time.monotonic()
            if remaining is not None and remaining <= 0:
                return False
            self.event.wait(
                0.05 if remaining is None else min(0.05, max(0.0, remaining))
            )
        return True

    def raise_if_cancelled(self) -> None:
        if self.is_cancelled():
            raise ExecutionAttemptCancelled(
                session_id=self.session_id,
                attempt_id=self.attempt_id,
                reason=self.reason,
            )


class ExecutionControlRegistry:
    """Durable exact-attempt lifecycle and cancellation registry.

    ``session_id`` names the shared lease resource. ``attempt_id`` names one
    exact logical owner. Every mutation of one attempt is serialized by the
    same on-disk lock, so completion and cancellation form a real CAS race:
    whichever terminal transition acquires the lock first wins permanently.
    """

    def __init__(
        self,
        data_dir: str | Path | None = None,
        *,
        clock_ms: Callable[[], int] | None = None,
        process_owner_id: str | None = None,
        process_pid: int | None = None,
        process_is_alive: Callable[[int], bool] | None = None,
    ) -> None:
        self._data_dir = Path(data_dir).expanduser() if data_dir is not None else None
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))
        self._process_owner_id = str(process_owner_id or _PROCESS_OWNER_ID).strip()
        if not self._process_owner_id:
            raise ValueError("process_owner_id must be non-empty")
        self._process_pid = int(process_pid if process_pid is not None else os.getpid())
        if self._process_pid <= 0:
            raise ValueError("process_pid must be positive")
        self._process_is_alive = process_is_alive or _process_is_alive
        self._events: dict[tuple[str, str, str], threading.Event] = {}
        self._events_lock = threading.RLock()

    def register(self, session_id: str, attempt_id: str) -> ExecutionControlResult:
        session_id, attempt_id = self._identifiers(session_id, attempt_id)

        def transition(
            current: ExecutionControlSnapshot | None,
            now_ms: int,
        ) -> tuple[ExecutionControlSnapshot | None, str]:
            if current is None:
                return self._new_snapshot(
                    session_id,
                    attempt_id,
                    status="registered",
                    now_ms=now_ms,
                    registered_at_ms=now_ms,
                ), "applied"
            if current.cancelled and current.registered_at_ms is None:
                return None, "cancelled_before_register"
            if current.terminal:
                return None, "already_terminal"
            return None, "unchanged"

        return self._mutate(session_id, attempt_id, transition)

    def mark_running(
        self,
        session_id: str,
        attempt_id: str,
    ) -> ExecutionControlResult:
        session_id, attempt_id = self._identifiers(session_id, attempt_id)

        def transition(
            current: ExecutionControlSnapshot | None,
            now_ms: int,
        ) -> tuple[ExecutionControlSnapshot | None, str]:
            if current is None:
                return self._new_snapshot(
                    session_id,
                    attempt_id,
                    status="running",
                    now_ms=now_ms,
                    registered_at_ms=now_ms,
                    running_at_ms=now_ms,
                    owner_id=self._process_owner_id,
                    owner_pid=self._process_pid,
                ), "applied"
            if current.terminal:
                return None, "already_terminal"
            if current.status == "running":
                if self._running_owner_is_live(current):
                    return None, "unchanged"
                return self._advance(
                    current,
                    status="running",
                    now_ms=now_ms,
                    running_at_ms=now_ms,
                    owner_id=self._process_owner_id,
                    owner_pid=self._process_pid,
                ), "applied"
            return self._advance(
                current,
                status="running",
                now_ms=now_ms,
                running_at_ms=current.running_at_ms or now_ms,
                owner_id=self._process_owner_id,
                owner_pid=self._process_pid,
            ), "applied"

        return self._mutate(session_id, attempt_id, transition)

    def _running_owner_is_live(
        self,
        current: ExecutionControlSnapshot,
    ) -> bool:
        if (
            current.owner_id == self._process_owner_id
            and current.owner_pid == self._process_pid
        ):
            return True
        if (
            current.owner_id
            and current.owner_pid == self._process_pid
            and current.owner_id != self._process_owner_id
        ):
            # A different process incarnation cannot still be alive with this
            # process's PID. Treat PID reuse as a dead predecessor.
            return False
        if current.owner_pid is not None:
            return bool(self._process_is_alive(current.owner_pid))
        # Legacy v1 records have no provable owner. Fail closed instead of
        # risking concurrent execution while such a worker may still exist.
        return True

    def mark_completed(
        self,
        session_id: str,
        attempt_id: str,
    ) -> ExecutionControlResult:
        return self._mark_terminal(
            session_id,
            attempt_id,
            status="completed",
            reason="",
        )

    def mark_failed(
        self,
        session_id: str,
        attempt_id: str,
        *,
        reason: str = "",
    ) -> ExecutionControlResult:
        return self._mark_terminal(
            session_id,
            attempt_id,
            status="failed",
            reason=_normalized_reason(reason),
        )

    def request_cancel(
        self,
        session_id: str,
        attempt_id: str,
        *,
        reason: str = "user_stop",
    ) -> ExecutionControlResult:
        session_id, attempt_id = self._identifiers(session_id, attempt_id)
        reason = _normalized_reason(reason) or "user_stop"

        def transition(
            current: ExecutionControlSnapshot | None,
            now_ms: int,
        ) -> tuple[ExecutionControlSnapshot | None, str]:
            if current is None:
                return self._new_snapshot(
                    session_id,
                    attempt_id,
                    status="cancelled",
                    now_ms=now_ms,
                    terminal_at_ms=now_ms,
                    reason=reason,
                ), "cancelled_before_register"
            if current.cancelled:
                return None, "unchanged"
            if current.terminal:
                return None, "already_terminal"
            return self._advance(
                current,
                status="cancelled",
                now_ms=now_ms,
                terminal_at_ms=now_ms,
                reason=reason,
            ), "applied"

        result = self._mutate(session_id, attempt_id, transition)
        if result.snapshot.cancelled:
            self._event(session_id, attempt_id).set()
        return result

    def snapshot(
        self,
        session_id: str,
        attempt_id: str,
    ) -> ExecutionControlSnapshot | None:
        session_id, attempt_id = self._identifiers(session_id, attempt_id)
        path = self._record_path(session_id, attempt_id, create_directory=True)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session_id, attempt_id)
        if current is not None and current.cancelled:
            self._event(session_id, attempt_id).set()
        return copy.deepcopy(current)

    def cancellation_token(
        self,
        session_id: str,
        attempt_id: str,
    ) -> ExecutionCancellationToken:
        session_id, attempt_id = self._identifiers(session_id, attempt_id)
        token = ExecutionCancellationToken(
            registry=self,
            session_id=session_id,
            attempt_id=attempt_id,
            event=self._event(session_id, attempt_id),
        )
        token.is_cancelled()
        return token

    def cancellation_event(
        self,
        session_id: str,
        attempt_id: str,
    ) -> threading.Event:
        return self.cancellation_token(session_id, attempt_id).event

    def is_cancelled(self, session_id: str, attempt_id: str) -> bool:
        return self.cancellation_token(session_id, attempt_id).is_cancelled()

    def _mark_terminal(
        self,
        session_id: str,
        attempt_id: str,
        *,
        status: str,
        reason: str,
    ) -> ExecutionControlResult:
        session_id, attempt_id = self._identifiers(session_id, attempt_id)

        def transition(
            current: ExecutionControlSnapshot | None,
            now_ms: int,
        ) -> tuple[ExecutionControlSnapshot | None, str]:
            if current is None:
                return self._new_snapshot(
                    session_id,
                    attempt_id,
                    status=status,
                    now_ms=now_ms,
                    terminal_at_ms=now_ms,
                    reason=reason,
                ), "applied"
            if current.status == status:
                return None, "unchanged"
            if current.terminal:
                return None, "already_terminal"
            if current.status == "running" and (
                current.owner_id != self._process_owner_id
                or current.owner_pid != self._process_pid
            ):
                return None, "stale_owner"
            return self._advance(
                current,
                status=status,
                now_ms=now_ms,
                terminal_at_ms=now_ms,
                reason=reason,
            ), "applied"

        return self._mutate(session_id, attempt_id, transition)

    def _mutate(
        self,
        session_id: str,
        attempt_id: str,
        transition: Callable[
            [ExecutionControlSnapshot | None, int],
            tuple[ExecutionControlSnapshot | None, str],
        ],
    ) -> ExecutionControlResult:
        path = self._record_path(session_id, attempt_id, create_directory=True)
        with _exclusive_file_lock(self._lock_path(path)):
            current = self._read_record(path, session_id, attempt_id)
            replacement, disposition = transition(current, self._now_ms())
            if replacement is not None:
                self._write_record(path, replacement)
                current = replacement
            if current is None:
                raise ExecutionControlError(
                    "execution_control_transition_failed",
                    "execution control transition produced no record",
                )
        if current.cancelled:
            self._event(session_id, attempt_id).set()
        return ExecutionControlResult(
            disposition=disposition,
            snapshot=copy.deepcopy(current),
        )

    def _new_snapshot(
        self,
        session_id: str,
        attempt_id: str,
        *,
        status: str,
        now_ms: int,
        registered_at_ms: int | None = None,
        running_at_ms: int | None = None,
        terminal_at_ms: int | None = None,
        reason: str = "",
        owner_id: str = "",
        owner_pid: int | None = None,
    ) -> ExecutionControlSnapshot:
        return ExecutionControlSnapshot(
            session_id=session_id,
            attempt_id=attempt_id,
            status=status,
            revision=1,
            created_at_ms=now_ms,
            updated_at_ms=now_ms,
            registered_at_ms=registered_at_ms,
            running_at_ms=running_at_ms,
            terminal_at_ms=terminal_at_ms,
            reason=reason,
            owner_id=owner_id,
            owner_pid=owner_pid,
        )

    @staticmethod
    def _advance(
        current: ExecutionControlSnapshot,
        *,
        status: str,
        now_ms: int,
        running_at_ms: int | None = None,
        terminal_at_ms: int | None = None,
        reason: str = "",
        owner_id: str | None = None,
        owner_pid: int | None = None,
    ) -> ExecutionControlSnapshot:
        return ExecutionControlSnapshot(
            session_id=current.session_id,
            attempt_id=current.attempt_id,
            status=status,
            revision=current.revision + 1,
            created_at_ms=current.created_at_ms,
            updated_at_ms=max(current.updated_at_ms, now_ms),
            registered_at_ms=current.registered_at_ms,
            running_at_ms=(
                current.running_at_ms
                if running_at_ms is None
                else running_at_ms
            ),
            terminal_at_ms=terminal_at_ms,
            reason=reason,
            owner_id=current.owner_id if owner_id is None else owner_id,
            owner_pid=current.owner_pid if owner_id is None else owner_pid,
        )

    def _now_ms(self) -> int:
        now = self._clock_ms()
        if isinstance(now, bool) or not isinstance(now, int) or now < 0:
            raise ExecutionControlError(
                "execution_control_clock_invalid",
                "clock_ms must return a non-negative integer epoch timestamp",
            )
        return now

    @staticmethod
    def _identifiers(session_id: str, attempt_id: str) -> tuple[str, str]:
        return (
            _validated_identifier(session_id, "session_id"),
            _validated_identifier(attempt_id, "attempt_id"),
        )

    def _root(self, *, create: bool) -> Path:
        data_dir = self._data_dir
        if data_dir is None:
            raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
            if not raw:
                raise ExecutionControlError(
                    "execution_control_unavailable",
                    "UNCHAIN_DATA_DIR is not configured",
                    status_code=503,
                )
            data_dir = Path(raw).expanduser()
        root = data_dir.resolve() / _EXECUTIONS_DIRECTORY
        if create:
            root.mkdir(parents=True, exist_ok=True, mode=0o700)
            if os.name != "nt":
                os.chmod(root, 0o700)
        return root

    def _record_path(
        self,
        session_id: str,
        attempt_id: str,
        *,
        create_directory: bool,
    ) -> Path:
        root = self._root(create=create_directory)
        directory = root / _identifier_digest(session_id)[:32]
        if create_directory:
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            if os.name != "nt":
                os.chmod(directory, 0o700)
        return directory / f"{_identifier_digest(attempt_id)}.json"

    @staticmethod
    def _lock_path(record_path: Path) -> Path:
        return record_path.with_name(f".{record_path.name}.lock")

    def _event(self, session_id: str, attempt_id: str) -> threading.Event:
        root_key = str(self._root(create=True))
        key = (root_key, session_id, attempt_id)
        with self._events_lock:
            event = self._events.get(key)
            if event is None:
                event = threading.Event()
                self._events[key] = event
            return event

    @staticmethod
    def _read_record(
        path: Path,
        session_id: str,
        attempt_id: str,
    ) -> ExecutionControlSnapshot | None:
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
            snapshot = ExecutionControlSnapshot.from_dict(raw)
        except (
            OSError,
            UnicodeError,
            json.JSONDecodeError,
            ValueError,
            ExecutionControlError,
        ) as exc:
            raise ExecutionControlError(
                "execution_control_corrupt",
                "execution control record is unreadable or invalid: "
                f"session_id={session_id!r}, attempt_id={attempt_id!r}",
            ) from exc
        if snapshot.session_id != session_id or snapshot.attempt_id != attempt_id:
            raise ExecutionControlError(
                "execution_control_identity_mismatch",
                "execution control record identity does not match its path",
            )
        return snapshot

    @staticmethod
    def _write_record(path: Path, snapshot: ExecutionControlSnapshot) -> None:
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
            if os.name != "nt":
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
        raise ExecutionControlError(
            f"invalid_{field_name}",
            f"{field_name} is required",
            status_code=400,
        )
    return normalized


def _validated_non_negative_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field_name} must be a non-negative integer")
    return value


def _validated_optional_timestamp(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    return _validated_non_negative_int(value, field_name)


def _validated_optional_positive_int(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} must be a positive integer")
    return value


def _process_is_alive(process_id: int) -> bool:
    if process_id == os.getpid():
        return True
    try:
        os.kill(process_id, 0)
    except ProcessLookupError:
        return False
    except (PermissionError, OSError):
        return True
    return True


def _normalized_reason(value: Any) -> str:
    if not isinstance(value, str):
        raise ExecutionControlError(
            "invalid_execution_reason",
            "execution reason must be a string",
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
        if os.name == "nt":
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


_DEFAULT_REGISTRY = ExecutionControlRegistry()


def get_registry() -> ExecutionControlRegistry:
    return _DEFAULT_REGISTRY


def get_execution_control_registry() -> ExecutionControlRegistry:
    return _DEFAULT_REGISTRY


def register(session_id: str, attempt_id: str) -> ExecutionControlResult:
    from session_execution_guard import initialize_session_guard_protocol

    initialize_session_guard_protocol()
    return _DEFAULT_REGISTRY.register(session_id, attempt_id)


def mark_running(session_id: str, attempt_id: str) -> ExecutionControlResult:
    from session_execution_guard import acquire_run_guard, release_run_guard

    guard_disposition = acquire_run_guard(session_id, attempt_id)
    guard_was_new = guard_disposition in {"acquired", "reclaimed"}
    try:
        result = _DEFAULT_REGISTRY.mark_running(session_id, attempt_id)
    except BaseException:
        if guard_was_new:
            release_run_guard(session_id, attempt_id)
        raise
    if result.snapshot.terminal or (
        guard_was_new and result.snapshot.status != "running"
    ):
        release_run_guard(session_id, attempt_id)
    return result


def inspect_mark_running_ambiguity(
    session_id: str,
    attempt_id: str,
) -> ExecutionControlResult | None:
    """Classify a mark-running exception from exact durable state only."""

    snapshot_value = _DEFAULT_REGISTRY.snapshot(session_id, attempt_id)
    if snapshot_value is None:
        return None
    if snapshot_value.status == "running":
        disposition = (
            "applied"
            if (
                snapshot_value.owner_id == _DEFAULT_REGISTRY._process_owner_id
                and snapshot_value.owner_pid == _DEFAULT_REGISTRY._process_pid
            )
            else "foreign_running"
        )
    elif snapshot_value.terminal:
        disposition = "already_terminal"
    else:
        disposition = "not_applied"
    return ExecutionControlResult(
        disposition=disposition,
        snapshot=snapshot_value,
    )


def mark_completed(session_id: str, attempt_id: str) -> ExecutionControlResult:
    from session_execution_guard import release_run_guard

    result = _DEFAULT_REGISTRY.mark_completed(session_id, attempt_id)
    if result.snapshot.terminal:
        release_run_guard(session_id, attempt_id)
    return result


def mark_failed(
    session_id: str,
    attempt_id: str,
    *,
    reason: str = "",
) -> ExecutionControlResult:
    from session_execution_guard import release_run_guard

    result = _DEFAULT_REGISTRY.mark_failed(session_id, attempt_id, reason=reason)
    if result.snapshot.terminal:
        release_run_guard(session_id, attempt_id)
    return result


def finish_cancelled_run(session_id: str, attempt_id: str) -> str:
    """Release the session only after a cancelled worker has stopped writing."""

    from session_execution_guard import release_run_guard

    return release_run_guard(session_id, attempt_id)


def request_cancel(
    session_id: str,
    attempt_id: str,
    *,
    reason: str = "user_stop",
) -> ExecutionControlResult:
    from session_execution_guard import initialize_session_guard_protocol

    initialize_session_guard_protocol()
    return _DEFAULT_REGISTRY.request_cancel(session_id, attempt_id, reason=reason)


def snapshot(
    session_id: str,
    attempt_id: str,
) -> ExecutionControlSnapshot | None:
    return _DEFAULT_REGISTRY.snapshot(session_id, attempt_id)


def cancellation_token(
    session_id: str,
    attempt_id: str,
) -> ExecutionCancellationToken:
    return _DEFAULT_REGISTRY.cancellation_token(session_id, attempt_id)


def cancellation_event(session_id: str, attempt_id: str) -> threading.Event:
    return _DEFAULT_REGISTRY.cancellation_event(session_id, attempt_id)


def is_cancelled(session_id: str, attempt_id: str) -> bool:
    return _DEFAULT_REGISTRY.is_cancelled(session_id, attempt_id)


__all__ = [
    "ExecutionAttemptCancelled",
    "ExecutionCancellationToken",
    "ExecutionControlError",
    "ExecutionControlRegistry",
    "ExecutionControlResult",
    "ExecutionControlSnapshot",
    "cancellation_event",
    "cancellation_token",
    "finish_cancelled_run",
    "get_execution_control_registry",
    "get_registry",
    "inspect_mark_running_ambiguity",
    "is_cancelled",
    "mark_completed",
    "mark_failed",
    "mark_running",
    "register",
    "request_cancel",
    "snapshot",
]
