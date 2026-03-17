# Skill: Model Providers, API Keys, and Ollama Library

Use this guide when the task touches the Settings > Model Providers page, provider-key storage, Ollama library browsing, pull progress, or embedding-model refresh behavior.

Do not use this as the main guide for sidecar route contracts or generic renderer API boundaries. Pair it with `miso-server-endpoints.md` only when the server catalog contract changes, and pair it with `backend-api-facade.md` only when the renderer facade shape itself changes.

---

## 1. Current ownership

Primary source files:

- settings page shell: `src/COMPONENTs/settings/model_providers/index.js`
- local storage helper: `src/COMPONENTs/settings/model_providers/storage.js`
- pull state store: `src/COMPONENTs/settings/model_providers/pull_store.js`
- Ollama library hook: `src/COMPONENTs/settings/model_providers/hooks/use_ollama_library.js`
- row and card UI: `src/COMPONENTs/settings/model_providers/components/*.js`
- Ollama and provider APIs: `src/SERVICEs/api.ollama.js` and `src/SERVICEs/api.miso.js`
- model catalog refresh emitter: `src/SERVICEs/model_catalog_refresh.js`
- embedding-model consumers: `src/COMPONENTs/settings/memory/use_openai_embedding_models.js` and `src/COMPONENTs/settings/memory/use_ollama_embedding_models.js`

This skill owns the UI, storage, and refresh chain around model providers. It does not own the sidecar route list.

---

## 2. Provider storage contract

Provider keys live in localStorage under the shared `"settings"` root:

```js
settings.model_providers.openai_api_key
settings.model_providers.anthropic_api_key
```

Current write path:

- `APIKeyInput` reads through `readModelProviders()`
- saves and clears through `writeModelProviders(...)`

Rules:

- keep provider-key writes inside `src/COMPONENTs/settings/model_providers/storage.js`
- keep UI state local to `APIKeyInput`
- do not move these keys into memory settings or chat storage

---

## 3. Ollama library flow

Current flow:

1. `ModelProvidersSettings` renders the Ollama section
2. `useOllamaLibrary()` debounces query and category changes
3. `api.ollama.searchLibrary({ query, category })` calls `window.ollamaLibraryAPI.search(...)`
4. `api.ollama.js` parses the returned HTML into `{ name, description, tags, sizes, pulls }`
5. installed models come from `api.ollama.listModels()`
6. pull actions call `api.ollama.pullModel(...)`
7. progress lives in `pull_store`
8. successful pulls emit `emitModelCatalogRefresh(...)` and reload installed names

Important nuance:

- HTML parsing belongs in `src/SERVICEs/api.ollama.js`, not in React components
- pull cancellation is driven by `AbortController` references stored in `pull_store.refs`

---

## 4. Installed-model and embedding-model APIs

Current `api.ollama.js` surfaces:

- `listModels()`: all installed models
- `listChatModels()`: installed models excluding embedding families
- `listEmbeddingModels()`: installed embedding-capable models only
- `searchLibrary(...)`: parsed Ollama library search results
- `pullModel(...)`: streamed pull progress from `http://localhost:11434/api/pull`
- `deleteModel(name)`: delete installed model through `http://localhost:11434/api/delete`

Current family filtering lives in `isEmbeddingFamily(...)` inside `src/SERVICEs/api.ollama.js`.

Do not duplicate embedding-family filtering in page code.

---

## 5. Provider key and embedding key injection rules

`src/SERVICEs/api.miso.js` reads provider keys from `settings.model_providers` and injects them into outgoing Miso payloads.

Current rules:

- OpenAI chat requests can receive `openaiApiKey` and `openai_api_key`
- Anthropic chat requests can receive `anthropicApiKey` and `anthropic_api_key`
- if memory is enabled and the embedding provider is `auto` or `openai`, `api.miso.js` can inject an OpenAI embedding key even when the active chat model is not OpenAI
- if memory embedding provider is `ollama`, do not inject an OpenAI embedding key

Important nuance:

- do not add generic `apiKey` or `api_key` fields for Anthropic flows
- provider key storage lives here, but payload injection lives in `src/SERVICEs/api.miso.js`

---

## 6. Refresh chain

Model catalog refresh is evented, not implicit.

Current chain:

- `emitModelCatalogRefresh(payload)` publishes a local event
- `useOpenAIEmbeddingModels()` subscribes and re-fetches `api.miso.getModelCatalog().embeddingProviders.openai`
- `useOllamaEmbeddingModels()` subscribes and re-fetches `api.ollama.listEmbeddingModels()`

This is why a successful Ollama pull in Model Providers updates embedding selectors in Memory settings without a full app reload.

Do not remove the refresh emitter from the pull-complete path unless you replace the whole refresh mechanism.

---

## 7. High-risk pitfalls

- Do not write provider keys directly with `localStorage.setItem(...)` from page components.
- Do not parse Ollama library HTML inside React components.
- Do not forget `emitModelCatalogRefresh(...)` after a successful pull.
- Do not confuse installed chat models with installed embedding models.
- Do not call `window.ollamaLibraryAPI.search(...)` outside `src/SERVICEs/api.ollama.js`.
- Do not assume provider API keys live in memory settings; they live in `settings.model_providers` and are injected by `api.miso.js`.

---

## 8. Quick checks

```bash
rg -n "openai_api_key|anthropic_api_key|readModelProviders|writeModelProviders" \
  src/COMPONENTs/settings/model_providers \
  src/SERVICEs/api.miso.js
```

```bash
rg -n "searchLibrary|pullModel|listModels|listChatModels|listEmbeddingModels|deleteModel" \
  src/SERVICEs/api.ollama.js \
  src/COMPONENTs/settings/model_providers/hooks/use_ollama_library.js
```

```bash
rg -n "emitModelCatalogRefresh|subscribeModelCatalogRefresh|getModelCatalog|listEmbeddingModels" \
  src/SERVICEs/model_catalog_refresh.js \
  src/COMPONENTs/settings/memory/use_openai_embedding_models.js \
  src/COMPONENTs/settings/memory/use_ollama_embedding_models.js
```
