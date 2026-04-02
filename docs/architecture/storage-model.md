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

## Storage Helpers (Other)

Settings are stored separately under `localStorage.getItem("settings")`:

```javascript
{
  model_providers: { ... },
  memory: { ... },
  runtime: { workspaces: [...], workspace_root: "..." },
  appearance: { theme_mode: "dark_mode" | "light_mode" | "sync_with_browser" },
  ui: { side_menu_open: boolean },
  feature_flags: { ... },
}
```

> Never write to localStorage directly from components. Always use SERVICEs helpers.

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
