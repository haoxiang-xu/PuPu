# Provider model refresh — ticket 354

Ticket: https://github.com/haoxiang-xu/PuPu/issues/354, direct child of Release #216.

## What and why

Expose the newly verified OpenAI, Claude, Gemini and DeepSeek API models through the existing Unchain/PuPu integration. Preserve existing saved model IDs and defaults. The audit also found Kimi K2.7 Code HighSpeed; its route compatibility must be established before enabling it. No new UI component, new provider, audio/video generation, hosted-agent integration, default-selection migration, merge or rollout is part of this work.

## Read first and architecture

Read both repositories' AGENTS.md/CLAUDE.md, PuPu's cross-boundary-contract-gate.md, and Unchain docs/en/guides/add-model.md. Native catalog entries come from runtime/resources/model_capabilities.json and model_default_payloads.json, consumed by load_model_capabilities/load_default_payloads, native ModelIO, prepared_request_factory and wire_preparer. PuPu's unchain_adapter loads the installed runtime catalog, projects capabilities to its existing model picker and converts reasoningEffort into the provider's payload. Shipped providers use PuPu custom_provider_presets.json → buildProviderInjectionPayload → parse_custom_provider → HyperspaceModelIO → Anthropic wire. Keep the existing JS-only UI intact.

## Verified native entries

Official evidence checked 2026-09-26:

| IDs | Limits and controls | Sources |
| --- | --- | --- |
| gpt-6-sol, gpt-6-luna | 1,050,000 context, 128,000 output; text/image; Responses tools and structured output; none/low/medium/high/xhigh/max, medium default | https://developers.openai.com/api/docs/models/gpt-6-sol ; https://developers.openai.com/api/docs/models/gpt-6-luna |
| claude-opus-5-5, claude-sonnet-5 | 1,000,000 context, 128,000 output; text/image/PDF in existing path; low/medium/high/xhigh/max; medium for Opus, high for Sonnet | https://platform.claude.com/docs/en/models/overview ; https://platform.claude.com/docs/en/build-with-claude/effort |
| gemini-3.7-flash, gemini-3.8-flash | 1,048,576 input/context, 65,536 output; existing text/image/PDF path; low/medium/high, medium default; no minimal | https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash ; https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash |
| gemini-3.5-flash-lite | Same token limits; minimal/low/medium/high, minimal default | https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite ; https://ai.google.dev/gemini-api/docs/thinking |

OpenAI uses the existing Responses path, not Chat Completions. Add max_output_tokens to capabilities. Gemini registrations admit max_output_tokens and thinking_config only: deprecated sampling knobs must not leak to these new entries. Do not advertise audio/video input in PuPu until its attachment path supports it. Existing models are unchanged. Claude's new entries use max_tokens/output_config only, leaving adaptive thinking to the provider default and excluding manual/disabled thinking, forced tool choice and sampling parameters. The UI already exposes effort rather than a thinking-disable switch. Do not add native computer use to these entries implicitly.

DeepSeek: https://api-docs.deepseek.com/quick_start/pricing/ and https://api-docs.deepseek.com/guides/anthropic_api/ establish deepseek-flash, 1M context, up to 384K output, image input and tools on the current Anthropic endpoint. Preserve old model IDs and the selected default. Pro remains available according to the current pricing/changelog, superseding the earlier launch notice. Verify thinking/replay before choosing a safe default. Kimi sources: https://platform.kimi.ai/docs/models , https://platform.kimi.ai/docs/guide/kimi-k2-7-code-quickstart and https://platform.kimi.ai/docs/api/messages. The HighSpeed variant is the same K2.7 Code model, but current unsigned-thinking admission is bound to an exact ID and endpoint. Any expansion must preserve exact identity binding and negative-route checks. China-specific availability remains unverified. Existing K3 declaration drift is an audit finding, not silently bundled into this change.

## Impact and execution plan

Unchain clone /Users/red/Desktop/GITRepo/unchain-354, branch codex/ticket-354-provider-model-refresh, base dev 07579c96c75f22f851d3c1552bc40d66c7488356. PuPu clone /Users/red/Desktop/GITRepo/pupu-354 from dev 85773ed49b3653d80ea5a39b514e65c77ded086a.

GitNexus impact for load_model_capabilities/load_default_payloads: LOW, two direct callers (native ModelIO initializer and memory registry loader), nine upstream symbols, two memory processes. This is shared data loading, so existing entries must remain byte-equivalent in meaning. kimi_replay_profile: LOW, one property caller; validate_replay_profile: LOW, one direct caller, four upstream symbols including the context assembler. The indexed process inventory has known truncation warnings; absence of a process is not proof of no effect. Targeted impacts plus source/call-site inspection guide tests.

1. Add only the five verified OpenAI/Gemini entries and focused wire tests. Check defaults, legal effort values, serialized SDK request shape and unsupported sampling exclusion. Existing entries remain unchanged.
2. Add Claude entries using restrictive existing allowlists; test real prepared requests and signed thinking/tool continuation against strict fakes.
3. Add the DeepSeek preset and, only after route verification, Kimi HighSpeed. Exercise real frontend producer output through backend parsing and runtime transport; do not claim external account availability from mocks.
4. Build one Unchain wheel, retain its digest, install that exact file into the integration environment, test PuPu against it, record manifest identity and source/candidate identity. Run targeted regressions, then graph change checks before delivery commits. Retain work if any required evidence is missing.

## Contracts and acceptance

BC-001 (VERSIONED runtime artifact → PuPu sidecar): producer is the installed wheel's resource catalog and protocol manifest; consumer is unchain_adapter and existing model catalog response. Canonical model identity is provider plus exact model ID; serialized capabilities must retain supported effort/default, limits and only the input modalities the consumer can use. Existing protocol manifest validation remains mandatory; no schema/version bypass. AC-001 proves every new native model is projected from the installed wheel and selectable without changing prior selections; AC-002 proves default and explicit legal effort requests, invalid effort fallback and excluded wire keys. Negative tests use exact key sets/SDK validators, not loose shared fixtures. Record wheel SHA-256 and manifest digest with test evidence.

BC-002 (CLOSED producer, constructive consumer, shipped preset → sidecar → provider): JS producer emits the existing exact key whitelist; parse_custom_provider validates protocol, endpoint, identity and declared models. No additional wire keys are introduced. AC-003 uses actual producer output through strict sidecar parsing, rejects forbidden keys/invalid endpoint and proves canonical model routing. AC-004 checks text/image requests and two tool steps against a strict provider consumer, retaining legacy IDs/defaults. Unknown provider models must not masquerade as verified support.

BC-003 (VERSIONED durable replay → provider): preserve existing signed native Anthropic replay and exact Kimi endpoint/model/profile binding. Do not allow a new model to consume another model's signed/unsigned record. AC-005 tests positive same-model continuation and negative wrong-model/wrong-endpoint/profile cases. If no replay policy change is necessary, verify existing behavior rather than broaden it.

SEQ-001: first normal message → second normal message → first tool interaction → second tool interaction → retry/resume → cold process restart/replay. Keys are existing chat/execution/attempt/provider/model identities. Apply AC-002/004/005 to affected normal/graph/subagent routes; share lower-layer evidence only when the same real deployed boundary is exercised. Missing matrix cells are NOT_RUN, never N/A by convenience. No schema migration is introduced; deployment/rollback must preserve old identities. Artifact replacement requires rerunning against the new exact pair.

No live API credentials were present in the task environment at preflight; account availability and live network results remain NOT_RUN until an authorized configured source is available. This is not a release certification. Missing required live or artifact evidence keeps active rollout INCOMPLETE.

## Delegation assessment

Partially suitable. The five OpenAI/Gemini catalog entries are a bounded data-and-contract-test slice with settled official limits and wire conventions; a gpt-6-luna worker may implement only that slice. Strong parent handles Claude restrictions, shipped-provider replay decisions, PuPu integration, exact wheel verification and final review. Checkpoint after worker's diff and tests, before any further slice. Worker does not commit, push, edit other files or decide unresolved provider contracts.

## September 26 implementation checkpoint and evidence

Strong-parent review: **continue** after inspecting the delegated five-model diff and rerunning its tests together with Claude coverage. The five-model worker used gpt-6-luna as planned; parent implemented Claude and DeepSeek. All existing 29 native entries compare equal to the dev base. All existing shipped-provider definitions and defaults are retained after removing only the new DeepSeek entry from the comparison.

PuPu source changes are limited to `src/SERVICEs/custom_provider_presets.json`, the shared producer fixture, tests and this plan. The fresh clone's disambiguated GitNexus impact for `readPresetEnvelopes` in `shipped_provider_registry.js` is HIGH (8 affected symbols, two direct callers; ProviderKeySection process and SERVICEs/custom-provider/hooks modules). This warning was reported before the preset edit. The loader function is unchanged. Existing settings, preset picker and stored definitions are covered by the shipped-provider regression tests. JSON catalogs are not production symbols; a graph result with no overlapping symbols is not a clean-tree or unaffected-consumer claim.

DeepSeek V4.1 Flash is added as `deepseek-flash`, with tools and image input, 1M context and 384K maximum output. Default request output is 32,768 and `thinking.type=disabled`; reasoning is intentionally not advertised until unsigned-thinking replay is validated for this exact endpoint/model. Legacy V4 Flash remains the default. No Kimi HighSpeed entry was added: the public model directory confirms it, but the current Anthropic Messages schema does not establish that exact route. Kimi China and private Hyperspace coverage remain unknown. Existing K3 thinking/vision declarations are a separate follow-up finding.

Immutable runtime evidence:

- Unchain PR: https://github.com/haoxiang-xu/unchain/pull/39
- Commit: `b26e89d9064b8e09c0863df44e9b0585dde4c1f2`.
- One built wheel: `unchain-0.2.0-py3-none-any.whl`.
- SHA-256: `2bb7f7d4f88768dc0fca6e14798f2d5af32864a623e050870f83a7cf6b7a2bef`.
- Runtime manifest: `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`.
- Installed into the PuPu clone's isolated `.venv`, with existing dependency directories reused. `UNCHAIN_SOURCE_PATH` explicitly selects that installation; imported `unchain.__file__` and the runtime manifest were verified after importing the sidecar adapter. The sibling source checkout is not used.

Checks: 132 Unchain tests passed; 25 frontend tests passed. The backend run reached 108 passes (plus three subtests), with one unrelated NumPy repeated-import failure in the memory projection test. That failure is retained in the evidence rather than counted as a pass. The eight new integration cases passed against the installed wheel: native picker/effort/default projection plus actual JS-produced DeepSeek injection through parsing, factory and runtime text/image/tool-schema requests. Existing custom-provider factory, graph route and durable resume suites exercise shared lower layers; they do not establish the complete model-specific SEQ-001 matrix.

Acceptance limits: no live API calls, Electron package smoke or real-app provider probe ran. The complete first/second tool interaction, retry, resume and cold restart matrix for these exact new models is **NOT_RUN**. Thus BC-001/002 have targeted contract evidence but full AC/SEQ and feature acceptance remain incomplete. Keep #354 In Progress and both PRs draft; no merge, ticket closure, active rollout or release certification. New native catalog entries reach PuPu only after the paired Unchain artifact is included and the sidecar restarted.

Final audit findings: the memory-projection case passes alone (1 passed) but fails within its module due to NumPy import order; module result is 22 passed/1 failed. Agent panel and recipe round-trip tests passed (9 tests). The recipe inspector accepts model IDs and characters inherit the active chat model, but `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js:11` has a static `MODEL_OPTIONS` list. It omits the new models, so model × agent-builder consistency is **conflict found**, not PASS. Extending that picker requires confirming native/custom override routing before adding selectable identities; retain this as work on #354. No new UI primitives or schemas were added.

Full i18n scan: 815 English keys, ten translated locales, no missing/orphan/mismatched placeholders or missing-in-English code keys; 65 existing dead-key candidates and 48 dynamic call sites were reported, with no deletion. Static rules: no new IPC, storage writes, routing, context providers, overlays or Electron test pairs. Audit overall remains FAIL/incomplete because the builder gap and real-app/artifact acceptance are not resolved.
