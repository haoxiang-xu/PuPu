import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import mcp_managed_runtime  # noqa: E402
from mcp_managed_runtime import (  # noqa: E402
    McpManagedRuntimeError,
    resolve_managed_stdio_runtime,
)


class ManagedMcpRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)
        self.runtime_root = self.data_dir / "mcp_runtime"

    def tearDown(self):
        self.tmpdir.cleanup()

    def _write_manifest_runtime(self, kind, command_name):
        bin_dir = self.runtime_root / "runtimes" / kind / "bin"
        bin_dir.mkdir(parents=True, exist_ok=True)
        command_path = bin_dir / command_name
        command_path.write_text("#!/bin/sh\n", encoding="utf-8")
        command_path.chmod(0o755)
        manifest = {
            kind: {
                "kind": kind,
                "version": "test-version",
                "command": str(command_path),
                "bin_dir": str(bin_dir),
                "source": "test",
            }
        }
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        (self.runtime_root / "manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )
        return command_path

    def test_reuses_manifest_node_runtime_for_npx_on_macos(self):
        command_path = self._write_manifest_runtime("node", "npx")

        with mock.patch.object(mcp_managed_runtime.sys, "platform", "darwin"):
            result = resolve_managed_stdio_runtime(
                "npx",
                {},
                data_dir=self.data_dir,
            )

        self.assertEqual(result["command"], str(command_path))
        self.assertEqual(result["managed_runtime"]["kind"], "node")
        self.assertEqual(
            result["managed_env"]["NPM_CONFIG_CACHE"],
            str(self.runtime_root / "cache" / "npm"),
        )
        self.assertTrue(result["managed_env"]["PATH"].startswith(str(command_path.parent)))

    def test_reuses_manifest_uv_runtime_for_uvx_on_macos(self):
        command_path = self._write_manifest_runtime("uv", "uvx")

        with mock.patch.object(mcp_managed_runtime.sys, "platform", "darwin"):
            result = resolve_managed_stdio_runtime(
                "uvx",
                {},
                data_dir=self.data_dir,
            )

        self.assertEqual(result["command"], str(command_path))
        self.assertEqual(result["managed_runtime"]["kind"], "uv")
        self.assertEqual(
            result["managed_env"]["UV_CACHE_DIR"],
            str(self.runtime_root / "cache" / "uv"),
        )
        self.assertEqual(
            result["managed_env"]["UV_NO_MODIFY_PATH"],
            "1",
        )

    def test_non_macos_keeps_system_command(self):
        with mock.patch.object(mcp_managed_runtime.sys, "platform", "linux"):
            result = resolve_managed_stdio_runtime(
                "npx",
                {},
                data_dir=self.data_dir,
            )

        self.assertEqual(result["command"], "npx")
        self.assertEqual(result["managed_env"], {})
        self.assertEqual(result["managed_runtime"], {})

    def test_node_checksum_mismatch_raises_stable_error(self):
        def fake_download(url, path):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"not-the-expected-archive")
            return url

        with (
            mock.patch.object(mcp_managed_runtime.sys, "platform", "darwin"),
            mock.patch.object(mcp_managed_runtime.platform, "machine", return_value="arm64"),
            mock.patch.object(
                mcp_managed_runtime,
                "_read_url_text",
                side_effect=[
                    json.dumps(
                        [
                            {
                                "version": "v24.0.0",
                                "lts": "Krypton",
                                "files": ["osx-arm64-tar"],
                            }
                        ]
                    ),
                    "0" * 64 + "  node-v24.0.0-darwin-arm64.tar.gz\n",
                ],
            ),
            mock.patch.object(mcp_managed_runtime, "_download_file", side_effect=fake_download),
        ):
            with self.assertRaises(McpManagedRuntimeError) as ctx:
                resolve_managed_stdio_runtime(
                    "npx",
                    {},
                    data_dir=self.data_dir,
                )

        self.assertEqual(ctx.exception.code, "mcp_runtime_checksum_failed")


if __name__ == "__main__":
    unittest.main()
