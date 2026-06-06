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
    delete_mcp_toolkit,
    get_installed_mcp_toolkit,
    install_mcp_toolkit,
    list_installed_mcp_toolkits,
    reload_mcp_toolkits,
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

    def test_install_rejects_unsupported_or_secret_entries(self):
        with self.assertRaises(McpToolkitError) as ctx:
            install_mcp_toolkit(
                "browser.browser-use-local",
                data_dir=self.data_dir,
                toolkit_factory=FakeMCPToolkit,
            )

        self.assertEqual(ctx.exception.code, "unsupported_mcp_entry")
        self.assertEqual(list_installed_mcp_toolkits(data_dir=self.data_dir), [])

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
