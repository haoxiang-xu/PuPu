# Flask Endpoints

> Complete HTTP API reference for the Python Flask sidecar (`unchain_runtime/server`).

---

## Overview

The Flask sidecar runs on `127.0.0.1` (loopback only), with a per-session auth token passed via the `x-unchain-auth` header.

Auth is enforced in **two distinct layers**:

1. **Blueprint `@before_request` — loopback enforcement only.** `reject_non_loopback_requests()` (registered on the blueprint) rejects any request whose remote address is not loopback, returning `403` with error code `non_loopback_forbidden`. It does **not** check the token.
2. **Per-handler token check — `_is_authorized()`.** Each handler calls `_is_authorized()` (typically as its first line) and returns `401 unauthorized` on a bad/missing token. This means `/health` **does** require auth (see below). The only deliberate exception is `GET /mcp/oauth/callback`, which must be reachable by the external OAuth provider's redirect and therefore skips the token check.

`_is_authorized()` accepts the token from any of: header `x-unchain-auth`, query `unchain_auth`, or query `miso_auth` (legacy), compared in constant time.

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | required | Health check — calls `_is_authorized()` first; returns `401 unauthorized` without a valid token |

> Despite the name, `/health` is **not** unauthenticated. Probes must send the auth token.

---

## Catalog

| Method | Path | Description |
|--------|------|-------------|
| GET | `/models/catalog` | Model provider catalog (all providers + capabilities) |
| GET | `/toolkits/catalog` | Toolkit catalog V1 |
| GET | `/toolkits/catalog/v2` | Toolkit catalog V2 (richer metadata, per-tool details) |
| GET | `/toolkits/<toolkit_id>/metadata` | Individual toolkit metadata by ID |

---

## Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/stream` | Chat streaming V1 (legacy, simple events) |
| POST | `/chat/stream/v2` | Chat streaming V2 (manually-built frame SSE protocol) |
| POST | `/chat/stream/v4` | Chat streaming V4 (normalized RuntimeEvent SSE, driven by `RuntimeEventBridge`) |
| POST | `/chat/tool/confirmation` | Submit tool confirmation response |

> There is no `/chat/stream/v3` HTTP route. The current pair is **V2** (legacy frames) and **V4** (runtime events). The "V3" runtime-event frame protocol is consumed by the frontend over the V4 transport — see [Runtime Events V3](../architecture/runtime-events-v3.md).

### `/chat/stream/v2` and `/chat/stream/v4` Request Body

```json
{
  "message": "Hello",
  "history": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ],
  "threadId": "thread-123",
  "attachments": [],
  "selectedToolkits": ["workspace_toolkit"],
  "workspace_roots": ["/path/to/workspace"],
  "options": {
    "model": "gpt-4.1",
    "provider": "openai",
    "api_key": "...",
    "memory_enabled": true,
    "memory_session_id": "session-123",
    "memory_embedding_provider": "openai",
    "system_prompt_v2_sections": {
      "personality": "...",
      "rules": "..."
    }
  }
}
```

### `/chat/stream/v2` SSE Response

V2 builds trace frames manually (`_build_trace_frame()`) and emits `event: frame` payloads. See [Request Flow & Streaming](../architecture/request-flow-and-streaming.md) for the complete SSE frame protocol.

### `/chat/stream/v4` SSE Response

V4 is handled by `chat_stream_v4()` and driven by `RuntimeEventBridge` (imported from the unchain core library's `unchain.events`): `emit_session_started()` → `normalize(raw_event)` per event → `diagnostics()` at the end, with `emit_transport_failure()` on transport errors. It emits normalized runtime events. If `RuntimeEventBridge` is unavailable, the route returns `500` with error code `runtime_events_unavailable`.

See [Runtime Events V3](../architecture/runtime-events-v3.md) for the event schema and frontend state path.

### `/chat/tool/confirmation` Request Body

```json
{
  "confirmation_id": "...",
  "approved": true
}
```

---

## Characters

| Method | Path | Description |
|--------|------|-------------|
| GET | `/characters/seeds` | List builtin/seed characters |
| GET | `/characters/seeds/<id>/avatar` | Seed character avatar asset |
| GET | `/characters` | List user characters |
| GET | `/characters/<id>` | Get specific character |
| GET | `/characters/<id>/avatar` | Character avatar asset |
| POST | `/characters` | Save/create character |
| DELETE | `/characters/<id>` | Delete character (cascade) |
| POST | `/characters/preview` | Preview character evaluation + decision |
| POST | `/characters/build` | Build character agent config |
| POST | `/characters/<id>/export` | Export character as archive |
| POST | `/characters/import` | Import character from archive |

---

## MCP

MCP backend routes live in `route_mcp.py` (~23 routes), grouped by prefix. All require auth via `_is_authorized()` **except** `GET /mcp/oauth/callback`, which is reached by the external OAuth provider's redirect.

### Toolkits (`/mcp/toolkits`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mcp/toolkits` | List installed MCP toolkits |
| POST | `/mcp/toolkits/install` | Install a toolkit from the store |
| DELETE | `/mcp/toolkits/<toolkit_id>` | Remove a toolkit |
| POST | `/mcp/toolkits/reload` | Reload all toolkits |
| POST | `/mcp/toolkits/<toolkit_id>/health` | Check a toolkit's health |
| POST | `/mcp/toolkits/<toolkit_id>/configure` | Configure a toolkit |

### OAuth (`/mcp/oauth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mcp/oauth/start` | Initiate an OAuth flow |
| GET | `/mcp/oauth/callback` | OAuth redirect callback (**no token auth** — reached by provider) |
| GET | `/mcp/oauth/status` | OAuth status for a toolkit |
| GET | `/mcp/oauth/apps` | List OAuth app configurations |
| POST | `/mcp/oauth/apps/configure` | Configure an OAuth app |
| DELETE | `/mcp/oauth/apps/<toolkit_id>` | Delete an OAuth app config |
| DELETE | `/mcp/oauth/<toolkit_id>` | Disconnect OAuth for a toolkit |

### Store (`/mcp/store`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mcp/store/metadata` | List store metadata |
| POST | `/mcp/store/metadata/reload` | Reload store metadata |
| GET | `/mcp/store/entries` | List store entries |
| POST | `/mcp/store/entries/<entry_id>/approve` | Approve a store entry |
| DELETE | `/mcp/store/entries/<entry_id>/approval` | Revoke an entry's approval |
| GET | `/mcp/store/registries` | List external registries |
| POST | `/mcp/store/registries/import` | Import an external registry |
| POST | `/mcp/store/registries/validate` | Validate a registry config |
| POST | `/mcp/store/registries/<registry_id>/refresh` | Refresh a registry's entries |
| DELETE | `/mcp/store/registries/<registry_id>` | Delete an external registry |

> MCP *code* lives in `route_mcp.py` + the `mcp_*.py` backend modules. The MCP *security posture* (OAuth flow, secret storage, permission model, approval gating) is owned by the security review process — see `mcp_oauth.py`, `mcp_secrets.py`, `mcp_permission_audit.py`.

---

## Agent Recipes

Routes in `route_recipes.py`, backed by `recipe_loader.py` (recipes under `~/.pupu/agent_recipes/`). All require auth.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agent_recipes` | List all recipes (metadata) |
| GET | `/agent_recipes/subagent_refs` | List available subagent source files for referencing |
| GET | `/agent_recipes/<name>` | Get a specific recipe |
| POST | `/agent_recipes` | Create/save a recipe |
| DELETE | `/agent_recipes/<name>` | Delete a recipe (the `Default` recipe is protected) |

See [Agent Orchestration](../features/agent-orchestration.md#subagent--recipe-loading-backend) for recipe/subagent structure.

---

## Memory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/memory/projection` | Session memory vector projection (for visualization) |
| GET | `/memory/long-term/projection` | Long-term memory projection |
| POST | `/memory/session/replace` | Replace session memory from message history |
| GET | `/memory/session/export` | Export session memory as structured data |

### `/memory/projection` Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `session_id` | string | Session to project |

---

## Authentication

Two enforcement layers (see [Overview](#overview)):

- **Loopback** — blueprint `@before_request` (`reject_non_loopback_requests()`) rejects non-loopback callers with `403 non_loopback_forbidden`. Loopback detection accepts literal `localhost`, strips the IPv6 `::ffff:` prefix, then checks `ipaddress.ip_address(...).is_loopback`.
- **Token** — each handler calls `_is_authorized()`, which accepts the token from (in order): header `x-unchain-auth`, query `unchain_auth`, or query `miso_auth` (legacy). Compared in constant time against the per-session token.

```
x-unchain-auth: <auth-token>
```

The token is generated by the Electron main process at startup and passed to both the Flask sidecar and the IPC layer. The only route that skips the token check is `GET /mcp/oauth/callback`.

---

## Error Response Format

```json
{
  "error": {
    "code": "invalid_request",
    "message": "..."
  }
}
```

Shared codes emitted via `_json_error()`:

| Code | HTTP | Meaning |
|------|------|---------|
| `unauthorized` | 401 | Missing/invalid auth token |
| `invalid_request` | 400 | Malformed request / missing required field (this is the code in use — **not** `bad_request`) |
| `not_found` | 404 | Resource not found |
| `non_loopback_forbidden` | 403 | Request from a non-loopback address |

Route-specific codes (direct JSON responses): `runtime_events_unavailable` (500, V4 bridge missing), `stream_failed`, `memory_unavailable`, `invalid_api_key`, `memory_replace_failed` (chat/memory), `mcp_request_failed` (MCP), `subagent_refs_failed`, `recipe_*_failed` / `recipe_*_refused` / `recipe_invalid` (recipes), `seed_character_list_failed` / `character_*_failed` / `character_*_refused` (characters).

> There is no generic `internal_error` code; failures surface as the specific codes above.

---

## Route Modules

The routes are split across module files. `routes.py` is now an **aggregator** (~3KB): it imports every `route_*` module to trigger registration on the shared blueprint and re-exports the shared helpers (`api_blueprint`, `_is_authorized`, `_json_error`) and handler functions via `__all__`. It contains **no** `@route` decorators of its own.

| Module | Path prefix | Routes |
|--------|-------------|--------|
| `routes.py` | (aggregator) | re-export only, no routes |
| `route_blueprint.py` | (blueprint def) | defines the shared `api_blueprint` |
| `route_auth.py` | (utilities) | `reject_non_loopback_requests`, `_is_authorized`, `_json_error` |
| `route_catalog.py` | `/health`, `/models`, `/toolkits` | catalog + health |
| `route_chat.py` | `/chat/*` | stream v1/v2/v4 + tool confirmation |
| `route_characters.py` | `/characters/*` | character CRUD + build/import/export |
| `route_memory.py` | `/memory/*` | session replace/export |
| `route_projection.py` | `/memory/projection`, `/memory/long-term/projection` | vector projections |
| `route_mcp.py` | `/mcp/*` | ~23 toolkit/oauth/store routes |
| `route_recipes.py` | `/agent_recipes/*` | recipe CRUD + subagent refs |

---

## Key Files

| File | Role |
|------|------|
| `unchain_runtime/server/routes.py` | Aggregator + re-export (~3KB, no routes) |
| `unchain_runtime/server/route_*.py` | Per-area route modules |
| `unchain_runtime/server/mcp_*.py` | MCP backend (toolkits, oauth, registries, secrets, permissions) |
| `unchain_runtime/server/recipe_loader.py` / `subagent_loader.py` | Recipe + subagent loaders |
| `unchain_runtime/server/app.py` | Flask app factory |
| `unchain_runtime/server/main.py` | Entry point |
