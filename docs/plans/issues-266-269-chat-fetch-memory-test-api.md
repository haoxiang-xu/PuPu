# Issues #266–269 implementation and evidence

Scope: fresh-chat recovery admission (#266), bounded failed web fetches (#267),
scoped untrusted Memory V2 projections (#268), and the text-only test API (#269).
No local model calls or model lifecycle operations. The project owner authorized
committing and pushing both `dev` branches and closing #266–269 after verification.
This is bug implementation evidence, not packaged release qualification.

## Boundary contracts

- **BC-266 — recovery lookup → renderer run admission.** Producer: sidecar's
  existing versioned pending-interaction response; consumer: `useChatStream`.
  Preserve the CLOSED normalized response and session/attempt identities. An
  empty new chat's speculative lookup must not manufacture an interrupted run.
  Existing durable evidence remains blocking. A new run advances its generation;
  a late lookup cannot modify that run. Unknown/malformed authoritative state
  retains existing validation and recovery behavior. AC-266.
- **BC-267 — HTTP response → web tool result → runtime continuation.** Producer:
  `WebFetchService`; consumers: Core toolkit and runtime tool execution. Preserve
  URL validation, redirect admission and bounded text projection. Tool results
  are OPEN diagnostic objects: additive status/retry diagnostics are allowed;
  provider tool-call and durable-result envelopes remain VERSIONED and unchanged.
  Read at most 16 KiB plus a truncation sentinel for error pages; return at most
  4096 characters, HTTP status and bounded retry diagnostics. Retry identity is
  the normalized final URL (fragment removed), with native call IDs deduplicated.
  Stop after 3 failures for one URL or 6 unsuccessful fetches across URLs, checked
  after the current tool batch settles. Already emitted calls in that batch retain
  their normal confirmation, execution and durable receipt path. No later model
  turn or observation call is made. A successful page or a new live user turn
  resets the streak. Counters are derived from the existing transcript, including
  cold checkpoint/approval replay; no new persisted field or version is added.
  AC-267.
- **BC-268 — journal/recall → model context → provider wire.** Producers:
  compiler, checkpoint projector and recall request decorator. Consumers:
  provider adapters. Message envelopes retain their existing CLOSED schemas;
  untrusted content is one JSON object in a distinct assistant message. The
  policy explicitly ends its scope at that message boundary, followed by the
  unchanged live user message. JSON remains the last line for strict compaction.
  Embedded directives remain data; system/developer authority is never granted.
  Existing persisted prepared requests retain their original identities and
  versions; only freshly compiled projections change. AC-268.
- **BC-269 — HTTP message body → command registry → renderer bridge.** Producer:
  test API caller; strict consumer: registry validator. The existing OPEN body
  extension policy remains, except the explicitly unsupported `attachments`
  field is rejected whenever present. Canonical text body and path chat/attempt
  identity are unchanged. Both endpoints return HTTP 400 `invalid_payload`
  naming `attachments` before invoking the bridge. No schema/version change.
  AC-269.

## State sequences and acceptance

- **SEQ-266 / AC-266:** create empty chat → delayed lookup → immediate first
  message accepted → late lookup cannot alter active generation. Existing
  history/pending interaction → checking → recovery resolution → send enabled.
  Repeat with a second turn, failed lookup, Stop and persisted recovery tests.
- **SEQ-267 / AC-267:** HTTP non-2xx → bounded body/status available → repeated
  same URL failure bounded → clear terminal explanation. Test changing URLs,
  success after retry, separate runs and durable resume. Cold approval replay
  executes the approved third fetch once, clears the active interaction and
  completes without another model request. The kernel honors completion before
  a resumed loop can request more budget or invoke a provider.
- **SEQ-268 / AC-268:** first/second live user turn, history, pinned pending
  input, checkpoint and recalled references → separate scoped messages → strict
  provider wire validation. Preserve compaction, cursor remapping, tool exchange,
  resume/replay and cold-load tests. Role and scope regression tests must
  fail against the original implementation.
- **AC-269:** real registered message/runs routes reject null, array, object and
  string attachment values with exact error shape and no bridge call; normal
  text and path-identity tests remain green. Repeat and restart are stateless.

## Artifact and validation record

Implementation complete in both `dev` checkouts (PuPu base `b6480d48`, Unchain
base `7569395`). Authorized delivery is to commit and push both branches, then
close #266–269 with commit references and verification evidence. This does not
initiate an active release rollout. Python runtime changes require a sidecar
restart to load.

Companion runtime commit: `haoxiang-xu/unchain@4235462736bc641b8f898fc21d061fd69703df7d`.

Retained local evidence: `.release-qa/issues-266-269/` and its `final/` directory.

- One successful wheel build: `unchain-0.2.0-py3-none-any.whl`.
- Wheel SHA-256: `81f26b4083aa76202bd2723a14c7d5cb0dcbef25a08ca07b1c95123f7fbd2eae`.
- Actual imported manifest, strictly validated by `RuntimeProtocolManifest`:
  `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
- `final/artifact.json` records the wheel and all eight changed/new Python runtime
  file hashes. Every file matches the wheel byte-for-byte. Final test processes
  preimport that wheel and report `FIXED_RUNTIME_IMPORT_AUDIT_OK`; child workers
  receive the same runtime directory through `PYTHONPATH`.
- Frontend: **179 passed** across 19 suites (streaming, recovery, Stop, mutation,
  test bridge). Electron: **346 passed** across 78 suites; `.js`/`.cjs` twins match.
- PuPu with the fixed wheel: **1173 passed, 5 skipped, 3451 subtests passed**.
  Includes Context V2, first/subsequent turns, interactions, cold/retry recovery,
  graph paths, host admission and protocol negative tests.
- Unchain with the same wheel: **2168 distinct tests passed, 1 skipped,
  1 expected failure**. The broad run passed 2164 tests; four multiprocessing
  tests failed because the temporary runner lacked a `__main__` guard and
  recursively invoked pytest in spawned children. After fixing the runner and
  child import path, all 24 durable-job tests passed, including those four.
  No production source or wheel rebuild was needed. Both logs are retained.
- Targeted real HTTP-client → fetch service → Core toolkit → kernel tests prove
  all-403 termination with 3 approvals for one URL and 6 for distinct URL pairs.
  Real message builders cover OpenAI, Anthropic, Gemini and Ollama serialization;
  kernel execution tests cover OpenAI, Anthropic and Ollama. Gemini is not an
  admitted KernelLoop provider, so only its message reader is tested.
- Real compiler → persisted prepared turn → exact provider wire tests cover
  OpenAI, Anthropic, Hyperspace and Ollama, including unknown-field rejection,
  unchanged live requests, prompt-injection text in references and envelope
  identity/canonical round trips. These are structural guarantees, not claims
  that every live model follows every prompt correctly.
- Red evidence: `266-red.log` (2 failed, existing-history control passed),
  `267-red.log` (8 failed HTTP body regressions), `268-red.log` (3 scope failures),
  `269-red.log` (10 invalid attachment requests reached execution). The cold
  approval test additionally exposed and verified the resumed completion fix.
- Local inference and model lifecycle operations: **not performed**, per user.
  Live cloud model and packaged installer qualification: **NOT_RUN**; this task
  does not initiate a release. Normal/graph/subagent regression paths are covered
  by the selected suites recorded in `final/*-test-paths.json`.

GitNexus: `registerBuiltinCommands` upstream risk CRITICAL (14 affected symbols;
direct test service startup caller) and `KernelLoop._run_state` HIGH (7 symbols;
ordinary run, interaction resume and human-input resume); warned before edits.
The stream hook was initially excluded by the default file size cap; a forced
1024 KiB reindex resolved it, with LOW risk for the hook and recovery callback.
Untrusted projection producers, error-body fetch path and batch completion were
LOW. Dynamically collected test functions were UNKNOWN; source inspection
confirmed pytest-only callers. The graph's global process enumeration has
ranking/depth caps, so missing flows are not treated as absent. Full raw
`detect_changes` outputs are retained; no partial/truncated response is accepted.
