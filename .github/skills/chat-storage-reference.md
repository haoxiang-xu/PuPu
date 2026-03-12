# Skill: Build Chat Features with `src/SERVICEs/chat_storage.js`

Use this guide when you are changing chat persistence, message shape, session metadata, draft handling, or attachment metadata.

This module is the source of truth for chat persistence in the renderer.

---

## 1. Storage model

Chat session metadata is persisted in localStorage through:

- `src/SERVICEs/chat_storage.js`

Storage constants:

- key: `chats`
- schema version: `2`

Do not write to localStorage directly from UI code.

---

## 2. Session shape that matters today

The current sanitized session shape includes:

```js
{
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
  selectedToolkits: string[],
  selectedWorkspaceIds: string[],
  systemPromptOverrides: {
    [sectionKey]: string,
  },
  draft: {
    text: string,
    attachments: Attachment[],
    updatedAt: number,
  },
  messages: Message[],
  isTransientNewChat: boolean,
  hasUnreadGeneratedReply: boolean,
  stats: {
    messageCount: number,
    approxBytes: number,
  },
}
```

Fields that are easy to miss:

- `selectedToolkits`: persisted tool picker selection for the chat
- `selectedWorkspaceIds`: persisted named-workspace selection for the chat
- `systemPromptOverrides`: per-chat prompt section overrides
- `isTransientNewChat`: marks placeholder chats that can be cleaned up if never used
- `hasUnreadGeneratedReply`: unread/generated state used by the explorer UI

---

## 3. Message shape that matters today

Valid roles:

- `system`
- `user`
- `assistant`

Current normalized message shape:

```js
{
  id: string,
  role: "system" | "user" | "assistant",
  content: string,
  createdAt: number,
  updatedAt: number,
  status?: "streaming" | "done" | "error" | "cancelled",
  attachments?: Attachment[],
  traceFrames?: TraceFrame[],
  meta?: {
    model?: string,
    requestId?: string,
    usage?: {
      promptTokens?: number,
      completionTokens?: number,
      completionChars?: number,
    },
    error?: {
      code: string,
      message: string,
    },
  },
}
```

Important details:

- `status` only applies to assistant messages
- `traceFrames` are persisted on assistant messages only
- `attachments` are persisted on user messages only
- `meta.requestId`, `meta.usage`, and `meta.error` are already part of the storage contract and should not be reinvented elsewhere

---

## 4. Trace frame persistence

Assistant messages can persist `traceFrames`.

`chat_storage.js` intentionally trims them before persistence:

- keeps a small stable frame envelope (`seq`, `ts`, `type`, `stage`, `iteration`)
- deep-clones `payload`
- trims known large string fields to reduce localStorage growth

That means `traceFrames` in storage are a UI/debug representation, not a byte-for-byte copy of the server stream.

Do not rely on them as an exact replay log.

---

## 5. Attachment storage is split

This is an easy place to break things.

There are two layers:

- chat metadata in `src/SERVICEs/chat_storage.js`
- attachment payload durability in `src/SERVICEs/attachment_storage.js`

Rules:

- localStorage keeps lightweight attachment metadata
- IndexedDB keeps the actual payload blobs/base64 data
- the IndexedDB database is `pupu_attachment_payloads`
- `chat.js` still maintains an in-memory attachment map as the hot cache

Implication:

- never assume localStorage contains attachment payload bytes
- if you move or reload attachment-related UI, make sure you preserve the IndexedDB lookup path

Use:

```js
createChatMessageAttachment(rawAttachment)
```

before persisting user attachment metadata.

---

## 6. Workspace selection is split too

There are also two workspace layers:

- workspace definitions in `settings.runtime.workspaces`
- per-chat selection in `chat.selectedWorkspaceIds`

Rules:

- chat storage persists workspace IDs, not absolute paths
- `api.miso.js` resolves IDs into `workspace_roots` before the sidecar sees them

Implication:

- never inline workspace paths into chat session objects
- if you rename or migrate workspace definitions, keep chat selection compatibility in mind

---

## 7. Mutation APIs you should use

Read APIs:

- `getChatsStore()`
- `bootstrapChatsStore()`
- `subscribeChatsStore(listener)`

Core chat mutation APIs:

- `createChatInSelectedContext(...)`
- `createChatWithMessagesInSelectedContext(...)`
- `updateChatDraft(...)`
- `setChatMessages(...)`
- `setChatThreadId(...)`
- `setChatModel(...)`
- `setChatSelectedToolkits(...)`
- `setChatSelectedWorkspaceIds(...)`
- `setChatSystemPromptOverrides(...)`
- `setChatTitle(...)`
- `setChatGeneratedUnread(...)`
- `cleanupTransientNewChatOnPageLeave(...)`

Tree/explorer APIs:

- `createFolder(...)`
- `selectTreeNode(...)`
- `renameTreeNode(...)`
- `deleteTreeNodeCascade(...)`
- `applyExplorerReorder(...)`

---

## 8. Required calling convention

Always pass a `source` on storage mutations.

Example:

```js
setChatMessages(chatId, messages, { source: "chat-page" });
setChatSelectedToolkits(chatId, toolkits, { source: "chat-page" });
setChatSelectedWorkspaceIds(chatId, workspaceIds, { source: "chat-page" });
setChatSystemPromptOverrides(chatId, overrides, { source: "chat-page" });
```

Why this matters:

- store subscribers receive `{ type, source }`
- UI code uses `source` to avoid self-triggered feedback loops

If you omit `source`, debugging state propagation gets much harder.

---

## 9. High-risk pitfalls

- Never write raw message objects into storage. `sanitizeMessage` and `sanitizeChatSession` exist because chat payloads drift.
- Never assume attachment payloads live in localStorage. They do not.
- Never update `selectedToolkits` or `systemPromptOverrides` through ad-hoc object mutation. Use the exported setters.
- Never persist workspace paths inside chat sessions. Use `selectedWorkspaceIds` and the exported setter.
- Never persist trace data on arbitrary objects or user messages. Follow the current assistant-message contract.
- Never skip the `source` option on mutations.
- Never duplicate the store in component-local persistence. `chat_storage.js` is already the source of truth.

---

## 10. Quick checks

```bash
rg -n "sanitizeChatSession|sanitizeMessage|setChatSelectedToolkits|setChatSelectedWorkspaceIds|setChatSystemPromptOverrides|createChatMessageAttachment" \
  src/SERVICEs/chat_storage.js
```

```bash
rg -n "pupu_attachment_payloads|saveAttachmentPayload|loadAttachmentPayload" \
  src/SERVICEs/attachment_storage.js
```
