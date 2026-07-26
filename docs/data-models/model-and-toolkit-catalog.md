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
  providers: { ollama: [], openai: [], anthropic: [] },
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
- **Secrets** (`openai` / `anthropic` API keys) live as `safeStorage`-encrypted
  ciphertext in the `provider_credentials` table of `settings.db`.

Keys are injected at stream time by the **main process**, not the renderer: the
renderer emits a secret descriptor `[{ kind, id, channel }]` and the main process
decrypts and injects the value before the POST (see
[Request Flow & Streaming](../architecture/request-flow-and-streaming.md#4-provider-secret-injection-main-process)).

Supported remote providers: `openai`, `anthropic`.

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
