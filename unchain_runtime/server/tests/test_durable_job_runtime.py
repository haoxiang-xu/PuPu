import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import durable_job_runtime  # noqa: E402


class DurableJobRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        durable_job_runtime._reset_durable_jobs_runtime_for_tests()
        self.addCleanup(
            durable_job_runtime._reset_durable_jobs_runtime_for_tests
        )

    def test_old_unchain_without_jobs_stays_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=True,
        ), mock.patch.object(
            durable_job_runtime,
            "_load_jobs_types",
            return_value=None,
        ):
            self.assertIsNone(durable_job_runtime.get_durable_jobs_runtime())

    def test_runtime_is_singleton_with_private_stable_store_and_environment(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_DATA_DIR": data_dir,
                "UNCHAIN_AUTH_TOKEN": "token-a",
                "UNCHAIN_HOST": "127.0.0.1",
                "UNCHAIN_PARENT_PID": "101",
                "UNCHAIN_PORT": "5879",
                "PUPU_STABLE_JOB_ENV": "keep-me",
            },
            clear=True,
        ):
            first = durable_job_runtime.get_durable_jobs_runtime()
            self.assertIsNotNone(first)
            self.assertEqual(first.data_dir, Path(data_dir).resolve())
            self.assertEqual(first.store_path, Path(data_dir).resolve() / "jobs")
            self.assertEqual(first.supervisor.store.base_dir, first.store_path)

            first_environment = first.supervisor.environment_profile.to_environment()
            self.assertEqual(first_environment["PUPU_STABLE_JOB_ENV"], "keep-me")
            for key in (
                "UNCHAIN_AUTH_TOKEN",
                "UNCHAIN_HOST",
                "UNCHAIN_PARENT_PID",
                "UNCHAIN_PORT",
            ):
                self.assertNotIn(key, first_environment)

            os.environ.update(
                {
                    "UNCHAIN_AUTH_TOKEN": "token-b",
                    "UNCHAIN_HOST": "localhost",
                    "UNCHAIN_PARENT_PID": "202",
                    "UNCHAIN_PORT": "5890",
                }
            )
            same_process = durable_job_runtime.get_durable_jobs_runtime()
            self.assertIs(same_process, first)

            first_store_id = first.supervisor.store.store_id
            first_environment_digest = first.supervisor.environment_profile.digest
            durable_job_runtime._reset_durable_jobs_runtime_for_tests()
            reopened = durable_job_runtime.get_durable_jobs_runtime()
            self.assertIsNot(reopened, first)
            self.assertEqual(reopened.supervisor.store.store_id, first_store_id)
            self.assertEqual(
                reopened.supervisor.environment_profile.digest,
                first_environment_digest,
            )

    def test_frozen_linux_parent_and_worker_rebuild_the_same_environment_digest(
        self,
    ) -> None:
        from unchain.jobs import JobEnvironmentProfile

        stable = {
            "HOME": "/Users/test",
            "PATH": "/usr/bin:/bin",
            "UNCHAIN_DATA_DIR": "/tmp/pupu-data",
        }
        parent_environment = {
            **stable,
            "_PYI_APPLICATION_HOME_DIR": "/tmp/_MEI-parent",
            "_MEIPASS": "/tmp/_MEI-parent",
            "LD_LIBRARY_PATH": "/tmp/_MEI-parent",
            "LD_LIBRARY_PATH_ORIG": "/usr/local/lib:/usr/lib",
            "LIBPATH": "/keep/aix/lib",
            "DYLD_LIBRARY_PATH": "/keep/macos/lib",
        }
        worker_environment = {
            **stable,
            "_PYI_APPLICATION_HOME_DIR": "/tmp/_MEI-worker",
            "_MEIPASS": "/tmp/_MEI-worker",
            "LD_LIBRARY_PATH": "/tmp/_MEI-worker",
            "LD_LIBRARY_PATH_ORIG": "/usr/local/lib:/usr/lib",
            "LIBPATH": "/keep/aix/lib",
            "DYLD_LIBRARY_PATH": "/keep/macos/lib",
            "PYINSTALLER_RESET_ENVIRONMENT": "1",
        }

        with mock.patch.object(sys, "platform", "linux"):
            parent_canonical = durable_job_runtime.sanitized_job_environment(
                parent_environment,
                frozen=True,
            )
            worker_canonical = durable_job_runtime.sanitized_job_environment(
                worker_environment,
                frozen=True,
            )

        self.assertEqual(worker_canonical, parent_canonical)
        self.assertEqual(
            parent_canonical["LD_LIBRARY_PATH"],
            "/usr/local/lib:/usr/lib",
        )
        self.assertEqual(parent_canonical["LIBPATH"], "/keep/aix/lib")
        self.assertEqual(parent_canonical["DYLD_LIBRARY_PATH"], "/keep/macos/lib")
        self.assertNotIn("PYINSTALLER_RESET_ENVIRONMENT", worker_canonical)
        self.assertFalse(
            any(key.upper().startswith("_PYI_") for key in worker_canonical)
        )

        with mock.patch.object(sys, "frozen", True, create=True):
            parent_profile = JobEnvironmentProfile.capture(parent_canonical)
            worker_profile = JobEnvironmentProfile.capture(worker_canonical)
        self.assertEqual(worker_profile.digest, parent_profile.digest)

    def test_frozen_macos_removes_only_bundle_dyld_entries(self) -> None:
        parent_environment = {
            "PATH": "/usr/bin:/bin",
            "_PYI_APPLICATION_HOME_DIR": "/tmp/_MEI-parent",
            "DYLD_LIBRARY_PATH": "/tmp/_MEI-parent:/opt/user/lib",
            "LD_LIBRARY_PATH": "/opt/linux/user/lib",
            "LIBPATH": "/opt/aix/user/lib",
        }
        worker_environment = {
            "PATH": "/usr/bin:/bin",
            "_PYI_APPLICATION_HOME_DIR": "/tmp/_MEI-worker",
            "DYLD_LIBRARY_PATH": "/tmp/_MEI-worker:/opt/user/lib",
            "LD_LIBRARY_PATH": "/opt/linux/user/lib",
            "LIBPATH": "/opt/aix/user/lib",
            "PYINSTALLER_RESET_ENVIRONMENT": "1",
        }

        with mock.patch.object(sys, "platform", "darwin"):
            parent = durable_job_runtime.sanitized_job_environment(
                parent_environment,
                frozen=True,
            )
            worker = durable_job_runtime.sanitized_job_environment(
                worker_environment,
                frozen=True,
            )

        self.assertEqual(worker, parent)
        self.assertEqual(parent["DYLD_LIBRARY_PATH"], "/opt/user/lib")
        self.assertEqual(parent["LD_LIBRARY_PATH"], "/opt/linux/user/lib")
        self.assertEqual(parent["LIBPATH"], "/opt/aix/user/lib")

    def test_frozen_windows_restores_process_dll_search_before_user_child(
        self,
    ) -> None:
        fake_windll = mock.Mock()
        with mock.patch.object(sys, "frozen", True, create=True), mock.patch.object(
            sys,
            "platform",
            "win32",
        ), mock.patch("ctypes.windll", fake_windll, create=True), mock.patch.dict(
            os.environ,
            {
                "PATH": r"C:\Windows\System32",
                "UNCHAIN_DATA_DIR": r"C:\Users\test\PuPu",
                "_PYI_APPLICATION_HOME_DIR": r"C:\Temp\_MEI-worker",
                "PYINSTALLER_RESET_ENVIRONMENT": "1",
            },
            clear=True,
        ):
            canonical = durable_job_runtime.restore_frozen_job_environment()

        self.assertEqual(canonical["PATH"], r"C:\Windows\System32")
        self.assertNotIn("_PYI_APPLICATION_HOME_DIR", canonical)
        self.assertNotIn("PYINSTALLER_RESET_ENVIRONMENT", canonical)
        fake_windll.kernel32.SetDllDirectoryW.assert_called_once_with(None)

    def test_frozen_runtime_uses_private_worker_entry_and_wrapper_only_reset(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.object(
            sys,
            "frozen",
            True,
            create=True,
        ), mock.patch.object(
            sys,
            "platform",
            "linux",
        ), mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_DATA_DIR": data_dir,
                "PATH": "/usr/bin:/bin",
                "_PYI_APPLICATION_HOME_DIR": "/tmp/_MEI-parent",
                "LD_LIBRARY_PATH": "/tmp/_MEI-parent",
                "LD_LIBRARY_PATH_ORIG": "/usr/lib",
            },
            clear=True,
        ):
            runtime = durable_job_runtime.get_durable_jobs_runtime()

        self.assertIsNotNone(runtime)
        self.assertEqual(
            runtime.supervisor.worker_command_prefix,
            (sys.executable, "--durable-job-worker"),
        )
        self.assertEqual(
            runtime.supervisor.worker_environment_overlay,
            (("PYINSTALLER_RESET_ENVIRONMENT", "1"),),
        )
        canonical = runtime.supervisor.environment_profile.to_environment()
        self.assertNotIn("PYINSTALLER_RESET_ENVIRONMENT", canonical)
        self.assertNotIn("_PYI_APPLICATION_HOME_DIR", canonical)
        self.assertEqual(canonical["LD_LIBRARY_PATH"], "/usr/lib")


if __name__ == "__main__":
    unittest.main()
