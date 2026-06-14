import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from mcp_permission_audit import audit_mcp_registry_entry, diff_recipe_material  # noqa: E402


class McpPermissionAuditTests(unittest.TestCase):
    def test_audit_scores_generic_stdio_secret_workspace_recipe(self):
        entry = {
            "entry_id": "external.high-risk",
            "toolkit_id": "mcp.external.high-risk",
            "mcp": {
                "transport": "stdio",
                "command": "node",
                "args": ["server.js", "${WORKSPACE}"],
            },
            "secrets": [{"key": "EXTERNAL_API_KEY"}],
            "auth": {
                "oauth": {
                    "provider": "external",
                    "providerLabel": "External",
                    "scopes": ["files:write", "users:read"],
                }
            },
            "workspace": {
                "required": True,
                "placeholder": "${WORKSPACE}",
                "binding": "agent_workspace_root",
            },
            "policy_summary": {
                "reviewed": False,
                "defaultEnabledTools": 1,
                "confirmationRequiredTools": 2,
            },
            "license": "",
            "source_repo": "",
            "docs_url": "",
        }

        review = audit_mcp_registry_entry(entry)

        self.assertEqual(review["riskLevel"], "critical")
        self.assertTrue(review["requiresAcknowledgement"])
        self.assertIn("stdio_transport", review["riskFlags"])
        self.assertIn("workspace_access", review["riskFlags"])
        self.assertIn("secret_inputs", review["riskFlags"])
        self.assertEqual(review["recipeHash"], review["recipeHash"][:64])
        groups = {group["kind"]: group for group in review["permissionGroups"]}
        self.assertEqual(groups["transport"]["summary"], "stdio")
        self.assertIn("EXTERNAL_API_KEY", groups["secrets"]["items"])
        self.assertIn("files:write", groups["oauth"]["items"])

    def test_audit_keeps_low_risk_http_readonly_recipe_ack_free(self):
        review = audit_mcp_registry_entry(
            {
                "entry_id": "external.low",
                "toolkit_id": "mcp.external.low",
                "mcp": {
                    "transport": "http",
                    "runtime_transport": "streamable_http",
                    "url": "https://example.test/mcp",
                    "headers": [],
                },
                "policy_summary": {"reviewed": True, "confirmationRequiredTools": 0},
                "license": "MIT",
                "source_repo": "https://example.test/repo",
                "docs_url": "https://example.test/docs",
            }
        )

        self.assertEqual(review["riskLevel"], "low")
        self.assertFalse(review["requiresAcknowledgement"])
        self.assertIn("remote_http_transport", review["riskFlags"])

    def test_recipe_diff_reports_changed_nested_paths_without_provider_logic(self):
        previous = {
            "mcp": {"transport": "http", "url": "https://example.test/old"},
            "secrets": [],
        }
        current = {
            "mcp": {"transport": "http", "url": "https://example.test/new"},
            "secrets": [{"key": "EXTERNAL_TOKEN"}],
        }

        diff = diff_recipe_material(previous, current)

        paths = {item["path"] for item in diff}
        self.assertIn("mcp.url", paths)
        self.assertIn("secrets", paths)
        self.assertEqual(next(item for item in diff if item["path"] == "mcp.url")["kind"], "changed")


if __name__ == "__main__":
    unittest.main()
