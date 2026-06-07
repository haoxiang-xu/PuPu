# PuPu MCP Store Phase 2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable MCP entries that Phase 2A intentionally blocked: HTTP/streamable HTTP MCP, secret-backed stdio MCP, Browser Use, GitHub, Notion, Slack, and user-defined custom MCP recipes.

**Architecture:** Keep Phase 2A's curated registry and installed config store as the source of truth, but add a typed setup layer for secrets, OAuth/PAT headers, HTTP transport normalization, and custom recipes. Frontend still sends only trusted setup inputs; backend resolves command/url/header templates and validates by connecting and running `list_tools` before persisting.

**Tech Stack:** Python Flask runtime, unchain `MCPToolkit`, Electron IPC/preload bridge, React settings/toolkit UI, Jest, pytest.

---

## Current State

Phase 2A is working for no-secret stdio MCP:

- `memory.memory` installs and executes real MCP tools.
- `browser.playwright` installs and discovers tools.
- `workspace.filesystem` is configured but requires an explicit agent workspace root before install.

Phase 2B is required for:

- `dev.github-remote` (`http`, auth header/OAuth/PAT)
- `productivity.notion-remote` (`http`, OAuth)
- `browser.browser-use-local` (`stdio`, `OPENAI_API_KEY`)
- `productivity.slack` (`stdio`, Slack bot token)
- custom MCP recipes

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `unchain_runtime/server/mcp_toolkits.py` | Registry, config resolution, install/reload/runtime build | Modify |
| `unchain_runtime/server/mcp_secrets.py` | Store and retrieve MCP secrets without persisting plaintext in `mcp_toolkits.json` | Create |
| `unchain_runtime/server/route_mcp.py` | Install/update secret/custom payload validation | Modify |
| `unchain_runtime/server/tests/test_mcp_toolkits.py` | Backend install/runtime tests | Modify |
| `unchain_runtime/server/tests/test_mcp_secrets.py` | Secret storage tests | Create |
| `electron/shared/channels.js` | New MCP secret/custom IPC channels | Modify |
| `electron/main/ipc/register_handlers.js` | IPC handlers for secret/custom APIs | Modify |
| `electron/main/services/unchain/service.js` | Proxy new MCP APIs | Modify |
| `electron/preload/bridges/unchain_bridge.js` | Expose new bridge calls | Modify |
| `src/SERVICEs/api.unchain.js` | Frontend wrappers | Modify |
| `src/SERVICEs/mcp_install.js` | Setup payload shaping and install-state helpers | Modify |
| `src/COMPONENTs/toolkit/...` | Store/detail setup forms and custom MCP entry point | Modify |
| `src/COMPONENTs/settings/local_storage/components/mcp_toolkits_section.js` | Secret status, reconnect, delete | Modify |
| `src/locales/en.json`, `src/locales/zh-CN.json` | New copy | Modify |

## Non-Goals

- Do not implement a GitHub icon fetch pipeline in Phase 2B.
- Do not store OAuth refresh tokens until we have an app-level OAuth security review.
- Do not support arbitrary frontend command execution. Custom MCP must still pass backend validation and be persisted as a typed recipe.
- Do not add background polling. Keep startup reload + manual reload.

---

## Task 1: Backend Secret Store

**Files:**
- Create: `unchain_runtime/server/mcp_secrets.py`
- Create: `unchain_runtime/server/tests/test_mcp_secrets.py`

- [ ] **Step 1: Write failing tests**

```python
import json
import tempfile
import unittest
from pathlib import Path

from mcp_secrets import (
    delete_mcp_secret_values,
    get_mcp_secret_value,
    list_mcp_secret_status,
    save_mcp_secret_values,
)


class McpSecretsTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_save_get_status_and_delete_secret_values(self):
        save_mcp_secret_values(
            "mcp.productivity.slack",
            {"SLACK_BOT_TOKEN": "xoxb-test"},
            data_dir=self.data_dir,
        )

        self.assertEqual(
            get_mcp_secret_value("mcp.productivity.slack", "SLACK_BOT_TOKEN", data_dir=self.data_dir),
            "xoxb-test",
        )
        self.assertEqual(
            list_mcp_secret_status("mcp.productivity.slack", data_dir=self.data_dir),
            [{"key": "SLACK_BOT_TOKEN", "configured": True}],
        )

        raw = json.loads((self.data_dir / "mcp_secrets.json").read_text())
        self.assertEqual(raw["toolkits"]["mcp.productivity.slack"]["SLACK_BOT_TOKEN"], "xoxb-test")

        delete_mcp_secret_values("mcp.productivity.slack", data_dir=self.data_dir)
        self.assertEqual(list_mcp_secret_status("mcp.productivity.slack", data_dir=self.data_dir), [])
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_secrets.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'mcp_secrets'`.

- [ ] **Step 3: Implement file-backed secret storage**

Implement `unchain_runtime/server/mcp_secrets.py`:

```python
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List

MCP_SECRETS_FILENAME = "mcp_secrets.json"


def _data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    return Path(raw) if raw else Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_SECRETS_FILENAME


def _read_store(data_dir: str | Path | None = None) -> Dict:
    path = _store_path(data_dir)
    if not path.exists():
        return {"version": 1, "toolkits": {}}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"version": 1, "toolkits": {}}
    if not isinstance(raw, dict) or not isinstance(raw.get("toolkits"), dict):
        return {"version": 1, "toolkits": {}}
    return {"version": 1, "toolkits": raw["toolkits"]}


def _write_store(store: Dict, data_dir: str | Path | None = None) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")


def save_mcp_secret_values(
    toolkit_id: str,
    values: Dict[str, str],
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, object]:
    clean_toolkit_id = str(toolkit_id or "").strip()
    store = _read_store(data_dir)
    clean_values = {
        str(key).strip(): str(value)
        for key, value in (values or {}).items()
        if str(key).strip() and str(value)
    }
    store["toolkits"][clean_toolkit_id] = clean_values
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": clean_toolkit_id}


def get_mcp_secret_value(
    toolkit_id: str,
    key: str,
    *,
    data_dir: str | Path | None = None,
) -> str:
    store = _read_store(data_dir)
    values = store["toolkits"].get(str(toolkit_id or "").strip(), {})
    return str(values.get(str(key or "").strip(), "") or "")


def list_mcp_secret_status(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> List[Dict[str, object]]:
    store = _read_store(data_dir)
    values = store["toolkits"].get(str(toolkit_id or "").strip(), {})
    return [
        {"key": key, "configured": bool(value)}
        for key, value in sorted(values.items())
    ]


def delete_mcp_secret_values(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, object]:
    clean_toolkit_id = str(toolkit_id or "").strip()
    store = _read_store(data_dir)
    store["toolkits"].pop(clean_toolkit_id, None)
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": clean_toolkit_id}
```

- [ ] **Step 4: Verify pass**

Run:

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_secrets.py -q
```

Expected: PASS.

---

## Task 2: Extend Backend Registry for Secret Stdio Entries

**Files:**
- Modify: `unchain_runtime/server/mcp_toolkits.py`
- Modify: `unchain_runtime/server/tests/test_mcp_toolkits.py`

- [ ] **Step 1: Add failing tests**

Add tests:

```python
def test_secret_stdio_entry_requires_secret_values(self):
    with self.assertRaises(McpToolkitError) as ctx:
        install_mcp_toolkit(
            "productivity.slack",
            data_dir=self.data_dir,
            toolkit_factory=FakeMCPToolkit,
        )
    self.assertEqual(ctx.exception.code, "mcp_secret_required")


def test_secret_stdio_entry_injects_env_without_persisting_secret(self):
    install_mcp_toolkit(
        "productivity.slack",
        secrets={"SLACK_BOT_TOKEN": "xoxb-test"},
        data_dir=self.data_dir,
        toolkit_factory=FakeMCPToolkit,
    )

    self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["env"]["SLACK_BOT_TOKEN"], "xoxb-test")
    persisted = json.loads((self.data_dir / "mcp_toolkits.json").read_text())
    self.assertNotIn("xoxb-test", json.dumps(persisted))
```

- [ ] **Step 2: Run and verify failure**

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_toolkits.py -q
```

Expected: FAIL because `productivity.slack` is unsupported and `install_mcp_toolkit()` does not accept `secrets`.

- [ ] **Step 3: Add registry metadata**

In `INSTALLABLE_MCP_REGISTRY`, add Slack and Browser Use entries:

```python
"productivity.slack": {
    "entry_id": "productivity.slack",
    "toolkit_id": "mcp.productivity.slack",
    "toolkit_name": "Slack",
    "toolkit_description": "Send messages and read channels via Slack MCP.",
    "toolkit_icon": {"type": "builtin", "name": "link", "color": "#ffffff", "backgroundColor": "#4A154B"},
    "license": "Unverified",
    "source_repo": "https://github.com/modelcontextprotocol/servers",
    "docs_url": "https://github.com/modelcontextprotocol/servers",
    "secret_keys": ["SLACK_BOT_TOKEN"],
    "mcp": {"transport": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-slack"]},
},
"browser.browser-use-local": {
    "entry_id": "browser.browser-use-local",
    "toolkit_id": "mcp.browser.browser-use-local",
    "toolkit_name": "Browser Use",
    "toolkit_description": "Local browser-use MCP server.",
    "toolkit_icon": {"type": "builtin", "name": "globe", "color": "#2563eb", "backgroundColor": "#dbeafe"},
    "license": "MIT",
    "source_repo": "https://github.com/browser-use/browser-use",
    "docs_url": "https://github.com/browser-use/browser-use",
    "secret_keys": ["OPENAI_API_KEY"],
    "mcp": {"transport": "stdio", "command": "uvx", "args": ["--from", "browser-use[cli]", "browser-use", "--mcp"]},
},
```

- [ ] **Step 4: Update resolver and installer**

Change `_resolve_mcp_config()` to include `env`:

```python
def _resolve_mcp_config(entry, workspace_root="", secrets=None):
    ...
    secret_values = secrets or {}
    env = {}
    for key in entry.get("secret_keys") or []:
        value = str(secret_values.get(key) or "").strip()
        if not value:
            raise McpToolkitError("mcp_secret_required", f"{key} is required", 400)
        env[key] = value
    return {
        "transport": "stdio",
        "command": ...,
        "args": args,
        "env": env,
        "workspace_root": resolved_workspace,
    }
```

Change `_discover_tools()` and `build_mcp_runtime_toolkit()` to pass `env`:

```python
toolkit = factory(
    command=resolved_config["command"],
    args=list(resolved_config.get("args") or []),
    env=dict(resolved_config.get("env") or {}),
    transport="stdio",
)
```

Persist only `secret_keys`, not values.

- [ ] **Step 5: Verify pass**

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_toolkits.py -q
```

Expected: PASS.

---

## Task 3: HTTP / Streamable HTTP MCP Support

**Files:**
- Modify: `unchain_runtime/server/mcp_toolkits.py`
- Modify: `unchain_runtime/server/tests/test_mcp_toolkits.py`

- [ ] **Step 1: Add failing tests for HTTP normalization**

```python
def test_http_entry_builds_streamable_http_toolkit(self):
    install_mcp_toolkit(
        "dev.github-remote",
        secrets={"GITHUB_MCP_PAT": "ghp_test"},
        data_dir=self.data_dir,
        toolkit_factory=FakeMCPToolkit,
    )

    kwargs = FakeMCPToolkit.instances[-1].kwargs
    self.assertEqual(kwargs["transport"], "streamable_http")
    self.assertEqual(kwargs["url"], "https://api.githubcopilot.com/mcp/")
    self.assertEqual(kwargs["headers"]["Authorization"], "Bearer ghp_test")
```

- [ ] **Step 2: Run and verify failure**

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_toolkits.py -q
```

Expected: FAIL because HTTP transport is unsupported.

- [ ] **Step 3: Add GitHub and Notion registry entries**

Add entries with `mcp.transport = "http"` and `transport_runtime = "streamable_http"`:

```python
"dev.github-remote": {
    "entry_id": "dev.github-remote",
    "toolkit_id": "mcp.dev.github-remote",
    "toolkit_name": "GitHub",
    "toolkit_description": "Remote GitHub MCP server.",
    "toolkit_icon": {"type": "builtin", "name": "github", "color": "#ffffff", "backgroundColor": "#1f2328"},
    "license": "MIT",
    "source_repo": "https://github.com/github/github-mcp-server",
    "docs_url": "https://github.com/github/github-mcp-server",
    "secret_keys": ["GITHUB_MCP_PAT"],
    "mcp": {
        "transport": "http",
        "runtime_transport": "streamable_http",
        "url": "https://api.githubcopilot.com/mcp/",
        "headers": [{"name": "Authorization", "value_template": "Bearer ${GITHUB_MCP_PAT}"}],
    },
},
"productivity.notion-remote": {
    "entry_id": "productivity.notion-remote",
    "toolkit_id": "mcp.productivity.notion-remote",
    "toolkit_name": "Notion",
    "toolkit_description": "Hosted remote MCP for Notion.",
    "toolkit_icon": {"type": "builtin", "name": "server", "color": "#ffffff", "backgroundColor": "#191919"},
    "license": "hosted",
    "source_repo": "https://developers.notion.com/docs/get-started-with-mcp",
    "docs_url": "https://developers.notion.com/docs/get-started-with-mcp",
    "secret_keys": [],
    "requires_oauth": True,
    "mcp": {"transport": "http", "runtime_transport": "streamable_http", "url": "https://mcp.notion.com/mcp", "headers": []},
},
```

- [ ] **Step 4: Resolve HTTP configs**

Implement HTTP path:

```python
if mcp.get("transport") == "http":
    headers = {}
    for header in mcp.get("headers") or []:
        name = str(header.get("name") or "").strip()
        value = str(header.get("value_template") or "")
        for key, secret in secret_values.items():
            value = value.replace("${" + key + "}", str(secret))
        if name and value:
            headers[name] = value
    return {
        "transport": "streamable_http",
        "url": str(mcp.get("url") or "").strip(),
        "headers": headers,
        "workspace_root": "",
    }
```

Persist `url`, `transport`, `headers_template` metadata only. Do not persist resolved header values.

- [ ] **Step 5: Verify pass**

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_toolkits.py -q
```

Expected: PASS.

---

## Task 4: Runtime Build Uses Stored Secret References

**Files:**
- Modify: `unchain_runtime/server/mcp_toolkits.py`
- Modify: `unchain_runtime/server/tests/test_mcp_toolkits.py`

- [ ] **Step 1: Add failing runtime test**

```python
def test_build_runtime_toolkit_resolves_secrets_at_runtime(self):
    install_mcp_toolkit(
        "productivity.slack",
        secrets={"SLACK_BOT_TOKEN": "xoxb-test"},
        data_dir=self.data_dir,
        toolkit_factory=FakeMCPToolkit,
    )

    toolkit = build_mcp_runtime_toolkit(
        "mcp.productivity.slack",
        data_dir=self.data_dir,
        toolkit_factory=FakeMCPToolkit,
    )

    self.assertTrue(toolkit.connected)
    self.assertEqual(FakeMCPToolkit.instances[-1].kwargs["env"]["SLACK_BOT_TOKEN"], "xoxb-test")
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL because runtime build cannot resolve secret values.

- [ ] **Step 3: Save secrets on successful install and resolve them on runtime build**

In `install_mcp_toolkit()`:

```python
from mcp_secrets import save_mcp_secret_values

...
if entry.get("secret_keys"):
    save_mcp_secret_values(toolkit_id, {key: secrets[key] for key in entry["secret_keys"]}, data_dir=data_dir)
```

In `build_mcp_runtime_toolkit()`:

```python
from mcp_secrets import get_mcp_secret_value

entry = _registry_entry(record.get("entry_id", ""))
secrets = {
    key: get_mcp_secret_value(record["toolkit_id"], key, data_dir=data_dir)
    for key in entry.get("secret_keys") or []
}
resolved_config = _resolve_mcp_config(entry, record.get("workspace_root", ""), secrets)
```

- [ ] **Step 4: Verify pass**

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_toolkits.py unchain_runtime/server/tests/test_mcp_secrets.py -q
```

Expected: PASS.

---

## Task 5: API / IPC / Frontend Wrappers for Setup Payloads

**Files:**
- Modify: `unchain_runtime/server/route_mcp.py`
- Modify: `electron/shared/channels.js`
- Modify: `electron/main/ipc/register_handlers.js`
- Modify: `electron/main/services/unchain/service.js`
- Modify: `electron/preload/bridges/unchain_bridge.js`
- Modify: `src/SERVICEs/api.unchain.js`
- Modify: `src/SERVICEs/api.mcpToolkits.test.js`

- [ ] **Step 1: Define request payloads**

Install payload:

```js
{
  entryId: "productivity.slack",
  workspaceRoot: "",
  secrets: { SLACK_BOT_TOKEN: "xoxb-..." },
  customRecipe: null
}
```

Backend accepts snake/camel:

```python
payload = request.get_json(silent=True) or {}
secrets = payload.get("secrets") if isinstance(payload.get("secrets"), dict) else {}
custom_recipe = payload.get("customRecipe") or payload.get("custom_recipe")
```

- [ ] **Step 2: Add tests for frontend wrapper pass-through**

In `src/SERVICEs/api.mcpToolkits.test.js`:

```js
test("installMcpToolkit passes secrets and custom recipe through the bridge", async () => {
  window.unchainAPI = {
    installMcpToolkit: jest.fn().mockResolvedValue({ toolkit: { toolkitId: "mcp.productivity.slack" } }),
  };
  await api.unchain.installMcpToolkit({
    entryId: "productivity.slack",
    secrets: { SLACK_BOT_TOKEN: "xoxb-test" },
  });
  expect(window.unchainAPI.installMcpToolkit).toHaveBeenCalledWith({
    entryId: "productivity.slack",
    secrets: { SLACK_BOT_TOKEN: "xoxb-test" },
  });
});
```

- [ ] **Step 3: Add service proxy support**

In `electron/main/services/unchain/service.js`, update `installMisoMcpToolkit()` body:

```js
const secrets =
  source.secrets && typeof source.secrets === "object" && !Array.isArray(source.secrets)
    ? source.secrets
    : {};
const customRecipe =
  source.customRecipe && typeof source.customRecipe === "object"
    ? source.customRecipe
    : source.custom_recipe && typeof source.custom_recipe === "object"
      ? source.custom_recipe
      : null;
body: JSON.stringify({
  entry_id: entryId,
  ...normalizeMcpPayload(source),
  ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
  ...(customRecipe ? { custom_recipe: customRecipe } : {}),
})
```

- [ ] **Step 4: Verify Electron/API tests**

```bash
npm test -- --watchAll=false src/electron/tests/preload/api_contract.test.js src/electron/tests/main/unchain_service_loader.test.js src/SERVICEs/api.mcpToolkits.test.js
```

Expected: PASS.

---

## Task 6: Custom MCP Recipe Support

**Files:**
- Modify: `unchain_runtime/server/mcp_toolkits.py`
- Modify: `unchain_runtime/server/tests/test_mcp_toolkits.py`
- Modify: `src/SERVICEs/mcp_install.js`
- Create: `src/SERVICEs/mcp_custom_recipe.test.js`

- [ ] **Step 1: Backend custom recipe test**

```python
def test_custom_stdio_recipe_installs_after_validation(self):
    result = install_mcp_toolkit(
        "custom",
        custom_recipe={
            "toolkit_id": "mcp.custom.local-test",
            "toolkit_name": "Local Test",
            "mcp": {"transport": "stdio", "command": "echo", "args": ["ok"]},
        },
        data_dir=self.data_dir,
        toolkit_factory=FakeMCPToolkit,
    )
    self.assertEqual(result["toolkit"]["toolkitId"], "mcp.custom.local-test")
```

- [ ] **Step 2: Implement custom recipe validation**

Validation rules:

```python
def _custom_entry(custom_recipe):
    toolkit_id = str(custom_recipe.get("toolkit_id") or "").strip()
    if not toolkit_id.startswith("mcp.custom."):
        raise McpToolkitError("invalid_custom_mcp_recipe", "custom toolkit_id must start with mcp.custom.", 400)
    mcp = custom_recipe.get("mcp")
    if not isinstance(mcp, dict):
        raise McpToolkitError("invalid_custom_mcp_recipe", "mcp config is required", 400)
    transport = mcp.get("transport")
    if transport not in {"stdio", "http"}:
        raise McpToolkitError("invalid_custom_mcp_recipe", "transport must be stdio or http", 400)
    return {...}
```

Custom stdio allows only explicit command/args entered by user after confirmation. Custom HTTP normalizes to `streamable_http`.

- [ ] **Step 3: Frontend helper test**

```js
import { normalizeCustomMcpRecipe } from "./mcp_install";

test("normalizes custom stdio recipe", () => {
  expect(normalizeCustomMcpRecipe({
    name: "Local",
    command: "npx",
    argsText: "-y server",
  })).toEqual({
    toolkit_id: expect.stringMatching(/^mcp.custom./),
    toolkit_name: "Local",
    mcp: { transport: "stdio", command: "npx", args: ["-y", "server"] },
  });
});
```

- [ ] **Step 4: Verify tests**

```bash
PYTHONPATH=unchain_runtime/server pytest unchain_runtime/server/tests/test_mcp_toolkits.py -q
npm test -- --watchAll=false src/SERVICEs/mcp_custom_recipe.test.js
```

Expected: PASS.

---

## Task 7: UI Setup Forms and Settings Management

**Files:**
- Modify: `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js`
- Modify: `src/COMPONENTs/toolkit/components/store_toolkit_card.js`
- Modify: `src/COMPONENTs/toolkit/pages/toolkits_page.js`
- Modify: `src/COMPONENTs/settings/local_storage/components/mcp_toolkits_section.js`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Add UI states**

Entry action states:

```js
const setupKindForEntry = (entry) => {
  if (entry.id === "workspace.filesystem") return "workspace";
  if ((entry.secrets || []).length > 0) return "secrets";
  if (entry.mcp?.transport === "http") return entry.secrets?.length ? "http_secret" : "oauth";
  if (entry.id === "custom") return "custom";
  return "direct";
};
```

- [ ] **Step 2: Add secret form**

Detail panel renders input rows for `entry.secrets`:

```jsx
{entry.secrets?.map((secret) => (
  <Input
    key={secret.key}
    type="password"
    value={secretValues[secret.key] || ""}
    onChange={(event) => setSecretValues((prev) => ({ ...prev, [secret.key]: event.target.value }))}
    placeholder={secret.label}
  />
))}
```

Submit:

```js
onInstall(entry, { secrets: secretValues });
```

- [ ] **Step 3: Add HTTP/OAuth copy**

For Notion OAuth, show disabled action:

```jsx
<Button disabled>{t("toolkit.store_oauth_coming_soon")}</Button>
```

Until OAuth implementation is explicitly added, Notion remains visible but not installable.

- [ ] **Step 4: Settings secret status**

Settings row shows:

- `Secrets configured` when `secretStatus.every(s => s.configured)`
- `Missing secrets` when any required secret is missing
- `Reconnect` action opens the same setup form

- [ ] **Step 5: Verify UI tests**

```bash
npm test -- --watchAll=false src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.test.js src/COMPONENTs/settings/local_storage/components/mcp_toolkits_section.test.js
```

Expected: PASS.

---

## Task 8: End-to-End Verification

**Files:**
- No new files.

- [ ] **Step 1: Backend verification**

```bash
PYTHONPATH=unchain_runtime/server pytest \
  unchain_runtime/server/tests/test_mcp_toolkits.py \
  unchain_runtime/server/tests/test_mcp_secrets.py \
  unchain_runtime/server/tests/test_toolkits_catalog_route.py \
  -q
```

Expected: PASS.

- [ ] **Step 2: Electron/API verification**

```bash
npm test -- --watchAll=false \
  src/electron/tests/preload/api_contract.test.js \
  src/electron/tests/main/unchain_service_loader.test.js \
  src/electron/tests/main/ipc_channels.test.js \
  src/SERVICEs/api.mcpToolkits.test.js
```

Expected: PASS.

- [ ] **Step 3: UI verification**

```bash
npm test -- --watchAll=false \
  src/SERVICEs/mcp_install.test.js \
  src/COMPONENTs/toolkit/components/store_toolkit_card.test.js \
  src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.test.js \
  src/COMPONENTs/toolkit/pages/toolkits_page.test.js \
  src/COMPONENTs/settings/local_storage/components/mcp_toolkits_section.test.js \
  src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.test.js
```

Expected: PASS. If `toolkit_card.test.js` still fails with the known 36 vs 44 baseline issue, record it as pre-existing and do not mix it into Phase 2B.

- [ ] **Step 4: Manual smoke**

Run PuPu and verify:

1. Install Slack with a fake token returns `mcp_install_failed` or Slack server auth failure, not `unsupported_mcp_entry`.
2. Install GitHub with a PAT reaches the remote MCP endpoint and either succeeds or returns a stable auth error.
3. Installed secret-backed MCP appears in Installed, Settings, Chat selector, and Agent Builder catalog.
4. Deleting an MCP removes installed config and its saved secrets.
5. Reload all updates `lastCheckedAt` and `lastError`.

- [ ] **Step 5: GitNexus detect changes**

```bash
npm_config_cache=/tmp/pupu-gitnexus-npm-cache npx -y gitnexus@1.6.3 detect-changes --repo PuPu
```

Expected: review affected symbols; high risk is expected if IPC/service/API/shared toolkit UI changed.

---

## Self-Review

Spec coverage:

- Secret stdio: Tasks 1, 2, 4, 7.
- HTTP/streamable HTTP: Task 3.
- Runtime secret resolution: Task 4.
- Frontend/API wiring: Task 5.
- Custom MCP: Task 6.
- UI setup and Settings management: Task 7.
- Verification: Task 8.

Placeholder scan: no TBD/TODO placeholders remain.

Type consistency:

- Installed toolkit records keep Phase 2A `toolkitId`, `status`, `tools`, `lastCheckedAt`, `lastError`, `workspaceRoot`.
- Secret values are accepted only in setup payloads and secret store, not persisted into `mcp_toolkits.json`.
- HTTP transport is stored as registry `http` and runtime `streamable_http`.
