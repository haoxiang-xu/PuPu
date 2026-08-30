from __future__ import annotations

import ctypes
import struct
import sys
from pathlib import Path

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import vault_sink_job_supervisor as supervisor  # noqa: E402


class _FakeFunction:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args)
        if callable(self.result):
            return self.result(*args)
        return self.result


class _FakeKernel32:
    def __init__(
        self,
        *,
        job_handle=0x1234,
        close_result=1,
        set_result=1,
        queried_limit_flags=None,
        assign_result=1,
        is_in_job_result=True,
        is_in_job_api_result=1,
        process_handle=0x5678,
        process_handles=None,
        wait_result=None,
        snapshot_handle=0x6789,
        parent_pids=None,
        creation_times=None,
    ):
        self.CreateJobObjectW = _FakeFunction(job_handle)
        self.CloseHandle = _FakeFunction(close_result)
        self._queried_limit_flags = queried_limit_flags
        self.SetInformationJobObject = _FakeFunction(set_result)
        self.QueryInformationJobObject = _FakeFunction(self._query_job_limits)
        self.AssignProcessToJobObject = _FakeFunction(assign_result)
        self._is_in_job_result = is_in_job_result
        self._is_in_job_api_result = is_in_job_api_result
        self.IsProcessInJob = _FakeFunction(self._is_process_in_job)
        self._process_handles = list(process_handles or [])
        self._fallback_process_handle = process_handle
        self._snapshot_rows = list((parent_pids or {}).items())
        self._snapshot_index = 0
        self._creation_times = dict(creation_times or {})
        self.OpenProcess = _FakeFunction(self._open_process)
        self.WaitForSingleObject = _FakeFunction(wait_result)
        self.GetProcessTimes = _FakeFunction(self._get_process_times)
        self.CreateToolhelp32Snapshot = _FakeFunction(snapshot_handle)
        self.Process32FirstW = _FakeFunction(self._process_first)
        self.Process32NextW = _FakeFunction(self._process_next)

    def _query_job_limits(self, _job, _class_id, info, _size, _returned):
        if self._queried_limit_flags is not None:
            limits = ctypes.cast(
                info,
                ctypes.POINTER(supervisor.JOBOBJECT_EXTENDED_LIMIT_INFORMATION),
            ).contents
            limits.BasicLimitInformation.LimitFlags = self._queried_limit_flags
        return 1

    def _open_process(self, _rights, _inherit, _pid):
        if self._process_handles:
            return self._process_handles.pop(0)
        return self._fallback_process_handle

    def _is_process_in_job(self, _process, _job, result):
        if not self._is_in_job_api_result:
            return 0
        value = ctypes.cast(result, ctypes.POINTER(supervisor.BOOL)).contents
        value.value = int(bool(self._is_in_job_result))
        return 1

    def _get_process_times(self, handle, creation, _exit, _kernel, _user):
        timestamp = self._creation_times.get(supervisor._handle_value(handle))
        if timestamp is None:
            return 0
        value = ctypes.cast(creation, ctypes.POINTER(supervisor.FILETIME)).contents
        value.dwLowDateTime = timestamp & 0xFFFFFFFF
        value.dwHighDateTime = timestamp >> 32
        return 1

    def _write_snapshot_row(self, entry_pointer):
        if self._snapshot_index >= len(self._snapshot_rows):
            return 0
        pid, parent_pid = self._snapshot_rows[self._snapshot_index]
        self._snapshot_index += 1
        entry = ctypes.cast(
            entry_pointer,
            ctypes.POINTER(supervisor.PROCESSENTRY32W),
        ).contents
        entry.th32ProcessID = pid
        entry.th32ParentProcessID = parent_pid
        return 1

    def _process_first(self, _snapshot, entry_pointer):
        self._snapshot_index = 0
        return self._write_snapshot_row(entry_pointer)

    def _process_next(self, _snapshot, entry_pointer):
        return self._write_snapshot_row(entry_pointer)


def test_ready_and_error_frames_are_closed_canonical_unions():
    ready = supervisor.ready_control_frame()
    error = supervisor.error_control_frame("vault_worker_job_setup_failed")

    ready_size = struct.unpack(">I", ready[:4])[0]
    error_size = struct.unpack(">I", error[:4])[0]
    assert ready[4:] == supervisor.READY_CONTROL_BODY
    assert ready_size == len(ready) - 4
    assert error_size == len(error) - 4
    assert error[4:] == (
        b'{"code":"vault_worker_job_setup_failed","kind":"error","protocol":1}'
    )
    assert len(ready) - 4 <= supervisor.MAX_CONTROL_FRAME_BYTES
    assert len(error) - 4 <= supervisor.MAX_CONTROL_FRAME_BYTES

    for code in ["vault_unknown", "vault_worker_job_setup_failed\n"]:
        with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
            supervisor.error_control_frame(code)
        assert captured.value.code == "vault_worker_ready_protocol_error"


def test_non_windows_or_non_x64_abi_is_closed_unsupported():
    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        supervisor._Win32Api(platform="darwin", kernel32=_FakeKernel32())
    assert captured.value.code == "vault_worker_containment_unsupported"

    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        supervisor._Win32Api(
            platform="win32",
            kernel32=_FakeKernel32(),
            pointer_size=4,
        )
    assert captured.value.code == "vault_worker_containment_unsupported"


def test_default_platform_admits_win32_without_a_test_only_override(monkeypatch):
    monkeypatch.setattr(supervisor.sys, "platform", "win32")

    api = supervisor._Win32Api(kernel32=_FakeKernel32(), pointer_size=8)

    assert api._kernel32 is not None


def test_owned_job_handle_has_exact_null_mapping_and_closes_once():
    kernel32 = _FakeKernel32()
    api = supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
    )
    job = api.create_job()

    assert kernel32.CreateJobObjectW.calls == [(None, None)]
    assert job.value == 0x1234
    assert job.close() is True
    assert job.close() is False
    assert len(kernel32.CloseHandle.calls) == 1

    failing = supervisor._Win32Api(
        platform="win32",
        kernel32=_FakeKernel32(job_handle=0),
        pointer_size=8,
    )
    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        failing.create_job()
    assert captured.value.code == "vault_worker_job_setup_failed"


def test_invalid_handle_is_never_closed():
    calls = []

    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        supervisor._OwnedHandle(
            supervisor.INVALID_HANDLE_VALUE,
            close=lambda _value: calls.append(_value),
        )

    assert captured.value.code == "vault_worker_handle_setup_failed"
    assert calls == []


def test_decimal_pid_admission_is_closed_and_bounded():
    assert supervisor.parse_decimal_pid("42") == 42

    for invalid in ["", "0", " 42", "+42", "042", "42x", 42, True, "4294967296"]:
        with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
            supervisor.parse_decimal_pid(invalid)
        assert captured.value.code == "vault_worker_parent_unavailable"


def test_kill_on_close_job_is_set_then_queried_before_use():
    kernel32 = _FakeKernel32(
        queried_limit_flags=supervisor.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    )
    api = supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
    )

    with api.create_kill_on_close_job() as job:
        assert job.value == 0x1234

    assert len(kernel32.SetInformationJobObject.calls) == 1
    assert len(kernel32.QueryInformationJobObject.calls) == 1
    assert len(kernel32.CloseHandle.calls) == 1


def test_job_limit_round_trip_failure_closes_the_job():
    for limit_flags in [
        0,
        supervisor.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        | supervisor.JOB_OBJECT_LIMIT_BREAKAWAY_OK,
    ]:
        kernel32 = _FakeKernel32(queried_limit_flags=limit_flags)
        api = supervisor._Win32Api(
            platform="win32",
            kernel32=kernel32,
            pointer_size=8,
        )

        with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
            api.create_kill_on_close_job()

        assert captured.value.code == "vault_worker_job_setup_failed"
        assert len(kernel32.CloseHandle.calls) == 1


def test_existing_probe_process_can_be_assigned_and_attested_independently():
    kernel32 = _FakeKernel32(is_in_job_result=True)
    api = supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
    )

    with api.create_job() as job:
        api.assign_existing_process_for_probe(0x7777, job)
        assert api.process_is_in_job(0x7777, job) is True

    assigned_job, assigned_process = kernel32.AssignProcessToJobObject.calls[0]
    observed_process, observed_job, _result = kernel32.IsProcessInJob.calls[0]
    assert supervisor._handle_value(assigned_job) == 0x1234
    assert supervisor._handle_value(assigned_process) == 0x7777
    assert supervisor._handle_value(observed_process) == 0x7777
    assert supervisor._handle_value(observed_job) == 0x1234


def test_probe_assignment_and_membership_api_fail_closed():
    assign_failure = supervisor._Win32Api(
        platform="win32",
        kernel32=_FakeKernel32(assign_result=0),
        pointer_size=8,
    )
    with assign_failure.create_job() as job:
        with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
            assign_failure.assign_existing_process_for_probe(0x7777, job)
    assert captured.value.code == "vault_worker_job_setup_failed"

    attestation_failure = supervisor._Win32Api(
        platform="win32",
        kernel32=_FakeKernel32(is_in_job_api_result=0),
        pointer_size=8,
    )
    with attestation_failure.create_job() as job:
        with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
            attestation_failure.process_is_in_job(0x7777, job)
    assert captured.value.code == "vault_worker_attestation_failed"


def test_parent_liveness_handle_uses_minimal_rights_and_zero_wait():
    kernel32 = _FakeKernel32(wait_result=supervisor.WAIT_TIMEOUT)
    api = supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
    )

    with api.open_live_process("42") as process:
        assert process.value == 0x5678

    assert kernel32.OpenProcess.calls == [
        (supervisor.PROCESS_QUERY_LIMITED_INFORMATION | supervisor.SYNCHRONIZE, False, 42)
    ]
    assert kernel32.WaitForSingleObject.calls == [(0x5678, 0)]
    assert len(kernel32.CloseHandle.calls) == 1


def test_dead_or_unopenable_parent_is_closed_before_worker_creation():
    for kernel32 in [
        _FakeKernel32(process_handle=0),
        _FakeKernel32(wait_result=supervisor.WAIT_OBJECT_0),
    ]:
        api = supervisor._Win32Api(
            platform="win32",
            kernel32=kernel32,
            pointer_size=8,
        )
        with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
            api.open_live_process("42")
        assert captured.value.code == "vault_worker_parent_unavailable"

    assert len(kernel32.CloseHandle.calls) == 1


def test_parent_chain_structs_have_fixed_windows_x64_layouts():
    assert ctypes.sizeof(supervisor.FILETIME) == 8
    assert ctypes.sizeof(supervisor.PROCESSENTRY32W) == 568


def test_dev_parent_chain_opens_stable_handles_and_orders_creation_times():
    kernel32 = _FakeKernel32(
        process_handles=[0x1001, 0x1002, 0x1003],
        wait_result=supervisor.WAIT_TIMEOUT,
        creation_times={0x1001: 100, 0x1002: 100, 0x1003: 300},
    )
    api = supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
    )

    with api.open_verified_parent_chain(
        "42",
        direct_parent_pid=42,
        supervisor_pid=99,
    ) as chain:
        assert chain.mode == "dev"
        assert chain.electron.value == 0x1001
        assert chain.direct_parent.value == 0x1002
        assert chain.supervisor.value == 0x1003

    assert [call[2] for call in kernel32.OpenProcess.calls] == [42, 42, 99]
    assert len(kernel32.GetProcessTimes.calls) == 3
    assert kernel32.CreateToolhelp32Snapshot.calls == []
    assert len(kernel32.CloseHandle.calls) == 3


def test_packaged_parent_chain_requires_toolhelp_parent_and_total_time_order():
    kernel32 = _FakeKernel32(
        process_handles=[0x2001, 0x2002, 0x2003],
        wait_result=supervisor.WAIT_TIMEOUT,
        parent_pids={50: 42},
        creation_times={0x2001: 100, 0x2002: 200, 0x2003: 300},
    )
    api = supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
    )

    with api.open_verified_parent_chain(
        "42",
        direct_parent_pid=50,
        supervisor_pid=99,
    ) as chain:
        assert chain.mode == "packaged"

    assert len(kernel32.CreateToolhelp32Snapshot.calls) == 1
    assert len(kernel32.Process32FirstW.calls) == 1
    assert len(kernel32.CloseHandle.calls) == 4


def test_parent_chain_mismatch_or_creation_time_inversion_closes_every_handle():
    cases = [
        ({50: 41}, {0x3001: 100, 0x3002: 200, 0x3003: 300}),
        ({50: 42}, {0x3001: 0, 0x3002: 200, 0x3003: 300}),
        ({50: 42}, {0x3001: 200, 0x3002: 100, 0x3003: 300}),
        ({50: 42}, {0x3001: 100, 0x3002: 300, 0x3003: 200}),
    ]
    for parent_pids, creation_times in cases:
        kernel32 = _FakeKernel32(
            process_handles=[0x3001, 0x3002, 0x3003],
            wait_result=supervisor.WAIT_TIMEOUT,
            parent_pids=parent_pids,
            creation_times=creation_times,
        )
        api = supervisor._Win32Api(
            platform="win32",
            kernel32=kernel32,
            pointer_size=8,
        )

        with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
            api.open_verified_parent_chain(
                "42",
                direct_parent_pid=50,
                supervisor_pid=99,
            )

        assert captured.value.code == "vault_worker_parent_unavailable"
        assert len(kernel32.CloseHandle.calls) == 4


def test_partial_parent_handle_open_closes_prior_handles():
    kernel32 = _FakeKernel32(
        process_handles=[0x4001, 0],
        wait_result=supervisor.WAIT_TIMEOUT,
    )
    api = supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
    )

    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        api.open_verified_parent_chain(
            "42",
            direct_parent_pid=50,
            supervisor_pid=99,
        )

    assert captured.value.code == "vault_worker_parent_unavailable"
    assert len(kernel32.CloseHandle.calls) == 1
