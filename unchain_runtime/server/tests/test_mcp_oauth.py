import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from mcp_oauth import (  # noqa: E402
    McpOAuthError,
    delete_mcp_oauth_token,
    get_mcp_oauth_status,
    get_valid_mcp_oauth_access_token,
    handle_mcp_oauth_callback,
    save_mcp_oauth_token,
    start_mcp_oauth,
)
from mcp_oauth_apps import (  # noqa: E402
    configure_mcp_oauth_app,
    delete_mcp_oauth_app,
    get_mcp_oauth_app,
    list_mcp_oauth_apps,
)


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

    def tearDown(self):
        self.tmpdir.cleanup()

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
            or {"toolkit": {"toolkitId": "mcp.productivity.notion-remote"}},
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
        http.refresh_response = {"error": "invalid_grant", "error_description": "expired"}
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
        configure_mcp_oauth_app(
            {
                "toolkitId": "mcp.productivity.slack-remote",
                "clientId": "slack-client-id",
                "clientSecret": "slack-client-secret",
            },
            data_dir=self.data_dir,
        )

        apps = list_mcp_oauth_apps(data_dir=self.data_dir)["apps"]
        slack = next(app for app in apps if app["toolkitId"] == "mcp.productivity.slack-remote")
        self.assertTrue(slack["configured"])
        self.assertEqual(get_mcp_oauth_app("mcp.productivity.slack-remote", data_dir=self.data_dir)["client_secret"], "slack-client-secret")

        delete_mcp_oauth_app("mcp.productivity.slack-remote", data_dir=self.data_dir)

        self.assertFalse(
            next(
                app
                for app in list_mcp_oauth_apps(data_dir=self.data_dir)["apps"]
                if app["toolkitId"] == "mcp.productivity.slack-remote"
            )["configured"]
        )

    def test_user_credentials_oauth_start_requires_configured_app(self):
        with self.assertRaises(McpOAuthError) as ctx:
            start_mcp_oauth(
                "dev.github-remote",
                callback_base_url="http://127.0.0.1:5879",
                data_dir=self.data_dir,
                http_get=FakeOAuthHttp().get_json,
                http_post=FakeOAuthHttp().post_json,
            )

        self.assertEqual(ctx.exception.code, "mcp_oauth_app_required")

    def test_github_oauth_app_start_uses_configured_credentials_and_recipe_params(self):
        configure_mcp_oauth_app(
            {
                "toolkitId": "mcp.dev.github-remote",
                "clientId": "github-client-id",
                "clientSecret": "github-client-secret",
                "scopes": ["repo", "read:org"],
            },
            data_dir=self.data_dir,
        )

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
        configure_mcp_oauth_app(
            {
                "toolkitId": "mcp.dev.github-remote",
                "clientId": "github-client-id",
                "clientSecret": "github-client-secret",
                "scopes": ["repo"],
            },
            data_dir=self.data_dir,
        )
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
        installed = []

        handle_mcp_oauth_callback(
            code="github-code",
            state="github-state",
            data_dir=self.data_dir,
            http_post=http.post_json,
            install_fn=lambda entry_id, **kwargs: installed.append((entry_id, kwargs))
            or {"toolkit": {"toolkitId": "mcp.dev.github-remote"}},
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


if __name__ == "__main__":
    unittest.main()
