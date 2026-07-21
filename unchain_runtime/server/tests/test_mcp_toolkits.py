import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

TESTS_ROOT = Path(__file__).resolve().parent
if str(TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(TESTS_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402
import unchain_adapter  # noqa: E402
import mcp_managed_runtime  # noqa: E402
from mcp_managed_runtime import McpManagedRuntimeError  # noqa: E402
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
from _mcp_registry_fixture import (  # noqa: E402
    FIXTURE_SECRET_KEY_A,
    FIXTURE_SECRET_KEY_B,
    FIXTURE_STDIO_SECRET_ENTRY_ID,
    FIXTURE_STDIO_SECRET_TOOLKIT_ID,
    FIXTURE_TOOL_NAME,
    install_fixture_registry_entries,
    remove_fixture_registry_entries,
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
        install_fixture_registry_entries()
        self.managed_runtime_patch = mock.patch(
            "mcp_toolkits.resolve_managed_stdio_runtime",
            side_effect=lambda command, env, data_dir=None: {
                "command": command,
                "managed_env": {},
                "managed_runtime": {},
            },
        )
        self.managed_runtime_patch.start()
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
        self.managed_runtime_patch.stop()
        remove_fixture_registry_entries()
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
                FIXTURE_STDIO_SECRET_ENTRY_ID,
                secrets={FIXTURE_SECRET_KEY_A: "fixture-a-value"},
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_secret_required")
        self.assertIn(FIXTURE_SECRET_KEY_B, str(ctx.exception))
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

    def test_secret_stdio_entry_injects_env_and_persists_secret_refs_only(self):
        install_mcp_toolkit(
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-value",
                FIXTURE_SECRET_KEY_B: "fixture-b-value",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1234.0,
        )

        env = FakeMCPToolkit.instances[-1].kwargs["env"]
        self.assertEqual(env[FIXTURE_SECRET_KEY_A], "fixture-a-value")
        self.assertEqual(env[FIXTURE_SECRET_KEY_B], "fixture-b-value")

        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        record = persisted["toolkits"][0]
        self.assertEqual(record["toolkit_id"], FIXTURE_STDIO_SECRET_TOOLKIT_ID)
        self.assertEqual(
            record["secret_keys"], [FIXTURE_SECRET_KEY_A, FIXTURE_SECRET_KEY_B]
        )
        self.assertNotIn("fixture-b-value", json.dumps(record))
        self.assertEqual(
            get_mcp_secret_value(
                FIXTURE_STDIO_SECRET_TOOLKIT_ID,
                FIXTURE_SECRET_KEY_B,
                data_dir=self.data_dir,
            ),
            "fixture-b-value",
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

    def test_slack_remote_requires_oauth(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "productivity.slack-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_entry_not_available")
        self.assertEqual(ctx.exception.status, 403)

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
        with self.assertRaises(McpToolkitError) as token_ctx:
            install_mcp_toolkit(
                "productivity.slack-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
                now_fn=lambda: 1600.0,
            )

        self.assertEqual(token_ctx.exception.code, "mcp_entry_not_available")
        self.assertEqual(FakeMCPToolkit.instances, [])

    def test_install_rejects_curated_entries_that_are_not_release_available(self):
        for entry_id in (
            "dev.figma-remote",
            "devops.vercel-remote",
            "productivity.discord",
            "productivity.telegram",
        ):
            with self.subTest(entry_id=entry_id):
                with self.assertRaises(McpToolkitError) as ctx:
                    install_mcp_toolkit(
                        entry_id,
                        secrets={"DISCORD_TOKEN": "test-token"},
                        data_dir=self.data_dir,
                        toolkit_factory=FakeMCPToolkit,
                    )

                self.assertEqual(ctx.exception.code, "mcp_entry_not_available")
                self.assertEqual(ctx.exception.status, 403)

        self.assertEqual(FakeMCPToolkit.instances, [])

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

    def test_release_ready_sentry_oauth_entry_remains_installable(self):
        save_mcp_oauth_token(
            "mcp.devops.sentry-remote",
            {
                "entry_id": "devops.sentry-remote",
                "access_token": "sentry-access-token",
                "refresh_token": "sentry-refresh-token",
                "expires_at": 9999999999.0,
                "token_endpoint": "https://mcp.sentry.dev/oauth/token",
                "client_id": "sentry-client-id",
            },
            data_dir=self.data_dir,
        )

        result = install_mcp_toolkit(
            "devops.sentry-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1850.0,
        )

        kwargs = FakeMCPToolkit.instances[-1].kwargs
        self.assertEqual(kwargs["url"], "https://mcp.sentry.dev/mcp")
        self.assertEqual(
            kwargs["headers"]["Authorization"],
            "Bearer sentry-access-token",
        )
        self.assertEqual(result["toolkit"]["authProvider"], "sentry")

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

    def test_stale_figma_record_is_listed_as_release_blocked(self):
        stale_record = {
            "entry_id": "dev.figma-remote",
            "toolkit_id": "mcp.dev.figma-remote",
            "toolkit_name": "Figma",
            "toolkit_description": "Stale installed Figma record",
            "toolkit_icon": {},
            "status": "available",
            "last_error": "",
            "last_checked_at": 1000.0,
            "transport": "streamable_http",
            "url": "https://mcp.figma.com/mcp",
            "tools": [{"name": "get_design_context"}],
            "skills": [],
            "secret_keys": [],
            "auth_type": "oauth",
            "auth_provider": "figma",
        }
        (self.data_dir / "mcp_toolkits.json").write_text(
            json.dumps({"version": 1, "toolkits": [stale_record]}),
            encoding="utf-8",
        )

        listed = list_installed_mcp_toolkits(data_dir=self.data_dir)

        self.assertEqual(listed[0]["status"], "error")
        self.assertTrue(listed[0]["releaseBlocked"])
        self.assertEqual(
            listed[0]["lastError"],
            "This MCP toolkit is not available in this release",
        )
        self.assertEqual(FakeMCPToolkit.instances, [])

    def test_stale_figma_health_reload_and_configure_never_connect(self):
        stale_record = {
            "entry_id": "dev.figma-remote",
            "toolkit_id": "mcp.dev.figma-remote",
            "toolkit_name": "Figma",
            "toolkit_description": "Stale installed Figma record",
            "toolkit_icon": {},
            "status": "available",
            "last_error": "",
            "last_checked_at": 1000.0,
            "transport": "streamable_http",
            "url": "https://mcp.figma.com/mcp",
            "tools": [{"name": "get_design_context"}],
            "skills": [],
            "secret_keys": [],
            "auth_type": "oauth",
            "auth_provider": "figma",
        }
        (self.data_dir / "mcp_toolkits.json").write_text(
            json.dumps({"version": 1, "toolkits": [stale_record]}),
            encoding="utf-8",
        )

        checked = check_mcp_toolkit_health(
            "mcp.dev.figma-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 2000.0,
        )
        reloaded = reload_mcp_toolkits(
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 3000.0,
        )
        with self.assertRaises(McpToolkitError) as ctx:
            configure_mcp_toolkit(
                "mcp.dev.figma-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(checked["toolkit"]["status"], "error")
        self.assertEqual(reloaded["toolkits"][0]["status"], "error")
        self.assertEqual(ctx.exception.code, "mcp_entry_not_available")
        self.assertEqual(FakeMCPToolkit.instances, [])
        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        self.assertEqual(persisted["toolkits"][0]["status"], "error")
        self.assertEqual(
            persisted["toolkits"][0]["last_error"],
            "This MCP toolkit is not available in this release",
        )

    def test_reload_secret_entry_uses_stored_secret_values(self):
        install_mcp_toolkit(
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-value",
                FIXTURE_SECRET_KEY_B: "fixture-b-value",
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
        self.assertEqual(env[FIXTURE_SECRET_KEY_A], "fixture-a-value")
        self.assertEqual(env[FIXTURE_SECRET_KEY_B], "fixture-b-value")

    def test_reload_secret_entry_marks_error_when_secret_is_missing(self):
        install_mcp_toolkit(
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-value",
                FIXTURE_SECRET_KEY_B: "fixture-b-value",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        delete_mcp_secret_values(FIXTURE_STDIO_SECRET_TOOLKIT_ID, data_dir=self.data_dir)

        result = reload_mcp_toolkits(
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 4000.0,
        )

        self.assertEqual(result["toolkits"][0]["status"], "error")
        self.assertIn(FIXTURE_SECRET_KEY_A, result["toolkits"][0]["lastError"])
        self.assertEqual(result["toolkits"][0]["lastCheckedAt"], 4000.0)

    def test_configure_secret_entry_updates_secrets_after_successful_discovery(self):
        install_mcp_toolkit(
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-old",
                FIXTURE_SECRET_KEY_B: "fixture-b-old",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )
        FakeMCPToolkit.instances = []
        FakeMCPToolkit.next_tools = {
            FIXTURE_TOOL_NAME: {
                "description": "Search dashboards",
                "requires_confirmation": False,
            },
        }

        result = configure_mcp_toolkit(
            FIXTURE_STDIO_SECRET_TOOLKIT_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-new",
                FIXTURE_SECRET_KEY_B: "fixture-b-new",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 5000.0,
        )

        self.assertEqual(result["toolkit"]["status"], "available")
        self.assertEqual(result["toolkit"]["tools"][0]["name"], FIXTURE_TOOL_NAME)
        self.assertEqual(result["toolkit"]["lastCheckedAt"], 5000.0)
        self.assertEqual(
            result["toolkit"]["secretStatus"],
            [
                {"key": FIXTURE_SECRET_KEY_A, "configured": True},
                {"key": FIXTURE_SECRET_KEY_B, "configured": True},
            ],
        )
        self.assertEqual(
            FakeMCPToolkit.instances[-1].kwargs["env"][FIXTURE_SECRET_KEY_A],
            "fixture-a-new",
        )
        self.assertEqual(
            get_mcp_secret_value(
                FIXTURE_STDIO_SECRET_TOOLKIT_ID,
                FIXTURE_SECRET_KEY_A,
                data_dir=self.data_dir,
            ),
            "fixture-a-new",
        )

    def test_configure_failure_does_not_overwrite_existing_secret_or_record(self):
        install_mcp_toolkit(
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-old",
                FIXTURE_SECRET_KEY_B: "fixture-b-old",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
            now_fn=lambda: 1000.0,
        )
        FakeMCPToolkit.fail_connect = True

        with self.assertRaises(McpToolkitError) as ctx:
            configure_mcp_toolkit(
                FIXTURE_STDIO_SECRET_TOOLKIT_ID,
                secrets={
                    FIXTURE_SECRET_KEY_A: "fixture-a-new",
                    FIXTURE_SECRET_KEY_B: "fixture-b-new",
                },
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
                now_fn=lambda: 6000.0,
            )

        self.assertEqual(ctx.exception.code, "mcp_configure_failed")
        installed = get_installed_mcp_toolkit(
            FIXTURE_STDIO_SECRET_TOOLKIT_ID,
            data_dir=self.data_dir,
        )
        self.assertEqual(installed["lastCheckedAt"], 1000.0)
        self.assertEqual(
            get_mcp_secret_value(
                FIXTURE_STDIO_SECRET_TOOLKIT_ID,
                FIXTURE_SECRET_KEY_A,
                data_dir=self.data_dir,
            ),
            "fixture-a-old",
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
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-value",
                FIXTURE_SECRET_KEY_B: "fixture-b-value",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        delete_mcp_toolkit(FIXTURE_STDIO_SECRET_TOOLKIT_ID, data_dir=self.data_dir)

        self.assertEqual(
            get_mcp_secret_value(
                FIXTURE_STDIO_SECRET_TOOLKIT_ID,
                FIXTURE_SECRET_KEY_A,
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

    def test_build_runtime_rejects_unhealthy_installed_record(self):
        install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        path = self.data_dir / "mcp_toolkits.json"
        persisted = json.loads(path.read_text())
        for status in ("error", None):
            with self.subTest(status=status):
                record = persisted["toolkits"][0]
                if status is None:
                    record.pop("status", None)
                else:
                    record["status"] = status
                path.write_text(json.dumps(persisted))
                FakeMCPToolkit.instances = []

                with self.assertRaises(McpToolkitError) as ctx:
                    build_mcp_runtime_toolkit(
                        "mcp.memory.memory",
                        data_dir=self.data_dir,
                        toolkit_factory=FakeMCPToolkit,
                    )

                self.assertEqual(ctx.exception.code, "mcp_entry_not_available")
                self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(FakeMCPToolkit.instances, [])

    def test_build_runtime_rejects_old_install_blocked_by_current_registry(self):
        install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        path = self.data_dir / "mcp_toolkits.json"
        persisted = json.loads(path.read_text())
        record = persisted["toolkits"][0]
        record.update(
            {
                "entry_id": "dev.figma-remote",
                "toolkit_id": "mcp.dev.figma-remote",
                "toolkit_name": "Figma Remote",
                "status": "available",
            }
        )
        path.write_text(json.dumps(persisted))
        FakeMCPToolkit.instances = []

        with self.assertRaises(McpToolkitError) as ctx:
            build_mcp_runtime_toolkit(
                "mcp.dev.figma-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_entry_not_available")
        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(FakeMCPToolkit.instances, [])

    def test_build_runtime_allows_release_supported_curated_auth_paths(self):
        install_mcp_toolkit(
            "dev.github-remote",
            secrets={"GITHUB_MCP_PAT": "ghp-test"},
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        github = build_mcp_runtime_toolkit(
            "mcp.dev.github-remote",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        self.assertEqual(
            github.kwargs["headers"]["Authorization"],
            "Bearer ghp-test",
        )

        for entry_id, toolkit_id, provider in (
            (
                "productivity.notion-remote",
                "mcp.productivity.notion-remote",
                "notion",
            ),
            (
                "devops.sentry-remote",
                "mcp.devops.sentry-remote",
                "sentry",
            ),
        ):
            with self.subTest(provider=provider):
                save_mcp_oauth_token(
                    toolkit_id,
                    {
                        "entry_id": entry_id,
                        "access_token": f"{provider}-access-token",
                        "expires_at": 9999999999.0,
                    },
                    data_dir=self.data_dir,
                )
                install_mcp_toolkit(
                    entry_id,
                    data_dir=self.data_dir,
                    toolkit_factory=FakeMCPToolkit,
                )
                toolkit = build_mcp_runtime_toolkit(
                    toolkit_id,
                    data_dir=self.data_dir,
                    toolkit_factory=FakeMCPToolkit,
                )
                self.assertEqual(
                    toolkit.kwargs["headers"]["Authorization"],
                    f"Bearer {provider}-access-token",
                )

    def test_build_runtime_allows_expired_oauth_token_to_refresh(self):
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

        with mock.patch(
            "mcp_toolkits.get_mcp_oauth_status",
            return_value={"authStatus": "expired"},
        ), mock.patch(
            "mcp_toolkits.get_valid_mcp_oauth_access_token",
            return_value="notion-refreshed-token",
        ) as refresh:
            toolkit = build_mcp_runtime_toolkit(
                "mcp.productivity.notion-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        refresh.assert_called_once_with(
            "mcp.productivity.notion-remote",
            data_dir=self.data_dir,
        )
        self.assertEqual(
            toolkit.kwargs["headers"]["Authorization"],
            "Bearer notion-refreshed-token",
        )

    def test_build_runtime_rejects_oauth_error_status(self):
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

        with mock.patch(
            "mcp_toolkits.get_mcp_oauth_status",
            return_value={"authStatus": "error"},
        ), self.assertRaises(McpToolkitError) as ctx:
            build_mcp_runtime_toolkit(
                "mcp.productivity.notion-remote",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_required")

    def test_build_runtime_allows_custom_install(self):
        install_mcp_toolkit(
            "custom",
            custom_recipe={
                "toolkit_id": "mcp.custom.release-test",
                "toolkit_name": "Release Test",
                "mcp": {"transport": "stdio", "command": "echo", "args": ["ok"]},
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.custom.release-test",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertTrue(toolkit.connected)
        self.assertEqual(toolkit.kwargs["command"], "echo")

    def test_build_runtime_allows_approved_external_install(self):
        imported = import_mcp_store_registry(
            {
                "registry": {
                    "version": 1,
                    "name": "External Runtime",
                    "entries": [
                        {
                            "id": "external.runtime-approved",
                            "toolkitId": "mcp.external.runtime-approved",
                            "name": "External Runtime Approved",
                            "description": "Approved external runtime entry",
                            "category": "dev",
                            "installable": True,
                            "mcp": {
                                "transport": "stdio",
                                "command": "node",
                                "args": ["server.js"],
                            },
                            "policySummary": {"reviewed": True},
                        }
                    ],
                }
            },
            data_dir=self.data_dir,
        )
        approve_mcp_store_entry(
            "external.runtime-approved",
            registry_id=imported["registry"]["registryId"],
            data_dir=self.data_dir,
            acknowledged_risk=True,
        )
        install_mcp_toolkit(
            "external.runtime-approved",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.external.runtime-approved",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertTrue(toolkit.connected)
        self.assertEqual(toolkit.kwargs["command"], "node")

    def test_stdio_install_resolves_managed_runtime_and_persists_non_secret_env(self):
        self.managed_runtime_patch.stop()
        self.managed_runtime_patch = mock.patch(
            "mcp_toolkits.resolve_managed_stdio_runtime",
            return_value={
                "command": str(self.data_dir / "mcp_runtime" / "runtimes" / "node" / "bin" / "npx"),
                "managed_env": {
                    "PATH": str(self.data_dir / "mcp_runtime" / "runtimes" / "node" / "bin"),
                    "NPM_CONFIG_CACHE": str(self.data_dir / "mcp_runtime" / "cache" / "npm"),
                    "npm_config_cache": str(self.data_dir / "mcp_runtime" / "cache" / "npm"),
                },
                "managed_runtime": {
                    "kind": "node",
                    "version": "v24.0.0",
                    "source_command": "npx",
                },
            },
        )
        self.managed_runtime_patch.start()

        install_mcp_toolkit(
            "memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        kwargs = FakeMCPToolkit.instances[-1].kwargs
        self.assertTrue(kwargs["command"].endswith("/mcp_runtime/runtimes/node/bin/npx"))
        self.assertEqual(
            kwargs["env"]["NPM_CONFIG_CACHE"],
            str(self.data_dir / "mcp_runtime" / "cache" / "npm"),
        )

        persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
        record = persisted["toolkits"][0]
        self.assertEqual(record["managed_runtime"]["kind"], "node")
        self.assertEqual(
            record["managed_env"]["npm_config_cache"],
            str(self.data_dir / "mcp_runtime" / "cache" / "npm"),
        )

        toolkit = build_mcp_runtime_toolkit(
            "mcp.memory.memory",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
        self.assertTrue(toolkit.kwargs["command"].endswith("/mcp_runtime/runtimes/node/bin/npx"))
        self.assertEqual(
            toolkit.kwargs["env"]["NPM_CONFIG_CACHE"],
            str(self.data_dir / "mcp_runtime" / "cache" / "npm"),
        )

    def test_managed_runtime_error_does_not_persist_failed_install(self):
        self.managed_runtime_patch.stop()
        self.managed_runtime_patch = mock.patch(
            "mcp_toolkits.resolve_managed_stdio_runtime",
            side_effect=McpManagedRuntimeError(
                "mcp_runtime_checksum_failed",
                "Checksum mismatch for managed Node runtime",
            ),
        )
        self.managed_runtime_patch.start()

        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "memory.memory",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "mcp_runtime_checksum_failed")
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])
        self.assertFalse((self.data_dir / "mcp_toolkits.json").exists())

    def test_build_runtime_toolkit_resolves_stdio_secret_env(self):
        install_mcp_toolkit(
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-value",
                FIXTURE_SECRET_KEY_B: "fixture-b-value",
            },
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        toolkit = build_mcp_runtime_toolkit(
            FIXTURE_STDIO_SECRET_TOOLKIT_ID,
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )

        self.assertTrue(toolkit.connected)
        self.assertEqual(toolkit.kwargs["env"][FIXTURE_SECRET_KEY_A], "fixture-a-value")
        self.assertEqual(
            toolkit.kwargs["env"][FIXTURE_SECRET_KEY_B], "fixture-b-value"
        )

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
            return_value={"toolkit": {"toolkitId": FIXTURE_STDIO_SECRET_TOOLKIT_ID}},
        ) as install:
            response = self.client.post(
                "/mcp/toolkits/install",
                json={
                    "entryId": FIXTURE_STDIO_SECRET_ENTRY_ID,
                    "secrets": {
                        FIXTURE_SECRET_KEY_A: "fixture-a-value",
                        FIXTURE_SECRET_KEY_B: "fixture-b-value",
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        install.assert_called_once_with(
            FIXTURE_STDIO_SECRET_ENTRY_ID,
            workspace_root="",
            secrets={
                FIXTURE_SECRET_KEY_A: "fixture-a-value",
                FIXTURE_SECRET_KEY_B: "fixture-b-value",
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

    def test_oauth_cancel_route_invalidates_exact_pending_state(self):
        with mock.patch.object(
            miso_routes,
            "cancel_mcp_oauth_start",
            return_value={"ok": True, "cancelled": True},
        ) as cancel:
            response = self.client.post(
                "/mcp/oauth/cancel",
                json={"state": "state-123"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"ok": True, "cancelled": True})
        cancel.assert_called_once_with("state-123")

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
            "get_mcp_oauth_attempt_status",
            return_value={
                "entryId": "productivity.notion-remote",
                "toolkitId": "mcp.productivity.notion-remote",
                "authStatus": "connected",
            },
        ) as status:
            response = self.client.get(
                "/mcp/oauth/status?state=state-123",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["authStatus"], "connected")
        status.assert_called_once_with("state-123")

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
                         "status": "available",
                         "tools": [{"name": "memory_read", "title": "Read"}],
                     }
                 ],
             ), mock.patch(
                 "computer_use_flag.is_feature_available", return_value=True
             ):
            payload = unchain_adapter.get_toolkit_catalog_v2()

        toolkit_ids = {item["toolkitId"] for item in payload["toolkits"]}
        self.assertEqual(toolkit_ids, {"builtin.computer", "mcp.memory.memory"})
        self.assertEqual(payload["count"], 2)

    def test_catalog_excludes_unhealthy_mcp_entries(self):
        with mock.patch.object(
            unchain_adapter,
            "list_installed_mcp_toolkits",
            return_value=[
                {"toolkitId": "mcp.memory.available", "status": "available"},
                {"toolkitId": "mcp.memory.error", "status": "error"},
                {"toolkitId": "mcp.memory.missing-status"},
            ],
        ):
            entries = unchain_adapter._installed_mcp_catalog_entries()

        self.assertEqual(
            [entry["toolkitId"] for entry in entries],
            ["mcp.memory.available"],
        )

    def test_catalog_excludes_release_blocked_and_disconnected_oauth_entries(self):
        with mock.patch.object(
            unchain_adapter,
            "list_installed_mcp_toolkits",
            return_value=[
                {
                    "entryId": "dev.figma-remote",
                    "toolkitId": "mcp.dev.figma-remote",
                    "status": "available",
                    "authType": "oauth",
                    "authStatus": "connected",
                },
                {
                    "entryId": "productivity.notion-remote",
                    "toolkitId": "mcp.productivity.notion-remote",
                    "status": "available",
                    "authType": "oauth",
                    "authStatus": "missing",
                },
                {
                    "entryId": "devops.sentry-remote",
                    "toolkitId": "mcp.devops.sentry-remote",
                    "status": "available",
                    "authType": "oauth",
                    "authStatus": "error",
                },
                {
                    "entryId": "productivity.notion-remote",
                    "toolkitId": "mcp.productivity.notion-expired",
                    "status": "available",
                    "authType": "oauth",
                    "authStatus": "expired",
                },
                {
                    "entryId": "productivity.notion-remote",
                    "toolkitId": "mcp.productivity.notion-connected",
                    "status": "available",
                    "authType": "oauth",
                    "authStatus": "connected",
                },
                {
                    "entryId": "dev.github-remote",
                    "toolkitId": "mcp.dev.github-pat",
                    "status": "available",
                },
            ],
        ):
            entries = unchain_adapter._installed_mcp_catalog_entries()

        self.assertEqual(
            [entry["toolkitId"] for entry in entries],
            ["mcp.productivity.notion-connected", "mcp.dev.github-pat"],
        )

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

    def test_build_selected_toolkits_skips_stale_unavailable_mcp_selection(self):
        fake_toolkit = object()

        def build(toolkit_id):
            if toolkit_id in {
                "mcp.dev.figma-remote",
                "mcp.memory.unhealthy",
            }:
                raise McpToolkitError(
                    "mcp_entry_not_available",
                    "This MCP toolkit is not available in this release",
                    403,
                )
            return fake_toolkit

        with mock.patch.object(
            unchain_adapter,
            "build_mcp_runtime_toolkit",
            side_effect=build,
        ), self.assertLogs(unchain_adapter._subagent_logger, level="WARNING") as logs:
            built = unchain_adapter._build_selected_toolkits(
                {
                    "toolkits": [
                        "mcp.dev.figma-remote",
                        "mcp.memory.unhealthy",
                        "mcp.memory.memory",
                    ]
                },
            )

        self.assertEqual(built, [fake_toolkit])
        self.assertIn("mcp_entry_not_available", "\n".join(logs.output))

    def test_build_selected_toolkits_skips_missing_or_expired_oauth_selection(self):
        for code in (
            "mcp_toolkit_not_found",
            "mcp_oauth_required",
            "mcp_oauth_expired",
        ):
            with self.subTest(code=code), mock.patch.object(
                unchain_adapter,
                "build_mcp_runtime_toolkit",
                side_effect=McpToolkitError(code, "OAuth unavailable", 400),
            ), self.assertLogs(unchain_adapter._subagent_logger, level="WARNING"):
                built = unchain_adapter._build_selected_toolkits(
                    {"toolkits": ["mcp.productivity.notion-remote"]},
                )

            self.assertEqual(built, [])

    def test_build_selected_toolkits_keeps_secret_and_unknown_errors_blocking(self):
        for code in ("mcp_secret_required", "mcp_oauth_refresh_failed"):
            with self.subTest(code=code), mock.patch.object(
                unchain_adapter,
                "build_mcp_runtime_toolkit",
                side_effect=McpToolkitError(code, "MCP setup failed", 400),
            ):
                with self.assertRaises(RuntimeError) as ctx:
                    unchain_adapter._build_selected_toolkits(
                        {"toolkits": ["mcp.memory.memory"]},
                    )

            self.assertIsInstance(ctx.exception.__cause__, McpToolkitError)

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
