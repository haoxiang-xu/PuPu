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
    def test_registry_schema_document_exists_for_curated_and_external_entries(self):
        schema_path = (
            Path(__file__).resolve().parents[3]
            / "src"
            / "SERVICEs"
            / "mcp_toolkit_registry.schema.json"
        )
        schema = json.loads(schema_path.read_text(encoding="utf-8"))

        self.assertEqual(schema["$id"], "https://pupu.local/schemas/mcp_toolkit_registry.schema.json")
        entry_schema = schema["definitions"]["entry"]
        for field in ["id", "toolkitId", "name", "description", "mcp"]:
            self.assertIn(field, entry_schema["required"])
        for property_name in [
            "secrets",
            "auth",
            "workspace",
            "metadata",
            "policySummary",
        ]:
            self.assertIn(property_name, entry_schema["properties"])

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

    def test_metadata_recipe_is_normalized_from_json(self):
        entry = mcp_registry.registry_entry("browser.playwright")
        recipe = entry["metadata"]

        self.assertEqual(recipe["type"], "http_json")
        self.assertTrue(recipe["request"]["url"].startswith("https://"))
        self.assertEqual(recipe["fields"]["stars"], "stargazers_count")
        self.assertEqual(recipe["fields"]["license"], "license.spdx_id")
        self.assertEqual(recipe["icon"]["urlPath"], "owner.avatar_url")
        self.assertEqual(recipe["iconPolicy"], "fallback")

    def test_markitdown_registry_entry_uses_official_stdio_server(self):
        entry = mcp_registry.registry_entry("workspace.markitdown")

        self.assertEqual(entry["toolkit_id"], "mcp.workspace.markitdown")
        self.assertEqual(entry["toolkit_name"], "MarkItDown")
        self.assertEqual(entry["category"], "workspace")
        self.assertEqual(entry["trust_level"], "verified")
        self.assertTrue(entry["installable"])
        self.assertEqual(entry["mcp"]["transport"], "stdio")
        self.assertEqual(entry["mcp"]["command"], "uvx")
        self.assertEqual(entry["mcp"]["args"], ["markitdown-mcp"])
        self.assertEqual(
            entry["metadata"]["request"]["url"],
            "https://api.github.com/repos/microsoft/markitdown",
        )
        self.assertEqual(entry["secrets"], [])
        self.assertIn("local trusted agents", entry["readme_markdown"])
        self.assertEqual(
            [tool["name"] for tool in entry["tools"]],
            ["convert_to_markdown"],
        )
        self.assertEqual(entry["policy_summary"]["confirmationRequiredTools"], 1)

    def test_figma_remote_registry_entry_uses_official_oauth_server(self):
        entry = mcp_registry.registry_entry("dev.figma-remote")
        oauth = mcp_registry.oauth_recipe_for_entry(entry)

        self.assertEqual(entry["toolkit_id"], "mcp.dev.figma-remote")
        self.assertEqual(entry["toolkit_name"], "Figma")
        self.assertEqual(entry["category"], "dev")
        self.assertFalse(entry["installable"])
        self.assertEqual(entry["toolkit_icon"]["type"], "file")
        self.assertEqual(entry["toolkit_icon"]["mimeType"], "image/svg+xml")
        self.assertIn('viewBox="0 0 1024 1024"', entry["toolkit_icon"]["content"])
        self.assertIn('fill="#FF3737"', entry["toolkit_icon"]["content"])
        self.assertIn('fill="#874FFF"', entry["toolkit_icon"]["content"])
        self.assertIn('fill="#24CB71"', entry["toolkit_icon"]["content"])
        self.assertIn('fill="#FF7237"', entry["toolkit_icon"]["content"])
        self.assertIn('fill="#00B6FF"', entry["toolkit_icon"]["content"])
        self.assertEqual(entry["mcp"]["transport"], "http")
        self.assertEqual(entry["mcp"]["runtime_transport"], "streamable_http")
        self.assertEqual(entry["mcp"]["url"], "https://mcp.figma.com/mcp")
        self.assertEqual(oauth["provider"], "figma")
        self.assertEqual(oauth["clientRegistration"], "dynamic")
        self.assertEqual(oauth["mcpUrl"], "https://mcp.figma.com/mcp")
        self.assertEqual(
            oauth["protectedResourceMetadataUrl"],
            "https://mcp.figma.com/.well-known/oauth-protected-resource",
        )
        self.assertEqual(
            oauth["authorizationServerMetadataUrl"],
            "https://api.figma.com/.well-known/oauth-authorization-server",
        )
        self.assertEqual(
            oauth["authorizationEndpoint"],
            "https://www.figma.com/oauth/mcp",
        )
        self.assertEqual(
            oauth["tokenEndpoint"],
            "https://api.figma.com/v1/oauth/token",
        )
        self.assertEqual(
            oauth["registrationEndpoint"],
            "https://api.figma.com/v1/oauth/mcp/register",
        )
        self.assertEqual(oauth["scopes"], ["mcp:connect"])

    def test_devops_registry_entries_are_json_driven(self):
        sentry = mcp_registry.registry_entry("devops.sentry-remote")
        sentry_oauth = mcp_registry.oauth_recipe_for_entry(sentry)
        self.assertEqual(sentry["toolkit_id"], "mcp.devops.sentry-remote")
        self.assertEqual(sentry["category"], "devops")
        self.assertEqual(sentry["toolkit_icon"]["type"], "file")
        self.assertEqual(sentry["toolkit_icon"]["mimeType"], "image/svg+xml")
        self.assertFalse(sentry["installable"])
        self.assertEqual(sentry["mcp"]["transport"], "http")
        self.assertEqual(sentry["mcp"]["runtime_transport"], "streamable_http")
        self.assertEqual(sentry["mcp"]["url"], "https://mcp.sentry.dev/mcp")
        self.assertEqual(sentry_oauth["provider"], "sentry")
        self.assertEqual(sentry_oauth["clientRegistration"], "dynamic")
        self.assertEqual(
            sentry_oauth["authorizationEndpoint"],
            "https://mcp.sentry.dev/oauth/authorize",
        )
        self.assertEqual(
            sentry_oauth["registrationEndpoint"],
            "https://mcp.sentry.dev/oauth/register",
        )

        vercel = mcp_registry.registry_entry("devops.vercel-remote")
        vercel_oauth = mcp_registry.oauth_recipe_for_entry(vercel)
        self.assertEqual(vercel["toolkit_id"], "mcp.devops.vercel-remote")
        self.assertEqual(vercel["toolkit_icon"]["type"], "file")
        self.assertEqual(vercel["mcp"]["url"], "https://mcp.vercel.com")
        self.assertEqual(vercel_oauth["provider"], "vercel")
        self.assertEqual(vercel_oauth["clientRegistration"], "dynamic")
        self.assertEqual(
            vercel_oauth["protectedResourceMetadataUrl"],
            "https://mcp.vercel.com/.well-known/oauth-protected-resource",
        )

        grafana = mcp_registry.registry_entry("devops.grafana")
        self.assertEqual(grafana["toolkit_id"], "mcp.devops.grafana")
        self.assertEqual(grafana["toolkit_icon"]["type"], "file")
        self.assertTrue(grafana["installable"])
        self.assertEqual(grafana["mcp"]["transport"], "stdio")
        self.assertEqual(grafana["mcp"]["command"], "uvx")
        self.assertEqual(grafana["mcp"]["args"], ["mcp-grafana"])
        self.assertEqual(
            [secret["key"] for secret in grafana["secrets"]],
            ["GRAFANA_URL", "GRAFANA_SERVICE_ACCOUNT_TOKEN"],
        )

        netdata = mcp_registry.registry_entry("devops.netdata-cloud")
        self.assertEqual(netdata["toolkit_id"], "mcp.devops.netdata-cloud")
        self.assertEqual(netdata["toolkit_icon"]["type"], "file")
        self.assertTrue(netdata["installable"])
        self.assertEqual(netdata["mcp"]["transport"], "http")
        self.assertEqual(netdata["mcp"]["runtime_transport"], "streamable_http")
        self.assertEqual(
            netdata["mcp"]["url"],
            "https://app.netdata.cloud/api/v1/mcp",
        )
        self.assertEqual(
            netdata["mcp"]["headers"][0]["value_from_secret"],
            "NETDATA_CLOUD_MCP_TOKEN",
        )

    def test_chrome_devtools_registry_entry_uses_official_stdio_server(self):
        entry = mcp_registry.registry_entry("browser.chrome-devtools")

        self.assertEqual(entry["toolkit_id"], "mcp.browser.chrome-devtools")
        self.assertEqual(entry["toolkit_name"], "Chrome DevTools")
        self.assertEqual(entry["category"], "browser")
        self.assertEqual(entry["trust_level"], "verified")
        self.assertEqual(entry["toolkit_icon"]["type"], "file")
        self.assertEqual(entry["toolkit_icon"]["mimeType"], "image/svg+xml")
        self.assertTrue(entry["installable"])
        self.assertEqual(entry["license"], "Apache-2.0")
        self.assertEqual(entry["mcp"]["transport"], "stdio")
        self.assertEqual(entry["mcp"]["command"], "npx")
        self.assertEqual(entry["mcp"]["args"], ["-y", "chrome-devtools-mcp@latest"])
        self.assertEqual(entry["secrets"], [])
        self.assertIn("performance trace", entry["readme_markdown"])

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

    def test_metadata_recipe_requires_https_url(self):
        payload = {
            "version": 1,
            "categories": ["all"],
            "entries": [
                {
                    "id": "sample.one",
                    "toolkitId": "mcp.sample.one",
                    "name": "One",
                    "description": "One",
                    "metadata": {
                        "type": "http_json",
                        "request": {"url": "http://example.test/repo"},
                    },
                    "mcp": {"transport": "stdio", "command": "node", "args": []},
                },
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "registry.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "metadata request.url must use https"):
                mcp_registry._load_registry(path)

    def test_oauth_registry_entries_are_recipe_driven(self):
        entries = mcp_registry.oauth_registry_entries()
        providers = {
            mcp_registry.oauth_recipe_for_entry(entry).get("provider")
            for entry in entries
        }

        self.assertEqual(
            providers,
            {"figma", "github", "notion", "sentry", "slack", "vercel"},
        )


if __name__ == "__main__":
    unittest.main()
