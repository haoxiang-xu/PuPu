from contextlib import redirect_stderr
import builtins
import io
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import main as sidecar_main  # noqa: E402
import memory_v2_deletion_runner  # noqa: E402
import memory_v2_runtime  # noqa: E402


class SidecarSessionGuardDiagnosticTests(unittest.TestCase):
    def setUp(self):
        sidecar_main._SESSION_GUARD_STARTUP_DIAGNOSTICS_EMITTED.clear()
        self.addCleanup(
            sidecar_main._SESSION_GUARD_STARTUP_DIAGNOSTICS_EMITTED.clear
        )

    def test_startup_diagnostic_is_allowlisted_deduplicated_and_content_free(self):
        process_identity_error = RuntimeError(
            r"C:\\Users\\private errno=5 token=secret"
        )
        process_identity_error.code = "session_guard_process_identity_unavailable"
        generic_import_error = RuntimeError("private import path token=secret")
        generic_call_error = RuntimeError("private call path token=secret")
        output = io.StringIO()

        with (
            mock.patch.dict(
                os.environ,
                {"PUPU_SESSION_GUARD_DIAGNOSTICS": "1"},
                clear=False,
            ),
            redirect_stderr(output),
        ):
            sidecar_main._emit_session_guard_startup_diagnostic(
                process_identity_error,
                phase="import",
            )
            sidecar_main._emit_session_guard_startup_diagnostic(
                process_identity_error,
                phase="import",
            )
            sidecar_main._emit_session_guard_startup_diagnostic(
                generic_import_error,
                phase="import",
            )
            sidecar_main._emit_session_guard_startup_diagnostic(
                generic_call_error,
                phase="call",
            )

        self.assertEqual(
            output.getvalue().splitlines(),
            [
                "[session-guard] migration unavailable "
                "code=session_guard_process_identity_unavailable",
                "[session-guard] migration unavailable "
                "code=session_guard_import_unavailable",
                "[session-guard] migration unavailable "
                "code=session_guard_unknown_unavailable",
            ],
        )
        self.assertNotIn("private", output.getvalue())
        self.assertNotIn("token", output.getvalue())
        self.assertNotIn("errno", output.getvalue())

    def test_startup_diagnostic_is_disabled_by_default(self):
        output = io.StringIO()
        with (
            mock.patch.dict(
                os.environ,
                {"PUPU_SESSION_GUARD_DIAGNOSTICS": "0"},
                clear=False,
            ),
            redirect_stderr(output),
        ):
            sidecar_main._emit_session_guard_startup_diagnostic(
                RuntimeError("private failure"),
                phase="import",
            )
        self.assertEqual(output.getvalue(), "")

    def test_startup_diagnostic_write_failure_is_ignored(self):
        class FailingStderr:
            @staticmethod
            def write(_value):
                raise OSError("stderr unavailable")

            @staticmethod
            def flush():
                raise OSError("stderr unavailable")

        with (
            mock.patch.object(sidecar_main.sys, "stderr", FailingStderr()),
            mock.patch.dict(
                os.environ,
                {"PUPU_SESSION_GUARD_DIAGNOSTICS": "1"},
                clear=False,
            ),
        ):
            sidecar_main._emit_session_guard_startup_diagnostic(
                RuntimeError("private failure"),
                phase="import",
            )


class _ShutdownEvent:
    def __init__(self):
        self.stopped = False

    def is_set(self):
        return self.stopped

    def set(self):
        self.stopped = True


class SidecarMemoryV2DeletionStartupTests(unittest.TestCase):
    def test_sidecar_survives_import_time_session_guard_failure(self):
        shutdown_event = _ShutdownEvent()

        class FakeRunner:
            def __init__(self, _runtime_provider, *, worker_id):
                self.worker_id = worker_id

            def start(self):
                return None

            def stop(self):
                return None

        class FakeRuntime:
            def recover_startup(self):
                return None

        class FakeServer:
            def __init__(self, _app, *, host, port):
                self.host = host
                self.port = port

            def start(self):
                shutdown_event.set()

            def stop(self):
                return None

        fake_app = types.ModuleType("app")
        fake_app.create_app = lambda: "test-app"
        fake_server_thread = types.ModuleType("server_thread")
        fake_server_thread.ThreadedFlaskServer = FakeServer
        fake_subagent_seeds = types.ModuleType("subagent_seeds")
        fake_subagent_seeds.ensure_seeds_written = lambda _path: None
        fake_recipe_seeds = types.ModuleType("recipe_seeds")
        fake_recipe_seeds.ensure_recipe_seeds_written = lambda _path: None
        import_error = RuntimeError(r"C:\\Users\\private errno=5 token=secret")
        import_error.code = "session_guard_process_identity_unavailable"
        original_import = builtins.__import__

        def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "session_execution_guard":
                raise import_error
            return original_import(name, globals, locals, fromlist, level)

        output = io.StringIO()
        with mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_HOST": "127.0.0.1",
                "UNCHAIN_PORT": "5879",
                "UNCHAIN_PARENT_PID": "",
                "PUPU_SESSION_GUARD_DIAGNOSTICS": "1",
            },
            clear=False,
        ), mock.patch.dict(
            sys.modules,
            {
                "app": fake_app,
                "server_thread": fake_server_thread,
                "subagent_seeds": fake_subagent_seeds,
                "recipe_seeds": fake_recipe_seeds,
            },
        ), mock.patch(
            "builtins.__import__",
            side_effect=guarded_import,
        ), mock.patch.object(
            sidecar_main,
            "_SESSION_GUARD_STARTUP_DIAGNOSTICS_EMITTED",
            set(),
        ), mock.patch.object(
            sidecar_main,
            "_log_outbound_tls_trust",
        ), mock.patch.object(
            sidecar_main,
            "_initialize_vault_sink_transport",
        ), mock.patch.object(
            sidecar_main.threading,
            "Event",
            return_value=shutdown_event,
        ), mock.patch.object(
            memory_v2_deletion_runner,
            "MemoryV2DeletionRunner",
            FakeRunner,
        ), mock.patch.object(
            memory_v2_runtime,
            "get_memory_v2_runtime",
            return_value=FakeRuntime(),
        ), redirect_stderr(output):
            self.assertEqual(sidecar_main.main([]), 0)

        self.assertEqual(
            output.getvalue(),
            "[session-guard] migration unavailable "
            "code=session_guard_process_identity_unavailable\n",
        )
        self.assertNotIn("Users", output.getvalue())
        self.assertNotIn("token", output.getvalue())
        self.assertNotIn("errno", output.getvalue())

    def test_sidecar_starts_and_stops_the_deletion_runner(self):
        calls = []
        shutdown_event = _ShutdownEvent()

        class FakeRunner:
            def __init__(self, _runtime_provider, *, worker_id):
                calls.append(("runner_created", worker_id))

            def start(self):
                calls.append("runner_started")

            def stop(self):
                calls.append("runner_stopped")

        class FakeRuntime:
            def recover_startup(self):
                calls.append("memory_v2_recovered")
                return None

        class FakeServer:
            def __init__(self, app, *, host, port):
                calls.append(("server_created", app, host, port))

            def start(self):
                calls.append("server_started")
                shutdown_event.set()

            def stop(self):
                calls.append("server_stopped")

        fake_app = types.ModuleType("app")
        fake_app.create_app = lambda: "test-app"
        fake_server_thread = types.ModuleType("server_thread")
        fake_server_thread.ThreadedFlaskServer = FakeServer
        fake_subagent_seeds = types.ModuleType("subagent_seeds")
        fake_subagent_seeds.ensure_seeds_written = lambda _path: None
        fake_recipe_seeds = types.ModuleType("recipe_seeds")
        fake_recipe_seeds.ensure_recipe_seeds_written = lambda _path: None
        fake_session_guard = types.ModuleType("session_execution_guard")
        fake_session_guard.session_guard_migration_receipt = (
            lambda: calls.append("session_guard_migration_initialized")
            or {
                "schema": "pupu.session-guard-migration",
                "version": 1,
                "status": "ready",
                "protocol_version": 1,
            }
        )

        with mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_HOST": "127.0.0.1",
                "UNCHAIN_PORT": "5879",
                "UNCHAIN_PARENT_PID": "",
            },
            clear=False,
        ), mock.patch.dict(
            sys.modules,
            {
                "app": fake_app,
                "server_thread": fake_server_thread,
                "subagent_seeds": fake_subagent_seeds,
                "recipe_seeds": fake_recipe_seeds,
                "session_execution_guard": fake_session_guard,
            },
        ), mock.patch.object(
            sidecar_main,
            "_log_outbound_tls_trust",
        ), mock.patch.object(
            sidecar_main,
            "_initialize_vault_sink_transport",
            side_effect=lambda: calls.append("vault_transport_initialized"),
        ), mock.patch.object(
            sidecar_main.threading,
            "Event",
            return_value=shutdown_event,
        ), mock.patch.object(
            memory_v2_deletion_runner,
            "MemoryV2DeletionRunner",
            FakeRunner,
        ), mock.patch.object(
            memory_v2_runtime,
            "get_memory_v2_runtime",
            return_value=FakeRuntime(),
        ):
            self.assertEqual(sidecar_main.main([]), 0)

        self.assertIn("runner_created", [entry[0] for entry in calls if isinstance(entry, tuple)])
        self.assertIn("runner_started", calls)
        self.assertIn("runner_stopped", calls)
        self.assertIn("vault_transport_initialized", calls)
        self.assertIn("session_guard_migration_initialized", calls)
        self.assertEqual(calls.count("memory_v2_recovered"), 1)
        server_created_index = next(
            index
            for index, entry in enumerate(calls)
            if isinstance(entry, tuple) and entry[0] == "server_created"
        )
        self.assertLess(
            calls.index("session_guard_migration_initialized"),
            server_created_index,
        )
        self.assertLess(
            calls.index("vault_transport_initialized"),
            server_created_index,
        )
        self.assertLess(calls.index("runner_started"), calls.index("server_started"))
        self.assertLess(calls.index("memory_v2_recovered"), calls.index("runner_started"))
        self.assertLess(calls.index("runner_stopped"), calls.index("server_stopped"))


if __name__ == "__main__":
    unittest.main()
