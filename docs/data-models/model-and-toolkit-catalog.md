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

Stored in `localStorage.settings.model_providers`:

```javascript
{
  openai: { api_key: string },
  anthropic: { api_key: string },
}
```

Injected into the payload at stream time by `injectProviderApiKeyIntoPayload()`.

Supported remote providers: `openai`, `anthropic`.

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
      id: string,             // canonical ID (e.g. "WorkspaceToolkit")
      name: string,           // display name
      description: string,
      icon?: string,          // icon identifier
      readme?: string,        // markdown content
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
{"write_file", "delete_file", "move_file", "terminal_exec"}
```

### Toolkit Discovery

The backend discovers toolkits via:
1. Built-in toolkits (workspace, terminal, ask_user, external_api)
2. `toolkit.toml` files in workspace directories
3. MCP-based toolkits (removed)

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

### Default Toolkit Store (`default_toolkit_store.js`)

Persists the user's default toolkit selection. New chats inherit these defaults.

### Toolkit Auto-Approve Store (`toolkit_auto_approve_store.js`)

Persists per-tool auto-approval preferences so confirmation-required tools can be auto-approved.

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
