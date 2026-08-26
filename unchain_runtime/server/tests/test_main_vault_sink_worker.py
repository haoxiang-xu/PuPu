import builtins
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import durable_job_runtime  # noqa: E402
import vault_sink_worker  # noqa: E402


def _load_sidecar_main():
    spec = importlib.util.spec_from_file_location(
        "pupu_sidecar_main_for_vault_sink",
        SERVER_ROOT / "main.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load PuPu sidecar main module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sidecar_main = _load_sidecar_main()


class VaultSinkWorkerEntryTests(unittest.TestCase):
    def test_non_worker_arguments_are_not_claimed(self) -> None:
        self.assertIsNone(sidecar_main._dispatch_vault_sink_worker([]))
        self.assertIsNone(
            sidecar_main._dispatch_vault_sink_worker(["--ordinary-server"])
        )

    def test_private_worker_rejects_extra_arguments(self) -> None:
        with mock.patch.object(vault_sink_worker, "main") as worker_main:
            self.assertEqual(
                sidecar_main._dispatch_vault_sink_worker(
                    ["--vault-sink-worker", "unexpected"]
                ),
                2,
            )
        worker_main.assert_not_called()

    def test_private_worker_restores_environment_and_skips_flask(self) -> None:
        calls = []
        original_import = builtins.__import__

        def guarded_import(name, *args, **kwargs):
            if name in {"app", "server_thread"}:
                raise AssertionError(f"worker mode imported server module {name}")
            return original_import(name, *args, **kwargs)

        with mock.patch.object(
            durable_job_runtime,
            "restore_frozen_job_environment",
            side_effect=lambda: calls.append("restore"),
        ), mock.patch.object(
            vault_sink_worker,
            "main",
            side_effect=lambda: calls.append("worker") or 23,
        ), mock.patch(
            "builtins.__import__",
            side_effect=guarded_import,
        ):
            exit_code = sidecar_main.main(["--vault-sink-worker"])

        self.assertEqual(exit_code, 23)
        self.assertEqual(calls, ["restore", "worker"])


if __name__ == "__main__":
    unittest.main()
