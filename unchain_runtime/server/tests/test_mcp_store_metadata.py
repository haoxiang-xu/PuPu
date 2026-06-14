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
from mcp_store_metadata import (  # noqa: E402
    McpStoreMetadataError,
    list_mcp_store_metadata,
    reload_mcp_store_metadata,
)
from mcp_external_registries import import_mcp_store_registry  # noqa: E402


class McpStoreMetadataTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)

    def tearDown(self):
        self.tmpdir.cleanup()

    def _json_fetcher(self, url, headers, timeout):
        self.assertEqual(url, "https://api.github.com/repos/microsoft/playwright-mcp")
        self.assertEqual(headers["Accept"], "application/vnd.github+json")
        self.assertEqual(timeout, 8)
        return {
            "full_name": "microsoft/playwright-mcp",
            "description": "Playwright MCP server",
            "stargazers_count": 1234,
            "license": {"spdx_id": "Apache-2.0"},
            "owner": {"avatar_url": "https://avatars.githubusercontent.com/u/6154722?v=4"},
        }

    def _icon_fetcher(self, url, timeout, max_bytes):
        self.assertEqual(url, "https://avatars.githubusercontent.com/u/6154722?v=4")
        self.assertEqual(timeout, 8)
        self.assertEqual(max_bytes, 262144)
        return {
            "content": b"<svg></svg>",
            "mime_type": "image/svg+xml",
        }

    def test_reload_fetches_json_extracts_fields_and_persists_icon(self):
        result = reload_mcp_store_metadata(
            entry_id="browser.playwright",
            data_dir=self.data_dir,
            now_fn=lambda: 1000.0,
            http_json_fetcher=self._json_fetcher,
            icon_fetcher=self._icon_fetcher,
        )

        record = result["entries"][0]
        self.assertEqual(record["entryId"], "browser.playwright")
        self.assertEqual(record["toolkitId"], "mcp.browser.playwright")
        self.assertEqual(record["metadata"]["fullName"], "microsoft/playwright-mcp")
        self.assertEqual(record["metadata"]["description"], "Playwright MCP server")
        self.assertEqual(record["metadata"]["stars"], 1234)
        self.assertEqual(record["metadata"]["license"], "Apache-2.0")
        self.assertEqual(record["icon"]["type"], "file")
        self.assertEqual(record["icon"]["mimeType"], "image/svg+xml")
        self.assertEqual(record["iconPolicy"], "fallback")
        self.assertEqual(record["lastFetchedAt"], 1000.0)

        cached = list_mcp_store_metadata(data_dir=self.data_dir)
        self.assertEqual(cached["byEntryId"]["browser.playwright"]["metadata"]["stars"], 1234)
        self.assertEqual(cached["count"], 1)

    def test_cache_hit_skips_network_until_reload(self):
        reload_mcp_store_metadata(
            entry_id="browser.playwright",
            data_dir=self.data_dir,
            now_fn=lambda: 1000.0,
            http_json_fetcher=self._json_fetcher,
            icon_fetcher=self._icon_fetcher,
        )

        cached = list_mcp_store_metadata(
            data_dir=self.data_dir,
            now_fn=lambda: 1200.0,
        )

        self.assertEqual(cached["entries"][0]["status"], "cached")
        self.assertEqual(cached["entries"][0]["metadata"]["stars"], 1234)

    def test_reload_failure_preserves_stale_cache_and_records_error(self):
        reload_mcp_store_metadata(
            entry_id="browser.playwright",
            data_dir=self.data_dir,
            now_fn=lambda: 1000.0,
            http_json_fetcher=self._json_fetcher,
            icon_fetcher=self._icon_fetcher,
        )

        def failing_fetcher(url, headers, timeout):
            raise RuntimeError("network down")

        result = reload_mcp_store_metadata(
            entry_id="browser.playwright",
            data_dir=self.data_dir,
            now_fn=lambda: 2000.0,
            http_json_fetcher=failing_fetcher,
            icon_fetcher=self._icon_fetcher,
        )

        record = result["entries"][0]
        self.assertEqual(record["status"], "error")
        self.assertEqual(record["metadata"]["stars"], 1234)
        self.assertIn("network down", record["lastError"])

    def test_reload_missing_entry_raises_stable_error(self):
        with self.assertRaises(McpStoreMetadataError) as ctx:
            reload_mcp_store_metadata(
                entry_id="missing.entry",
                data_dir=self.data_dir,
            )

        self.assertEqual(ctx.exception.code, "mcp_metadata_not_found")

    def test_external_registry_metadata_entries_are_supported(self):
        import_mcp_store_registry(
            {
                "registry": {
                    "version": 1,
                    "name": "External",
                    "entries": [
                        {
                            "id": "external.metadata",
                            "toolkitId": "mcp.external.metadata",
                            "name": "External Metadata",
                            "description": "External metadata entry",
                            "category": "dev",
                            "metadata": {
                                "type": "http_json",
                                "request": {"url": "https://example.test/api/repo"},
                                "fields": {"description": "description"},
                            },
                            "mcp": {
                                "transport": "http",
                                "runtimeTransport": "streamable_http",
                                "url": "https://example.test/mcp",
                                "headers": [],
                            },
                        }
                    ],
                }
            },
            data_dir=self.data_dir,
        )

        result = reload_mcp_store_metadata(
            entry_id="external.metadata",
            data_dir=self.data_dir,
            now_fn=lambda: 1000.0,
            http_json_fetcher=lambda url, headers, timeout: {
                "description": "Fetched external description",
            },
            icon_fetcher=self._icon_fetcher,
        )

        record = result["entries"][0]
        self.assertEqual(record["entryId"], "external.metadata")
        self.assertEqual(record["metadata"]["description"], "Fetched external description")


class McpStoreMetadataRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = miso_app.create_app().test_client()

    def test_metadata_routes_proxy_service_functions(self):
        expected = {
            "entries": [{"entryId": "browser.playwright"}],
            "byEntryId": {"browser.playwright": {"entryId": "browser.playwright"}},
            "count": 1,
            "status": "ok",
        }
        with mock.patch.object(
            miso_routes,
            "list_mcp_store_metadata",
            return_value=expected,
        ):
            response = self.client.get("/mcp/store/metadata")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)

    def test_reload_route_forwards_entry_id_and_errors_stably(self):
        with mock.patch.object(
            miso_routes,
            "reload_mcp_store_metadata",
            side_effect=McpStoreMetadataError(
                "mcp_metadata_not_found",
                "Metadata recipe not found",
                404,
            ),
        ):
            response = self.client.post(
                "/mcp/store/metadata/reload",
                json={"entryId": "missing.entry"},
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(payload["error"]["code"], "mcp_metadata_not_found")

    def test_reload_route_forwards_payload(self):
        with mock.patch.object(
            miso_routes,
            "reload_mcp_store_metadata",
            return_value={"entries": [], "byEntryId": {}, "count": 0, "status": "ok"},
        ) as reload:
            response = self.client.post(
                "/mcp/store/metadata/reload",
                json={"entry_id": "browser.playwright"},
            )

        self.assertEqual(response.status_code, 200)
        reload.assert_called_once_with(entry_id="browser.playwright")


if __name__ == "__main__":
    unittest.main()
