# Ticket 382 — Context content pagination implementation handoff

Ticket: https://github.com/haoxiang-xu/PuPu/issues/382  
Release: #216 / v0.1.12  
Status: Manual live acceptance FAILED — reader argument recovery repairs required; rollout INCOMPLETE

PuPu workspace: `/Users/red/Desktop/GITRepo/pupu-382`  
Branch: `codex/ticket-382-tool-content-read`  
Base: `dev @ 202a8cdf69de40d0481aea17454bd598f32efa11`

Unchain workspace: `/Users/red/Desktop/GITRepo/unchain-382`  
Branch: `codex/ticket-382-tool-content-read`  
Base: `dev @ 663d051291a7e6f1681d332206141291d2be9597`

## Goal

Make every large durable tool result readable through a stable, model-copyable reference and bounded byte pages. A successful `context_content_read` page must reach the next model request inline and must never be replaced by another preview plus a new model-visible artifact reference.

Preserve the existing durability guarantees: every tool call and result is still written to the journal/artifact store. The change affects only the generated model view and the official bounded reader.

## Non-goals

- No UI work. #383 and #384 remain separate.
- No repair for DeepSeek provider replay mutation; #380 remains separate.
- No LLM summarization or memory-agent work in the read path.
- No migration or rewrite of old journal rows, artifacts, receipts, provider reasoning, signatures, or replay frames.
- No weakening of conversation, execution, attempt, disclosure, revision, or capability authorization.
- No generic all-tools loop detector.
- No change to ordinary `memory_read`, `memory_source_read`, candidate readers, or memory mutation reference formats.
- Do not touch or restart the user's original PuPu instance or original PuPu/Unchain checkouts.

## Confirmed defects and red evidence

The original incident snapshot recorded 61 failed `context_content_read` calls: Kimi 28, Claude 26, and GPT-5.4 7. Stored full output exists. Kimi and Claude were cancelled after about 8m44s and 8m20s.

A deterministic synthetic reproduction exercises the real path:

`PuPu host factory → bound execution toolkit → ArtifactService → DurableToolCompletionEnvelope → DurableToolBoundary.persist_prepared_result → active ToolOutputManager → context compiler → official context_content_read`

It proves:

1. Native-current and neutral-history model views expose an internal ResourceRef object/bare ID that the string-only reader cannot consume. Manually encoding the same stored reference with the PuPu codec succeeds.
2. A successful 20,555-byte read page is re-projected to a 1,578-byte preview plus a new reference before the next model request. A 1,553-byte page control survives.

Red artifact: `.release-qa/ticket-382/red-repro.txt`. Scratch reproduction: `/tmp/ticket382_repro_test.py`. Move the meaningful cases into repository tests; do not retain absolute-path imports.

## Fixed design decisions

These decisions are settled for implementation. A worker must not invent alternatives.

### D-382-01 — Canonical model locator

New model views use:

`unchain://context/v1/<base64url-without-padding>`

The decoded payload is canonical UTF-8 JSON with exactly these sorted keys:

```json
{"fragment":"","id":"artifact-...","kind":"artifact","revision":1}
```

Rules:

- The model treats the locator as opaque.
- Decoder rejects padding, noncanonical base64url, malformed UTF-8/JSON, unknown version, missing/extra keys, boolean/non-positive revision, empty kind/id, or noncanonical re-encoding.
- Locator decoding never grants permission. The decoded `ResourceRef` must pass the existing `decode_context_content_ref` kind/fragment rules and existing `authorize_context_ref` capability check.
- The official context reader accepts the new locator and existing host legacy strings. New model projections emit only the new locator.
- Generic `decode_external_ref` and memory mutation decoders remain unchanged.

### D-382-02 — Large-result model descriptor

For an offloaded large result, the generated model view is:

```json
{
  "schema_version": "unchain.tool_output.paged.v1",
  "projection": "paged",
  "preview": {
    "head": "...",
    "tail": "...",
    "omitted_bytes": 12345
  },
  "content_bytes": 20555,
  "content_sha256": "64 lowercase hex characters",
  "full_output_ref": "unchain://context/v1/...",
  "read_request": {
    "tool": "context_content_read",
    "arguments": {
      "ref": "unchain://context/v1/...",
      "offset": 0,
      "limit": 8192
    }
  }
}
```

`full_output_ref` and `read_request.arguments.ref` must be byte-identical. Only known top-level harness-owned fields may be projected. Never recursively rewrite arbitrary tool JSON or provider-native assistant/reasoning content.

### D-382-03 — Byte paging

Public interface remains:

```python
context_content_read(ref: str, offset: int = 0, limit: int = 8192)
```

- Offset and limit count original source bytes.
- Default and maximum source request are 8,192 bytes; smaller requests are valid.
- The renderer may reduce the delivered source prefix to satisfy the final serialized budget.
- `next_offset = offset + page_bytes` and always points into the original source.
- `eof` is true only when the original source is exhausted.
- UTF-8 pages use text when the delivered bytes decode exactly; otherwise use base64. Never replace or silently discard invalid bytes.

Closed model page shape:

```json
{
  "schema_version": "unchain.context_content_page.v1",
  "trust": "UNTRUSTED_DATA",
  "ref": "unchain://context/v1/...",
  "media_type": "application/json",
  "total_bytes": 20555,
  "sha256": "64 lowercase hex characters",
  "offset": 0,
  "page_bytes": 8192,
  "next_offset": 8192,
  "eof": false,
  "content": {"encoding": "utf-8", "text": "..."},
  "next_read": {
    "tool": "context_content_read",
    "arguments": {
      "ref": "unchain://context/v1/...",
      "offset": 8192,
      "limit": 8192
    }
  }
}
```

At EOF, `next_offset` and `next_read` are `null`. Base64 content uses exact keys `encoding` and `data_base64`.

### D-382-04 — Bounded page projection

Add tool output policy `context_page`, declared only by official `context_content_read`.

- The raw read result is still persisted normally for truth and replay.
- The model projection is the validated page itself; it is not wrapped in `projection=default`, previewed, or given a reference to the page-result artifact.
- Canonical serialized page maximum: 12,288 bytes, including locator, metadata, JSON escaping, and base64 expansion.
- Build/shrink the page once in memory after one capability read. Do not issue repeated SQL reads merely to fit the budget.
- Manager validates exact schema and size. Invalid or oversized `context_page` output fails closed.
- Other tools and policies keep their current behavior.

### D-382-05 — Historical compaction

- Current read page stays inline for the immediate continuation.
- Older read pages may drop body content, but their compact marker must keep original locator, original range, EOF/next offset, and a valid reread request.
- Older large non-read results keep the canonical locator/read request.
- A compacted marker never points to the artifact of the read response itself.
- Stored receipt/event bytes and provider-native signed frames remain unchanged; compiler/runtime create a fresh model view from verified semantic records.

### D-382-06 — Narrow no-progress guard

V1 guard is attempt/toolkit-local; it introduces no new durable state.

- Fingerprint: canonical ref + offset + limit + normalized nonretryable error code.
- After two consecutive identical nonretryable failures with no successful context read between them, the third call returns `CONTEXT_READ_NO_PROGRESS` without another storage read.
- Success clears the failure streak. A changed ref/range/error is a different fingerprint.
- New toolkit/attempt/user run resets the guard. Cold restart may grant a fresh two-call allowance; document this limitation rather than adding a new persistence schema.
- Retryable infrastructure failures do not trigger this guard.

## Cross-boundary records

- **BC-382-01 (VERSIONED):** durable ResourceRef → generated locator/read request → strict decoder → existing authorization/capability. AC-01: actual producer ref is directly readable in native current and neutral history. AC-02: malformed, wrong-version, wrong-revision, undisclosed, and cross-chat refs fail without data disclosure.
- **BC-382-02 (CLOSED):** official reader page → `context_page` policy → durable result → next model request. AC-03: multi-page reassembly equals original bytes; UTF-8/control/base64/EOF covered. AC-04: successful page body appears in the next provider request and creates no second model-visible retrieval ref.
- **BC-382-03 (VERSIONED):** imported Unchain runtime manifest → PuPu strict admission. Add required `context_content_paging_v1` to `context_memory`. AC-05: old/missing feature rejects before provider/run side effects; one exact wheel is accepted.
- **BC-382-04 (CLOSED):** repeated read error → attempt-local guard → structured failure. AC-06: identical nonprogress stops; success/pagination/unrelated tools remain unaffected.
- **SEQ-382-01:** fetch → persist → disclose → page 1 → next page → EOF → later compaction → reread. Identity is exact ResourceRef revision/fragment plus byte range.
- **SEQ-382-02:** first and second user turn, retry/new attempt, interaction resume, cold restart, normal/graph/subagent routes, provider change, exact candidate pair. Each applicable cell must be PASS, FAIL, or NOT_RUN with reason.

## Impact evidence already collected

- `decode_context_content_ref`: LOW; direct official-reader caller.
- `build_memory_toolkit`: LOW; MemoryV2Module/curator callers.
- `content_page`: CRITICAL; shared by ordinary memory readers. Do not change its ordinary behavior; add a context-specific renderer.
- `ToolOutputManager`: MEDIUM; imported across context/tool infrastructure.
- `_native_tool_result_payload`: LOW; current native batch → neutral context → assemble.
- `project_tool_result_for_model`: UNKNOWN in graph; text search confirms tool harness/tests call it. Corroborate again before editing.
- PuPu `_PupuUnchainReferenceCodec`: MEDIUM. Do not change it; retain legacy compatibility.

Before editing any additional existing symbol, run GitNexus `impact` in the correct clone. HIGH/CRITICAL requires explicit warning and constrained design review. UNKNOWN requires text corroboration. Before any eventual commit, run nonpartial `detect-changes --scope all` in both repositories.

## Worker suitability and operating rules

Assessment: **partially suitable for a weaker model** now that the contract is fixed.

Suitable slices:

- Test migration, strict locator codec, context-only page renderer, declared output policy, fixed model projection adapters, manifest feature, and deterministic matrices.

Strong-model-only decisions:

- Any change to the schemas or budgets above.
- Any authorization change.
- Any mutation of stored receipts/events/provider frames.
- Any need for a new durable no-progress state.
- Any provider-specific workaround not expressible through the shared projection.
- Final exact-artifact and live acceptance judgment.

The user will choose the lower-cost worker model later. Record the actual model only when dispatched. The advanced reviewer runs each checkpoint. The worker is authorized only through the next checkpoint and must stop there.

General rules:

1. Read both clones' `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, this handoff, and the cross-boundary gate.
2. Work only in the two ticket clones. Preserve the original checkouts and running app.
3. No commit, push, PR, ticket closure, live rollout, or original sidecar restart.
4. Use TDD: add a regression that fails for the observed behavior, run it red, then implement the smallest contract-preserving fix.
5. Do not change a failing test to match implementation. Stop on contract conflict.
6. At each checkpoint provide: diff summary, exact changed files, red-before-green output, commands/results, GitNexus impacts, deviations, unresolved questions, and both worktree statuses.

## Phase 0 — Preflight and durable red baseline

Permitted edits: tests and `.release-qa/ticket-382/` evidence only.

1. Verify both clone real paths, remotes, branches, bases, and status. The only expected PuPu change before implementation is this handoff file; Unchain should be clean.
2. Re-run `/tmp/ticket382_repro_test.py` with clone `PYTHONPATH`. Save complete output under `.release-qa/ticket-382/` without production data.
3. Move the three failing integration cases and the passing small-page control into a self-contained PuPu test file, preferably `unchain_runtime/server/tests/test_context_content_pagination.py`. Recreate fixtures locally or use public fixture helpers; never import test code by absolute path from the sibling repository.
4. Pin expected current failures:
   - Native current model-visible reference cannot be copied directly into reader.
   - Neutral/history model-visible reference cannot be copied directly into reader.
   - A successful large read page loses its sentinel in the next compiled request.
5. Run existing targeted tests before product edits and save baseline results.
6. Run GitNexus impact for every existing symbol listed in Phase 1 before editing it.

Stop immediately if the deterministic reproduction no longer fails on the recorded bases, if fixture construction mutates real user data, or if the clone/base identity differs.

## Phase 1 — Locator, strict decoder, and bounded page builder

Worker authorization ends at Checkpoint 1.

### 1.1 Tests first in Unchain

Add `tests/context_v2/test_context_content_access.py` covering:

- exact locator roundtrip for artifact/checkpoint/context-event refs including revision and fragment;
- deterministic canonical output;
- invalid scheme/version/base64/padding/UTF-8/JSON/key set/kind/id/revision/fragment;
- canonical ref is data, not authorization;
- page UTF-8 and base64 shapes, EOF and continuation;
- 8,192-byte source cap;
- 12,288-byte final canonical JSON cap with quotes, backslashes, control characters, CJK, emoji, long locator, and base64 expansion;
- dynamic shrink produces no gap/overlap and `next_offset` advances by exact delivered bytes;
- concatenated page bytes reproduce the source exactly.

Extend `tests/memory_v2/test_memory_toolkit_contract.py` and `test_memory_toolkit_security.py`:

- canonical locator accepted by context reader;
- legacy host codec still accepted;
- bare ID rejected;
- wrong revision, undisclosed/cross-scope ref, invalid fragment, and arbitrary URI rejected;
- ordinary memory read/source/candidate paths retain existing schemas and behavior.

Run new tests and save red output before implementation.

### 1.2 Implement the deep module

Create `src/unchain/context_content.py`. It owns the small interface and all format knowledge:

- `encode_context_locator(ResourceRef) -> str`
- `decode_context_locator(str) -> ResourceRef`
- `present_context_output_ref(ResourceRef, metadata) -> dict`
- `render_context_content_page(MemoryToolContentPage, ref, requested_limit) -> dict`
- `validate_context_content_page(value) -> dict`

Names may change only for surrounding Python style; shapes and responsibilities may not.

Requirements:

- No dependency on PuPu or a host codec.
- No storage or authorization inside the codec.
- Closed exact key checks.
- Canonical serialization helpers shared by producer and strict validator, without using the same permissive fake to prove both ends.
- Page builder consumes already-read bytes once and shrinks in memory.

### 1.3 Connect only the official context reader

Modify:

- `src/unchain/memory/toolkit/validation.py`: `decode_context_content_ref` recognizes canonical locator first, otherwise legacy host codec; existing allowed-kind/fragment validation remains after decoding.
- `src/unchain/memory/toolkit/toolkit.py`: context reader default/max becomes 8,192; authorization remains before capability read; use context-specific page renderer.
- `src/unchain/memory/toolkit/presentation.py`: add a context-specific path or delegate to the new module. Do not alter ordinary `content_page` results.
- `src/unchain/memory/toolkit/contracts.py`: explicitly tell the model to copy `read_request.arguments.ref`, use byte offset/limit, and follow `next_read` until EOF when needed.

At this phase the producer may still emit the old internal ref. Do not try to make the full integration green yet.

### Checkpoint 1 — Advanced review: protocol and security seam

Worker must stop. Advanced model reviews:

1. Locator shape is canonical, versioned, roundtrippable, and opaque to callers.
2. Parsing cannot grant access; all existing authorization executes after decode.
3. Generic memory decoding and ordinary memory page shapes are unchanged.
4. Page accounting uses original bytes and exact serialization, including base64/escaping.
5. One capability read produces one page; no repeated SQL reads for fitting.
6. Red producer-to-reader integration is still red for only the expected missing producer projection.
7. Targeted tests and relevant existing memory/security suites pass.
8. GitNexus change analysis shows no unexpected HIGH/CRITICAL spread.

Checkpoint verdict must be one of: `CONTINUE`, `CORRECT BEFORE CONTINUING`, or `STRONG-MODEL TAKEOVER`. Record it on #382. Only `CONTINUE` authorizes Phase 2.

## Phase 2 — Fresh model projection and no recursive spill

Worker authorization ends at Checkpoint 2.

### 2.1 Declare `context_page`

Modify:

- `src/unchain/tools/output_management/__init__.py`
- `src/unchain/tools/tool.py` only if current validation cannot carry the new declared policy
- `src/unchain/memory/toolkit/toolkit.py` registration
- `tests/test_tool_output_management.py`
- relevant context runtime factory/tool policy tests

Implement:

- add `context_page` to closed supported policies;
- official `context_content_read` alone declares it through the existing route policy map;
- manager parses and strictly validates the canonical result bytes;
- model payload is the exact page, not a default wrapper;
- receipt metadata records policy/version/size without exposing the page-result artifact as the continuation source;
- invalid schema or >12,288 canonical bytes fails closed;
- ordinary default/head_tail/artifact_only snapshots and behavior remain byte-identical where asserted.

### 2.2 Generate canonical descriptors at model-view seams

Modify only known trusted fields in:

- `src/unchain/context/runtime.py::project_tool_result_for_model`
- `src/unchain/context/compiler.py::_native_tool_result_payload`
- `src/unchain/context/compiler.py::_neutral_context` result/artifact/handoff reference records as applicable
- a shared presenter in `src/unchain/context_content.py`

Do not modify `projector.py` raw event fields or sealed completion identity unless a failing contract proves a model projection cannot be generated later. The preferred design leaves durable ResourceRef objects in receipts/events and generates locators on a copied model view.

Cover:

- current native tool output;
- managed receipt output;
- neutral history/tool exchanges;
- supported OpenAI, Anthropic, Gemini/hyperspace, and Ollama provider message builders;
- locator/read request equality;
- preview head/tail/omitted byte accounting;
- unchanged stored receipt/result SHA and provider-native assistant/reasoning bytes.

### 2.3 Make the real reproduction green

The repository integration test must obtain the reference from the actual compiled model request and pass it unchanged to the actual prepared `context_content_read` callable. No test-only host encoding is allowed.

For the second hop:

- read a page containing a tail sentinel;
- persist through the real durable result path;
- compile the next model request;
- assert the sentinel is present;
- assert no new `read_request` points to the page-result artifact;
- assert journal/artifact persistence still contains the read tool result.

### Checkpoint 2 — Advanced review: active execution path

Worker must stop. Advanced model reviews:

1. Raw durability is unchanged and the model view is regenerated on a copy.
2. Canonical locator appears in every fresh/current provider path with exact read args.
3. `context_page` cannot be requested by arbitrary tools to bypass output limits.
4. A 20 KB source is read over bounded pages and each page reaches the next request inline.
5. No page-result artifact becomes a model continuation reference.
6. Provider builders accept the same closed projection; no provider-specific recursive rewrites.
7. Original three red cases are green; small-page control remains green.
8. Existing output manager, durable executor, compiler, provider replay, and security suites pass.
9. Diff contains no stored-record/schema mutation or unrelated refactor.

Advanced reviewer also confirms the Phase 3 compaction seam from the actual diff. Verdict and evidence are posted to #382. Only `CONTINUE` authorizes Phase 3.

### Phase 2 execution evidence — 2026-09-30

- TDD red: the new output-manager and registration tests failed before implementation because the default projection kept a raw `ResourceRef`, `context_page` was unsupported, and the official reader declared `default`.
- `ToolOutputManager` now emits the D-382-02 descriptor only for large whole artifact results; the locator and `read_request.arguments.ref` are generated by the shared canonical presenter.
- `context_page` is a closed policy reserved by the route map for `context_content_read`. It accepts only exact canonical D-382-03 page bytes and rejects malformed, noncanonical, and serialized-over-budget results. Its model payload is the page itself and its receipt metadata retains policy/version/size only.
- The reserved policy is added to a runtime snapshot only when the official reader declares it; ordinary default/head-tail/artifact-only snapshots retain their original three-policy bytes.
- `_neutral_context` consumes the verified `model_projection` copy. Regular large results retain the canonical locator; a `context_page` remains inline and has no `full_output_ref` field in the model-visible exchange. Raw event references remain unchanged for durability.
- The real PuPu-host integration obtains the emitted ref from the next native request and sends it unchanged to the prepared official reader. Its second hop persists a full page, compiles again with the page body present, and proves the raw durable event still has its artifact ref while the model view has no page-result continuation ref.
- Provider builder coverage passes for OpenAI, Anthropic, Gemini, Hyperspace, and Ollama.

Commands completed:

```bash
PYTHONPATH=src /Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest -q \
  tests/memory_v2 tests/context_v2/test_durable_tool_boundary.py \
  tests/context_v2/test_compiler.py
# 492 passed, 4 xfailed in 19.89s

PYTHONPATH=/Users/red/Desktop/GITRepo/unchain-382/src:/Users/red/Desktop/GITRepo/pupu-382/unchain_runtime/server \
  /Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest -q \
  unchain_runtime/server/tests/test_memory_v2_unchain_runtime_factory.py
# 19 passed in 2.36s
```

No original checkout or running sidecar was modified or restarted. Phase 3, compaction policy, the no-progress guard, runtime-manifest admission, and exact-wheel testing have not started.

### Checkpoint 2 independent review — 2026-09-30

Verdict: **CORRECT BEFORE CONTINUING**. Phase 3 is not authorized yet.

Independent active-agent probes found three actionable gaps:

1. **CP2-F1 / P1:** `head_tail` and `artifact_only` outputs still expose the internal ResourceRef object in actual provider requests. Built-in `read`, `web_fetch`, `grep`, `glob`, `shell`, and `lsp` use `head_tail`, so the original unreadable-ref defect remains on these routes. Generate canonical locators/read arguments at the trusted fresh model-view seams while retaining raw references and ordinary policy snapshots.
2. **CP2-F2 / P1:** both a malformed read reference and a syntactically valid but undisclosed locator are caught by `Tool.execute` as normal tool errors, then rejected by `context_page` success-page validation. The actual agent raises `ToolOutputManagementError` before a second provider request. Preserve a closed, bounded recoverable error path for the official reader without weakening successful-page validation, authorization, or durability. Regression-test both error classes through the automatic runtime policy.
3. **CP2-F3 / P2:** a fresh neutral-history paged descriptor is passed through `_preview` again. Its 3,157-character descriptor becomes a 1,200-character partial JSON preview and loses `read_request`, tail, and closed metadata. The outer locator survives, but the promised complete descriptor does not. Preserve the trusted bounded descriptor at this seam and test exact read arguments without invoking historical compaction.

Positive independent evidence: a real prepared agent using the automatically selected reader policy reads a roughly 20 KB source over three bounded pages, including middle/tail sentinels. Every page reaches the immediate following OpenAI request inline, keeps the original locator, has no page-result artifact ref, and reassembles the complete stored JSON.

Independent results: broad Unchain output/context/provider regression **1,636 passed, 1 skipped, 1 xfailed**; Memory V2 **422 passed, 4 xfailed**; PuPu host factory **19 passed**; CP1 independent probes **48 passed**; new CP2 contract probes **1 passed, 5 failed** across the three findings above. Evidence is in `.release-qa/ticket-382/checkpoint-2-review-1.md` and `cp2-independent-probes.txt`.

Only repair these Phase 2 gaps, migrate the meaningful probes into self-contained repository tests, and stop for another CP2 review. Do not start Phase 3 or modify raw stored records/provider frames. No product-code edits were made during this review.

### Phase 2 CP2 repair evidence — 2026-09-30

The three CP2 findings are repaired and require a fresh advanced review before Phase 3:

1. **CP2-F1:** The live runtime and compiler now copy only harness-owned retrieval fields into a fresh model view. `default`, `head_tail`, and `artifact_only` keep their policy payloads while their model-visible `full_output_ref` and `read_request` use the canonical locator. Raw receipt/event refs remain structured durable refs.
2. **CP2-F2:** The official reader continues to reject invalid, undisclosed, and invalid-capability requests directly. When the ordinary tool executor turns one of those failures into its standard error result, the closed `context_page` projection converts only that exact reader-error shape into the fixed, data-free `unchain.context_content_error.v1` result. Arbitrary page/error shapes still fail closed.
3. **CP2-F3:** The neutral compiler validates and retains a fresh bounded `unchain.tool_output.paged.v1` descriptor rather than applying `_preview` a second time. Its locator, read request, and preview metadata survive unchanged. Arbitrary results still use the existing preview path.

Formal regressions now cover the actual active AgentBuilder/provider path for all three ordinary policies, malformed and undisclosed reader requests reaching a second provider turn, raw durable ref non-authority, fixed error validation, durable completion projection, and neutral descriptor preservation. Red baseline: **5 failures** in the PuPu host regression before repair. Green evidence: PuPu host **23 passed**; independent CP2 replay **6 passed**; Unchain targeted suite **645 passed, 4 xfailed**; broad output/context/provider suite **1,637 passed, 1 skipped, 1 xfailed**. Both clones pass `git diff --check`. GitNexus index was rebuilt in both clones; nonpartial change analysis is MEDIUM for 11 Unchain files/43 symbols/3 affected flows and LOW for the PuPu test file, with no HIGH/CRITICAL result.

No original checkout or sidecar was modified/restarted. No commit, push, PR, ticket closure, rollout, or Phase 3 work occurred.

## Phase 3 — Historical recovery, guard, runtime compatibility, exact pair

Worker authorization ends at Checkpoint 3.

### 3.1 Preserve rereadability through compaction

Modify:

- `src/unchain/tools/output_management/__init__.py::compact_historical_message`
- `src/unchain/context/compiler.py::_compact_tool_result` and only the surrounding data flow required to supply trusted descriptors
- compiler/compaction tests

Requirements:

- Extract/preserve only exact harness-owned descriptors from generated tool-result model payloads.
- Provider-valid OpenAI/Anthropic/Gemini/Ollama compact shapes remain valid.
- Compact marker retains source locator, read range, EOF/next offset, and reread request.
- Current mandatory read page is not compacted before its immediate continuation. If it cannot fit, reduce page size earlier or fail with an explicit budget error.
- Cold reconstruction from old ResourceRef receipts emits the new locator without rewriting stored history.
- `_compact_ref` must preserve valid fragments anywhere locator roundtrip depends on them.

Test current page, later turn, retry/new attempt, interaction resume, cold restart, checkpoint event fragments, handoff refs, normal/graph/subagent compilation, and provider change.

### 3.2 Add attempt-local no-progress guard

Implement inside the official context-reader/toolkit scope, not the generic executor.

- Count only identical normalized nonretryable failures.
- Third identical failure avoids another capability/storage read and returns `CONTEXT_READ_NO_PROGRESS`.
- Success clears the streak.
- Changed ref/offset/limit/error and retryable errors remain executable.
- Unrelated tools and ordinary pagination are unaffected.
- New toolkit/attempt resets. Add a test documenting that cold restart resets the in-memory allowance.

Do not add a database table, journal event type, or persistent schema for this safety net.

### 3.3 Add runtime protocol admission

Unchain:

- Add `context_content_paging_v1` to `context_memory` features in `src/unchain/runtime/runtime_protocol.py`.
- Update `tests/test_runtime_protocol_manifest.py` and any frozen protocol fixtures.

PuPu:

- Require the same feature in `unchain_runtime/server/context_memory_v2_capability.py`.
- Update the canonical Windows protocol contract if it mirrors `_REQUIRED_PROTOCOLS`.
- Add strict admission tests: exact imported runtime accepted; missing feature rejected before provider/run side effects; invalid/old manifest remains rejected.
- Keep Git revision/source path telemetry-only.

### 3.4 Deterministic suites

Minimum Unchain command, using an isolated environment that imports clone code:

```bash
PYTHONPATH=/Users/red/Desktop/GITRepo/unchain-382/src \
/Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest \
  tests/context_v2/test_context_content_access.py \
  tests/memory_v2/test_memory_toolkit_contract.py \
  tests/memory_v2/test_memory_toolkit_security.py \
  tests/test_tool_output_management.py \
  tests/test_runtime_protocol_manifest.py \
  tests/context_v2/test_durable_tool_executor.py \
  tests/context_v2/test_compiler.py -q
```

Then run the complete Unchain suite using its repository test workflow. Do not use Jest for Python.

Minimum PuPu server command:

```bash
cd /Users/red/Desktop/GITRepo/pupu-382/unchain_runtime/server
./run_tests.sh \
  tests/test_context_content_pagination.py \
  tests/test_memory_v2_unchain_runtime_factory.py \
  tests/test_context_memory_v2_runtime_protocol.py \
  tests/test_chat_stream_runtime_protocol_gate.py
```

Then run the full affected server suite. After Python changes, restart only an isolated ticket sidecar for runtime checks.

### 3.5 Build and reuse one exact Unchain wheel

After source tests stabilize:

1. Build the wheel once from `/Users/red/Desktop/GITRepo/unchain-382` into a ticket-specific evidence directory.
2. Record wheel filename and SHA-256.
3. Create a fresh isolated environment and install that exact wheel.
4. Record the imported module path, version, full runtime manifest, and manifest digest.
5. Run all PuPu contract/package/sidecar tests against this installed wheel. Do not substitute mutable sibling source and do not rebuild between matrices.
6. Save a machine-readable evidence JSON tying PuPu HEAD, Unchain base/diff, wheel SHA, manifest digest, commands, results, and NOT_RUN cells.

### 3.6 Isolated provider acceptance

Only use existing authorized provider configuration in an isolated ticket profile. Never read or mutate the user's production chat database.

Run the original research prompt through Kimi, Claude, and GPT-5.4. For each, report:

- time to first streamed text;
- total completion time/outcome;
- provider turn count;
- fetch count;
- context read count;
- invalid-ref errors;
- no-progress guard hits;
- whether any successful page was re-offloaded;
- whether final answer cites/uses retrieved content.

Required functional result: zero invalid-ref failures, zero recursive page re-offloads, bounded forward-moving offsets, and a completed answer. Timing is reported, not used as a hard pass threshold because provider/network variance is external.

If credentials/provider access are unavailable, mark live cells `NOT_RUN`; deterministic exact-wheel acceptance may pass, but active rollout remains `INCOMPLETE`.

### Checkpoint 3 — Advanced final implementation review

Worker must stop. Advanced model performs the final development review:

1. Re-run critical tests independently from worker claims.
2. Inspect the full PuPu and Unchain diffs against D-382-01..06 and BC/SEQ/AC.
3. Verify no raw record, provider replay, authorization, or ordinary memory behavior weakened.
4. Verify compaction/cold recovery keeps a usable original-source locator.
5. Verify no-progress logic is narrow and reset behavior is documented.
6. Verify PuPu rejects a runtime missing `context_content_paging_v1` before effects.
7. Verify every cross-repo test used the same wheel SHA and runtime manifest digest.
8. Review provider metrics and distinguish product defects from provider/network failures.
9. Run nonpartial GitNexus `detect-changes --scope all` in both clones and inspect HIGH/CRITICAL/UNKNOWN findings.
10. Confirm both worktrees contain only ticket files and no credentials or user data.

Verdict:

- `IMPLEMENTATION READY`: all deterministic gates pass; live cells pass or are explicitly NOT_RUN with rollout INCOMPLETE.
- `CORRECT BEFORE READY`: bounded fixes remain; return exact findings to the worker.
- `STRONG-MODEL TAKEOVER`: contract, replay, authorization, or cross-repo artifact integrity is uncertain.

Record the verdict and evidence on #382. Keep the ticket open. Do not commit/push/create PR until the user later says `close` under the ticket workflow.

## Stop conditions for the weaker worker

Stop before dependent edits and report evidence if any of the following occurs:

- The fixed locator/page schema cannot fit existing provider tool-result shapes.
- A change appears to require editing raw receipts/events or signed provider frames.
- Authorization must move, weaken, or infer disclosure from possession of a string.
- Ordinary memory readers change shape or fail.
- `context_page` requires a generic unlimited-output escape hatch.
- Compaction cannot preserve a locator without a new durable schema.
- A new database/journal migration appears necessary.
- The no-progress guard would need persistence or generic executor changes.
- Any HIGH/CRITICAL impact is broader than documented.
- A provider-specific workaround changes shared semantics.
- Tests can pass only by manually encoding the producer ref.

## Reference designs

- DeepSeek Harness `639ed015397290b3745d163aafe02ffee4aa3f84` (MIT): backend-owned spill locator/retrieval hint; persist before preview; `read` excluded from spill; explicit continuation.
- Codex `bcd6d9ab6b9f26f85d76d0c680b3f88b367bffa0` (Apache-2.0): durable rollout separate from model-visible history and tool output roles.
- OpenClaw `a77224141f5e01f51fe9f7cc3feec16639cb8145` (MIT): compaction retains usable read handles; no-progress detection is outcome-aware and optional.

Borrow the principles and retain upstream licenses if any code is copied. The planned implementation should not require copying source.

### Checkpoint 2 renewed independent review — 2026-09-30

Verdict: **CORRECT BEFORE CONTINUING**. Native all-policy paging and recoverable reader errors now pass, but two fresh neutral-path gaps remain:

1. **CP2-R1 / P1:** `_neutral_context` passes `_compact_ref` (kind/id/revision, without ResourceRef schema) to `_model_context_output`, which uses `ResourceRef.from_dict`. The caught validation failure returns the raw payload. Real durable `head_tail` and `artifact_only` fresh neutral exchanges therefore retain unreadable object refs. Default only passes because its descriptor is already canonical. Use the verified full ref or an explicitly validated compact-to-ref adapter at the model-copy seam; keep durable records and public reader validation unchanged.
2. **CP2-R2 / P2:** correcting the reference mismatch alone still sends the head-tail model projection through `_preview`, because it is neither a successful page nor an exact paged descriptor. A separately labeled diagnostic reproduces loss of read_request and tail metadata after 3,109 characters become a 1,200-character partial preview. Preserve bounded harness retrieval fields independently of tool-content previewing and retain head-tail semantics/budgets.

Independent regression: Unchain **2,061 passed, 1 skipped, 5 xfailed**; PuPu host + retained CP1/CP2 **77 passed**. New independent matrix **4 passed, 3 failed** (two actual neutral-policy failures and one diagnostic isolating preview loss). Native default/head_tail/artifact_only each complete exact >20 KB multipage reconstruction. Both clones pass diff checks; fresh structured graph analysis remains PuPu LOW and Unchain MEDIUM, without partial/truncated flags.

Full evidence: `.release-qa/ticket-382/checkpoint-2-review-2.md`, `test_cp2_review_2.py`, `cp2-review-2-probes.txt`, and `cp2-review-2-candidate-manifest.json`. These are fresh Phase 2 issues, not deferred historical compaction work. Repair only R1/R2, add self-contained formal policy-matrix tests and stop for renewed CP2 review. Phase 3 remains unstarted and unauthorized. No product code or original checkout was changed during this review.

### Phase 2 CP2-R1/R2 repair evidence — 2026-09-30

The two renewed-review findings are repaired and require another independent CP2 verdict before Phase 3:

1. **CP2-R1:** the shared fresh model-view adapter now converts the already-validated compact durable artifact reference through the compiler's existing `_resource_ref` boundary before generating the canonical locator. It no longer applies `ResourceRef.from_dict` to a compact reference that intentionally lacks the durable schema wrapper. Raw semantic events and receipts remain structured references and are not mutated by compilation.
2. **CP2-R2:** a new strict `validate_context_output_presentation` gate accepts only a canonical initial `context_content_read` request with exact string ref, integer offset `0`, integer limit `8192`, and a canonical serialized size no greater than `12,288` bytes. Only a manager-produced model copy that passes this gate avoids the generic 1,200-character preview. `head_tail` therefore keeps both policy previews plus the exact reader request; `artifact_only` keeps its policy note plus the request. Arbitrary or oversized result mappings retain the old preview path.

The formal PuPu integration now selects the real durable output policy at both toolkit declaration and persistence, parametrizes `default`, `head_tail`, and `artifact_only`, checks that each policy identity survives, copies the emitted request unchanged into the prepared official reader, and proves compilation does not mutate the source semantic events. Before the product fix this matrix was **1 passed, 2 failed**; after the fix it is **3 passed**.

Boundary evidence: BC-382-01 / AC-01 now passes for the formal native and fresh neutral three-policy matrices. BC-382-02 / AC-03 / AC-04 remain green in the retained multipage execution probes. The change does not edit stored schemas, journal records, provider-native frames, authorization, capability disclosure, or ordinary output policy snapshots. Phase 3 historical compaction, no-progress guard, runtime-manifest admission, exact-wheel testing, isolated sidecar restart, and live provider acceptance remain NOT_RUN and unauthorized at this checkpoint.

Verification:

- Unchain output management, toolkit, full context_v2, provider replay/contract, and full memory_v2: **2,064 passed, 1 skipped, 5 xfailed in 50.45s**.
- PuPu host factory, retained CP1/CP2 probes, and the expanded independent policy matrix: **86 passed in 14.79s**.
- New shared-protocol focused suite: **23 passed**; exact type negatives reject bool/float read arguments.
- Both clones pass `git diff --check`.
- Fresh GitNexus indexes and structured `detect_changes(scope="all")`: PuPu **LOW**, 1 tracked test file / 9 symbols / 0 affected flows; Unchain **MEDIUM**, 11 tracked files / 43 symbols / 3 affected flows. No partial, truncated, error, HIGH, or CRITICAL change result. The new protocol/test files remain untracked and are therefore not counted by Git diff-based change detection; they were indexed, directly reviewed, and exercised by the focused and broad suites. Full process enumeration remains bounded, and PuPu BM25 indexing remains degraded; neither limitation is treated as proof of absent callers.

No original checkout, running user sidecar, user database, commit, push, PR, Project field, closure, or rollout was touched. The test processes imported the isolated candidate source in fresh Python processes. Any later runtime/deployed acceptance must restart only an isolated ticket sidecar and use the exact built artifact pair required by Phase 3.

### Checkpoint 2 independent review 3 — 2026-09-30

Verdict: **CORRECT BEFORE CONTINUING**. CP2-R1/R2 pass on the independently rerun >20 KB native/neutral three-policy matrix. One remaining fresh-path size-boundary defect prevents CP2 acceptance:

**CP2-R3 / P2:** `validate_context_output_presentation` correctly rejects a model view over 12,288 serialized bytes, but `_neutral_context` then sends the entire model result (including its harness-owned read_request) through `_preview`. The ordinary default policy retains raw sources up to its existing 16,000-byte inline limit. A real 13,021-byte source therefore produces a 13,679-byte model presentation that is too large for the new validator but still below the paging threshold. Neutral compilation turns it into a partial 1,200-character preview and drops the exact read_request. The outer canonical locator still works when supplied manually to the prepared official reader; this is an exact-read-arguments defect, not loss of stored content or an authorization bypass.

Correction: bound/reduce only the content portion of an oversized fresh model presentation and reattach the trusted canonical locator and exact read_request outside that reduction. Preserve the initial read handle regardless of whether body content is inline, head-tail, or shortened. Keep the successful page/descriptor limits, ordinary policy snapshots, raw events/receipts and public reader validation unchanged. Add formal size-matrix coverage on both sides of the 12,288 serialized-presentation and 16,000 source-inline thresholds; do not raise the limit to make the test pass or defer this fresh seam to historical compaction.

Independent results: Unchain **2,064 passed, 1 skipped, 5 xfailed in 50.86s**; PuPu host plus retained CP1/CP2 and previous independent matrix **86 passed in 15.07s**; new independent size/negative matrix **8 passed, 1 failed in 1.24s**. Default 8 KB and 20 KB, head_tail/artifact_only 13 KB, overbudget rejection and exact argument-type negatives pass. Source events remain unchanged across compilation. The failed source uses the actual host, durable authorization/completion boundary, output manager and fresh compiler without historical compaction or mocked projection.

BC-382-01/AC-01 is still incomplete for exact arguments in the oversized fresh neutral fallback. BC-382-02/AC-03/AC-04 remain green. Phase 3 is unstarted and unauthorized. Evidence: `.release-qa/ticket-382/checkpoint-2-review-3.md`, `test_cp2_review_3.py`, `cp2-review-3-probes.txt`, graph reports and candidate manifest. This review modifies only the handoff and ignored acceptance evidence; no product fix, original-checkout write or original sidecar restart is performed.

### Phase 2 CP2-R3 repair evidence — 2026-09-30

The oversized fresh neutral fallback now previews only the tool-content body and then reattaches a strictly validated, canonical initial `context_content_read` handle. A 13 KB default-policy result therefore becomes a bounded model presentation (`inline: false`, `truncated: true`) while retaining an exact offset-0, limit-8192 request for its original durable artifact. The 12,288-byte presentation ceiling remains unchanged.

The shared protocol now derives a canonical read handle only after strict validation, and rejects an arbitrary normal tool result that merely claims the context-page schema. Valid pages remain direct model results; ordinary data cannot use the page/error fast path to bypass normal projection.

Formal regression covers the gap between the source inline threshold and serialized presentation ceiling: it uses the active host, durable authorization/completion boundary, output manager, fresh compiler, and prepared official reader. It proves the 13 KB result preserves the request, returns a bounded first page with a forward continuation, and retains the canonical locator for the durable receipt. The pre-fix independent probe was **8 passed, 1 failed**; the repaired focused boundary/policy matrix is **4 passed**. Shared locator protocol tests are **24 passed**.

Verification after the repair:

- Unchain relevant regression suite: **2,065 passed, 1 skipped, 5 xfailed in 51.66s**.
- PuPu host factory plus retained CP1/CP2 probes: **96 passed in 15.98s**.
- Both clones pass `git diff --check` and source compilation.
- Fresh GitNexus `detect_changes --scope all`: PuPu **LOW**, 1 test file / 10 symbols / 0 affected flows; Unchain **MEDIUM**, 11 files / 44 symbols / 3 affected flows. No HIGH or CRITICAL result. The graph retains known index limitations for untracked files and global process truncation; these are not treated as an all-clear and the new protocol file is directly covered by the focused and broad suites.

This repair is ready for a renewed independent CP2 review only. Phase 3 remains unstarted and unauthorized. No original checkout, running sidecar, user database, commit, push, PR, Project field, closure, or rollout was touched.

### Checkpoint 2 independent review 4 — 2026-09-30

Verdict: **CONTINUE**. No remaining blocking finding was reproduced in the Phase 2 fresh execution path. CP2-R1, CP2-R2 and CP2-R3 now pass independent regression. Phase 3 may begin under the existing bounded handoff; this review does not perform Phase 3 or approve production rollout.

Independent additional coverage: **21 passed in 5.91s**. The real host/durable boundary/compiler/official-reader matrix covers default, head_tail and artifact_only, ASCII filler sizes 11,800 / 12,100 / 13,000 / 15,400 / 16,100, CJK+emoji and escaped/control characters. Every fresh neutral result retains exact initial arguments within 12,288 serialized bytes. Each subsequent official reader page is persisted through the real completion boundary, appears unchanged in the next neutral compiler view, advances the original offset and exposes no new page-result continuation artifact. Concatenated bytes equal the original canonical source. Raw source events are unchanged by every compilation.

Independent regression re-run: Unchain **2,065 passed, 1 skipped, 5 xfailed in 57.03s**; PuPu host plus retained CP1/CP2 probes **96 passed in 17.50s**. Native >20 KB three-policy execution, prepared direct reads, recoverable read errors, small control pages, five provider builders, replay and authorization tests remain green. Reserved-policy, malformed/oversized page and exact-type negative controls pass. Both clones pass `git diff --check`.

Fresh structured GitNexus results: PuPu **LOW**, 1 tracked test file / 10 symbols / 0 affected processes; Unchain **MEDIUM**, 11 tracked files / 44 symbols / 3 processes. Neither returned partial/truncated/error or HIGH/CRITICAL. Untracked protocol/tests are excluded from Git diff-based counting and were indexed, inspected and tested directly. Global process enumeration and PuPu BM25 degradation remain known index limits; an absent flow is not interpreted as an absent caller.

The actual Phase 3 seam is confirmed: `_compact_tool_result` calls `ToolOutputManager.compact_historical_message`, which still replaces provider result content with a generic journal marker. `_reduce` can select that path for mandatory current results under budget pressure. Phase 3 must preserve original-source handles/ranges during historical reduction and must not compact the immediate current read page. Cold reconstruction, valid fragments, attempt-local no-progress guard, runtime admission, exact-wheel/isolated-sidecar and live provider metrics remain NOT_RUN at CP2; they are not included in this passing verdict.

Evidence: `.release-qa/ticket-382/checkpoint-2-review-4.md`, `test_cp2_review_4.py`, `cp2-review-4-pupu-graph.json`, `cp2-review-4-unchain-graph.json`, and `cp2-review-4-candidate-manifest.json`. Acceptance changes only the handoff and ignored evidence. No product edit, original-checkout modification, user sidecar restart, production data access, commit, push, PR or rollout occurred.

### Phase 3 worker evidence — pending Checkpoint 3 review — 2026-09-30

The bounded Phase 3 implementation is complete. It is **not** accepted for rollout;
an advanced Checkpoint 3 review is required before any isolated sidecar or live
provider run.

1. **Historical recovery:** provider-native historical compaction now preserves
   only strict harness-issued reader state. The compact marker carries a
   canonical locator, exact page range, EOF/next-offset state, and a usable
   `context_content_read` continuation. A current page that cannot fit is not
   compacted into an unusable marker; compilation fails with the explicit
   `current context page exceeds the input budget` error instead.
2. **No-progress protection:** `context_content_read` keeps an in-memory,
   toolkit-local streak keyed by normalized `ResourceRef`, offset, and limit.
   The third identical non-retryable failure returns
   `CONTEXT_READ_NO_PROGRESS` before another capability read. A successful
   page clears the streak; changed range, retryable error, unrelated tool, and
   newly built toolkit remain executable. No storage, journal, schema, or
   generic executor was changed for this guard.
3. **Admission:** the exact `context_content_paging_v1` feature is now required
   by Unchain's runtime manifest, PuPu's server gate, desktop startup gate,
   release-artifact verifier, and the versioned Windows contract. Missing it
   is rejected before a provider/run side effect.

Deterministic evidence:

- Unchain focused matrix: **227 passed, 4 xfailed**.
- PuPu focused server matrix with the ticket source: **61 passed**.
- Release artifact and Windows-contract tests: **13 passed**.
- Electron protocol/startup gate tests: **75 passed**.
- Complete Unchain suite: **3,857 passed, 16 skipped, 5 xfailed**.
- Complete PuPu sidecar suite against the installed candidate wheel:
  **2,647 passed, 17 skipped, 3,597 subtests passed**. It emitted two existing
  environment warnings: one Pydantic serializer warning and one background
  test thread teardown warning when `UNCHAIN_DATA_DIR` is intentionally unset.

Exact-wheel candidate evidence is
`.release-qa/ticket-382/candidate-wheel-evidence.json`:

- wheel: `unchain-0.2.0-py3-none-any.whl`
- SHA-256: `a5544655077dd2fe306a8ad65dfcd8b83161622cf6b097dd980e83c386aacf4a`
- manifest digest: `cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`
- installed module path is the ticket-local `installed-wheel/site-packages`
  distribution; `direct_url.json` records the same wheel hash.

The candidate was intentionally built from the ticket's uncommitted source.
Its evidence records Unchain base `663d051291a7e6f1681d332206141291d2be9597`
and working-patch SHA-256
`0f647e0bc116ea9a635aaa8dfb1ef787854340fca02a73a97821278bb766aa01`.
It is not a release artifact: the standard builder correctly requires a clean,
committed source and has not been bypassed.

`provider_acceptance` and `official_release_artifact` are explicitly
`NOT_RUN` in the candidate evidence. No original checkout, running user
sidecar, production chat database, provider credential, commit, push, pull
request, rollout, or ticket closure was touched.

GitNexus nonpartial change analysis reports PuPu **LOW** (9 files, 16 symbols,
no affected process) and the cumulative Unchain ticket diff **HIGH** (14 files,
74 symbols, 10 affected flows). The latter requires the independent Checkpoint
3 reviewer to inspect the full diff and affected flows before progressing.

### Checkpoint 3 independent review 1 — 2026-09-30

Verdict: **CORRECT BEFORE READY**. The tested candidate is **NO-GO**. Four in-scope findings require repair:

- **CP3-R1 / P1:** `_reduce` protects only source-indexed current pages; the actual injected native pending batch is still compacted before immediate continuation. Public compiler probes reproduce loss of an 8,192-byte page at a 4,096-token window for OpenAI, Anthropic, Gemini and Ollama, while all four ample-budget controls pass. Preserve the current page by verified batch/call identity or return the explicit page-budget error.
- **CP3-R2 / P1:** the official guard raises `CONTEXT_READ_NO_PROGRESS` on the third identical failure, but `context_page` output management rewrites it to ordinary `CONTEXT_CONTENT_READ_FAILED`. Preserve a closed no-progress code through the model wire; do not expose arbitrary error text.
- **CP3-R3 / P2:** `_compact_ref` still drops valid fragments. Public compilation of checkpoint `event/7` loses that exact target. This planned Phase 3 requirement remains unimplemented; preserve validated fragment identity across compaction/reconstruction while keeping base-checkpoint authorization.
- **CP3-R4 / P2:** authorization wraps retryable capability errors without preserving classification. Two retryable authorization failures exhaust the new guard and prevent recovery on the third call. Preserve safe retryability and add authorization-stage recovery coverage.

Boundary mapping: R1 fails BC-382-02/AC-04; R2/R4 fail BC-382-04/AC-06; R3 leaves BC-382-01/AC-01 and SEQ-382-01/02 incomplete. A separate helper-level diagnostic also shows a second compaction loses the first marker's read handle; deployed reachability is not established, so it is not counted as another production blocker.

Independent results: Unchain **219 passed, 4 xfailed**; installed-wheel PuPu host/protocol **61 passed**; Electron **75 passed**; artifact verifier **9 passed**. New probes: **4 passed, 11 failed** (four current-page matrix failures, one each R2/R3/R4, four repeated-compaction diagnostics). Both diff checks pass. Reused wheel SHA-256 `a5544655077dd2fe306a8ad65dfcd8b83161622cf6b097dd980e83c386aacf4a`; its 333 Python files match current ticket source byte-for-byte, with no missing source file. No wheel rebuild occurred.

Fresh structured graph checks report Unchain MEDIUM (14 files / 68 symbols / 3 processes) and PuPu **CRITICAL** (9 files / 7 symbols / 1,108 processes), without partial/truncated flags. PuPu includes an unresolved empty-ID `_REQUIRED_PROTOCOLS` graph mapping and unrelated frontend paths; BM25 also remains degraded. This does not reproduce the worker's LOW result and must not be treated as an all-clear. Investigate graph attribution and actual admission callers before subsequent edits.

Evidence: `.release-qa/ticket-382/checkpoint-3-review-1.md`, `test_cp3_review_1.py`, `cp3-review-1-probes.txt`, candidate manifest, wheel comparison and graph reports. Exact restart/resume/interaction/graph/subagent/provider-change sequences and isolated live-provider acceptance remain incomplete. Repair within the existing plan, identify a new candidate after source changes, and stop for renewed CP3 acceptance. No product fixes, original checkout changes, running-user-sidecar restart, production-data access, commit, push, PR, closure or rollout occurred during this review.

### Phase 3 CP3-R1–R4 repair evidence — 2026-09-30

The four CP3 findings are repaired in the existing bounded design. This is repair evidence for a renewed independent CP3 review, not a rollout decision.

1. **CP3-R1:** `_reduce` now recognizes an immediate strict context page in the injected native tail by its verified tool-result call ID, as well as the source-turn page path. It never converts that page into a historical marker before the immediate continuation. If the page still cannot fit, it raises the existing explicit `current context page exceeds the input budget` error. Four provider-native pressure regressions cover OpenAI, Anthropic, Gemini and Ollama.
2. **CP3-R2:** the model-visible reader error remains data-free and closed, but admits exactly two codes: ordinary `CONTEXT_CONTENT_READ_FAILED` and `CONTEXT_READ_NO_PROGRESS`. The output manager preserves only the latter exact executor signal; arbitrary error text still becomes the ordinary fixed code. A real AgentBuilder/OpenAI second-turn sequence proves the third repeated read reaches the next request as `CONTEXT_READ_NO_PROGRESS`.
3. **CP3-R3:** compact references now retain a validated nonempty ResourceRef fragment. `_resource_ref` reconstructs that fragment, and a compiler regression proves checkpoint `event/7` remains present in pending context.
4. **CP3-R4:** authorization wraps capability errors without leaking their text, but preserves the boolean retryability classification. Two retryable authorization failures no longer consume the nonprogress allowance; the third call can authorize and return a page.

The previously diagnostic second historical compaction is also now idempotent for all five supported provider wire builders. It strictly revalidates preserved initial handles and page ranges before retaining them; arbitrary marker content cannot create a retrieval request.

Verification:

- Focused Unchain CP3 suites: **238 passed, 4 xfailed**.
- Full Unchain suite: **3,868 passed, 16 skipped, 5 xfailed in 85.27s**.
- Source-based PuPu host/protocol/chat suites: **62 passed**.
- Exact new-wheel CP3 reproducer: **15 passed**.
- Exact new-wheel full PuPu sidecar suite: **2,690 passed, 17 skipped, 3 warnings, 3,601 subtests passed in 166.64s**. Warnings are test-environment background cleanup with `UNCHAIN_DATA_DIR` unset; no test assertion failed.
- Electron startup/protocol gates: **75 passed**. Release-artifact verification: **9 passed**. Both clone diff checks pass.

One new candidate wheel was built after source validation and reused for all exact-pair tests:

- Wheel: `.release-qa/ticket-382/wheel-cp3-repair/unchain-0.2.0-py3-none-any.whl`
- SHA-256: `cea1585620e30cf569b8ce6bb689580bbe233a55fae1f2d987a6866ba8f7b241`
- Runtime manifest digest: `cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`
- The installed wheel imported from `installed-wheel-cp3-repair/unchain`; all **333** packaged Python files match current ticket source byte-for-byte, with no missing source Python file.

Fresh GitNexus change analysis remains Unchain **HIGH** (14 files / 96 symbols / 7 affected flows) and PuPu **CRITICAL** (9 files / 7 symbols / 1,105 reported processes). The PuPu graph continues to fan the shared protocol constant into unrelated UI flows; it has no partial/truncated indicator but its attribution remains unresolved and is not treated as proof of safety. The repair did not change the admission constant or desktop protocol surface. No further product edit is made under this finding; a renewed CP3 reviewer must inspect the specific compiler/toolkit and runtime-gate consumers rather than waive the graph result.

BC-382-01/AC-01, BC-382-02/AC-04 and BC-382-04/AC-06 now have deterministic repair evidence. Required cold restart/retry/resume/interaction/normal-graph-subagent/provider-change matrices beyond the existing bounded tests, plus isolated live-provider acceptance, remain `NOT_RUN`; active rollout remains incomplete under the cross-boundary gate. No original checkout, user sidecar, production data, commit, push, PR, closure or rollout was touched.

### Checkpoint 3 independent review 2 — 2026-09-30

Verdict: **CORRECT BEFORE READY / NO-GO**. CP3-R1–R4 and the repeated-compaction diagnostic pass their independent regressions against the repaired wheel. A new **CP3-R5 / P1** blocks the neutral historical paging route: `_neutral_context` retains all old strict-page bodies, `_assemble` makes their combined history mandatory, and `_reduce` cannot compact those nested exchanges. Long reads fail before EOF even though each current page is only 8,192 bytes.

The actual host durable-boundary/prepared-reader/public-compiler probe reports: 20,021 bytes / 16K window **PASS** (3 pages); 100,021 bytes / 16K **FAIL** at page 5 (40,960 bytes read); 400,021 bytes / 64K **FAIL** at page 22 (180,224 bytes read); the same source / 256K **FAIL** at page 28 (229,376 bytes read) on the separate 256 KiB semantic-history cap. These are deterministic configured-window tests, not live-model measurements or proof that every native provider run follows this route. BC-382-02/AC-04 and SEQ-382-01 remain incomplete for bounded neutral history and continuation to EOF.

Repair within Phase 3: preserve the immediate current page by verified pending identity, compact older neutral page bodies to validated original-source handles/ranges/EOF/next-read/reread state, and bound accumulated metadata using the existing checkpoint/reduction contracts. Preserve canonical durable results and tool-pair identity. Do not increase the cap or indiscriminately drop history. Add formal large-source/pressure host tests, retaining all prior regressions; then identify a new wheel after source edits and stop for renewed CP3 review.

Independent reruns: **77 passed** (15 CP3 probes + 62 installed-wheel host/protocol/chat tests); Unchain focused suites **238 passed, 4 xfailed**. New depth probes: **1 passed, 3 failed**. Existing wheel reused without rebuild: SHA-256 `cea1585620e30cf569b8ce6bb689580bbe233a55fae1f2d987a6866ba8f7b241`; actual imported manifest `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`; all 333 wheel Python files match source with no missing file. Both diff checks pass. Full worker suites were not redundantly rerun or relabelled as independent evidence.

Fresh graph results remain PuPu **CRITICAL** (9 files / 10 symbols / 1,105 processes, unresolved protocol-constant fanout/BM25 limits) and Unchain **MEDIUM** (14 files / 80 symbols / 5 processes), nonpartial/nontruncated. No safety waiver is inferred. Detailed report and executable repro: `.release-qa/ticket-382/checkpoint-3-review-2.md`, `test_cp3_review_2.py`, `cp3-review-2-depth.txt`; refreshed graph/context and full tracked-plus-untracked candidate manifests accompany them. Broader state matrices and isolated live-provider acceptance remain incomplete/NOT_RUN. This review changed only handoff/evidence, with no product fixes, original checkout/user sidecar/production data access, commit, push, PR, closure or rollout.

### Phase 3 CP3-R5 repair evidence — 2026-09-30

CP3-R5 is repaired in the existing context-content boundary. `_neutral_context` now identifies the one immediate reader page by the **latest** pending result's event ID, store sequence, and matching durable output reference. That page remains inline for the next model request. Every older strict reader page is projected as a closed `memory_v2_compacted` record containing its canonical locator, exact offset/page range, EOF/next-offset state, original-range reread request, and next-read continuation. Durable journal results are untouched.

The permanent compiler regression puts three 8,192-byte pages through the neutral semantic-event route under pressure. It proves the two old pages contain only valid reread state, the latest page keeps its body, and an earlier pending result cannot pin an old page. The original host durable-boundary depth probe now reconstructs all configured sources to EOF: 20,021 bytes/16K, 100,021 bytes/16K, 400,021 bytes/64K, and 400,021 bytes/256K are all **PASS**.

Verification after the repair:

- Full Unchain suite: **3,869 passed, 16 skipped, 5 xfailed**.
- Paging/compiler/output/toolkit/runtime focused suites: **239 passed, 4 xfailed**.
- Host durable-boundary depth probe: **4 passed**.
- One newly built wheel was used for exact-pair checks: `.release-qa/ticket-382/wheel-cp3-r5/unchain-0.2.0-py3-none-any.whl`, SHA-256 `e1d86f0324b306f2497f14becb3381e35db8053491b62714ad03fbf9f202131e`.
- Exact new-wheel CP3 and host probes: **19 passed**. Its imported package is ticket-local `installed-wheel-cp3-r5/unchain`; all 333 packaged Python files match current Unchain source byte-for-byte. Runtime manifest digest remains `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0` and includes `context_content_paging_v1`.

Fresh Unchain graph analysis after the repair is **MEDIUM** (14 changed files / 37 symbols / 1 affected reported flow). Index tracing itself reports global flow truncation, so its limited flow list is not used as a safety all-clear; pre-edit exact impact and deterministic source/host/exact-wheel tests provide the direct evidence. Both clone diff checks pass. This is repair evidence awaiting renewed independent CP3 acceptance, not a rollout conclusion. The broader cold restart/retry/resume/interaction/normal-graph-subagent/provider-change matrix and isolated live-provider qualification remain `NOT_RUN`. No original checkout, user sidecar, production data, commit, push, PR, closure or rollout was touched.

### Checkpoint 3 independent review 3 — 2026-09-30

Verdict: **CORRECT BEFORE READY / NO-GO**. Original CP3-R1–R4 regressions and the four review 2 depth cases pass. Two in-scope blockers remain:

### Phase 3 CP3-R5/R6 repair evidence — 2026-09-30

This repair completes the two remaining implementation items from review 3. It is self-verification evidence only; the ticket remains at CP3 pending a fresh independent review.

1. **CP3-R5 metadata bound:** the canonical journal retains every durable tool call/result pair unchanged. The model projection now keeps one latest validated reread cursor for each historical paged-content source, limited to the eight most recently used sources. Earlier pages from the same source add no new retrieval capability, so their range records are removed from mandatory model history. The cursor preserves the canonical locator, page range, EOF state and next-read request. This keeps repeated reads of one source constant-size and bounds distinct historical sources without raising a context cap.
2. **CP3-R6 current batch:** completed root-iteration batch membership is derived before provider-native rendering eligibility. Every strict page in that verified current batch remains inline in the neutral fallback, including after a provider change. Native replay still requires the original provider's wire compatibility; this change does not synthesize a cross-provider native tool message.

Permanent compiler regressions cover a 40-page, 320 KiB single-source history at a 16,384-token window and a two-page completed batch across OpenAI→Anthropic and Anthropic→OpenAI. The existing real PuPu durable-host probe now reads a 400,021-byte source through EOF at the same 16,384-token window; the previous failure occurred at 229,376 bytes.

Verification after the repair:

- Full Unchain suite: **3,872 passed, 16 skipped, 5 xfailed**.
- CP3 probes plus PuPu host/protocol/chat gates from source: **84 passed**.
- The same exact-wheel set: **84 passed**.
- Candidate wheel: `.release-qa/ticket-382/wheel-cp3-r6-20260930/unchain-0.2.0-py3-none-any.whl`.
- Wheel SHA-256: `1c6ec68401def9a5563184168db7471bdfa3bd57e003f26eb97b9afec3d35c01`.
- The exact-wheel test process imported ticket-local `installed-wheel-cp3-r6-20260930/unchain`. All **333** packaged Python files match current Unchain source byte-for-byte with no missing file. Its runtime manifest digest is `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`.

BC-382-02/AC-04 and the provider-change cell of SEQ-382-02 now have deterministic repair evidence. Cold restart/retry/resume/interaction/normal-graph/subagent/live-provider acceptance remains `NOT_RUN`; no original checkout, user sidecar, production data, commit, push, PR, closure or rollout was touched. Stop here for renewed independent CP3 acceptance.

The remaining bullets below are the preserved review-3 finding record from before this repair.

- **CP3-R5 / P1 remains open:** page bodies are bounded, but all old range markers/tool exchanges still accumulate in mandatory neutral history. The same actual durable-host probe with a 400,021-byte source and 16K window fails at page 28 (229,376 bytes read). Implement the metadata-bound part of the previous repair handoff using the existing checkpoint/reduction contracts; preserve canonical results, tool-pair identity and rereadability. Increasing the cap is not the repair. BC-382-02/AC-04 and SEQ-382-01 remain incomplete.
- **CP3-R6 / P1:** current membership is limited to the last pending result. With two completed reads in the immediate batch, OpenAI→OpenAI retains both bodies, but OpenAI→Anthropic disables native rendering and neutral fallback compacts the first page before immediate continuation. At an ample 20K window its body is absent. Verify current batch membership independently of provider-native eligibility, retaining all immediate pages while older batches remain reducible. BC-382-02/AC-04 and the provider-change cell of SEQ-382-02 FAIL.

Independent new-wheel regressions/host/protocol/chat gates: **81 passed**; Unchain focused suites: **239 passed, 4 xfailed**; new probes: **1 passed, 2 failed**. Reused wheel SHA-256 `e1d86f0324b306f2497f14becb3381e35db8053491b62714ad03fbf9f202131e`; actual imported manifest `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`; all 333 Python files match source and none are missing. Both diff checks pass. Structured graph checks are nonpartial/nontruncated: PuPu CRITICAL (9 files / 10 symbols / 1,108 reported processes), Unchain MEDIUM (14 / 37 / 1), with known unresolved graph attribution/global enumeration limits; no safety waiver is inferred.

Evidence: `.release-qa/ticket-382/checkpoint-3-review-3.md`, `test_cp3_review_3.py`, `cp3-review-3-new-probes.txt`, `cp3-review-3-regression.txt`, named-symbol contexts, graph reports and tracked-plus-untracked candidate manifest. Add formal host metadata-pressure and current-batch/provider-change tests, preserve all prior regressions, and stop after repair for renewed CP3 review. Broader state/live-provider evidence remains incomplete/NOT_RUN. No product fixes, original checkout/user sidecar/production-data access, commit, push, PR, closure or rollout occurred in this review.


### Checkpoint 3 independent review 4 — 2026-09-30

Verdict: **CORRECT BEFORE READY / NO-GO**. The original 400,021-byte / 16K continuation and immediate-batch provider-switch probes pass. Two history-reduction regressions remain:

- **CP3-R5 / P1:** retaining only eight recent source markers silently removes the ninth source's locator even at an ample 65,536-token window. No checkpoint/recovery projection is returned. Canonical journal rows survive, but the generated model context cannot recover that omitted source. Preserve rereadability and covered identities through the existing checkpoint/reduction contract; do not substitute unconditional eviction for the planned bound. D-382-05 and SEQ-382-01 remain incomplete.
- **CP3-R7 / P2:** source-key selection trusts result JSON fields rather than compiler-established strict-page provenance. Two ordinary raw historical tool results containing malformed page-looking fields are merged, deleting the first full exchange. This reproduces in the supported raw/legacy neutral route; active manager-wrapped outputs are not claimed to fail this way. Reduce only internally identified valid page exchanges and leave arbitrary ordinary tool data intact. BC-382-02 and ordinary-policy isolation require negative regression coverage.

Independent exact current-wheel CP3 + host/protocol/chat regression: **84 passed**. Source focused Unchain: **243 passed, 4 xfailed**. New probes: **2 failed** on the current wheel and **2 passed** on the prior R5 wheel. Reused wheel SHA-256 `1c6ec68401def9a5563184168db7471bdfa3bd57e003f26eb97b9afec3d35c01`; actual import is ticket-local `installed-wheel-cp3-r6-20260930/unchain`; all 333 packaged Python files match source with no missing file. Manifest digest: `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`. No rebuild occurred. Both diff checks pass. Fresh graph checks retain unresolved broad attribution/global enumeration/FTS limits and are not safety waivers.

Evidence: `.release-qa/ticket-382/checkpoint-3-review-4.md`, `test_cp3_review_4.py`, new-probe and prior-wheel-control outputs, focused/regression outputs, wheel comparison, graph contexts and refreshed tracked-plus-untracked candidate manifest. No product changes, original-checkout/user-sidecar/production-data access, commit, push, PR, closure or rollout occurred. Broader state and live-provider cells remain incomplete/NOT_RUN. Repair R5/R7 within Phase 3 and stop for renewed CP3 acceptance.

### Phase 3 CP3-R5/R7 repair evidence — 2026-09-30

The history reducer now makes two constrained decisions from compiler-owned state.

1. `_neutral_context` records a source identity only after strict
   `validate_context_content_page` validation succeeds. The reducer receives that
   call-ID-to-source mapping directly, so arbitrary ordinary tool JSON can never
   opt into the paging reduction path.
2. For a verified historical reader source, the model projection retains its most
   recent compact reread cursor. There is no fixed distinct-source eviction. A
   cursor retains its canonical locator, byte range, EOF/next-offset state, and
   original-source reread request; repeated pages from one source still coalesce.
   Canonical durable journal call/result pairs remain unchanged.

Formal public compiler regressions now cover nine distinct valid sources at an
ample 65,536-token window and two ordinary raw `ordinary_write` results that
contain page-looking fields. The former retains every source locator and the
latter retains both exchanges. The independent public probes from review 4 pass
against the newly built wheel.

Verification after this repair:

- Focused Unchain paging/compiler/toolkit/runtime suites: **244 passed, 4 xfailed**.
- Full Unchain suite: **3,874 passed, 16 skipped, 5 xfailed in 85.56s**. The
  worktree lacks its own `.venv`, so this used the project's existing Python 3.12
  test environment with `PYTHONPATH=src`; `run_tests.sh` correctly reported that
  local worktree limitation before this fallback.
- Exact new-wheel CP3 probes 1–4 plus PuPu host/protocol/chat gates: **86 passed
  in 67.46s**.
- Candidate wheel:
  `.release-qa/ticket-382/wheel-cp3-r7-20260930/unchain-0.2.0-py3-none-any.whl`.
  SHA-256: `0670a66d99e0ce9fd98bcc0e50d1c3abd3527c500c772e302e68b170a1a97c34`.
  The exact-wheel process imported ticket-local
  `installed-wheel-cp3-r7-20260930/unchain`; all **333** packaged Python files
  match current Unchain source byte-for-byte, with no missing or mismatched file.

BC-382-02 and D-382-05 have direct negative/positive regression evidence for
historical page provenance and rereadability. This is self-verification, not a
new independent CP3 verdict. Cold restart/retry/resume/interaction/normal-graph/
subagent/live-provider cells remain `NOT_RUN`; no original checkout, user sidecar,
production data, commit, push, PR, closure or rollout was touched. Stop for renewed
independent CP3 acceptance.

### Checkpoint 3 independent review 5 — 2026-09-30

Verdict: **CORRECT BEFORE READY / NO-GO**. CP3-R5's nine-source eviction
regression is fixed. The 400,021-byte/16K continuation, immediate completed
batch/provider-switch cases, malformed ordinary-result negative tests, and
12-distinct-source locator/range/reread checks all pass.

**CP3-R7 / P2 remains incomplete:** `_neutral_context` at compiler.py:3073–3079
validates only the output shape before setting page provenance, without checking
the recorded caller/result tool identity or its authorized paging policy. Two
ordinary `ordinary_write` or `ordinary_fetch` results that contain fully valid
page-shaped JSON from the public renderer still become one closed historical
exchange. The first completed call disappears from the model and comparable
projection, while durable inputs remain unchanged. This reproduces on the
supported raw/legacy neutral route. A control using the real active default
output manager preserves both calls; the managed default route is not claimed
to fail this way. BC-382-02 and D-382-04 ordinary-policy isolation remain
incomplete at this reduction edge.

Repair: establish reader provenance from verified call/result identity and
harness-controlled policy before allowing page-specific compaction/coalescing.
Keep the strict page validator as a content contract, but do not treat valid
tool-controlled JSON as proof of the producer. For raw compatibility, at least
require matching official reader identities; for managed outputs, check their
declared page policy rather than payload schema alone. Preserve ordinary tools'
completed exchanges and durable output recovery handle. Add a permanent valid-
schema negative case alongside the existing malformed negative, retaining the
real active-manager control and all official-reader positive cases.

Independent evidence against the one reused R7 wheel:

- CP3 review 1–4 probes + PuPu host/protocol/chat gates: **86 passed in 67.56s**.
- Source Unchain focused compiler/toolkit/durable-executor/locator/output/runtime
  suites: **244 passed, 4 xfailed in 1.75s**.
- New probes: **3 passed, 2 failed**. The same **5 passed** on the prior R5 wheel,
  demonstrating the ordinary-exchange regression introduced by coalescing.
- Wheel SHA-256:
  `0670a66d99e0ce9fd98bcc0e50d1c3abd3527c500c772e302e68b170a1a97c34`.
  Actual import: ticket-local `installed-wheel-cp3-r7-20260930/unchain`.
  All **333** source Python files match the installed wheel; none missing.
  Manifest digest:
  `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`.
- No rebuild; no full worker suite rerun or relabelling as independent evidence.
  Broader state/live-provider matrices remain `NOT_RUN`.

Evidence: `.release-qa/ticket-382/checkpoint-3-review-5.md`,
`test_cp3_review_5.py`, new-probe/prior-wheel-control/regression/focused outputs,
wheel comparison, refreshed Unchain index/named-symbol contexts, graph results
and candidate manifest. Only checkpoint documentation and ignored evidence are
changed by this review. No product fix, original checkout/user sidecar/production
data access, commit, push, PR, closure or rollout occurred.

### Phase 3 CP3-R7 provenance repair evidence — 2026-09-30

The remaining review-5 provenance gap is repaired without changing canonical
journal rows or the public page schema. A page-shaped result is now eligible for
the context-reader reduction path only when both the recorded call and result
identify the official `context_content_read` tool. Managed output additionally
must carry the harness-owned `context_page` projection policy. Strict page-shape
validation remains necessary, but payload shape alone no longer establishes
producer provenance.

Ordinary tools therefore keep each completed exchange and its durable recovery
handle even if their JSON is byte-for-byte valid under the context-page schema.
Mismatched call/result tool identities and managed pages with the default policy
are also excluded. Verified official reader pages retain the existing inline,
historical-marker, reread and source-coalescing behavior.

Permanent regressions cover valid page-shaped `ordinary_write` and
`ordinary_fetch` results, both official/ordinary identity mismatches, and an
official tool pair carrying the wrong managed projection policy. The review-5
external probe also keeps its active-output-manager control, distinct
revision/fragment identities and twelve-source reread checks.

Verification after the repair:

- New regressions plus the compiler suite: **60 passed**.
- Focused Unchain paging/compiler/toolkit/output/runtime suites: **249 passed,
  4 xfailed**.
- Full Unchain suite: **3,879 passed, 16 skipped, 5 xfailed in 87.31s**.
- CP3 reviews 1–5 plus PuPu host/protocol/chat gates from source: **91 passed**.
- The same exact-wheel matrix: **91 passed in 67.74s**.
- Exact-wheel compiler/output-manager tests: **95 passed**.
- Candidate wheel:
  `.release-qa/ticket-382/wheel-cp3-r8-20260930/unchain-0.2.0-py3-none-any.whl`.
  SHA-256: `346840babaa284ce108d14edf2b76e77616e3e9f6195a38c17315a6546836c11`.
  The test process imported ticket-local
  `installed-wheel-cp3-r8-20260930/unchain`; all **333** packaged Python files
  match current Unchain source byte-for-byte, with no missing or mismatched file.
  Runtime manifest digest remains
  `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`.

Fresh structured GitNexus analysis returns no partial, truncated or error field
and reports both cumulative worktrees as **CRITICAL**: PuPu 9 files / 10 changed
symbols / 1,108 affected symbols, and Unchain 14 files / 4 changed symbols / 694
affected symbols. This broad attribution is not treated as a safety waiver. The
refreshed Unchain index also reports global execution-flow traversal truncation,
so absent flows are not evidence of no impact. The bounded repair is supported
instead by the pre-edit caller analysis and deterministic source/exact-wheel
tests above.

This is self-verification for a renewed independent CP3 verdict, not production
or live-provider acceptance. Cold restart/retry/resume/interaction/normal-graph/
subagent/live-provider cells remain `NOT_RUN`. The original checkout, running
user sidecar and production data were untouched. No commit, push, PR, closure or
rollout occurred. A live sidecar must be restarted before later runtime
qualification because the repaired compiler is Python code.

### Checkpoint 3 independent review 6 — 2026-09-30

Verdict: **CORRECT BEFORE READY / NO-GO**. The review-5 producer-provenance
finding CP3-R7 now passes: valid page-shaped ordinary results preserve both
completed exchanges, including the real active-default-manager control. All
prior CP3 probes and PuPu host/protocol/chat admission checks pass against the
unchanged R8 wheel. Twelve and fifty distinct-source recovery controls also
pass at the tested 16,384-token window.

**CP3-R8 / P2 — no-progress guard retains stale failures after progress.**
`memory/toolkit/toolkit.py:230–258` stores separate cumulative counters by
ref/offset/limit; `:547` clears only the successful request's key. Consequently,
two failures reading A, a successful read of B, and then a now-authorized read
of A return `CONTEXT_READ_NO_PROGRESS` before authorization/storage can run.
Changing ref, offset or limit between A's failures and its retry also leaves
the old A counter active. These are not consecutive identical failures, yet
the guard prevents legitimate recovery for the rest of the toolkit lifetime.
D-382-06 and BC-382-04/AC-06 remain incomplete.

The independent sequence probes reproduce **4 failures** on the exact installed
wheel: success on another source and three changed-request cases. The unchanged
consecutive-identical-failure control still passes, proving the required narrow
guard itself remains useful. The two distinct-source recovery controls pass.

Repair within the current design: track the current consecutive fingerprint
and its count instead of preserving a lifetime dictionary of exhausted keys.
Any successful context read clears the failure streak; a different normalized
ref/range starts its own streak. Preserve the third-identical-failure fast stop,
nonretryable error classification, retryable-error exclusion, toolkit reset,
ordinary-tool isolation and model-visible closed error codes. Add permanent
sequence tests covering A-fail/A-fail/B-success/A-success and changed ref,
offset and limit followed by returning to A. No new persistent state is needed.

Independent evidence:

- Exact reused R8 wheel, CP3 review 1–5 probes plus PuPu host/protocol/chat:
  **91 passed in 67.94s**.
- Exact-wheel focused Unchain compiler/toolkit/durable-executor/locator/output/
  runtime suites: **249 passed, 4 xfailed in 1.78s**.
- New sequence/source probes: **3 passed, 4 failed in 0.54s**.
- Electron protocol/startup admission: **75 passed**. The first attempt used
  Node's test runner on Jest suites and failed to initialize; rerunning with the
  repository's Jest runner passes. This was a runner error, not a product bug.
- Artifact verifier: **9 passed**.
- No rebuild. Wheel SHA-256:
  `346840babaa284ce108d14edf2b76e77616e3e9f6195a38c17315a6546836c11`.
  Actual import is ticket-local `installed-wheel-cp3-r8-20260930/unchain`.
  All **333** source Python files match installed bytes, with none missing.
  Strictly revalidated imported manifest digest:
  `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`.
- Both diff checks pass. GitNexus structured results return no partial/truncated/
  error flags, but remain **CRITICAL** with unresolved empty-ID constants and
  broad attribution: PuPu 9 files / 10 symbols / 1,105 reported processes;
  Unchain 14 files / 4 symbols / 694 reported processes. Named-symbol lookup
  failed for compiler/toolkit functions despite their source presence; prior
  global flow-traversal limits remain unresolved. No safety waiver is inferred.

Evidence: `.release-qa/ticket-382/checkpoint-3-review-6.md`,
`test_cp3_review_6.py`, regression/focused/new-probe/Electron/artifact outputs,
wheel comparison, imported manifest, graph records and candidate manifest.
This checkpoint review changes only documentation and ignored evidence; it
does not apply product fixes. Broader state and live-provider matrices remain
`NOT_RUN`; active rollout remains incomplete. No original-checkout modification,
user-sidecar restart, production-data access, commit, push, PR, closure or rollout
occurred. Remain at CP3 for the bounded guard repair and renewed acceptance.

### Phase 3 CP3-R8 consecutive-failure repair evidence — 2026-09-30

CP3-R8 is repaired inside the official `context_content_read` closure. The
attempt-local guard now keeps one current normalized request fingerprint, error
and count rather than a lifetime map of exhausted requests. A different ref,
offset or limit clears the old streak. Any successful context read clears it as
well, including a successful read of a different source. Retryable failures also
clear the nonretryable streak. Two identical consecutive nonretryable failures
still cause the third identical call to return `CONTEXT_READ_NO_PROGRESS`
without another authorization or storage read.

Permanent toolkit regressions cover A-fail/A-fail/B-success/A-success and all
three changed-request cases: ref, offset and limit. They failed before the code
change (**4 failed, 34 passed, 4 xfailed**) and pass after it. Existing guard,
retryable authorization, toolkit-reset and closed-error tests remain green.

Verification after the repair:

- Security suite: **38 passed, 4 xfailed**.
- Related compiler/toolkit/output/runtime suites: **215 passed**.
- Full Unchain suite: **3,883 passed, 16 skipped, 5 xfailed in 90.23s**.
- Exact R9-wheel focused Unchain suites: **253 passed, 4 xfailed**.
- Exact R9-wheel CP3 reviews 1–6 plus PuPu host/protocol/chat gates:
  **98 passed in 70.39s**.
- Electron protocol/startup gates: **75 passed**; release artifact verifier:
  **9 passed**.
- Candidate wheel:
  `.release-qa/ticket-382/wheel-cp3-r9-20260930/unchain-0.2.0-py3-none-any.whl`.
  SHA-256: `6df0b112ac7a34ba7d5a8b3223bcfb3e4f9820e10a4af5106408c00dc48c307b`.
  The exact test process imported ticket-local
  `installed-wheel-cp3-r9-20260930/unchain`; all **333** packaged Python files
  match current Unchain source byte-for-byte, with no missing or mismatched file.
  Imported runtime manifest digest remains
  `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`.

The pre-edit impact lookup remains `UNKNOWN`: the refreshed Unchain index cannot
resolve the named toolkit function. Text corroboration identifies its direct
curator-host constructors plus normal, curator, consolidation and task-state
toolkit matrices; the change is restricted to the official reader closure.
Final structured graph checks return no partial/truncated/error field but remain
CRITICAL because of broad cumulative attribution and unresolved empty-ID/named
symbol/global traversal limits: PuPu 9 files / 10 symbols / 1,108 affected,
Unchain 14 files / 4 symbols / 694 affected. This is not treated as a safety
waiver.

This is repair self-verification for a renewed independent CP3 verdict. Broader
cold restart/retry/resume/interaction/normal-graph/subagent/live-provider cells
remain `NOT_RUN`; active rollout remains incomplete. No original checkout,
running user sidecar, production data, commit, push, PR, closure or rollout was
touched.

### Checkpoint 3 independent review 7 — 2026-09-30

Verdict: **IMPLEMENTATION READY** under the checkpoint's stated deterministic
criteria. No new implementation finding. **Active rollout remains INCOMPLETE**;
this is not a final feature/release acceptance or ticket closure.

CP3-R8 is independently resolved on the exact R9 wheel: the four previously
failing sequences now pass. A successful read of B clears A's old failures;
changed normalized ref, offset or limit breaks the prior streak. The third
consecutive identical nonretryable failure still stops before authorization or
storage. Three additional independent probes verify success/retryable
interruption of the same request starts a fresh streak, canonical and legacy
aliases share the normalized fingerprint, and a new toolkit can read a source
even after the previous toolkit exhausted its allowance.

Candidate hashes confirm the only product file changed since review 6 is
`src/unchain/memory/toolkit/toolkit.py`, with its permanent security regressions;
PuPu product files and all other reviewed paging/compiler/manager files are
unchanged. This review inspected that exact repair diff, rechecked cumulative
runtime/manager behavior, and reran all previous independent checkpoint probes.

Independent verification, all against the unchanged R9 installed artifact:

- CP3 reviews 1–6 plus PuPu host/protocol/chat gates: **98 passed in 68.68s**.
- Focused Unchain toolkit/compiler/durable-executor/locator/output/runtime suites:
  **253 passed, 4 xfailed in 1.90s**.
- New independent guard probes: **3 passed in 0.41s**.
- Electron protocol/startup admission: **75 passed**.
- Release artifact verifier: **9 passed**.
- Total: **438 passed, 4 xfailed** across these test commands; this is not a
  unique-test or full-suite total. The worker's full-suite result of 3,883 passed,
  16 skipped and 5 xfailed is retained as self-verification, not independently
  rerun or relabeled here.
- Wheel SHA-256:
  `6df0b112ac7a34ba7d5a8b3223bcfb3e4f9820e10a4af5106408c00dc48c307b`.
  Actual import is ticket-local `installed-wheel-cp3-r9-20260930/unchain`.
  All **333** source Python files match both wheel members and installed bytes;
  none are missing or mismatched. Strict imported manifest digest:
  `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`.

Both diff checks pass. The Unchain clone index was refreshed. Fresh all-scope
structured graph responses have no partial/truncated/error field, but both
remain **CRITICAL**: PuPu 9 files / 10 mapped symbols / 1,108 reported affected
processes; Unchain 14 files / 6 mapped symbols / 794 reported affected processes.
Empty-ID constants, unresolved named-toolkit lookup and previously documented
global flow traversal limits remain unresolved. This is no graph all-clear or
safety waiver; deterministic acceptance is bounded by the tested contracts.

Broader cold restart/retry/resume/interaction/normal-graph/subagent/live-provider
cells remain **NOT_RUN**, as expressly permitted for IMPLEMENTATION READY by
this checkpoint. They must be qualified on the exact deployed artifact pair
before active rollout. Python changes require restarting that qualification
sidecar first. No user's running sidecar was restarted.

Evidence: `.release-qa/ticket-382/checkpoint-3-review-7.md`,
`test_cp3_review_7.py`, `cp3-review-7-{regression,focused,new-probes,electron,artifact}.txt`,
wheel comparison, refreshed index, structured graph records and candidate hashes.
Only checkpoint documentation and ignored evidence changed during this review.
Original checkouts and production data were untouched. No commit, push, PR,
closure, Project transition or rollout occurred. Keep #382 open.

### Latest-dev integration and user manual instance — 2026-09-30

The user explicitly requested a running instance for their own test, then asked
to merge latest dev first. Both isolated ticket branches were fast-forwarded
without conflicts: PuPu `3394b12a4defc8b7d732d27b27cf17e354e44e0e`, Unchain
`48f235dcce8d2b62b3e7f3ac3cfc9b6d5956c217`. Their existing #382 tracked diffs
match pre-integration snapshots byte-for-byte; untracked ticket files remain.
No new local delivery commit or push was made. Original checkouts remain untouched.

Upstream updates add streamed reasoning coalescing, known-token aggregation and
Anthropic-compatible SDK `caller=None` normalization. Pre-integration graph
analysis reports the assembler File LOW (25 upstream files including provider
wire preparation/runtime); AnthropicModelIO CRITICAL (131 impacted, retry flow,
10 modules, paginated output). The risk was reported before integration. PuPu
named/file lookup remains UNKNOWN and was corroborated with the incoming source
diff and local component usage; it was not treated as an all-clear.

A new combined candidate wheel was built once after integration and installed
into the isolated ticket directory. It supersedes R9 for this manual instance:

- Wheel SHA-256:
  `170ee77e7effadff1f11b4c830e350bb5ed1bf858aefcfd7766a05a30ad9d957`.
- Imported manifest digest remains
  `sha256:cbd4cb523f235b3df597b0940c162337bf94c446a1449fa9b02a8bc9c54f95d0`.
- All 333 source Python files match wheel members and installed bytes, with no
  missing/mismatched file. Electron's development source-layout adapter points
  through an ignored `runtime-source-dev-integrated-20260930/src` symlink to that
  exact installed wheel, not the mutable sibling Unchain checkout.
- Exact combined-wheel toolkit/compiler/output/runtime/paging + Kimi replay:
  **305 passed, 4 xfailed**.
- CP3 reviews 1–7 + PuPu host/protocol/chat gates on that wheel:
  **101 passed in 70.06s**.
- Incoming reasoning and token-usage React suites: **59 passed**.

The fresh Electron development instance uses the isolated profile
`.release-qa/ticket-382/manual-profile-20260930` and clone-local React server
`http://localhost:2907/#`. It was observed visible, with window title
`PuPu #382 · Manual Test · Latest dev`. Public preload status reports sidecar
`ready`, memory `ready=true`, rollout mode `all`, and the expected verified
runtime manifest digest. Starting this new Python sidecar satisfies restart for
the manual candidate. The user's previous profile/chat database was not copied.
The fresh profile requires model-provider configuration for their live test.

The instance remains running for the user's manual test. Readiness is startup
evidence only, not a live-model/paging outcome or active-rollout acceptance.
Broader state/provider matrices remain NOT_RUN until tested. Evidence includes
`dev-integration-artifact-evidence.json`, independent test outputs, refreshed
indexes/graph reports, pre/post patch comparisons, startup status and the
ignored manual launcher. No production rollout, ticket closure or PR occurred.

Fresh all-scope checks after refreshing both clone indexes return no explicit
partial/truncated/error field: PuPu CRITICAL (9 files, 4 mapped symbols, 1,108
reported affected processes); Unchain MEDIUM (14 files, 112 mapped symbols,
5 reported affected processes). Prior graph attribution/traversal limitations
remain documented; neither response is a safety waiver. Both diff checks pass.

### Manual provider configuration correction — 2026-09-30

The user objected to being asked to reconfigure providers in the empty test
profile. Existing provider definitions and encrypted credentials were therefore
reused immediately. BC-382-05 / SEQ-382-03 / AC-382-07 are recorded in ignored
`manual-provider-transfer.md`: read-only original settings -> backed-up/stopped
test profile -> normal bootstrap/main-only credential handling after restart.

The five existing credentials (OpenAI, Anthropic, Gemini, DeepSeek, Kimi) were
verified decryptable using the same PuPu Electron identity, without printing or
exporting plaintext. App/appearance/model_providers/ui namespaces and encrypted
credential rows were copied to the test profile; copied values/ciphertext were
verified identical. The original settings database was opened read-only and
the production chat database was not accessed. The previous test settings have
a private backup. No new API key or provider application is needed.

The restarted combined-candidate instance is visible, sidecar/memory ready,
and actual preload bootstrap lists all five configured credential owners,
available credential storage and the model-provider namespace. This supersedes
the earlier requirement to configure providers manually. No live model request
was sent by the agent. The user has begun manual testing; outcomes have not yet
been assessed. No product edit or delivery action occurred.

### Manual live acceptance failure — 2026-09-30

**CP3-R9 / P1: oversized context-read arguments lose actionable feedback and
escape the no-progress guard.** The user's real gpt-5.3-codex run asking which
OpenAI models exist enters repeated fetch/read failure. Durable records contain
27 model-turn results, 17 web_fetch calls and 10 context_content_read calls;
all ten reads fail with `limit must be between 1 and 8192`. Nine read requests
use 20,000 bytes; one uses 50,000. Failed reads take approximately 148–215ms,
and repeated cached fetches approximately 0.5–0.8s; recurring model turns
accumulate latency. No SQL-latency/API-key/provider defect is established.

Confirmed weaknesses:

1. Captured provider-native reader schema advertises integer limit described
   as `Argument limit`, without minimum/maximum/default. Reader description
   omits 8192. Generated read_request correctly specifies 8192, but the model
   overrides it.
2. Raw range error is replaced by generic `CONTEXT_CONTENT_READ_FAILED` in
   context_page projection. The model loses corrective feedback. Preserve
   errors as explicit safe closed codes/recovery fields or agree a bounded
   normalization policy; do not blindly expose arbitrary raw exception text.
3. Limit validation runs before the reader guard/catch, so even a third
   identical invalid-limit call bypasses loop accounting. Re-fetching also
   generates distinct refs, outside the scope of a per-ref failure guard.

The apparent UI ARGS value wrapper is not the cause: native arguments are flat,
and raw errors are range validation. Extract fallback also failed because
extract_model was not configured.

Minimal deterministic reproduction against the exact running combined wheel,
through actual reader and declared output manager: **3 failed, 1 passed in
0.44s**. Both oversize error projections lose 8192, and a third identical invalid
call is not guarded. Legal 8192-byte read control passes. Evidence:
`test_manual_live_read_recovery.py`, `manual-live-read-recovery-repro.txt`,
`manual-live-loop-evidence.json` (ignored ticket-local evidence, no credentials).

The prior development-only IMPLEMENTATION READY verdict is superseded by this
live failure. Repair argument guidance, safe corrective feedback/normalization
and relevant loop coverage; requalify the exact user scenario on the fixed
artifact pair before readiness/delivery or active rollout. Earlier deterministic
tests missed this error-recovery sequence and do not establish real usability.
This investigation changed only documentation and ignored evidence, with no
product fix or interruption of the user's run. #382 remains open.

### CP3-R9 authorized repair contract — 2026-09-30

Keep the existing strict 1..8192 byte request contract (no silent limit coercion).
BC-382-06 CLOSED/VERSIONED: official reader parameter failure -> Tool.execute
error -> manager -> compiler/provider. Preserve exactly schema_version/trust/code;
add only fixed limit/offset corrective codes with numeric constraints, never
arbitrary exception text or a source echo. Advertise numeric bounds/defaults via
reader-only provider_native_specs and exact ToolParameter descriptions. The
durable registry rejects ToolParameter subclasses; keep its strict record check
and bind bounds/defaults through existing canonical native configuration. Bind support to
new context_memory feature context_content_read_recovery_v1, required by PuPu
sidecar/Electron/artifact/Windows admission; old runtimes reject before effects.
AC-382-08: actual Tool.execute with limits 20000 and 50000 reaches every provider
as safe corrective feedback; correcting to 8192 succeeds and reassembles to EOF.
AC-382-09: unknown error text stays generic and unknown error fields/codes reject.
AC-382-10: manifest missing recovery feature rejects at every admission boundary.

SEQ-382-04: disclosed ref -> invalid limit twice -> third identical failure stops
without storage -> valid 8192 request breaks streak -> success -> next offset/EOF;
changed ref/range, Boolean/string/negative arguments, retryable errors and fresh
toolkit reset are controls. Fingerprint validates ResourceRef first, then keys
the raw typed range before bounded_integer validation; invalid range failures
join the existing local guard. Broader cross-ref/global model oscillation remains
outside this narrow guard and is not claimed solved; actionable feedback and the
actual user scenario must demonstrate recovery. Test the exact new wheel pair;
do not rebuild it between matrices. Do not restart an active user run.

### CP3-R9 repair evidence — 2026-09-30

Fixed the identified oversized-read failure loop. The actual Tool.execute
regressions first failed (15 red), then passed with bounded provider-native
schemas, fixed corrective error codes, and range validation inside the narrow
failure guard. Exact ToolParameter records remain mandatory; native overrides
carry numeric metadata without weakening the durable handler registry.

Validation: Unchain full suite 3911 passed / 16 skipped / 5 xfailed; exact installed
wheel + PuPu host + CP3 probes + original reduced live repro 103 passed;
Electron startup/rollout 76 passed; artifact admission 10 passed. The added
OpenAI Responses transport tests deliberately issue 20000/50000, inspect the
next native provider input, correct to 8192, follow next_read to EOF and complete
in five provider turns. Arbitrary exceptions remain generic; missing recovery
feature rejects at sidecar, Electron and artifact admission.

Immutable wheel: SHA256
7e950aa100e710602680a6419c4580e3284590384671ff66491400fa654410fc.
Manifest: sha256:a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be.
All 333 Python source files match wheel and installed bytes. The idle manual
instance was restarted onto this exact artifact, keeping its provider settings,
encrypted credentials and existing chats. Sidecar/memory are ready with the new
digest. Originals were not changed; no commit/push/PR/closure.

Real user scenario: gpt-5.3-codex, core toolkit, "看看openai现在有什么model".
Completed in **80.040 seconds** according to the runtime start/update timestamps
(the later polling observation was ~100 seconds and is not execution duration).
Five web_fetch calls, nine successful context_content_read calls, zero range
errors, final answer 1471 characters. Reads use limit=8192 and offset=0/8192.
However the same Markdown URL was fetched three times and already-read content
was reread. The range-error loop is fixed; **overall simple-task latency
acceptance remains NO-GO**. This is one live run, not a repeatable performance
benchmark or proof that all duplicate-read behavior is solved.

Evidence resides under .release-qa/ticket-382/live-repair-* including the reduced
real-run evidence, exact artifact provenance and test logs. Graph analysis was
refreshed in both clones; all-scope change reports classify the accumulated
ticket as critical/high. They omit partial/truncated fields; PuPu indexing also
reports process caps and degraded FTS. Do not interpret them as a clean complete
blast-radius proof. No changes were committed.
