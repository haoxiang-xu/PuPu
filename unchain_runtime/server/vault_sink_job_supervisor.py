"""Windows-only containment primitives for the Vault sink supervisor.

This module intentionally contains no worker dispatch or plaintext handling.
It freezes the small ABI/control foundation that the Windows supervisor will
use later: owned Win32 handles and a one-frame, static READY/error protocol.
"""

from __future__ import annotations

import ctypes
import os
import struct
import sys
from collections.abc import Callable
from typing import Any


CONTROL_PROTOCOL = 1
MAX_CONTROL_FRAME_BYTES = 256
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x00000800
JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK = 0x00001000
PROCESS_QUERY_LIMITED_INFORMATION = 0x00001000
SYNCHRONIZE = 0x00100000
WAIT_OBJECT_0 = 0
WAIT_TIMEOUT = 258
TH32CS_SNAPPROCESS = 0x00000002
MAX_PATH = 260
_MAX_SNAPSHOT_PROCESSES = 65536
_MAX_WIN32_PID = 0xFFFFFFFF
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


def _handle_value(handle: Any) -> int:
    if isinstance(handle, ctypes.c_void_p):
        return int(handle.value or 0)
    try:
        return int(handle or 0)
    except (TypeError, ValueError):
        return 0


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


class _Win32Api:
    """Narrow ctypes ABI layer. It only loads kernel32 on supported hosts."""

    def __init__(
        self,
        *,
        platform: str | None = None,
        kernel32: Any | None = None,
        pointer_size: int | None = None,
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
