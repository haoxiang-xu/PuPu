# Skill: Build Chat Features with `src/SERVICEs/chat_storage.js`

Use this guide when implementing any chat-related feature.
This is the source of truth for chat data, tree structure, and persistence behavior.

---

## 1. Source of truth

All chat state is persisted in localStorage through `src/SERVICEs/chat_storage.js`.
Do not write to localStorage directly from UI code.

Storage key and schema:

- `chatsStorageConstants.key` -> `"chats"`
- `chatsStorageConstants.schemaVersion` -> `2`

---

## 2. Core store shape (V2)

```js
{
  schemaVersion: 2,
  updatedAt: number,
  chatsById: {
    [chatId]: {
      id: string,
      title: string,
      createdAt: number,
      updatedAt: number,
      lastMessageAt: number | null,
      threadId: string | null,
      model: {
        id: string,
        provider?: string,
        temperature?: number,
        maxTokens?: number,
      },
      draft: {
        text: string,
        attachments: Attachment[],
        updatedAt: number,
      },
      messages: Message[],
      stats: {
        messageCount: number,
        approxBytes: number,
      },
    },
  },
  activeChatId: string | null,
  lruChatIds: string[],
  tree: {
    root: string[],
    nodesById: {
      [nodeId]: FolderNode | ChatNode,
    },
    selectedNodeId: string | null,
    expandedFolderIds: string[],
  },
  ui: object,
}
```

Node types:

- `FolderNode`: `{ entity: "folder", type: "folder", label, children[] }`
- `ChatNode`: `{ entity: "chat", type: "file", chatId, label }`

---

## 3. Message and attachment model

Message roles:

- `"system" | "user" | "assistant"`

Assistant message status:

- `"streaming" | "done" | "error" | "cancelled"`

`message.meta` supports:

- `model`
- `requestId`
- `usage`: `promptTokens`, `completionTokens`, `completionChars`
- `error`: `{ code, message }`

Attachment helper:

```js
createChatMessageAttachment(rawAttachment)
```

Use this helper before storing user attachments.

---

## 4. Read APIs you should use

- `getChatsStore()` -> full normalized snapshot
- `bootstrapChatsStore()` -> `{ store, activeChat, tree }`
- `subscribeChatsStore(listener)` -> returns unsubscribe function
- `buildExplorerFromTree(tree, chatsById, handlers)` -> explorer UI data model

`buildExplorerFromTree` is the adapter between storage tree and UI explorer component.

---

## 5. Mutation APIs you should use

Tree and selection:

- `createFolder(params, options)`
- `createChatInSelectedContext(params, options)`
- `selectTreeNode({ nodeId }, options)`
- `renameTreeNode({ nodeId, label }, options)`
- `deleteTreeNodeCascade({ nodeId }, options)`
- `applyExplorerReorder({ data, root }, options)`
- `sanitizeExplorerReorderPayload(...)` (when validating reorder payloads)

Chat content:

- `updateChatDraft(chatId, patch, options)`
- `setChatMessages(chatId, messages, options)`
- `setChatThreadId(chatId, threadId, options)`
- `setChatModel(chatId, model, options)`
- `setChatTitle(chatId, title, options)`

---

## 6. Required calling convention

Always pass a `source` in `options`, for example:

```js
setChatMessages(chatId, messages, { source: "chat-page" });
```

Why:

- store subscribers receive `{ type, source }`
- components use `source` to avoid feedback loops

---

## 7. Invariants the module guarantees

`chat_storage.js` maintains these invariants automatically:

1. `activeChatId` always points to an existing chat.
2. `tree.selectedNodeId` remains valid after mutations.
3. Missing/invalid data is sanitized on read and write.
4. Chat titles are derived from first user message when needed.
5. LRU and size trimming run automatically to bound storage usage.
6. Deleting folders/chats cascades safely and leaves a valid active chat.

Do not re-implement these invariants in UI code.

---

## 8. Recommended patterns for chat features

### 8.1 Send message flow

1. Build next message array in UI.
2. `setMessages(localState)` for immediate rendering.
3. Persist with `setChatMessages(chatId, messages, { source: "chat-page" })`.
4. If backend returns new thread/model metadata, call:
   - `setChatThreadId(...)`
   - `setChatModel(...)`

### 8.2 Draft sync

- Keep input state locally.
- Persist on change with `updateChatDraft(...)`.

### 8.3 Switching chats from side menu

- Use `selectTreeNode({ nodeId }, { source: "side-menu" })`
- UI page listens via `subscribeChatsStore(...)` and updates local states.

---

## 9. Anti-patterns (do not do these)

- Direct `localStorage.setItem("chats", ...)` in components.
- Mutating `tree.nodesById` directly in UI code.
- Writing unsanitized message objects into storage.
- Reordering explorer data without `applyExplorerReorder(...)`.
- Updating chat title and tree label separately (use provided APIs).

---

## 10. Checklist before shipping chat feature

- [ ] Uses `chat_storage.js` exports only (no direct localStorage writes)
- [ ] Passes `source` option on mutations
- [ ] Handles subscribe/unsubscribe lifecycle correctly
- [ ] Uses `setChatMessages` / `updateChatDraft` / `setChatModel` APIs (not manual writes)
- [ ] Leaves `activeChatId` + selected node consistent through all actions
- [ ] No duplicate state source-of-truth introduced

