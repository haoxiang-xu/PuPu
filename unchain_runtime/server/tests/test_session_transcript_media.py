"""F3 (SEC-001 P2, /守 MEDIUM) tests: tool-result image base64 must never land in
the on-disk session transcript, while transcript replay/resume stays intact.

Covers the hard red line (no base64 in the persisted JSON — messages AND the
nested execution_checkpoint transcript), round-trip re-hydration within the media
TTL, and graceful text-placeholder degradation when the media has expired.
"""

from __future__ import annotations

import base64
import copy
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
_USER_ATTACHMENT_B64 = base64.b64encode(b"durable-user-attachment").decode("ascii")


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


def _state_with_anthropic_screenshot():
    """Build the provider transcript through the production message builder.

    Anthropic converts the host's flat ``data_b64`` block into a nested
    ``source.data`` field before memory persistence, so hand-written flat
    fixtures alone cannot prove the production leak is closed.
    """
    from unchain.kernel.types import ToolCall
    from unchain.tools.messages import AnthropicMessageBuilder

    result_messages = AnthropicMessageBuilder().build_tool_result_messages(
        tool_call=ToolCall(call_id="toolu-screenshot", name="computer", arguments={}),
        tool_result={
            "content_blocks": [
                {"type": "text", "text": "screenshot 1512x982 px"},
                _image_block(),
            ],
            "ok": True,
        },
    )
    messages = [
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu-screenshot",
                    "name": "computer",
                    "input": {"action": "screenshot"},
                }
            ],
        },
        *result_messages,
    ]
    return {
        "messages": messages,
        "execution_checkpoint": {
            "status": "awaiting_human_input",
            "transcript": copy.deepcopy(messages),
            "provider_replay_frame": {"messages": copy.deepcopy(messages)},
        },
    }


def _state_with_unrelated_anthropic_image_tool():
    from unchain.kernel.types import ToolCall
    from unchain.tools.messages import AnthropicMessageBuilder

    result_messages = AnthropicMessageBuilder().build_tool_result_messages(
        tool_call=ToolCall(call_id="toolu-render", name="render_image", arguments={}),
        tool_result={
            "content_blocks": [
                {"type": "text", "text": "rendered image"},
                _image_block(),
            ],
            "ok": True,
        },
    )
    return {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu-render",
                        "name": "render_image",
                        "input": {},
                    }
                ],
            },
            *result_messages,
        ]
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

        sid = "sess-save_if_revision_and_fence"
        owner_id = "owner-fenced"
        lease = self.store.acquire_lease(sid, owner_id, 60_000, expected_revision=0)
        self.store.save_if_revision_and_fence(
            sid,
            _state_with_screenshots(),
            0,
            execution_id=sid,
            owner_id=owner_id,
            fencing_token=lease.fencing_token,
        )
        self.assertNotIn(_BIG_B64, self._raw_disk_text(sid))

    def test_cancellation_aware_save_variants_strip_anthropic_shape(self):
        live_sid = "sess-cancellation-aware-live"
        self.store.save_if_revision_and_execution_not_cancelled(
            live_sid,
            _state_with_anthropic_screenshot(),
            0,
            execution_id=live_sid,
            owner_id="owner-live",
        )
        live_text = self._raw_disk_text(live_sid)
        self.assertNotIn(_BIG_B64, live_text)
        self.assertNotIn('"data":', live_text)
        self.assertIn("data_omitted", live_text)

        cancelled_sid = "sess-cancellation-aware-cancelled"
        owner_id = "owner-cancelled"
        self.store.request_execution_cancel(cancelled_sid, owner_id, reason="test")
        self.store.save_if_revision_and_execution_cancelled(
            cancelled_sid,
            _state_with_anthropic_screenshot(),
            0,
            execution_id=cancelled_sid,
            owner_id=owner_id,
        )
        cancelled_text = self._raw_disk_text(cancelled_sid)
        self.assertNotIn(_BIG_B64, cancelled_text)
        self.assertNotIn('"data":', cancelled_text)
        self.assertIn("data_omitted", cancelled_text)

    def test_real_anthropic_builder_shape_round_trips_exactly(self):
        state = _state_with_anthropic_screenshot()
        expected = copy.deepcopy(state)

        self.store.save("sess-anthropic", state)
        raw_text = self._raw_disk_text("sess-anthropic")
        self.assertNotIn(_BIG_B64, raw_text)
        self.assertNotIn('"data":', raw_text)
        self.assertIn("data_omitted", raw_text)
        # Sanitizing a persisted copy must not damage the live model transcript.
        self.assertEqual(state, expected)

        loaded = self.store.load("sess-anthropic")
        self.assertEqual(loaded, expected)

    def test_user_image_attachment_is_not_treated_as_computer_output(self):
        state = _state_with_anthropic_screenshot()
        state["messages"].insert(
            0,
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": _USER_ATTACHMENT_B64,
                        },
                    }
                ],
            },
        )
        expected = copy.deepcopy(state)

        self.store.save("sess-user-image", state)
        raw_text = self._raw_disk_text("sess-user-image")
        self.assertIn(_USER_ATTACHMENT_B64, raw_text)
        self.assertNotIn(_BIG_B64, raw_text)
        self.assertEqual(self.store.load("sess-user-image"), expected)

    def test_unrelated_rich_image_tool_is_not_sanitized(self):
        state = _state_with_unrelated_anthropic_image_tool()
        expected = copy.deepcopy(state)

        self.store.save("sess-render-image", state)
        raw_text = self._raw_disk_text("sess-render-image")

        self.assertIn(_BIG_B64, raw_text)
        self.assertNotIn("data_omitted", raw_text)
        self.assertEqual(self.store.load("sess-render-image"), expected)

    def test_unrelated_flat_tool_result_is_not_sanitized(self):
        state = {
            "events": [
                {
                    "type": "tool_result",
                    "toolkit_id": "mcp.image.generator",
                    "tool_name": "render_image",
                    "call_id": "call-render",
                    "result": {"content_blocks": [_image_block()]},
                }
            ]
        }

        self.store.save("sess-flat-render-image", state)
        raw_text = self._raw_disk_text("sess-flat-render-image")

        self.assertIn(_BIG_B64, raw_text)
        self.assertNotIn("data_omitted", raw_text)

    def test_media_store_failure_still_saves_without_inline_base64(self):
        for suffix, state in (
            ("flat", _state_with_screenshots()),
            ("anthropic", _state_with_anthropic_screenshot()),
        ):
            with self.subTest(shape=suffix), mock.patch(
                "tool_media_store.store_media",
                side_effect=OSError("media directory unavailable"),
            ):
                session_id = f"sess-store-failure-{suffix}"
                self.store.save(session_id, state)
                raw_text = self._raw_disk_text(session_id)
                self.assertNotIn(_BIG_B64, raw_text)
                self.assertIn("data_omitted", raw_text)

                loaded = self.store.load(session_id)
                self.assertIn("no longer available", str(loaded))

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

    def test_disabled_sanitization_preserves_new_writes_without_resurrecting_old_media(self):
        state = _state_with_anthropic_screenshot()
        self.store.save("sess-existing-marker", state)

        disabled_store = stm.build_sanitizing_session_store(
            str(Path(self.tmp) / "sessions-disabled"),
            sanitize_enabled=False,
        )
        disabled_store.save("sess-disabled", state)
        raw_text = Path(disabled_store._path("sess-disabled")).read_text(encoding="utf-8")
        self.assertIn(_BIG_B64, raw_text)

        disabled_existing_store = stm.build_sanitizing_session_store(
            self.base_dir,
            sanitize_enabled=False,
        )
        loaded = disabled_existing_store.load("sess-existing-marker")
        self.assertNotIn(_BIG_B64, str(loaded))
        self.assertIn("no longer available", str(loaded))

        disabled_existing_store.save("sess-existing-marker", loaded)
        rewritten = Path(
            disabled_existing_store._path("sess-existing-marker")
        ).read_text(encoding="utf-8")
        self.assertNotIn(_BIG_B64, rewritten)


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
