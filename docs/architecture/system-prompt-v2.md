# System Prompt V2

> Three-layer system prompt override architecture.

---

## Overview

PuPu uses a 3-layer system prompt architecture where prompts are composed from **6 ordered sections**. Each layer can override sections from the layer below.

```
Layer 1: Build Defaults (hardcoded in api.unchain.js)
  ↓ merged with
Layer 2: Runtime Config (stored per-setting or injected by backend)
  ↓ merged with
Layer 3: Per-Chat Overrides (stored on each chat session)
  ↓
Final system_prompt_v2_sections sent in payload
```

---

## Section Keys (Fixed Order)

| Key | Purpose |
|-----|---------|
| `personality` | Who the AI is, tone, persona |
| `rules` | Behavioral rules and guidelines |
| `style` | Response style preferences |
| `output_format` | Output format requirements |
| `context` | Background context and domain knowledge |
| `constraints` | Hard constraints and prohibitions |

Order is fixed. The backend compiles sections in this order when building the final system prompt.

---

## Layer 1: Build Defaults

Defined in `src/SERVICEs/api.unchain.js`:

```javascript
const DEFAULT_SYSTEM_PROMPT_V2_SECTIONS = {
  rules: "Tool use is optional. Use tools only when they materially improve the answer. Output may be truncated, so keep answers concise and front-load the most important information.",
};
```

Only `rules` has a build default. Other sections default to empty.

---

## Layer 2: Runtime Config

No runtime-level overrides exist currently. This layer is reserved for future global settings that apply to all chats.

---

## Layer 3: Per-Chat Overrides

Stored on each chat session as `systemPromptOverrides`:

```javascript
{
  systemPromptOverrides: {
    personality: "You are a helpful coding assistant",
    rules: null,        // null = use default from lower layer
    style: "",          // empty = clear this section
    output_format: null,
    context: null,
    constraints: null,
  }
}
```

- `null` → inherit from lower layer
- `""` (empty string) → explicitly clear (no content for this section)
- `"text"` → override with this value

---

## Payload Shape on Wire

After injection, the payload includes:

```javascript
{
  system_prompt_v2_sections: {
    personality: "...",
    rules: "...",
    style: "...",
    output_format: "...",
    context: "...",
    constraints: "...",
  }
}
```

---

## Backend Compilation

In `unchain_adapter.py`, the prompt module system composes sections in this order:

```
identity → personality → capability → rules → workflow →
delegation → style → output_format → context → constraints → fallback
```

The backend adds its own sections (`identity`, `capability`, `workflow`, `delegation`, `fallback`) around the user-provided sections. Merge strategies per module: `replace`, `prepend`, `append`.

### Agent Prompt Template (6 Sections)

```
┌─────────────┬────────────────────────────────────────────────┐
│ Section     │ Purpose                                        │
├─────────────┼────────────────────────────────────────────────┤
│ identity    │ One sentence. Who the agent is.                │
│ capability  │ What tools/resources are available. Factual.   │
│ workflow    │ How to approach tasks. Step-by-step.           │
│ delegation  │ When/how to use subagents.                     │
│ constraints │ Hard rules. "Never X", "Always Y".             │
│ fallback    │ What to do for out-of-scope requests.          │
└─────────────┴────────────────────────────────────────────────┘
```

Not every agent uses all sections:
- **Main agent** (developer): all 6
- **Subagent**: identity + capability + constraints
- **Simple agent** (no tools): identity + workflow + fallback

---

## Sanitization

`system_prompt_sections.js` provides:

```javascript
SYSTEM_PROMPT_SECTION_LIMIT = 2000  // max chars per section
SYSTEM_PROMPT_SECTION_KEYS = [
  "personality", "rules", "style",
  "output_format", "context", "constraints"
]
```

Functions:
- `normalizeSystemPromptSectionKey(rawKey)` → validated key or `""`
- `normalizeSystemPromptSectionValue(rawValue, limit)` → trimmed string
- `sanitizeSystemPromptSections(rawSections, options)` → clean sections object

Options: `{ allowNull, keepEmptyStrings }`

---

## Key Files

| File | Role |
|------|------|
| `src/SERVICEs/api.unchain.js` | Build defaults + injection |
| `src/SERVICEs/system_prompt_sections.js` | Sanitization + constants |
| `src/SERVICEs/chat_storage.js` | Per-chat override persistence |
| `unchain_runtime/server/unchain_adapter.py` | Backend prompt compilation |
