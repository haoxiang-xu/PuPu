# Storage Model

> localStorage-based chat persistence with tree structure and LRU eviction.

---

## Overview

PuPu persists all chat data in the browser's `localStorage` under the key `"chats"`. The store follows a schema-versioned format (currently **version 2**) with tree-based organization and automatic size management.

---

## Store Shape (V2)

```javascript
{
  schemaVersion: 2,
  updatedAt: number,                    // last modification timestamp
  chatsById: { [chatId]: ChatSession }, // all chat sessions
  activeChatId: string | null,          // currently viewed chat
  lruChatIds: string[],                 // least-recently-used order
  tree: {
    root: string[],                     // top-level node IDs
    nodesById: { [nodeId]: TreeNode },  // folder and chat nodes
    selectedNodeId: string | null,      // selected in explorer
    expandedFolderIds: string[],        // expanded folders
  },
  ui: {},                               // reserved for UI state
}
```

---

## Size Management

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_TOTAL_BYTES` | 4,718,592 (4.5 MB) | Hard limit |
| `TARGET_TOTAL_BYTES` | 4,404,019 (4.2 MB) | Trim target |
| `MAX_ACTIVE_MESSAGES_WHEN_TRIMMING` | 200 | Keep last N messages in active chat |

When the store exceeds `MAX_TOTAL_BYTES`, messages are trimmed from the least-recently-used chats (excluding the active chat) until the total falls below `TARGET_TOTAL_BYTES`.

---

## Tree Nodes

### Folder Node

```javascript
{
  id: string,            // "fld-{timestamp}-{random}"
  entity: "folder",
  type: "folder",
  label: string,         // max 120 chars
  children: string[],    // ordered child node IDs
  createdAt: number,
  updatedAt: number,
}
```

### Chat Node

```javascript
{
  id: string,            // "chn-{chatId}"
  entity: "chat",
  type: "file",
  chatId: string,        // references chatsById key
  label: string,         // mirrors chat title
  createdAt: number,
  updatedAt: number,
}
```

---

## ID Generation

```javascript
generateId(prefix)    → "{prefix}-{Date.now()}-{Math.random().toString(16).slice(2)}"
generateChatId()      → "chat-..."
generateFolderId()    → "fld-..."
toChatNodeId(chatId)  → "chn-{chatId}"
```

---

## Bootstrap Flow

`bootstrapChatsStore()`:
1. Read raw JSON from `localStorage.getItem("chats")`
2. If schema version < 2, migrate (adds tree structure from flat chat list)
3. Sanitize all sessions via `sanitizeChatSession()`
4. Build tree if missing via `makeInitialTreeFromChats()`
5. Set `activeChatId` (from stored value or first chat in tree)
6. Notify subscribers

---

## Mutation API

All mutations go through exported functions in `chat_storage_store.js`. These update the in-memory store, persist to localStorage, and notify subscribers.

### Chat Lifecycle

| Function | Description |
|----------|-------------|
| `createChatInSelectedContext()` | Create new chat in current folder |
| `createChatWithMessagesInSelectedContext(messages, overrides)` | Create chat with initial messages |
| `openCharacterChat(characterId, characterName, avatar)` | Open/create character chat |
| `deleteTreeNodeCascade(nodeId)` | Delete chat or folder recursively |
| `duplicateTreeNodeSubtree(nodeId)` | Deep-copy a node |
| `selectTreeNode(nodeId)` | Set active selection |

### Chat Updates

| Function | Description |
|----------|-------------|
| `setChatTitle(chatId, title)` | Update title (max 120 chars) |
| `setChatModel(chatId, model)` | Set model config |
| `setChatMessages(chatId, messages)` | Replace message list |
| `setChatSelectedToolkits(chatId, toolkits)` | Set toolkit selection |
| `setChatSelectedWorkspaceIds(chatId, ids)` | Set workspace selection |
| `setChatSystemPromptOverrides(chatId, overrides)` | Set prompt overrides |
| `setChatThreadId(chatId, threadId)` | Set thread ID |
| `setChatAgentOrchestration(chatId, config)` | Set agent orchestration mode |
| `setChatGeneratedUnread(chatId, unread)` | Mark as having unread reply |
| `updateChatDraft(chatId, draft)` | Update draft text/attachments |

### Attachment Management

| Function | Description |
|----------|-------------|
| `createChatMessageAttachment(chatId, messageId, attachment)` | Add attachment to message |

### Tree Management

| Function | Description |
|----------|-------------|
| `createFolder()` | Create new folder in root |
| `renameTreeNode(nodeId, label)` | Rename folder or chat |
| `applyExplorerReorder(payload)` | Apply drag-and-drop reorder |

### Character Chat

| Function | Description |
|----------|-------------|
| `refreshCharacterChatMetadata(characterId, name, avatar)` | Update character metadata on existing chats |

### Subscription

```javascript
const unsubscribe = subscribeChatsStore(callback);
// callback receives: (store, changedChatIds)
```

---

## Time Formatting

`formatRelativeAgeShort(value, referenceNow)` returns compact age strings:

| Age | Output |
|-----|--------|
| < 1 min | `"now"` |
| < 1 hour | `"3m"` |
| < 1 day | `"2h"` |
| < 1 week | `"3d"` |
| < 1 month | `"2w"` |
| < 1 year | `"3mo"` |
| >= 1 year | `"1y"` |

---

## App Settings Storage (SQLite)

> App Settings no longer live authoritatively in `localStorage`. In Electron the
> single source of truth is a SQLite database managed by the main process. This
> section reflects the completed App-Settings → SQLite migration (see
> [settings-sqlite-migration-plan.md](settings-sqlite-migration-plan.md)).

### Data Authority

```text
Electron runtime
  SQLite  userData/settings.db   = authoritative App Settings
  renderer memory snapshot       = synchronous read cache (bootstrapped from SQL)
  localStorage                   = fallback backend (browser/Jest/degraded)
                                 + read-only dual-keep of legacy keys

Browser / non-Electron
  localStorage                   = fallback backend
```

Components never decide which backend is live. That decision exists only inside
the unified renderer repository (`src/SERVICEs/settings_repository.js`).

### Database Location & Tables

`userData/settings.db` (separate from `chats.db`; WAL journal, `foreign_keys=ON`,
`busy_timeout=5000`, `schema_version = 2`):

| Table | Holds |
|-------|-------|
| `settings` | Per-namespace JSON blobs (`app`, `appearance`, `ui`, `runtime`, `memory`, `model_providers`, `feature_flags`, `dev`, `agent_folder_tree_v1`, plus any unknown namespaces preserved verbatim) |
| `meta` | `schema_version`, per-store `<store>_migration_state` / digest markers |
| `token_usage_records` | Token usage rows (queried by date window, not loaded whole) |
| `default_toolkits` | Per-scope default toolkit selection |
| `toolkit_auto_approve` | Toolkit-level auto-approval |
| `tool_auto_approve` | Tool-level auto-approval (`toolkitId` + `tool_name`) |
| `computer_use_preferences` | `consent` / `enabled` / `local_beta_enabled` (fail-closed) |
| `asset_metadata` | Custom MCP icon file metadata (icons themselves live on disk) |
| `provider_credentials` | `safeStorage`-encrypted provider secret ciphertext |

### Renderer Repository

`settings_repository.js` holds the one in-memory snapshot and a per-namespace
serialized write queue:

- **Bootstrap** — preload exposes a synchronous `sendSync` read
  (`settings-storage:bootstrap-read`) so business getters stay synchronous at
  module-init time.
- **Getters are synchronous** — they read the memory snapshot.
- **Mutations are async** — an optimistic in-memory update, then an
  `invoke/handle` IPC persist; writes to the same namespace are serialized so a
  late mutation never overwrites a newer one.
- Logs carry only namespace + error code, never values.

### localStorage: Fallback + Dual-Keep

- In browser/Jest/degraded mode the repository transparently falls back to
  `localStorage` — existing store helpers keep their `localStorage` fallback
  paths **intentionally** (do not remove them).
- After a successful migration the legacy `localStorage` keys are **kept
  read-only (dual-keep)**, not double-written. Deleting migrated non-secret keys
  is a separate N+1 change and is **not** done in this phase. SQL migration state
  (not the local marker) is authoritative when deciding cleanup.
- "Reset settings" runs a SQL transaction — it must **never** call
  `localStorage.clear()` (that would nuke boot palette, crash-recovery outboxes,
  and legacy secrets).

### Secrets

Provider API keys (`openai` / `anthropic` / custom-provider secrets) live as
`safeStorage`-encrypted ciphertext in the `provider_credentials` table. The
encryption is machine-bound (`safeStorage.isEncryptionAvailable()` gated,
fail-closed when unavailable). The ordinary `settings` snapshot and bootstrap
IPC are stripped of raw secrets — only non-sensitive provider definitions plus a
"configured" boolean travel to the renderer. Legacy plaintext `localStorage`
secrets are dual-keep read-only for cross-version rollback; their deletion is a
separate N+1 change. See
[Request Flow & Streaming](request-flow-and-streaming.md) for how secrets are
injected in the main process.

### Custom MCP Icons on Disk

Icon bytes are stored as files under
`userData/assets/mcp-icons/<sanitized-id>-<sha256-prefix>.<ext>` (PNG stored as
decoded bytes, SVG as raw UTF-8 text); `asset_metadata` holds only the metadata
row. Writes are atomic (temp file + rename → upsert SQL → delete old file), and
a missing file self-heals by dropping the SQL row.

> Never write to `localStorage` directly from components. Always go through the
> settings repository / SERVICEs store helpers, and secrets only through the
> secret adapter.

---

## Key Files

| File | Role |
|------|------|
| `src/SERVICEs/chat_storage.js` | Public API re-exports |
| `src/SERVICEs/chat_storage/chat_storage_store.js` | Store state + mutation functions |
| `src/SERVICEs/chat_storage/chat_storage_constants.js` | Limits, defaults, ID generators |
| `src/SERVICEs/chat_storage/chat_storage_sanitize.js` | Data validation + normalization |
| `src/SERVICEs/chat_storage/chat_storage_tree.js` | Tree node creation + helpers |
| `src/SERVICEs/chat_storage/chat_storage_migrate.js` | Schema migration |
