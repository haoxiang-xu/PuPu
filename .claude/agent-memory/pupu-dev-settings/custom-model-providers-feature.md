---
name: custom-model-providers-feature
description: Custom Model Provider feature (feat/custom-model-providers) — slices, twin-mapping rationale, S5 hooks left in the settings UI
metadata:
  type: project
---

Feature: user-defined ("custom") model providers — shareable JSON definition + local-only API key. Design doc: `docs/features/custom-model-providers.md`. Branch `feat/custom-model-providers`.

**Why (the one non-obvious architecture call):** spec.provider uses a **protocol-twin mapping**, NOT a bare `custom.<slug>` name. anthropic protocol → twin `"hyperspace"`, openai-responses → `"openai"`, ollama → `"ollama"`. The original review-winning "fail-closed bare custom name" route was falsified pre-implementation: unchain kernel `validate_provider` hard-whitelists provider names and ~12 dispatch points key off the name. The twin `hyperspace` is already a first-class unchain citizen, so anthropic-protocol customs are structurally fail-closed (custom key never reaches api.anthropic.com). openai-responses twin `openai` is fail-open — patched pointwise + pinned by tests. (§1.1)

**Slice ownership split:**
- S2 Flask backend + S3 frontend store/injection: another agent (committed 021ddfd/c7ad125). `src/SERVICEs/custom_provider_store.js` is the single read/write entry (all helpers there — never touch localStorage directly). `injectCustomProviderIntoPayload` already lives in `api.unchain.js`.
- **S4a settings UI = mine**: `src/COMPONENTs/settings/model_providers/custom-providers/` (index=CustomProvidersSection, custom_provider_list, custom_provider_editor, confirm_delete_provider_modal). Mounted after the 3 built-in sections in `model_providers/index.js`. i18n namespace `model_providers.custom.*` (74 keys × 11 locales).
- **S4a committed 4f8b1ec; S4b (test-connection IPC chain + `api.unchain.testCustomProvider` facade) committed 3e7b764/f8c7fa7.** Facade returns nested `{ok:true, latency_ms, model}` / `{ok:false, error:{code,message}}` — the editor reads that nested shape.
- **S5 (import/export + PresetPicker) built by me (uncommitted at time of writing).** New files in `custom-providers/`: `import_pipeline.js` (pure conflict/commit logic over the store), `custom_provider_import_modal.js` (Validate/Import two-step, paste/file/drag), `preset_picker.js` (reads `custom_provider_presets.json`, feeds the SAME pipeline seeded as source:"preset"), `export_provider.js` (runtimeBridge save dialog + Blob fallback, filename `pupu-provider-<slug>.json`). The two placeholder buttons in `index.js` are now wired live; `[Export]` added to each list row.

**Non-obvious S5 decisions:** conflict resolution lives in `import_pipeline.commitImport(provider, mode, {source})` — overwrite with a changed base_url/auth/extra_headers forces `enabled:false` + `removeCustomProviderSecret` (FM20 anti-key-harvest); same endpoint preserves secret+enabled. Rename derives a free `<id>-2` slug (truncating to the 32-char cap) and **re-runs `normalizeCustomProvider`** so the new id re-passes slug/reserved rules. The store has NO dedicated overwrite/rename API — I compose `updateCustomProvider`/`addCustomProvider`; did not modify the store.

**How to apply:** If S6 (docs/finish) comes, the feature UI is done. If the store ever needs a first-class import-conflict API, `import_pipeline.js` is where that logic currently lives and would move from.

**CTO-sync trigger:** the `settings.model_providers` schema gained two keys (`custom_providers[]`, `custom_provider_secrets{}`). That is [[settings-schema-cto-gated]] territory — the schema change rides with S2/S3, not S4a, but any further schema change I make here must be reported to pupu-cto. Also relates to [[secret-link-security]]: custom keys are still plaintext in renderer localStorage (accepted v1 limit, keychain migration deferred).

The `testCustomProvider(definition, apiKey)` facade on `api.unchain` is being built by another agent; the editor calls it via optional chaining and greys out [Test connection] until it exists.
