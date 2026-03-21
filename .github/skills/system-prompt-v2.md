# Skill: System Prompt V2 Architecture

Use this guide when working on the system prompt section mechanism: editing default sections, per-chat overrides, the injection chain, backend compilation, or the override UI.

Do not use this for the general chat streaming path. That belongs to `chat-runtime-memory-and-trace.md`.

---

## 1. Section keys

The system prompt is split into six named sections, applied in this fixed order:

1. `personality`
2. `rules`
3. `style`
4. `output_format`
5. `context`
6. `constraints`

Each section has a 2000-character limit. The alias `"personally"` is normalized to `"personality"` on both frontend and backend.

Source of truth for keys:

- Frontend: `src/SERVICEs/system_prompt_sections.js` → `SYSTEM_PROMPT_SECTION_KEYS`
- Backend: `miso_runtime/server/miso_adapter.py` → `_SYSTEM_PROMPT_V2_SECTION_ORDER`

---

## 2. Three-layer architecture

The system prompt flows through three layers before reaching the LLM:

### Layer 1 — Global defaults (settings)

Stored in `localStorage["settings"].runtime.system_prompt_v2`:

```js
{
  enabled: true,
  sections: {
    rules: "Tool use is optional. Use tools only when they materially improve the answer. ...",
  },
}
```

Read by `getStoredSystemPromptV2Config()` in `api.miso.js`. Falls back to `DEFAULT_SYSTEM_PROMPT_V2_SECTIONS` if empty.

### Layer 2 — Per-chat overrides

Stored in `chat.systemPromptOverrides` (inside `chat_storage.js`):

```js
{
  personality: "Be brief and technical",
  rules: null,  // explicit clear — removes the default rules section
}
```

Mutation: `setChatSystemPromptOverrides(chatId, overrides)`.

Override semantics:

- Non-empty string → replaces the default for that section
- `null` → explicitly clears the section (no default inherited)
- Missing key → inherits the global default

### Layer 3 — Backend compilation

The backend in `miso_adapter.py`:

1. Extracts `options.system_prompt_v2` → `{ enabled, defaults, overrides }`
2. Merges defaults + overrides via `_merge_system_prompt_v2_sections()`
3. Injects builtin rules (prepended to the `rules` section)
4. Compiles to text via `_compile_system_prompt_v2_text()`
5. Prepends as a system message to the conversation

---

## 3. Payload shape on the wire

After frontend normalization, the payload reaches the sidecar as:

```js
options: {
  system_prompt_v2: {
    enabled: boolean,
    defaults: { [sectionKey]: string },      // from global settings
    overrides: { [sectionKey]: string|null }, // from per-chat overrides
  },
}
```

The frontend builds this in `injectSystemPromptV2IntoPayload()` (api.miso.js). It accepts both `system_prompt_v2` and `systemPromptV2` from callers.

---

## 4. Frontend injection chain

`normalizeMisoV2Payload()` calls four injectors in order:

1. `injectWorkspaceRootIntoPayload`
2. **`injectSystemPromptV2IntoPayload`** ← system prompt
3. `injectMemoryIntoPayload`
4. `injectProviderApiKeyIntoPayload`

`injectSystemPromptV2IntoPayload` does:

1. Read stored config via `getStoredSystemPromptV2Config()`
2. Sanitize caller-provided overrides with `allowNull: true, keepEmptyStrings: true`
3. Merge: stored sections → `defaults`, caller overrides → `overrides`
4. Clean up both `system_prompt_v2` and `systemPromptV2` keys
5. Output single `options.system_prompt_v2` object

---

## 5. Frontend sanitization

`src/SERVICEs/system_prompt_sections.js` exports:

- `normalizeSystemPromptSectionKey(rawKey)` — lowercase, alias, validate against known keys
- `normalizeSystemPromptSectionValue(rawValue)` — trim, enforce 2000 char limit
- `sanitizeSystemPromptSections(rawSections, opts)` — full sanitization with options:
  - `allowNull: false` (default) — drops null values
  - `allowNull: true` — preserves null (for explicit clears)
  - `keepEmptyStrings: false` (default) — drops empty strings
  - `keepEmptyStrings: true` — preserves empty strings

Chat storage uses `sanitizeSystemPromptOverrides()` which calls `sanitizeSystemPromptSections` with `allowNull: true, keepEmptyStrings: false`.

---

## 6. Backend compilation pipeline

In `miso_adapter.py`:

1. `_extract_system_prompt_v2_options(options)` — parse and validate input
2. `_merge_system_prompt_v2_sections(defaults, overrides)` — apply override logic
3. `_inject_builtin_rules(sections)` — prepend 3 hardcoded rules to `rules` section
4. `_compile_system_prompt_v2_text(sections)` — format as `[Title]\ncontent` blocks
5. `_prepend_system_message(messages, text)` — insert as first message

Builtin rules (always prepended to `rules`):

- Final answer is the single deliverable; prefer asking over guessing
- Tool use is optional; call tools only when necessary
- Use ask-user-question tool for missing info instead of forcing conversation split

Output text format:

```
[Personality]
Be brief and technical

[Rules]
<builtin rules>
<user rules>

[Style]
...
```

---

## 7. Per-chat override lifecycle

1. User edits overrides in the chat header system prompt editor
2. `setChatSystemPromptOverrides(chatId, overrides)` persists to chat session
3. On next stream request, `chat.js` passes `systemPromptOverridesRef.current` to `useChatStream`
4. The stream hook includes overrides in the payload options
5. `injectSystemPromptV2IntoPayload()` maps them to `system_prompt_v2.overrides`
6. Backend merges with defaults and compiles to text

---

## 8. High-risk pitfalls

- Do not add section keys without updating both `SYSTEM_PROMPT_SECTION_KEYS` (frontend) and `_SYSTEM_PROMPT_V2_SECTION_ORDER` (backend). They must stay in sync.
- Do not strip `null` values from overrides. `null` is the explicit-clear signal and must survive the full pipeline.
- Do not reorder sections in `_SYSTEM_PROMPT_V2_SECTION_ORDER`. The backend compiles them in that fixed order.
- Do not modify `_SYSTEM_PROMPT_V2_BUILTIN_RULES` without understanding that they are always prepended to the user's `rules` section.
- Do not assume system prompt content appears in the `messages` array for all providers. Anthropic separates system content into a dedicated `system` field.
- Do not exceed the 2000-char limit per section. Both frontend and backend enforce it independently.
- Do not confuse `defaults` (from global settings) with `overrides` (from per-chat). They have different null semantics.

---

## 9. Files to read first

- `src/SERVICEs/system_prompt_sections.js` — section keys and sanitization
- `src/SERVICEs/api.miso.js` — injection chain, `DEFAULT_SYSTEM_PROMPT_V2_SECTIONS`
- `src/SERVICEs/chat_storage.js` — `setChatSystemPromptOverrides`
- `miso_runtime/server/miso_adapter.py` — backend merge, compile, builtin rules
- `src/SERVICEs/api.systemPromptV2.test.js` — injection contract tests

---

## 10. Quick checks

```bash
rg -n "SYSTEM_PROMPT_SECTION_KEYS|DEFAULT_SYSTEM_PROMPT_V2_SECTIONS|sanitizeSystemPromptSections" \
  src/SERVICEs/system_prompt_sections.js \
  src/SERVICEs/api.miso.js
```

```bash
rg -n "_SYSTEM_PROMPT_V2_SECTION_ORDER|_SYSTEM_PROMPT_V2_BUILTIN_RULES|_compile_system_prompt_v2_text|_merge_system_prompt_v2_sections" \
  miso_runtime/server/miso_adapter.py
```

```bash
rg -n "systemPromptOverrides|setChatSystemPromptOverrides" \
  src/SERVICEs/chat_storage.js \
  src/PAGEs/chat/chat.js
```
