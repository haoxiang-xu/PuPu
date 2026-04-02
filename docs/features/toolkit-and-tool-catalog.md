# Toolkit & Tool Catalog

> Toolkit discovery, management, and tool execution with confirmation flow.

---

## Overview

PuPu's toolkit system allows agents to use tools (file operations, terminal commands, external APIs, custom functions). Toolkits are discovered, selected per-chat, and can require user confirmation before execution.

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
                → Confirmation required? → SSE frame → UI → response → continue
```

---

## Built-in Toolkits

| ID | Description | Confirmation Required |
|----|-------------|----------------------|
| `WorkspaceToolkit` | File read/write in workspace folders | `write_file`, `delete_file`, `move_file` |
| `TerminalToolkit` | Shell command execution | `terminal_exec` |
| `ExternalAPIToolkit` | HTTP requests to external APIs | No |
| `AskUserToolkit` | Ask user for clarification | No |

### Confirmation-Required Tools

```python
{"write_file", "delete_file", "move_file", "terminal_exec"}
```

These tools pause the stream and send a `tool_confirmation_request` frame. The stream resumes only after user approval.

---

## Toolkit ID Normalization

Multiple aliases map to canonical names:

| Input | Canonical ID |
|-------|-------------|
| `workspace`, `workspace_toolkit` | `WorkspaceToolkit` |
| `terminal`, `terminal_toolkit` | `TerminalToolkit` |
| `external_api`, `external_api_toolkit` | `ExternalAPIToolkit` |
| `ask_user`, `ask_user_toolkit` | `AskUserToolkit` |

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
  id: string,               // canonical ID
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

`default_toolkit_store.js` persists the user's default toolkit selection. When a new chat is created, it inherits these defaults.

---

## Auto-Approval Store

`toolkit_auto_approve_store.js` persists per-tool auto-approval preferences. When a tool normally requires confirmation, the auto-approve store can bypass the confirmation UI.

---

## Tool Confirmation Flow

1. Agent calls a confirmation-required tool
2. Backend sends `tool_confirmation_request` SSE frame with `confirmation_id`
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
