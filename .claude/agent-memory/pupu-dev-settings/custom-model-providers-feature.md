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
- S5 (import/export + PresetPicker) NOT built yet. **I left disabled [From preset]/[Import] buttons in CustomProvidersSection's action row** — S5 just wires them. `buildProviderExportPayload` and the preset JSON (`custom_provider_presets.json`, SAP Hyperspace) already exist in the store/SERVICEs for S5 to consume.

**How to apply:** If asked to continue this feature, S5 is the next settings slice — enable those two placeholder buttons and build the import modal + PresetPicker per design §8, reusing `normalizeCustomProvider` (shared validator) and the same auto-enable flow the editor already implements (§8.3: required secret saved + validates → `setCustomProviderEnabled(slug,true)` + toast).

**CTO-sync trigger:** the `settings.model_providers` schema gained two keys (`custom_providers[]`, `custom_provider_secrets{}`). That is [[settings-schema-cto-gated]] territory — the schema change rides with S2/S3, not S4a, but any further schema change I make here must be reported to pupu-cto. Also relates to [[secret-link-security]]: custom keys are still plaintext in renderer localStorage (accepted v1 limit, keychain migration deferred).

The `testCustomProvider(definition, apiKey)` facade on `api.unchain` is being built by another agent; the editor calls it via optional chaining and greys out [Test connection] until it exists.
