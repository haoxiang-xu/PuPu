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

## Skills

Skills are reusable, named instruction bundles. A user can invoke one directly with `/name`; the model can load one itself through the `skill` tool. Unlike a toolkit, most skills carry no executable tool of their own — Unchain (not PuPu) renders the catalog and resolves activation (see [PuPu / Unchain Protocol Atlas → CROSS-018](../architecture/pupu-unchain-protocols.md)).

### Where skills come from

Unchain's `SkillRegistry` merges these sources, lowest rank wins on a name collision:

| Source | Rank | Where |
|--------|-----:|-------|
| Installed skill packs | 600 | every installed pure-skill pack, regardless of which toolkits are selected for the run (`unchain_runtime/server/skills_inventory.py`) |
| Toolkit-embedded `[[skills]]` | 600 | only the executable toolkits actually *selected* for the run — the renderer asks the inventory for exactly the chat's selected toolkit ids (`GET /skills/inventory?toolkits=…`), the run attaches the same descriptors to the instantiated toolkits (`source="toolkit"`, `source_id=<catalog id>`), and the 409 stale check resolves with `options.toolkits`, so menu, dispatch and execution share one identity; an *unselected* toolkit's embedded skills are not offered at all (its tools would not be available either) |
| Workspace `.unchain/skills/<name>/SKILL.md` | 100 | current workspace root |
| Workspace `.agents/skills/<name>/SKILL.md` | 200 | current workspace root |
| User `~/.unchain/skills/<name>/SKILL.md` | 400 | home directory, only when `skills.include_user_dirs` is on |
| User `~/.agents/skills/<name>/SKILL.md` | 500 | home directory, only when `skills.include_user_dirs` is on |

`skills.include_user_dirs` is a runtime setting (default on), forwarded as `options.skills.include_user_dirs` on every composer send.

### Backend inventory is the command-menu source of truth

`GET /skills/inventory` (schema `pupu.skill_inventory.v1`) is the **only** source `plugin_skill_sync.syncSkillInventory` reads to register `/name` commands — the toolkit catalog no longer registers skill commands at all, so there is no second authority whose request-completion order could change which source a duplicate name resolves to. Shadowed or ambiguous entries appear only in `diagnostics` and never become commands. The menu is refreshed on toolkit-catalog refresh, on active-chat / selected-toolkit changes and on `runtime` settings changes (workspace root, `skills.include_user_dirs`), debounced; the inventory `revision` binds the effective alias→identity map and the reserved commands too, so an alias moving from one skill to another is a `409 skill_inventory_stale` refusal rather than a silent switch. Each entry carries the *canonical* slug: a legacy pack skill named e.g. `Echo_Loud` is filed and invoked as `/echo-loud`, with `Echo_Loud` kept as an alias so the old spelling still resolves. `model_invocable` / `user_invocable` policy flags come from a pack's `disable-model-invocation` / `user-invocable` frontmatter keys (every spelling that is present is evaluated; an invalid explicit value is a diagnostic and falls back to the restrictive setting, never the permissive one). Canonical-name collisions inside one pack keep every skill: the row already spelled canonically owns the name and the others get a `-2`, `-3`… suffix with their raw spelling as an alias, both marked `name_collision:`. `/btw`, `/fyi`, `/queue`, and the deprecated `/steer` are reserved — they never resolve as skill invocations, even if a pack happens to declare a skill with that name.

### The composer sends the user's text verbatim

Since ticket #291, `buildComposerSend` no longer expands a `/name` token into a template before sending: the outgoing text is exactly the text the user accepted. The composer sidecar attached to the message is presentational only and always carries `templateLength: 0`. Unchain itself renders the `<available_skills>` system catalog, exposes the `skill` tool, and resolves `/name` tokens anywhere in the user's message; the renderer's job is limited to listing commands in the menu and selecting, for that one run, the toolkit that owns a chosen pack skill.

### Stale inventory

Every composer send also carries `options.skill_inventory_revision` — the last inventory revision the renderer fetched. If it no longer matches the backend's current revision, `route_chat` refuses the send with `409 {"error": {"code": "skill_inventory_stale"}}` before opening the stream. The renderer refreshes the inventory, shows a "Skills changed" toast, and the user resends.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /toolkits/catalog` | GET | V1 catalog (flat list) |
| `GET /toolkits/catalog/v2` | GET | V2 catalog (richer metadata) |
| `GET /toolkits/<id>/metadata` | GET | Individual toolkit detail |
| `GET /skills/inventory` | GET | Backend-authoritative skill inventory (packs + workspace/user skill directories) |

---

## Key Files

| File | Role |
|------|------|
| `src/COMPONENTs/toolkit/` | Toolkit selection modal UI |
| `src/SERVICEs/api.unchain.js` | Catalog API facade |
| `src/SERVICEs/default_toolkit_store.js` | Default selection persistence |
| `src/SERVICEs/toolkit_auto_approve_store.js` | Auto-approval persistence |
| `src/SERVICEs/plugin_skill_sync.js` | Registers `/name` commands from the skill inventory only; `startSkillInventorySync` owns the refresh triggers |
| `src/SERVICEs/skill_frontmatter.js` | Port of Unchain's SKILL.md frontmatter parser used by the pack importer (block scalars, nested metadata, duplicate-key rejection) |
| `src/SERVICEs/skill_inventory_store.js` | Renderer-side cache of the skill inventory response |
| `unchain_runtime/server/unchain_adapter.py` | Toolkit discovery + attachment |
| `unchain_runtime/server/route_catalog.py` | Catalog endpoints |
| `unchain_runtime/server/skills_inventory.py` | Skill inventory resolution (backend authority) |
| `unchain_runtime/server/route_skills.py` | Skill inventory route |
