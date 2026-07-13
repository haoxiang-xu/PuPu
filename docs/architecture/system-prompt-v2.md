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

The prompt module system now lives in the `unchain_runtime/server/prompts/` package (extracted out of `unchain_adapter.py`). The package owns the **data** (module order, headers, merge map, builtin rules, developer sections); `unchain_adapter.py` owns the **composition function** that consumes it.

| File | Role |
|------|------|
| `prompts/module_config.py` | `PROMPT_MODULE_ORDER`, `PROMPT_MODULE_HEADERS`, `PROMPT_MODULE_MERGE`, `V2_TO_MODULE_KEY`, `SECTION_ALIASES` |
| `prompts/builtin_rules.py` | `BUILTIN_RULES` (the only module with builtin content) |
| `prompts/agents/developer.py` | `DEVELOPER_PROMPT_SECTIONS` (main developer agent) |
| `prompts/summary.py` | `SUMMARY_SYSTEM_PROMPT` |

### Authoritative Module Order (11 modules)

`PROMPT_MODULE_ORDER` in `prompts/module_config.py`:

```
identity → personality → capability → rules → workflow →
delegation → style → output_format → context → constraints → fallback
```

The backend supplies its own modules (`identity`, `capability`, `workflow`, `delegation`, `fallback`) around the user-provided V2 sections. User-facing V2 section keys map onto module keys via `V2_TO_MODULE_KEY` / `SECTION_ALIASES`.

### Merge Strategy (Fixed Mapping)

`PROMPT_MODULE_MERGE` assigns a **fixed** strategy per module — it is not configurable per request. Only two modules are non-`replace`:

| Module | Strategy | Effect |
|--------|----------|--------|
| `rules` | `prepend` | builtin → user → agent (builtin rules come first) |
| `constraints` | `append` | agent → user (constraints concatenated) |
| all other 9 | `replace` | first non-empty wins, preference user > agent > builtin |

### Composition Entry Points (`unchain_adapter.py`)

| Function | Purpose |
|----------|---------|
| `_build_modular_prompt(*, builtin_modules, agent_modules, user_modules)` | Full 3-source merge using `PROMPT_MODULE_ORDER` + `PROMPT_MODULE_MERGE` |
| `_compose_agent_prompt(sections)` | Convenience wrapper: agent-only prompt (no user/builtin merge) |
| `_extract_user_prompt_modules(options)` | Converts wire-format V2 sections into a module dict for merging |

> Builtin modules currently contain only `rules` (joined from `BUILTIN_RULES`). The developer agent's unified prompt is precomposed at import via `_compose_agent_prompt(DEVELOPER_PROMPT_SECTIONS)`.

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
