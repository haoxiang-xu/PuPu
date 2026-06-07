import json
import sys
import tempfile
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import mcp_registry  # noqa: E402


class McpRegistryTests(unittest.TestCase):
    def test_default_registry_loads_curated_entries_from_json(self):
        entry = mcp_registry.registry_entry("dev.github-remote")

        self.assertEqual(entry["toolkit_id"], "mcp.dev.github-remote")
        self.assertEqual(entry["toolkit_name"], "GitHub")
        self.assertEqual(entry["mcp"]["runtime_transport"], "streamable_http")
        self.assertEqual(
            entry["mcp"]["headers"][0]["value_from_secret"],
            "GITHUB_MCP_PAT",
        )
        self.assertEqual(
            mcp_registry.oauth_recipe_for_entry(entry)["clientRegistration"],
            "user_credentials",
        )

    def test_workspace_metadata_is_normalized(self):
        entry = mcp_registry.registry_entry("workspace.filesystem")

        self.assertTrue(entry["requires_workspace"])
        self.assertEqual(entry["workspace_binding"], "agent_workspace_root")
        self.assertEqual(entry["workspace_placeholder"], "${WORKSPACE}")

    def test_duplicate_entry_ids_fail_fast(self):
        payload = {
            "version": 1,
            "categories": ["all"],
            "entries": [
                {
                    "id": "sample.one",
                    "toolkitId": "mcp.sample.one",
                    "name": "One",
                    "description": "One",
                    "mcp": {"transport": "stdio", "command": "node", "args": []},
                },
                {
                    "id": "sample.one",
                    "toolkitId": "mcp.sample.two",
                    "name": "Two",
                    "description": "Two",
                    "mcp": {"transport": "stdio", "command": "node", "args": []},
                },
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "registry.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "Duplicate MCP registry entry id"):
                mcp_registry._load_registry(path)

    def test_oauth_registry_entries_are_recipe_driven(self):
        entries = mcp_registry.oauth_registry_entries()
        providers = {
            mcp_registry.oauth_recipe_for_entry(entry).get("provider")
            for entry in entries
        }

        self.assertEqual(providers, {"github", "notion", "slack"})


if __name__ == "__main__":
    unittest.main()
