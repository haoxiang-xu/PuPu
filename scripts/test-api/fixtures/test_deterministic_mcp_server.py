from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import deterministic_mcp_server as fixture


class DeterministicMcpServerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.audit_path = Path(self.temp_dir.name) / "audit.jsonl"
        self.env = patch.dict(
            os.environ,
            {
                "PUPU_SOAK_AUDIT_PATH": str(self.audit_path),
                "PUPU_SOAK_TIME_SCALE": "0",
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        with fixture._STATE_LOCK:
            fixture._CALL_ORDINAL = 0
            fixture._TOOL_ORDINALS.clear()

    def run_in_fresh_process(self, source: str) -> str:
        result = subprocess.run(
            [sys.executable, "-c", source],
            cwd=str(Path(fixture.__file__).parent),
            env=os.environ.copy(),
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip().splitlines()[-1]

    async def test_tool_contracts_are_closed_and_gate_is_destructive(self) -> None:
        tools = {tool.name: tool for tool in await fixture.mcp.list_tools()}

        self.assertEqual(
            set(tools),
            {
                "soak_probe",
                "soak_wait",
                "soak_gate",
                "soak_checkpoint",
                "soak_fail_once",
            },
        )
        for tool in tools.values():
            self.assertIs(tool.inputSchema["additionalProperties"], False)
        self.assertEqual(
            tools["soak_probe"].inputSchema["properties"]["lane"]["enum"],
            ["A", "B", "C"],
        )
        self.assertEqual(
            tools["soak_wait"].inputSchema["properties"]["milliseconds"]["const"],
            65_000,
        )
        self.assertTrue(tools["soak_gate"].annotations.destructiveHint)

    async def test_tool_manager_rejects_extra_and_noncanonical_arguments(self) -> None:
        invalid_calls = [
            {"lane": "A", "iteration": 0, "extra": "not-allowed"},
            {"lane": "D", "iteration": 0},
            {"lane": "A", "iteration": True},
            {"lane": "A", "iteration": 0, "marker": "wrong"},
        ]
        for arguments in invalid_calls:
            with self.subTest(arguments=arguments):
                with self.assertRaises(Exception):
                    await fixture.mcp._tool_manager.call_tool("soak_probe", arguments)

    async def test_calls_are_deterministic_scaled_and_audited(self) -> None:
        probe = fixture.soak_probe("A", 0)
        waited = await fixture.soak_wait("B")
        gate = fixture.soak_gate("C")
        checkpoint = fixture.soak_checkpoint("A", "phase.one", 4)
        replay = fixture.soak_checkpoint("A", "phase.one", 4)

        with self.assertRaisesRegex(ValueError, "moved backwards"):
            fixture.soak_checkpoint("A", "phase.one", 3)
        with self.assertRaisesRegex(RuntimeError, "deterministic_fail_once"):
            fixture.soak_fail_once("B")
        recovered = fixture.soak_fail_once("B")

        self.assertEqual(probe["token"], "probe:A:0")
        self.assertEqual(waited["requested_milliseconds"], 65_000)
        self.assertEqual(waited["effective_milliseconds"], 0)
        self.assertEqual(gate["gate"], "C:durable-pause")
        self.assertIsNone(checkpoint["previous_iteration"])
        self.assertTrue(replay["replayed"])
        self.assertTrue(recovered["recovered"])

        records = [
            json.loads(line)
            for line in self.audit_path.read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual(
            [record["call_ordinal"] for record in records],
            [1, 2, 2, 3, 4, 5, 6, 7, 8],
        )
        self.assertEqual(records[1]["args"]["milliseconds"], 65_000)
        self.assertEqual(records[1]["detail"]["effective_milliseconds"], 0)
        self.assertEqual(records[1]["status"], "started")
        self.assertEqual(records[2]["status"], "ok")
        self.assertEqual(records[6]["status"], "rejected_backwards")
        self.assertEqual(records[7]["status"], "failed_once")
        self.assertEqual(records[8]["status"], "ok")
        for record in records:
            self.assertTrue(
                {"tool", "lane", "args", "call_ordinal", "tool_ordinal", "status"}
                <= record.keys()
            )

    async def test_wait_audits_started_before_cancellation(self) -> None:
        with patch.dict(os.environ, {"PUPU_SOAK_TIME_SCALE": "1"}):
            task = asyncio.create_task(fixture.soak_wait("C"))
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        records = [
            json.loads(line)
            for line in self.audit_path.read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual([record["status"] for record in records], ["started", "cancelled"])
        self.assertEqual([record["call_ordinal"] for record in records], [1, 1])
        self.assertEqual(records[0]["args"]["milliseconds"], 65_000)

    async def test_fail_once_and_checkpoint_survive_process_restart(self) -> None:
        fail_once_source = """
import deterministic_mcp_server as fixture
try:
    fixture.soak_fail_once("A")
except RuntimeError:
    print("failed_once")
else:
    print("ok")
"""
        self.assertEqual(
            self.run_in_fresh_process(fail_once_source),
            "failed_once",
        )
        self.assertEqual(self.run_in_fresh_process(fail_once_source), "ok")

        checkpoint_source = """
import json
import deterministic_mcp_server as fixture
print(json.dumps(fixture.soak_checkpoint("B", "phase.restart", 4)))
"""
        first_checkpoint = json.loads(
            self.run_in_fresh_process(checkpoint_source)
        )
        replayed_checkpoint = json.loads(
            self.run_in_fresh_process(checkpoint_source)
        )
        self.assertIsNone(first_checkpoint["previous_iteration"])
        self.assertEqual(replayed_checkpoint["previous_iteration"], 4)
        self.assertTrue(replayed_checkpoint["replayed"])

        records = [
            json.loads(line)
            for line in self.audit_path.read_text(encoding="utf-8").splitlines()
        ]
        fail_once_records = [
            record for record in records if record["tool"] == "soak_fail_once"
        ]
        checkpoint_records = [
            record for record in records if record["tool"] == "soak_checkpoint"
        ]
        self.assertEqual(
            [record["status"] for record in fail_once_records],
            ["failed_once", "ok"],
        )
        self.assertEqual(len({record["pid"] for record in fail_once_records}), 2)
        self.assertEqual(
            [record["detail"]["previous_iteration"] for record in checkpoint_records],
            [None, 4],
        )
        self.assertEqual(len({record["pid"] for record in checkpoint_records}), 2)


if __name__ == "__main__":
    unittest.main()
