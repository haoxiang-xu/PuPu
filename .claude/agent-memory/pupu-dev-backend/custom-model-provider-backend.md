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

## 对抗性评审 5 缺陷整改 (2026-07-15，实施后，`feat/custom-model-providers`，未 commit，543 pytest/0 回归)

评审确认的 5 个泄 key/误路由缺陷，全在 `unchain_runtime/server/`；每缺陷补回归测试并经"revert-then-fail"验证真捕获。**共同根因**：`_resolve_agent_api_key` 的 cfg 分支**无视 provider 参数**，`cfg is not None` 就返回 custom key——所以任何在"该走内置装配的地方仍把 cfg 传下去"的调用点都会泄 key。修复模式统一：**仅当该处 provider == cfg.twin 才把 cfg/factory 传下去，否则 cfg=None 走内置装配**。

- **C0/C5 (HIGH，密钥泄漏)** — `_stream_recipe_graph_events` 步循环：step `override.model` 指内置 provider（如 `openai:gpt-4o`）时，`_resolve_agent_api_key`/`get_max_context_window_tokens`/factory 仍用 `graph_cfg` → 内置步骤拿 custom key 发 api.openai.com。修法：`step_is_custom = graph_cfg is not None and step_config["provider"] == graph_cfg.twin`；派生 `step_cfg`/`step_factory`（非 custom 步为 None）。工厂内置回落分支（`custom_provider.py` factory `spec_provider != twin` → `ModelIOFactoryRegistry().create(api_key=spec.api_key)`）是纵深防线，已用 `spec.api_key` 从不用闭包 custom key。
- **C1/C9 (HIGH，interject 误路由+fail-open)** — `interject_router._default_run_classifier` + `route_interject._run_side_answer` 构造裸 `Agent`（无 cfg/无 factory），custom 会话 openai 孪生降级 gpt-4.1+env key 发官方端点，anthropic 孪生用默认 HyperspaceModelIO 指官方。修法：新增 `unchain_adapter.build_interject_agent(options, *, name)` 单一 cfg-aware 构造点——custom 分支 provider **权威取 cfg.twin**、model 取 `get_runtime_config` 或 cfg 默认、key 走 `cfg=cfg` 分支、装 factory、**跳过 `_GENERAL_MODEL_BY_PROVIDER` 降级**（§7.2 custom 不降级）；内置分支字节复刻旧 `_resolve_general_runtime_config` 路径。两 call site 改为 delegate 到它。
- **C6 (HIGH，durable resume 丢 custom)** — 挂起→回执恢复：`durable_interaction_host.py` 的 resume 持久化是**allowlist**（`_STABLE_RESUME_OPTION_KEYS`），`custom_provider` 不在里 → resolve 后 cfg=None 重建**内置** agent 发官方端点。且 `resolve_resume_options` L330 无条件把 modelId 覆写成孪生形 `f"{twin}:{model}"`，抹掉 `custom.<slug>:...` 寻址。三处修：①`custom_provider` 加入 stable allowlist（def **无 key**，可落盘）；②`custom_provider_api_key`/`customProviderApiKey` 加入 `_FRESH_SECRET_OPTION_KEYS`（key **永不落盘**，renderer resume 时重供，overlay 重注）；③custom 会话（resolved 有 `custom_provider` dict 且 modelId 以 `custom.` 开头）**不覆写 modelId**——保留 custom 寻址让 `_custom_override_from_model_id` 从 cfg 重建 twin。`_create_agent` 本身已 cfg-aware，拿到带 custom_provider+key 的 resolved_options 即正确重建。
- **C2 (HIGH，max_tokens 被当密钥剥掉)** — `custom_provider.py:79` `_SECRET_FIELD_PATTERN` 未锚定 `re.search`，`"max_tokens"`/`"max_output_tokens"` 含子串 `token` → 被 `_sanitize_default_payload` 静默剥离，用户输出上限永失效。修法：改全串锚定 `^(api[_-]?key|apikey|token|secret)$`（与前端 `custom_provider_store.js` 一致）。
- **C8 (MEDIUM，白名单外 default_payload 键静默丢)** — 模型声明的 `default_payload` 里不在 `PROTOCOL_ALLOWED_PAYLOAD_KEYS` 的键（openai `truncation`、ollama `repeat_penalty`/`seed`、anthropic `metadata`）被 `native._merged_payload` 终段过滤删掉。修法：factory `_caps_for` 把该模型 entry `default_payload` 的键**并入** `allowed_payload_keys`（order-preserving de-dup，静态键在前）。

**测试隔离要点（复用于此类 factory 测试）**：`make_custom_model_io_factory` 在构造时 `from unchain.providers import HyperspaceModelIO/OpenAIModelIO/OllamaModelIO`，绑到函数局部 → 想 capture 建出的 ModelIO 须 patch `unchain.providers.*` **在 build factory 之前**（patch `cp.*` 无效）。新增 5 测试文件：`test_custom_provider_payload_keys.py`(C2/C8)、`test_custom_provider_graph_step_leak.py`(C0/C5)、`test_custom_provider_interject.py`(C1/C9)、`test_custom_provider_durable_resume.py`(C6)。
