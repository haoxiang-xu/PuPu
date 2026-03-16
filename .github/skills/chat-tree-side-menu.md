# Skill: Chat Tree, Side Menu, and Explorer Actions

Use this guide when the task touches the left sidebar explorer tree, folder and chat actions, copy or duplicate behavior, reorder logic, unread state, search filtering, or the external `window.pupuChatTreeAPI` surface.

Do not use this as the main guide for chat message or session schema changes. That belongs to `chat-storage-reference.md`. This skill sits on top of the chat store and explorer projection.

---

## 1. Current ownership

Primary source files:

- side menu shell: `src/COMPONENTs/side-menu/side_menu.js`
- store subscription hook: `src/COMPONENTs/side-menu/hooks/use_chat_tree_store.js`
- action hook: `src/COMPONENTs/side-menu/hooks/use_side_menu_actions.js`
- context menu builder: `src/COMPONENTs/side-menu/side_menu_context_menu_items.js`
- external API surface: `src/COMPONENTs/side-menu/side_menu_api.js`
- search filter helper: `src/COMPONENTs/side-menu/utils/filter_explorer_data.js`
- local modal and row primitives: `src/COMPONENTs/side-menu/side_menu_components.js`
- source-of-truth tree and chat mutations: `src/SERVICEs/chat_storage.js`

This skill owns sidebar behavior layered on top of the chat store.

---

## 2. Store subscription flow

Current flow:

1. `useChatTreeStore()` bootstraps with `bootstrapChatsStore().store`
2. it refreshes from `getChatsStore()`
3. it subscribes through `subscribeChatsStore(...)`
4. `side_menu.js` converts store data with `buildExplorerFromTree(...)`
5. the rendered explorer model is optionally filtered by `filter_explorer_data(...)`

Do not create a parallel side-menu persistence layer. The store already exists in `chat_storage.js`.

---

## 3. Explorer projection rules

`buildExplorerFromTree(...)` is the source of truth for explorer node data.

Current behavior:

- folder nodes expose `children`, `prefix_icon`, and descendant status flags
- chat nodes expose `chatId`, `prefix_icon`, and a relative-time `postfix`
- folder descendants compute:
  - `has_generating_chat_descendant`
  - `has_unread_generated_descendant`
- chat nodes compute:
  - `is_generating`
  - `has_unread_generated_reply`

Unread and generating state are derived from the underlying chat session, not stored separately in the side menu.

---

## 4. Action and context-menu flow

Main side-menu actions route through `chat_storage.js` mutations:

- select node: `selectTreeNode(...)`
- reorder tree: `applyExplorerReorder(...)`
- rename node: `renameTreeNode(...)`
- delete node: `deleteTreeNodeCascade(...)`
- new chat: `createChatInSelectedContext(...)`
- new folder: `createFolder(...)`

Context-menu copy behavior is split:

- folder copy uses `duplicateTreeNodeSubtree(...)`
- chat copy uses `createChatWithMessagesInSelectedContext(...)`
- chat paste can fall back to the latest store if clipboard messages are empty

Important nuance:

- `handleNewChat` in `use_side_menu_actions.js` only creates a new chat when the active chat already has messages
- context-menu code is the canonical place for clipboard behavior; do not re-implement it in `side_menu.js`

---

## 5. Search and external API surface

Search filtering currently happens in:

- `filter_explorer_data(explorer_data, query)`

Current rules:

- only file nodes are matched
- matching is by lowercased file label
- empty query returns `null` filtering results so the default explorer rendering remains intact

The side menu also exposes an external window API while mounted:

```js
window.pupuChatTreeAPI = sideMenuChatTreeAPI;
```

Current external methods:

- `getStore()`
- `createChat(...)`
- `createFolder(...)`
- `renameNode(...)`
- `deleteNodeCascade(...)`
- `selectNode(...)`
- `applyReorder(...)`

All of them write with source `"external-ui"`.

---

## 6. Memory inspect and unread state

Chat nodes expose an `Inspect Memory` context-menu action.

Current path:

1. side-menu context menu calls `onInspectMemory(sessionId, chatTitle)`
2. `side_menu.js` opens `MemoryInspectModal`
3. the modal reads Miso projections through `createMisoApi()`

Unread generated state comes from the chat session:

- chat page updates it with `setChatGeneratedUnread(...)`
- `buildExplorerFromTree(...)` projects it into chat nodes and folder descendants

Do not add a second unread-state store inside the side menu.

---

## 7. High-risk pitfalls

- Do not mutate `chatStore.tree` ad hoc from React code. Use `chat_storage.js` exports.
- Do not assume search results include folders. They currently do not.
- Do not duplicate copy or paste logic outside `side_menu_context_menu_items.js`.
- Do not forget `source` tagging such as `"side-menu"` or `"external-ui"` on mutations.
- Do not move chat session schema rules into side-menu code. Keep schema changes in `chat_storage.js`.

---

## 8. Quick checks

```bash
rg -n "buildExplorerFromTree|applyExplorerReorder|duplicateTreeNodeSubtree|hasUnreadGeneratedReply|setChatGeneratedUnread" \
  src/SERVICEs/chat_storage.js
```

```bash
rg -n "useChatTreeStore|useSideMenuActions|sideMenuChatTreeAPI|Inspect Memory|MemoryInspectModal" \
  src/COMPONENTs/side-menu
```

```bash
rg -n "filter_explorer_data|window\\.pupuChatTreeAPI|createChatWithMessagesInSelectedContext|createFolder\\(" \
  src/COMPONENTs/side-menu \
  src/SERVICEs/chat_storage.js
```
