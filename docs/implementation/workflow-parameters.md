# Workflow function parameters — 2026-11-13

User direction: replace standalone Workflow's caller-object-driven authoring
with a function signature: declare parameters first; callers bind that pinned
signature. Work in the current PuPu dev checkout, preserve concurrent UI edits,
legacy definitions and already-launched snapshots. Offline; no real provider
calls, push, merge or automatic user-resource migration.

## Contract

**BC-WP-001 (VERSIONED)** Core produces an optional semantic Workflow root
`input_schema`; Host Store/v2, Workflow Call, Workflow-as-tool and Builder consume
it. Skeleton envelope stays v1; `skeleton_execution` minor 11 advertises
`workflow_parameters_v1`. Old definitions without this member retain their exact
current semantics. Agents cannot carry this member. An old runtime cannot silently
accept or discard the member. UI checks the actual imported manifest through the
existing managed capabilities bridge. No Git or environment capability bypass.

The closed signature is `{type:"object",properties:{<name>:parameter},required:[...],
additionalProperties:false}` (optional description). A parameter's closed keys
are `type?`, `description?`, `default?`. Types are the ordinary JSON types, with
an omitted type meaning any JSON value. Names are nonblank and unique. A parameter
is required or has an explicit, type-valid default; those modes are exclusive.
This avoids optional parameters whose Start export immediately fails to read a
missing value. Unknown schema keywords are refused, including external references.
Malformed signature values remain repairable drafts with diagnostics; execution
and publication refuse them.

**BC-WP-002 (CLOSED)** Caller JSON object -> Core argument admission -> detached,
default-expanded input object. Missing required values, extra arguments and type
mismatches fail before Start, handler effects or durable input publication. Explicit
null is a value, never a request for the default. Defaults are copied, not shared.
Both direct and durable runners use this admission. Workflow Call preflights the
fixed child signature before recording a child-dispatch intent. Workflow-as-tool
describes that same signature. End's output contract is unchanged.

**BC-WP-003 (CLOSED)** Builder edits the same root signature with existing mini UI
rows: name, type, required/default and default editor; stored descriptions are preserved. New
Workflows have an empty signature. Parameter edits update Start's field exports
atomically; ordinary parameter renames update internal references. Legacy aliases
and whole-object reads remain intact where not explicitly edited. Existing drafts
are not rewritten merely by opening a panel. Workflow Call reads names/types/
required/default from the pinned signature, rather than inferring them from reads.
Legacy versions keep the old inference. No new route or IPC channel is needed.

**BC-WP-004 (Hook scope correction, CLOSED consumer):** ordinary Workflow
parameters describe author-controlled function arguments. Embedded Hooks have
an engine-owned event object instead. Their dedicated factory omits the ordinary
empty function signature, and an editor-only `caller: "hook"` context marker
keeps their Start on the existing caller/output editor. This marker is not stored
or sent over IPC. Existing saved definitions and pinned revisions are not rewritten;
an explicitly stored signature is still enforced by Core. Core's strict argument
admission is unchanged for ordinary Workflows. Real factory documents are replayed
against the same installed wheel for before/after Hook payloads, Store roundtrips
and ordinary-Workflow extra-argument refusal (AC-WP-006).

**AC-WP-006:** reproduce R-WP-01/02/03 before fixing; verify Hook seed + UI
context, malformed-type open/no-write/replacement and JSON-only default values.
Keep ordinary function signatures and frozen-run behavior in regression. All
checks are headless and offline; no desktop preview is started.

## State sequences and evidence

**SEQ-WP-001:** create -> declare parameters -> save -> reopen -> publish -> pin
-> bind -> run twice. Exact request document equals stored and reopened document;
valid required/default arguments arrive as the declared JSON types. Unknown key,
missing argument, wrong type and invalid schema fail at their intended boundary.

**SEQ-WP-002:** launch A -> park -> save signature/default B -> cold process
reconstruct A -> resume -> launch new run B. A retains its immutable definition
digest and normalized arguments; B sees B. Repeat create/resume does not duplicate
effects. Existing no-schema launch and retained manifest keep working. Cancel a
waiting Workflow without executing the parked handler. Direct Workflow, Workflow
Call and Workflow-as-tool are applicable; chat provider turns are not changed.

**AC-WP-001:** red/green Core schema + invocation + direct/durable/call tests.
**AC-WP-002:** real Host Store producer save/reopen/publish and negative controls.
**AC-WP-003:** UI editing/renaming/caller controls, no-open-write, old shapes,
unknown capability and dirty/undo behavior, existing affected regressions.
**AC-WP-004:** build one Core wheel, seal its SHA/actual imported manifest and
reuse it for the Host/strict-consumer/cold-process checks. Development source
tests alone do not qualify the deployed pair.
**AC-WP-005:** current dev App displays editable Workflow Parameters; native UI
uses the same fixed pair. No real API. Packaged release/platform certification
is outside this UI iteration and must not be claimed.

## Impact

Core index rebuilt locally, one worker, index-only: 24,754 nodes / 60,244 edges;
global process-budget omissions are disclosed (not an all-clear). Core
validate_skeleton_document, _diagnose, _validate_all are HIGH. Host
document_problems/callee_interface HIGH; new_workflow_document CRITICAL.
Direct call sites include legacy conversion, draft diagnosis, direct/durable
execution, child resolution, Workflow Call panels/nodes/output inventory and
resource creation. JSX/closure UNKNOWNs require text corroboration. No unrelated
refactoring, baseline cleanup or changes to another agent's Core checkout.

## Execution status

Implemented on the current PuPu dev checkout and the existing unchain-dev
development source, preserving concurrent UI edits. No commit or push.

- Core direct/durable/call + manifest tests: 29 passed. Earlier affected execution,
  durable and call regression: 101 passed; its 3 stale manifest expectations were
  corrected and covered by the final manifest run.
- Installed-wheel Host Store, Workflow Tool and runtime capability regression:
  168 passed, 32 subtests passed. Authenticated real Flask/v2 save, reopen,
  publication, stale CAS and malformed signature refusal are covered.
- Frontend: 9 suites / 196 passed, including the actual Main strict validator,
  renderer consumer, real page editing, explicit save/reopen and pinned caller
  rows. Product ESLint: 0 errors or warnings. Existing unrelated React act and
  missing Rename-capability warnings remain in the older page test harness.
- One wheel was built offline after the production changes, SHA-256
  `b9cbc7845512d7f4765d7cb8322d5904fb2acc8b7db9c4e0b303d9a01601cb9f`.
  Actual manifest: `sha256:8bb1c7d474eed7bd82f906ac6cd88a6b7e073a23f46319cf500ebbd6b50ff17b`.
  Its installed modules are byte checked against the wheel and build snapshot.
  Independent network-denied processes verified parked A/default 1 -> saved
  B/default 7 -> cold A completion/default 1 -> new B/default 7, cancellation,
  repeat completion without duplicate effects and legacy arguments. The real
  page's parameter Save payload also passed real Store save/reopen/publish/run.
- AC-WP-005 native visual check is **NOT_PASSED**: the task-only desktop launcher
  failed (including its own null server-address callback); previews were stopped
  after the user's report. This is not counted as a product failure or App
  acceptance. No more automatic window launches. No Chromium sandbox change.
  Packaged/platform/provider acceptance is not claimed.

Evidence: `~/.codex/artifacts/workflow-parameters-20261113/`, including producer,
page payloads, installed artifact identity, process receipts and original failed
tool/test setup logs. No real provider calls. Backend Python changes require a
sidecar restart; the development Core source is `/Users/red/Desktop/GITRepo/unchain-dev`.

### Follow-up fixes (R-WP-01/02/03), headless only

All three confirmed review findings are fixed. The added regressions first
failed on the old implementation (8 failures / 9 positive controls), then
passed after the scoped fixes. Embedded Hook seeds retain their engine-owned
input contract, and the Hook Start editor does not turn it into an author-owned
function signature. Malformed types remain visible and replaceable without
opening writes; default lookup only accepts own string keys and cannot produce
inherited functions or prototypes. No Core/Host protocol change or new wheel.

Final frontend regression: 15 suites / 258 tests passed. The independent review
probes, copied with outputs redirected, passed 6/6. Actual Mini UI selectors
(without a selector mock) cover both type replacement and JSON-only defaults.
The real UI Hook factory documents were replayed through authenticated v2
save/reopen/preflight/publish and the same installed wheel's strict runner for
before/after event objects. The actual Core before-hook dispatcher completed
without a block; ordinary closed function signatures still refused extra keys.
296 imported Core modules matched the retained wheel byte for byte. Product
ESLint: zero errors/warnings. Desktop visual acceptance stays NOT_RUN in this
follow-up, per the explicit no-window instruction; there were no real APIs.

Repair evidence: `~/.codex/artifacts/workflow-parameters-fixes-20261113/`.
The four product files, three regression test files (one existing, two new), and
this plan are the only paths changed by the repair. Other pre-existing changes
are protected by before/after hashes. No commit or push.

### Using declared parameters

1. Create/open a standalone Workflow, select Start, and use Parameters to add
   names, JSON types, and Required or Default value. A rename also updates that
   Start export and ordinary references to it in the same graph.
2. Downstream nodes can bind values from `Start.<parameter>`. Save explicitly.
3. In a caller's Workflow Call node, choose the Workflow and publish its current
   draft and pin it (or pin a known published revision). Fill the declared rows
   using fixed values or upstream variables. Omitted defaulted parameters use
   their declared defaults; missing required, extra or wrongly typed arguments
   are rejected before the child starts.
4. Parameter edits need a newly published/pinned revision to affect new calls.
   Existing pins and already-started runs keep their snapshots. Legacy documents
   without a signature keep their contract until the author edits parameters.
   Embedded Hooks continue to receive their fixed system event automatically.

## PR delivery preparation — 2026-11-13

The user subsequently authorized commit, push and PR creation. Delivery is split
into a Core PR and a PuPu PR, both targeting dev; no merge is authorized here.
Only the Workflow parameter changes and R-WP-01/02/03 are extracted. Concurrent
UI/growth changes in the original checkout are not included. The integration
retains dev's already-merged presentation and canvas layout support.

Every one of the 379 Core Python modules in the isolated delivery source matches
the retained wheel above byte for byte; the wheel is reused, not rebuilt.
The current development App was later opened successfully, but that startup
check is not a full Workflow desktop execution or packaged acceptance. The
earlier failed launcher evidence remains historical and is not a product failure.
