import copy
import io
import json
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import mcp_oauth as mcp_oauth_module  # noqa: E402
import mcp_oauth_apps as mcp_oauth_apps_module  # noqa: E402
import mcp_toolkits as mcp_toolkits_module  # noqa: E402
from mcp_oauth import (  # noqa: E402
    McpOAuthError,
    cancel_mcp_oauth_start,
    delete_mcp_oauth_token,
    disconnect_mcp_oauth,
    get_mcp_oauth_attempt_status,
    get_mcp_oauth_status,
    get_valid_mcp_oauth_access_token,
    handle_mcp_oauth_callback,
    save_mcp_oauth_token,
    start_mcp_oauth,
)
from mcp_oauth_apps import (  # noqa: E402
    McpOAuthAppError,
    configure_mcp_oauth_app,
    delete_mcp_oauth_app,
    get_mcp_oauth_app,
    list_mcp_oauth_apps,
)
from mcp_external_registries import approve_mcp_store_entry, import_mcp_store_registry  # noqa: E402
from mcp_toolkits import get_installed_mcp_toolkit, install_mcp_toolkit  # noqa: E402


class FakeOAuthHttp:
    def __init__(self):
        self.gets = []
        self.posts = []
        self.refresh_response = {
            "access_token": "notion-access-refreshed",
            "refresh_token": "notion-refresh-rotated",
            "expires_in": 3600,
            "token_type": "Bearer",
        }

    def get_json(self, url):
        self.gets.append(url)
        if url == "https://mcp.notion.com/.well-known/oauth-protected-resource":
            return {"authorization_servers": ["https://auth.notion.test"]}
        if url == "https://auth.notion.test/.well-known/oauth-authorization-server":
            return {
                "issuer": "https://auth.notion.test",
                "authorization_endpoint": "https://auth.notion.test/authorize",
                "token_endpoint": "https://auth.notion.test/token",
                "registration_endpoint": "https://auth.notion.test/register",
                "code_challenge_methods_supported": ["S256"],
            }
        raise AssertionError(f"unexpected GET {url}")

    def post_json(self, url, payload=None, headers=None, form=None):
        self.posts.append(
            {
                "url": url,
                "payload": payload,
                "headers": headers or {},
                "form": form or {},
            }
        )
        if url == "https://auth.notion.test/register":
            return {"client_id": "notion-client-id", "client_secret": "client-secret"}
        if url == "https://github.com/login/oauth/access_token":
            return {
                "access_token": "github-oauth-token",
                "refresh_token": "github-refresh-token",
                "expires_in": 3600,
                "token_type": "Bearer",
            }
        if url == "https://slack.com/api/oauth.v2.user.access":
            return {
                "ok": True,
                "access_token": "slack-oauth-token",
                "refresh_token": "slack-refresh-token",
                "expires_in": 3600,
                "token_type": "Bearer",
            }
        if url == "https://auth.notion.test/token":
            if (form or {}).get("grant_type") == "refresh_token":
                return dict(self.refresh_response)
            return {
                "access_token": "notion-access-token",
                "refresh_token": "notion-refresh-token",
                "expires_in": 7200,
                "token_type": "Bearer",
            }
        raise AssertionError(f"unexpected POST {url}")


class McpOAuthTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)
        with mcp_oauth_module._PENDING_LOCK:
            mcp_oauth_module._PENDING_STATES.clear()

    def tearDown(self):
        with mcp_oauth_module._PENDING_LOCK:
            mcp_oauth_module._PENDING_STATES.clear()
        self.tmpdir.cleanup()

    def ready_user_credentials_entry(self, entry_id):
        entry = copy.deepcopy(mcp_oauth_apps_module.oauth_registry_entry(entry_id))
        entry["status"] = "available"
        entry["auth"]["oauth"]["releaseStatus"] = "ready"
        return entry

    def test_start_discovers_registers_and_returns_pkce_authorization_url(self):
        http = FakeOAuthHttp()

        result = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "state-123",
            verifier_factory=lambda: "verifier-abc",
        )

        self.assertEqual(
            http.gets,
            [
                "https://mcp.notion.com/.well-known/oauth-protected-resource",
                "https://auth.notion.test/.well-known/oauth-authorization-server",
            ],
        )
        self.assertEqual(http.posts[0]["url"], "https://auth.notion.test/register")
        self.assertEqual(
            http.posts[0]["payload"]["redirect_uris"],
            ["http://127.0.0.1:5879/mcp/oauth/callback"],
        )
        parsed = urlparse(result["authUrl"])
        params = parse_qs(parsed.query)
        self.assertEqual(result["entryId"], "productivity.notion-remote")
        self.assertEqual(result["toolkitId"], "mcp.productivity.notion-remote")
        self.assertEqual(result["state"], "state-123")
        self.assertEqual(result["expiresAt"], 1600.0)
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "auth.notion.test")
        self.assertEqual(params["client_id"], ["notion-client-id"])
        self.assertEqual(params["redirect_uri"], ["http://127.0.0.1:5879/mcp/oauth/callback"])
        self.assertEqual(params["code_challenge_method"], ["S256"])
        self.assertEqual(params["prompt"], ["consent"])

    def test_callback_rejects_unknown_state(self):
        with self.assertRaises(McpOAuthError) as ctx:
            handle_mcp_oauth_callback(
                code="code-123",
                state="missing",
                data_dir=self.data_dir,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_state_invalid")

    def test_cancel_oauth_start_invalidates_only_the_returned_state(self):
        http = FakeOAuthHttp()
        first = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "cancelled-state",
            verifier_factory=lambda: "cancelled-verifier",
        )
        second = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "active-state",
            verifier_factory=lambda: "active-verifier",
        )

        cancelled = cancel_mcp_oauth_start(first["state"], now_fn=lambda: 1100.0)

        self.assertEqual(
            cancelled,
            {
                "ok": True,
                "cancelled": True,
                "entryId": "productivity.notion-remote",
                "toolkitId": "mcp.productivity.notion-remote",
            },
        )
        self.assertEqual(
            cancel_mcp_oauth_start(first["state"], now_fn=lambda: 1100.0),
            {"ok": True, "cancelled": False, "authStatus": "cancelled"},
        )
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                first["state"],
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "cancelled",
        )
        with self.assertRaises(McpOAuthError) as ctx:
            handle_mcp_oauth_callback(
                code="cancelled-code",
                state=first["state"],
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )
        self.assertEqual(ctx.exception.code, "mcp_oauth_cancelled")
        result = handle_mcp_oauth_callback(
            code="active-code",
            state=second["state"],
            data_dir=self.data_dir,
            http_post=http.post_json,
            install_fn=lambda entry_id, **kwargs: {
                "toolkit": {
                    "toolkitId": "mcp.productivity.notion-remote",
                    "status": "available",
                }
            },
            now_fn=lambda: 1100.0,
        )
        self.assertEqual(result["toolkit"]["toolkitId"], "mcp.productivity.notion-remote")

    def test_attempt_status_isolated_for_concurrent_retry_after_error(self):
        http = FakeOAuthHttp()
        first = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "first-attempt-state",
            verifier_factory=lambda: "first-attempt-verifier",
        )
        second = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "second-attempt-state",
            verifier_factory=lambda: "second-attempt-verifier",
        )

        with self.assertRaises(McpOAuthError):
            handle_mcp_oauth_callback(
                code="",
                state=first["state"],
                error="access_denied",
                error_description="sensitive-first-attempt-detail",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )

        self.assertEqual(
            get_mcp_oauth_attempt_status(
                first["state"],
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "error",
        )
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                second["state"],
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "pending",
        )

        handle_mcp_oauth_callback(
            code="second-code",
            state=second["state"],
            data_dir=self.data_dir,
            http_post=http.post_json,
            install_fn=lambda *args, **kwargs: {
                "toolkit": {
                    "toolkitId": "mcp.productivity.notion-remote",
                    "status": "available",
                }
            },
            now_fn=lambda: 1100.0,
        )

        self.assertEqual(
            get_mcp_oauth_attempt_status(
                first["state"],
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "error",
        )
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                second["state"],
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "connected",
        )

    def test_cancel_during_token_exchange_prevents_token_write_and_install(self):
        http = FakeOAuthHttp()
        started = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "concurrent-cancel-state",
            verifier_factory=lambda: "concurrent-cancel-verifier",
        )
        token_exchange_entered = threading.Event()
        release_token_exchange = threading.Event()
        install_called = threading.Event()
        callback_errors = []

        def blocking_token_exchange(*args, **kwargs):
            token_exchange_entered.set()
            self.assertTrue(release_token_exchange.wait(timeout=5))
            return {
                "access_token": "must-not-be-written",
                "refresh_token": "must-not-be-written-refresh",
                "expires_in": 3600,
            }

        def callback_worker():
            try:
                handle_mcp_oauth_callback(
                    code="concurrent-code",
                    state=started["state"],
                    data_dir=self.data_dir,
                    http_post=blocking_token_exchange,
                    install_fn=lambda *args, **kwargs: install_called.set(),
                    now_fn=lambda: 1100.0,
                )
            except Exception as exc:
                callback_errors.append(exc)

        worker = threading.Thread(target=callback_worker)
        worker.start()
        self.assertTrue(token_exchange_entered.wait(timeout=5))

        cancellation = cancel_mcp_oauth_start(
            started["state"],
            now_fn=lambda: 1100.0,
        )
        release_token_exchange.set()
        worker.join(timeout=5)

        self.assertFalse(worker.is_alive())
        self.assertTrue(cancellation["cancelled"])
        self.assertFalse(install_called.is_set())
        self.assertEqual(len(callback_errors), 1)
        self.assertEqual(callback_errors[0].code, "mcp_oauth_cancelled")
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                started["state"],
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "cancelled",
        )
        raw_store = (
            (self.data_dir / "mcp_oauth_tokens.json").read_text()
            if (self.data_dir / "mcp_oauth_tokens.json").exists()
            else ""
        )
        self.assertNotIn("must-not-be-written", raw_store)

    def test_disconnect_cancels_pending_attempt_before_callback(self):
        http = FakeOAuthHttp()
        started = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "disconnect-pending-state",
            verifier_factory=lambda: "disconnect-pending-verifier",
        )
        second = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "disconnect-second-pending-state",
            verifier_factory=lambda: "disconnect-second-pending-verifier",
        )
        other_tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(other_tmpdir.cleanup)
        other_data_dir = Path(other_tmpdir.name)
        other_profile = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=other_data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "other-profile-pending-state",
            verifier_factory=lambda: "other-profile-pending-verifier",
        )
        token_exchange_called = threading.Event()
        install_called = threading.Event()

        disconnect_mcp_oauth(
            "mcp.productivity.notion-remote",
            data_dir=self.data_dir,
            now_fn=lambda: 1050.0,
        )

        self.assertEqual(
            get_mcp_oauth_attempt_status(
                started["state"],
                now_fn=lambda: 1050.0,
            )["authStatus"],
            "cancelled",
        )
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                second["state"],
                now_fn=lambda: 1050.0,
            )["authStatus"],
            "cancelled",
        )
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                other_profile["state"],
                now_fn=lambda: 1050.0,
            )["authStatus"],
            "pending",
        )
        with self.assertRaises(McpOAuthError) as ctx:
            handle_mcp_oauth_callback(
                code="must-not-connect",
                state=started["state"],
                data_dir=self.data_dir,
                http_post=lambda *args, **kwargs: token_exchange_called.set(),
                install_fn=lambda *args, **kwargs: install_called.set(),
                now_fn=lambda: 1100.0,
            )
        self.assertEqual(ctx.exception.code, "mcp_oauth_cancelled")
        self.assertFalse(token_exchange_called.is_set())
        self.assertFalse(install_called.is_set())
        self.assertEqual(
            get_mcp_oauth_status(
                "productivity.notion-remote",
                data_dir=self.data_dir,
            )["authStatus"],
            "missing",
        )

    def test_disconnect_during_token_exchange_cancels_callback_commit(self):
        http = FakeOAuthHttp()
        started = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "disconnect-processing-state",
            verifier_factory=lambda: "disconnect-processing-verifier",
        )
        token_exchange_entered = threading.Event()
        release_token_exchange = threading.Event()
        install_called = threading.Event()
        callback_errors = []

        def blocking_token_exchange(*args, **kwargs):
            token_exchange_entered.set()
            self.assertTrue(release_token_exchange.wait(timeout=5))
            return {
                "access_token": "must-not-survive-disconnect",
                "refresh_token": "must-not-survive-disconnect-refresh",
                "expires_in": 3600,
            }

        def callback_worker():
            try:
                handle_mcp_oauth_callback(
                    code="disconnect-processing-code",
                    state=started["state"],
                    data_dir=self.data_dir,
                    http_post=blocking_token_exchange,
                    install_fn=lambda *args, **kwargs: install_called.set(),
                    now_fn=lambda: 1100.0,
                )
            except Exception as exc:
                callback_errors.append(exc)

        worker = threading.Thread(target=callback_worker)
        worker.start()
        self.assertTrue(token_exchange_entered.wait(timeout=5))

        disconnect_mcp_oauth(
            "mcp.productivity.notion-remote",
            data_dir=self.data_dir,
            now_fn=lambda: 1050.0,
        )
        release_token_exchange.set()
        worker.join(timeout=5)

        self.assertFalse(worker.is_alive())
        self.assertFalse(install_called.is_set())
        self.assertEqual(len(callback_errors), 1)
        self.assertIsInstance(callback_errors[0], McpOAuthError)
        self.assertEqual(callback_errors[0].code, "mcp_oauth_cancelled")
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                started["state"],
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "cancelled",
        )
        self.assertEqual(
            get_mcp_oauth_status(
                "productivity.notion-remote",
                data_dir=self.data_dir,
            )["authStatus"],
            "missing",
        )
        raw_store = (
            (self.data_dir / "mcp_oauth_tokens.json").read_text()
            if (self.data_dir / "mcp_oauth_tokens.json").exists()
            else ""
        )
        self.assertNotIn("must-not-survive-disconnect", raw_store)

    def test_default_state_is_high_entropy_and_unique(self):
        http = FakeOAuthHttp()
        first = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
        )
        second = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
        )

        self.assertGreaterEqual(len(first["state"]), 40)
        self.assertGreaterEqual(len(second["state"]), 40)
        self.assertNotEqual(first["state"], second["state"])

    def test_expired_attempts_are_marked_then_opportunistically_purged(self):
        http = FakeOAuthHttp()
        started = start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "expiring-state",
            verifier_factory=lambda: "expiring-verifier",
        )

        self.assertEqual(
            get_mcp_oauth_attempt_status(
                started["state"],
                now_fn=lambda: 1601.0,
            )["authStatus"],
            "expired",
        )
        with self.assertRaises(McpOAuthError) as ctx:
            get_mcp_oauth_attempt_status(
                started["state"],
                now_fn=lambda: 1902.0,
            )
        self.assertEqual(ctx.exception.code, "mcp_oauth_state_invalid")

    def test_callback_exchanges_token_saves_it_and_installs_notion(self):
        http = FakeOAuthHttp()
        start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "state-123",
            verifier_factory=lambda: "verifier-abc",
        )
        installed = []

        result = handle_mcp_oauth_callback(
            code="code-123",
            state="state-123",
            data_dir=self.data_dir,
            http_post=http.post_json,
            install_fn=lambda entry_id, **kwargs: installed.append((entry_id, kwargs))
            or {
                "toolkit": {
                    "toolkitId": "mcp.productivity.notion-remote",
                    "status": "available",
                }
            },
            now_fn=lambda: 1100.0,
        )

        self.assertEqual(result["toolkit"]["toolkitId"], "mcp.productivity.notion-remote")
        self.assertEqual(installed[0][0], "productivity.notion-remote")
        self.assertEqual(installed[0][1]["data_dir"], self.data_dir)
        token_store = json.loads((self.data_dir / "mcp_oauth_tokens.json").read_text())
        token = token_store["toolkits"]["mcp.productivity.notion-remote"]
        self.assertEqual(token["access_token"], "notion-access-token")
        self.assertEqual(token["refresh_token"], "notion-refresh-token")
        self.assertEqual(token["expires_at"], 8300.0)
        self.assertEqual(
            get_mcp_oauth_status(
                "productivity.notion-remote",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "connected",
        )

    def test_refresh_expired_token_rotates_refresh_token(self):
        http = FakeOAuthHttp()
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "old-access",
                "refresh_token": "old-refresh",
                "expires_at": 900.0,
                "token_endpoint": "https://auth.notion.test/token",
                "client_id": "notion-client-id",
                "client_secret": "client-secret",
            },
            data_dir=self.data_dir,
        )

        access_token = get_valid_mcp_oauth_access_token(
            "mcp.productivity.notion-remote",
            data_dir=self.data_dir,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
        )

        self.assertEqual(access_token, "notion-access-refreshed")
        self.assertEqual(http.posts[0]["form"]["grant_type"], "refresh_token")
        self.assertEqual(http.posts[0]["form"]["refresh_token"], "old-refresh")
        token_store = json.loads((self.data_dir / "mcp_oauth_tokens.json").read_text())
        token = token_store["toolkits"]["mcp.productivity.notion-remote"]
        self.assertEqual(token["access_token"], "notion-access-refreshed")
        self.assertEqual(token["refresh_token"], "notion-refresh-rotated")
        self.assertEqual(token["expires_at"], 4600.0)

    def test_refresh_invalid_grant_marks_token_expired(self):
        http = FakeOAuthHttp()
        marker = "provider-sensitive-expired-detail"
        http.refresh_response = {"error": "invalid_grant", "error_description": marker}
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "old-access",
                "refresh_token": "old-refresh",
                "expires_at": 900.0,
                "token_endpoint": "https://auth.notion.test/token",
                "client_id": "notion-client-id",
            },
            data_dir=self.data_dir,
        )

        with self.assertRaises(McpOAuthError) as ctx:
            get_valid_mcp_oauth_access_token(
                "mcp.productivity.notion-remote",
                data_dir=self.data_dir,
                http_post=http.post_json,
                now_fn=lambda: 1000.0,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_expired")
        status = get_mcp_oauth_status("productivity.notion-remote", data_dir=self.data_dir)
        self.assertEqual(status["authStatus"], "expired")
        self.assertEqual(status["lastError"], "OAuth authorization expired")
        self.assertNotIn(
            marker,
            (self.data_dir / "mcp_oauth_tokens.json").read_text(),
        )

    def test_disconnect_during_refresh_does_not_resurrect_deleted_token(self):
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "old-access",
                "refresh_token": "old-refresh",
                "expires_at": 900.0,
                "token_endpoint": "https://auth.notion.test/token",
                "client_id": "notion-client-id",
            },
            data_dir=self.data_dir,
        )
        refresh_started = threading.Event()
        release_refresh = threading.Event()
        worker_errors = []

        def blocking_refresh(*args, **kwargs):
            refresh_started.set()
            self.assertTrue(release_refresh.wait(timeout=5))
            return {
                "access_token": "must-not-be-restored",
                "refresh_token": "must-not-be-restored-refresh",
                "expires_in": 3600,
            }

        def refresh_worker():
            try:
                get_valid_mcp_oauth_access_token(
                    "mcp.productivity.notion-remote",
                    data_dir=self.data_dir,
                    http_post=blocking_refresh,
                    now_fn=lambda: 1000.0,
                )
            except Exception as exc:
                worker_errors.append(exc)

        worker = threading.Thread(target=refresh_worker)
        worker.start()
        self.assertTrue(refresh_started.wait(timeout=5))

        disconnect_mcp_oauth(
            "mcp.productivity.notion-remote",
            data_dir=self.data_dir,
        )
        release_refresh.set()
        worker.join(timeout=5)

        self.assertFalse(worker.is_alive())
        self.assertEqual(len(worker_errors), 1)
        self.assertIsInstance(worker_errors[0], McpOAuthError)
        self.assertEqual(worker_errors[0].code, "mcp_oauth_required")
        self.assertEqual(
            get_mcp_oauth_status(
                "productivity.notion-remote",
                data_dir=self.data_dir,
            )["authStatus"],
            "missing",
        )
        self.assertNotIn(
            "must-not-be-restored",
            (self.data_dir / "mcp_oauth_tokens.json").read_text(),
        )

    def test_callback_token_supersedes_an_in_flight_refresh(self):
        http = FakeOAuthHttp()
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "old-access",
                "refresh_token": "old-refresh",
                "expires_at": 900.0,
                "token_endpoint": "https://auth.notion.test/token",
                "client_id": "notion-client-id",
            },
            data_dir=self.data_dir,
        )
        start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "callback-wins-state",
            verifier_factory=lambda: "callback-wins-verifier",
        )
        refresh_started = threading.Event()
        release_refresh = threading.Event()
        worker_results = []
        worker_errors = []

        def blocking_refresh(*args, **kwargs):
            refresh_started.set()
            self.assertTrue(release_refresh.wait(timeout=5))
            return {
                "access_token": "stale-refresh-token",
                "refresh_token": "stale-refresh-rotated",
                "expires_in": 3600,
            }

        def refresh_worker():
            try:
                worker_results.append(
                    get_valid_mcp_oauth_access_token(
                        "mcp.productivity.notion-remote",
                        data_dir=self.data_dir,
                        http_post=blocking_refresh,
                        now_fn=lambda: 1000.0,
                    )
                )
            except Exception as exc:
                worker_errors.append(exc)

        worker = threading.Thread(target=refresh_worker)
        worker.start()
        self.assertTrue(refresh_started.wait(timeout=5))

        handle_mcp_oauth_callback(
            code="callback-wins-code",
            state="callback-wins-state",
            data_dir=self.data_dir,
            http_post=lambda *args, **kwargs: {
                "access_token": "callback-wins-token",
                "refresh_token": "callback-wins-refresh",
                "expires_in": 3600,
            },
            install_fn=lambda *args, **kwargs: {
                "toolkit": {
                    "toolkitId": "mcp.productivity.notion-remote",
                    "status": "available",
                }
            },
            now_fn=lambda: 1100.0,
        )
        release_refresh.set()
        worker.join(timeout=5)

        self.assertFalse(worker.is_alive())
        self.assertEqual(worker_errors, [])
        self.assertEqual(worker_results, ["callback-wins-token"])
        token_store = json.loads(
            (self.data_dir / "mcp_oauth_tokens.json").read_text()
        )
        token = token_store["toolkits"]["mcp.productivity.notion-remote"]
        self.assertEqual(token["access_token"], "callback-wins-token")
        self.assertEqual(token["refresh_token"], "callback-wins-refresh")
        self.assertNotIn(
            "stale-refresh-token",
            (self.data_dir / "mcp_oauth_tokens.json").read_text(),
        )

    def test_concurrent_provider_token_saves_preserve_both_records(self):
        start_barrier = threading.Barrier(2)
        worker_errors = []
        saves = (
            (
                "mcp.productivity.notion-remote",
                "productivity.notion-remote",
                "notion-concurrent-token",
            ),
            (
                "mcp.devops.sentry-remote",
                "devops.sentry-remote",
                "sentry-concurrent-token",
            ),
        )

        def save_worker(toolkit_id, entry_id, access_token):
            try:
                start_barrier.wait(timeout=5)
                save_mcp_oauth_token(
                    toolkit_id,
                    {
                        "entry_id": entry_id,
                        "access_token": access_token,
                        "expires_at": 4600.0,
                    },
                    data_dir=self.data_dir,
                )
            except Exception as exc:
                worker_errors.append(exc)

        workers = [
            threading.Thread(target=save_worker, args=save)
            for save in saves
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=5)

        self.assertTrue(all(not worker.is_alive() for worker in workers))
        self.assertEqual(worker_errors, [])
        token_store = json.loads(
            (self.data_dir / "mcp_oauth_tokens.json").read_text()
        )["toolkits"]
        self.assertEqual(
            token_store["mcp.productivity.notion-remote"]["access_token"],
            "notion-concurrent-token",
        )
        self.assertEqual(
            token_store["mcp.devops.sentry-remote"]["access_token"],
            "sentry-concurrent-token",
        )

    def test_concurrent_provider_callbacks_preserve_tokens_and_installs(self):
        def post_json(url, payload=None, headers=None, form=None):
            if url == "https://auth.notion.test/register":
                return {"client_id": "notion-concurrent-client"}
            if url == "https://mcp.sentry.dev/oauth/register":
                return {"client_id": "sentry-concurrent-client"}
            if url == "https://auth.notion.test/token":
                return {
                    "access_token": "notion-callback-token",
                    "refresh_token": "notion-callback-refresh",
                    "expires_in": 0,
                }
            if url == "https://mcp.sentry.dev/oauth/token":
                return {
                    "access_token": "sentry-callback-token",
                    "refresh_token": "sentry-callback-refresh",
                    "expires_in": 0,
                }
            raise AssertionError(f"unexpected POST {url}")

        http = FakeOAuthHttp()
        starts = (
            start_mcp_oauth(
                "productivity.notion-remote",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
                http_get=http.get_json,
                http_post=post_json,
                now_fn=lambda: 1000.0,
                state_factory=lambda: "notion-concurrent-state",
                verifier_factory=lambda: "notion-concurrent-verifier",
            ),
            start_mcp_oauth(
                "devops.sentry-remote",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
                http_get=http.get_json,
                http_post=post_json,
                now_fn=lambda: 1000.0,
                state_factory=lambda: "sentry-concurrent-state",
                verifier_factory=lambda: "sentry-concurrent-verifier",
            ),
        )
        discovery_barrier = threading.Barrier(2)
        worker_errors = []
        worker_results = []

        class ConcurrentToolkit:
            def __init__(self, **kwargs):
                self.tools = {}

            def connect(self):
                discovery_barrier.wait(timeout=5)

            def disconnect(self):
                return None

        def callback_worker(start):
            try:
                worker_results.append(
                    handle_mcp_oauth_callback(
                        code=f"{start['state']}-code",
                        state=start["state"],
                        data_dir=self.data_dir,
                        http_post=post_json,
                        now_fn=lambda: 1100.0,
                    )
                )
            except Exception as exc:
                worker_errors.append(exc)

        with patch.object(
            mcp_toolkits_module,
            "_default_toolkit_factory",
            return_value=ConcurrentToolkit,
        ):
            workers = [
                threading.Thread(target=callback_worker, args=(start,))
                for start in starts
            ]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join(timeout=5)

        self.assertTrue(all(not worker.is_alive() for worker in workers))
        self.assertEqual(worker_errors, [])
        self.assertEqual(len(worker_results), 2)
        self.assertTrue(
            all(result["toolkit"]["status"] == "available" for result in worker_results)
        )
        token_store = json.loads(
            (self.data_dir / "mcp_oauth_tokens.json").read_text()
        )["toolkits"]
        self.assertEqual(
            token_store["mcp.productivity.notion-remote"]["access_token"],
            "notion-callback-token",
        )
        self.assertEqual(
            token_store["mcp.devops.sentry-remote"]["access_token"],
            "sentry-callback-token",
        )
        toolkit_store = json.loads(
            (self.data_dir / "mcp_toolkits.json").read_text()
        )["toolkits"]
        self.assertEqual(
            {record["toolkit_id"] for record in toolkit_store},
            {
                "mcp.productivity.notion-remote",
                "mcp.devops.sentry-remote",
            },
        )

    def test_provider_http_error_bodies_are_not_exposed(self):
        marker = "provider-body-secret-marker"
        for request_call in (
            lambda: mcp_oauth_module._default_http_get("https://provider.test/discovery"),
            lambda: mcp_oauth_module._default_http_post(
                "https://provider.test/token",
                form={"grant_type": "authorization_code"},
            ),
        ):
            provider_error = HTTPError(
                "https://provider.test",
                403,
                "Forbidden",
                {},
                io.BytesIO(marker.encode("utf-8")),
            )
            with patch.object(
                mcp_oauth_module.urllib.request,
                "urlopen",
                side_effect=provider_error,
            ):
                with self.assertRaises(McpOAuthError) as ctx:
                    request_call()
            self.assertNotIn(marker, str(ctx.exception))

    def test_start_and_refresh_provider_failures_are_generic(self):
        start_marker = "provider-start-secret-marker"
        with self.assertRaises(McpOAuthError) as start_ctx:
            start_mcp_oauth(
                "productivity.notion-remote",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
                http_get=lambda *args, **kwargs: (_ for _ in ()).throw(
                    RuntimeError(start_marker)
                ),
            )
        self.assertEqual(start_ctx.exception.code, "mcp_oauth_start_failed")
        self.assertNotIn(start_marker, str(start_ctx.exception))

        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "old-access",
                "refresh_token": "old-refresh",
                "expires_at": 900.0,
                "token_endpoint": "https://auth.notion.test/token",
                "client_id": "notion-client-id",
            },
            data_dir=self.data_dir,
        )
        refresh_marker = "provider-refresh-secret-marker"
        with self.assertRaises(McpOAuthError) as refresh_ctx:
            get_valid_mcp_oauth_access_token(
                "mcp.productivity.notion-remote",
                data_dir=self.data_dir,
                http_post=lambda *args, **kwargs: (_ for _ in ()).throw(
                    RuntimeError(refresh_marker)
                ),
                now_fn=lambda: 1000.0,
            )
        self.assertEqual(refresh_ctx.exception.code, "mcp_oauth_refresh_failed")
        self.assertNotIn(refresh_marker, str(refresh_ctx.exception))
        self.assertNotIn(
            refresh_marker,
            (self.data_dir / "mcp_oauth_tokens.json").read_text(),
        )

    def test_delete_removes_oauth_token(self):
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {"entry_id": "productivity.notion-remote", "access_token": "token"},
            data_dir=self.data_dir,
        )

        result = delete_mcp_oauth_token("mcp.productivity.notion-remote", data_dir=self.data_dir)

        self.assertTrue(result["ok"])
        self.assertEqual(
            get_mcp_oauth_status("productivity.notion-remote", data_dir=self.data_dir)["authStatus"],
            "missing",
        )

    def test_configure_oauth_app_credentials_persists_status_without_returning_secret(self):
        github_entry = self.ready_user_credentials_entry("dev.github-remote")
        with patch.object(
            mcp_oauth_apps_module,
            "oauth_registry_entry",
            return_value=github_entry,
        ):
            result = configure_mcp_oauth_app(
                {
                    "toolkitId": "mcp.dev.github-remote",
                    "clientId": "github-client-id",
                    "clientSecret": "github-client-secret",
                    "scopes": ["repo", "read:org"],
                },
                data_dir=self.data_dir,
                now_fn=lambda: 1200.0,
            )

        self.assertEqual(result["app"]["toolkitId"], "mcp.dev.github-remote")
        self.assertEqual(result["app"]["provider"], "github")
        self.assertTrue(result["app"]["configured"])
        self.assertEqual(result["app"]["clientIdPreview"], "gith...t-id")
        self.assertEqual(result["app"]["scopes"], ["repo", "read:org"])
        self.assertNotIn("clientSecret", result["app"])
        raw = json.loads((self.data_dir / "mcp_oauth_apps.json").read_text())
        self.assertEqual(raw["apps"]["mcp.dev.github-remote"]["client_secret"], "github-client-secret")
        self.assertEqual(oct((self.data_dir / "mcp_oauth_apps.json").stat().st_mode & 0o777), "0o600")

    def test_list_and_delete_oauth_app_credentials(self):
        slack_entry = self.ready_user_credentials_entry("productivity.slack-remote")
        with patch.object(
            mcp_oauth_apps_module,
            "oauth_registry_entry",
            return_value=slack_entry,
        ):
            configure_mcp_oauth_app(
                {
                    "toolkitId": "mcp.productivity.slack-remote",
                    "clientId": "slack-client-id",
                    "clientSecret": "slack-client-secret",
                },
                data_dir=self.data_dir,
            )

        apps = list_mcp_oauth_apps(data_dir=self.data_dir)["apps"]
        self.assertNotIn(
            "mcp.dev.github-remote",
            {app["toolkitId"] for app in apps},
        )
        slack_app = next(
            app
            for app in apps
            if app["toolkitId"] == "mcp.productivity.slack-remote"
        )
        self.assertTrue(slack_app["configured"])
        self.assertFalse(slack_app["configurable"])
        self.assertFalse(slack_app["connectable"])
        self.assertTrue(slack_app["releaseBlocked"])
        self.assertEqual(get_mcp_oauth_app("mcp.productivity.slack-remote", data_dir=self.data_dir)["client_secret"], "slack-client-secret")

        delete_mcp_oauth_app("mcp.productivity.slack-remote", data_dir=self.data_dir)

        self.assertIsNone(
            get_mcp_oauth_app(
                "mcp.productivity.slack-remote",
                data_dir=self.data_dir,
            )
        )

    def test_configure_oauth_app_rejects_release_blocked_provider(self):
        with self.assertRaises(McpOAuthAppError) as ctx:
            configure_mcp_oauth_app(
                {
                    "toolkitId": "mcp.dev.github-remote",
                    "clientId": "blocked-client-id",
                    "clientSecret": "blocked-client-secret",
                },
                data_dir=self.data_dir,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_release_unavailable")
        self.assertEqual(ctx.exception.status, 403)
        self.assertFalse((self.data_dir / "mcp_oauth_apps.json").exists())

    def test_user_credentials_oauth_start_requires_configured_app(self):
        github_entry = mcp_oauth_module.oauth_registry_entry("dev.github-remote")
        github_entry["auth"]["oauth"]["releaseStatus"] = "ready"
        with patch.object(mcp_oauth_module, "oauth_registry_entry", return_value=github_entry):
            with self.assertRaises(McpOAuthError) as ctx:
                start_mcp_oauth(
                    "dev.github-remote",
                    callback_base_url="http://127.0.0.1:5879",
                    data_dir=self.data_dir,
                    http_get=FakeOAuthHttp().get_json,
                    http_post=FakeOAuthHttp().post_json,
                )

        self.assertEqual(ctx.exception.code, "mcp_oauth_app_required")

    def test_bundled_oauth_start_blocks_non_release_ready_entry_before_network(self):
        http = FakeOAuthHttp()

        with self.assertRaises(McpOAuthError) as ctx:
            start_mcp_oauth(
                "dev.figma-remote",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
                http_get=http.get_json,
                http_post=http.post_json,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_release_unavailable")
        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(http.gets, [])
        self.assertEqual(http.posts, [])

    def test_oauth_start_rejects_external_registry_entries_as_untrusted(self):
        import_mcp_store_registry(
            {
                "registry": {
                    "version": 1,
                    "name": "External",
                    "entries": [
                        {
                            "id": "external.oauth",
                            "toolkitId": "mcp.external.oauth",
                            "name": "External OAuth",
                            "description": "External OAuth entry",
                            "category": "dev",
                            "mcp": {
                                "transport": "http",
                                "runtimeTransport": "streamable_http",
                                "url": "https://example.test/mcp",
                                "headers": [],
                            },
                            "auth": {
                                "oauth": {
                                    "type": "oauth",
                                    "provider": "example",
                                    "providerLabel": "Example",
                                    "clientRegistration": "dynamic",
                                    "mcpUrl": "https://example.test/mcp",
                                    "transport": "streamable_http",
                                    "authorizationEndpoint": "https://example.test/authorize",
                                    "tokenEndpoint": "https://example.test/token",
                                }
                            },
                        }
                    ],
                }
            },
            data_dir=self.data_dir,
        )

        with self.assertRaises(McpOAuthError) as ctx:
            start_mcp_oauth(
                "external.oauth",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
            )

        self.assertEqual(ctx.exception.code, "mcp_registry_entry_untrusted")

    def test_approved_external_oauth_entry_uses_recipe_driven_start(self):
        imported = import_mcp_store_registry(
            {
                "registry": {
                    "version": 1,
                    "name": "External",
                    "entries": [
                        {
                            "id": "external.oauth",
                            "toolkitId": "mcp.external.oauth",
                            "name": "External OAuth",
                            "description": "External OAuth entry",
                            "category": "dev",
                            "installable": True,
                            "mcp": {
                                "transport": "http",
                                "runtimeTransport": "streamable_http",
                                "url": "https://example.test/mcp",
                                "headers": [],
                            },
                            "auth": {
                                "oauth": {
                                    "type": "oauth",
                                    "provider": "example",
                                    "providerLabel": "Example",
                                    "clientRegistration": "dynamic",
                                    "mcpUrl": "https://example.test/mcp",
                                    "transport": "streamable_http",
                                    "authorizationEndpoint": "https://example.test/authorize",
                                    "tokenEndpoint": "https://example.test/token",
                                    "registrationEndpoint": "https://example.test/register",
                                }
                            },
                        }
                    ],
                }
            },
            data_dir=self.data_dir,
        )
        registry_id = imported["registry"]["registryId"]
        approve_mcp_store_entry(
            "external.oauth",
            registry_id=registry_id,
            data_dir=self.data_dir,
            acknowledged_risk=True,
        )
        posts = []

        def post_json(url, payload=None, headers=None, form=None):
            posts.append({"url": url, "payload": payload, "headers": headers or {}})
            return {"client_id": "external-client-id"}

        result = start_mcp_oauth(
            "external.oauth",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=lambda url: (_ for _ in ()).throw(AssertionError(f"unexpected GET {url}")),
            http_post=post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "external-state",
            verifier_factory=lambda: "external-verifier",
        )

        self.assertEqual(posts[0]["url"], "https://example.test/register")
        self.assertEqual(result["entryId"], "external.oauth")
        self.assertEqual(result["toolkitId"], "mcp.external.oauth")
        parsed = urlparse(result["authUrl"])
        params = parse_qs(parsed.query)
        self.assertEqual(parsed.netloc, "example.test")
        self.assertEqual(params["client_id"], ["external-client-id"])
        self.assertEqual(params["state"], ["external-state"])

    def test_github_oauth_app_start_uses_configured_credentials_and_recipe_params(self):
        github_entry = self.ready_user_credentials_entry("dev.github-remote")
        with patch.object(
            mcp_oauth_apps_module,
            "oauth_registry_entry",
            return_value=github_entry,
        ):
            configure_mcp_oauth_app(
                {
                    "toolkitId": "mcp.dev.github-remote",
                    "clientId": "github-client-id",
                    "clientSecret": "github-client-secret",
                    "scopes": ["repo", "read:org"],
                },
                data_dir=self.data_dir,
            )

        with patch.object(mcp_oauth_module, "oauth_registry_entry", return_value=github_entry):
            result = start_mcp_oauth(
                "dev.github-remote",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
                http_get=FakeOAuthHttp().get_json,
                http_post=FakeOAuthHttp().post_json,
                now_fn=lambda: 1000.0,
                state_factory=lambda: "github-state",
                verifier_factory=lambda: "github-verifier",
            )

        parsed = urlparse(result["authUrl"])
        params = parse_qs(parsed.query)
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "github.com")
        self.assertEqual(parsed.path, "/login/oauth/authorize")
        self.assertEqual(params["client_id"], ["github-client-id"])
        self.assertEqual(params["scope"], ["repo read:org"])
        self.assertEqual(params["state"], ["github-state"])

    def test_user_credentials_callback_includes_client_secret_and_installs_entry(self):
        http = FakeOAuthHttp()
        github_entry = self.ready_user_credentials_entry("dev.github-remote")
        with patch.object(
            mcp_oauth_apps_module,
            "oauth_registry_entry",
            return_value=github_entry,
        ):
            configure_mcp_oauth_app(
                {
                    "toolkitId": "mcp.dev.github-remote",
                    "clientId": "github-client-id",
                    "clientSecret": "github-client-secret",
                    "scopes": ["repo"],
                },
                data_dir=self.data_dir,
            )
        installed = []
        with patch.object(mcp_oauth_module, "oauth_registry_entry", return_value=github_entry):
            start_mcp_oauth(
                "dev.github-remote",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
                http_get=http.get_json,
                http_post=http.post_json,
                now_fn=lambda: 1000.0,
                state_factory=lambda: "github-state",
                verifier_factory=lambda: "github-verifier",
            )

            handle_mcp_oauth_callback(
                code="github-code",
                state="github-state",
                data_dir=self.data_dir,
                http_post=http.post_json,
                install_fn=lambda entry_id, **kwargs: installed.append((entry_id, kwargs))
                or {
                    "toolkit": {
                        "toolkitId": "mcp.dev.github-remote",
                        "status": "available",
                    }
                },
                now_fn=lambda: 1100.0,
            )

        token_post = next(post for post in http.posts if post["url"] == "https://github.com/login/oauth/access_token")
        self.assertEqual(token_post["form"]["client_id"], "github-client-id")
        self.assertEqual(token_post["form"]["client_secret"], "github-client-secret")
        self.assertEqual(token_post["form"]["code_verifier"], "github-verifier")
        self.assertEqual(installed[0][0], "dev.github-remote")
        self.assertEqual(
            get_mcp_oauth_status(
                "dev.github-remote",
                data_dir=self.data_dir,
                now_fn=lambda: 1200.0,
            )["authStatus"],
            "connected",
        )

    def test_callback_provider_denial_records_safe_error_and_clears_pending_state(self):
        http = FakeOAuthHttp()
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "existing-connected-token",
                "expires_at": 9999.0,
            },
            data_dir=self.data_dir,
        )
        start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "denied-state",
            verifier_factory=lambda: "denied-verifier",
        )

        with self.assertRaises(McpOAuthError) as ctx:
            handle_mcp_oauth_callback(
                code="",
                state="denied-state",
                error="access_denied",
                error_description="provider-sensitive-user-detail",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_provider_denied")
        self.assertEqual(ctx.exception.status, 400)
        status = get_mcp_oauth_attempt_status(
            "denied-state",
            now_fn=lambda: 1100.0,
        )
        self.assertEqual(status["authStatus"], "error")
        self.assertEqual(status["lastError"], "OAuth authorization was denied or cancelled")
        self.assertEqual(
            get_mcp_oauth_status(
                "productivity.notion-remote",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "connected",
        )
        self.assertNotIn(
            "provider-sensitive-user-detail",
            (self.data_dir / "mcp_oauth_tokens.json").read_text(),
        )
        self.assertIn(
            "existing-connected-token",
            (self.data_dir / "mcp_oauth_tokens.json").read_text(),
        )
        with self.assertRaises(McpOAuthError) as replay_ctx:
            handle_mcp_oauth_callback(
                code="code",
                state="denied-state",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )
        self.assertEqual(replay_ctx.exception.code, "mcp_oauth_state_invalid")

    def test_callback_token_error_records_safe_error_and_clears_pending_state(self):
        http = FakeOAuthHttp()
        start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "token-error-state",
            verifier_factory=lambda: "token-error-verifier",
        )

        with self.assertRaises(McpOAuthError) as ctx:
            handle_mcp_oauth_callback(
                code="code-123",
                state="token-error-state",
                data_dir=self.data_dir,
                http_post=lambda *args, **kwargs: {
                    "error": "invalid_grant",
                    "error_description": "provider-sensitive-token-detail",
                },
                now_fn=lambda: 1100.0,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_token_exchange_failed")
        self.assertEqual(ctx.exception.status, 400)
        status = get_mcp_oauth_attempt_status(
            "token-error-state",
            now_fn=lambda: 1100.0,
        )
        self.assertEqual(status["authStatus"], "error")
        self.assertEqual(status["lastError"], "OAuth token exchange failed")
        self.assertNotIn(
            "provider-sensitive-token-detail",
            json.dumps(status),
        )
        with self.assertRaises(McpOAuthError) as replay_ctx:
            handle_mcp_oauth_callback(
                code="code",
                state="token-error-state",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )
        self.assertEqual(replay_ctx.exception.code, "mcp_oauth_state_invalid")

    def test_callback_install_failure_records_safe_error_and_discards_token(self):
        http = FakeOAuthHttp()
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "existing-token-before-reconnect",
                "expires_at": 9999.0,
            },
            data_dir=self.data_dir,
        )
        start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: 1000.0,
            state_factory=lambda: "install-error-state",
            verifier_factory=lambda: "install-error-verifier",
        )

        def fail_install(*args, **kwargs):
            raise RuntimeError("tool-discovery-sensitive-detail")

        with self.assertRaises(McpOAuthError) as ctx:
            handle_mcp_oauth_callback(
                code="code-123",
                state="install-error-state",
                data_dir=self.data_dir,
                http_post=http.post_json,
                install_fn=fail_install,
                now_fn=lambda: 1100.0,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_install_failed")
        self.assertEqual(ctx.exception.status, 502)
        status = get_mcp_oauth_attempt_status(
            "install-error-state",
            now_fn=lambda: 1100.0,
        )
        self.assertEqual(status["authStatus"], "error")
        self.assertEqual(
            status["lastError"],
            "OAuth connected, but MCP installation or tool discovery failed",
        )
        raw_store = (
            (self.data_dir / "mcp_oauth_tokens.json").read_text()
            if (self.data_dir / "mcp_oauth_tokens.json").exists()
            else ""
        )
        self.assertNotIn("tool-discovery-sensitive-detail", raw_store)
        self.assertNotIn("notion-access-token", raw_store)
        self.assertIn("existing-token-before-reconnect", raw_store)
        self.assertEqual(
            get_mcp_oauth_status(
                "productivity.notion-remote",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )["authStatus"],
            "connected",
        )
        with self.assertRaises(McpOAuthError) as replay_ctx:
            handle_mcp_oauth_callback(
                code="code",
                state="install-error-state",
                data_dir=self.data_dir,
                now_fn=lambda: 1100.0,
            )
        self.assertEqual(replay_ctx.exception.code, "mcp_oauth_state_invalid")

    def test_existing_toolkit_failed_reconnect_restores_token_and_available_record(self):
        class HealthyToolkit:
            def __init__(self, **kwargs):
                self.tools = {}

            def connect(self):
                return None

            def disconnect(self):
                return None

        class FailingToolkit(HealthyToolkit):
            def connect(self):
                raise RuntimeError("health-probe-sensitive-marker")

        base_now = time.time()
        save_mcp_oauth_token(
            "mcp.productivity.notion-remote",
            {
                "entry_id": "productivity.notion-remote",
                "access_token": "existing-token-before-health-probe",
                "expires_at": base_now + 3600,
            },
            data_dir=self.data_dir,
        )
        installed = install_mcp_toolkit(
            "productivity.notion-remote",
            data_dir=self.data_dir,
            toolkit_factory=HealthyToolkit,
            now_fn=lambda: base_now,
        )
        self.assertEqual(installed["toolkit"]["status"], "available")
        toolkit_store_before = json.loads(
            (self.data_dir / "mcp_toolkits.json").read_text()
        )
        token_store_before = json.loads(
            (self.data_dir / "mcp_oauth_tokens.json").read_text()
        )

        http = FakeOAuthHttp()
        start_mcp_oauth(
            "productivity.notion-remote",
            callback_base_url="http://127.0.0.1:5879",
            data_dir=self.data_dir,
            http_get=http.get_json,
            http_post=http.post_json,
            now_fn=lambda: base_now,
            state_factory=lambda: "existing-toolkit-reconnect-state",
            verifier_factory=lambda: "existing-toolkit-reconnect-verifier",
        )

        with patch.object(
            mcp_toolkits_module,
            "_default_toolkit_factory",
            return_value=FailingToolkit,
        ):
            with self.assertRaises(McpOAuthError) as ctx:
                handle_mcp_oauth_callback(
                    code="reconnect-code",
                    state="existing-toolkit-reconnect-state",
                    data_dir=self.data_dir,
                    http_post=http.post_json,
                    now_fn=lambda: base_now + 1,
                )

        self.assertEqual(ctx.exception.code, "mcp_oauth_install_failed")
        self.assertEqual(
            get_mcp_oauth_attempt_status(
                "existing-toolkit-reconnect-state",
                now_fn=lambda: base_now + 1,
            )["authStatus"],
            "error",
        )
        self.assertEqual(
            json.loads((self.data_dir / "mcp_toolkits.json").read_text()),
            toolkit_store_before,
        )
        self.assertEqual(
            json.loads((self.data_dir / "mcp_oauth_tokens.json").read_text()),
            token_store_before,
        )
        restored = get_installed_mcp_toolkit(
            "mcp.productivity.notion-remote",
            data_dir=self.data_dir,
        )
        self.assertEqual(restored["status"], "available")
        self.assertEqual(restored["lastError"], "")
        self.assertNotIn(
            "health-probe-sensitive-marker",
            (self.data_dir / "mcp_toolkits.json").read_text(),
        )


if __name__ == "__main__":
    unittest.main()
