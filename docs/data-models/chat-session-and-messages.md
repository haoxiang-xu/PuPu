# Chat Session & Messages

> Complete data model reference for chat sessions, messages, attachments, and trace frames.

---

## Chat Session

```javascript
{
  // Identity
  id: string,                    // "chat-{timestamp}-{random}"
  kind: "default" | "character", // chat type

  // Metadata
  title: string,                 // max 120 chars
  createdAt: number,             // ms timestamp
  updatedAt: number,             // ms timestamp
  lastMessageAt: number | null,  // timestamp of newest message
  threadId: string | null,       // thread identifier

  // Model
  model: {
    id: string,                  // default: "unchain-unset"
    provider?: string,           // "openai" | "anthropic" | "ollama"
    temperature?: number,
    maxTokens?: number,
  },

  // Agent
  agentOrchestration: {
    mode: "default" | "developer_waiting_approval",
  },

  // Selections
  selectedToolkits: string[],         // max 50, canonical IDs
  selectedWorkspaceIds: string[],     // max 20
  systemPromptOverrides: {
    [key in SectionKey]: string | null,
  },

  // Draft
  draft: {
    text: string,                // max 20,000 chars
    attachments: Attachment[],
    updatedAt: number,
  },

  // Messages
  messages: Message[],

  // UI State
  isTransientNewChat: boolean,
  hasUnreadGeneratedReply: boolean,

  // Stats (computed)
  stats: {
    messageCount: number,
    approxBytes: number,
  },

  // Character-only fields
  characterId?: string,          // max 200 chars
  characterName?: string,        // max 120 chars
  characterAvatar?: {
    url?: string,
    absolute_path?: string,
    relative_path?: string,
    data_url?: string,
    mime_type?: string,
    sha256?: string,
  } | null,
}
```

### System Prompt Section Keys

```javascript
["personality", "rules", "style", "output_format", "context", "constraints"]
```

### Toolkit ID Aliases

Multiple aliases map to canonical names:

| Alias | Canonical |
|-------|----------|
| `workspace`, `workspace_toolkit` | `WorkspaceToolkit` |
| `terminal`, `terminal_toolkit` | `TerminalToolkit` |
| `external_api`, `external_api_toolkit` | `ExternalAPIToolkit` |
| `ask_user`, `ask_user_toolkit` | `AskUserToolkit` |

Removed IDs (silently stripped): `mcp`, `mcptoolkit`.

### Character Chat Rules

When `kind === "character"`:
- `selectedToolkits` forced to `[]`
- `selectedWorkspaceIds` forced to `[]`
- `agentOrchestration` forced to `{ mode: "default" }`
- `systemPromptOverrides` forced to `{}`
- `threadId` defaults to `"main"` if not set

---

## Message

```javascript
{
  // Identity
  id: string,
  role: "system" | "user" | "assistant",
  content: string,               // max 100,000 chars
  createdAt: number,             // ms timestamp
  updatedAt: number,             // ms timestamp

  // Assistant-only fields
  status?: "streaming" | "done" | "error" | "cancelled",
  traceFrames?: TraceFrame[],
  subagentFrames?: {
    [runId: string]: TraceFrame[],
  },
  subagentMetaByRunId?: {
    [runId: string]: SubagentMeta,
  },

  // User-only fields
  attachments?: Attachment[],

  // Metadata (optional)
  meta?: {
    model?: string,
    requestId?: string,
    error?: {
      code: string,
      message: string,
    },
    bundle?: {
      consumed_tokens?: number,
      input_tokens?: number,
      output_tokens?: number,
      model?: string,
    },
  },
}
```

---

## Attachment

```javascript
{
  id: string,              // "att-{timestamp}-{random}"
  kind: "file" | "link",
  name: string,            // max 300 chars (fallback: "attachment" or "link")
  source: "local" | "url" | "pasted",
  createdAt: number,

  // Optional
  mimeType?: string,       // max 200 chars
  ext?: string,            // max 50 chars
  size?: number,           // bytes
  url?: string,            // links only, max 2000 chars
  localRef?: string,       // local files, max 2000 chars
  checksum?: string,       // max 200 chars
}
```

### Attachment Limits

- Max 5 file attachments per message
- Max 10MB total attachment size

### Supported Input Modalities

```javascript
["text", "image", "pdf"]
// Alias: "file" → "pdf"
```

### Supported Input Source Types

```javascript
["url", "base64"]
// Also: "file_id" (Anthropic Files API)
```

---

## Trace Frame

```javascript
{
  seq: number,             // sequence number
  ts: number,              // ms timestamp
  type: string,            // max 64 chars (e.g. "tool_call_start")
  stage: string,           // max 64 chars (e.g. "tool", "stream", "memory")
  iteration?: number,

  payload?: {
    content?: string,      // max 8000 chars
    text?: string,         // max 8000 chars
    message?: string,      // max 2000 chars
    reasoning?: string,    // max 8000 chars
    observation?: string,  // max 8000 chars
    result?: string,       // max 8000 chars
    delta?: string,        // max 2000 chars
    // ... additional dynamic fields
  },
}
```

### Common Trace Frame Types

| Type | Stage | Meaning |
|------|-------|---------|
| `tool_call_start` | tool | Tool invocation begins |
| `tool_call_end` | tool | Tool invocation ends with result |
| `tool_confirmation_request` | tool | Awaiting user confirmation |
| `reasoning` | stream | Model reasoning content |
| `observation` | stream | Agent observation |
| `memory_save` | memory | Memory write |
| `memory_recall` | memory | Memory retrieval |
| `model_start` | model | Model inference begins |
| `model_end` | model | Model inference ends |

---

## Subagent Meta

```javascript
{
  subagentId: string,      // max 300 chars
  mode: string,            // max 50 chars
  template: string,        // max 200 chars
  batchId: string,         // max 200 chars
  parentId: string,        // max 300 chars
  lineage: string[],       // each max 300 chars
  status: string,          // max 100 chars
}
```

Subagent frames are stored separately from main trace frames, organized by `runId`.

---

## Key Files

| File | Role |
|------|------|
| `src/SERVICEs/chat_storage/chat_storage_sanitize.js` | Sanitization + validation for all shapes |
| `src/SERVICEs/chat_storage/chat_storage_constants.js` | Limits and defaults |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Creates messages during streaming |
