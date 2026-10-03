# Provider uncertainty diagnostics — 2026-10-02

The diagnostic repair is implemented. New failures distinguish their observed
reason and phase instead of displaying only `durable_provider_turn_uncertain`.
The stable programmatic code remains unchanged. This does not establish the
original cause of the owner's earlier Gemini 3.7 Flash failure: that attempt did
not persist its exception category, and its controlled SDK replay succeeded.

## Model availability

Google's current [deprecation documentation](https://ai.google.dev/gemini-api/docs/deprecations)
states that Gemini 2.5 Flash is not deprecated and has no announced shutdown
date. Access to 2.5 models is limited to users who actively used them previously.
The observed HTTP 404 / NOT_FOUND is consistent with model/endpoint availability
or project eligibility; it does not prove global retirement or this project's
eligibility. No credentials or project permission were changed.

## Delivered behavior

- Closed reason and phase enums describe timeout, disconnect, missing completion
  marker, decoding failure, malformed tool call, conflicting/unsupported finish,
  stream API error and local request/result processing failure.
- Actual enclosing HTTP status and closed provider status names are retained when
  available. An HTTP 200 stream containing UNAVAILABLE is not relabeled HTTP 503
  and does not authorize automatic resend.
- A lease v4 observation updates STARTED to STARTED through revisioned CAS.
  It creates no terminal result, retry authority or result binding. Cold SQLite
  recovery reproduces the same diagnostic with zero additional sends. Existing
  v1/v2/v3 behavior and v2/v3 serialized bytes remain compatible.
- Messages contain static descriptions and safe metadata, without arbitrary
  exception text, request/response bodies, prompts, URLs, keys or signatures.
  Formatted exception chains are suppressed. Old unannotated attempts explicitly
  say their original cause was not recorded.
- Ordinary observer errors cannot mask a known primary failure. Ordinary receipt
  and completion callback failures before result persistence gain safe detailed
  diagnostics. Controlled accounting identity/start/ledger/receipt violations,
  marked durability failures and explicit cancellation remain authoritative.
  Completed cold replay does not invoke live completion callbacks.
- Genuine rejected HTTP responses keep their bounded retry/terminal behavior.
  Public Gemini content validation still fails before sending. No normal-success
  SQL write or LLM call is added; the annotation is written only on failure.
- Existing host normalization and actual V4 SSE preserve exact `{code, message}`
  errors. The activity-tree projector uses `error.message`. Runtime admission
  requires `provider_uncertainty_diagnostics_v1`; older manifests fail closed.

## Final artifact pair

- PuPu candidate: `/Users/red/Desktop/GITRepo/pupu-390`.
- Evidence: `/Users/red/Desktop/GITRepo/unchain-390/.release-qa/ticket-390/provider-uncertainty-r2`.
- Once-built wheel: `wheels/unchain-0.2.0-py3-none-any.whl`.
- Wheel SHA-256: `a97d89adc74d1f230725c3bbf4ba42a6a416de188dea69cb6a2d530e75d2e8b8`.
- Imported manifest: `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`.
- All 334 installed Python files match the production candidate byte for byte.
  Actual imported runtime admission passes, using google-genai 1.68.0.
- Earlier diagnostic wheels are superseded. Their results are not substituted
  for the final wheel's verification.

## Verification

- Source focused regression: 173 passed. The new suites contribute 29 diagnostic
  cases, 3 accounting boundary cases and 6 host cases.
- RED evidence includes the original missing diagnostics, callback masking,
  incorrect connection phase, post-result callback failures and three controlled
  accounting faults. Final tests retain no-result/no-resend/privacy assertions
  and real SQLite reopen; they do not merely check exception names.
- Final installed wheel, full Unchain: 4,029 passed, 16 skipped, 5 expected
  failures, 4 failures. The four are the previously reproduced OpenAI sampling
  contract failures for gpt-6-sol/luna at none/xhigh, also present on the previous
  wheel. They are not represented as passing.
- Final installed wheel, full PuPu sidecar: 2,661 passed, 17 skipped and 3,597
  subtests passed. Two existing warnings remain: Kimi SDK serialization and a
  test teardown thread without UNCHAIN_DATA_DIR configured.
- Raw GitNexus change results are saved without CLI display truncation. The whole
  dirty #390 branch is CRITICAL: Unchain 158 changed symbols/18 processes; PuPu
  9 symbols/950 processes. This includes earlier repairs and does not establish
  a small or clean change set. Pre-edit accounting/route methods are LOW and
  provider/service classes MEDIUM; UNKNOWN new/test symbols also received exact
  import/reference checks. The host search index previously warned about its
  FTS build; graph output is not used as sole runtime correctness evidence.

## Rollout and limits

AC-390-U01/U02: PASS on the final artifact. AC-390-U03: package admission, strict
host SSE, full regressions and existing-profile instance readiness are verified.
The owner subsequently requested an instance restart for manual acceptance.
The running candidate is now `/Users/red/Desktop/GITRepo/pupu-390`, with the same
final r2 installed runtime and manifest above. Electron PID 32005 and sidecar
PID 32025 use `/Users/red/Library/Application Support/pupu`; Electron has the
existing chats.db and settings.db open. The renderer origin remains
`http://localhost:2908/#`, and actual readiness reports Memory V2 ready, mode all.
Evidence is `live-instance-readiness.json` beside the final wheel. At 20:22 on
2026-10-02, the owner reported real-device acceptance satisfactory. This records
the owner's acceptance of model/tool behavior, without inventing a per-model
test matrix. The console findings below are a separate storage/logging concern.
No new profile, credential re-entry, commit, push or ticket closure.

The SDK/HTTPX fixtures establish detailed failure reporting and conservative
recovery. They do not prove that Google's intermittent live failure is repaired.
Actual error examples are saved in `error-examples.json` beside the final wheel.

## Console findings after owner acceptance

The recovery journal's UTF-16 size estimate is capped at 4 MiB. On the live
active chat, SQL returns 12 messages, matching the UI count, with an estimated
6,081,908 bytes of serialized message data. One assistant message accounts for
4,548,008 bytes: 4,111,586 bytes in 7,250 trace frames, plus 435,380 bytes of meta.
The message-write batch contains the chat's full message array, exceeding the
bounded journal. It falls back to guarded synchronous SQL; repeated stream/save
updates re-trigger the size warning. No residual recovery journal is present.
This snapshot establishes those messages are readable from SQL; it is not a
general guarantee about every chat or proof of measured UI blocking time.

The misleading `backend applyOps failed; retrying` prefix is also used for journal
failure even when SQL fallback succeeds. Two existing oversized-journal/fallback
regressions pass (`/tmp/ticket390-chat-journal-explanation-tests.txt`).

`[unchain:error] [chat-latency]` is ordinary timing telemetry: its producer prints
every record to stderr, and Electron maps stderr to console.error. The supplied
record is outcome=completed, elapsed_ms=94441. No production fix, profile cleanup,
process restart or ticket mutation was made during this read-only diagnosis.
