---
name: custom-model-provider-backend
description: S2 Flask/adapter backend for the Custom Model Provider feature — protocol-twin mapping, factory, key-isolation, redaction, test endpoint; where each piece lives and the invariants
metadata:
  type: project
---

Custom Model Provider — S2 (Flask adapter backend). Implemented 2026-07-15 on PuPu branch `feat/custom-model-providers` (NOT committed — left dirty per [[feedback-commit-policy]]). Design doc: `docs/features/custom-model-providers.md` (§7 adapter, §1.1 twin mapping, §9 security, §13 pytest).

**Why:** SAP Hyperspace-style local LLM proxy support — user-shareable JSON provider defs (protocol/base_url/auth/models) live in frontend localStorage; the API key value lives in a separate secret map, injected per-request via specialized options fields. Backend is stateless, revalidates everything.

**How to apply:** when touching model routing / agent construction / payload building / stream_started, remember custom providers ride a `cfg is not None` branch that keeps the built-in path byte-identical (518 server tests green, 0 regressions).

## Protocol-twin mapping (the load-bearing decision, §1.1)
`options.custom_provider.protocol` → `spec.provider` (twin unchain sees):
- `anthropic` → `hyperspace` (structural fail-closed: memory-summary else-noop, no 4.5→4-5 rewrite, durable-resume provider match — all free)
- `openai-responses` → `openai` (fail-OPEN: memory-summary/downgrade/env-key-fallback need explicit cfg gates + tests)
- `ollama` → `ollama`
Custom identity `custom.<slug>` only exists in PuPu layer (modelId prefix + options.custom_provider.id). modelId form: `custom.<slug>:<model>`, split(":",1) both sides for double-colon roundtrip.

## Where the code lives
- **`unchain_runtime/server/custom_provider.py`** (NEW, ~640 lines) — the weight: `CustomProviderConfig` dataclass, `CustomProviderError(code,message)` (message auto-redacted; `.code` surfaces via `route_chat._normalize_stream_error`), `parse_custom_provider(options)` (full §2.3 revalidation, raises never silently ignores), `make_custom_model_io_factory(cfg, api_key)`, `redact_secrets(obj)`/`redact_text(str)`, `test_custom_provider(def, key)` + `_classify_probe_error`. Kept OUT of the adapter megafile deliberately.
- **`route_providers.py`** (NEW) — `POST /models/custom-providers/test`, one-shot key, 15s timeout, registered in `routes.py`.
- **`unchain_adapter.py`** (~225 lines added, all `cfg is not None` gated): `_parse_model_overrides` (`_custom_override_from_model_id` helper → twin+model or raise `custom_provider_not_found`), `_get_runtime_config(overrides, cfg=)`, `_resolve_agent_api_key(options, provider, cfg=)`, `get_max_context_window_tokens(provider, model, cfg=)`, `_build_payload` (branches on cfg.protocol for maxTokens param name), `_create_agent` (parses cfg, builds factory, threads it), `_build_developer_agent(model_io_factory=)`, `_materialize_recipe_subagents(model_io_factory=)`, `_stream_recipe_graph_events` (graph_cfg + graph_custom_factory), `_build_summary_generator(options=)` defensive noop, new `get_display_model_id(options)`.
- **`subagent_loader.py`** — `_build_child_agent` + `load_templates` thread `model_io_factory`.
- **`route_chat.py`** — 3 model-echo sites → `root.get_display_model_id(options)` (echoes original custom.* modelId; byte-identical for built-in).

## Invariants (test-pinned, `tests/test_custom_provider*.py`, 70 tests)
1. **Key isolation (A8):** custom key ONLY from `custom_provider_api_key`/`customProviderApiKey`; NEVER from generic `api_key`/`apiKey`. `extract_custom_provider_api_key` enforces.
2. **Env-fallback blocked under cfg:** `_resolve_agent_api_key(cfg=...)` never falls back to OPENAI/UNCHAIN/ANTHROPIC env — that's the openai-twin leak point. Missing key + auth≠none → raise `custom_provider_missing_api_key`.
3. **Factory fallback uses spec.api_key, never custom key:** built-in subagent/template on another provider → `ModelIOFactoryRegistry().create(api_key=spec.api_key)`. Custom key structurally cannot reach a built-in ModelIO.
4. **allowed_payload_keys + provider_model forced into caps** — else `native._merged_payload` silently drops ALL user payload (no model entry → defaults={} → {}). Confirmed by reading native.py `_resolve_model_key`/`_merged_payload`.
5. **No silent fallback:** custom.* prefix without matching cfg → raise (kills old ollama:deepseek-r1:14b换模链).
6. **Redaction:** key names `/(api[_-]?key|authorization|x-api-key|token|secret)/i` → `***`. All error messages + CustomProviderError go through it.

## Key findings from the survey (non-obvious)
- `_build_summary_generator` (adapter L3027) is **DEAD CODE** — never wired; the live memory summary lives in unchain's memory manager, and the one `prepare_messages` call (adapter, in `run_workflow`) passes NO `summary_generator`. I still added the cfg-noop guard defensively per FM16. The real fail-open surface the design worried about (L3046 openai direct client) is not reachable via the adapter chat path.
- **web_fetch extract-model (R6 audit): CLEAN.** `run_extract_model` (unchain `toolkits/builtin/core/web_fetch.py`) reads provider/model/api_key from `tool_runtime_config['web_fetch']['extract_model']`. The PuPu server NEVER populates this (`grep extract_model server/*.py` = empty). Custom key cannot reach web_fetch via the adapter. No change needed.
- Twin ModelIO signatures (unchain): Hyperspace/OpenAI require non-empty api_key (factory uses `api_key or "not-needed"`). Anthropic client_factory called `(api_key=, timeout=)`; OpenAI called `(api_key=)`. Factory signature = `factory(spec: AgentSpec, call_context) -> ModelIO`; AgentSpec has provider/model/api_key.

## Env & test discipline
- PuPu venv `.venv` (py3.12): flask present, pytest was MISSING → `pip install pytest` (now pytest-9.1.1). anthropic/openai/httpx all present.
- Server tests use `unittest.TestCase` under pytest; no conftest — each test bootstraps `sys.path.insert(0, SERVER_ROOT)` + `import unchain_adapter` (which runs `_ensure_unchain_on_path()` → sibling `../unchain/src`). A test that imports ONLY `custom_provider` (not adapter) must also `import unchain_adapter` first or the factory's lazy `from unchain.providers` fails.
- Run: `cd unchain_runtime/server && .venv/bin/python -m pytest tests/ -q`. **`.py` change → sidecar restart to take effect.**
- unchain repo was on `fix/observation-hyperspace-max-tokens` (S1 one-line fix) — I did NOT touch unchain (v1 needs no unchain API change; twin mapping = zero unchain dep).

Cross-slice contract (verified, not edited): frontend `api.unchain.js` injects `options.custom_provider` (sanitized def) + `custom_provider_api_key`/`customProviderApiKey`; field names in `custom_provider_store.js` (protocol/base_url/auth{mode,header_name}/models[{id,capabilities,default_payload}]/extra_headers/timeout_seconds/default_model) match my parser exactly.
