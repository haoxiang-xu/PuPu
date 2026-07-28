"""Gate B — runtime-writable computer-use flag.

Covers:
  * ``computer_use_flag`` precedence (override wins over env; None defers to env)
    and strict-bool validation of ``set_runtime_override``.
  * The three delegating call sites (``unchain_adapter._computer_use_enabled``,
    ``memory_factory._computer_use_enabled``, and the status route) all following
    a single runtime flip.
  * ``POST /computer-use/config`` auth (401), strict-bool body validation (400),
    the happy path, and status reflecting the flip in the same process.
  * memory_factory's session-store sanitization tracking the runtime value —
    the data-hygiene red line (screenshots must not land in memory un-redacted
    once the tool gate is on / off).
"""

import base64
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import computer_use_flag  # noqa: E402

_FEATURE_FLAG = "PUPU_FEATURE_COMPUTER_USE"
_FLAG = "PUPU_COMPUTER_USE"
_LOCAL_FLAG = "PUPU_COMPUTER_USE_LOCAL_BETA"

_RAW = b"screenshot-bytes-for-gate-b-test" * 4
_B64 = base64.b64encode(_RAW).decode("ascii")


def _state_with_image():
    return {
        "summary": "s",
        "messages": [
            {"role": "user", "content": "take a screenshot"},
            {
                "role": "tool",
                "content": {
                    "content_blocks": [
                        {"type": "text", "text": "screenshot 10x10 px"},
                        {
                            "type": "image",
                            "media_type": "image/png",
                            "data_b64": _B64,
                            "width": 10,
                            "height": 10,
                        },
                    ],
                    "ok": True,
                    "action": "screenshot",
                },
            },
        ],
    }


class _FlagIsolationMixin:
    """Reset the process-global override + env after every test."""

    def _isolate_flag(self):
        prev_env = os.environ.get(_FLAG)
        prev_feature_env = os.environ.get(_FEATURE_FLAG)
        prev_local_env = os.environ.get(_LOCAL_FLAG)
        prev_override = computer_use_flag.get_runtime_override()
        prev_local_override = computer_use_flag.get_local_beta_runtime_override()

        def _restore():
            computer_use_flag.set_runtime_override(prev_override)
            computer_use_flag.set_local_beta_runtime_override(prev_local_override)
            if prev_env is None:
                os.environ.pop(_FLAG, None)
            else:
                os.environ[_FLAG] = prev_env
            if prev_feature_env is None:
                os.environ.pop(_FEATURE_FLAG, None)
            else:
                os.environ[_FEATURE_FLAG] = prev_feature_env
            if prev_local_env is None:
                os.environ.pop(_LOCAL_FLAG, None)
            else:
                os.environ[_LOCAL_FLAG] = prev_local_env

        self.addCleanup(_restore)
        # Start every test from a known-clean gate.
        computer_use_flag.set_runtime_override(None)
        computer_use_flag.set_local_beta_runtime_override(None)
        os.environ.pop(_FLAG, None)
        os.environ.pop(_LOCAL_FLAG, None)
        # Gate-B tests exercise the user toggle beneath an available release.
        os.environ[_FEATURE_FLAG] = "1"

    def _set_env(self, value):
        if value is None:
            os.environ.pop(_FLAG, None)
        else:
            os.environ[_FLAG] = value


class ComputerUseFlagPrecedenceTests(_FlagIsolationMixin, unittest.TestCase):
    def setUp(self):
        self._isolate_flag()

    def test_override_none_follows_env(self):
        # env unset => off
        self.assertFalse(computer_use_flag.is_enabled())
        # env truthy vocabulary => on
        for truthy in ("1", "true", "yes", "on", "enabled", "TRUE", " On "):
            self._set_env(truthy)
            self.assertTrue(
                computer_use_flag.is_enabled(), f"env={truthy!r} should enable"
            )
        # env falsy string => off
        self._set_env("0")
        self.assertFalse(computer_use_flag.is_enabled())
        self._set_env("false")
        self.assertFalse(computer_use_flag.is_enabled())

    def test_release_flag_defaults_off_and_cannot_be_bypassed(self):
        os.environ.pop(_FEATURE_FLAG, None)
        self._set_env("1")
        computer_use_flag.set_runtime_override(True)
        computer_use_flag.set_local_beta_runtime_override(True)

        self.assertFalse(computer_use_flag.is_feature_available())
        self.assertFalse(computer_use_flag.is_enabled())
        self.assertFalse(computer_use_flag.is_local_beta_enabled())

    def test_release_flag_accepts_shared_truthy_vocabulary(self):
        for truthy in ("1", "true", "yes", "on", "enabled", "TRUE", " On "):
            os.environ[_FEATURE_FLAG] = truthy
            self.assertTrue(computer_use_flag.is_feature_available())

    def test_override_false_beats_env_on(self):
        self._set_env("1")
        computer_use_flag.set_runtime_override(False)
        self.assertFalse(computer_use_flag.is_enabled())

    def test_override_true_with_env_unset(self):
        self._set_env(None)
        computer_use_flag.set_runtime_override(True)
        self.assertTrue(computer_use_flag.is_enabled())

    def test_override_true_beats_env_off(self):
        self._set_env("0")
        computer_use_flag.set_runtime_override(True)
        self.assertTrue(computer_use_flag.is_enabled())

    def test_clearing_override_restores_env_default(self):
        self._set_env("1")
        computer_use_flag.set_runtime_override(False)
        self.assertFalse(computer_use_flag.is_enabled())
        computer_use_flag.set_runtime_override(None)
        self.assertTrue(computer_use_flag.is_enabled())

    def test_set_runtime_override_rejects_non_bool(self):
        for bad in (1, 0, "true", "false", "", [], {}, 1.0):
            with self.assertRaises(TypeError):
                computer_use_flag.set_runtime_override(bad)
        # sanity: the rejected calls left the override untouched (still None)
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_delegates_follow_the_runtime_flip(self):
        import unchain_adapter
        import memory_factory

        computer_use_flag.set_runtime_override(True)
        self.assertTrue(unchain_adapter._computer_use_enabled())
        self.assertTrue(memory_factory._computer_use_enabled())

        computer_use_flag.set_runtime_override(False)
        self.assertFalse(unchain_adapter._computer_use_enabled())
        self.assertFalse(memory_factory._computer_use_enabled())


class ComputerUseConfigRouteTests(_FlagIsolationMixin, unittest.TestCase):
    def setUp(self):
        self._isolate_flag()
        # Give the app a real token so the 401 path is exercisable.
        self._prev_token = os.environ.get("UNCHAIN_AUTH_TOKEN")
        os.environ["UNCHAIN_AUTH_TOKEN"] = "gate-b-secret"
        self.addCleanup(self._restore_token)

        import app as miso_app

        self.app = miso_app.create_app()
        self.client = self.app.test_client()
        self._auth = {"x-unchain-auth": "gate-b-secret"}

    def _restore_token(self):
        if self._prev_token is None:
            os.environ.pop("UNCHAIN_AUTH_TOKEN", None)
        else:
            os.environ["UNCHAIN_AUTH_TOKEN"] = self._prev_token

    def _post(self, body, *, auth=True, raw=None):
        headers = dict(self._auth) if auth else {}
        if raw is not None:
            return self.client.post(
                "/computer-use/config",
                data=raw,
                content_type="application/json",
                headers=headers,
            )
        return self.client.post("/computer-use/config", json=body, headers=headers)

    def test_missing_token_is_401(self):
        resp = self._post({"enabled": True}, auth=False)
        self.assertEqual(resp.status_code, 401)
        # Nothing was flipped.
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_enable_true_happy_path(self):
        resp = self._post({"enabled": True})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json()["enabled"])
        self.assertIs(computer_use_flag.get_runtime_override(), True)

    def test_enable_false_happy_path(self):
        os.environ[_FLAG] = "1"  # env says on; override must win
        resp = self._post({"enabled": False})
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.get_json()["enabled"])
        self.assertIs(computer_use_flag.get_runtime_override(), False)

    def test_local_beta_flag_is_independent_and_strict(self):
        enabled = self._post({"local_beta_enabled": True})
        self.assertEqual(enabled.status_code, 200)
        self.assertTrue(enabled.get_json()["local_beta_enabled"])
        self.assertTrue(computer_use_flag.is_local_beta_enabled())
        self.assertIsNone(computer_use_flag.get_runtime_override())

        invalid = self._post({"enabled": True, "local_beta_enabled": "true"})
        self.assertEqual(invalid.status_code, 400)
        # Validate the whole config before applying any field.
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_truthy_string_is_400(self):
        resp = self._post({"enabled": "true"})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["error"]["code"], "invalid_request")
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_number_one_is_400(self):
        resp = self._post({"enabled": 1})
        self.assertEqual(resp.status_code, 400)
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_null_enabled_is_400(self):
        resp = self._post({"enabled": None})
        self.assertEqual(resp.status_code, 400)
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_missing_key_is_400(self):
        resp = self._post({"nope": True})
        self.assertEqual(resp.status_code, 400)
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_non_object_body_is_400(self):
        resp = self._post(None, raw="[]")
        self.assertEqual(resp.status_code, 400)
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_garbage_body_is_400(self):
        resp = self._post(None, raw="not json")
        self.assertEqual(resp.status_code, 400)
        self.assertIsNone(computer_use_flag.get_runtime_override())

    def test_post_then_status_reflects_in_same_process(self):
        # Flip on, status must report enabled True.
        on = self._post({"enabled": True})
        self.assertEqual(on.status_code, 200)
        status = self.client.get("/computer-use/status", headers=self._auth)
        self.assertEqual(status.status_code, 200)
        self.assertTrue(status.get_json()["enabled"])
        self.assertTrue(status.get_json()["feature_available"])

        # Flip off, status must report enabled False even if env said on.
        os.environ[_FLAG] = "1"
        off = self._post({"enabled": False})
        self.assertEqual(off.status_code, 200)
        status2 = self.client.get("/computer-use/status", headers=self._auth)
        self.assertFalse(status2.get_json()["enabled"])

    def test_release_flag_off_keeps_desire_but_effective_state_off(self):
        os.environ.pop(_FEATURE_FLAG, None)
        response = self._post({"enabled": True, "local_beta_enabled": True})

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertFalse(body["feature_available"])
        self.assertFalse(body["enabled"])
        self.assertFalse(body["local_beta_enabled"])
        self.assertEqual(body["reason"], "feature_flag_disabled")
        self.assertIs(computer_use_flag.get_runtime_override(), True)

    def test_local_probe_requires_beta_and_returns_probe_result(self):
        disabled = self.client.post(
            "/computer-use/probe",
            json={"model": "qwen3.5:4b", "force": True},
            headers=self._auth,
        )
        self.assertEqual(disabled.status_code, 409)

        self._post({"local_beta_enabled": True})
        with mock.patch(
            "computer_use_probe.probe_local_model",
            return_value={
                "supported": False,
                "model": "qwen3.5:4b",
                "reason": "missing_vision_or_tools",
            },
        ):
            result = self.client.post(
                "/computer-use/probe",
                json={"model": "qwen3.5:4b", "force": True},
                headers=self._auth,
            )
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.get_json()["supported"])


class MemoryFactorySanitizeFollowsFlagTests(_FlagIsolationMixin, unittest.TestCase):
    """The screenshot-sanitization red line: flipping the runtime flag must change
    what a freshly constructed session store persists to disk."""

    def setUp(self):
        self._isolate_flag()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._prev_data_dir = os.environ.get("UNCHAIN_DATA_DIR")
        os.environ["UNCHAIN_DATA_DIR"] = self._tmp.name
        self.addCleanup(self._restore_data_dir)

    def _restore_data_dir(self):
        if self._prev_data_dir is None:
            os.environ.pop("UNCHAIN_DATA_DIR", None)
        else:
            os.environ["UNCHAIN_DATA_DIR"] = self._prev_data_dir

    def _raw_session_file(self, session_id):
        sessions = Path(self._tmp.name) / "memory" / "sessions"
        matches = list(sessions.rglob("*"))
        blobs = [p.read_text() for p in matches if p.is_file()]
        joined = "\n".join(blobs)
        return joined

    def test_flag_off_persists_screenshot_bytes(self):
        import memory_factory

        computer_use_flag.set_runtime_override(False)
        store = memory_factory._build_session_store(self._tmp.name)
        store.save("sess-off", _state_with_image())
        raw = self._raw_session_file("sess-off")
        # Sanitize disabled => base64 kept inline (pre-feature behavior).
        self.assertIn(_B64, raw)

    def test_flag_on_strips_screenshot_bytes(self):
        import memory_factory

        computer_use_flag.set_runtime_override(True)
        store = memory_factory._build_session_store(self._tmp.name)
        store.save("sess-on", _state_with_image())
        raw = self._raw_session_file("sess-on")
        # Sanitize enabled => base64 stripped before the disk write.
        self.assertNotIn(_B64, raw)

    def test_runtime_flip_changes_next_construction(self):
        """One process, one data dir: flip the flag between two store builds and
        prove the per-call construction captured the new sanitize value."""
        import memory_factory

        computer_use_flag.set_runtime_override(False)
        store_off = memory_factory._build_session_store(self._tmp.name)
        store_off.save("flip-a", _state_with_image())
        self.assertIn(_B64, self._raw_session_file("flip-a"))

        # Flip on; a NEW store construction must now sanitize.
        computer_use_flag.set_runtime_override(True)
        store_on = memory_factory._build_session_store(self._tmp.name)
        store_on.save("flip-b", _state_with_image())

        sessions = Path(self._tmp.name) / "memory" / "sessions"
        flip_b = [
            p.read_text()
            for p in sessions.rglob("*")
            if p.is_file() and "flip-b" in p.name
        ]
        self.assertTrue(flip_b, "flip-b session file should exist")
        self.assertNotIn(_B64, "\n".join(flip_b))


if __name__ == "__main__":
    unittest.main()
