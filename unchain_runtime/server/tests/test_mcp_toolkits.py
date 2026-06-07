import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402
import unchain_adapter  # noqa: E402
from mcp_toolkits import (  # noqa: E402
    McpToolkitError,
    build_mcp_runtime_toolkit,
    check_mcp_toolkit_health,
    configure_mcp_toolkit,
    delete_mcp_toolkit,
    get_installed_mcp_toolkit,
    install_mcp_toolkit,
    list_installed_mcp_toolkits,
    reload_mcp_toolkits,
)
from mcp_secrets import delete_mcp_secret_values, get_mcp_secret_value  # noqa: E402
from mcp_oauth import (  # noqa: E402
    get_mcp_oauth_status,
    save_mcp_oauth_token,
)
from mcp_external_registries import (  # noqa: E402
    approve_mcp_store_entry,
    delete_mcp_store_registry,
    import_mcp_store_registry,
)


class FakeMCPToolkit:
    instances = []
    next_tools = {
        "memory_search": {
            "description": "Search memory",
            "requires_confirmation": False,
        },
        "memory_write": {
            "description": "Write memory",
            "requires_confirmation": True,
        },
    }
    fail_connect = False

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.tools = {}
        self.connected = False
        self.disconnected = False
        FakeMCPToolkit.instances.append(self)

    def connect(self):
        if FakeMCPToolkit.fail_connect:
            raise RuntimeError("cannot connect")
        self.connected = True
        self.tools = {
            name: type(
                "FakeTool",
                (),
                {
                    "name": name,
                    "description": meta["description"],
                    "requires_confirmation": meta["requires_confirmation"],
                    "parameters": [],
                },
            )()
            for name, meta in FakeMCPToolkit.next_tools.items()
        }
        return self

    def disconnect(self):
        self.disconnected = True


class McpToolkitServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)
        FakeMCPToolkit.instances = []
        FakeMCPToolkit.fail_connect = False
        FakeMCPToolkit.next_tools = {
            "memory_search": {
                "description": "Search memory",
                "requires_confirmation": False,
            },
            "memory_write": {
                "description": "Write memory",
                "requires_confirmation": True,
            },
        }

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_install_memory_validates_and_persists_discovered_tools(self):
        result = install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )

        self.assertEqual(result["toolkit"]["toolkitId"], "mcp.memory.memory")
        self.assertEqual(result["toolkit"]["status"], "available")
        self.assertEqual(result["toolkit"]["tools"][0]["name"], "memory_search")
        self.assertTrue(FakeMCPToolkit.instances[0].connected)
        self.assertTrue(FakeMCPToolkit.instances[0].disconnected)

        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        self.assertEqual(persisted["toolkits"][0]["toolkit_id"], "mcp.memory.memory")
        self.assertEqual(persisted["toolkits"][0]["last_checked_at"], 1000.0)

    def test_install_rejects_unsupported_entries(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "missing.entry",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "unsupported_mcp_entry")
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_install_rejects_external_registry_entries_as_untrusted(self):
        import_mcp_store_registry(
            {
                "registry": {
                    "version": 1,
                    "name": "External",
                    "entries": [
                        {
                            "id": "external.untrusted",
                            "toolkitId": "mcp.external.untrusted",
                            "name": "External Untrusted",
                            "description": "Review-only external entry",
                            "category": "dev",
                            "installable": True,
                            "mcp": {
                                "transport": "stdio",
                                "command": "node",
                                "args": ["server.js"],
                            },
                        }
                    ],
                }
            },
            data_dir=self.data_dir,
        )

        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "external.untrusted",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_registry_entry_untrusted")
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_approved_external_registry_entry_installs_and_persists_snapshot(self):
        imported = import_mcp_store_registry(
            {
                "registry": {
                    "version": 1,
                    "name": "External",
                    "entries": [
                        {
                            "id": "external.approved",
                            "toolkitId": "mcp.external.approved",
                            "name": "External Approved",
                            "description": "Approved external entry",
                            "category": "dev",
                            "installable": True,
                            "license": "MIT",
                            "sourceRepo": "https://example.test/repo",
                            "docsUrl": "https://example.test/docs",
                            "mcp": {
                                "transport": "stdio",
                                "command": "node",
                                "args": ["server.js"],
                            },
                            "tools": [{"name": "external_tool"}],
                            "policySummary": {"reviewed": True},
                        }
                    ],
                }
            },
            data_dir=self.data_dir,
        )
        registry_id = imported["registry"]["registryId"]
        approve_mcp_store_entry(
            "external.approved",
            registry_id=registry_id,
            data_dir=self.data_dir,
            acknowledged_risk=True,
        )

        result = install_mcp_toolkit(
            "external.approved",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )

        self.assertEqual(result["toolkit"]["toolkitId"], "mcp.external.approved")
        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["command"], "node")
        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        record = persisted["toolkits"][0]
        self.assertEqual(record["external_entry_snapshot"]["entry_id"], "external.approved")
        self.assertEqual(record["external_entry_snapshot"]["trust_level"], "external_approved")

        delete_mcp_store_registry(registry_id, data_dir=self.data_dir)
        health = check_mcp_toolkit_health(
            "mcp.external.approved",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 2000.0,
        )

        self.assertEqual(health["toolkit"]["status"], "available")
        self.assertEqual(health["toolkit"]["lastCheckedAt"], 2000.0)

    def test_filesystem_requires_workspace_and_substitutes_placeholder(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "workspace.filesystem",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )
        self.assertEqual(ctx.exception.code, "mcp_workspace_required")

        install_mcp_toolkit(
            "workspace.filesystem",
            workspace_root="/Users/red/project",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertIn("/Users/red/project", FakeMCPToolkit.instances[-1].kwargs["args"])
        installed = get_installed_mcp_toolkit(
            "mcp.workspace.filesystem",
            data_dir=self.data_dir,
        )
        self.assertEqual(installed["workspace_root"], "/Users/red/project")

    def test_failed_install_does_not_persist(self):
        FakeMCPToolkit.fail_connect = True

        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "memory.memory",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_install_failed")
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_secret_stdio_entry_requires_all_secret_values(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "productivity.slack",
                secrets={"SLACK_BOT_TOKEN": "xoxb-test"},
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_secret_required")
        self.assertIn("SLACK_TEAM_ID", str(ctx.exception))
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_secret_stdio_entry_injects_env_and_persists_secret_refs_only(self):
        install_mcp_toolkit(
            "productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-test",
                "SLACK_TEAM_ID": "T012345",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1234.0,
        )

        env = FakeMCPToolkit.instances[-1].kwargs["env"]
        self.assertEqual(env["SLACK_BOT_TOKEN"], "xoxb-test")
        self.assertEqual(env["SLACK_TEAM_ID"], "T012345")

        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        record = persisted["toolkits"][0]
        self.assertEqual(record["toolkit_id"], "mcp.productivity.slack")
        self.assertEqual(record["secret_keys"], ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"])
        self.assertNotIn("xoxb-test", json.dumps(record))
        self.assertEqual(
            get_mcp_secret_value(
                "mcp.productivity.slack",
                "SLACK_BOT_TOKEN",
                data_dir=self.data_dir,
            ),
            "xoxb-test",
        )

    def test_http_entry_uses_streamable_http_and_secret_header(self):
        install_mcp_toolkit(
            "dev.github-remote",
            secrets={"GITHUB_MCP_PAT": "ghp-test"},
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1500.0,
        )

        kwargs = FakeMCPToolkit.instances[-1].kwargs
        self.assertEqual(kwargs["transport"], "streamable_http")
        self.assertEqual(kwargs["url"], "https://api.githubcopilot.com/mcp/")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer ghp-test")

        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        record = persisted["toolkits"][0]
        self.assertEqual(record["transport"], "streamable_http")
        self.assertEqual(record["url"], "https://api.githubcopilot.com/mcp/")
        self.assertEqual(record["secret_keys"], ["GITHUB_MCP_PAT"])
        self.assertNotIn("ghp-test", json.dumps(record))

    def test_github_oauth_token_takes_precedence_over_pat_secret(self):
        save_mcp_oauth_token(
            "mcp.dev.github-remote",
            {
                "entry_id": "dev.github-remote",
                "access_token": "github-oauth-token",
                "refresh_token": "github-refresh-token",
                "expires_at": 9999999999.0,
                "token_endpoint": "https://github.com/login/oauth/access_token",
                "client_id": "github-client-id",
            },
            data_dir=self.data_dir,
        )

        result = install_mcp_toolkit(
            "dev.github-remote",
            secrets={"GITHUB_MCP_PAT": "ghp-test"},
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1550.0,
        )

        kwargs = FakeMCPToolkit.instances[-1].kwargs
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer github-oauth-token")
        self.assertEqual(result["toolkit"]["authType"], "oauth")
        self.assertEqual(result["toolkit"]["authProvider"], "github")

    def test_slack_remote_requires_oauth_and_preserves_stdio_slack_entry(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "productivity.slack-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_required")

        save_mcp_oauth_token(
            "mcp.productivity.slack-remote",
            {
                "entry_id": "productivity.slack-remote",
                "access_token": "slack-oauth-token",
                "refresh_token": "slack-refresh-token",
                "expires_at": 9999999999.0,
                "token_endpoint": "https://slack.com/api/oauth.v2.user.access",
                "client_id": "slack-client-id",
            },
            data_dir=self.data_dir,
        )
        result = install_mcp_toolkit(
            "productivity.slack-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1600.0,
        )

        self.assertEqual(result["toolkit"]["toolkitId"], "mcp.productivity.slack-remote")
        self.assertEqual(result["toolkit"]["authProvider"], "slack")
        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["url"], "https://mcp.slack.com/mcp")

        install_mcp_toolkit(
            "productivity.slack",
            secrets={"SLACK_BOT_TOKEN": "xoxb-test", "SLACK_TEAM_ID": "T012345"},
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        installed_ids = {
            tk["toolkitId"]
            for tk in list_installed_mcp_toolkits(data_dir=self.data_dir)
        }
        self.assertEqual(
            installed_ids,
            {"mcp.productivity.slack-remote", "mcp.productivity.slack"},
        )

    def test_oauth_http_entry_requires_oauth_flow(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "productivity.notion-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_required")
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_oauth_http_entry_uses_stored_oauth_bearer_token(self):
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "notion-access-token",
                "refresh_token": "notion-refresh-token",
                "expires_at": 9999999999.0,
                "token_endpoint": "https://auth.notion.test/token",
                "client_id": "notion-client-id",
            },
            data_dir=self.data_dir,
        )

        result = install_mcp_toolkit(
            "productivity.notion-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1800.0,
        )

        kwargs = FakeMCPToolkit.instances[-1].kwargs
        self.assertEqual(kwargs["transport"], "streamable_http")
        self.assertEqual(kwargs["url"], "https://mcp.notion.com/mcp")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer notion-access-token")
        self.assertEqual(result["toolkit"]["authType"], "oauth")
        self.assertEqual(result["toolkit"]["authProvider"], "notion")
        self.assertEqual(result["toolkit"]["authStatus"], "connected")

    def test_custom_stdio_recipe_installs_after_validation(self):
        result = install_mcp_toolkit(
            "custom",
            custom_recipe={
                "toolkit_id": "mcp.custom.local-test",
                "toolkit_name": "Local Test",
                "mcp": {"transport": "stdio", "command": "echo", "args": ["ok"]},
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1700.0,
        )

        self.assertEqual(result["toolkit"]["toolkitId"], "mcp.custom.local-test")
        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["command"], "echo")
        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["args"], ["ok"])

        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        record = persisted["toolkits"][0]
        self.assertEqual(record["entry_id"], "custom")
        self.assertEqual(record["custom_recipe"]["toolkit_id"], "mcp.custom.local-test")

    def test_custom_stdio_recipe_with_secret_refs_injects_env_and_persists_refs_only(self):
        install_mcp_toolkit(
            "custom",
            custom_recipe={
                "toolkit_id": "mcp.custom.secret-test",
                "toolkit_name": "Secret Test",
                "secrets": [{"key": "LOCAL_TOKEN", "label": "LOCAL_TOKEN"}],
                "mcp": {"transport": "stdio", "command": "echo", "args": ["ok"]},
            },
            secrets={"LOCAL_TOKEN": "secret-value"},
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["env"]["LOCAL_TOKEN"], "secret-value")

        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        record = persisted["toolkits"][0]
        self.assertEqual(record["secret_keys"], ["LOCAL_TOKEN"])
        self.assertEqual(record["custom_recipe"]["secrets"], [{"key": "LOCAL_TOKEN", "label": "LOCAL_TOKEN"}])
        self.assertNotIn("secret-value", json.dumps(record))
        self.assertEqual(
            get_mcp_secret_value(
                "mcp.custom.secret-test",
                "LOCAL_TOKEN",
                data_dir=self.data_dir,
            ),
            "secret-value",
        )

    def test_custom_stdio_recipe_requires_declared_secret_values(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "custom",
                custom_recipe={
                    "toolkit_id": "mcp.custom.secret-test",
                    "toolkit_name": "Secret Test",
                    "secrets": [{"key": "LOCAL_TOKEN", "label": "LOCAL_TOKEN"}],
                    "mcp": {"transport": "stdio", "command": "echo", "args": ["ok"]},
                },
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_secret_required")
        self.assertIn("LOCAL_TOKEN", str(ctx.exception))
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_custom_http_recipe_installs_as_streamable_http(self):
        result = install_mcp_toolkit(
            "custom",
            custom_recipe={
                "toolkit_id": "mcp.custom.remote-test",
                "toolkit_name": "Remote Test",
                "mcp": {"transport": "http", "url": "https://example.test/mcp"},
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertEqual(result["toolkit"]["toolkitId"], "mcp.custom.remote-test")
        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["transport"], "streamable_http")
        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["url"], "https://example.test/mcp")

    def test_custom_recipe_rejects_invalid_shape(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "custom",
                custom_recipe={
                    "toolkit_id": "mcp.bad.local-test",
                    "toolkit_name": "Local Test",
                    "mcp": {"transport": "stdio", "command": "echo", "args": []},
                },
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "invalid_custom_mcp_recipe")
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_reload_updates_cached_tools_and_errors(self):
        install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )
        FakeMCPToolkit.next_tools = {
            "memory_read": {
                "description": "Read graph",
                "requires_confirmation": False,
            },
        }

        result = reload_mcp_toolkits(
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 2000.0,
        )

        self.assertEqual(result["toolkits"][0]["tools"][0]["name"], "memory_read")
        self.assertEqual(result["toolkits"][0]["lastCheckedAt"], 2000.0)
        self.assertEqual(result["toolkits"][0]["lastError"], "")

    def test_reload_secret_entry_uses_stored_secret_values(self):
        install_mcp_toolkit(
            "productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-test",
                "SLACK_TEAM_ID": "T012345",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        FakeMCPToolkit.instances = []

        result = reload_mcp_toolkits(
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 3000.0,
        )

        self.assertEqual(result["toolkits"][0]["status"], "available")
        env = FakeMCPToolkit.instances[-1].kwargs["env"]
        self.assertEqual(env["SLACK_BOT_TOKEN"], "xoxb-test")
        self.assertEqual(env["SLACK_TEAM_ID"], "T012345")

    def test_reload_secret_entry_marks_error_when_secret_is_missing(self):
        install_mcp_toolkit(
            "productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-test",
                "SLACK_TEAM_ID": "T012345",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        delete_mcp_secret_values("mcp.productivity.slack", data_dir=self.data_dir)

        result = reload_mcp_toolkits(
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 4000.0,
        )

        self.assertEqual(result["toolkits"][0]["status"], "error")
        self.assertIn("SLACK_BOT_TOKEN", result["toolkits"][0]["lastError"])
        self.assertEqual(result["toolkits"][0]["lastCheckedAt"], 4000.0)

    def test_configure_secret_entry_updates_secrets_after_successful_discovery(self):
        install_mcp_toolkit(
            "productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-old",
                "SLACK_TEAM_ID": "TOLD",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )
        FakeMCPToolkit.instances = []
        FakeMCPToolkit.next_tools = {
            "slack_list_channels": {
                "description": "List channels",
                "requires_confirmation": False,
            },
        }

        result = configure_mcp_toolkit(
            "mcp.productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-new",
                "SLACK_TEAM_ID": "TNEW",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 5000.0,
        )

        self.assertEqual(result["toolkit"]["status"], "available")
        self.assertEqual(result["toolkit"]["tools"][0]["name"], "slack_list_channels")
        self.assertEqual(result["toolkit"]["lastCheckedAt"], 5000.0)
        self.assertEqual(
            result["toolkit"]["secretStatus"],
            [
                {"key": "SLACK_BOT_TOKEN", "configured": True},
                {"key": "SLACK_TEAM_ID", "configured": True},
            ],
        )
        self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["env"]["SLACK_BOT_TOKEN"], "xoxb-new")
        self.assertEqual(
            get_mcp_secret_value(
                "mcp.productivity.slack",
                "SLACK_BOT_TOKEN",
                data_dir=self.data_dir,
            ),
            "xoxb-new",
        )

    def test_configure_failure_does_not_overwrite_existing_secret_or_record(self):
        install_mcp_toolkit(
            "productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-old",
                "SLACK_TEAM_ID": "TOLD",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )
        FakeMCPToolkit.fail_connect = True

        with self.assertRaises(McpToolkitError) as ctx:
            configure_mcp_toolkit(
                "mcp.productivity.slack",
                secrets={
                    "SLACK_BOT_TOKEN": "xoxb-new",
                    "SLACK_TEAM_ID": "TNEW",
                },
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
                now_fn=lambda: 6000.0,
            )

        self.assertEqual(ctx.exception.code, "mcp_configure_failed")
        installed = get_installed_mcp_toolkit(
            "mcp.productivity.slack",
            data_dir=self.data_dir,
        )
        self.assertEqual(installed["lastCheckedAt"], 1000.0)
        self.assertEqual(
            get_mcp_secret_value(
                "mcp.productivity.slack",
                "SLACK_BOT_TOKEN",
                data_dir=self.data_dir,
            ),
            "xoxb-old",
        )

    def test_configure_filesystem_updates_workspace_after_successful_discovery(self):
        install_mcp_toolkit(
            "workspace.filesystem",
            workspace_root="/tmp/old",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )
        FakeMCPToolkit.instances = []

        result = configure_mcp_toolkit(
            "mcp.workspace.filesystem",
            workspace_root="/tmp/new",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 7000.0,
        )

        self.assertEqual(result["toolkit"]["workspaceRoot"], "/tmp/new")
        self.assertEqual(result["toolkit"]["lastCheckedAt"], 7000.0)
        self.assertIn("/tmp/new", FakeMCPToolkit.instances[-1].kwargs["args"])

    def test_reload_workspace_root_only_updates_workspace_bound_entries(self):
        install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        result = reload_mcp_toolkits(
            workspace_root="/tmp/project",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertEqual(result["toolkits"][0]["workspace_root"], "")
        self.assertNotIn("/tmp/project", FakeMCPToolkit.instances[-1].kwargs["args"])

    def test_delete_removes_installed_toolkit(self):
        install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        result = delete_mcp_toolkit("mcp.memory.memory", data_dir=self.data_dir)

        self.assertTrue(result["ok"])
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_delete_removes_installed_toolkit_secrets(self):
        install_mcp_toolkit(
            "productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-test",
                "SLACK_TEAM_ID": "T012345",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        delete_mcp_toolkit("mcp.productivity.slack", data_dir=self.data_dir)

        self.assertEqual(
            get_mcp_secret_value(
                "mcp.productivity.slack",
                "SLACK_BOT_TOKEN",
                data_dir=self.data_dir,
            ),
            "",
        )

    def test_delete_removes_installed_toolkit_oauth_token(self):
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "notion-access-token",
                "expires_at": 9999999999.0,
            },
            data_dir=self.data_dir,
        )
        install_mcp_toolkit(
            "productivity.notion-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        delete_mcp_toolkit("mcp.productivity.notion-remote", data_dir=self.data_dir)

        self.assertEqual(
            get_mcp_oauth_status(
                "productivity.notion-remote",
                data_dir=self.data_dir,
            )["authStatus"],
            "missing",
        )

    def test_build_runtime_toolkit_connects_from_persisted_config(self):
        install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertTrue(toolkit.connected)
        self.assertEqual(toolkit.kwargs["command"], "npx")

    def test_build_runtime_toolkit_resolves_stdio_secret_env(self):
        install_mcp_toolkit(
            "productivity.slack",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-test",
                "SLACK_TEAM_ID": "T012345",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.productivity.slack",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertTrue(toolkit.connected)
        self.assertEqual(toolkit.kwargs["env"]["SLACK_BOT_TOKEN"], "xoxb-test")
        self.assertEqual(toolkit.kwargs["env"]["SLACK_TEAM_ID"], "T012345")

    def test_build_runtime_toolkit_resolves_http_secret_headers(self):
        install_mcp_toolkit(
            "dev.github-remote",
            secrets={"GITHUB_MCP_PAT": "ghp-test"},
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.dev.github-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertTrue(toolkit.connected)
        self.assertEqual(toolkit.kwargs["transport"], "streamable_http")
        self.assertEqual(
            toolkit.kwargs["headers"]["Authorization"],
            "Bearer ghp-test",
        )

    def test_build_runtime_toolkit_resolves_github_oauth_before_pat_header(self):
        save_mcp_oauth_token(
            "mcp.dev.github-remote",
            {
                "entry_id": "dev.github-remote",
                "access_token": "github-oauth-token",
                "expires_at": 9999999999.0,
            },
            data_dir=self.data_dir,
        )
        install_mcp_toolkit(
            "dev.github-remote",
            secrets={"GITHUB_MCP_PAT": "ghp-test"},
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.dev.github-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertEqual(
            toolkit.kwargs["headers"]["Authorization"],
            "Bearer github-oauth-token",
        )

    def test_build_runtime_toolkit_resolves_oauth_http_header(self):
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "notion-access-token",
                "expires_at": 9999999999.0,
            },
            data_dir=self.data_dir,
        )
        install_mcp_toolkit(
            "productivity.notion-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.productivity.notion-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertTrue(toolkit.connected)
        self.assertEqual(toolkit.kwargs["transport"], "streamable_http")
        self.assertEqual(
            toolkit.kwargs["headers"]["Authorization"],
            "Bearer notion-access-token",
        )


class McpToolkitRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = miso_app.create_app().test_client()

    def test_mcp_routes_proxy_adapter_functions(self):
        expected = {"toolkits": [{"toolkitId": "mcp.memory.memory"}], "count": 1}
        with mock.patch.object(
            miso_routes,
            "list_installed_mcp_toolkits",
            return_value=expected["toolkits"],
        ):
            response = self.client.get("/mcp/toolkits")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)

    def test_install_route_returns_stable_error_payload(self):
        with mock.patch.object(
            miso_routes,
            "install_mcp_toolkit",
            side_effect=McpToolkitError("mcp_workspace_required", "Workspace required", 400),
        ):
            response = self.client.post(
                "/mcp/toolkits/install",
                json={"entry_id": "workspace.filesystem"},
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(payload["error"]["code"], "mcp_workspace_required")

    def test_install_route_forwards_secret_payload(self):
        with mock.patch.object(
            miso_routes,
            "install_mcp_toolkit",
            return_value={"toolkit": {"toolkitId": "mcp.productivity.slack"}},
        ) as install:
            response = self.client.post(
                "/mcp/toolkits/install",
                json={
                    "entryId": "productivity.slack",
                    "secrets": {
                        "SLACK_BOT_TOKEN": "xoxb-test",
                        "SLACK_TEAM_ID": "T012345",
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        install.assert_called_once_with(
            "productivity.slack",
            workspace_root="",
            secrets={
                "SLACK_BOT_TOKEN": "xoxb-test",
                "SLACK_TEAM_ID": "T012345",
            },
            custom_recipe=None,
        )

    def test_install_route_forwards_custom_recipe_payload(self):
        custom_recipe = {
            "toolkit_id": "mcp.custom.local-test",
            "toolkit_name": "Local Test",
            "mcp": {"transport": "stdio", "command": "echo", "args": ["ok"]},
        }
        with mock.patch.object(
            miso_routes,
            "install_mcp_toolkit",
            return_value={"toolkit": {"toolkitId": "mcp.custom.local-test"}},
        ) as install:
            response = self.client.post(
                "/mcp/toolkits/install",
                json={"entryId": "custom", "customRecipe": custom_recipe},
            )

        self.assertEqual(response.status_code, 200)
        install.assert_called_once_with(
            "custom",
            workspace_root="",
            secrets={},
            custom_recipe=custom_recipe,
        )

    def test_configure_route_forwards_secret_and_workspace_payload(self):
        with mock.patch.object(
            miso_routes,
            "configure_mcp_toolkit",
            return_value={"toolkit": {"toolkitId": "mcp.browser.browser-use-local"}},
        ) as configure:
            response = self.client.post(
                "/mcp/toolkits/mcp.browser.browser-use-local/configure",
                json={
                    "workspaceRoot": "/tmp/project",
                    "secrets": {"OPENAI_API_KEY": "sk-test"},
                },
            )

        self.assertEqual(response.status_code, 200)
        configure.assert_called_once_with(
            "mcp.browser.browser-use-local",
            workspace_root="/tmp/project",
            secrets={"OPENAI_API_KEY": "sk-test"},
        )

    def test_oauth_start_route_forwards_entry_and_callback_base_url(self):
        with mock.patch.object(
            miso_routes,
            "start_mcp_oauth",
            return_value={
                "entryId": "productivity.notion-remote",
                "toolkitId": "mcp.productivity.notion-remote",
                "authUrl": "https://auth.notion.test/authorize",
                "state": "state-123",
            },
        ) as start:
            response = self.client.post(
                "/mcp/oauth/start",
                json={"entryId": "productivity.notion-remote"},
                base_url="http://127.0.0.1:5879",
            )

        self.assertEqual(response.status_code, 200)
        start.assert_called_once_with(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
        )

    def test_oauth_callback_route_does_not_require_auth_header(self):
        self.client.application.config["UNCHAIN_AUTH_TOKEN"] = "required-token"
        with mock.patch.object(
            miso_routes,
            "handle_mcp_oauth_callback",
            return_value={"toolkit": {"toolkitId": "mcp.productivity.notion-remote"}},
        ) as callback:
            response = self.client.get(
                "/mcp/oauth/callback?code=code-123&state=state-123",
                base_url="http://127.0.0.1:5879",
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("MCP connected", response.get_data(as_text=True))
        callback.assert_called_once_with("code-123", "state-123")

    def test_oauth_status_and_disconnect_routes_proxy_adapter_functions(self):
        with mock.patch.object(
            miso_routes,
            "get_mcp_oauth_status",
            return_value={
                "entryId": "productivity.notion-remote",
                "toolkitId": "mcp.productivity.notion-remote",
                "authStatus": "connected",
            },
        ) as status:
            response = self.client.get(
                "/mcp/oauth/status?entry_id=productivity.notion-remote",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["authStatus"], "connected")
        status.assert_called_once_with("productivity.notion-remote")

        with mock.patch.object(
            miso_routes,
            "disconnect_mcp_oauth",
            return_value={"ok": True, "toolkitId": "mcp.productivity.notion-remote"},
        ) as disconnect:
            response = self.client.delete("/mcp/oauth/mcp.productivity.notion-remote")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        disconnect.assert_called_once_with("mcp.productivity.notion-remote")

    def test_oauth_app_routes_proxy_adapter_functions(self):
        with mock.patch.object(
            miso_routes,
            "list_mcp_oauth_apps",
            return_value={
                "apps": [
                    {
                        "toolkitId": "mcp.dev.github-remote",
                        "provider": "github",
                        "configured": False,
                    }
                ]
            },
        ) as list_apps:
            response = self.client.get("/mcp/oauth/apps")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["apps"][0]["provider"], "github")
        list_apps.assert_called_once_with()

        with mock.patch.object(
            miso_routes,
            "configure_mcp_oauth_app",
            return_value={
                "app": {
                    "toolkitId": "mcp.dev.github-remote",
                    "provider": "github",
                    "configured": True,
                }
            },
        ) as configure_app:
            response = self.client.post(
                "/mcp/oauth/apps/configure",
                json={
                    "toolkitId": "mcp.dev.github-remote",
                    "clientId": "github-client-id",
                    "clientSecret": "github-client-secret",
                },
            )

        self.assertEqual(response.status_code, 200)
        configure_app.assert_called_once_with(
            {
                "toolkitId": "mcp.dev.github-remote",
                "clientId": "github-client-id",
                "clientSecret": "github-client-secret",
            }
        )

        with mock.patch.object(
            miso_routes,
            "delete_mcp_oauth_app",
            return_value={"ok": True, "toolkitId": "mcp.dev.github-remote"},
        ) as delete_app:
            response = self.client.delete("/mcp/oauth/apps/mcp.dev.github-remote")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        delete_app.assert_called_once_with("mcp.dev.github-remote")


class McpToolkitAdapterTests(unittest.TestCase):
    def test_catalog_v1_appends_installed_mcp_entries_for_agent_builder(self):
        with mock.patch.object(unchain_adapter, "_resolve_toolkit_base", return_value=None), \
             mock.patch.object(
                 unchain_adapter,
                 "list_installed_mcp_toolkits",
                 return_value=[
                     {
                         "toolkitId": "mcp.memory.memory",
                         "toolkitName": "Memory",
                         "toolkitDescription": "MCP memory",
                         "toolkitIcon": {"type": "builtin", "name": "server"},
                         "source": "mcp",
                         "status": "available",
                         "tools": [
                             {
                                 "name": "memory_read",
                                 "title": "Read",
                                 "description": "Read memory",
                             }
                         ],
                     }
                 ],
             ):
            payload = unchain_adapter.get_toolkit_catalog()

        self.assertEqual(payload["toolkits"][0]["id"], "mcp.memory.memory")
        self.assertEqual(payload["toolkits"][0]["name"], "mcp.memory.memory")
        self.assertEqual(payload["toolkits"][0]["kind"], "mcp")
        self.assertEqual(payload["toolkits"][0]["tools"][0]["name"], "memory_read")
        self.assertEqual(payload["count"], 1)

    def test_catalog_v2_appends_installed_mcp_entries(self):
        with mock.patch.object(unchain_adapter, "_resolve_toolkit_base", return_value=None), \
             mock.patch.object(
                 unchain_adapter,
                 "list_installed_mcp_toolkits",
                 return_value=[
                     {
                         "toolkitId": "mcp.memory.memory",
                         "toolkitName": "Memory",
                         "toolkitDescription": "MCP memory",
                         "toolkitIcon": {"type": "builtin", "name": "server"},
                         "source": "mcp",
                         "tools": [{"name": "memory_read", "title": "Read"}],
                     }
                 ],
             ):
            payload = unchain_adapter.get_toolkit_catalog_v2()

        self.assertEqual(payload["toolkits"][0]["toolkitId"], "mcp.memory.memory")
        self.assertEqual(payload["count"], 1)

    def test_metadata_returns_installed_mcp_entry(self):
        with mock.patch.object(
            unchain_adapter,
            "get_installed_mcp_toolkit",
            return_value={
                "toolkitId": "mcp.memory.memory",
                "toolkitName": "Memory",
                "toolkitDescription": "MCP memory",
                "toolkitIcon": {"type": "builtin", "name": "server"},
                "readmeMarkdown": "## Memory",
            },
        ):
            payload = unchain_adapter.get_toolkit_metadata("mcp.memory.memory")

        self.assertEqual(payload["toolkitId"], "mcp.memory.memory")
        self.assertEqual(payload["readmeMarkdown"], "## Memory")

    def test_build_selected_toolkits_supports_mcp_ids(self):
        fake_toolkit = object()
        with mock.patch.object(
            unchain_adapter,
            "build_mcp_runtime_toolkit",
            return_value=fake_toolkit,
        ):
            built = unchain_adapter._build_selected_toolkits(
                {"toolkits": ["mcp.memory.memory"]},
            )

        self.assertEqual(built, [fake_toolkit])

    def test_recipe_filter_resolves_mcp_toolkits_and_enabled_tools(self):
        fake_tool = type("FakeTool", (), {"name": "memory_read"})()
        fake_toolkit = type(
            "FakeToolkit",
            (),
            {
                "tools": {"memory_read": fake_tool, "memory_write": fake_tool},
            },
        )()
        setattr(fake_toolkit, unchain_adapter._RUNTIME_TOOLKIT_ID_ATTR, "mcp.memory.memory")

        recipe = type(
            "FakeRecipe",
            (),
            {
                "toolkits": (
                    type(
                        "ToolkitRef",
                        (),
                        {"id": "mcp.memory.memory", "enabled_tools": ("memory_read",)},
                    )(),
                ),
                "merge_with_user_selected": False,
            },
        )()

        with mock.patch.object(
            unchain_adapter,
            "build_mcp_runtime_toolkit",
            return_value=fake_toolkit,
        ):
            resolved = unchain_adapter._resolve_recipe_toolkits([], recipe, options={})

        self.assertEqual(list(resolved[0].tools.keys()), ["memory_read"])

    def test_disconnect_runtime_toolkits_calls_disconnect_when_available(self):
        toolkit = type("DisconnectableToolkit", (), {})()
        toolkit.disconnect = mock.Mock()

        unchain_adapter._disconnect_runtime_toolkits([toolkit])

        toolkit.disconnect.assert_called_once()


if __name__ == "__main__":
    unittest.main()
