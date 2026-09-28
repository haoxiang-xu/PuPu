# Ticket 349 — defer independent memory preparation

This slice moves background-only preparation out of foreground admission. It does
not claim that the historical six seconds of pre-model latency are removable.
Required context, skills/tool schemas, admission, input/tool durability and build
receipts stay on the dependent path. UI journal details are already lazy on
expansion; no duplicate UI mechanism is added.

## Audit remediation (supersedes registration-failure behavior below)

### Follow-up: claim-time selection (2026-09-26)

BC-349-10 / AC-349-21: the official host claims a durable job before invoking
PuPu's model seam. At that seam, take one current registry selection/options
snapshot under the same registry lock used by registration and deferral. Read
the current SQLite row; a dispatcher page row is discovery data, not execution
authority. A pending retry or missing/unreadable selection yields an official
retryable failure before constructing any provider invoker. Keep the existing
CLOSED config and transient-credentials boundary. Release the lock before
provider construction and network I/O; the selected snapshot is immutable for
this invocation. Later registrations govern later selections, not an already
selected invocation. No new job schema or fixed-wheel change. Legacy retains
its existing per-job provider binding checks.

SEQ-349-07: worker reads old page row → no pending registration observed → new
root selects another model, registration fails and job is enqueued → official
claim → selection observes pending retry → zero model calls, job remains pending
with a retry time → cold registration recovery → same job executes once with the
new model. Also test a successful registration between discovery and claim, a
change after host construction but before claim, and registration while the
selected model is blocked. Verify paired options, cold recovery and unchanged
foreground progress. Existing source/deletion/lease guards remain authoritative.

Follow-up status: IMPLEMENTATION-READY. The frozen candidate passed 107 tests;
the same six new tests against the previous candidate produced five failures
and one pass. Original audit reproduction now retries without a model call;
threaded recovery completes the same job once. An isolated real desktop run
completed and applied a candidate and read back its exact content. See the
[repair evidence](ticket-349-evidence/step3-selection-report.zh-CN.md).
This is development verification, not a new acceptance verdict or daily rollout.

BC-349-07: PuPu completion → background host registry crosses SQLite and local
recovery storage. A failed registry write must not prevent official durable job
enqueue or turn a completed foreground bundle into failed. Persist a retry file
atomically (fsync + replace) with exact keys `schema`, `owner_chat_id`, `backend`,
`config`; schema is `pupu.memory-background-registration.v1`, config is the
existing CLOSED non-secret v1 selection. Its filename binds owner/backend by
SHA-256. Never persist credentials, transport options, callbacks or content.
Retry files fence older registry selections until recovered, remain across cold
restart, and are removed after successful registration or deletion. The existing
single dispatcher retries them before claiming jobs. Missing credentials after
restart follow the existing Pending policy, never another provider fallback.
If both SQLite registration and retry-file storage are unavailable, durable
preparation cannot be guaranteed; this double-storage failure is not masked.
Identity remains the database/owner/backend, with existing job trigger/lease and
generation/deletion fences. No wheel or runtime-manifest change.

SEQ-349-06 / AC-349-18: terminal capture → injected SQLite registration failure
→ durable retry selection + exactly one pending official job → foreground
completed → process/sidecar restart → selection restored → job applied once.
Repeat completion is idempotent. Test both ordinary official run hooks and actual
graph streaming. Test old-selection fencing, malformed/unknown schema/identity,
missing credentials, deletion, and failed retry followed by automatic success.

BC-349-08 / AC-349-19: official wheel consolidation toolkit → PuPu model invoker
→ strict raw agent factory. CLOSED producer shapes are the four candidate tools
or those four plus the exact five official shared read tools. Project to exactly
the four candidate tools, preserving wrapped callables and metadata. Missing or
unknown tools fail closed before agent construction. The real nine-tool producer
must reach the unchanged four-tool strict consumer and complete a durable job.

BC-349-09 / AC-349-20: official candidate mutation result → PuPu URI presentation
→ reference decode. Add `memory_candidate_content` as
`pupu://memory/candidate-content/<space>/<candidate>@<revision>`, losslessly
preserving kind/id/revision/space. CLOSED grammar rejects missing/invalid space,
revision, extra path/escaping; codec decoding does not grant read authority.
Existing scope-bound capabilities remain responsible for authorization. Test
actual memory_propose output, repeat mutation, scoped reads and canonical round
trip, plus unknown/invalid shape and cross-owner read refusal. Candidate content
is read through memory_candidate_read, not exposed as a new public read route.

All evidence reuses the fixed wheel below. Freeze a new PuPu candidate and record
its digest with the actual imported runtime manifest before desktop verification.
Remediation status: IMPLEMENTATION-READY. The four red reproductions fail on the
previous frozen candidate and pass on the repaired pair. 224 tests ultimately
pass (one repository-relative contract fixture required execution from its
original test path with frozen product imports). Real GPT-4.1 proposal → GPT-5
background processing → one completed job/applied candidate → desktop content
read succeeded; full desktop/sidecar restart preserved the same job and bytes.
See [repair evidence](ticket-349-evidence/step3-fix-report.zh-CN.md). This does not
supersede the prior formal audit verdict; a new formal audit is a separate step.

## Implementation

1. Bind a lazy Memory Agent invoker during host construction. Construct its
   concrete invoker only when its `run` method is used. The background dispatcher
   continues constructing its own cold host; no foreground closure is queued.
2. Move background host registration from host construction to immediately before
   eligible root completion enqueue. Normal and graph paths use the same
   idempotent host method. Failed/cancelled/incomplete runs do not register.
3. Preserve durable registration-before-enqueue ordering. No async fire-and-forget
   write, new thread per request, changed schema or changed provider input.
4. Test admission without background preparation, completion ordering, lazy
   construction, failure/retry, repeated turns, graph recovery and worker restart.
5. Measure actual foreground preparation against frozen r7 with the same wheel.
   Artificial blocking tests establish ordering only, not claimed speedups.

## Impact

Bound repository: `/Users/red/Desktop/GITRepo/pupu-349`, ticket branch based on
`2b8cb2e197d4c873bf9e78c8688e4c21e9457947`. GitNexus host-factory class impact:
CRITICAL, 22 affected symbols, 3 direct importers, 76 reported processes. Graph
completion helper: CRITICAL, direct caller `complete_pupu_unchain_graph_root`.
Root-completion factory/resolver classes: LOW. Qualified constructor/helper lookup
is UNKNOWN in this index; source corroboration identifies the active bridge and
run binding as constructor paths, and the runtime factory as resolver builder
caller. Broad graph counts include low-confidence cross-language matches; they
are not a claim that every listed UI flow changes. User warned before edits.

## BC-349-06 — deferred host preparation, unchanged durable contract

Producer: PuPu foreground host/root completion adapter. Consumer: official
Unchain MemoryV2Module or graph enqueue, then existing background registry and
worker. Boundary: terminal run hook and SQLite host metadata/job persistence.
Admission remains CLOSED: exact official completion and capture status, existing
owner/binding checks, closed `pupu.memory-background-host.v1` config. No new wire
fields, renderer input or persisted credential. Callback is host-only and never
serialized. Unknown config still fails validation; registration failure prevents
enqueue and is retryable by repeating preparation. Factory failure is delayed to
worker invocation, not hidden or replaced with another model. Completed RunBundle
and dispatched context stay unchanged.

Artifact: reuse wheel SHA256
`03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`, actual runtime
manifest digest `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`.
Candidate source identity and results are recorded in the evidence report.

## SEQ-349-05 / AC-349-16

Identity: owner chat, execution/attempt/root run, bound codec, database and model
selection. First admission performs no invoker construction/registry write;
eligible completion registers before enqueue; repeat completion is idempotent;
second attempt registers its own selection; cancelled/failed/incomplete completion
does not register; registry failure can retry without creating a job; persisted
job can be processed after dispatcher restart. Root-only completion authority is
unchanged; child attachment has no registration callback effect. Existing exact
identity, tool cycles, interaction/resume and deletion tests must remain green.

AC-349-17: lazy invoker constructs once under concurrent invocation, passes the
same request/toolkit/binding, rejects invalid factory results, and does not turn
construction failure into foreground admission failure. No provider call is made
by this preparation test.

Status: IMPLEMENTATION-READY for this bounded slice. AC-349-16/17 verified with
223 tests and 6 subtests against the frozen candidate and fixed wheel; diagnostic
desktop startup/restart and two real model turns passed. Measured removed setup
is only 1.26 ms on first admission and 0.07 ms on the next; full admission did not
improve. Broader pre-model latency remains unresolved. Package rollout remains
INCOMPLETE; no changes to the user's daily desktop. See
[evidence](ticket-349-evidence/step3-defer-report.zh-CN.md).
