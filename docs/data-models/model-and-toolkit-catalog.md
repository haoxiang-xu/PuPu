# Model & Toolkit Catalog

> Data models for model providers, capabilities, and toolkit discovery.

---

## Model Catalog

Returned by `api.unchain.getModelCatalog()`:

```javascript
{
  activeModel: string | null,
  activeCapabilities: {
    input_modalities: ["text", "image", "pdf"],
    input_source_types: ["url", "base64"],
  },
  modelCapabilities: {
    [modelId]: {
      input_modalities: string[],
      input_source_types: string[],
    },
  },
  providers: {
    ollama: ModelEntry[],
    openai: ModelEntry[],
    anthropic: ModelEntry[],
    gemini: ModelEntry[],
  },
  embeddingProviders: {
    openai: ModelEntry[],
  },
}
```

### Empty Model Catalog

```javascript
{
  activeModel: null,
  activeCapabilities: {
    input_modalities: ["text", "image", "pdf"],
    input_source_types: ["url", "base64"],
  },
  modelCapabilities: {},
  providers: { ollama: [], openai: [], anthropic: [], gemini: [] },
  embeddingProviders: { openai: [] },
}
```

---

## Provider Key Storage

Provider configuration is split between a **non-sensitive** part and the
**secret**:

- **Non-sensitive** provider definitions live in the `model_providers` namespace
  of `settings.db` (read through the settings repository; `localStorage.settings.model_providers`
  is a browser/degraded fallback). The ordinary settings snapshot exposes only
  provider definitions plus a "configured" boolean — never a raw key.
- **Secrets** (`openai` / `anthropic` / `gemini` API keys) live as `safeStorage`-encrypted
  ciphertext in the `provider_credentials` table of `settings.db`.

Keys are injected at stream time by the **main process**, not the renderer: the
renderer emits a secret descriptor `[{ kind, id, channel }]` and the main process
decrypts and injects the value before the POST (see
[Request Flow & Streaming](../architecture/request-flow-and-streaming.md#4-provider-secret-injection-main-process)).

Supported remote providers: `openai`, `anthropic`, `gemini`.

> Legacy plaintext `localStorage` secrets are dual-keep read-only for rollback;
> deleting them is a separate N+1 change, not done in this phase.

## Custom Provider Storage

User-defined provider **definitions** live in the `model_providers` namespace of
`settings.db` (shareable, never contain a key); their **secrets** live in the
same `provider_credentials` table as the built-in keys, encrypted via
`safeStorage` (design: `docs/features/custom-model-providers.md`):

```javascript
// model_providers namespace (non-sensitive, shareable)
{
  custom_providers: [           // shareable definitions — never contain a key
    { config_version, id, display_name, protocol, base_url, auth,
      extra_headers, timeout_seconds, default_model, models: [...],
      notes, enabled, source, created_at, updated_at }
  ],
}
// provider_credentials table (safeStorage ciphertext), descriptor kind: "custom_provider"
```

Read/write only through `src/SERVICEs/custom_provider_store.js` (definitions) and
the secret adapter (keys). Model IDs are addressed as `custom.<slug>:<model_id>`;
the definition is injected per request, and the key is injected by the main
process via the `kind: "custom_provider"` secret descriptor. Custom models are
merged into the picker catalog client-side — the backend `/models/catalog` does
not know about them.

---

## Default Models by Provider

Configured in `unchain_adapter.py`:

| Provider | Default Model |
|----------|--------------|
| `openai` | `gpt-4.1` |
| `anthropic` | `claude-sonnet-4` |
| `gemini` | `gemini-3.6-flash` |

---

## Toolkit Catalog (V2)

Returned by `api.unchain.getToolkitCatalog()`:

```javascript
{
  toolkits: [
    {
      toolkitId: string,       // canonical toolkitId (e.g. "core")
      toolkitName: string,     // display name
      toolkitDescription: string,
      toolkitIcon?: object,    // icon payload
      readmeMarkdown?: string, // markdown content
      tools: [
        {
          name: string,       // tool function name
          description: string,
          parameters?: object, // JSON Schema
          requires_confirmation?: boolean,
        },
      ],
    },
  ],
}
```

### Confirmation-Required Tools

```python
{
  "core:write",
  "core:edit",
  "core:shell",
}
```

### Toolkit Discovery

The backend discovers toolkits via:
1. Built-in toolkits (`core`, `plan`, `agent_reach`)
2. `toolkit.toml` files in workspace directories
3. MCP-based toolkits (`mcp.<server>.<toolkit>`)

### toolkit.toml Format

```toml
[toolkit]
name = "My Custom Toolkit"
description = "What it does"
icon = "wrench"

[[tools]]
name = "my_tool"
description = "What this tool does"
```

---

## Frontend Toolkit Stores

Both stores are authoritative in `settings.db` structured tables (with a
`localStorage` fallback for browser/degraded mode). The store module signatures
are unchanged — callers do not know which backend is live.

### Default Toolkit Store (`default_toolkit_store.js`)

Persists the user's default toolkit selection in the `default_toolkits` table
(per-scope rows). New chats inherit these defaults.

### Toolkit Auto-Approve Store (`toolkit_auto_approve_store.js`)

Persists toolkit-level auto-approval in `toolkit_auto_approve` and tool-level
approval in `tool_auto_approve` (`toolkitId` + `tool_name` rows), so
confirmation-required tools can be auto-approved without cross-toolkit
collisions. The computer toolkit is never allowed to cache approval, and
migration never widens the approved set.

---

## Ollama Models

Ollama models are managed separately:

```javascript
// api.ollama.js methods
listModels()           // All models
listChatModels()       // Excludes embedding models
listEmbeddingModels()  // Only embedding models
searchLibrary(query)   // Search ollama.com
pullModel(name)        // Download model (SSE progress)
deleteModel(name)      // Remove model
```

Ollama runs on `http://localhost:11434` (constant `OLLAMA_BASE`).

### Ollama context window

PuPu never lets the Ollama daemon pick the context window. Every built-in
Ollama chat request carries an explicit `options.num_ctx`, and the context
compiler budgets to the same number, so the daemon evaluates exactly what the
compiler admitted (issues #265, #227).

| Model | Window PuPu requests (`num_ctx`) and budgets |
|-------|-----------------------------------------------|
| No entry in `model_capabilities.json` (most locally installed models) | `32768` |
| Catalog entry declares more than 32768 (e.g. `deepseek-r1:14b` at 128000) | `32768` |
| Catalog entry declares less than 32768 | the declared value |
| Custom provider using the `ollama` protocol | the provider's own declared window; `num_ctx` is not injected — set it in the provider's `default_payload` if needed |

The constant is `_OLLAMA_DEFAULT_CONTEXT_WINDOW_TOKENS` in
`unchain_runtime/server/unchain_adapter.py`; `get_max_context_window_tokens()`
resolves the window and `_build_payload()` puts the identical value on the
wire.

**The user can change it per model.** The attach panel's model palette shows a
context-window slider under the effort row for any model whose capabilities
declare `default_context_window_tokens` (the sidecar declares it for every
built-in Ollama model, catalogued or live; never for other providers or custom
providers). The notches are `CONTEXT_WINDOW_PRESETS` in
`src/COMPONENTs/chat-input/constants.js` (4k · 8k · 16k · 32k · 64k · 128k);
notches above a catalog `max_context_window_tokens` are dropped, and when
that maximum sits above the last preset that fits it becomes the track's own
last notch (`deepseek-r1:14b` at 128000 gets a 128k notch that requests
exactly 128000). The choice follows the same three layers as reasoning
effort:

| Layer | Where | Rule |
|-------|-------|------|
| Per chat | `chat.model.contextWindow` (sanitized: positive integer) | What this conversation sends. Wins over everything. |
| Per model | `SERVICEs/context_window_prefs.js` (`localStorage`, capped map) | Fills in when a chat has no choice of its own; switching models restores that model's last pick. |
| Request | `options.contextWindow` | Sent only when picked. The sidecar validates it (integer, 2048–1048576, otherwise the message fails with `invalid_context_window`), applies it only to the chat's selected model (graph steps and subagents on other models keep their own windows), caps it by the catalog maximum, and uses the one resulting number for both the compiler budget and `num_ctx`. |

The control is the same row the reasoning-effort picker uses (`NotchSliderRow`): the BUILTIN `Slider` in its glass material (the mini_ui
channel that rests as a hairline and wakes under a frosted ring thumb), fluid
(`style.width: "100%"`, it measures its own rail), inside the same 28px
capsule as the effort row, with a read-only value well at the end. A drag
follows the pointer locally and commits once on release; keyboard steps
commit immediately. Picking is one-way, like effort: until the first pick the channel shows
no accent and the row's tooltip names PuPu's default; there is no reset. The
Context Usage ring reads the same budget, so it follows the pick immediately. Unchain's `OllamaModelIO` keeps `num_ctx` even for catalogued models whose
`allowed_payload_keys` do not list it (it is a native Ollama option), and
rejects anything that is not a positive integer.

**Why an explicit value.** Ollama's own default depends on the machine, not the
model: 4k context under 24 GiB of VRAM, 32k between 24 and 48 GiB, 256k above
(Ollama docs, "Context length"). When the prompt is longer than the daemon's
window Ollama truncates from the front, so the system prompt and the tool
definitions are the first things lost, behind an ordinary HTTP 200. A measured
15,750-token PuPu prompt evaluated only 2,051 tokens with the default and
14,024 with `num_ctx: 16384`.

**Why 32768.** A real PuPu prompt with toolkits enabled is already ~16k
tokens, and the compiler reserves ~12% of the window for output and transport,
so 16k leaves almost no room for conversation. 32k is also the window Ollama
itself chooses for 24–48 GiB machines. The cost is KV-cache memory, which
grows linearly with `num_ctx` (f16, computed from each model's layer and
KV-head counts):

| Model (Q4_K_M) | Weights | KV cache @16k | KV cache @32k | KV cache @64k |
|----------------|---------|---------------|---------------|---------------|
| `deepseek-r1:8b` (llama, 32 layers, 8 KV heads) | ~4.9 GB | 2.0 GiB | 4.0 GiB | 8.0 GiB |
| `qwen3:14b` (40 layers, 8 KV heads) | ~9.3 GB | 2.5 GiB | 5.0 GiB | 10.0 GiB |
| `deepseek-r1:14b` (qwen2, 48 layers, 8 KV heads) | ~9.0 GB | 3.0 GiB | 6.0 GiB | 12.0 GiB |
| `gemma4:e2b` (35 layers, 1 KV head) | ~3.5 GB | 1.1 GiB | 2.2 GiB | 4.4 GiB |

On a 16–18 GiB machine an 8B-class model stays fully resident at 32k. A
14B-class model at 32k exceeds the GPU budget and Ollama offloads part of it
to the CPU: slower, not broken, and still correct where the daemon default was
silently wrong. Ollama recommends at least 64k for agent workloads; raising
the constant is a one-line change once a per-model, per-machine probe exists.
Changing it changes both `num_ctx` and the compiler budget together.

---

## Model Catalog Refresh

`model_catalog_refresh.js` provides polling logic to periodically refresh the model catalog from the backend, ensuring the UI reflects newly installed Ollama models.

---

## Key Files

| File | Role |
|------|------|
| `src/SERVICEs/api.unchain.js` | Model catalog + toolkit catalog API |
| `src/SERVICEs/api.ollama.js` | Ollama model management |
| `src/SERVICEs/api.shared.js` | `normalizeModelCatalog()`, `EMPTY_MODEL_CATALOG` |
| `src/SERVICEs/default_toolkit_store.js` | Default toolkit persistence |
| `src/SERVICEs/toolkit_auto_approve_store.js` | Auto-approval persistence |
| `src/SERVICEs/model_catalog_refresh.js` | Polling refresh logic |
| `unchain_runtime/server/unchain_adapter.py` | Backend toolkit discovery |
| `unchain_runtime/server/route_catalog.py` | Catalog endpoints |

## Gemini

Gemini uses the native `google.genai` driver in Unchain. Settings and first-run
setup store `gemini_api_key` through the existing secret adapter; Electron uses
credential owner `(provider, gemini)`. The renderer emits the model-channel
descriptor and Electron injects exactly `geminiApiKey` and `gemini_api_key`.
An OpenAI embedding credential remains independent. Headless use accepts
`GEMINI_API_KEY` or `GOOGLE_API_KEY`.

The default is `gemini:gemini-3.6-flash`, verified against the real API. The picker
also retains the 2.5 models for existing accounts; Google rejects 2.5 Flash for
new users. Gemini 3 uses `thinking_level`; 2.5 keeps `thinking_budget`.
Gemini thought signatures are preserved in private replay data;
streamed thoughts and text are presented separately. Cached prompt tokens are a
subset of input tokens and are counted once. Implicit caching is automatic;
a cache hit is not guaranteed and needs live measurement. Explicit cache
creation is not enabled.

Gemini requires the matching updated Unchain runtime. Local implementation tests
are separate from live provider qualification; see
[issue 163 implementation evidence](../implementation/issue-163-gemini.md).
