from __future__ import annotations

import ctypes
import subprocess
import sys
from pathlib import Path

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import vault_sink_job_supervisor as supervisor  # noqa: E402


def _number(value):
    return int(value.value) if hasattr(value, "value") else int(value)


class _FakeFunction:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args)
        if callable(self.result):
            return self.result(*args)
        return self.result


class _SpawnKernel32:
    def __init__(
        self,
        *,
        initialize_second_result=1,
        sizing_error=supervisor.ERROR_INSUFFICIENT_BUFFER,
        update_results=(1, 1),
        create_process_result=1,
        in_job_result=True,
        in_job_api_result=1,
    ):
        self.last_error = 0
        self.closed = []
        self.deleted_attribute_lists = 0
        self.attribute_values = {}
        self.attribute_sizes = {}
        self.created_process = None
        self.handle_flags = {
            0x1000: 0,
            0x1001: 0,
            0x1234: 0,
            0xDEAD: supervisor.HANDLE_FLAG_INHERIT,
        }
        self._duplicate_values = iter(
            [0x2000, 0x2001, 0x2002, 0x2003, 0x2004]
        )
        self._update_results = iter(update_results)
        self._initialize_second_result = initialize_second_result
        self._sizing_error = sizing_error
        self._create_process_result = create_process_result
        self._in_job_result = in_job_result
        self._in_job_api_result = in_job_api_result

        self.CreateJobObjectW = _FakeFunction(0x1234)
        self.CloseHandle = _FakeFunction(self._close_handle)
        self.SetInformationJobObject = _FakeFunction(1)
        self.QueryInformationJobObject = _FakeFunction(self._query_job_limits)
        self.AssignProcessToJobObject = _FakeFunction(1)
        self.IsProcessInJob = _FakeFunction(self._is_process_in_job)
        self.OpenProcess = _FakeFunction(0x5678)
        self.WaitForSingleObject = _FakeFunction(supervisor.WAIT_TIMEOUT)
        self.GetProcessTimes = _FakeFunction(0)
        self.CreateToolhelp32Snapshot = _FakeFunction(0x6789)
        self.Process32FirstW = _FakeFunction(0)
        self.Process32NextW = _FakeFunction(0)

        self.GetCurrentProcess = _FakeFunction(supervisor.INVALID_HANDLE_VALUE)
        self.GetStdHandle = _FakeFunction(self._get_std_handle)
        self.DuplicateHandle = _FakeFunction(self._duplicate_handle)
        self.GetHandleInformation = _FakeFunction(self._get_handle_information)
        self.CreateEventW = _FakeFunction(self._create_event)
        self.CreateFileW = _FakeFunction(self._create_file)
        self.InitializeProcThreadAttributeList = _FakeFunction(
            self._initialize_attribute_list
        )
        self.UpdateProcThreadAttribute = _FakeFunction(
            self._update_attribute
        )
        self.DeleteProcThreadAttributeList = _FakeFunction(
            self._delete_attribute_list
        )
        self.CreateProcessW = _FakeFunction(self._create_process)

    def _close_handle(self, handle):
        value = supervisor._handle_value(handle)
        self.closed.append(value)
        self.handle_flags.pop(value, None)
        return 1

    def _query_job_limits(self, _job, _class_id, info, _size, _returned):
        limits = ctypes.cast(
            info,
            ctypes.POINTER(supervisor.JOBOBJECT_EXTENDED_LIMIT_INFORMATION),
        ).contents
        limits.BasicLimitInformation.LimitFlags = (
            supervisor.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        )
        return 1

    def _is_process_in_job(self, _process, _job, result):
        if not self._in_job_api_result:
            return 0
        value = ctypes.cast(result, ctypes.POINTER(supervisor.BOOL)).contents
        value.value = int(self._in_job_result)
        return 1

    def _get_std_handle(self, kind):
        value = _number(kind) & 0xFFFFFFFF
        if value == supervisor.STD_INPUT_HANDLE & 0xFFFFFFFF:
            return 0x1000
        if value == supervisor.STD_OUTPUT_HANDLE & 0xFFFFFFFF:
            return 0x1001
        return supervisor.INVALID_HANDLE_VALUE

    def _duplicate_handle(
        self,
        _source_process,
        source_handle,
        _target_process,
        target_handle,
        _desired_access,
        inherit,
        _options,
    ):
        duplicated = next(self._duplicate_values)
        pointer = ctypes.cast(target_handle, ctypes.POINTER(supervisor.HANDLE))
        pointer.contents.value = duplicated
        self.handle_flags[duplicated] = (
            supervisor.HANDLE_FLAG_INHERIT if bool(inherit) else 0
        )
        assert supervisor._handle_value(source_handle) not in {
            0,
            supervisor.INVALID_HANDLE_VALUE,
        }
        return 1

    def _get_handle_information(self, handle, flags):
        value = supervisor._handle_value(handle)
        if value not in self.handle_flags:
            return 0
        pointer = ctypes.cast(flags, ctypes.POINTER(supervisor.DWORD))
        pointer.contents.value = self.handle_flags[value]
        return 1

    def _create_event(self, _security, manual_reset, initial_state, _name):
        assert bool(manual_reset) is True
        assert bool(initial_state) is False
        self.handle_flags[0x3000] = 0
        return 0x3000

    def _create_file(
        self,
        path,
        _access,
        _share,
        security,
        _disposition,
        _flags,
        _template,
    ):
        assert path == "NUL"
        attributes = ctypes.cast(
            security,
            ctypes.POINTER(supervisor.SECURITY_ATTRIBUTES),
        ).contents
        assert bool(attributes.bInheritHandle) is True
        self.handle_flags[0x4000] = supervisor.HANDLE_FLAG_INHERIT
        return 0x4000

    def _initialize_attribute_list(self, attribute_list, count, flags, size):
        assert _number(count) == 2
        assert _number(flags) == 0
        size_pointer = ctypes.cast(size, ctypes.POINTER(ctypes.c_size_t))
        if not attribute_list:
            size_pointer.contents.value = 128
            self.last_error = self._sizing_error
            return 0
        return self._initialize_second_result

    def _update_attribute(
        self,
        _attribute_list,
        flags,
        attribute,
        value,
        size,
        previous,
        return_size,
    ):
        assert _number(flags) == 0
        assert previous is None
        assert return_size is None
        attribute_number = _number(attribute)
        handle_count = _number(size) // ctypes.sizeof(supervisor.HANDLE)
        handles = ctypes.cast(
            value,
            ctypes.POINTER(supervisor.HANDLE * handle_count),
        ).contents
        self.attribute_values[attribute_number] = tuple(
            supervisor._handle_value(handle) for handle in handles
        )
        self.attribute_sizes[attribute_number] = _number(size)
        return next(self._update_results)

    def _delete_attribute_list(self, _attribute_list):
        self.deleted_attribute_lists += 1

    @staticmethod
    def _read_environment(pointer):
        characters = ctypes.cast(pointer, ctypes.POINTER(ctypes.c_wchar))
        result = []
        index = 0
        while index < 65536:
            character = characters[index]
            result.append(character)
            index += 1
            if len(result) >= 2 and result[-2:] == ["\0", "\0"]:
                return "".join(result)
        raise AssertionError("environment block was not double-NUL terminated")

    def _create_process(
        self,
        application,
        command_line,
        process_security,
        thread_security,
        inherit_handles,
        creation_flags,
        environment,
        current_directory,
        startup_info,
        process_info,
    ):
        startup = ctypes.cast(
            startup_info,
            ctypes.POINTER(supervisor.STARTUPINFOEXW),
        ).contents
        self.created_process = {
            "application": application,
            "command_line": ctypes.wstring_at(command_line),
            "process_security": process_security,
            "thread_security": thread_security,
            "inherit_handles": bool(inherit_handles),
            "creation_flags": _number(creation_flags),
            "environment": self._read_environment(environment),
            "current_directory": current_directory,
            "startup_cb": int(startup.StartupInfo.cb),
            "startup_flags": int(startup.StartupInfo.dwFlags),
            "stdin": supervisor._handle_value(startup.StartupInfo.hStdInput),
            "stdout": supervisor._handle_value(startup.StartupInfo.hStdOutput),
            "stderr": supervisor._handle_value(startup.StartupInfo.hStdError),
            "attribute_list": supervisor._handle_value(startup.lpAttributeList),
        }
        if not self._create_process_result:
            return 0
        result = ctypes.cast(
            process_info,
            ctypes.POINTER(supervisor.PROCESS_INFORMATION),
        ).contents
        result.hProcess = 0x5000
        result.hThread = 0x5001
        result.dwProcessId = 101
        result.dwThreadId = 102
        self.handle_flags[0x5000] = 0
        self.handle_flags[0x5001] = 0
        return 1


def _api(kernel32):
    return supervisor._Win32Api(
        platform="win32",
        kernel32=kernel32,
        pointer_size=8,
        get_osfhandle=lambda fd: {0: 0x1000, 1: 0x1001}[fd],
        get_last_error=lambda: kernel32.last_error,
    )


def test_worker_command_is_absolute_mutable_unicode_and_shell_free():
    frozen_executable = r"C:\Program Files\PuPu 应用\unchain-server.exe"
    frozen = supervisor._build_worker_command(
        executable=frozen_executable,
        frozen=True,
    )
    assert frozen.application == frozen_executable
    assert frozen.arguments == (
        frozen_executable,
        "--vault-sink-worker",
    )
    assert frozen.command_line == subprocess.list2cmdline(frozen.arguments)

    dev_main = r"C:\源码 目录\PuPu\unchain_runtime\server\main.py"
    dev = supervisor._build_worker_command(
        executable=r"C:\Python 3.12\python.exe",
        frozen=False,
        main_path=dev_main,
    )
    assert dev.arguments == (
        r"C:\Python 3.12\python.exe",
        dev_main,
        "--vault-sink-worker",
    )
    assert dev.command_line == subprocess.list2cmdline(dev.arguments)

    long_executable = "\\\\?\\C:\\" + ("very-long-directory\\" * 20) + "worker.exe"
    long_command = supervisor._build_worker_command(
        executable=long_executable,
        frozen=True,
    )
    assert long_command.application == long_executable
    assert long_command.command_line == subprocess.list2cmdline(
        long_command.arguments
    )

    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        supervisor._build_worker_command(
            executable="python.exe",
            frozen=True,
        )
    assert captured.value.code == "vault_worker_spawn_failed"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda command: setattr(command, "application", "python.exe"),
        lambda command: setattr(command, "application", "C:\\bad\x00path.exe"),
        lambda command: setattr(command, "arguments", [command.application]),
        lambda command: setattr(
            command,
            "arguments",
            (r"C:\\different.exe", "--vault-sink-worker"),
        ),
        lambda command: setattr(command, "arguments", (command.application, 1)),
        lambda command: setattr(command, "command_line", "tampered"),
        lambda command: setattr(
            command,
            "command_line",
            "x" * supervisor._MAX_COMMAND_LINE_CHARS,
        ),
    ],
)
def test_atomic_command_validation_rejects_tampering_before_handle_setup(mutate):
    kernel32 = _SpawnKernel32()
    api = _api(kernel32)
    protocol = api._capture_protocol_handles()
    job = api.create_kill_on_close_job()
    command = supervisor._WorkerCommand(
        r"C:\\PuPu\\unchain-server.exe",
        (r"C:\\PuPu\\unchain-server.exe", "--vault-sink-worker"),
    )
    mutate(command)

    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        api._spawn_contained_command(protocol, job, command=command)

    assert captured.value.code == "vault_worker_spawn_failed"
    assert job.value == 0
    assert 0x1234 in kernel32.closed
    assert 0x3000 not in kernel32.closed
    assert kernel32.created_process is None
    protocol.close()


def test_probe_wait_admits_only_signal_or_timeout_results():
    kernel32 = _SpawnKernel32()
    api = _api(kernel32)

    assert api.wait_for_handle_for_probe(0x1000, 50) == supervisor.WAIT_TIMEOUT

    kernel32.WaitForSingleObject.result = supervisor.WAIT_OBJECT_0
    assert api.wait_for_handle_for_probe(0x1000, 50) == supervisor.WAIT_OBJECT_0

    kernel32.WaitForSingleObject.result = 0xFFFFFFFF
    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        api.wait_for_handle_for_probe(0x1000, 50)
    assert captured.value.code == "vault_worker_attestation_failed"


def test_worker_environment_is_minimal_sorted_and_double_nul_terminated():
    built = supervisor._build_worker_environment(
        {
            "SystemRoot": r"C:\Windows",
            "Path": r"C:\Windows\System32",
            "TEMP": r"C:\Users\red\Temp",
            "_PYI_APPLICATION_HOME_DIR": r"C:\Temp\_MEI123",
            "UNCHAIN_AUTH_TOKEN": "must-not-cross",
            "PUPU_VAULT_ELECTRON_PID": "42",
            "MY_SECRET": "must-not-cross",
            "PYINSTALLER_RESET_ENVIRONMENT": "1",
        },
        ready_event_handle=0x2002,
    )

    assert built.values == {
        "SystemRoot": r"C:\Windows",
        "Path": r"C:\Windows\System32",
        "TEMP": r"C:\Users\red\Temp",
        "_PYI_APPLICATION_HOME_DIR": r"C:\Temp\_MEI123",
        supervisor.WORKER_BOOTSTRAP_VERSION_ENV: "1",
        supervisor.WORKER_READY_EVENT_ENV: "8194",
    }
    entries = [entry for entry in built.block.split("\0") if entry]
    assert entries == sorted(entries, key=lambda item: item.split("=", 1)[0].casefold())
    assert built.block.endswith("\0\0")
    assert not built.block.endswith("\0\0\0")
    assert "must-not-cross" not in built.block
    assert "PYINSTALLER_RESET_ENVIRONMENT" not in built.block
    assert "ELECTRON_PID" not in built.block

    with pytest.raises(supervisor.VaultSinkSupervisorError) as captured:
        supervisor._build_worker_environment(
            {"Path": "one", "PATH": "two"},
            ready_event_handle=0x2002,
        )
    assert captured.value.code == "vault_worker_handle_setup_failed"


def test_atomic_spawn_uses_exact_job_and_handle_lists_then_attests_membership():
    kernel32 = _SpawnKernel32()
    api = _api(kernel32)
    protocol = api._capture_protocol_handles()
    job = api.create_kill_on_close_job()

    worker = api._spawn_contained_worker(
        protocol,
        job,
        environment={"SystemRoot": r"C:\Windows", "SECRET": "excluded"},
        executable=r"C:\Program Files\PuPu\unchain-server.exe",
        frozen=True,
    )

    assert kernel32.attribute_values[supervisor.PROC_THREAD_ATTRIBUTE_JOB_LIST] == (
        job.value,
    )
    assert kernel32.attribute_sizes[supervisor.PROC_THREAD_ATTRIBUTE_JOB_LIST] == (
        ctypes.sizeof(supervisor.HANDLE)
    )
    allowed = kernel32.attribute_values[
        supervisor.PROC_THREAD_ATTRIBUTE_HANDLE_LIST
    ]
    assert allowed == (0x2003, 0x2004, 0x4000, 0x2002)
    assert kernel32.attribute_sizes[
        supervisor.PROC_THREAD_ATTRIBUTE_HANDLE_LIST
    ] == 4 * ctypes.sizeof(supervisor.HANDLE)
    assert 0xDEAD not in allowed
    assert job.value not in allowed
    assert worker.ready_event.value == 0x3000
    assert worker.process.value == 0x5000

    created = kernel32.created_process
    assert created is not None
    assert created["application"] == r"C:\Program Files\PuPu\unchain-server.exe"
    assert created["inherit_handles"] is True
    assert created["creation_flags"] == (
        supervisor.EXTENDED_STARTUPINFO_PRESENT
        | supervisor.CREATE_UNICODE_ENVIRONMENT
        | supervisor.CREATE_NO_WINDOW
    )
    assert created["startup_cb"] == ctypes.sizeof(supervisor.STARTUPINFOEXW)
    assert created["startup_flags"] == supervisor.STARTF_USESTDHANDLES
    assert (created["stdin"], created["stdout"], created["stderr"]) == allowed[:3]
    assert created["attribute_list"] != 0
    assert "SECRET" not in created["environment"]
    assert kernel32.deleted_attribute_lists == 1
    assert 0x5001 in kernel32.closed
    for transient in allowed:
        assert transient in kernel32.closed
    assert 0x5000 not in kernel32.closed
    assert 0x3000 not in kernel32.closed
    assert len(kernel32.IsProcessInJob.calls) == 1

    worker.close()
    protocol.close()
    job.close()
    assert 0x5000 in kernel32.closed
    assert 0x3000 in kernel32.closed


def test_capture_protocol_handles_uses_crt_handles_when_std_slots_are_duplicated():
    kernel32 = _SpawnKernel32()
    kernel32.GetStdHandle = _FakeFunction(0xDEAD)
    api = _api(kernel32)

    protocol = api._capture_protocol_handles()

    assert protocol.stdin.value == 0x2000
    assert protocol.stdout.value == 0x2001
    protocol.close()


@pytest.mark.parametrize(
    ("kernel_kwargs", "expected_delete", "expected_spawn"),
    [
        ({"initialize_second_result": 0}, 0, False),
        ({"sizing_error": 5}, 0, False),
        ({"update_results": (0,)}, 1, False),
        ({"update_results": (1, 0)}, 1, False),
        ({"create_process_result": 0}, 1, True),
        ({"in_job_result": False}, 1, True),
        ({"in_job_api_result": 0}, 1, True),
    ],
)
def test_atomic_spawn_faults_close_job_and_every_transient(
    kernel_kwargs,
    expected_delete,
    expected_spawn,
):
    kernel32 = _SpawnKernel32(**kernel_kwargs)
    api = _api(kernel32)
    protocol = api._capture_protocol_handles()
    job = api.create_kill_on_close_job()

    with pytest.raises(supervisor.VaultSinkSupervisorError):
        api._spawn_contained_worker(
            protocol,
            job,
            environment={"SystemRoot": r"C:\Windows"},
            executable=r"C:\PuPu\unchain-server.exe",
            frozen=True,
        )

    assert job.value == 0
    assert 0x1234 in kernel32.closed
    assert 0x3000 in kernel32.closed
    assert kernel32.deleted_attribute_lists == expected_delete
    assert (kernel32.created_process is not None) is expected_spawn
    for transient in [0x2002, 0x2003, 0x2004, 0x4000]:
        assert transient in kernel32.closed
    if expected_spawn and kernel32._create_process_result:
        assert 0x5001 in kernel32.closed
        assert 0x5000 in kernel32.closed

    protocol.close()
