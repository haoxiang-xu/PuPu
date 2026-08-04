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


class _ShutdownEvent:
    def __init__(self):
        self.stopped = False

    def is_set(self):
        return self.stopped

    def set(self):
        self.stopped = True


class SidecarMemoryV2DeletionStartupTests(unittest.TestCase):
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
        self.assertEqual(calls.count("memory_v2_recovered"), 1)
        server_created_index = next(
            index
            for index, entry in enumerate(calls)
            if isinstance(entry, tuple) and entry[0] == "server_created"
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
