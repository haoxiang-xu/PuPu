# Tree & Explorer

> Data model for the conversation tree and sidebar explorer.

---

## Tree Store

The tree is part of the main `chats` store in localStorage:

```javascript
tree: {
  root: string[],                     // top-level node IDs (ordered)
  nodesById: { [nodeId]: TreeNode },  // all nodes
  selectedNodeId: string | null,      // selected in sidebar
  expandedFolderIds: string[],        // folders showing children
}
```

---

## Node Types

### Folder Node

```javascript
{
  id: string,            // "fld-{timestamp}-{random}"
  entity: "folder",
  type: "folder",
  label: string,         // max 120 chars, sanitized
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

## Tree Functions

| Function | Description |
|----------|-------------|
| `createFolderNode({ id, label, children })` | Create folder with defaults |
| `createChatNode({ id, chatId, label })` | Create chat node |
| `createEmptyStoreV2()` | Empty store with schema v2 |
| `makeInitialTreeFromChats(chatsById, orderedChatIds, activeChatId)` | Build tree from flat chat list |
| `buildParentIndex(tree)` | Map each node to `{ parentId, index }` |
| `firstChatInTree(tree)` | Get first chat ID in tree order |
| `firstChatNodeIdInTree(tree)` | Get first chat node ID |
| `getSiblingIds(tree, parentFolderId)` | Get children of a folder |
| `applySiblingIds(tree, parentFolderId, siblings)` | Reorder children |
| `sortChatsByUpdatedAt(chatsById)` | Sort by last modified |

---

## Explorer Projection

`buildExplorerFromTree()` transforms the tree structure into a flat list of rows for the sidebar UI. Each row represents a visible node with depth, expansion state, and metadata like relative age.

The explorer supports:
- **Drag-and-drop reordering** via `@dnd-kit`
- **Folder expand/collapse** via `expandedFolderIds`
- **Search filtering** by chat title
- **Context menus** for rename, delete, duplicate, move

---

## Reorder Flow

1. User drags a node in the sidebar
2. `sanitizeExplorerReorderPayload(payload)` validates the move
3. `applyExplorerReorder(payload)` updates the tree structure
4. Store persists to localStorage and notifies subscribers

---

## Side Menu Store Subscription

The side menu subscribes to the chats store:

```javascript
subscribeChatsStore((store, changedChatIds) => {
  // Re-render explorer tree
});
```

---

## Key Files

| File | Role |
|------|------|
| `src/SERVICEs/chat_storage/chat_storage_tree.js` | Tree data structure + helpers |
| `src/SERVICEs/chat_storage/chat_storage_store.js` | Tree mutation functions |
| `src/COMPONENTs/side-menu/side_menu.js` | Explorer UI |
| `src/COMPONENTs/side-menu/` | Search, context menu, drag-and-drop |
