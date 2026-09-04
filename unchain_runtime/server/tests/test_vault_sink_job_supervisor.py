from __future__ import annotations

import ctypes
import io
import struct
import sys
from pathlib import Path

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import vault_sink_job_supervisor as supervisor  # noqa: E402


class _LifecycleDriver:
    def __init__(self, polls, *, active_counts=(0,), attest=True, terminate=True):
        self.polls = list(polls)
        self.active_counts = iter(active_counts)
        self.attest = attest
        self.terminate = terminate
        self.calls = []

    def poll(self, names):
        self.calls.append(("poll", tuple(names)))
        return set(self.polls.pop(0)) if self.polls else set()

    def attest_worker(self):
        self.calls.append("attest")
        return self.attest

    def emit_ready(self):
        self.calls.append("ready")

    def terminate_job(self):
        self.calls.append("terminate")
        return self.terminate

    def active_process_count(self):
        self.calls.append("active")
        return next(self.active_counts)

    def close(self):
        self.calls.append("close")


class _FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def test_lifecycle_pre_ready_process_death_wins_over_ready_event():
    driver = _LifecycleDriver([{"electron", "ready_event"}])

    assert supervisor.run_lifecycle(driver) is False
    assert driver.calls == [
        ("poll", ("electron", "parent", "worker", "ready_event")),
        "terminate",
        "active",
        "close",
    ]


def test_lifecycle_rechecks_processes_after_ready_event_before_emitting_ready():
    driver = _LifecycleDriver([{"ready_event"}, {"worker"}])

    assert supervisor.run_lifecycle(driver) is False
    assert "ready" not in driver.calls
    assert driver.calls[-3:] == ["terminate", "active", "close"]


def test_lifecycle_ready_then_worker_exit_terminates_and_drains():
    driver = _LifecycleDriver([{"ready_event"}, set(), {"worker"}], active_counts=(2, 0))
    clock = _FakeClock()

    assert supervisor.run_lifecycle(
        driver,
        monitor_polls=2,
        monotonic=clock.monotonic,
        sleep=clock.sleep,
    ) is True
    assert clock.sleeps == [0.025]
    assert driver.calls == [
        ("poll", ("electron", "parent", "worker", "ready_event")),
        ("poll", ("electron", "parent", "worker")),
        "attest",
        "ready",
        ("poll", ("electron", "parent", "worker")),
        "terminate",
        "active",
        "active",
        "close",
    ]


def test_lifecycle_keeps_monitoring_after_ready_until_worker_exits():
    driver = _LifecycleDriver(
        [{"ready_event"}, set(), set(), {"worker"}],
        active_counts=(0,),
    )

    assert supervisor.run_lifecycle(driver, monitor_polls=3) is True
    assert driver.calls.count(("poll", ("electron", "parent", "worker"))) == 3


def test_lifecycle_parent_or_electron_death_after_ready_never_reports_drain_success():
    for death in ("electron", "parent", {"worker", "parent"}):
        observed = {death} if isinstance(death, str) else death
        driver = _LifecycleDriver([{"ready_event"}, set(), observed])
        assert supervisor.run_lifecycle(driver, monitor_polls=1) is False


def test_lifecycle_terminate_or_drain_failure_closes_and_fails():
    terminate_failure = _LifecycleDriver([{"worker"}], terminate=False)
    clock = _FakeClock()

    class NeverDrained(_LifecycleDriver):
        def active_process_count(self):
            self.calls.append("active")
            return 1

    drain_timeout = NeverDrained([{"worker"}])

    assert supervisor.run_lifecycle(terminate_failure) is False
    assert terminate_failure.calls[-1] == "close"
    assert supervisor.run_lifecycle(
        drain_timeout,
        drain_timeout_ms=50,
        drain_poll_interval_ms=20,
        monotonic=clock.monotonic,
        sleep=clock.sleep,
    ) is False
    assert clock.sleeps == [0.02, 0.02, pytest.approx(0.01)]
    assert drain_timeout.calls[-1] == "close"


def test_lifecycle_query_failure_closes_and_fails():
    class QueryFailureDriver(_LifecycleDriver):
        def active_process_count(self):
            raise RuntimeError("query failed")

    driver = QueryFailureDriver([{"worker"}])
    assert supervisor.run_lifecycle(driver) is False
    assert driver.calls[-1] == "close"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"drain_timeout_ms": 0},
        {"drain_timeout_ms": True},
        {"drain_poll_interval_ms": -1},
        {"monitor_polls": 0},
    ],
)
def test_lifecycle_rejects_invalid_deadline_configuration(kwargs):
    driver = _LifecycleDriver([{"worker"}])

    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        supervisor.run_lifecycle(driver, **kwargs)

    assert captured.value.code == "vault_worker_ready_timeout"
    assert driver.calls == []


def test_lifecycle_win32_primitives_use_closed_wait_terminate_and_accounting_domains():
    kernel32 = _FakeKernel32()
    kernel32.WaitForMultipleObjects = _FakeFunction(supervisor.WAIT_OBJECT_0 + 1)
    kernel32.TerminateJobObject = _FakeFunction(1)

    def query(_job, class_id, info, _size, _returned):
        if int(class_id.value) == supervisor.JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION:
            accounting = ctypes.cast(
                info,
                ctypes.POINTER(supervisor.JOBOBJECT_BASIC_ACCOUNTING_INFORMATION),
            ).contents
            accounting.ActiveProcesses = 3
        return 1

    kernel32.QueryInformationJobObject = _FakeFunction(query)
    api = supervisor._Win32Api(platform="win32", kernel32=kernel32, pointer_size=8)
    job = supervisor._OwnedHandle(0x1234, close=lambda _value: None)

    assert api.wait_for_handles([0x1111, 0x2222], 0) == 1
    assert api.active_process_count(job) == 3
    api.terminate_job(job)

    kernel32.TerminateJobObject.result = 0
    with pytest.raises(supervisor.VaultSinkSupervisorError):
        api.terminate_job(job)


def test_lifecycle_driver_rechecks_all_handles_and_closes_job_last():
    calls = []
    state = {"job_alive": True}

    class Api:
        def wait_for_handles(self, handles, timeout_ms):
            calls.append(("wait", tuple(handle.value for handle in handles), timeout_ms))
            return None

        def process_is_in_job(self, _process, _job):
            return True

    def close(name):
        def close_handle(_value):
            calls.append(("close", name, state["job_alive"]))
            if name == "job":
                state["job_alive"] = False

        return close_handle

    parents = supervisor._VerifiedParentChain(
        electron=supervisor._OwnedHandle(1, close=close("electron")),
        direct_parent=supervisor._OwnedHandle(2, close=close("parent")),
        supervisor=supervisor._OwnedHandle(3, close=close("supervisor")),
        mode="dev",
    )
    worker = supervisor._SpawnedWorker(
        process=supervisor._OwnedHandle(4, close=close("worker")),
        ready_event=supervisor._OwnedHandle(5, close=close("event")),
    )
    job = supervisor._OwnedHandle(6, close=close("job"))
    driver = supervisor._SupervisorLifecycleDriver(
        api=Api(), parents=parents, job=job, worker=worker,
        emit_ready=lambda: calls.append("ready"), wait_timeout_ms=50,
    )

    assert driver.poll(("electron", "parent", "worker", "ready_event")) == set()
    driver.close()
    assert calls[-6:] == [
        ("close", "event", True), ("close", "worker", True),
        ("close", "supervisor", True), ("close", "parent", True),
        ("close", "electron", True), ("close", "job", True),
    ]
    assert state["job_alive"] is False


def test_outer_supervisor_requires_lifecycle_success_and_writes_ready(monkeypatch):
    calls = []

    class Resource:
        def __init__(self, name):
            self.name = name

        def close(self):
            calls.append(("close", self.name))

    protocol = Resource("protocol")
    parents = Resource("parents")
    job = Resource("job")
    worker = Resource("worker")

    class Api:
        def _capture_protocol_handles(self):
            calls.append("capture")
            return protocol

        def open_verified_parent_chain(self, pid):
            calls.append(("parents", pid))
            return parents

        def create_kill_on_close_job(self):
            calls.append("job")
            return job

        def _spawn_contained_worker(self, observed_protocol, observed_job):
            calls.append(("spawn", observed_protocol, observed_job))
            return worker

    class Driver:
        def __init__(self, **kwargs):
            self.emit_ready = kwargs["emit_ready"]
            self._resources = (worker, parents, job)

        def close(self):
            for resource in self._resources:
                resource.close()

    def lifecycle(driver):
        driver.emit_ready()
        driver.close()
        return True

    monkeypatch.setattr(supervisor, "_SupervisorLifecycleDriver", Driver)
    monkeypatch.setattr(supervisor, "run_lifecycle", lifecycle)
    stream = io.BytesIO()

    assert supervisor.run_supervisor(
        api=Api(),
        environment={"PUPU_VAULT_ELECTRON_PID": "4242"},
        control_stream=stream,
    ) is True
    assert stream.getvalue() == supervisor.ready_control_frame()
    assert calls == [
        "capture",
        ("parents", "4242"),
        "job",
        ("spawn", protocol, job),
        ("close", "worker"),
        ("close", "parents"),
        ("close", "job"),
        ("close", "protocol"),
    ]


def test_outer_supervisor_main_returns_nonzero_on_failure(monkeypatch):
    monkeypatch.setattr(supervisor, "run_supervisor", lambda: False)
    assert supervisor.main() == 2

    monkeypatch.setattr(
        supervisor,
        "run_supervisor",
        lambda: (_ for _ in ()).throw(RuntimeError("no details")),
    )
    assert supervisor.main() == 2


class _BootstrapApi:
    def __init__(self, *, in_job=True, signal_result=True):
        self.in_job = in_job
        self.signal_result = signal_result
        self.calls = []

    def attest_current_process_in_job(self):
        self.calls.append("attest")
        if not self.in_job:
            raise supervisor.VaultSinkSupervisorError("vault_worker_attestation_failed")

    def signal_and_close_ready_event(self, handle):
        self.calls.append(("signal", handle))
        if not self.signal_result:
            raise supervisor.VaultSinkSupervisorError("vault_worker_handle_setup_failed")


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


def test_inner_worker_bootstrap_consumes_env_before_attest_restore_signal(monkeypatch):
    environment = {
        supervisor.WORKER_BOOTSTRAP_VERSION_ENV: supervisor.WORKER_BOOTSTRAP_VERSION,
        supervisor.WORKER_READY_EVENT_ENV: "42",
        "_PYI_APPLICATION_HOME_DIR": "C:\\temp",
    }
    api = _BootstrapApi()
    calls = []

    supervisor.bootstrap_inner_worker(
        environment=environment,
        api=api,
        restore_environment=lambda: calls.append("restore"),
    )

    assert api.calls == ["attest", ("signal", 42)]
    assert calls == ["restore"]
    assert supervisor.WORKER_BOOTSTRAP_VERSION_ENV not in environment
    assert supervisor.WORKER_READY_EVENT_ENV not in environment
    assert environment["_PYI_APPLICATION_HOME_DIR"] == "C:\\temp"


@pytest.mark.parametrize(
    "environment",
    [
        {},
        {supervisor.WORKER_BOOTSTRAP_VERSION_ENV: "2", supervisor.WORKER_READY_EVENT_ENV: "42"},
        {supervisor.WORKER_BOOTSTRAP_VERSION_ENV: "1", supervisor.WORKER_READY_EVENT_ENV: "0"},
        {
            supervisor.WORKER_BOOTSTRAP_VERSION_ENV: "1",
            supervisor.WORKER_READY_EVENT_ENV: "42",
            "pupu_vault_worker_ready_event": "43",
        },
    ],
)
def test_inner_worker_bootstrap_rejects_before_restore_or_signal(environment):
    api = _BootstrapApi()
    restored = []

    with pytest.raises(supervisor.VaultSinkSupervisorError):
        supervisor.bootstrap_inner_worker(
            environment=dict(environment),
            api=api,
            restore_environment=lambda: restored.append(True),
        )

    assert api.calls == []
    assert restored == []


def test_inner_worker_bootstrap_does_not_signal_if_restore_fails():
    environment = {
        supervisor.WORKER_BOOTSTRAP_VERSION_ENV: "1",
        supervisor.WORKER_READY_EVENT_ENV: "42",
    }
    api = _BootstrapApi()

    with pytest.raises(RuntimeError):
        supervisor.bootstrap_inner_worker(
            environment=environment,
            api=api,
            restore_environment=lambda: (_ for _ in ()).throw(RuntimeError("fail")),
        )

    assert api.calls == ["attest"]
    assert supervisor.WORKER_BOOTSTRAP_VERSION_ENV not in environment
    assert supervisor.WORKER_READY_EVENT_ENV not in environment


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
