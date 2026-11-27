# #356 runtime delivery and acceptance

Ticket: https://github.com/haoxiang-xu/PuPu/issues/356; direct Release #208.
Host clone: `/Users/red/Desktop/GITRepo/pupu-356-close`, branch
`codex/ticket-356-close`, remote dev `333643e82efc5a957ec358ca766b34c635ceaa68`.
Core clone: `/Users/red/Desktop/GITRepo/unchain-356-close`, same branch,
remote dev `e0d2eb5e09976def467da7f32f2b0482b48c2ffd`.
Evidence: `/Users/red/.codex/artifacts/pupu-356/close-01-20261102/`.

## Goal and authority

Finish, verify and deliver this ticket before another ticket. Preserve all M0–M8
capabilities and the original BC/AC/SEQ obligations. The historical CP1-only issue
instructions are not an implementation baseline for current dev. The original
execution plan and its failed/superseding checkpoints remain available; this
direct close plan maps actual delivered code to those obligations.

The project owner explicitly accepted on 2026-11-02 that **real provider/API
verification remains a Release #208 certification obligation**. This ticket may
close after its other requirements plus offline real-SDK/fixed-pair verification
pass. Live-service cells remain NOT_RUN, never fake-pass. Bind this exception to
the final candidate digest on both the child and Release before closure. No other
functional or test requirement is waived by this decision.

Frozen candidates, original PuPu/Unchain checkouts, old guards and all original
evidence remain read-only. Do not launch local App/Main or use real credentials
or APIs. Local heavy work is serial, one worker, at most4GiB per process family.
Use the cached pinned GitNexus CLI, never an installing wrapper. Source graph
discovery caps and UNKNOWN results remain unresolved/lower-bound until text and
behavioral evidence corroborate them.

## Current delivered baseline

The #351/#352 foundations and #357 authoring/runtime prerequisites are already in
dev. #357's merge tree equals its exact tested candidate. Core prerequisites are
merged through PR71. Do not replace dev with an old cumulative tree or import an
entire historical patch merely because it once passed a bounded review.

Held reusable acceptance pair:

- wheel `17b04aea25489e72eb4e6ab03a131f470bdcddf65f9e8a4eec757d9bfcbfe47c`;
- manifest `sha256:827adc5644e00dbb8e67fe5ecf6f7e88d9f542b1c4aff37744e0311c0acc2fe3`;
- Linux ELF `e0162fc116e3f2970c67bc6c5458d1a305e6404dbb11b6e22db25897cad77ff6`.

Use that one wheel throughout the new matrix while runtime bytes remain equal.
If a production repair changes the runtime, build one replacement wheel, retain
the old pair as prior evidence, and requalify affected consumers using the new
pair. Source SHA, clean trees and environment claims are provenance, never
runtime capability admission.

Available baseline evidence includes Core full CI5637 passed/17 skipped/5 xfailed,
Host3702 passed/18 skipped/3805 subtests, frontend9406 and Electron1231 passed;
the #357 installed-wheel140 cells/336 import-provenance checks,32 binary HTTP
requests/4 processes and packaged App41516065115 with534 independent raw checks.
That App proves Code/Workflow/owned+pinned Hooks/tool approval/root End and stored
done/pending-none. It does **not** prove every #356 sequence, provider matrix,
platform, Memory path or cold recovery. Earlier H1–H5/desktop/source/CAS results
remain evidence for their own artifact pairs, not automatic current-pair PASS.

## Verification map

### Demonstrated close-window gap: Workflow exposed as a Tool

The current public producer has Toolkit Pool references and fixed Workflow Call
nodes, but no Workflow-as-tool configuration. Literal searches in both current
production trees and the indexed contexts establish the missing entry; the
planned adapter is distinct from a deterministic Workflow Call node. This is
not waived by the real-service exception.

Use the existing Toolkit Pool panel and published-version picker. Add an
optional `workflow_tools` list to its native configuration; absence preserves
existing documents. Each entry is CLOSED `{id, workflow}` and `workflow` is
CLOSED `{workflow_id, revision_id}`. The local id generates the exact function
name `workflow_<id>`; it must be provider-safe, nonempty and unique across pools
attached to the same Kernel. No latest version, implicit selection, bulk
registration or new authoring canvas. The descriptor derives its input schema
from the fixed Workflow's Start reads and describes only that Workflow's End
exports as its return. Native Tool parameters wrap the Workflow input object in
one required `inputs` property; the description carries the actual Start-read
contract without inventing scalar types. Whole-object Start reads retain open
input fields. Use exact native Tools and the official durable runtime-plugin
route; the imported provider authority's rejection of Tool subclasses remains
unchanged.

**BC-356-CLOSE-004 (CLOSED/VERSIONED):** Toolkit Pool configuration → resource
preflight/immutable dependency closure → node-scoped Tool adapter → existing
durable Workflow runner. Before exposure, resolve exact id/revision/kind and
validate the non-LLM plan. Keep the selected published document and managed Code
closure across editing and cold restart. The adapter cannot expose a Workflow
to another Kernel or give a Workflow model capability. Tool names cannot shadow
selected ordinary tools. A read-only capability reply admits the new host
contract; an old/mismatched host disables authoring rather than downgrading.

**SEQ-356-CLOSE-004:** model call → ordinary permission/before-Hook/final-argument
approval boundary → fixed child graph → child End → ordinary after-Hook/result
delivery → parent Kernel → parent graph End. Reuse existing call-bound v2 child
wait/terminal receipts, with an explicit `workflow_tool` mode admitted only by
the fixed binding. No fabricated Agent/model node or second approval system.
Check child/parent attempts, call id, selected entry and revision on resume;
repeat/cold resume reuse committed child steps. Denial, expiry, cancellation and
unknown outcome keep their existing authority. New drafts do not alter a run.

**AC-356-CLOSE-004:** exact public saved configuration and strict consumers;
unknown/duplicate/invalid entry and wrong kind/version/call/scope refused;
selected-versus-unselected Kernel catalogs; normal and second calls; Tool/Code
child outputs and parent End; nested/second approval; deny/expire/cancel;
completed-effect reuse and cold restart with a later published revision. Record
source, installed wheel, binary HTTP and packaged App cells separately.

This bounded adapter can use the already-qualified Core runner/Tool interfaces;
first prove that with the held installed wheel before deciding whether any Core
production change or replacement wheel is necessary. In particular, do not edit
`prepare_agent_graph` merely to add host capability policy: its pre-edit impact
is CRITICAL (23 impacted symbols,4 direct,10 affected processes,3 modules).

Each row needs concrete producers, deployed consumers, positive/negative tests
and applicable state cells; test counts alone are not a coverage verdict.

| Package | Required result | Original contracts | Current close action |
| --- | --- | --- | --- |
| M0 | Closed schema/IO/conditions, provider-free import, faithful Recipe/template/Soul conversion | BC001/002/007/009; AC001/002/007/009 | Map validators/fixtures and migration tests; replay gaps through current installed consumer. |
| M1 | Exclusive DAG selection/rejoin, bindings, End-only result, headless Workflow | BC001/002/006; AC001/002/006/012 | Check real durable runner and zero SDK/client construction for Workflow. |
| M2 | Distinct invocation/attempt/edge/receipt identity; crash/resume/cancel without repeating completed effects | BC006/010/011/012; AC006/010/012/014 | Bind normal/graph/child/Hook and first/second interactions to current-pair receipts, including cold processes. |
| M3 | Native/shipped/custom transport and profile isolation, context budgets, structured output, opt-in compression and existing interjections | BC002/007/008/010/012; AC007/008/010/011/014 | Inventory actual protocol support; directed provider pairs, same-model alternate endpoints/credentials, three-way return chain and attachment/history isolation. Real services remain Release-only. |
| M4 | Existing tool permission/approval path; Tool/Skill snapshots and explicit unknown outcome | BC002/006/007/011; AC002/006/007/012 | Reuse delivered #352 lifecycle proof where exact; cover second approval, rejection/expiry/cancel/crash and new-run skill reread. |
| M5 | Resource CAS/migration/immutable Workflow closure, referenced/embedded Agent, delegate/handoff/worker and old-run snapshots | BC001/002/004/006/009/010/011/012; AC001/004/006/009/010/012/014 | Verify old source fidelity, shared edit versus retained run, child results/settlements and parent End. Investigate the original Workflow-as-tool/configuration-entry requirement separately from Workflow Call. |
| M6 | Real Python/venv/bundled profiles, isolated log/result protocol, limits/identity/cancel/process tree | BC002/003/006/012; AC002/003/006/012/014 | Reconcile actual packaged interpreter evidence and remaining platform/process tests; no developer-Python substitution for builtin proof. |
| M7 | Non-LLM before/after Hooks; final-parameter approval, nested waits, committed final-visible output | BC004/005/006/007/008/010/011/012; AC004/005/006/007/010/011/012/013/014 | Test forced/nested approvals, durable denial and after-phase recovery; downstream native wire/context/summary/ref expansion must not recover redacted raw data. |
| M8 | Real public entry/bridge/HTTP/wheel/event/UI, legacy compatibility, strict capability admission, current installed artifacts | All applicable BC/AC/SEQ | One immutable pair, real saved selection, representative mixed/child/Hook/cold sequences and supported-platform diagnostic/package smoke. Signing/rollout/Release certification remain separate. |

Retain the original definitions in
`skeleton-runtime-v020-execution-plan.md` and
`agent-workflow-v020-contract-plan.md`; this table does not redefine their wire
schemas or drop their negative cases. AC004 explicitly includes Workflow-as-tool;
its public producer/consumer reachability must be established, not inferred from
the presence of Workflow Call. Unsupported transports must fail explicitly,
never masquerade as a different supported protocol.

## Close-window boundary records

- **BC-356-CLOSE-001 (VERSIONED/CLOSED):** stored/imported definitions and runtime
  profiles → Host/Main admission → actual installed Kernel/provider adapters.
  Keep exact node/profile/model/endpoint/credential reference/transport/window/
  reservation and manifest identities. Unknown shape/version/capability/identity
  fails before secret read or external dispatch where applicable. SDK substitutes
  validate the actual producer payload and protocol, not a shared loose helper.
- **BC-356-CLOSE-002 (VERSIONED/CLOSED):** fixed resource/source/revision closure,
  Journal and interaction receipts → resumed runner → final-visible result,
  compiler and UI. Root/session/generation/node/attempt/call/interaction/cursor
  and content descriptors must agree. A known receipt is reused; uncertain
  external outcomes block redispatch; an unknown version is rejected. No
  current-draft/default/provider fallback during a retained run.
- **BC-356-CLOSE-003 (VERSIONED/CLOSED):** deployable wheel/manifest, Host binary,
  Python profile/worker and real App → their exact public consumers. Preserve
  raw input/output/result/Journal and immutable source bytes. Verify actual
  imported module bytes and platform interpreter identity before accepting data.
  No installer/signing/production rollout claim follows from a diagnostic pass.
- **SEQ-356-CLOSE-001:** first/second normal message; first/second approval;
  approve/deny/expire/cancel; retry, resume and cold restart. Assert immutable
  selection, exact owner, no repeated model/tool/Hook/Code effect, one parent End
  and visible terminal cleanup for each applicable path.
- **SEQ-356-CLOSE-002:** shared resource/source A fixed for a run → save B → old
  run resumes A → new run reads B. Include fixed Workflow revisions, migration
  and old-format compatibility, concurrent CAS refusal and child ownership.
- **SEQ-356-CLOSE-003:** provider A→B→C→A, same protocol/model at alternate
  endpoints and credential profiles; reverse order and independent chats. Assert
  local budgets/history, neutral bound values/artifacts and no foreign secret,
  provider-private replay handle or uncommitted/raw Hook output in any consumer.

Close-window ACs are the original AC001–014 plus their later accepted amendments;
the package table and machine-readable evidence ledger bind their test rows to
these three boundary/sequence records. NOT_RUN is not N/A. An actual failing
assertion is NO-GO until corrected. Real-service rows alone have the explicit
owner exception above; retain all other unresolved rows.

## Ordered work and supervision

1. Inventory current code, historical evidence and the actual deployed consumer.
   Complete a machine-readable obligation ledger and scope-preserving issue-body
   refinement. This stage makes no product edits and invents no audit PASS.
2. Resolve concrete gaps one at a time. Before a product edit, settle its exact
   API/state transition, run both sides' upstream impact, warn on HIGH/CRITICAL,
   retain red-before-green and explicit negative controls. Any new UI must reuse
   existing selected patterns; a genuinely new design choice needs the owner's
   existing design workflow. Do not change frozen implementation workspaces.
3. Execute only missing or affected current-pair cells, serially. Use existing
   source tests for already-covered negatives; they do not replace public/App
   evidence. Re-run after a relevant artifact changes. Keep source, binary,
   HTTP, App, platform and live-service conclusions separate.
4. Fresh graph/change analysis, required CI, exact-candidate five-check audit and
   the owner-approved real-service exception on child and Release. Normal
   expected-head PR merge to dev; verify delivered tree, then close only #356
   and set its verified Project item Done. Do not close #208 or another ticket.

**Delegation assessment:** cross-boundary gap decisions, durable outcomes and
final acceptance are not suitable for a weaker implementation worker. A bounded
read-only test/evidence inventory may become suitable after the matrix is settled;
the root retains all interpretation, implementation and review decisions. No
worker has been dispatched at this point. This close request already authorizes
scope-preserving fixes and delivery; it is not another CP-by-CP permission loop.

## Frozen runtime/UI delivery dependency (2026-11-02)

Current dev did not include the accepted 3532f350..6f7f7eef UI child/cancel
consumers, 6f8fc64d..db34dea0 Host cancellation producer, or Core
25918480..2bf67b21 child callback/projection. Integrate those increments,
preserving newer dev approval/Hook behavior; do not transplant cumulative trees.
The held 17b04aea wheel lacks events.subagent_settlement: it cannot qualify this
producer. BC-356-CLOSE-002 / SEQ-356-CLOSE-002 / AC-356-CLOSE-002 therefore require
a new canonical wheel and Host binary. Old evidence remains prior, bounded
evidence. First combined renderer check:9 suites/219 passed. Core projection and
Kernel source check:43 passed. Installed/public/binary cells are still pending.

## Explicit projection capability and pre-deployment qualification

BC-356-CLOSE-001/002: the new Core producer advertises
`subagent_tool_settlement_projection_v1` in Skeleton v1.5. The independent Host
manifest consumer requires both the minor and feature, before profile/dependency
work or execution effects. It does not admit by source path, Git SHA, module
presence or an environment bypass. Five negative cases reproduce the earlier
missing rejection; Core protocol expectations reproduce three failures before
the handshake change. Green:38 Core protocol/projection tests and63 Host gate
tests. Other Core protocol wire values remain exact.

Actual source manifest digest:
`sha256:31090314d4e60bf98781c2b59f87bd63deadeecaa932c49274cc4024f5b09392`.
One new wheel/binary pair must still be built/retained and verified; no old-pair
result is claimed for this changed manifest. The old v1.4 capture remains in
Git/history and the original evidence.

The Toolkit Pool entry uses the real host capability and existing exact-version
picker. Reading/opening writes nothing; each entry has its own local function id
and exact published Workflow reference. No latest/model/inline source fallback.
New UI tests are real pool controls with only the already-tested version-picker
seam substituted:3 suites/67 green, not a packaged App/Store claim. Real OpenAI
SDK serialization and typed SSE parsing pass with HTTPX MockTransport and OS
network denial; two distinct Workflow calls return each child's actual End
before the parent End. These are source controls, not installed-wheel evidence.


## M3 authentication gap — BC-356-CLOSE-004 / SEQ-356-CLOSE-004

The actual shipped-provider producer declares Anthropic Messages with x-api-key
for DeepSeek and Bearer for both Kimi endpoints. The original Kernel profile
could not retain authentication identity, and Main rejected Kimi before vault
access. This is a product gap, not the owner's live-service exception.

Add optional CLOSED profile field `auth_mode` with a protocol-specific enum:
OpenAI Responses=bearer, Anthropic=x-api-key|bearer, Gemini=api-key,
Ollama=none|bearer. Absence keeps the exact historical transport default;
invalid values never coerce or silently switch. The authentication choice joins
profile/selection/launch digests and requirements. Main independently compares
it with the private authoritative registration before reading any secret.
Credentials remain the existing closed provider/endpoint/api_key map; no key
enters definitions or snapshots. Official providers cannot change auth mode.

The runtime advertises `kernel_profile_auth_v1` at Skeleton minor6; Host checks
the actually imported independent strict manifest. Requirements carry the
optional auth_mode only when present in the selected profile. A shared ref
cannot bind incompatible endpoint/provider/protocol/auth identities. Authenticated
SDK construction disables the SDK's alternative credential source (API key
versus token), pins endpoint/retries and keeps official/default profiles intact.
No arbitrary headers, header credentials, unsupported transports or silent
fallback are added.

SEQ: save profile A -> issue exact credential scope -> wait -> registry/profile
changes -> original launch retains A and only fresh matching credentials can
bind it; a new selection uses B. AC: real shipped preset -> Main strict reader,
actual SDK HTTP serialization under a no-network transport, wrong registration
and unknown-field/value refusal before vault/factory, same reference conflict,
source/installed/binary fixed-pair replay. No live services are called. This
extends BC001/002/007/010/012 and AC007/008/011/014 without waiving other M3 rows.

## Retained launch minor compatibility (M2/M8, BC-356-CLOSE-002)

The authentication checkpoint raised current-runtime admission to Skeleton1.6;
the child-observation repair below raises it to1.7. Neither current minimum
applies to the authenticated manifest retained in an old launch. Red control
proved both a root-only and recursive-child launch from actual held wheel
17b04aea / manifest827adc are rejected solely by the new minimum (2 failed,
11 controls passed). The retained launch consumer now strictly normalizes the
original manifest, requires the original v1 baseline, and proves every retained
protocol is implemented by the actual admitted current runtime (same major,
no future minor, feature subset). New auth/projection fields still require
their originally advertised feature and introduction minor. At that checkpoint,
current runtime admission remained1.6; no Git/path bypass, new-run downgrade, descriptor rewrite
or digest replacement. New-module tests include protocol drift, digest, old
current-runtime refusal and recursive-auth/Workflow-tool controls. The historical
1.6 source result below remains bound to that checkpoint, not the new1.7 pair.

Source-only boundary regression165/165 passes including the original frozen
cold-child callback and after-Hook denial stream. The actual retained1.4
manifest is captured from the old installed artifact and retained byte-exact in
tests/fixtures; producer SHA and fixture SHA are in the close evidence. This
unit reconstructs a launch with that real manifest; installed/binary cold
resume remains a separate acceptance cell, not claimed by the unit count.

## 2026-11-04 necessary closure repairs (M2/M8)

These repairs finish existing child trace and cold approval obligations. They
do not add a new Builder feature or waive a verification cell. Frozen 01a60e0b,
wheel949 and prior evidence remain immutable; fixes use independent candidates.

**BC-356-CLOSE-005 (VERSIONED/CLOSED):** Core native Subagent plugin observation
gate -> Host-owned child observer -> existing normalized SSE links -> child
trace consumer. Skeleton minor7 advertises `subagent_native_observation_v1`.
The gate retains the original live batch, execution guard, human-input and board
capture checks without injecting child events into the parent ContextRuntime.
Direct public native-facade calls without the optional gate remain compatible.
Host attribution is private and typed, validated against the actual durable
child store/borrowed guard, stripped before normalization, and never persisted.
Keep root R, invoking node P, child C, child graph G and child node N distinct.
Existing nested lifecycle/settlement identity projected by Core remains intact.
Child End is observed only after typed graph completion, never from model text;
observation must not enter parent tool results, prompts, progress digest or root
final. Current producer admission requires the feature; retained historical
descriptors keep their original digest and validated supported feature subset.

**SEQ-356-CLOSE-005 / AC-356-CLOSE-005:** real parent -> child -> nested/sibling
events -> child End -> parent continuation; paused child -> cold reconstruction
-> explicit resume; cancelled/expired ancestor -> refuse observation. Preserve
legacy callbacks, guard/board behavior, per-node Journal ownership and root-final
uniqueness. Red evidence must exercise actual composed callbacks, not a forwarding
stub. After-Hook sentinel A/B proves the observer cannot restore redacted A to
the downstream request. Test old949 refusal, minor/feature mismatch, retained1.4
compatibility and exact one-built replacement wheel/Host/App pair. UI tests bind
direct child-node frames to their own worker and exclude siblings/nested owners.

**BC-356-CLOSE-006 (CLOSED):** stored original root approval request + authoritative
native pending response -> current-generation retained UI ownership. Admission
requires exact session/root/interaction/call/tool/arguments and a unique original
request frame. Synthetic recovery cards are not authority. Cancellation and
turn-mutation stores must be readable and show no competing fence; unknown is a
hold, never permission. The same-hook cancellation drain must preserve an
unavailable/invalid representation before any asynchronous cancel/removal can
rewrite it and hide a fence from the later pending lookup. A resumed message may have a newer meta attempt while
its original request frame still proves the root owner. No new persistence schema,
automatic continuation or backend permission bypass is introduced.

**SEQ-356-CLOSE-006 / AC-356-CLOSE-006:** actual approval wait -> App exit -> cold
mount -> passive lookup (no cancel, tool effect or resume) -> explicit approve or
deny -> exactly one receipt-bound resume. Stop, queued cancellation, stale
generation, foreign session/attempt, duplicate/synthetic/settled requests and
unreadable stores cannot grant ownership. A later successful read can retry.
Retain live approval/submitting, generic cold cancellation and sourceA snapshot
controls. Final packaged App must exercise a real waiting-state cold restart;
HTTP-only recovery and cold reading completed messages cannot substitute for it.

### Source dependency checkpoint and waiting regression

Core dependency is pinned to `b07c9d67c61c4a6437e9fd08325285530b7b8b6a`
(tree `e95097a78000717e78b8aa5677314670d1430d9c`, PR #73). Its CI
41931227851 passed 5688 tests, with 17 skips and 5 existing expected failures;
CodeQL 41931228095 passed. All five current release-qa defaults/fallbacks use
that exact source. The final required CI builds the one replacement wheel;
source checks do not qualify installed, binary or packaged App boundaries.

Host source checkpoint `5cf8674e` is not the final candidate. Its ordinary
nonwaiting observation controls passed, but the unchanged cold-approval control
exposed a waiting regression: the Core correctly yields the borrowed child guard
before its durable-wait notifications, whereas the new observer asked it to remain
active. The bounded correction defers only those notifications until the actual
durable waiting result and retained parent/ancestor authority have been verified.
Ordinary event and completion guard checks remain required. No waiting/cold or
final artifact acceptance is claimed before the corrected controls pass.

### Bounded source acceptance before the replacement artifact pair

The direct durable-wait regression is corrected. Notifications are delivered only
after the actual durable wait is established: two direct interaction notifications,
or the official one-response nested child marker with its persisted leaf linkage.
Ordinary borrowed-child, root, batch and ancestor authority checks remain intact.
The observer is reconstructed from durable ownership on cold resume, without
reviving a prior plugin closure or replaying provider, tool or Code effects.

Heavy source review accepted C1 (cold child node observations), C2 (committed child
End after interruption before parent settlement), and the current 12-case targeted
delta/tail run. The earlier complete-file attempt stopped at its 600-second overall
budget with 62 pass marks; it is partial evidence, never a current 67/67 result.
The final delivered-head required CI still runs the complete file. Real cancellation,
higher-fence release/reacquire and actual clock expiry are separate accepted
authority negatives; release/reacquire is not described as TTL expiry.

Canonical source root R stays immutable. The actual stream worker binds a private
transport attempt T before queueing; the V4 consumer checks T while preserving
R/P/C/N/G. This adds no public wire or persistence field. The frozen old API's
same-R control succeeds while its old T-as-R route rejects a correct cold event,
establishing behavioral RED independently of the new helper's introduction.

N1 verifies actual nested live/cold identity and request/response gate ordering with
the original gates. H1 observes committed child audit A while the actual parent
provider, result and ProgressDigest receive sanitized B and exclude A/raw-model
text. These tests are source acceptance only. The public cold-native producer and
real V4 route remain blocked locally by the macOS process-incarnation boundary;
the exact Linux source handoff is ten selectors/twelve cases, with real /proc
identity and no guard mock. It must pass before installed/binary/App qualification.

Prior Mac arm64/x64 run 41557020458 retains only its actual packaged Python3.12.15
Code-worker behavior predicate: relevant source and imported-module byte comparisons
establish that predicate is unaffected. It is not relabeled as a new Mac pair,
sidecar/profile contract, or whole-resource equality. The new wheel/manifest and
changed child/cold/serialization boundaries require the replacement pair's actual
Linux/Windows and App cells. Frozen evidence and prior failed rounds are preserved.

### Native child model observation repair — 2026-11-07 UTC

Workspace: `/Users/red/Desktop/GITRepo/pupu-356-child-observation-delivery`;
branch `codex/ticket-356-child-observation-delivery`; frozen base
`56dd76fdd68956a5652ccbd085b99d95db9f5a28` (tree
`735607061eb127cc549e0ef76cc94ca6e6b9eb6e`). This is a necessary #356
integration repair, not a new feature. The original candidate remains read-only.

The strong-model source-backed handoff is
`/Users/red/.codex/artifacts/pupu-356/today-356-20261104/heavy-review/child-observation-production-repair-handoff-v1.json`,
SHA256 `fd4cc06fc34494b1a7f428e812d3452b015e9bacbb0bc68c024ecb071bfc6b05`.
Its first-cause evidence is run42313351827 and report
`heavy-review/pair42313351827-child-observation-first-cause-plan.json`,
SHA256 `d12a91c7b7c0a1770928360f458385abff8dbda2e87cbad875eea266fe9960d4`.
All ten actual pointer/clip/title stages passed. Journal seq32/kernel CAS contain
native node N's raw model text; the separate committed child C End is correctly
visible. The production Host renames the native final to unsupported
`workflow_step_final`, and the frontend routes correctly linked N observations
to root frames because N deliberately has no `run_started`.

**Settled repair (BC-356-CLOSE-005 amendment):** no Core, protocol, manifest,
Journal, durable-state or new persistence-schema change. In
`skeleton_production_chat._stream_worker_event`, preserve a node `final_message`
only with exact `ChildNodeAttribution`, matching N and
`source_type == final_message`. Keep existing R/T binding and strip/project
validation. Untyped/generic/root-node finals, token deltas and suppressed node
lifecycle events retain their existing behavior. Installed Core already maps
the admitted event to `step.completed(model_response, final_text)` under N,
with the existing projected parent C link.

In `useChatStream`'s existing `onFrame` path, admit a normalized runtime N frame
linked to C only for the active assistant owner/current generation, exact
execution session, N distinct from C, and known lifecycle C metadata with a
nonblank `subagentId`. Current metadata or `savedChildMeta(C)` on that exact
assistant message provides the evidence; a status-only eager placeholder or a
bucket alone does not. Use existing child-frame adoption/append/sync and event
deduplication. Never create lifecycle N metadata. A known-C candidate with an
explicit wrong session must not fall through into root content handling. Keep
legacy root P-to-R and old child paths unchanged. Cold ownership must not
require the saved message's transport attempt to equal canonical R.

N raw model text is only an owned node observation. C's committed End, parent
tool result, root final, parent provider/history/summary/ProgressDigest and
after-Hook A/B isolation remain distinct. No renderer production change is
planned; existing TraceChain must consume the resulting owned frames.

**SEQ/AC-356-CLOSE-005 amendment:** genuine production callback -> installed
Core normalization -> private-carrier projection; no N lifecycle event;
response then model final then distinct C End; current and cold R!=T owner;
saved-frame preservation and duplicate replay; stale generation/Stop/foreign
session refusal; sibling/nested direct-parent isolation; root P-to-R and legacy
paths; committed-End and after-Hook privacy controls. A wrong identity fails
the existing boundary, without a fallback that invents output.

**Delegation assessment: PARTIALLY SUITABLE.** `gpt-6-astra` resolved the typed
seam, ownership, failure semantics and artifact strategy. `gpt-6.1-sol` may
implement only the bounded next slice below; root/strong review owns checkpoint
release and acceptance. No new UI primitive or design decision is involved.

1. Tests-only RED checkpoint. Production bytes stay identical to56. Allowed
   tests: `test_skeleton_production_chat.py`, `test_chat_stream_v4.py`,
   `test_skeleton_agent_runtime.py`,
   `use_chat_stream.memory_v2_payload.test.js`, and `trace_chain.test.js`.
   Reuse the handoff's exact existing harnesses and actual capture identities.
   Require meaningful content/routing RED after completion/identity prerequisites,
   never a setup failure or a forwarding stub. Prove separate N model text,
   C End and root final. Run explicit selectors only, one local worker <=4GiB;
   no local App/browser. A real macOS process-identity block is BLOCKED and
   goes to the existing hosted Linux lane unchanged, never mocked around.
2. Strong RED review, then release only the two production seams above with
   fresh exact impacts and retained HIGH/CRITICAL/UNKNOWN warnings. No worker
   continuation into implementation without that checkpoint.
3. Targeted GREEN/negative/cold/nested/H1 controls; full raw graph change
   analysis before delivery commit, exact diff/patch/source identity review.
4. Normal new required Host CI builds **one new canonical wheel** from unchanged
   Core369. Independently compare all378 Python members/payloads and manifest
   to frozen95. A changed ZIP digest is a new identity, never relabel95 or add
   a reuse bypass. Fresh affected installed/binary/App cells bind that new SHA.
   Existing narrow unchanged worker predicates retain only their proved scope.
   Full CI and exact App lifecycle/raw verification remain mandatory, with at
   most two hosted jobs and no overlapping local heavy work.

Before edits, exact projector impact is LOW (one direct caller, zero indexed
flows, one module). The hook callback is UNKNOWN due dynamic callback wiring;
literal wiring corroborates its entry, not absence of risk. The independent
clone's graph receipts are in `light-execution/child-observation-delivery/`.
Do not edit Core, observer gates, guards, routes, schemas, budgets, dependencies,
generic UI components or QA success criteria. Report a new contradiction before
dependent edits. No close/merge claim until new delivered-head evidence passes.

Development checkpoint: three causal REDs were confirmed with production still
at56, then the two bounded repairs passed14 distinct frontend/owned-trace/cold/
stale controls (the strengthened stale-native case was repeated once) and4
backend/normalization/H1/identity controls. The actual public
cold producer and the synthetic V4 SSE route remain locally BLOCKED by the real
macOS process-incarnation check; no guard mock or skip was added. Full Linux CI
and fresh installed/binary/App cells must execute them. H1's exact raw text is
the structured JSON returned by its SDK fixture, not the bare marker; correcting
that test expectation did not relax content equality or downstream isolation.
The full i18n scan is unchanged (876 English keys, ten locales, no new findings;
the same50 dynamic references and88 dead-key candidates remain disclosed).
