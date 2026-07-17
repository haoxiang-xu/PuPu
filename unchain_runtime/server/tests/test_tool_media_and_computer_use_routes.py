"""C4 — tool-media store + computer-use HTTP endpoints.

Covers: media store roundtrip, TTL expiry, path-traversal / malformed-id
rejection, session scoping; the adapter redaction choke now leaving a media_id
while STILL stripping base64 (fail-closed red line held); and both new routes
(tool-media serve/404, computer-use/status shape).
"""

import base64
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import tool_media_store  # noqa: E402

# A 1x1 transparent PNG (valid image bytes for content-type roundtrip).
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
_PNG_1x1_B64 = base64.b64encode(_PNG_1x1).decode("ascii")
_COMPUTER_TOOLKIT_META = {
    "computer": {
        "toolkit_id": "builtin.computer",
        "toolkit_name": "ComputerToolkit",
    }
}


class _MediaDirTestCase(unittest.TestCase):
    """Isolate every test's storage into its own temp UNCHAIN_DATA_DIR."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._prev_env = {
            "UNCHAIN_DATA_DIR": os.environ.get("UNCHAIN_DATA_DIR"),
            "PUPU_TOOL_MEDIA_TTL_SECONDS": os.environ.get("PUPU_TOOL_MEDIA_TTL_SECONDS"),
        }
        os.environ["UNCHAIN_DATA_DIR"] = self._tmp.name
        os.environ.pop("PUPU_TOOL_MEDIA_TTL_SECONDS", None)
        self.addCleanup(self._restore_env)

    def _restore_env(self):
        for key, value in self._prev_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


class ToolMediaStoreTests(_MediaDirTestCase):
    def test_store_then_resolve_roundtrip(self):
        media_id = tool_media_store.store_media("sess-1", _PNG_1x1_B64, "image/png")
        self.assertIsInstance(media_id, str)
        self.assertRegex(media_id, r"^[0-9a-f]{32}$")

        resolved = tool_media_store.resolve_media(media_id)
        self.assertIsNotNone(resolved)
        data, media_type = resolved
        self.assertEqual(data, _PNG_1x1)
        self.assertEqual(media_type, "image/png")

    def test_resolve_scoped_to_correct_session(self):
        media_id = tool_media_store.store_media("sess-A", _PNG_1x1_B64, "image/png")
        # Right session resolves.
        self.assertIsNotNone(tool_media_store.resolve_media(media_id, "sess-A"))
        # Wrong session does not (binding).
        self.assertIsNone(tool_media_store.resolve_media(media_id, "sess-B"))
        # Unscoped glob still finds it.
        self.assertIsNotNone(tool_media_store.resolve_media(media_id, None))

    def test_ttl_expiry_deletes_and_returns_none(self):
        os.environ["PUPU_TOOL_MEDIA_TTL_SECONDS"] = "1"
        media_id = tool_media_store.store_media("sess-ttl", _PNG_1x1_B64, "image/png")
        # Backdate the file mtime beyond TTL.
        root = Path(os.environ["UNCHAIN_DATA_DIR"]) / "tool_media"
        files = list(root.glob(f"*/{media_id}.*"))
        self.assertEqual(len(files), 1)
        old = time.time() - 10
        os.utime(files[0], (old, old))
        # Read-time TTL: expired => None + file deleted.
        self.assertIsNone(tool_media_store.resolve_media(media_id))
        self.assertFalse(files[0].exists())

    def test_malformed_media_id_rejected(self):
        self.assertIsNone(tool_media_store.resolve_media("not-a-uuid"))
        self.assertIsNone(tool_media_store.resolve_media(""))
        self.assertIsNone(tool_media_store.resolve_media("../etc/passwd"))
        self.assertIsNone(tool_media_store.resolve_media("a" * 31))  # too short
        self.assertIsNone(tool_media_store.resolve_media("g" * 32))  # non-hex

    def test_store_rejects_empty_and_bad_payload(self):
        self.assertIsNone(tool_media_store.store_media("s", "", "image/png"))
        self.assertIsNone(tool_media_store.store_media("s", None, "image/png"))

    def test_sweep_session_removes_expired(self):
        os.environ["PUPU_TOOL_MEDIA_TTL_SECONDS"] = "1"
        media_id = tool_media_store.store_media("sweepme", _PNG_1x1_B64, "image/png")
        root = Path(os.environ["UNCHAIN_DATA_DIR"]) / "tool_media"
        f = list(root.glob(f"*/{media_id}.*"))[0]
        old = time.time() - 10
        os.utime(f, (old, old))
        tool_media_store.sweep_session("sweepme")
        self.assertFalse(f.exists())

    def test_jpeg_media_type_roundtrip(self):
        media_id = tool_media_store.store_media("s", _PNG_1x1_B64, "image/jpeg")
        data, media_type = tool_media_store.resolve_media(media_id)
        self.assertEqual(media_type, "image/jpeg")


class AdapterRedactionMediaTests(_MediaDirTestCase):
    """The redaction choke must still strip base64 AND now stamp a media_id."""

    def _image_result_event(self):
        return {
            "type": "tool_result",
            "tool_name": "computer",
            "result": {
                "content_blocks": [
                    {
                        "type": "image",
                        "media_type": "image/png",
                        "data_b64": _PNG_1x1_B64,
                        "width": 1512,
                        "height": 982,
                    },
                    {"type": "text", "text": "screenshot 1512x982 px"},
                ],
                "ok": True,
                "action": "screenshot",
            },
        }

    def test_redaction_strips_base64_and_adds_media_id(self):
        import unchain_adapter

        event = self._image_result_event()
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
            event, _COMPUTER_TOOLKIT_META, "sess-redact"
        )
        image = enriched["result"]["content_blocks"][0]
        # fail-closed: base64 gone, marker present
        self.assertNotIn("data_b64", image)
        self.assertTrue(image["data_omitted"])
        self.assertGreater(image["byte_len"], 0)
        # C4: media_id wired, and it fetches back to the original bytes
        self.assertRegex(image["media_id"], r"^[0-9a-f]{32}$")
        resolved = tool_media_store.resolve_media(image["media_id"], "sess-redact")
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved[0], _PNG_1x1)

    def test_no_base64_anywhere_after_redaction(self):
        import json

        import unchain_adapter

        event = self._image_result_event()
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
            event, _COMPUTER_TOOLKIT_META, "sess-redact-2"
        )
        self.assertNotIn(_PNG_1x1_B64, json.dumps(enriched))


class ComputerUseRouteTests(_MediaDirTestCase):
    def setUp(self):
        super().setUp()
        import app as miso_app

        self.app = miso_app.create_app()
        self.client = self.app.test_client()

    def test_tool_media_serves_stored_png(self):
        media_id = tool_media_store.store_media("route-sess", _PNG_1x1_B64, "image/png")
        resp = self.client.get(f"/chat/tool-media/{media_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.mimetype, "image/png")
        self.assertEqual(resp.data, _PNG_1x1)
        self.assertIn("no-store", resp.headers.get("Cache-Control", ""))

    def test_tool_media_session_scope_query(self):
        media_id = tool_media_store.store_media("route-sess", _PNG_1x1_B64, "image/png")
        # correct scope: 200
        ok = self.client.get(f"/chat/tool-media/{media_id}?session_id=route-sess")
        self.assertEqual(ok.status_code, 200)
        # wrong scope: 404
        bad = self.client.get(f"/chat/tool-media/{media_id}?session_id=other")
        self.assertEqual(bad.status_code, 404)

    def test_tool_media_missing_is_404(self):
        resp = self.client.get(f"/chat/tool-media/{'0' * 32}")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.get_json()["error"]["code"], "media_not_found")

    def test_tool_media_malformed_id_is_404(self):
        resp = self.client.get("/chat/tool-media/not-a-real-id")
        self.assertEqual(resp.status_code, 404)

    def test_status_endpoint_shape(self):
        os.environ["PUPU_COMPUTER_USE"] = "1"
        try:
            resp = self.client.get("/computer-use/status")
        finally:
            os.environ.pop("PUPU_COMPUTER_USE", None)
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertTrue(body["enabled"])
        caps = body["capabilities"]
        for key in (
            "platform",
            "display_server",
            "screenshot",
            "injection",
            "permissions",
            "degradation_reason",
            "action_set",
            "caveats",
        ):
            self.assertIn(key, caps)
        self.assertIn("screen_recording", caps["permissions"])
        self.assertIn("accessibility", caps["permissions"])

    def test_status_reflects_flag_off(self):
        os.environ.pop("PUPU_COMPUTER_USE", None)
        resp = self.client.get("/computer-use/status")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.get_json()["enabled"])


if __name__ == "__main__":
    unittest.main()
