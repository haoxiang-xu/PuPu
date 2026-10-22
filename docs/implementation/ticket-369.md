# Ticket 369: preserve Anthropic text blocks in tool-turn semantics

Ticket https://github.com/haoxiang-xu/PuPu/issues/369
PuPu clone /Users/red/Desktop/GITRepo/pupu-369, codex/ticket-369-sonnet-native-replay
PuPu base dev 8753e9e41df35f2241a4e35233f0c5d2c9f00b84
Companion clone /Users/red/Desktop/GITRepo/unchain-369,
branch codex/ticket-369-sonnet-native-replay-dev,
base Unchain dev 973ecfef4ba1b35d1a0bab8b757e1b53ea8031d1.

## Reproduction and cause

The parent reproduced the exact ProviderContextProjectionError without inference
using Anthropic SDK 0.83.0 TextBlock, ThinkingBlock, ToolUseBlock in a fake client's
get_final_message, then the real build_runtime_loop. TextBlock.model_dump()
contains citations:null; the provider raw replay retains that metadata, while
AnthropicModelIO._fetch_turn_streaming builds semantic text as only {type,text}.
_anthropic_semantic_assistant compares raw text blocks including citations to
that lossy semantic history and _rehydrate rejects the mismatch. Opus can avoid
the bug when its thinking/tool response lacks an intervening text block; the
failure is response-shape-dependent, not a model-id exemption. The original
remote session's raw blocks are unavailable, so that specific live shape remains
unverified. Deterministic failing response is established.

Decision: preserve each provider text block (deep copy, including empty text and
metadata) in assistant semantic_blocks when tool calls exist. Keep full_text/UI
text handling unchanged. Do not weaken context_assembler equality, replay frame
validation, signatures, call identity, argument binding or Kimi profile rules.
Provider fields must not be silently discarded to make replay compare equal.
No PuPu production-code change expected; delivery must include companion wheel.

BC-001: Anthropic SDK response -> AnthropicModelIO semantic assistant and raw
provider replay -> context_assembler -> provider request. Text blocks are copied
exactly before admission (strict JSON data). Provider request text admission is
CLOSED to the existing type/text/citations/cache_control fields; unsupported
extensions are rejected by the message contract, never silently discarded.
Runtime replay envelope and native signatures retain existing VERSIONED/CLOSED
admission. Raw thinking and signatures stay only in native replay, never semantic
history. Semantic tool-call id/name/input and accepted text metadata remain bound
by exact comparison. BC-002: PuPu candidate + immutable
Unchain wheel (record SHA256/manifest digest); no manifest schema change. Build
one wheel after implementation and use the same artifact for compatibility
checks. Source tests alone are development evidence, not rollout acceptance.

SEQ-001: SDK thinking+text+tool -> execute -> continuation replays exact native
blocks -> second normal user message and second tool cycle -> cold checkpoint
restore/replay. Include empty-text and multiple-text-block cases. Unsupported
text extensions must fail before provider continuation. Kimi profile
shares adapter and must retain its existing unsigned thinking behavior. Retry
must not create duplicate effects; genuine semantic mutations must still fail
before continuation. Graph/subagent use the same provider adapter; live modes
not exercised are explicitly NOT_RUN.

AC-001 red-before-green real Anthropic SDK 0.83.0 blocks plus real provider and
runtime loop, captured strict fake provider requests: signed thinking + metadata
text + tool executes and resumes; text-only UI final_text unchanged.
AC-002 same chat follow-up tool cycle and checkpoint cold restore preserve exact
native blocks; no signature in result.messages. Empty text, multiple text blocks,
citations:null and nonempty citations retained; unsupported extension metadata
is rejected before continuation. Do not modify
an unrelated state codec without returning to parent.
AC-003 changed text, tool arguments/name/id, metadata, missing signature remain
rejected by existing strict replay guards; existing Kimi/provider replay and
model_turn suites pass. Parameterize the relevant Sonnet/Opus ids to establish
there is no model-specific bypass. Live cloud model acceptance is NOT_RUN until
separately available, and local-model inference is prohibited.

GitNexus in Unchain clone: _fetch_turn_streaming LOW (4 impacted, direct fetch_turn
and _AnthropicFamilyExactRouteTransport.send); _anthropic_semantic_assistant LOW
(3, replay assembly chain). Both sides indexed, no HIGH/CRITICAL result. PuPu
integration uses unchanged runtime protocol; artifact compatibility still needs
validation. No UI components or UI decisions.

Assessment: suitable bounded gpt-6-sol implementation now cause and behavior are
settled. Checkpoint 1: only src/unchain/providers/anthropic.py text handling and
focused tests (prefer new tests/test_anthropic_text_replay.py, reuse established
provider replay patterns). Parent strongly reviews invariant preservation and
integration before delivery. Worker reads clone AGENTS/CLAUDE, performs required
impact, no commit/push/GitHub writes/audit. Stop on missing interface or schema
issues rather than guessing. Installed isolated .venv uses SDK 0.83.0. Run
PYTHONPATH=src .venv/bin/python -m pytest tests/test_anthropic_text_replay.py
tests/test_provider_replay.py tests/test_kimi_replay.py tests/test_model_turn_runtime.py -q.
Record red-before-green before product edit. No local model inference. Parent
handles exact wheel/PuPu qualification after checkpoint; no sidecar restart
claim unless an actual changed sidecar process is started.

## Strong checkpoint and artifact verification (2026-09-29)

Decision: continue after contract clarification. Parent retained the existing
CLOSED text field allowlist; supported citations are preserved, unknown extensions
are rejected before provider continuation. Production change is one text-block
deep-copy line; replay comparators/signature checks are unchanged. Worker suite
passed 111 tests. Parent installed one wheel in a separate PuPu clone venv,
verified its imported adapter bytes equal the candidate, and reran the same
111 tests against the INSTALLED wheel: all passed. PuPu protocol/route tests:
38 passed (strict manifest admission, wrong version/feature rejection and skill
inventory guard). SDK 0.83.0. Fresh test processes imported the changed runtime;
no long-running user sidecar was replaced or claimed restarted.

Wheel SHA256: 4c523037f16f6c6517e52be6dde61932f90c2ed6ce9af7d5eeda1bb0112cf7aa
Manifest: sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e
Adapter SHA256: cf7925fc7711837e1fed9d5cbb3905602411f37740e4249f327812fea5be514e
Evidence: ticket-369-evidence/development-wheel.json. This is a development
artifact, not clean-source release-builder evidence. Original live Sonnet trace
and real cloud-model acceptance remain NOT_RUN. Do not declare the ticket accepted.

Delivery follows the owner's standing authorization to commit/push and raise a
separate PR per selected bug, then wait for review. No automatic merge or issue
closure. This authorization supersedes the skill's default wait-for-close prompt.

## Companion delivery

Runtime fix: https://github.com/haoxiang-xu/unchain/pull/41, base dev, head
5ebd549932985b726e467d633b7201ff82dac916 (remote SHA verified). PuPu's changes
in this ticket are integration evidence only. The application must consume a
wheel containing that runtime fix; merging only this PuPu documentation PR
does not fix a deployed application. Keep both clones until fresh app audit.
