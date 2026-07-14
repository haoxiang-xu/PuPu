"""F3 (SEC-001 P2, /守 MEDIUM) tests: tool-result image base64 must never land in
the on-disk session transcript, while transcript replay/resume stays intact.

Covers the hard red line (no base64 in the persisted JSON — messages AND the
nested execution_checkpoint transcript), round-trip re-hydration within the media
TTL, and graceful text-placeholder degradation when the media has expired.
"""

from __future__ import annotations

import base64
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import session_transcript_media as stm

# A recognisably "long" base64 payload (2 KB of bytes) so a substring assertion
# is unambiguous.
_RAW_BYTES = bytes(range(256)) * 8  # 2048 bytes
_BIG_B64 = base64.b64encode(_RAW_BYTES).decode("ascii")


def _image_block(b64=_BIG_B64, w=1512, h=982):
    return {
        "type": "image",
        "media_type": "image/png",
        "data_b64": b64,
        "width": w,
        "height": h,
    }


def _state_with_screenshots():
    """A session state carrying a screenshot in the live messages AND inside the
    nested execution_checkpoint transcript / replay_frame (mirrors what
    build_execution_checkpoint persists)."""
    return {
        "summary": "a session",
        "messages": [
            {"role": "user", "content": "take a screenshot"},
            {
                "role": "tool",
                "content": {
                    "content_blocks": [
                        {"type": "text", "text": "screenshot 1512x982 px"},
                        _image_block(),
                    ],
                    "ok": True,
                    "action": "screenshot",
                },
            },
        ],
        "execution_checkpoint": {
            "status": "awaiting_human_input",
            "transcript": [
                {"role": "tool", "content": {"content_blocks": [_image_block()]}},
            ],
            "replay_frame": {"pending": [_image_block(w=800, h=600)]},
        },
    }


class _StoreHarness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="f3_")
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))
        # tool_media_store keys its root off UNCHAIN_DATA_DIR.
        self.env = mock.patch.dict("os.environ", {"UNCHAIN_DATA_DIR": self.tmp}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.base_dir = str(Path(self.tmp) / "sessions")
        self.store = stm.build_sanitizing_session_store(self.base_dir)

    def _raw_disk_text(self, session_id):
        path = self.store._path(session_id)
        return Path(path).read_text(encoding="utf-8")


class DiskRedactionTests(_StoreHarness):
    def test_no_base64_anywhere_in_persisted_json(self):
        # THE F3 RED CASE: after save, the on-disk JSON has no image base64 —
        # neither in messages nor in the nested checkpoint transcript.
        self.store.save("sess-1", _state_with_screenshots())
        text = self._raw_disk_text("sess-1")
        self.assertNotIn("data_b64", text)
        self.assertNotIn(_BIG_B64, text)
        # The reference marker replaced it (media_id is a 32-hex token).
        self.assertIn("data_omitted", text)
        self.assertIn("media_id", text)
        # Non-image content survives.
        self.assertIn("screenshot 1512x982 px", text)

    def test_save_variants_all_strip(self):
        for method, args in (
            ("save", ()),
            ("save_if_revision", (0,)),
        ):
            with self.subTest(method=method):
                sid = f"sess-{method}"
                getattr(self.store, method)(sid, _state_with_screenshots(), *args)
                self.assertNotIn(_BIG_B64, self._raw_disk_text(sid))

    def test_strip_does_not_mutate_caller_state(self):
        state = _state_with_screenshots()
        stripped = stm.strip_transcript_media(state, "sess-x")
        # caller's live transcript keeps its base64 (running agent may need it)
        self.assertEqual(state["messages"][1]["content"]["content_blocks"][1]["data_b64"], _BIG_B64)
        self.assertIsNot(stripped, state)
        self.assertNotIn("data_b64", stripped["messages"][1]["content"]["content_blocks"][1])

    def test_text_only_state_untouched(self):
        state = {"messages": [{"role": "user", "content": "hi"}], "summary": "s"}
        out = stm.strip_transcript_media(state, "sess")
        self.assertIs(out, state)  # no copy when there is nothing to strip


class RoundTripTests(_StoreHarness):
    def test_load_rehydrates_within_ttl(self):
        self.store.save("sess-rt", _state_with_screenshots())
        loaded = self.store.load("sess-rt")
        block = loaded["messages"][1]["content"]["content_blocks"][1]
        self.assertEqual(block["type"], "image")
        self.assertEqual(block["data_b64"], _BIG_B64)  # exact bytes recovered
        self.assertNotIn("data_omitted", block)
        # nested checkpoint transcript rehydrated too
        cp_block = loaded["execution_checkpoint"]["transcript"][0]["content"]["content_blocks"][0]
        self.assertEqual(cp_block["data_b64"], _BIG_B64)

    def test_expired_media_degrades_to_text_placeholder(self):
        self.store.save("sess-exp", _state_with_screenshots())
        # Simulate TTL expiry / eviction: wipe the media dir.
        shutil.rmtree(Path(self.tmp) / "tool_media", ignore_errors=True)
        loaded = self.store.load("sess-exp")
        block = loaded["messages"][1]["content"]["content_blocks"][1]
        self.assertEqual(block["type"], "text")  # coherent placeholder, not a broken image
        self.assertNotIn("data_b64", block)
        self.assertIn("1512x982", block["text"])
        self.assertIn("no longer available", block["text"])


class RehydrateUnitTests(unittest.TestCase):
    def test_rehydrate_tolerates_non_dict(self):
        self.assertEqual(stm.rehydrate_transcript_media("nope", "s"), "nope")
        self.assertEqual(stm.rehydrate_transcript_media(None, "s"), None)

    def test_marker_without_media_id_becomes_placeholder(self):
        state = {"content_blocks": [{"type": "image", "data_omitted": True, "width": 4, "height": 4}]}
        stm.rehydrate_transcript_media(state, "s")
        block = state["content_blocks"][0]
        self.assertEqual(block["type"], "text")
        self.assertIn("4x4", block["text"])


if __name__ == "__main__":
    unittest.main()
