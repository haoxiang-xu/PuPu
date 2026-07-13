import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import mcp_registry  # noqa: E402
import mcp_toolkits  # noqa: E402
import unchain_adapter  # noqa: E402

_SKILL_TOML = {
    "toolkit": {"name": "Skilled", "description": "demo"},
    "display": {"category": "builtin", "order": 1, "hidden": False},
    "tools": [{"name": "echo", "title": "Echo", "description": "Echo."}],
    "skills": [
        {
            "name": "plan",
            "title": "Plan First",
            "description": "Draft a plan first.",
            "body": "Draft a plan using ({tools}).",
            "tools": ["echo"],
            "phase": "composer",
        },
        {"name": "bad name!", "body": "dropped"},
    ],
}


class BuiltinCatalogSkillsTests(unittest.TestCase):
    def test_catalog_v2_entries_carry_normalized_skills(self) -> None:
        with mock.patch.object(
            unchain_adapter, "_read_toolkit_toml", return_value=_SKILL_TOML
        ):
            payload = unchain_adapter.get_toolkit_catalog_v2()

        builtin_entries = [
            entry
            for entry in payload["toolkits"]
            if entry.get("source") != "mcp"
        ]
        self.assertTrue(builtin_entries)
        for entry in builtin_entries:
            self.assertEqual(
                [skill["name"] for skill in entry["skills"]], ["plan"]
            )
            self.assertEqual(entry["skills"][0]["phase"], "composer")


class McpSkillsSnapshotTests(unittest.TestCase):
    def test_normalize_entry_snapshots_curated_skills(self) -> None:
        entry = mcp_registry._normalize_entry(
            {
                "id": "entry.demo",
                "toolkitId": "mcp.demo",
                "name": "Demo",
                "description": "d",
                "installable": True,
                "mcp": {"transport": "stdio", "command": "demo-server", "args": []},
                "skills": [
                    {"name": "summarize", "body": "Summarize with the demo tools."},
                    "garbage",
                ],
            }
        )
        self.assertEqual(
            [skill["name"] for skill in entry["skills"]], ["summarize"]
        )

    def test_record_round_trip_preserves_skills(self) -> None:
        entry = mcp_registry._normalize_entry(
            {
                "id": "entry.demo",
                "toolkitId": "mcp.demo",
                "name": "Demo",
                "description": "d",
                "installable": True,
                "mcp": {"transport": "stdio", "command": "demo-server", "args": []},
                "skills": [{"name": "summarize", "body": "Summarize."}],
            }
        )
        record = mcp_toolkits._record_from_entry(
            entry,
            {"transport": "stdio", "command": "demo-server", "args": []},
            tools=[],
            now=0.0,
        )
        self.assertEqual(
            [skill["name"] for skill in record["skills"]], ["summarize"]
        )

        frontend = mcp_toolkits._record_to_frontend(record, data_dir=None)
        self.assertEqual(
            [skill["name"] for skill in frontend["skills"]], ["summarize"]
        )


if __name__ == "__main__":
    unittest.main()
