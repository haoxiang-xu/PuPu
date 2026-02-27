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
                    "name": "python_workspace_toolkit",
                    "class_name": "python_workspace_toolkit",
                    "module": "miso.builtin_toolkits.python_workspace_toolkit.python_workspace_toolkit",
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


if __name__ == "__main__":
    unittest.main()
