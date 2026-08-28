from __future__ import annotations

from contextlib import redirect_stderr
import importlib.util
import io
import json
import multiprocessing
import os
import subprocess
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import session_execution_guard as guard  # noqa: E402


def _active_guard_worker(data_dir: str, ready, release, results) -> None:
    registry = guard.SessionExecutionGuardRegistry(data_dir)
    disposition = registry.acquire(
        "session-two-process",
        "attempt-worker",
        operation="run",
        execution_id="session-two-process",
    )
    snapshot = registry.snapshot("session-two-process")
    results.put((disposition, snapshot.owner_pid))
    ready.set()
    release.wait(timeout=20)


def _parked_guard_worker(data_dir: str, results) -> None:
    registry = guard.SessionExecutionGuardRegistry(data_dir)
    registry.acquire(
        "session-parked-crash",
        "attempt-parked",
        operation="run",
        execution_id="session-parked-crash",
    )
    registry.park(
        session_id="session-parked-crash",
        interaction_id="interaction-parked",
        source_attempt_id="attempt-parked",
    )
    results.put(registry.snapshot("session-parked-crash").state)


def _record_lock_worker(lock_path: str, ready, release) -> None:
    import fcntl

    descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        ready.set()
        release.wait(timeout=20)
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


class SessionExecutionGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.registry = guard.SessionExecutionGuardRegistry(self.temp_dir.name)
        self.registry.initialize_protocol()

    def test_two_processes_serialize_one_session_and_dead_owner_reclaims(self) -> None:
        context = multiprocessing.get_context("spawn")
        ready = context.Event()
        release = context.Event()
        results = context.Queue()
        process = context.Process(
            target=_active_guard_worker,
            args=(self.temp_dir.name, ready, release, results),
        )
        process.start()
        self.assertTrue(ready.wait(timeout=8))
        disposition, owner_pid = results.get(timeout=8)
        self.assertEqual(disposition, "acquired")
        self.assertEqual(owner_pid, process.pid)

        record_path = self.registry._record_path("session-two-process")
        before = record_path.read_bytes()
        started = time.monotonic()
        with self.assertRaises(guard.SessionExecutionInProgress):
            self.registry.acquire(
                "session-two-process",
                "operation-rebase",
                operation="rebase",
                execution_id="execution-two-process",
            )
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(record_path.read_bytes(), before)

        process.terminate()
        process.join(timeout=8)
        self.assertFalse(process.is_alive())
        reclaimed = self.registry.acquire(
            "session-two-process",
            "operation-rebase",
            operation="rebase",
            execution_id="execution-two-process",
        )
        self.assertEqual(reclaimed, "reclaimed")
        self.assertEqual(
            self.registry.snapshot("session-two-process").attempt_id,
            "operation-rebase",
        )

    def test_dead_parked_owner_is_never_pid_reclaimed(self) -> None:
        context = multiprocessing.get_context("spawn")
        results = context.Queue()
        process = context.Process(
            target=_parked_guard_worker,
            args=(self.temp_dir.name, results),
        )
        process.start()
        self.assertEqual(results.get(timeout=8), "parked")
        process.join(timeout=8)
        self.assertEqual(process.exitcode, 0)

        with self.assertRaises(guard.SessionExecutionInProgress) as blocked:
            self.registry.acquire(
                "session-parked-crash",
                "operation-rebase",
                operation="rebase",
                execution_id="execution-parked-crash",
            )
        self.assertEqual(blocked.exception.state, "parked")

    @unittest.skipIf(os.name == "nt", "POSIX flock holder fixture")
    def test_lock_contention_is_bounded_and_does_not_change_record(self) -> None:
        self.registry.acquire(
            "session-lock-holder",
            "attempt-lock-holder",
            operation="run",
            execution_id="session-lock-holder",
        )
        record_path = self.registry._record_path("session-lock-holder")
        before = record_path.read_bytes()
        lock_path = self.registry._lock_path(record_path)
        context = multiprocessing.get_context("spawn")
        ready = context.Event()
        release = context.Event()
        process = context.Process(
            target=_record_lock_worker,
            args=(str(lock_path), ready, release),
        )
        process.start()
        self.assertTrue(ready.wait(timeout=8))
        started = time.monotonic()
        try:
            with self.assertRaises(guard.SessionExecutionGuardBusy) as busy:
                self.registry.snapshot("session-lock-holder")
            self.assertEqual(busy.exception.status_code, 409)
            self.assertLess(time.monotonic() - started, 1.0)
            self.assertEqual(record_path.read_bytes(), before)
        finally:
            release.set()
            process.join(timeout=8)
        self.assertEqual(process.exitcode, 0)

    def test_windows_lock_opens_backing_file_in_binary_mode(self) -> None:
        lock_path = Path(self.temp_dir.name) / "windows.lock"
        descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        observed_open_flags: list[int] = []
        observed_lock_calls: list[tuple[int, int, int]] = []

        class FakeMsvcrt:
            LK_NBLCK = 1
            LK_UNLCK = 2

            @staticmethod
            def locking(file_descriptor: int, mode: int, length: int) -> None:
                observed_lock_calls.append((file_descriptor, mode, length))

        def open_lock_file(_path: Path, flags: int, _mode: int) -> int:
            observed_open_flags.append(flags)
            return descriptor

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.object(guard, "_WINDOWS_BINARY_FLAG", 0x8000),
            mock.patch.object(guard.os, "open", side_effect=open_lock_file),
            mock.patch.dict(sys.modules, {"msvcrt": FakeMsvcrt}),
        ):
            with guard._exclusive_file_lock(lock_path):
                pass

        self.assertEqual(observed_open_flags, [os.O_RDWR | os.O_CREAT | 0x8000])
        self.assertEqual(
            observed_lock_calls,
            [
                (descriptor, FakeMsvcrt.LK_NBLCK, 1),
                (descriptor, FakeMsvcrt.LK_UNLCK, 1),
            ],
        )

    def test_windows_process_identity_uses_handle_sized_win32_bindings(self) -> None:
        class FakeFileTime:
            def __init__(self) -> None:
                self.dwHighDateTime = 0
                self.dwLowDateTime = 0

        fake_wintypes = types.SimpleNamespace(
            DWORD=object(),
            BOOL=object(),
            HANDLE=object(),
            FILETIME=FakeFileTime,
        )
        handle = object()
        kernel32 = types.SimpleNamespace(
            OpenProcess=mock.Mock(return_value=handle),
            GetProcessTimes=mock.Mock(),
            WaitForSingleObject=mock.Mock(return_value=0x00000102),
            GetLastError=mock.Mock(return_value=0),
            CloseHandle=mock.Mock(return_value=True),
        )

        def set_process_times(
            _handle: object,
            creation: FakeFileTime,
            _exit_time: FakeFileTime,
            _kernel: FakeFileTime,
            _user: FakeFileTime,
        ) -> bool:
            creation.dwHighDateTime = 7
            creation.dwLowDateTime = 11
            return True

        kernel32.GetProcessTimes.side_effect = set_process_times
        fake_ctypes = types.SimpleNamespace(
            windll=types.SimpleNamespace(kernel32=kernel32),
            POINTER=lambda value: ("pointer", value),
            byref=lambda value: value,
            wintypes=fake_wintypes,
        )
        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}),
        ):
            state, token = guard._windows_process_identity(321)

        self.assertEqual(state, "alive")
        self.assertTrue(token)
        self.assertEqual(
            kernel32.OpenProcess.argtypes,
            (fake_wintypes.DWORD, fake_wintypes.BOOL, fake_wintypes.DWORD),
        )
        self.assertIs(kernel32.OpenProcess.restype, fake_wintypes.HANDLE)
        self.assertEqual(
            kernel32.GetProcessTimes.argtypes,
            (
                fake_wintypes.HANDLE,
                ("pointer", FakeFileTime),
                ("pointer", FakeFileTime),
                ("pointer", FakeFileTime),
                ("pointer", FakeFileTime),
            ),
        )
        self.assertIs(kernel32.GetProcessTimes.restype, fake_wintypes.BOOL)
        self.assertEqual(
            kernel32.WaitForSingleObject.argtypes,
            (fake_wintypes.HANDLE, fake_wintypes.DWORD),
        )
        self.assertIs(kernel32.WaitForSingleObject.restype, fake_wintypes.DWORD)
        self.assertEqual(kernel32.GetLastError.argtypes, ())
        self.assertIs(kernel32.GetLastError.restype, fake_wintypes.DWORD)
        self.assertEqual(kernel32.CloseHandle.argtypes, (fake_wintypes.HANDLE,))
        self.assertIs(kernel32.CloseHandle.restype, fake_wintypes.BOOL)
        kernel32.OpenProcess.assert_called_once_with(0x101000, False, 321)
        kernel32.WaitForSingleObject.assert_called_once_with(handle, 0)
        kernel32.GetLastError.assert_not_called()
        kernel32.CloseHandle.assert_called_once_with(handle)

    def test_windows_process_identity_bypasses_posix_signal_probe(self) -> None:
        windows_identity = ("alive", "windows-incarnation")
        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.object(
                guard.os,
                "kill",
                side_effect=OSError("Windows signal probe is forbidden"),
            ) as kill,
            mock.patch.object(
                guard,
                "_windows_process_identity",
                return_value=windows_identity,
            ) as native_identity,
        ):
            self.assertEqual(guard._process_identity(321), windows_identity)

        kill.assert_not_called()
        native_identity.assert_called_once_with(321)

    def test_windows_process_identity_uses_current_process_pseudo_handle(self) -> None:
        class FakeFileTime:
            def __init__(self) -> None:
                self.dwHighDateTime = 0
                self.dwLowDateTime = 0

        fake_wintypes = types.SimpleNamespace(
            DWORD=object(),
            BOOL=object(),
            HANDLE=object(),
            FILETIME=FakeFileTime,
        )
        handle = object()
        kernel32 = types.SimpleNamespace(
            OpenProcess=mock.Mock(),
            GetCurrentProcess=mock.Mock(return_value=handle),
            GetProcessTimes=mock.Mock(return_value=True),
            WaitForSingleObject=mock.Mock(),
            GetLastError=mock.Mock(return_value=0),
            CloseHandle=mock.Mock(return_value=True),
        )
        fake_ctypes = types.SimpleNamespace(
            windll=types.SimpleNamespace(kernel32=kernel32),
            POINTER=lambda value: ("pointer", value),
            byref=lambda value: value,
            wintypes=fake_wintypes,
        )

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.object(guard.os, "getpid", return_value=321),
            mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}),
        ):
            state, token = guard._windows_process_identity(321)

        self.assertEqual(state, "alive")
        self.assertTrue(token)
        self.assertEqual(kernel32.GetCurrentProcess.argtypes, ())
        self.assertIs(kernel32.GetCurrentProcess.restype, fake_wintypes.HANDLE)
        kernel32.GetCurrentProcess.assert_called_once_with()
        kernel32.OpenProcess.assert_not_called()
        kernel32.WaitForSingleObject.assert_not_called()
        kernel32.GetLastError.assert_not_called()
        kernel32.CloseHandle.assert_not_called()

    def test_windows_process_identity_reports_exited_process_dead(self) -> None:
        class FakeFileTime:
            def __init__(self) -> None:
                self.dwHighDateTime = 0
                self.dwLowDateTime = 0

        fake_wintypes = types.SimpleNamespace(
            DWORD=object(),
            BOOL=object(),
            HANDLE=object(),
            FILETIME=FakeFileTime,
        )
        handle = object()
        kernel32 = types.SimpleNamespace(
            OpenProcess=mock.Mock(return_value=handle),
            GetProcessTimes=mock.Mock(),
            WaitForSingleObject=mock.Mock(return_value=0x00000000),
            GetLastError=mock.Mock(return_value=0),
            CloseHandle=mock.Mock(return_value=True),
        )
        fake_ctypes = types.SimpleNamespace(
            windll=types.SimpleNamespace(kernel32=kernel32),
            POINTER=lambda value: ("pointer", value),
            byref=lambda value: value,
            wintypes=fake_wintypes,
        )

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}),
        ):
            self.assertEqual(guard._windows_process_identity(321), ("dead", ""))

        kernel32.GetProcessTimes.assert_not_called()
        kernel32.CloseHandle.assert_called_once_with(handle)

    def test_windows_process_identity_reports_missing_process_dead(self) -> None:
        class FakeFileTime:
            pass

        fake_wintypes = types.SimpleNamespace(
            DWORD=object(),
            BOOL=object(),
            HANDLE=object(),
            FILETIME=FakeFileTime,
        )
        kernel32 = types.SimpleNamespace(
            OpenProcess=mock.Mock(return_value=None),
            GetProcessTimes=mock.Mock(),
            WaitForSingleObject=mock.Mock(),
            GetLastError=mock.Mock(return_value=87),
            CloseHandle=mock.Mock(),
        )
        fake_ctypes = types.SimpleNamespace(
            windll=types.SimpleNamespace(kernel32=kernel32),
            POINTER=lambda value: ("pointer", value),
            byref=lambda value: value,
            wintypes=fake_wintypes,
        )

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}),
        ):
            self.assertEqual(guard._windows_process_identity(321), ("dead", ""))

        kernel32.GetLastError.assert_called_once_with()
        kernel32.GetProcessTimes.assert_not_called()
        kernel32.CloseHandle.assert_not_called()

    def test_windows_process_identity_fails_closed_on_access_denial(self) -> None:
        class FakeFileTime:
            pass

        fake_wintypes = types.SimpleNamespace(
            DWORD=object(),
            BOOL=object(),
            HANDLE=object(),
            FILETIME=FakeFileTime,
        )
        kernel32 = types.SimpleNamespace(
            OpenProcess=mock.Mock(return_value=None),
            GetProcessTimes=mock.Mock(),
            WaitForSingleObject=mock.Mock(),
            GetLastError=mock.Mock(return_value=5),
            CloseHandle=mock.Mock(),
        )
        fake_ctypes = types.SimpleNamespace(
            windll=types.SimpleNamespace(kernel32=kernel32),
            POINTER=lambda value: ("pointer", value),
            byref=lambda value: value,
            wintypes=fake_wintypes,
        )

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}),
        ):
            self.assertEqual(guard._windows_process_identity(321), ("unknown", ""))

        kernel32.GetLastError.assert_called_once_with()
        kernel32.GetProcessTimes.assert_not_called()
        kernel32.CloseHandle.assert_not_called()

    def test_windows_process_identity_fails_closed_on_unexpected_wait(self) -> None:
        class FakeFileTime:
            pass

        fake_wintypes = types.SimpleNamespace(
            DWORD=object(),
            BOOL=object(),
            HANDLE=object(),
            FILETIME=FakeFileTime,
        )
        handle = object()
        kernel32 = types.SimpleNamespace(
            OpenProcess=mock.Mock(return_value=handle),
            GetProcessTimes=mock.Mock(),
            WaitForSingleObject=mock.Mock(return_value=0xFFFFFFFF),
            GetLastError=mock.Mock(return_value=0),
            CloseHandle=mock.Mock(return_value=True),
        )
        fake_ctypes = types.SimpleNamespace(
            windll=types.SimpleNamespace(kernel32=kernel32),
            POINTER=lambda value: ("pointer", value),
            byref=lambda value: value,
            wintypes=fake_wintypes,
        )

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}),
        ):
            self.assertEqual(guard._windows_process_identity(321), ("unknown", ""))

        kernel32.GetProcessTimes.assert_not_called()
        kernel32.CloseHandle.assert_called_once_with(handle)

    def test_windows_process_identity_fails_closed_when_handle_is_rejected(self) -> None:
        class FakeFileTime:
            def __init__(self) -> None:
                self.dwHighDateTime = 0
                self.dwLowDateTime = 0

        fake_wintypes = types.SimpleNamespace(
            DWORD=object(),
            BOOL=object(),
            HANDLE=object(),
            FILETIME=FakeFileTime,
        )
        handle = object()
        kernel32 = types.SimpleNamespace(
            OpenProcess=mock.Mock(return_value=handle),
            GetProcessTimes=mock.Mock(return_value=False),
            WaitForSingleObject=mock.Mock(return_value=0x00000102),
            GetLastError=mock.Mock(return_value=0),
            CloseHandle=mock.Mock(return_value=True),
        )
        fake_ctypes = types.SimpleNamespace(
            windll=types.SimpleNamespace(kernel32=kernel32),
            POINTER=lambda value: ("pointer", value),
            byref=lambda value: value,
            wintypes=fake_wintypes,
        )

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}),
        ):
            self.assertEqual(guard._windows_process_identity(321), ("unknown", ""))

        kernel32.CloseHandle.assert_called_once_with(handle)

    def test_session_guard_smoke_launches_windows_sidecar_without_console(self) -> None:
        repo_root = SERVER_ROOT.parents[1]
        smoke_path = (
            repo_root / "scripts" / "release-qa" / "windows-session-guard-smoke.py"
        )
        spec = importlib.util.spec_from_file_location(
            "pupu_session_guard_smoke_launch_contract",
            smoke_path,
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        smoke = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(smoke)

        with (
            mock.patch.object(smoke.os, "name", "nt"),
            mock.patch.object(
                smoke.subprocess,
                "CREATE_NO_WINDOW",
                0x08000000,
                create=True,
            ),
        ):
            self.assertEqual(smoke._sidecar_creation_flags(), 0x08000000)

        with mock.patch.object(smoke.os, "name", "posix"):
            self.assertEqual(smoke._sidecar_creation_flags(), 0)

    def test_session_guard_smoke_probes_real_windows_foreign_process_lifecycle(
        self,
    ) -> None:
        repo_root = SERVER_ROOT.parents[1]
        smoke_path = (
            repo_root / "scripts" / "release-qa" / "windows-session-guard-smoke.py"
        )
        spec = importlib.util.spec_from_file_location(
            "pupu_session_guard_smoke_process_contract",
            smoke_path,
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        smoke = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(smoke)

        transient = mock.Mock(pid=321)
        transient.poll.return_value = None
        process_identity = mock.Mock(
            side_effect=[
                ("alive", "foreign-incarnation"),
                ("dead", ""),
            ]
        )
        with (
            mock.patch.object(smoke.os, "name", "nt"),
            mock.patch.object(
                smoke.subprocess,
                "CREATE_NO_WINDOW",
                0x08000000,
                create=True,
            ),
            mock.patch.object(
                smoke.subprocess,
                "Popen",
                return_value=transient,
            ) as popen,
        ):
            smoke._verify_windows_foreign_process_identity(process_identity)

        process_identity.assert_has_calls([mock.call(321), mock.call(321)])
        transient.terminate.assert_called_once_with()
        transient.wait.assert_called_once_with(timeout=10)
        popen.assert_called_once()
        self.assertEqual(popen.call_args.kwargs["creationflags"], 0x08000000)

        with (
            mock.patch.object(smoke.os, "name", "posix"),
            mock.patch.object(smoke.subprocess, "Popen") as posix_popen,
        ):
            smoke._verify_windows_foreign_process_identity(process_identity)
        posix_popen.assert_not_called()

    def test_session_guard_smoke_imports_the_sidecar_without_pythonpath(self) -> None:
        repo_root = SERVER_ROOT.parents[1]
        smoke = repo_root / "scripts" / "release-qa" / "windows-session-guard-smoke.py"
        evidence = Path(self.temp_dir.name) / "session-guard-smoke.json"
        environment = os.environ.copy()
        environment.pop("PYTHONPATH", None)
        environment["UNCHAIN_DATA_DIR"] = str(Path(self.temp_dir.name) / "smoke-data")
        environment["SESSION_GUARD_SMOKE_EVIDENCE_PATH"] = str(evidence)

        completed = subprocess.run(
            [sys.executable, str(smoke)],
            cwd=repo_root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(
            json.loads(evidence.read_text(encoding="utf-8")),
            {
                "schema": "pupu.session-guard-startup-smoke.v1",
                "executed_tests": 1,
                "protocol_version": 1,
                "startup_entrypoint": "main.py",
            },
        )

    def test_session_guard_smoke_uses_product_budget_and_safe_timeout_status(self) -> None:
        repo_root = SERVER_ROOT.parents[1]
        smoke_path = (
            repo_root / "scripts" / "release-qa" / "windows-session-guard-smoke.py"
        )
        spec = importlib.util.spec_from_file_location(
            "pupu_session_guard_smoke_contract",
            smoke_path,
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        smoke = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(smoke)

        class FakeProcess:
            @staticmethod
            def poll():
                return None

        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            @staticmethod
            def read():
                return json.dumps(
                    {
                        "status": "ok",
                        "session_guard_migration": {
                            **smoke._EXPECTED_RECEIPT,
                            "status": "unavailable",
                        },
                    }
                ).encode("utf-8")

        self.assertEqual(smoke._STARTUP_TIMEOUT_SECONDS, 60)
        with (
            mock.patch.object(smoke.time, "monotonic", side_effect=[0, 0, 61]),
            mock.patch.object(smoke.time, "sleep"),
            mock.patch.object(smoke.urllib.request, "urlopen", return_value=FakeResponse()),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                r"^sidecar authenticated health did not become ready "
                r"\(last_receipt_status=unavailable\)$",
            ):
                smoke._wait_for_ready_health(
                    FakeProcess(),
                    port=5879,
                    auth_token="content-free-test-token",
                )

    def test_parked_receipt_resume_and_cancel_require_exact_lineage(self) -> None:
        self.registry.acquire(
            "session-lineage",
            "attempt-original",
            operation="run",
            execution_id="session-lineage",
        )
        self.registry.park(
            session_id="session-lineage",
            interaction_id="interaction-lineage",
            source_attempt_id="attempt-original",
        )
        self.registry.bind_receipt(
            session_id="session-lineage",
            interaction_id="interaction-lineage",
            source_attempt_id="attempt-original",
            receipt_id="receipt-lineage",
        )
        restarted = guard.SessionExecutionGuardRegistry(
            self.temp_dir.name,
            process_owner_id="restart-owner",
            process_pid=os.getpid(),
            process_incarnation=self.registry._process_incarnation,
        )
        with self.assertRaises(guard.SessionExecutionGuardError):
            restarted.transfer_parked(
                session_id="session-lineage",
                interaction_id="interaction-lineage",
                source_attempt_id="attempt-original",
                receipt_id="receipt-wrong",
                attempt_id="attempt-resumed",
            )
        restarted.transfer_parked(
            session_id="session-lineage",
            interaction_id="interaction-lineage",
            source_attempt_id="attempt-original",
            receipt_id="receipt-lineage",
            attempt_id="attempt-resumed",
        )
        resumed = restarted.snapshot("session-lineage")
        self.assertEqual((resumed.state, resumed.attempt_id), ("active", "attempt-resumed"))
        restarted.release_run("session-lineage", "attempt-resumed")

        self.assertEqual(
            restarted.park_from_durable_interaction(
                session_id="session-old-pending",
                interaction_id="interaction-old-pending",
                source_attempt_id="attempt-old-pending",
                owner_attempt_id="attempt-old-pending",
            ),
            "parked_from_durable_interaction",
        )
        restarted.consume_parked(
            session_id="session-old-pending",
            interaction_id="interaction-old-pending",
            source_attempt_id="attempt-old-pending",
        )
        self.assertIsNone(restarted.snapshot("session-old-pending"))

    def test_durable_park_rejects_a_different_active_attempt(self) -> None:
        self.registry.acquire(
            "session-stale-interaction",
            "attempt-current",
            operation="run",
            execution_id="session-stale-interaction",
        )
        record_path = self.registry._record_path("session-stale-interaction")
        before = record_path.read_bytes()

        with self.assertRaises(guard.SessionExecutionGuardError) as mismatch:
            self.registry.park_from_durable_interaction(
                session_id="session-stale-interaction",
                interaction_id="interaction-stale",
                source_attempt_id="attempt-stale",
                owner_attempt_id="attempt-stale",
            )

        self.assertEqual(
            mismatch.exception.code,
            "session_guard_interaction_attempt_mismatch",
        )
        self.assertFalse(mismatch.exception.retryable)
        self.assertEqual(record_path.read_bytes(), before)
        current = self.registry.snapshot("session-stale-interaction")
        self.assertEqual(current.state, "active")
        self.assertEqual(current.attempt_id, "attempt-current")

    def test_graph_park_preserves_distinct_owner_and_step_source(self) -> None:
        self.registry.acquire(
            "session-graph",
            "attempt-coordinator",
            operation="run",
            execution_id="session-graph",
        )
        record_path = self.registry._record_path("session-graph")
        before = record_path.read_bytes()

        with self.assertRaises(guard.SessionExecutionGuardError) as foreign:
            self.registry.park(
                session_id="session-graph",
                interaction_id="interaction-graph",
                source_attempt_id="attempt-step",
                owner_attempt_id="attempt-foreign-coordinator",
            )
        self.assertEqual(
            foreign.exception.code,
            "session_guard_interaction_attempt_mismatch",
        )
        self.assertEqual(record_path.read_bytes(), before)

        self.registry.park(
            session_id="session-graph",
            interaction_id="interaction-graph",
            source_attempt_id="attempt-step",
            owner_attempt_id="attempt-coordinator",
        )
        parked = self.registry.snapshot("session-graph")
        self.assertEqual(parked.state, "parked")
        self.assertEqual(parked.attempt_id, "attempt-coordinator")
        self.assertEqual(
            parked.interaction_source_attempt_id,
            "attempt-step",
        )

        parked_bytes = record_path.read_bytes()
        with self.assertRaises(guard.SessionExecutionGuardError):
            self.registry.park_from_durable_interaction(
                session_id="session-graph",
                interaction_id="interaction-graph",
                source_attempt_id="attempt-step",
                owner_attempt_id="attempt-foreign-coordinator",
            )
        self.assertEqual(record_path.read_bytes(), parked_bytes)

    def test_protocol_migration_requires_explicit_stop_the_world(self) -> None:
        migration_dir = Path(self.temp_dir.name) / "migration"
        legacy = migration_dir / "executions" / "legacy"
        legacy.mkdir(parents=True)
        (legacy / "attempt.json").write_text("{}", encoding="utf-8")
        registry = guard.SessionExecutionGuardRegistry(migration_dir)

        with self.assertRaises(guard.SessionExecutionGuardError) as required:
            registry.initialize_protocol()
        self.assertEqual(
            required.exception.code,
            "session_guard_stop_the_world_required",
        )
        registry.initialize_protocol(stop_the_world=True)
        marker = migration_dir / "session_execution_guards" / "protocol.json"
        self.assertEqual(
            json.loads(marker.read_text(encoding="utf-8")),
            {
                "schema": "pupu.session-execution-guard.protocol.v1",
                "protocol_version": 1,
                "compatibility": "exact",
            },
        )


class SessionGuardMigrationDiagnosticTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_directory.cleanup)
        guard._SESSION_GUARD_DIAGNOSTICS_EMITTED.clear()
        self.addCleanup(guard._SESSION_GUARD_DIAGNOSTICS_EMITTED.clear)

    def test_diagnostic_code_mapping_is_closed(self) -> None:
        cases = (
            (
                "session_guard_process_identity_unavailable",
                "private process detail",
                "session_guard_process_identity_unavailable",
            ),
            (
                "session_execution_in_progress",
                "private lock detail",
                "session_guard_protocol_lock_busy",
            ),
            (
                "session_guard_protocol_corrupt",
                "private marker detail",
                "session_guard_protocol_corrupt",
            ),
            (
                "session_guard_protocol_incompatible",
                "private marker detail",
                "session_guard_protocol_incompatible",
            ),
            (
                "session_execution_guard_unavailable",
                "UNCHAIN_DATA_DIR is not configured",
                "session_guard_data_dir_unavailable",
            ),
            (
                "session_execution_guard_unavailable",
                "session guard directory is unavailable",
                "session_guard_data_dir_unavailable",
            ),
            (
                "session_execution_guard_unavailable",
                "existing execution state cannot be inspected",
                "session_guard_legacy_probe_unavailable",
            ),
            (
                "session_execution_guard_unavailable",
                "session guard lock could not be opened",
                "session_guard_protocol_lock_open_unavailable",
            ),
            (
                "session_execution_guard_unavailable",
                "session guard lock operation failed",
                "session_guard_protocol_lock_operation_unavailable",
            ),
            (
                "session_execution_guard_unavailable",
                "session guard record could not be committed",
                "session_guard_protocol_commit_unavailable",
            ),
            (
                "session_execution_guard_unavailable",
                r"C:\\Users\\private errno=5 token=secret",
                "session_guard_unknown_unavailable",
            ),
        )
        for error_code, message, expected in cases:
            with self.subTest(error_code=error_code, message=message):
                error = guard.SessionExecutionGuardError(error_code, message)
                self.assertEqual(
                    guard._session_guard_migration_diagnostic_code(error),
                    expected,
                )

        stop_world = guard.SessionExecutionGuardError(
            "session_guard_stop_the_world_required",
            "private migration detail",
        )
        self.assertIsNone(
            guard._session_guard_migration_diagnostic_code(stop_world)
        )

    def test_real_unavailable_producers_map_to_closed_diagnostic_codes(
        self,
    ) -> None:
        def registry(data_dir=None):
            return guard.SessionExecutionGuardRegistry(
                data_dir,
                process_owner_id="diagnostic-owner",
                process_pid=os.getpid(),
                process_incarnation="diagnostic-incarnation",
            )

        with mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": ""},
            clear=False,
        ):
            with self.assertRaises(guard.SessionExecutionGuardError) as missing:
                registry().initialize_protocol()
        self.assertEqual(
            guard._session_guard_migration_diagnostic_code(missing.exception),
            "session_guard_data_dir_unavailable",
        )

        lock_open_dir = Path(self.temp_directory.name) / "lock-open"
        with mock.patch.object(guard.os, "open", side_effect=OSError("private")):
            with self.assertRaises(guard.SessionExecutionGuardError) as lock_open:
                registry(lock_open_dir).initialize_protocol()
        self.assertEqual(
            guard._session_guard_migration_diagnostic_code(lock_open.exception),
            "session_guard_protocol_lock_open_unavailable",
        )

        lock_operation_path = Path(self.temp_directory.name) / "lock-operation"
        descriptor = os.open(
            lock_operation_path,
            os.O_RDWR | os.O_CREAT,
            0o600,
        )

        class FailingUnlockMsvcrt:
            LK_NBLCK = 1
            LK_UNLCK = 2

            @staticmethod
            def locking(_descriptor: int, mode: int, _length: int) -> None:
                if mode == FailingUnlockMsvcrt.LK_UNLCK:
                    raise OSError("private")

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.object(guard, "_WINDOWS_BINARY_FLAG", 0x8000),
            mock.patch.object(guard.os, "open", return_value=descriptor),
            mock.patch.dict(sys.modules, {"msvcrt": FailingUnlockMsvcrt}),
        ):
            with self.assertRaises(guard.SessionExecutionGuardError) as lock_op:
                with guard._exclusive_file_lock(lock_operation_path):
                    pass
        self.assertEqual(
            guard._session_guard_migration_diagnostic_code(lock_op.exception),
            "session_guard_protocol_lock_operation_unavailable",
        )

        legacy_dir = Path(self.temp_directory.name) / "legacy-probe"
        (legacy_dir / "executions").mkdir(parents=True)
        with mock.patch.object(Path, "rglob", side_effect=OSError("private")):
            with self.assertRaises(guard.SessionExecutionGuardError) as legacy_probe:
                registry(legacy_dir).initialize_protocol()
        self.assertEqual(
            guard._session_guard_migration_diagnostic_code(legacy_probe.exception),
            "session_guard_legacy_probe_unavailable",
        )

        commit_dir = Path(self.temp_directory.name) / "commit"
        with mock.patch.object(guard.os, "replace", side_effect=OSError("private")):
            with self.assertRaises(guard.SessionExecutionGuardError) as commit:
                registry(commit_dir).initialize_protocol()
        self.assertEqual(
            guard._session_guard_migration_diagnostic_code(commit.exception),
            "session_guard_protocol_commit_unavailable",
        )

    def test_unavailable_receipt_emits_one_content_free_line_only_when_enabled(
        self,
    ) -> None:
        class FailingRegistry:
            @staticmethod
            def initialize_protocol() -> None:
                raise guard.SessionExecutionGuardError(
                    "session_execution_guard_unavailable",
                    r"C:\\Users\\private errno=5 token=secret",
                )

        output = io.StringIO()
        with (
            mock.patch.object(guard, "_DEFAULT_REGISTRY", FailingRegistry()),
            mock.patch.dict(
                os.environ,
                {"PUPU_SESSION_GUARD_DIAGNOSTICS": "1"},
                clear=False,
            ),
            redirect_stderr(output),
        ):
            first = guard.session_guard_migration_receipt()
            second = guard.session_guard_migration_receipt()

        expected_receipt = {
            "schema": "pupu.session-guard-migration",
            "version": 1,
            "status": "unavailable",
            "protocol_version": 1,
        }
        self.assertEqual(first, expected_receipt)
        self.assertEqual(second, expected_receipt)
        self.assertEqual(
            output.getvalue(),
            "[session-guard] migration unavailable "
            "code=session_guard_unknown_unavailable\n",
        )
        self.assertNotIn("Users", output.getvalue())
        self.assertNotIn("token", output.getvalue())
        self.assertNotIn("errno", output.getvalue())

    def test_disabled_and_stop_world_paths_emit_no_unavailable_diagnostic(
        self,
    ) -> None:
        class FailingRegistry:
            error = guard.SessionExecutionGuardError(
                "session_execution_guard_unavailable",
                "UNCHAIN_DATA_DIR is not configured",
            )

            @classmethod
            def initialize_protocol(cls) -> None:
                raise cls.error

        output = io.StringIO()
        with (
            mock.patch.object(guard, "_DEFAULT_REGISTRY", FailingRegistry()),
            mock.patch.dict(
                os.environ,
                {"PUPU_SESSION_GUARD_DIAGNOSTICS": "0"},
                clear=False,
            ),
            redirect_stderr(output),
        ):
            self.assertEqual(
                guard.session_guard_migration_receipt()["status"],
                "unavailable",
            )
        self.assertEqual(output.getvalue(), "")

        FailingRegistry.error = guard.SessionExecutionGuardError(
            "session_guard_stop_the_world_required",
            "existing execution data requires migration",
        )
        with (
            mock.patch.object(guard, "_DEFAULT_REGISTRY", FailingRegistry()),
            mock.patch.dict(
                os.environ,
                {"PUPU_SESSION_GUARD_DIAGNOSTICS": "1"},
                clear=False,
            ),
            redirect_stderr(output),
        ):
            self.assertEqual(
                guard.session_guard_migration_receipt()["status"],
                "migration_required",
            )
        self.assertEqual(output.getvalue(), "")

    def test_diagnostic_write_failure_does_not_change_the_receipt(self) -> None:
        class FailingRegistry:
            @staticmethod
            def initialize_protocol() -> None:
                raise guard.SessionExecutionGuardError(
                    "session_execution_guard_unavailable",
                    "session guard lock operation failed",
                )

        class FailingStderr:
            @staticmethod
            def write(_value: str) -> None:
                raise OSError("stderr unavailable")

            @staticmethod
            def flush() -> None:
                raise OSError("stderr unavailable")

        with (
            mock.patch.object(guard, "_DEFAULT_REGISTRY", FailingRegistry()),
            mock.patch.object(guard.sys, "stderr", FailingStderr()),
            mock.patch.dict(
                os.environ,
                {"PUPU_SESSION_GUARD_DIAGNOSTICS": "1"},
                clear=False,
            ),
        ):
            self.assertEqual(
                guard.session_guard_migration_receipt(),
                {
                    "schema": "pupu.session-guard-migration",
                    "version": 1,
                    "status": "unavailable",
                    "protocol_version": 1,
                },
            )


if __name__ == "__main__":
    unittest.main()
