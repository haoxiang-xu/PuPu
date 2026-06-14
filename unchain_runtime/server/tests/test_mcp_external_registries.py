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
from mcp_external_registries import (  # noqa: E402
    McpExternalRegistryError,
    approve_mcp_store_entry,
    approved_external_registry_entry,
    delete_mcp_store_registry,
    import_mcp_store_registry,
    list_mcp_store_entries,
    list_mcp_store_registries,
    refresh_mcp_store_registry,
    revoke_mcp_store_entry_approval,
    validate_mcp_store_registry,
)


def sample_registry(entry_id="external.sample", toolkit_id="mcp.external.sample"):
    return {
        "version": 1,
        "name": "Sample Registry",
        "publisher": "Example",
        "homepage": "https://example.test/mcp",
        "entries": [
            {
                "id": entry_id,
                "toolkitId": toolkit_id,
                "name": "External Sample",
                "description": "External review-only MCP entry",
                "category": "dev",
                "installable": True,
                "sourceRepo": "https://example.test/repo",
                "docsUrl": "https://example.test/docs",
                "metadata": {
                    "type": "http_json",
                    "request": {"url": "https://example.test/api/repo"},
                    "fields": {"description": "description"},
                    "icon": {"urlPath": "owner.avatar_url"},
                },
                "mcp": {
                    "transport": "http",
                    "runtimeTransport": "streamable_http",
                    "url": "https://example.test/mcp",
                    "headers": [],
                },
                "tools": [
                    {
                        "name": "external_search",
                        "title": "Search",
                        "requiresConfirmation": False,
                    }
                ],
                "policySummary": {"reviewed": True},
                "readmeMarkdown": "## External Sample",
            }
        ],
    }


class McpExternalRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_import_inline_registry_persists_review_only_entries(self):
        result = import_mcp_store_registry(
            {"registry": sample_registry()},
            data_dir=self.data_dir,
            now_fn=lambda: 1000.0,
        )

        registry = result["registry"]
        self.assertEqual(registry["name"], "Sample Registry")
        self.assertEqual(registry["sourceType"], "inline")
        self.assertEqual(registry["entryCount"], 1)

        external = [
            entry
            for entry in list_mcp_store_entries(data_dir=self.data_dir)["entries"]
            if entry.get("registryId") == registry["registryId"]
        ][0]
        self.assertEqual(external["id"], "external.sample")
        self.assertEqual(external["source"], "mcp_registry")
        self.assertEqual(external["trustLevel"], "external_review")
        self.assertEqual(external["status"], "needs_review")
        self.assertFalse(external["installable"])
        self.assertFalse(external["policySummary"]["reviewed"])
        self.assertEqual(external["registryName"], "Sample Registry")
        self.assertIn("review", external)
        self.assertEqual(external["review"]["recipeHash"], external["recipeHash"])
        self.assertIn(external["review"]["riskLevel"], {"low", "medium", "high", "critical"})

        persisted = json.loads((self.data_dir / "mcp_external_registries.json").read_text())
        self.assertEqual(persisted["registries"][0]["registry_id"], registry["registryId"])

    def test_import_rejects_conflicts_with_curated_and_custom_reserved_ids(self):
        with self.assertRaises(McpExternalRegistryError) as ctx:
            import_mcp_store_registry(
                {"registry": sample_registry("memory.memory", "mcp.external.memory")},
                data_dir=self.data_dir,
            )
        self.assertEqual(ctx.exception.code, "mcp_registry_conflict")

        with self.assertRaises(McpExternalRegistryError) as custom_ctx:
            import_mcp_store_registry(
                {"registry": sample_registry("external.custom", "mcp.custom.sample")},
                data_dir=self.data_dir,
            )
        self.assertEqual(custom_ctx.exception.code, "mcp_registry_conflict")

    def test_import_rejects_non_https_url_and_oversized_payload(self):
        with self.assertRaises(McpExternalRegistryError) as url_ctx:
            import_mcp_store_registry({"url": "http://example.test/registry.json"})
        self.assertEqual(url_ctx.exception.code, "mcp_registry_url_invalid")

        def oversized_fetcher(url, timeout, max_bytes):
            self.assertEqual(timeout, 8)
            self.assertEqual(max_bytes, 1048576)
            raise McpExternalRegistryError(
                "mcp_registry_invalid",
                "MCP registry payload is too large",
                400,
            )

        with self.assertRaises(McpExternalRegistryError) as size_ctx:
            import_mcp_store_registry(
                {"url": "https://example.test/registry.json"},
                data_dir=self.data_dir,
                registry_fetcher=oversized_fetcher,
            )
        self.assertEqual(size_ctx.exception.code, "mcp_registry_invalid")

    def test_url_registry_refresh_updates_atomically_and_preserves_stale_on_failure(self):
        first = import_mcp_store_registry(
            {"url": "https://example.test/registry.json"},
            data_dir=self.data_dir,
            now_fn=lambda: 1000.0,
            registry_fetcher=lambda url, timeout, max_bytes: sample_registry(),
        )
        registry_id = first["registry"]["registryId"]

        second_registry = sample_registry("external.second", "mcp.external.second")
        refreshed = refresh_mcp_store_registry(
            registry_id,
            data_dir=self.data_dir,
            now_fn=lambda: 2000.0,
            registry_fetcher=lambda url, timeout, max_bytes: second_registry,
        )
        self.assertEqual(refreshed["registry"]["lastRefreshedAt"], 2000.0)
        entries = list_mcp_store_entries(data_dir=self.data_dir)["entries"]
        self.assertTrue(any(entry["id"] == "external.second" for entry in entries))
        self.assertFalse(any(entry["id"] == "external.sample" for entry in entries))

        failed = refresh_mcp_store_registry(
            registry_id,
            data_dir=self.data_dir,
            now_fn=lambda: 3000.0,
            registry_fetcher=lambda url, timeout, max_bytes: (_ for _ in ()).throw(RuntimeError("network down")),
        )
        self.assertIn("network down", failed["registry"]["lastError"])
        stale_entries = list_mcp_store_entries(data_dir=self.data_dir)["entries"]
        self.assertTrue(any(entry["id"] == "external.second" for entry in stale_entries))

    def test_delete_registry_removes_external_entries(self):
        imported = import_mcp_store_registry(
            {"registry": sample_registry()},
            data_dir=self.data_dir,
        )
        registry_id = imported["registry"]["registryId"]

        result = delete_mcp_store_registry(registry_id, data_dir=self.data_dir)

        self.assertEqual(result, {"ok": True, "registryId": registry_id})
        self.assertEqual(list_mcp_store_registries(data_dir=self.data_dir)["registries"], [])
        self.assertFalse(
            any(
                entry["id"] == "external.sample"
                for entry in list_mcp_store_entries(data_dir=self.data_dir)["entries"]
            )
        )

    def test_approve_one_external_entry_restores_original_installability_only_for_that_entry(self):
        registry_payload = sample_registry()
        registry_payload["entries"].append(
            {
                "id": "external.other",
                "toolkitId": "mcp.external.other",
                "name": "External Other",
                "description": "Second external MCP",
                "category": "dev",
                "installable": True,
                "mcp": {
                    "transport": "stdio",
                    "command": "node",
                    "args": ["other.js"],
                },
            }
        )
        imported = import_mcp_store_registry(
            {"registry": registry_payload},
            data_dir=self.data_dir,
            now_fn=lambda: 1000.0,
        )
        registry_id = imported["registry"]["registryId"]

        with self.assertRaises(McpExternalRegistryError) as ack_ctx:
            approve_mcp_store_entry(
                "external.sample",
                registry_id=registry_id,
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )
        self.assertEqual(ack_ctx.exception.code, "mcp_registry_review_ack_required")

        approved = approve_mcp_store_entry(
            "external.sample",
            registry_id=registry_id,
            data_dir=self.data_dir,
            now_fn=lambda: 1100.0,
            acknowledged_risk=True,
        )["entry"]

        self.assertEqual(approved["approvalStatus"], "approved")
        self.assertEqual(approved["approvedAt"], 1100.0)
        self.assertEqual(approved["trustLevel"], "external_approved")
        self.assertEqual(approved["status"], "available")
        self.assertTrue(approved["installable"])
        self.assertTrue(approved["policySummary"]["reviewed"])
        self.assertEqual(approved["approvedRecipeHash"], approved["recipeHash"])
        self.assertTrue(approved["review"]["acknowledgedRisk"])
        self.assertEqual(
            approved["review"]["approvedRecipeHash"],
            approved["review"]["recipeHash"],
        )
        persisted_approvals = json.loads(
            (self.data_dir / "mcp_external_registry_approvals.json").read_text()
        )
        self.assertTrue(persisted_approvals["approvals"][0]["acknowledged_risk"])
        self.assertIn("review_snapshot", persisted_approvals["approvals"][0])

        entries = list_mcp_store_entries(data_dir=self.data_dir)["entries"]
        other = next(entry for entry in entries if entry["id"] == "external.other")
        self.assertEqual(other["approvalStatus"], "missing")
        self.assertEqual(other["status"], "needs_review")
        self.assertFalse(other["installable"])

        registry = list_mcp_store_registries(data_dir=self.data_dir)["registries"][0]
        self.assertEqual(registry["approvedCount"], 1)
        self.assertEqual(registry["staleApprovalCount"], 0)
        self.assertEqual(
            approved_external_registry_entry(
                "mcp.external.sample",
                data_dir=self.data_dir,
            )["entry_id"],
            "external.sample",
        )

    def test_refresh_with_changed_recipe_marks_approval_stale(self):
        imported = import_mcp_store_registry(
            {"url": "https://example.test/registry.json"},
            data_dir=self.data_dir,
            registry_fetcher=lambda url, timeout, max_bytes: sample_registry(),
        )
        registry_id = imported["registry"]["registryId"]
        approve_mcp_store_entry(
            "external.sample",
            registry_id=registry_id,
            data_dir=self.data_dir,
            now_fn=lambda: 1200.0,
            acknowledged_risk=True,
        )

        changed = sample_registry()
        changed["entries"][0]["mcp"]["url"] = "https://example.test/changed-mcp"
        refresh_mcp_store_registry(
            registry_id,
            data_dir=self.data_dir,
            registry_fetcher=lambda url, timeout, max_bytes: changed,
        )

        entry = next(
            item
            for item in list_mcp_store_entries(data_dir=self.data_dir)["entries"]
            if item["id"] == "external.sample"
        )
        self.assertEqual(entry["approvalStatus"], "stale")
        self.assertTrue(entry["approvalInvalidated"])
        self.assertFalse(entry["installable"])
        self.assertEqual(entry["status"], "needs_review")
        self.assertNotEqual(entry["approvedRecipeHash"], entry["recipeHash"])
        self.assertGreaterEqual(len(entry["review"]["recipeDiff"]), 1)
        self.assertTrue(any(item["path"] == "mcp.url" for item in entry["review"]["recipeDiff"]))

        registry = list_mcp_store_registries(data_dir=self.data_dir)["registries"][0]
        self.assertEqual(registry["approvedCount"], 0)
        self.assertEqual(registry["staleApprovalCount"], 1)

    def test_revoke_and_delete_registry_remove_approvals(self):
        imported = import_mcp_store_registry(
            {"registry": sample_registry()},
            data_dir=self.data_dir,
        )
        registry_id = imported["registry"]["registryId"]
        approve_mcp_store_entry(
            "external.sample",
            registry_id=registry_id,
            data_dir=self.data_dir,
            acknowledged_risk=True,
        )

        revoked = revoke_mcp_store_entry_approval(
            "external.sample",
            registry_id=registry_id,
            data_dir=self.data_dir,
        )

        self.assertEqual(revoked["entryId"], "external.sample")
        self.assertEqual(
            list_mcp_store_registries(data_dir=self.data_dir)["registries"][0]["approvedCount"],
            0,
        )

        approve_mcp_store_entry(
            "external.sample",
            registry_id=registry_id,
            data_dir=self.data_dir,
            acknowledged_risk=True,
        )
        delete_mcp_store_registry(registry_id, data_dir=self.data_dir)
        with self.assertRaises(McpExternalRegistryError) as ctx:
            revoke_mcp_store_entry_approval(
                "external.sample",
                registry_id=registry_id,
                data_dir=self.data_dir,
            )
        self.assertEqual(ctx.exception.code, "mcp_registry_approval_not_found")

    def test_validate_registry_returns_diagnostics_without_persisting(self):
        valid = validate_mcp_store_registry(
            {"registry": sample_registry("external.preview", "mcp.external.preview")},
            data_dir=self.data_dir,
        )

        self.assertTrue(valid["valid"])
        self.assertEqual(valid["count"], 1)
        self.assertEqual(valid["entries"][0]["id"], "external.preview")
        self.assertEqual(valid["entries"][0]["trustLevel"], "external_review")
        self.assertIn("review", valid["entries"][0])
        self.assertFalse((self.data_dir / "mcp_external_registries.json").exists())

        invalid_registry = sample_registry("external.invalid", "mcp.external.invalid")
        invalid_registry["entries"][0]["mcp"]["url"] = "http://example.test/mcp"
        invalid = validate_mcp_store_registry(
            {"registry": invalid_registry},
            data_dir=self.data_dir,
        )

        self.assertFalse(invalid["valid"])
        self.assertEqual(invalid["status"], "invalid")
        self.assertGreaterEqual(len(invalid["diagnostics"]), 1)
        diagnostic = invalid["diagnostics"][0]
        self.assertEqual(diagnostic["severity"], "error")
        self.assertIn("path", diagnostic)
        self.assertEqual(diagnostic["entryId"], "external.invalid")


class McpExternalRegistryRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = miso_app.create_app().test_client()

    def test_routes_proxy_registry_services(self):
        with mock.patch.object(
            miso_routes,
            "list_mcp_store_entries",
            return_value={"entries": [{"id": "external.sample"}], "count": 1},
        ):
            self.assertEqual(
                self.client.get("/mcp/store/entries").get_json()["count"],
                1,
            )

        with mock.patch.object(
            miso_routes,
            "list_mcp_store_registries",
            return_value={"registries": [], "count": 0},
        ):
            self.assertEqual(
                self.client.get("/mcp/store/registries").get_json()["count"],
                0,
            )

        with mock.patch.object(
            miso_routes,
            "import_mcp_store_registry",
            return_value={"registry": {"registryId": "registry.test"}},
        ) as imported:
            response = self.client.post(
                "/mcp/store/registries/import",
                json={"registry": {"version": 1, "entries": []}},
            )
        self.assertEqual(response.status_code, 200)
        imported.assert_called_once()

        with mock.patch.object(
            miso_routes,
            "approve_mcp_store_entry",
            return_value={"entry": {"id": "external.sample", "approvalStatus": "approved"}},
        ) as approved:
            response = self.client.post(
                "/mcp/store/entries/external.sample/approve",
                json={"registryId": "registry.test", "acknowledgedRisk": True},
            )
        self.assertEqual(response.status_code, 200)
        approved.assert_called_once()
        self.assertTrue(approved.call_args.kwargs["acknowledged_risk"])

        with mock.patch.object(
            miso_routes,
            "validate_mcp_store_registry",
            return_value={"valid": True, "entries": [], "diagnostics": []},
        ) as validated:
            response = self.client.post(
                "/mcp/store/registries/validate",
                json={"registry": {"version": 1, "entries": []}},
            )
        self.assertEqual(response.status_code, 200)
        validated.assert_called_once()

        with mock.patch.object(
            miso_routes,
            "revoke_mcp_store_entry_approval",
            return_value={"ok": True, "entryId": "external.sample"},
        ) as revoked:
            response = self.client.delete(
                "/mcp/store/entries/external.sample/approval",
                json={"registryId": "registry.test"},
            )
        self.assertEqual(response.status_code, 200)
        revoked.assert_called_once()

    def test_route_errors_are_stable(self):
        with mock.patch.object(
            miso_routes,
            "refresh_mcp_store_registry",
            side_effect=McpExternalRegistryError(
                "mcp_registry_not_found",
                "Registry not found",
                404,
            ),
        ):
            response = self.client.post("/mcp/store/registries/missing/refresh")

        payload = response.get_json()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(payload["error"]["code"], "mcp_registry_not_found")


if __name__ == "__main__":
    unittest.main()
