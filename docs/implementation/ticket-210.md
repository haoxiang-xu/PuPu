# #210 — execution state on the Builder canvas

Ticket: https://github.com/haoxiang-xu/PuPu/issues/210 (direct child of Release #208).
Delivery workspace: `/Users/red/Desktop/GITRepo/pupu-210-close`, branch `codex/ticket-210-close`.
Frozen development workspace: `/Users/red/Desktop/GITRepo/pupu-210`, tree
`050a4cd183fe58388919d5a574a33fb6695892f2`; its source and evidence remain untouched.
Initial base: dev `3a695c1b7b4badadc277e70994e4d43115077ae4`, tree `b3f75bef8687ba714a8ec402a453f6d091d11546`.
Development checkpoint base: delivered dev `ea83c22f1e3bc8ec2b57eb26dcd4824690583921`,
tree `e4f31134e7ce800ceaea957e1e993ac46f46bbe2` (#470).
Delivery base: dev `7475b39f27f6260a9478c36e09f0b932895d64a6`, tree
`b19c6c77087727b1dbe80ca617c6a1419714dbcc` (includes #472).
Phase: owner-authorized delivery/merge/closure after acceptance, 2026-11-07.
The sections below preserve development evidence and its original boundaries;
unrun delivery checks must not be inferred from that evidence.

## User result and boundaries

An author can inspect the recorded execution of the Agent in the current chat on
the Builder canvas. Each status belongs to one exact frozen graph invocation,
not to the current editable resource. Opening and closing observation preserves
the editor's document, managed source text, dirty flag and undo history. Neither
polling nor opening the canvas resumes, expires, cancels or executes anything.

No Core code, runtime event, durable schema, provider, execution algorithm,
guard, side effect, default toolkit or existing persistence contract changes.
Claude owns the separate legacy-Agent migration investigation; the earlier
#341 width repair and #470 wrap-up remain separate. This workspace does not
repeat their acceptance or edit their candidate/evidence directories.
Frozen candidates and evidence remain read-only. No local Electron Main, real
API, credentials or provider network. Local heavy jobs are serial.

## Research and decisions (2026-11-07)

Research artifacts: `~/.codex/artifacts/ticket-210-start-20261107/`, including
`producer-map/README.md` and `producer-map/observation-design-review.md`.
The private GitNexus index was refreshed at the current workspace base (55,003
nodes, 188,760 relationships). Process-discovery/enrichment limits are retained
in the raw logs; these counts are not a claim of complete dynamic-call coverage.
Existing Core research is source-verified against the
fixed wheel's source tree. Unknown/dynamic JSX relationships are not all-clear.

The old draft's raw `workflow_step_delta/final` do not survive the present V4
normalizer. Transport `done`, model-step completion, a root reply, and graph
node completion are different facts. The existing authority is the immutable
launch plus Core's validated `skeleton.workflow_execution.saved` v2 chain.

1. Add a minimal authenticated Host GET `/skeleton_runs/observation`. The exact
   owner, execution/session and resource are mandatory; canonical root is
   optional only for initial discovery. After discovery the UI pins it. Use
   `load_active_launch` / `load_launch(expected_owner_chat_id=...,
   allow_terminal_stale=True)`; never the mutating pending/recovery getter.
2. Observe all recorded descendants of that root from one captured journal
   prefix. **Explicit private-Core dependency:** one isolated Host adapter may
   call existing `WorkflowExecutionStore._decode_event` and `_snapshot`, as
   Core's existing rebase classifier does. They provide decoding, closed-state,
   digest, transition and artifact validation; no Host base64 decoder or new
   Journal interpretation is allowed. Missing/incompatible methods fail the
   view closed. This is not advertised as a public Core API.
   The existing pure Host `_hook_chain` validates the exact frozen Hook attach,
   version/digest and original tool call. Its parent Store receives a narrow
   `BoundExecutionJournal` prefix capability: the same snapshot and verified
   artifact reads only; writes and live paging are rejected. It never calls a
   pending/recovery getter, runner or provider.
3. Associate definitions only with the admitted frozen selection, its recursive
   subagent manifests, fixed Workflow versions and admitted embedded Hook bodies.
   Re-prepare and match definition ID/digest; never consult a mutable draft or
   choose a graph by node ID/name. Join every child's temporal call-stack lineage
   to an actual preceding active parent invocation in the same generation.
   Ambiguous/malformed ancestry makes observation unavailable, not a partial
   success disguised as complete. One prefix supplies every graph revision.
4. Owner liveness is always `unknown` in this feature. Do not read/reclaim/init
   the session guard, use PID-only liveness, animate a speculative live owner or
   manufacture `outcome_unknown` from elapsed time. Display "Recorded state;
   live activity unconfirmed". Polling can refresh persisted progress.
5. In the existing Run menu add "View current chat run". Read the active chat
   through the existing chat-storage service. Use the latest assistant message's
   recorded `meta.executionSessionId`; a normal chat without one uses its chat
   ID, matching the actual send path. Never substitute `threadId`. A character
   chat without recorded execution identity is unavailable, not guessed.
   Open a read-only
   run snapshot above the editor, following the fixed-revision viewer pattern.
   Existing Run launch remains outside this ticket. A graph selector identifies
   recorded invocation/call ancestry, including repeated definitions. Escape/
   Back closes observation before the Builder and preserves the sitting.
6. Reuse the **already chosen** 2026-09-26 design: ring + builtin icon, not color
   alone (contract plan §8.11 item7 and §8.12). Reuse the existing Run popover,
   Button, Select, Icon and theme tokens; no new primitive or visual alternatives.
   Configuration/attach Pool nodes have no execution badge. Unseen nodes remain
   pending; only explicit branch receipts make edges skipped. Shared downstream
   nodes are never guessed skipped. Cancelled/skipped presentation is faded.

## Projection contract

BC-210-001: **installed Core → Host**, VERSIONED durable input, CLOSED Host view.
The actual imported runtime manifest is independently validated. Preserve both
current and retained-launch manifest digests; no Git/SHA bypass for capability.
One verified Journal snapshot, frozen definitions and Core readers produce the
view. Unknown/inconsistent state, missing plans or unsupported adapter fail
closed, without mutation, recovery, provider construction or a manual decoder.

BC-210-002: **authenticated HTTP → Main → preload → renderer**, CLOSED v1.
Read request fields are exactly `owner_chat_id`, `execution_id`, `resource_id`,
and optional `root_run_id`; repeated/unknown query fields and wrong types fail.
Response envelope is `{schema: "pupu.skeleton-run-observation.v1", run}`.
`run: null` means this chat has no matching selected-resource launch. Otherwise
the run contains exact owner/execution/generation/root/resource, frozen root
digest, current/launch manifest digests, snapshot high water mark and graphs.
Each graph contains its exact graph/attempt, call stack, frozen diagram, digest,
revision/event/store cursor, recorded phase, pause/root-commit flags, owner
liveness, node projections, explicit skipped edges and safe error code/path.
No inputs, prompt history, raw SDK/tool results, arguments, credentials, owner
tokens or raw encoded Journal payload are returned. Validators reject unknown
fields, wrong schema/identity, duplicate graphs/nodes and malformed diagrams.
Main and renderer independently consume the real producer capture.
The Host observation is bounded to 64 recorded graphs and eight MiB of ASCII
JSON; larger runs return a typed unavailable result, never a silently partial
canvas. Main and renderer enforce a conservative ASCII/structural/number budget
independently. It is not Python-byte parity: numeric-dense or near-limit valid
Host responses can be refused by the JS budget. Raw HTTP bytes are also bounded
before parsing. This is an explicit unavailable view, never truncation.

BC-210-003: **view state → canvas**, CLOSED identity-scoped presentation.
Data never enters the editable document or layout saving payload. Older revisions
cannot replace newer ones within a graph; equal revision/different graph event
or cursor is a conflict. A higher prefix watermark may legitimately expose a
Context resolution before the graph revision advances; equal watermark/different
view is a conflict. A late answer cannot move across owner, execution, generation, root,
resource, graph or a later navigation. Errors retain a clearly labelled last
observation, never pretend current success or turn a network loss into failure.
Code previews must not use the editor's potentially newer managed source text.

State mapping:
- completed node receipt → succeeded, retained even if a later node/root fails;
- active running → recorded running; result_received → recorded result sealed,
  still uncommitted, never succeeded;
- exact tool-approval request without receipt → waiting_approval; a recorded
  receipt → waiting/ready to resume, not approval pending or node completion;
- child/other wait → waiting with explicit reason, not a whole-run pause;
- a typed Hook-child wrapper is waiting-for-child at its caller, not another
  approval obligation; an exact accepted wrapper makes its proven leaf waiting
  for upstream receipt delivery, not a request for a second user answer;
- paused flag → suspended, distinct from owing an approval;
- exact active failed/cancelled/outcome_unknown → that recorded outcome;
- pre-dispatch/End failure may be attributed only through its validated frozen
  node error path; otherwise keep it at graph level;
- skipped is an edge fact only; do not fabricate node completion/cancellation;
- End completion and `root_committed` remain separate. Earlier outputs remain
  valid; no final model text is substituted for a rejected End/root projection.
The design's eight-style vocabulary therefore includes an explicit generic
waiting reason and existing durable outcome_unknown, rather than lying about
the actual runtime enum. This is display projection, not a new Core enum.

## Sequences and acceptance

SEQ-210-001 / AC-210-001: first and second normal messages; discover then pin each
root, advance durable cursors, preserve distinct roots and generations. Wrong
owner/resource/attempt, replay, equal-revision contradiction and late callbacks
must not paint another canvas. UI observation cannot make the editor dirty.

SEQ-210-002 / AC-210-002: interaction → receipt → resume → second interaction →
cancel. Observe the wait without changing its request/receipt/revision/effects.
Distinguish leaf approval from child/parent waits, and preserve completed nodes.
Stop produces only authoritative cancellations; no propagation from a root to
unproven children. Reading an expired wait does not expire it.

SEQ-210-003 / AC-210-003: resource/source A runs; save B while waiting; observe
and resume A, then a new run uses B. Observation uses the frozen documents;
closing it restores B's dirty/edit/history/source state. Cold read of completed,
waiting/cancelled/failed/unknown state retains identity, never triggers recovery.
Sidecar crash may leave recorded running; owner remains explicitly unverified.

SEQ-210-004 / AC-210-004: root, fixed Workflow Call, Hook and subagent invocations,
including repeated same-definition children. Verify temporal parent invocation
and fixed definition match; reject wrong lineage/digest, unregistered plan,
foreign generation, forged receipt and missing/unsupported adapter members.

AC-210-005: branch skipped edges with shared downstream; failed End/root
projection; result sealed before publication; after-Hook failure/known prior
effects and outcome_unknown. No unknown-to-failed or all-nodes-green shortcut.

AC-210-006: real authenticated Flask producer capture → independent Main/preload
and renderer validators; negative shape/version/identity tests at each boundary.
Real source-App/packaged verification remains separately reported until run;
jsdom, test client and installed-wheel tests are not labelled packaged-App PASS.

AC-210-007: visible/accessible state text + ring + existing builtin glyph in both
themes; run diagram read-only; current-editor Save, Rename, Code viewer, drill,
Escape and undo/redo regressions preserved. Pools have no fake executable state.

## Execution and model checkpoints

**Partially suitable for a weaker model.** Discovery, immutable identity,
single-prefix verification, temporal lineage and state mapping require strong
implementation/review. After a real Host capture fixes the wire contract, a
weaker worker may implement the bounded IPC/facade/validator seam with supplied
producer fixtures and negative cases. The visual badge component may be another
bounded slice after its props are fixed. No worker chooses durable semantics.

1. Root strong implementation: pure Host reader, isolated private-Core adapter,
   strict route, actual fixed-wheel/real Journal tests and producer capture.
   Strong independent review before UI depends on this contract.
2. Bounded weaker-worker transport consumer + tests after checkpoint1. Root
   checks original producer bytes and adversarial cases, not only green claims.
3. Root integrates read-only run view, polling/navigation fencing, canvas badges
   and focused UI integration; strong review before implementation-ready.

Every worker first performs this clone's pre-edit impact; no commits/push/start
of a later slice without the checkpoint handoff. Existing test wrappers and
explicit paths only. Do not run full regression/index/build alongside Claude.
Busy checks are not bypassed; report a test as NOT_RUN until actually executed.

## Pre-edit risk and verification environment

The first index reported `buildSkeletonResourceRequest` HIGH. The refreshed
pre-edit index reports **CRITICAL** for that symbol (641 impacted),
`runMisoSkeletonResourceCommand` (640), `createMisoBridge` (639), and the renderer
API File (638; File axes are not comparable to function axes). These shared
paths require isolation and existing resource request/IPC regressions; there is
no riskSharedAxes waiver or inference that generic-name expansion removes risk.
Resource-route File was LOW/17 impacted symbols.
`GraphDrawing`, `SkeletonResourcePage`, `SkeletonRunMenu` and the new reader
are UNKNOWN/not-resolved; direct JSX/text callers are confirmed, not unused.
Raw reports: `impact-*.log` under this ticket's artifact root.

Process correction: `renderNode` was changed after the containing GraphDrawing
impact, without its own exact pre-edit query. Its later disambiguated upstream
query is LOW, one caller (`GraphDrawing`), seven process hits. That later query
does not retroactively satisfy the pre-edit step. New-symbol/test File queries
remain UNKNOWN; text references were confirmed. No commit has been made; a
fresh full change analysis is still required before delivery/commit.

Selected test wheel: `c1213803c1b3bb58f4fc78a03b1a00f80e001d63be00c4afae53ab4d972b12ec`,
manifest `sha256:c172bc02718aee771ddd4d247904f13cdaf003d3794148fd3ecd4d4e9a419e6b`.
Install/copy into a private test environment; no editable sibling imports, no
changes to source environments or the selected artifact. Record actual imported
module paths/hashes and current manifest before evidence is accepted.

## CP3 + source HTTP checkpoint (2026-11-07)

Evidence root: `~/.codex/artifacts/ticket-210-start-20261107/`.

- Host CP1: 46 passed. Two additional, separately executed producer cases prove
  Unicode/deep opaque graph IDs and same-chat A/B roots; each passed. The latter
  uses exactly two offline SDK calls; pinned A remains A after new root B.
- Main/preload: five suites / 102 passed; frontend: 34 suites / 411 passed.
  After test-only lint corrections, affected frontend tests passed 82/82 and
  Main tests 73/73. Production source was unchanged. ESLint on 21 changed JS/CJS
  files: zero errors, one pre-existing preload typed-refusal warning. The narrow
  frontend rerun retained ten React act console entries from async icons and
  observation updates; they are not hidden or described as a warning-free run.
- Real authenticated HTTP: 12 assertions accepted. A new source Host process
  reads the previous process's two completed roots and one actual approval wait.
  Actual Main service / preload / renderer facade logic reads B, explicitly
  pinned A, wait, no-match and typed refusals. Six server requests return four
  200s, 409 and 401. Readiness, IPC invocation and Main process lifecycle are
  injected; this is not a real Electron process/IPC-chain or packaged-App test.
  308 imported Core modules equal the selected wheel bytes. SDK constructor trap
  stays 0; all three revision/event/watermark fingerprints remain unchanged.
  Source/wheel hashes remain unchanged over this run (54 source files checked).
  A reverse-DNS lookup was blocked by the QA audit; no provider was contacted.
- Browser source-component fixture: actual page/FlowEditor/observer/validator,
  recorded producer output, actual theme palette; editor get/save is a declared
  in-memory fixture. Checked completed, approval, receipt, nested/Hook/unknown
  views, invocation selection, dirty B restoration, Escape, twenty native Tab
  moves with no access to inert editor controls, and light/dark state text.
  No model/Chat execution or real Store write is claimed for this browser unit.
  The narrow browser viewport requires panning; screenshots are not a complete
  responsive-layout acceptance. An early empty-theme fixture and classic-JSX
  bundle failed QA assembly and were corrected; original logs/screenshots remain.
- Strong independent Host, transport, UI and final HTTP reviews give bounded
  approval. Final HTTP review: `http-review-01/review.md`.

Current result: **source implementation / focused integration PASS_BOUNDED**;
#210 remains open/In Progress. All task-owned HTTP/static-browser processes and
the temporary browser tab are stopped/closed. No commit/push/merge/close.

Still NOT_RUN for this candidate: rebuilt sidecar binary, packaged/source
Electron App integration, real OS IPC, cross-platform desktop acceptance, full
repository CI and post-index full graph-change analysis. Cold observation is
proved; cold actor recovery/resume is not implied. Changed Host Python must be
rebuilt/restarted before deployed verification. Real API/provider calls remain
prohibited; none are needed to complete the next offline delivery checks.

## Delivery plan (owner close request, 2026-11-07)

Root owns candidate integration, CI, audit and normal protected merge/closure.
Claude owns a separate QA-only packaged-App branch and the real-app evidence;
no overlapping product edits or duplicate acceptance. #473 stays Planning.
Heavy execution remains serial, including a handoff of the hosted QA window.
User instruction prohibits real provider/API calls; the real App/SDK path uses
the qualified offline substitute instead of the audit skill's generic paid
model probe. Signing/publication and release certification are not this ticket.

The 56-path development patch replayed onto delivered dev with zero conflicts;
each replayed file matched the frozen checkpoint byte-for-byte before these
delivery notes. #472 modifies only BindingRow/OutputRow and their tests, outside
the feature patch; test the existing page/layout consumers on the integrated
candidate. Do not rewrite or retest the frozen development directory in place.

Before replay, a fresh independent index in the delivery clone was queried.
Main request builder is HIGH (seven resolved impacts, registerIpcHandlers,
callable-value lower bound); Main command LOW/six, bridge LOW/three with a
value-reference boundary, API File MEDIUM/85. Earlier CRITICAL results remain
historical risk evidence, not waived by this fresh index. Canvas/page/menu/Code
JSX callers remain UNKNOWN and text-confirmed. renderNode was queried before
this replay (LOW/one GraphDrawing caller); the original late-query process miss
is still recorded above. Process-discovery caps and offline-unavailable FTS are
explicit index limits; no zero-risk or universal-flow claim follows.

Fixed acceptance pair: reuse the canonical wheel from Actions run 42395251373,
artifact `unchain-release-artifact` (artifact ID 13582669231), SHA c1213803… /
manifest c172bc02… as expanded above. Build the changed Host sidecar from the
delivery candidate once, record its digest, and reuse that exact sidecar/App
through every accepted App scenario. CI-built artifacts, if different, are
reported separately and never silently substituted for the selected pair.

Remaining acceptance: actual saved run → observation HTTP/IPC → visible canvas,
first/second root, approval/receipt/resume/second wait/cancel, child invocations,
A-running/B-edited and cold read. Compare exact owner/execution/generation/root/
graph and document/durable cursor; confirm view-only actions do not mutate runs
or add SDK calls. Keep per-layer declarations honest and preserve first failures.
Finish the five feature-audit checks bound to the delivered candidate digest,
mandatory CI and full untruncated detect-changes before normal merge. Verify the
merged tree, issue Closed and Project Done afterward. No next ticket starts
until #210 is delivered and closed.
