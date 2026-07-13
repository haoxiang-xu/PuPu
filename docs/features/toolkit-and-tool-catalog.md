# Toolkit & Tool Catalog

> Toolkit discovery, management, and tool execution with confirmation flow.

---

## Overview

PuPu's toolkit system allows agents to use tools (file operations, shell commands, web fetch, LSP, planning, Agent Reach, MCP tools, and custom functions). Toolkits are discovered, selected per-chat, and can require user confirmation before execution.

---

## End-to-End Flow

```
Toolkit Discovery (backend)
  → Catalog served via /toolkits/catalog/v2
    → Frontend displays in Toolkit Modal
      → User selects toolkits per chat
        → Selection saved in chat session (selectedToolkits)
          → Sent in stream payload
            → Backend attaches tools to agent
              → Agent calls tools during streaming
                → Confirmation required? → SSE event → UI → response → continue
```

---

## Built-in Toolkits

| ID | Description | Confirmation Required |
|----|-------------|----------------------|
| `core` | Read, write, edit, glob, grep, shell, LSP, web fetch, and Ask User tools | `write`, `edit`, `shell` |
| `plan` | Plan snapshots and planning helpers | Tool metadata controls confirmation |
| `agent_reach` | External research/reach tools when installed | Tool metadata controls confirmation |

Legacy built-in ids such as `workspace_toolkit`, `terminal_toolkit`,
`web_toolkit`, `external_api`, and `git` are not public catalog entries. They
are compatibility aliases that normalize to `core`.

### Confirmation-Required Tools

```python
{
  "core:write",
  "core:edit",
  "core:shell",
}
```

These tools pause the stream and emit either a V2 `tool_call` frame with `confirmation_id` or a V3 `input.requested` RuntimeEvent. The stream resumes only after user approval.

---

## Toolkit ID Normalization

Multiple aliases map to canonical `toolkitId` values:

| Input | Canonical ID |
|-------|-------------|
| `workspace`, `workspace_toolkit`, `access_workspace_toolkit`, `WorkspaceToolkit` | `core` |
| `terminal`, `terminal_toolkit`, `run_terminal_toolkit`, `TerminalToolkit` | `core` |
| `code`, `code_toolkit`, `CodeToolkit` | `core` |
| `ask_user`, `ask_user_toolkit`, `ask-user-toolkit`, `AskUserToolkit` | `core` |
| `interaction`, `interaction_toolkit`, `InteractionToolkit` | `core` |
| `web`, `web_toolkit`, `WebToolkit` | `core` |
| `external_api`, `external_api_toolkit`, `ExternalAPIToolkit` | `core` |
| `git`, `git_toolkit`, `GitToolkit` | `core` |
| `plan`, `plan_toolkit`, `PlanToolkit` | `plan` |

Removed IDs (silently stripped): `mcp`, `mcptoolkit`.

---

## Custom Toolkits (toolkit.toml)

Users can define custom toolkits in workspace directories:

```toml
[toolkit]
name = "My Custom Toolkit"
description = "What it does"
icon = "wrench"

[[tools]]
name = "my_tool"
description = "What this tool does"
```

The backend discovers these files during toolkit catalog generation.

---

## Catalog V2 Entry

```javascript
{
  toolkitId: string,        // canonical toolkitId
  name: string,             // display name
  description: string,
  icon?: string,            // icon identifier
  readme?: string,          // markdown documentation
  tools: [
    {
      name: string,         // function name
      description: string,
      parameters?: object,  // JSON Schema
      requires_confirmation?: boolean,
    },
  ],
}
```

---

## Per-Chat Selection

Each chat stores `selectedToolkits: string[]` (max 50 items).

- New chats inherit from the Default Toolkit Store
- Character chats force `selectedToolkits: []`
- Selection is sent in the stream payload for the backend to resolve

---

## Default Toolkit Store

`default_toolkit_store.js` persists the user's default toolkit selection as canonical `toolkitId` values. When a new chat is created, it inherits these defaults. If the user has never configured a global default, `core` is seeded automatically.

---

## Auto-Approval Store

`toolkit_auto_approve_store.js` persists toolkit-level and tool-level auto-approval preferences. Tool-level entries are stored as `toolkitId:toolName`, so generic names like `write` are scoped to the owning toolkit.

---

## Tool Confirmation Flow

1. Agent calls a confirmation-required tool
2. Backend sends either a V2 `tool_call` frame with `confirmation_id` or a V3 `input.requested` event
3. Backend blocks on `threading.Event.wait()` until response
4. Frontend renders confirmation UI (`toolConfirmationUiStateById` in `use_chat_stream.js`)
5. User approves/denies
6. Frontend calls `api.unchain.respondToolConfirmation({ confirmation_id, approved })`
7. Backend unblocks and continues or cancels the tool call

---

## Icon Resolution

Toolkit icons are resolved in order:
1. Explicit icon in toolkit metadata
2. Icon from `toolkit.toml`
3. Default icon for the toolkit type

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /toolkits/catalog` | GET | V1 catalog (flat list) |
| `GET /toolkits/catalog/v2` | GET | V2 catalog (richer metadata) |
| `GET /toolkits/<id>/metadata` | GET | Individual toolkit detail |

---

## Key Files

| File | Role |
|------|------|
| `src/COMPONENTs/toolkit/` | Toolkit selection modal UI |
| `src/SERVICEs/api.unchain.js` | Catalog API facade |
| `src/SERVICEs/default_toolkit_store.js` | Default selection persistence |
| `src/SERVICEs/toolkit_auto_approve_store.js` | Auto-approval persistence |
| `unchain_runtime/server/unchain_adapter.py` | Toolkit discovery + attachment |
| `unchain_runtime/server/route_catalog.py` | Catalog endpoints |
