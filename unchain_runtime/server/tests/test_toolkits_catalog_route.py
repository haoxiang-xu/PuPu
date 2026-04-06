import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402


class ToolkitsCatalogRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = miso_app.create_app().test_client()

    def test_toolkits_catalog_returns_adapter_payload(self) -> None:
        expected_payload = {
            "toolkits": [
                {
                    "name": "workspace_toolkit",
                    "class_name": "workspace_toolkit",
                    "module": "unchain.toolkits.builtin.workspace.workspace",
                    "kind": "builtin",
                }
            ],
            "count": 1,
            "source": "/tmp/miso",
        }

        with mock.patch.object(
            miso_routes,
            "get_toolkit_catalog",
            return_value=expected_payload,
        ):
            response = self.client.get("/toolkits/catalog")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected_payload)

    def test_toolkits_catalog_rejects_unauthorized_request(self) -> None:
        with mock.patch.object(miso_routes, "_is_authorized", return_value=False):
            response = self.client.get("/toolkits/catalog")

        payload = response.get_json()
        self.assertEqual(response.status_code, 401)
        self.assertEqual(payload["error"]["code"], "unauthorized")

    def test_toolkits_catalog_v2_returns_adapter_payload(self) -> None:
        expected_payload = {
            "toolkits": [
                {
                    "toolkitId": "workspace_toolkit",
                    "toolkitName": "Workspace Toolkit",
                    "toolkitIcon": {
                        "type": "builtin",
                        "name": "terminal",
                        "color": "#0f172a",
                        "backgroundColor": "#bae6fd",
                    },
                }
            ],
            "count": 1,
            "source": "/tmp/miso",
        }

        with mock.patch.object(
            miso_routes,
            "get_toolkit_catalog_v2",
            return_value=expected_payload,
        ):
            response = self.client.get("/toolkits/catalog/v2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected_payload)

    def test_toolkit_metadata_returns_adapter_payload(self) -> None:
        expected_payload = {
            "toolkitId": "workspace_toolkit",
            "toolkitName": "Workspace Toolkit",
            "toolkitIcon": {
                "type": "file",
                "mimeType": "image/svg+xml",
                "content": "<svg></svg>",
                "encoding": "utf8",
            },
            "readmeMarkdown": "# Workspace Toolkit",
            "selectedToolName": "read_file",
        }

        with mock.patch.object(
            miso_routes,
            "get_toolkit_metadata",
            return_value=expected_payload,
        ) as mocked:
            response = self.client.get("/toolkits/workspace_toolkit/metadata?tool_name=read_file")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected_payload)
        mocked.assert_called_once_with("workspace_toolkit", "read_file")


if __name__ == "__main__":
    unittest.main()
