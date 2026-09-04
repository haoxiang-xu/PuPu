"""Windows-only containment primitives for the Vault sink supervisor.

This module intentionally contains no worker dispatch or plaintext handling.
It freezes the small ABI/control foundation that the Windows supervisor will
use later: owned Win32 handles and a one-frame, static READY/error protocol.
"""

from __future__ import annotations

import ctypes
import ntpath
import os
import struct
import subprocess
import sys
import time
from collections.abc import Callable, Mapping, MutableMapping
from pathlib import Path
from typing import Any


CONTROL_PROTOCOL = 1
MAX_CONTROL_FRAME_BYTES = 256
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION = 1
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x00000800
JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK = 0x00001000
PROCESS_QUERY_LIMITED_INFORMATION = 0x00001000
SYNCHRONIZE = 0x00100000
WAIT_OBJECT_0 = 0
WAIT_TIMEOUT = 258
WAIT_FAILED = 0xFFFFFFFF
MAXIMUM_WAIT_OBJECTS = 64
TH32CS_SNAPPROCESS = 0x00000002
MAX_PATH = 260
HANDLE_FLAG_INHERIT = 0x00000001
DUPLICATE_SAME_ACCESS = 0x00000002
STD_INPUT_HANDLE = -10
STD_OUTPUT_HANDLE = -11
GENERIC_WRITE = 0x40000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3
FILE_ATTRIBUTE_NORMAL = 0x00000080
ERROR_INSUFFICIENT_BUFFER = 122
PROC_THREAD_ATTRIBUTE_HANDLE_LIST = 0x00020002
PROC_THREAD_ATTRIBUTE_JOB_LIST = 0x0002000D
STARTF_USESTDHANDLES = 0x00000100
CREATE_UNICODE_ENVIRONMENT = 0x00000400
EXTENDED_STARTUPINFO_PRESENT = 0x00080000
CREATE_NO_WINDOW = 0x08000000
WORKER_BOOTSTRAP_VERSION = "1"
WORKER_BOOTSTRAP_VERSION_ENV = "PUPU_VAULT_WORKER_BOOTSTRAP_VERSION"
WORKER_READY_EVENT_ENV = "PUPU_VAULT_WORKER_READY_EVENT"
DEFAULT_DRAIN_TIMEOUT_MS = 5_000
DEFAULT_DRAIN_POLL_INTERVAL_MS = 25
DEFAULT_READY_WAIT_TIMEOUT_MS = 15_000
_MAX_SNAPSHOT_PROCESSES = 65536
_MAX_WIN32_PID = 0xFFFFFFFF
_MAX_COMMAND_LINE_CHARS = 32767
_MINIMAL_WORKER_ENVIRONMENT = frozenset(
    {
        "ALLUSERSPROFILE",
        "APPDATA",
        "COMMONPROGRAMFILES",
        "COMMONPROGRAMFILES(X86)",
        "COMSPEC",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOCALAPPDATA",
        "NUMBER_OF_PROCESSORS",
        "OS",
        "PATH",
        "PATHEXT",
        "PROCESSOR_ARCHITECTURE",
        "PROCESSOR_IDENTIFIER",
        "PROCESSOR_LEVEL",
        "PROCESSOR_REVISION",
        "PROGRAMDATA",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "PUBLIC",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "WINDIR",
    }
)
READY_CONTROL_BODY = (
    b'{"containment":"win32_job_list_v1","kind":"ready","protocol":1}'
)
_CONTROL_ERROR_CODES = frozenset(
    {
        "vault_worker_containment_unsupported",
        "vault_worker_parent_unavailable",
        "vault_worker_job_setup_failed",
        "vault_worker_handle_setup_failed",
        "vault_worker_spawn_failed",
        "vault_worker_attestation_failed",
        "vault_worker_ready_timeout",
    }
)

HANDLE = ctypes.c_void_p
DWORD = ctypes.c_uint32
BOOL = ctypes.c_int
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


class FILETIME(ctypes.Structure):
    _fields_ = [
        ("dwLowDateTime", DWORD),
        ("dwHighDateTime", DWORD),
    ]


class PROCESSENTRY32W(ctypes.Structure):
    # Windows WCHAR is always 16-bit. ctypes.c_wchar follows the host ABI and
    # is 32-bit on Unix, so use c_uint16 to keep this x64 layout testable on
    # non-Windows fake-kernel hosts.
    _fields_ = [
        ("dwSize", DWORD),
        ("cntUsage", DWORD),
        ("th32ProcessID", DWORD),
        ("th32DefaultHeapID", ctypes.c_uint64),
        ("th32ModuleID", DWORD),
        ("cntThreads", DWORD),
        ("th32ParentProcessID", DWORD),
        ("pcPriClassBase", ctypes.c_int32),
        ("dwFlags", DWORD),
        ("szExeFile", ctypes.c_uint16 * MAX_PATH),
    ]


class SECURITY_ATTRIBUTES(ctypes.Structure):
    _fields_ = [
        ("nLength", DWORD),
        ("lpSecurityDescriptor", ctypes.c_void_p),
        ("bInheritHandle", BOOL),
    ]


class STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb", DWORD),
        ("lpReserved", ctypes.c_void_p),
        ("lpDesktop", ctypes.c_void_p),
        ("lpTitle", ctypes.c_void_p),
        ("dwX", DWORD),
        ("dwY", DWORD),
        ("dwXSize", DWORD),
        ("dwYSize", DWORD),
        ("dwXCountChars", DWORD),
        ("dwYCountChars", DWORD),
        ("dwFillAttribute", DWORD),
        ("dwFlags", DWORD),
        ("wShowWindow", ctypes.c_uint16),
        ("cbReserved2", ctypes.c_uint16),
        ("lpReserved2", ctypes.c_void_p),
        ("hStdInput", HANDLE),
        ("hStdOutput", HANDLE),
        ("hStdError", HANDLE),
    ]


class STARTUPINFOEXW(ctypes.Structure):
    _fields_ = [
        ("StartupInfo", STARTUPINFOW),
        ("lpAttributeList", ctypes.c_void_p),
    ]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("hProcess", HANDLE),
        ("hThread", HANDLE),
        ("dwProcessId", DWORD),
        ("dwThreadId", DWORD),
    ]


class _IoCounters(ctypes.Structure):
    _fields_ = [
        ("ReadOperationCount", ctypes.c_uint64),
        ("WriteOperationCount", ctypes.c_uint64),
        ("OtherOperationCount", ctypes.c_uint64),
        ("ReadTransferCount", ctypes.c_uint64),
        ("WriteTransferCount", ctypes.c_uint64),
        ("OtherTransferCount", ctypes.c_uint64),
    ]


class _JobObjectBasicLimitInformation(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", DWORD),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", DWORD),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", DWORD),
        ("SchedulingClass", DWORD),
    ]


class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", _JobObjectBasicLimitInformation),
        ("IoInfo", _IoCounters),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


class JOBOBJECT_BASIC_ACCOUNTING_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("TotalUserTime", ctypes.c_int64),
        ("TotalKernelTime", ctypes.c_int64),
        ("ThisPeriodTotalUserTime", ctypes.c_int64),
        ("ThisPeriodTotalKernelTime", ctypes.c_int64),
        ("TotalPageFaultCount", DWORD),
        ("TotalProcesses", DWORD),
        ("ActiveProcesses", DWORD),
        ("TotalTerminatedProcesses", DWORD),
    ]


class VaultSinkSupervisorError(RuntimeError):
    """Static code that is safe to cross the supervisor control boundary."""

    def __init__(self, code: str) -> None:
        normalized = str(code or "vault_worker_ready_protocol_error").strip()
        if normalized not in _CONTROL_ERROR_CODES | {
            "vault_worker_ready_protocol_error"
        }:
            normalized = "vault_worker_ready_protocol_error"
        super().__init__(normalized)
        self.code = normalized


def run_lifecycle(
    driver: Any,
    *,
    drain_timeout_ms: int = DEFAULT_DRAIN_TIMEOUT_MS,
    drain_poll_interval_ms: int = DEFAULT_DRAIN_POLL_INTERVAL_MS,
    monitor_polls: int | None = None,
    monotonic: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> bool:
    """Run the no-plaintext lifecycle and return whether worker drain succeeded."""

    if (
        not isinstance(drain_timeout_ms, int)
        or isinstance(drain_timeout_ms, bool)
        or drain_timeout_ms < 1
        or not isinstance(drain_poll_interval_ms, int)
        or isinstance(drain_poll_interval_ms, bool)
        or drain_poll_interval_ms < 1
        or (
            monitor_polls is not None
            and (
                not isinstance(monitor_polls, int)
                or isinstance(monitor_polls, bool)
                or monitor_polls < 1
            )
        )
    ):
        raise VaultSinkSupervisorError("vault_worker_ready_timeout")
    process_names = ("electron", "parent", "worker")
    pre_ready_names = (*process_names, "ready_event")
    try:
        pre_ready = set(driver.poll(pre_ready_names))
        if pre_ready & set(process_names):
            _terminate_and_drain(
                driver, drain_timeout_ms, drain_poll_interval_ms, monotonic, sleep
            )
            return False
        if "ready_event" not in pre_ready:
            _terminate_and_drain(
                driver, drain_timeout_ms, drain_poll_interval_ms, monotonic, sleep
            )
            return False
        # A death observed in the zero-time recheck wins over a same-tick READY.
        if set(driver.poll_now(process_names)):
            _terminate_and_drain(
                driver, drain_timeout_ms, drain_poll_interval_ms, monotonic, sleep
            )
            return False
        if driver.attest_worker() is not True:
            _terminate_and_drain(
                driver, drain_timeout_ms, drain_poll_interval_ms, monotonic, sleep
            )
            return False
        driver.emit_ready()
        polls = 0
        while monitor_polls is None or polls < monitor_polls:
            observed = set(driver.poll(process_names))
            polls += 1
            if not observed:
                continue
            drained = _terminate_and_drain(
                driver, drain_timeout_ms, drain_poll_interval_ms, monotonic, sleep
            )
            return drained and observed == {"worker"}
        return False
    except Exception:
        return False
    finally:
        try:
            driver.close()
        except Exception:
            pass


def _terminate_and_drain(
    driver: Any,
    timeout_ms: int,
    poll_interval_ms: int,
    monotonic: Callable[[], float],
    sleep: Callable[[float], None],
) -> bool:
    if driver.terminate_job() is not True:
        return False
    deadline = monotonic() + (timeout_ms / 1_000)
    while True:
        if driver.active_process_count() == 0:
            return True
        remaining = deadline - monotonic()
        if remaining <= 0:
            return False
        sleep(min(poll_interval_ms / 1_000, remaining))


def _frame(body: bytes) -> bytes:
    if not isinstance(body, bytes) or not 1 <= len(body) <= MAX_CONTROL_FRAME_BYTES:
        raise VaultSinkSupervisorError("vault_worker_ready_protocol_error")
    return struct.pack(">I", len(body)) + body


def ready_control_frame() -> bytes:
    """Return the one canonical READY frame; no runtime data is permitted."""

    return _frame(READY_CONTROL_BODY)


def error_control_frame(code: str) -> bytes:
    """Return a canonical static error frame without Win32 diagnostics."""

    if code not in _CONTROL_ERROR_CODES:
        raise VaultSinkSupervisorError("vault_worker_ready_protocol_error")
    body = (
        b'{"code":"'
        + code.encode("ascii")
        + b'","kind":"error","protocol":1}'
    )
    return _frame(body)


def parse_decimal_pid(value: Any) -> int:
    """Admit only a canonical non-zero decimal DWORD PID."""

    if (
        not isinstance(value, str)
        or not value
        or not value.isascii()
        or not value.isdecimal()
        or value[0] == "0"
    ):
        raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
    pid = int(value, 10)
    if pid > _MAX_WIN32_PID:
        raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
    return pid


def _parse_decimal_handle(value: Any) -> int:
    """Admit the one inherited READY handle without accepting aliases."""

    if (
        not isinstance(value, str)
        or not value
        or not value.isascii()
        or not value.isdecimal()
        or value[0] == "0"
    ):
        raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
    handle = int(value, 10)
    if handle > 0xFFFFFFFFFFFFFFFF:
        raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
    return handle


def _consume_worker_bootstrap(
    environment: MutableMapping[str, str],
) -> int:
    """Read and scrub the closed worker bootstrap before protocol I/O."""

    expected = {
        WORKER_BOOTSTRAP_VERSION_ENV.casefold(),
        WORKER_READY_EVENT_ENV.casefold(),
    }
    found: dict[str, list[tuple[str, str]]] = {name: [] for name in expected}
    for key, value in list(environment.items()):
        if not isinstance(key, str):
            continue
        folded = key.casefold()
        if folded in expected:
            found[folded].append((key, value))
    for entries in found.values():
        for key, _value in entries:
            environment.pop(key, None)

    version_entries = found[WORKER_BOOTSTRAP_VERSION_ENV.casefold()]
    event_entries = found[WORKER_READY_EVENT_ENV.casefold()]
    if len(version_entries) != 1 or len(event_entries) != 1:
        raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
    if version_entries[0][1] != WORKER_BOOTSTRAP_VERSION:
        raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
    return _parse_decimal_handle(event_entries[0][1])


def bootstrap_inner_worker(
    *,
    environment: MutableMapping[str, str] | None = None,
    api: Any | None = None,
    restore_environment: Callable[[], None] | None = None,
) -> None:
    """Attest the inner worker and signal READY before it may read stdin."""

    resolved_environment = os.environ if environment is None else environment
    if not isinstance(resolved_environment, MutableMapping):
        raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
    ready_event = _consume_worker_bootstrap(resolved_environment)
    resolved_api = _Win32Api() if api is None else api
    resolved_api.attest_current_process_in_job()
    if restore_environment is None:
        from durable_job_runtime import restore_frozen_job_environment

        restore_environment = restore_frozen_job_environment
    restore_environment()
    resolved_api.signal_and_close_ready_event(ready_event)


def _handle_value(handle: Any) -> int:
    if isinstance(handle, ctypes.c_void_p):
        return int(handle.value or 0)
    try:
        return int(handle or 0)
    except (TypeError, ValueError):
        return 0


def _is_absolute_windows_path(value: str) -> bool:
    return ntpath.isabs(value) or os.path.isabs(value)


class _WorkerCommand:
    """Absolute application identity plus a mutable-safe command-line value."""

    def __init__(self, application: str, arguments: tuple[str, ...]) -> None:
        self.application = application
        self.arguments = arguments
        self.command_line = subprocess.list2cmdline(arguments)


def _validate_worker_command(command: Any) -> _WorkerCommand:
    """Admit one internally consistent, absolute CreateProcessW command."""

    if (
        not isinstance(command, _WorkerCommand)
        or not isinstance(command.application, str)
        or not command.application
        or "\x00" in command.application
        or not _is_absolute_windows_path(command.application)
        or not isinstance(command.arguments, tuple)
        or not command.arguments
        or any(
            not isinstance(argument, str) or "\x00" in argument
            for argument in command.arguments
        )
        or command.arguments[0] != command.application
    ):
        raise VaultSinkSupervisorError("vault_worker_spawn_failed")
    expected_command_line = subprocess.list2cmdline(command.arguments)
    if (
        not isinstance(command.command_line, str)
        or command.command_line != expected_command_line
        or not 1 <= len(command.command_line) < _MAX_COMMAND_LINE_CHARS
    ):
        raise VaultSinkSupervisorError("vault_worker_spawn_failed")
    return command


def _build_worker_command(
    *,
    executable: str | None = None,
    frozen: bool | None = None,
    main_path: str | None = None,
) -> _WorkerCommand:
    resolved_executable = str(executable or sys.executable or "")
    is_frozen = bool(getattr(sys, "frozen", False)) if frozen is None else frozen
    if (
        not resolved_executable
        or "\x00" in resolved_executable
        or not _is_absolute_windows_path(resolved_executable)
    ):
        raise VaultSinkSupervisorError("vault_worker_spawn_failed")

    arguments: tuple[str, ...]
    if is_frozen:
        arguments = (resolved_executable, "--vault-sink-worker")
    else:
        resolved_main = str(
            main_path or (Path(__file__).resolve().parent / "main.py")
        )
        if (
            not resolved_main
            or "\x00" in resolved_main
            or not _is_absolute_windows_path(resolved_main)
        ):
            raise VaultSinkSupervisorError("vault_worker_spawn_failed")
        arguments = (
            resolved_executable,
            resolved_main,
            "--vault-sink-worker",
        )

    return _validate_worker_command(
        _WorkerCommand(resolved_executable, arguments)
    )


class _WorkerEnvironment:
    """Minimal mapping and its exact double-NUL Unicode wire representation."""

    def __init__(self, values: dict[str, str]) -> None:
        self.values = values
        entries = [
            f"{key}={value}"
            for key, value in sorted(
                values.items(),
                key=lambda item: item[0].casefold(),
            )
        ]
        self.block = "\x00".join(entries) + "\x00\x00"
        self.buffer = (ctypes.c_wchar * len(self.block))(*self.block)


def _build_worker_environment(
    environment: Mapping[str, str] | None = None,
    *,
    ready_event_handle: Any,
) -> _WorkerEnvironment:
    ready_value = _handle_value(ready_event_handle)
    if ready_value in {0, INVALID_HANDLE_VALUE}:
        raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")

    source = os.environ if environment is None else environment
    admitted: dict[str, str] = {}
    seen_names: set[str] = set()
    for key, value in source.items():
        if not isinstance(key, str):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        folded = key.casefold()
        if folded in seen_names:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        seen_names.add(folded)
        if (
            key.upper() == "PYINSTALLER_RESET_ENVIRONMENT"
            or key.upper().startswith("PUPU_VAULT_")
            or (
                key.upper() not in _MINIMAL_WORKER_ENVIRONMENT
                and not key.upper().startswith("_PYI_")
            )
        ):
            continue
        if (
            not isinstance(value, str)
            or not key
            or "=" in key
            or "\x00" in key
            or "\x00" in value
        ):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        admitted[key] = value

    admitted[WORKER_BOOTSTRAP_VERSION_ENV] = WORKER_BOOTSTRAP_VERSION
    admitted[WORKER_READY_EVENT_ENV] = str(ready_value)
    return _WorkerEnvironment(admitted)


class _OwnedHandle:
    """One Win32 HANDLE with an exact close-once ownership rule."""

    def __init__(self, value: Any, *, close: Callable[[int], None]) -> None:
        handle = _handle_value(value)
        if handle in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        self._value = handle
        self._close = close

    @property
    def value(self) -> int:
        return self._value

    def close(self) -> bool:
        if self._value == 0:
            return False
        value = self._value
        self._value = 0
        self._close(value)
        return True

    def __enter__(self) -> "_OwnedHandle":
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        self.close()


def _close_owned_handles(handles: list[_OwnedHandle]) -> int:
    closed = 0
    first_error: Exception | None = None
    for handle in reversed(handles):
        try:
            if handle.close():
                closed += 1
        except Exception as error:
            if first_error is None:
                first_error = error
    if first_error is not None:
        raise first_error
    return closed


class _ProtocolHandles:
    """Non-inheritable duplicates of Electron's original stdin/stdout."""

    def __init__(self, *, stdin: _OwnedHandle, stdout: _OwnedHandle) -> None:
        self.stdin = stdin
        self.stdout = stdout

    def close(self) -> int:
        return _close_owned_handles([self.stdin, self.stdout])

    def __enter__(self) -> "_ProtocolHandles":
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        self.close()


class _ReadyEventPair:
    """Supervisor Event plus the worker's inheritable duplicate."""

    def __init__(
        self,
        *,
        supervisor: _OwnedHandle,
        child: _OwnedHandle,
    ) -> None:
        self.supervisor = supervisor
        self.child = child

    def close(self) -> int:
        return _close_owned_handles([self.supervisor, self.child])


class _AttributeList:
    """STARTUPINFOEX storage; this is not a kernel handle."""

    def __init__(
        self,
        *,
        buffer: Any,
        job_handles: Any,
        inherited_handles: Any,
        delete: Callable[[Any], None],
    ) -> None:
        self.buffer = buffer
        self.job_handles = job_handles
        self.inherited_handles = inherited_handles
        self._delete = delete
        self._closed = False

    @property
    def pointer(self) -> int:
        if self._closed:
            return 0
        return int(ctypes.cast(self.buffer, ctypes.c_void_p).value or 0)

    def close(self) -> bool:
        if self._closed:
            return False
        pointer = self.pointer
        self._closed = True
        self._delete(ctypes.c_void_p(pointer))
        return True


class _SpawnedWorker:
    """Handles retained by the supervisor after atomic worker creation."""

    def __init__(
        self,
        *,
        process: _OwnedHandle,
        ready_event: _OwnedHandle,
    ) -> None:
        self.process = process
        self.ready_event = ready_event

    def close(self) -> int:
        return _close_owned_handles([self.process, self.ready_event])

    def __enter__(self) -> "_SpawnedWorker":
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        self.close()


class _VerifiedParentChain:
    """Stable Electron/direct-parent/supervisor handles after verification."""

    def __init__(
        self,
        *,
        electron: _OwnedHandle,
        direct_parent: _OwnedHandle,
        supervisor: _OwnedHandle,
        mode: str,
    ) -> None:
        if mode not in {"dev", "packaged"}:
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
        self.electron = electron
        self.direct_parent = direct_parent
        self.supervisor = supervisor
        self.mode = mode

    def close(self) -> int:
        return _close_owned_handles(
            [self.electron, self.direct_parent, self.supervisor]
        )

    def __enter__(self) -> "_VerifiedParentChain":
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        self.close()


class _SupervisorLifecycleDriver:
    """Bind the pure lifecycle to owned Win32 resources without plaintext I/O."""

    def __init__(
        self,
        *,
        api: "_Win32Api",
        parents: _VerifiedParentChain,
        job: _OwnedHandle,
        worker: _SpawnedWorker,
        emit_ready: Callable[[], None],
        wait_timeout_ms: int,
    ) -> None:
        self._api = api
        self._parents = parents
        self._job = job
        self._worker = worker
        self._emit_ready = emit_ready
        self._wait_timeout_ms = wait_timeout_ms

    def poll(self, names: tuple[str, ...]) -> set[str]:
        return self._poll(names, self._wait_timeout_ms)

    def poll_now(self, names: tuple[str, ...]) -> set[str]:
        """Recheck lifecycle handles without delaying the READY handshake."""

        return self._poll(names, 0)

    def _poll(self, names: tuple[str, ...], timeout_ms: int) -> set[str]:
        handles = {
            "electron": self._parents.electron,
            "parent": self._parents.direct_parent,
            "worker": self._worker.process,
            "ready_event": self._worker.ready_event,
        }
        selected = [handles[name] for name in names]
        handle_values = [handle.value for handle in selected]
        first = self._api.wait_for_handles(handle_values, timeout_ms)
        observed: set[str] = set()
        if first is not None:
            observed.add(names[first])
        # Recheck every handle at zero timeout, making process death win over
        # a concurrently signalled READY Event regardless of wait ordering.
        for name, handle_value in zip(names, handle_values):
            if self._api.wait_for_handles([handle_value], 0) == 0:
                observed.add(name)
        return observed

    def attest_worker(self) -> bool:
        return self._api.process_is_in_job(self._worker.process.value, self._job)

    def emit_ready(self) -> None:
        self._emit_ready()

    def terminate_job(self) -> bool:
        try:
            self._api.terminate_job(self._job)
            return True
        except VaultSinkSupervisorError:
            return False

    def active_process_count(self) -> int:
        return self._api.active_process_count(self._job)

    def close(self) -> None:
        errors: list[Exception] = []
        for resource in (self._worker, self._parents, self._job):
            try:
                resource.close()
            except Exception as error:
                errors.append(error)
        if errors:
            raise errors[0]


class _Win32Api:
    """Narrow ctypes ABI layer. It only loads kernel32 on supported hosts."""

    def __init__(
        self,
        *,
        platform: str | None = None,
        kernel32: Any | None = None,
        pointer_size: int | None = None,
        get_osfhandle: Callable[[int], int] | None = None,
        get_last_error: Callable[[], int] | None = None,
    ) -> None:
        resolved_platform = sys.platform if platform is None else platform
        resolved_pointer_size = (
            ctypes.sizeof(ctypes.c_void_p)
            if pointer_size is None
            else int(pointer_size)
        )
        if resolved_platform != "win32" or resolved_pointer_size != 8:
            raise VaultSinkSupervisorError("vault_worker_containment_unsupported")
        if (
            ctypes.sizeof(DWORD) != 4
            or ctypes.sizeof(HANDLE) != 8
            or ctypes.sizeof(FILETIME) != 8
            or ctypes.sizeof(PROCESSENTRY32W) != 568
            or ctypes.sizeof(SECURITY_ATTRIBUTES) != 24
            or ctypes.sizeof(STARTUPINFOW) != 104
            or ctypes.sizeof(STARTUPINFOEXW) != 112
            or ctypes.sizeof(PROCESS_INFORMATION) != 24
        ):
            raise VaultSinkSupervisorError("vault_worker_containment_unsupported")
        if kernel32 is None:
            try:
                kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            except (AttributeError, OSError):
                raise VaultSinkSupervisorError(
                    "vault_worker_containment_unsupported"
                ) from None
        self._kernel32 = kernel32
        self._get_osfhandle = get_osfhandle
        self._get_last_error = get_last_error
        if self._get_osfhandle is None and kernel32 is not None:
            try:
                import msvcrt

                self._get_osfhandle = msvcrt.get_osfhandle
            except ImportError:
                pass
        if self._get_last_error is None:
            self._get_last_error = getattr(ctypes, "get_last_error", None)
        self._spawn_api_bound = False
        self._inner_worker_api_bound = False
        self._lifecycle_api_bound = False
        try:
            kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p]
            kernel32.CreateJobObjectW.restype = HANDLE
            kernel32.CloseHandle.argtypes = [HANDLE]
            kernel32.CloseHandle.restype = BOOL
            kernel32.SetInformationJobObject.argtypes = [
                HANDLE,
                DWORD,
                ctypes.c_void_p,
                DWORD,
            ]
            kernel32.SetInformationJobObject.restype = BOOL
            kernel32.QueryInformationJobObject.argtypes = [
                HANDLE,
                DWORD,
                ctypes.c_void_p,
                DWORD,
                ctypes.POINTER(DWORD),
            ]
            kernel32.QueryInformationJobObject.restype = BOOL
            kernel32.AssignProcessToJobObject.argtypes = [HANDLE, HANDLE]
            kernel32.AssignProcessToJobObject.restype = BOOL
            kernel32.IsProcessInJob.argtypes = [
                HANDLE,
                HANDLE,
                ctypes.POINTER(BOOL),
            ]
            kernel32.IsProcessInJob.restype = BOOL
            kernel32.OpenProcess.argtypes = [DWORD, BOOL, DWORD]
            kernel32.OpenProcess.restype = HANDLE
            kernel32.WaitForSingleObject.argtypes = [HANDLE, DWORD]
            kernel32.WaitForSingleObject.restype = DWORD
            kernel32.GetProcessTimes.argtypes = [
                HANDLE,
                ctypes.POINTER(FILETIME),
                ctypes.POINTER(FILETIME),
                ctypes.POINTER(FILETIME),
                ctypes.POINTER(FILETIME),
            ]
            kernel32.GetProcessTimes.restype = BOOL
            kernel32.CreateToolhelp32Snapshot.argtypes = [DWORD, DWORD]
            kernel32.CreateToolhelp32Snapshot.restype = HANDLE
            kernel32.Process32FirstW.argtypes = [
                HANDLE,
                ctypes.POINTER(PROCESSENTRY32W),
            ]
            kernel32.Process32FirstW.restype = BOOL
            kernel32.Process32NextW.argtypes = [
                HANDLE,
                ctypes.POINTER(PROCESSENTRY32W),
            ]
            kernel32.Process32NextW.restype = BOOL
        except (AttributeError, TypeError):
            raise VaultSinkSupervisorError(
                "vault_worker_containment_unsupported"
            ) from None

    def _ensure_spawn_api(self) -> None:
        if self._spawn_api_bound:
            return
        kernel32 = self._kernel32
        try:
            kernel32.GetCurrentProcess.argtypes = []
            kernel32.GetCurrentProcess.restype = HANDLE
            kernel32.GetStdHandle.argtypes = [DWORD]
            kernel32.GetStdHandle.restype = HANDLE
            kernel32.DuplicateHandle.argtypes = [
                HANDLE,
                HANDLE,
                HANDLE,
                ctypes.POINTER(HANDLE),
                DWORD,
                BOOL,
                DWORD,
            ]
            kernel32.DuplicateHandle.restype = BOOL
            kernel32.GetHandleInformation.argtypes = [
                HANDLE,
                ctypes.POINTER(DWORD),
            ]
            kernel32.GetHandleInformation.restype = BOOL
            kernel32.CreateEventW.argtypes = [
                ctypes.c_void_p,
                BOOL,
                BOOL,
                ctypes.c_wchar_p,
            ]
            kernel32.CreateEventW.restype = HANDLE
            kernel32.CreateFileW.argtypes = [
                ctypes.c_wchar_p,
                DWORD,
                DWORD,
                ctypes.POINTER(SECURITY_ATTRIBUTES),
                DWORD,
                DWORD,
                HANDLE,
            ]
            kernel32.CreateFileW.restype = HANDLE
            kernel32.InitializeProcThreadAttributeList.argtypes = [
                ctypes.c_void_p,
                DWORD,
                DWORD,
                ctypes.POINTER(ctypes.c_size_t),
            ]
            kernel32.InitializeProcThreadAttributeList.restype = BOOL
            kernel32.UpdateProcThreadAttribute.argtypes = [
                ctypes.c_void_p,
                DWORD,
                ctypes.c_size_t,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_void_p,
                ctypes.POINTER(ctypes.c_size_t),
            ]
            kernel32.UpdateProcThreadAttribute.restype = BOOL
            kernel32.DeleteProcThreadAttributeList.argtypes = [ctypes.c_void_p]
            kernel32.DeleteProcThreadAttributeList.restype = None
            kernel32.CreateProcessW.argtypes = [
                ctypes.c_wchar_p,
                ctypes.POINTER(ctypes.c_wchar),
                ctypes.c_void_p,
                ctypes.c_void_p,
                BOOL,
                DWORD,
                ctypes.c_void_p,
                ctypes.c_wchar_p,
                ctypes.c_void_p,
                ctypes.POINTER(PROCESS_INFORMATION),
            ]
            kernel32.CreateProcessW.restype = BOOL
        except (AttributeError, TypeError):
            raise VaultSinkSupervisorError(
                "vault_worker_containment_unsupported"
            ) from None
        self._spawn_api_bound = True

    def _ensure_inner_worker_api(self) -> None:
        if self._inner_worker_api_bound:
            return
        try:
            self._kernel32.SetEvent.argtypes = [HANDLE]
            self._kernel32.SetEvent.restype = BOOL
        except (AttributeError, TypeError):
            raise VaultSinkSupervisorError(
                "vault_worker_containment_unsupported"
            ) from None
        self._inner_worker_api_bound = True

    def _ensure_lifecycle_api(self) -> None:
        if self._lifecycle_api_bound:
            return
        try:
            self._kernel32.WaitForMultipleObjects.argtypes = [
                DWORD,
                ctypes.POINTER(HANDLE),
                BOOL,
                DWORD,
            ]
            self._kernel32.WaitForMultipleObjects.restype = DWORD
            self._kernel32.TerminateJobObject.argtypes = [HANDLE, DWORD]
            self._kernel32.TerminateJobObject.restype = BOOL
        except (AttributeError, TypeError):
            raise VaultSinkSupervisorError(
                "vault_worker_containment_unsupported"
            ) from None
        self._lifecycle_api_bound = True

    def _assert_handle_inheritance(
        self,
        handle: Any,
        *,
        expected: bool,
    ) -> None:
        self._ensure_spawn_api()
        value = _handle_value(handle)
        if value in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        flags = DWORD()
        if not self._kernel32.GetHandleInformation(
            HANDLE(value),
            ctypes.byref(flags),
        ):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        observed = bool(int(flags.value) & HANDLE_FLAG_INHERIT)
        if observed is not expected:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")

    def _duplicate_handle(
        self,
        source_handle: Any,
        *,
        inheritable: bool,
    ) -> _OwnedHandle:
        self._ensure_spawn_api()
        source_value = _handle_value(source_handle)
        if source_value in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        current_process = self._kernel32.GetCurrentProcess()
        duplicated = HANDLE()
        if not self._kernel32.DuplicateHandle(
            current_process,
            HANDLE(source_value),
            current_process,
            ctypes.byref(duplicated),
            DWORD(0),
            BOOL(inheritable),
            DWORD(DUPLICATE_SAME_ACCESS),
        ):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        owned = _OwnedHandle(duplicated, close=self._close_handle)
        try:
            self._assert_handle_inheritance(
                owned.value,
                expected=inheritable,
            )
            return owned
        except Exception:
            owned.close()
            raise

    def _capture_protocol_handles(self) -> _ProtocolHandles:
        """Duplicate original CRT/std handles before any supervisor dup2."""

        self._ensure_spawn_api()
        if self._get_osfhandle is None:
            raise VaultSinkSupervisorError(
                "vault_worker_containment_unsupported"
            )
        opened: list[_OwnedHandle] = []
        try:
            raw_stdin = _handle_value(self._get_osfhandle(0))
            raw_stdout = _handle_value(self._get_osfhandle(1))
            # Windows hosts may duplicate inherited std handles while wiring
            # Python's CRT descriptors. The CRT handles own this process's
            # protocol streams and are the handles passed to the exact child
            # handle list below; their numeric values need not match the
            # process-wide GetStdHandle slots.
            if (
                raw_stdin in {0, INVALID_HANDLE_VALUE}
                or raw_stdout in {0, INVALID_HANDLE_VALUE}
            ):
                raise VaultSinkSupervisorError(
                    "vault_worker_handle_setup_failed"
                )
            child_stdin_source = self._duplicate_handle(
                raw_stdin,
                inheritable=False,
            )
            opened.append(child_stdin_source)
            child_stdout_source = self._duplicate_handle(
                raw_stdout,
                inheritable=False,
            )
            opened.append(child_stdout_source)
            return _ProtocolHandles(
                stdin=child_stdin_source,
                stdout=child_stdout_source,
            )
        except Exception:
            _close_owned_handles(opened)
            raise

    def _create_ready_event(self) -> _ReadyEventPair:
        self._ensure_spawn_api()
        raw_event = self._kernel32.CreateEventW(
            None,
            BOOL(True),
            BOOL(False),
            None,
        )
        supervisor_event = _OwnedHandle(
            raw_event,
            close=self._close_handle,
        )
        child_event: _OwnedHandle | None = None
        try:
            self._assert_handle_inheritance(
                supervisor_event.value,
                expected=False,
            )
            child_event = self._duplicate_handle(
                supervisor_event.value,
                inheritable=True,
            )
            return _ReadyEventPair(
                supervisor=supervisor_event,
                child=child_event,
            )
        except Exception:
            if child_event is not None:
                child_event.close()
            supervisor_event.close()
            raise

    def _create_inheritable_nul(self) -> _OwnedHandle:
        self._ensure_spawn_api()
        security = SECURITY_ATTRIBUTES()
        security.nLength = ctypes.sizeof(SECURITY_ATTRIBUTES)
        security.bInheritHandle = BOOL(True)
        raw_handle = self._kernel32.CreateFileW(
            "NUL",
            DWORD(GENERIC_WRITE),
            DWORD(FILE_SHARE_READ | FILE_SHARE_WRITE),
            ctypes.byref(security),
            DWORD(OPEN_EXISTING),
            DWORD(FILE_ATTRIBUTE_NORMAL),
            None,
        )
        if _handle_value(raw_handle) in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        owned = _OwnedHandle(raw_handle, close=self._close_handle)
        try:
            self._assert_handle_inheritance(owned.value, expected=True)
            return owned
        except Exception:
            owned.close()
            raise

    def _build_attribute_list(
        self,
        job: _OwnedHandle,
        inherited_handles: list[_OwnedHandle],
    ) -> _AttributeList:
        self._ensure_spawn_api()
        if len(inherited_handles) != 4:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        values = [handle.value for handle in inherited_handles]
        if len(set(values)) != 4:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        self._assert_handle_inheritance(job.value, expected=False)
        for handle in inherited_handles:
            self._assert_handle_inheritance(handle.value, expected=True)
        if self._get_last_error is None:
            raise VaultSinkSupervisorError(
                "vault_worker_containment_unsupported"
            )

        required_size = ctypes.c_size_t()
        sizing_result = self._kernel32.InitializeProcThreadAttributeList(
            None,
            DWORD(2),
            DWORD(0),
            ctypes.byref(required_size),
        )
        sizing_error = int(self._get_last_error())
        if (
            sizing_result
            or sizing_error != ERROR_INSUFFICIENT_BUFFER
            or required_size.value <= 0
        ):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")

        buffer = ctypes.create_string_buffer(required_size.value)
        if not self._kernel32.InitializeProcThreadAttributeList(
            ctypes.cast(buffer, ctypes.c_void_p),
            DWORD(2),
            DWORD(0),
            ctypes.byref(required_size),
        ):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")

        job_handles = (HANDLE * 1)(job.value)
        child_handles = (HANDLE * 4)(*values)
        attribute_list = _AttributeList(
            buffer=buffer,
            job_handles=job_handles,
            inherited_handles=child_handles,
            delete=self._kernel32.DeleteProcThreadAttributeList,
        )
        try:
            if not self._kernel32.UpdateProcThreadAttribute(
                ctypes.c_void_p(attribute_list.pointer),
                DWORD(0),
                ctypes.c_size_t(PROC_THREAD_ATTRIBUTE_JOB_LIST),
                ctypes.cast(job_handles, ctypes.c_void_p),
                ctypes.c_size_t(ctypes.sizeof(job_handles)),
                None,
                None,
            ):
                raise VaultSinkSupervisorError(
                    "vault_worker_handle_setup_failed"
                )
            if not self._kernel32.UpdateProcThreadAttribute(
                ctypes.c_void_p(attribute_list.pointer),
                DWORD(0),
                ctypes.c_size_t(PROC_THREAD_ATTRIBUTE_HANDLE_LIST),
                ctypes.cast(child_handles, ctypes.c_void_p),
                ctypes.c_size_t(ctypes.sizeof(child_handles)),
                None,
                None,
            ):
                raise VaultSinkSupervisorError(
                    "vault_worker_handle_setup_failed"
                )
            return attribute_list
        except Exception:
            attribute_list.close()
            raise

    def _spawn_contained_worker(
        self,
        protocol: _ProtocolHandles,
        job: _OwnedHandle,
        *,
        environment: Mapping[str, str] | None = None,
        executable: str | None = None,
        frozen: bool | None = None,
        main_path: str | None = None,
    ) -> _SpawnedWorker:
        """Create the worker atomically in Job and retain only supervisor handles."""

        try:
            command = _build_worker_command(
                executable=executable,
                frozen=frozen,
                main_path=main_path,
            )
        except Exception:
            if isinstance(job, _OwnedHandle):
                job.close()
            raise
        return self._spawn_contained_command(
            protocol,
            job,
            command=command,
            environment=environment,
        )

    def _spawn_contained_command(
        self,
        protocol: _ProtocolHandles,
        job: _OwnedHandle,
        *,
        command: _WorkerCommand,
        environment: Mapping[str, str] | None = None,
    ) -> _SpawnedWorker:
        """Shared atomic kernel path for the worker and no-secret native probe."""

        ready_pair: _ReadyEventPair | None = None
        transient_handles: list[_OwnedHandle] = []
        attribute_list: _AttributeList | None = None
        process: _OwnedHandle | None = None
        thread: _OwnedHandle | None = None
        succeeded = False
        try:
            self._ensure_spawn_api()
            if (
                not isinstance(protocol, _ProtocolHandles)
                or not isinstance(job, _OwnedHandle)
                or not job.value
            ):
                raise VaultSinkSupervisorError(
                    "vault_worker_handle_setup_failed"
                )
            command = _validate_worker_command(command)
            ready_pair = self._create_ready_event()
            child_stdin = self._duplicate_handle(
                protocol.stdin.value,
                inheritable=True,
            )
            transient_handles.append(child_stdin)
            child_stdout = self._duplicate_handle(
                protocol.stdout.value,
                inheritable=True,
            )
            transient_handles.append(child_stdout)
            child_stderr = self._create_inheritable_nul()
            transient_handles.append(child_stderr)
            inherited_handles = [
                child_stdin,
                child_stdout,
                child_stderr,
                ready_pair.child,
            ]

            worker_environment = _build_worker_environment(
                environment,
                ready_event_handle=ready_pair.child.value,
            )
            attribute_list = self._build_attribute_list(
                job,
                inherited_handles,
            )
            startup_info = STARTUPINFOEXW()
            startup_info.StartupInfo.cb = ctypes.sizeof(STARTUPINFOEXW)
            startup_info.StartupInfo.dwFlags = STARTF_USESTDHANDLES
            startup_info.StartupInfo.hStdInput = child_stdin.value
            startup_info.StartupInfo.hStdOutput = child_stdout.value
            startup_info.StartupInfo.hStdError = child_stderr.value
            startup_info.lpAttributeList = attribute_list.pointer
            process_info = PROCESS_INFORMATION()
            command_buffer = ctypes.create_unicode_buffer(command.command_line)
            creation_flags = (
                EXTENDED_STARTUPINFO_PRESENT
                | CREATE_UNICODE_ENVIRONMENT
                | CREATE_NO_WINDOW
            )
            if not self._kernel32.CreateProcessW(
                command.application,
                command_buffer,
                None,
                None,
                BOOL(True),
                DWORD(creation_flags),
                ctypes.cast(worker_environment.buffer, ctypes.c_void_p),
                None,
                ctypes.byref(startup_info),
                ctypes.byref(process_info),
            ):
                raise VaultSinkSupervisorError("vault_worker_spawn_failed")

            process = _OwnedHandle(
                process_info.hProcess,
                close=self._close_handle,
            )
            thread = _OwnedHandle(
                process_info.hThread,
                close=self._close_handle,
            )
            thread.close()
            thread = None
            _close_owned_handles(transient_handles)
            transient_handles = []
            ready_pair.child.close()
            attribute_list.close()
            attribute_list = None

            if not self.process_is_in_job(process.value, job):
                raise VaultSinkSupervisorError(
                    "vault_worker_attestation_failed"
                )
            worker = _SpawnedWorker(
                process=process,
                ready_event=ready_pair.supervisor,
            )
            process = None
            ready_pair = None
            succeeded = True
            return worker
        except VaultSinkSupervisorError:
            raise
        except Exception:
            raise VaultSinkSupervisorError("vault_worker_spawn_failed") from None
        finally:
            cleanup_error: Exception | None = None

            def close_for_cleanup(resource: Any) -> None:
                nonlocal cleanup_error
                if resource is None:
                    return
                try:
                    resource.close()
                except Exception as error:
                    if cleanup_error is None:
                        cleanup_error = error

            close_for_cleanup(thread)
            close_for_cleanup(attribute_list)
            for transient in reversed(transient_handles):
                close_for_cleanup(transient)
            close_for_cleanup(process)
            close_for_cleanup(ready_pair)
            if not succeeded and isinstance(job, _OwnedHandle):
                close_for_cleanup(job)
            if cleanup_error is not None and sys.exc_info()[0] is None:
                raise cleanup_error

    def wait_for_handle_for_probe(
        self,
        handle: Any,
        timeout_ms: int,
    ) -> int:
        """Bounded no-secret probe wait with a closed result domain."""

        value = _handle_value(handle)
        if (
            value in {0, INVALID_HANDLE_VALUE}
            or not isinstance(timeout_ms, int)
            or isinstance(timeout_ms, bool)
            or not 0 <= timeout_ms <= 0xFFFFFFFF
        ):
            raise VaultSinkSupervisorError(
                "vault_worker_attestation_failed"
            )
        result = int(
            self._kernel32.WaitForSingleObject(
                HANDLE(value),
                DWORD(timeout_ms),
            )
        )
        if result not in {WAIT_OBJECT_0, WAIT_TIMEOUT}:
            raise VaultSinkSupervisorError(
                "vault_worker_attestation_failed"
            )
        return result

    def wait_for_handles(self, handles: list[Any], timeout_ms: int) -> int | None:
        """Wait for exactly one handle index or timeout; every other result fails."""

        self._ensure_lifecycle_api()
        if (
            not isinstance(timeout_ms, int)
            or isinstance(timeout_ms, bool)
            or not 0 <= timeout_ms <= 0xFFFFFFFF
            or not 1 <= len(handles) <= MAXIMUM_WAIT_OBJECTS
        ):
            raise VaultSinkSupervisorError("vault_worker_ready_timeout")
        values = [_handle_value(handle) for handle in handles]
        if any(value in {0, INVALID_HANDLE_VALUE} for value in values):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        result = int(
            self._kernel32.WaitForMultipleObjects(
                DWORD(len(values)),
                (HANDLE * len(values))(*values),
                BOOL(False),
                DWORD(timeout_ms),
            )
        )
        if result == WAIT_TIMEOUT:
            return None
        if WAIT_OBJECT_0 <= result < WAIT_OBJECT_0 + len(values):
            return result - WAIT_OBJECT_0
        raise VaultSinkSupervisorError("vault_worker_ready_timeout")

    def terminate_job(self, job: _OwnedHandle) -> None:
        self._ensure_lifecycle_api()
        if not isinstance(job, _OwnedHandle) or not job.value:
            raise VaultSinkSupervisorError("vault_worker_job_setup_failed")
        if not self._kernel32.TerminateJobObject(HANDLE(job.value), DWORD(1)):
            raise VaultSinkSupervisorError("vault_worker_job_setup_failed")

    def active_process_count(self, job: _OwnedHandle) -> int:
        if not isinstance(job, _OwnedHandle) or not job.value:
            raise VaultSinkSupervisorError("vault_worker_job_setup_failed")
        accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION()
        if not self._kernel32.QueryInformationJobObject(
            HANDLE(job.value),
            DWORD(JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION),
            ctypes.byref(accounting),
            DWORD(ctypes.sizeof(accounting)),
            None,
        ):
            raise VaultSinkSupervisorError("vault_worker_job_setup_failed")
        return int(accounting.ActiveProcesses)

    def _close_handle(self, value: int) -> None:
        if value in {0, INVALID_HANDLE_VALUE}:
            return
        if not self._kernel32.CloseHandle(HANDLE(value)):
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")

    def create_job(self) -> _OwnedHandle:
        handle = self._kernel32.CreateJobObjectW(None, None)
        if _handle_value(handle) in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_job_setup_failed")
        return _OwnedHandle(handle, close=self._close_handle)

    def create_kill_on_close_job(self) -> _OwnedHandle:
        """Create, set, and query a Job before its handle may be used."""

        job = self.create_job()
        try:
            requested = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
            requested.BasicLimitInformation.LimitFlags = (
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            )
            if not self._kernel32.SetInformationJobObject(
                HANDLE(job.value),
                DWORD(JOB_OBJECT_EXTENDED_LIMIT_INFORMATION),
                ctypes.byref(requested),
                DWORD(ctypes.sizeof(requested)),
            ):
                raise VaultSinkSupervisorError("vault_worker_job_setup_failed")

            observed = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
            if not self._kernel32.QueryInformationJobObject(
                HANDLE(job.value),
                DWORD(JOB_OBJECT_EXTENDED_LIMIT_INFORMATION),
                ctypes.byref(observed),
                DWORD(ctypes.sizeof(observed)),
                None,
            ):
                raise VaultSinkSupervisorError("vault_worker_job_setup_failed")
            limit_flags = int(observed.BasicLimitInformation.LimitFlags)
            if (
                not limit_flags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                or limit_flags
                & (JOB_OBJECT_LIMIT_BREAKAWAY_OK | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK)
            ):
                raise VaultSinkSupervisorError("vault_worker_job_setup_failed")
            return job
        except Exception:
            job.close()
            raise

    def assign_existing_process_for_probe(
        self,
        process_handle: Any,
        job: _OwnedHandle,
    ) -> None:
        """Assign a no-secret probe process; production spawn must use JOB_LIST."""

        process_value = _handle_value(process_handle)
        if process_value in {0, INVALID_HANDLE_VALUE} or not job.value:
            raise VaultSinkSupervisorError("vault_worker_job_setup_failed")
        if not self._kernel32.AssignProcessToJobObject(
            HANDLE(job.value),
            HANDLE(process_value),
        ):
            raise VaultSinkSupervisorError("vault_worker_job_setup_failed")

    def process_is_in_job(
        self,
        process_handle: Any,
        job: _OwnedHandle | None,
    ) -> bool:
        """Attest membership independently of any worker-controlled signal."""

        process_value = _handle_value(process_handle)
        if process_value in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_attestation_failed")
        result = BOOL()
        job_handle = HANDLE(job.value) if job is not None else None
        if not self._kernel32.IsProcessInJob(
            HANDLE(process_value),
            job_handle,
            ctypes.byref(result),
        ):
            raise VaultSinkSupervisorError("vault_worker_attestation_failed")
        return bool(result.value)

    def attest_current_process_in_job(self) -> None:
        """Require the worker to be in some Job before protocol I/O."""

        # GetCurrentProcess returns the -1 pseudo-handle, while the closed
        # process-handle validator intentionally rejects that sentinel. Open a
        # minimal real handle for this PID so the Job attestation uses the same
        # validated handle representation as the outer supervisor.
        with self.open_live_process(str(os.getpid())) as current_process:
            if not self.process_is_in_job(current_process.value, None):
                raise VaultSinkSupervisorError("vault_worker_attestation_failed")

    def signal_and_close_ready_event(self, handle: Any) -> None:
        """Set exactly the inherited READY Event and relinquish it."""

        self._ensure_inner_worker_api()
        value = _handle_value(handle)
        if value in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        try:
            if not self._kernel32.SetEvent(HANDLE(value)):
                raise VaultSinkSupervisorError("vault_worker_handle_setup_failed")
        finally:
            self._close_handle(value)

    def open_live_process(self, pid_text: Any) -> _OwnedHandle:
        """Open only the minimum liveness handle and reject an exited PID."""

        pid = parse_decimal_pid(pid_text)
        handle = self._kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
            False,
            pid,
        )
        if _handle_value(handle) in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
        process = _OwnedHandle(handle, close=self._close_handle)
        try:
            if self._kernel32.WaitForSingleObject(process.value, 0) != WAIT_TIMEOUT:
                raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
            return process
        except Exception:
            process.close()
            raise

    @staticmethod
    def _native_pid(value: Any) -> int:
        if (
            not isinstance(value, int)
            or isinstance(value, bool)
            or not 1 <= value <= _MAX_WIN32_PID
        ):
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
        return value

    def _process_creation_time(self, process: _OwnedHandle) -> int:
        creation = FILETIME()
        exit_time = FILETIME()
        kernel = FILETIME()
        user = FILETIME()
        if not self._kernel32.GetProcessTimes(
            HANDLE(process.value),
            ctypes.byref(creation),
            ctypes.byref(exit_time),
            ctypes.byref(kernel),
            ctypes.byref(user),
        ):
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
        timestamp = (int(creation.dwHighDateTime) << 32) | int(
            creation.dwLowDateTime
        )
        if timestamp <= 0:
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
        return timestamp

    def _snapshot_parent_pid(self, process_id: int) -> int:
        raw_snapshot = self._kernel32.CreateToolhelp32Snapshot(
            TH32CS_SNAPPROCESS,
            0,
        )
        if _handle_value(raw_snapshot) in {0, INVALID_HANDLE_VALUE}:
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
        snapshot = _OwnedHandle(raw_snapshot, close=self._close_handle)
        try:
            entry = PROCESSENTRY32W()
            entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
            if not self._kernel32.Process32FirstW(
                HANDLE(snapshot.value),
                ctypes.byref(entry),
            ):
                raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
            for _index in range(_MAX_SNAPSHOT_PROCESSES):
                if int(entry.th32ProcessID) == process_id:
                    return int(entry.th32ParentProcessID)
                if not self._kernel32.Process32NextW(
                    HANDLE(snapshot.value),
                    ctypes.byref(entry),
                ):
                    break
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
        finally:
            snapshot.close()

    def open_verified_parent_chain(
        self,
        electron_pid_text: Any,
        *,
        direct_parent_pid: int | None = None,
        supervisor_pid: int | None = None,
    ) -> _VerifiedParentChain:
        """Open and verify stable parent handles before any worker creation."""

        electron_pid = parse_decimal_pid(electron_pid_text)
        direct_pid = self._native_pid(
            os.getppid() if direct_parent_pid is None else direct_parent_pid
        )
        current_pid = self._native_pid(
            os.getpid() if supervisor_pid is None else supervisor_pid
        )
        if current_pid in {electron_pid, direct_pid}:
            raise VaultSinkSupervisorError("vault_worker_parent_unavailable")

        opened: list[_OwnedHandle] = []
        try:
            electron = self.open_live_process(str(electron_pid))
            opened.append(electron)
            direct_parent = self.open_live_process(str(direct_pid))
            opened.append(direct_parent)
            current = self.open_live_process(str(current_pid))
            opened.append(current)

            if direct_pid == electron_pid:
                electron_creation = self._process_creation_time(electron)
                direct_creation = self._process_creation_time(direct_parent)
                supervisor_creation = self._process_creation_time(current)
                if (
                    electron_creation != direct_creation
                    or electron_creation >= supervisor_creation
                ):
                    raise VaultSinkSupervisorError(
                        "vault_worker_parent_unavailable"
                    )
                mode = "dev"
            else:
                if self._snapshot_parent_pid(direct_pid) != electron_pid:
                    raise VaultSinkSupervisorError(
                        "vault_worker_parent_unavailable"
                    )
                electron_creation = self._process_creation_time(electron)
                direct_creation = self._process_creation_time(direct_parent)
                supervisor_creation = self._process_creation_time(current)
                if not (
                    electron_creation
                    < direct_creation
                    < supervisor_creation
                ):
                    raise VaultSinkSupervisorError(
                        "vault_worker_parent_unavailable"
                    )
                mode = "packaged"

            return _VerifiedParentChain(
                electron=electron,
                direct_parent=direct_parent,
                supervisor=current,
                mode=mode,
            )
        except Exception:
            _close_owned_handles(opened)
            raise


def _write_control_frame(frame: bytes, stream: Any | None = None) -> None:
    """Write one static control frame without ever touching worker plaintext."""

    target = sys.stdout.buffer if stream is None else stream
    if not isinstance(frame, bytes) or not hasattr(target, "write"):
        raise VaultSinkSupervisorError("vault_worker_ready_protocol_error")
    target.write(frame)
    if hasattr(target, "flush"):
        target.flush()


def run_supervisor(
    *,
    api: _Win32Api | None = None,
    environment: Mapping[str, str] | None = None,
    control_stream: Any | None = None,
    wait_timeout_ms: int = DEFAULT_READY_WAIT_TIMEOUT_MS,
) -> bool:
    """Run the no-plaintext outer supervisor over Electron's stdin/stdout pipe."""

    if (
        not isinstance(wait_timeout_ms, int)
        or isinstance(wait_timeout_ms, bool)
        or wait_timeout_ms < 1
    ):
        raise VaultSinkSupervisorError("vault_worker_ready_timeout")
    resolved_environment = os.environ if environment is None else environment
    if not isinstance(resolved_environment, Mapping):
        raise VaultSinkSupervisorError("vault_worker_parent_unavailable")
    resolved_api = _Win32Api() if api is None else api
    protocol: _ProtocolHandles | None = None
    parents: _VerifiedParentChain | None = None
    job: _OwnedHandle | None = None
    worker: _SpawnedWorker | None = None
    try:
        protocol = resolved_api._capture_protocol_handles()
        parents = resolved_api.open_verified_parent_chain(
            resolved_environment.get("PUPU_VAULT_ELECTRON_PID", "")
        )
        job = resolved_api.create_kill_on_close_job()
        worker = resolved_api._spawn_contained_worker(protocol, job)
        driver = _SupervisorLifecycleDriver(
            api=resolved_api,
            parents=parents,
            job=job,
            worker=worker,
            emit_ready=lambda: _write_control_frame(
                ready_control_frame(), control_stream
            ),
            wait_timeout_ms=wait_timeout_ms,
        )
        # Ownership transfers to the lifecycle driver, which closes Job last.
        parents = None
        job = None
        worker = None
        return run_lifecycle(driver)
    finally:
        for resource in (worker, parents, job, protocol):
            if resource is None:
                continue
            try:
                resource.close()
            except Exception:
                pass


def main() -> int:
    """Outer private entry: success requires READY, exit 0, and Job drain."""

    try:
        return 0 if run_supervisor() else 2
    except Exception:
        return 2
