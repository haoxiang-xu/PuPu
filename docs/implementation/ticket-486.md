# #486 — Agent and Workflow Test Run

Issue: https://github.com/haoxiang-xu/PuPu/issues/486
Workspace: `/Users/red/Desktop/GITRepo/pupu-486`
Branch: `codex/ticket-486-builder-test-run`
Base: dev `3cdc274ad0273dee3f69cfc0681e318a5df0417c`

The issue contains the approved scope and full AC-001..010. The two review points
are A: both integrated modes and development verification; B: packaged acceptance,
CI and user-requested delivery. This plan records implementation contracts, not
permission to close. No commit, push, PR, merge or close during the start phase.
The original PuPu/Claude checkout and frozen candidates are outside this work.

## Delivered behavior

Run opens the existing docked right sidebar without executing. Agent accepts
explicit messages in a dedicated, persistent test session and uses server-owned
history and the saved graph's Kernel. Workflow accepts declared typed arguments
and returns the structured End result through a genuine root Workflow runner;
it does not create an Agent, Kernel or model conversation. Dirty/new definitions
require an explicit Save and test; failed/conflicted saves never start.

The controller owns no normal-chat draft, message list, composer selection or
execution. Closing, selecting a node/resource, or viewing the recorded graph only
detaches its view. Explicit Refresh reattaches; New creates a separate conversation
only when the previous one is idle. Stop uses the existing cancellation host.
Approvals, denials and human input use the canonical pending interaction, receipt
and resume paths. The pending controller is the only interactive approval surface;
raw durable requests remain recorded but are not adapted into duplicate tool cards.

## BC-001 — renderer / preload / Main / authenticated Host

VERSIONED command contract `pupu.builder-test.v1`, capability
`agent-workflow-test-v1`, on the existing Skeleton IPC envelope and one new
`POST /skeleton_tests/command` route. Public operations are open/new/read/start/
respond/resume/cancel. Main's start is a closed object: op, resource_id, session_id,
expected_edit_token, request_id, inputs, toolkits, workspace_id; Agent may add the
same four-string memory_agent_config used by normal chat. No caller-supplied owner,
attempt, endpoint, model override, path or credential is admitted.

Main resolves a unique registered workspace ID through the existing runtime path
validator. It freezes selected toolkit names, skill-directory policy and workspace
roots in private prepare. Existing graph-derived credential requirements and
private provider settings inject secrets only into execute/resume; these transient
options never enter the renderer, run material, event cache or launch descriptor.
The existing vault/readiness fence guards start/respond/resume. Read/cancel do not
require a new model credential. No old-host/v1 fallback exists.

Arguments are finite JSON, recursively copied before awaits, with closed key sets
and a 2 MiB limit. Main and renderer independently validate the captured Host reply:
exact root/session/run/pending/error/graph fields and session identity for every V4
frame. Capability includes the validated manifest from the actually imported Core.
The frontend 20 s timeout does not abort or resend an actor operation. It becomes
unconfirmed and requires readback. Only read-only status polling retries, with
bounded backoff; stale generations/replies cannot replace a newer resource/view.
Maps to AC-001/002/003/008/009; SEQ-001/003/005.

## BC-002 — saved graph / admission / durable runtime

CLOSED admission freezes one managed-v2 Store revision and exact edit token,
fixed Workflow dependencies and managed Code closure before effects. The private
request ID is unique within its test session; replay with different token/inputs/
context is refused. SQLite claims dispatch once. Prepare and launch material are
bound by canonical selection/dependency/input identities, not renderer hashes.

`builder_tests.sqlite3` contains locators, admitted material and bounded V4 display
cache. It is not a second execution/history store. Real production execution guards,
Context Journal, CAS, launch descriptors, bindings, tool policy and Code workers
remain authoritative. Context and Memory Agent preferences are frozen in prepare;
execute/resume cannot replace them. Provider credentials are transient.

Agent retains its existing launch readers and production stream path. Workflow
uses explicit `pupu.skeleton-workflow-launch.v1`, normalized function inputs, empty
attachments, retained dependencies/Code/capabilities and a prepared Workflow plan.
The thin root adapter requires the genuine bridge, shared durable runtime/store and
execution guard. It reuses DurableWorkflowRunner, existing handlers and receipt
resume; it never wraps the Workflow in a fabricated Agent or calls Memory Agent.
Pure Workflow execution makes no provider call. Existing Agent-only public chat
selection is still Agent-only. No Core source change or dependency update.
Maps to AC-002/003/004/006/007/009; SEQ-001/002/003/004/005.

## BC-003 — canonical execution / interactions / display

VERSIONED V4 events are normalized through the same RuntimeEventBridge, typed
child attribution and display metadata sidecar as production. Original event IDs,
transport seq and bodies are retained. Each real session.started segment is reduced
separately for TraceChain; presentation seq does not rewrite stored V4. The display
cache is capped at 2 MiB UTF-8 / 10,000 events per run, and complete replies at
16 MiB. Truncation is explicit and never becomes success.

Status and structured End output are read from verified retained launch/Journal/
CAS. A completed graph is not exposed as a completed root before root_committed;
an interrupted uncommitted root remains outcome_unknown. The reader checks retained
selection/dependencies/inputs against the admitted row. A concurrent wait settlement
may invalidate an intermediate pending read, so that projection re-reads once; it
never repeats an effect. Persistent read errors remain visible and unconfirmed.

Answers bind session/resource/run/interaction to the actual pending owner, and use
existing durable receipt/resume. Stop uses cancel_chat_execution so parked session
guards are released as well as the graph. Repeated start/answer/resume/Stop cannot
repeat an effect. No terminal status is inferred from an SSE ending, button position,
parent text, or composer selection. Recorded graph viewing stays read-only and Back
restores Test mode and the editable resource.
Maps to AC-005/006/007/008/010; SEQ-001/003/004/005.

## Verification and artifact identity

Evidence: `/Users/red/.codex/artifacts/ticket-486-implementation-20261114/`.
One reused wheel from Core `2458c3c6e142b6996b33bc34a14487f554f8eb87`:
`0a8f3690db6dbefb16dbb71bd5c2298f485b9eb56d1571cc3e45e1eca5dfee18`.
Actual manifest `sha256:1962d559109aef3fbb41227551ced6c6bc84194ffc237badd52ec4593cc31105`.
Producer capture checks 332 imported Python modules against that wheel, rather than
a mutable sibling checkout. Sidecars were restarted after Python changes.

SEQ-001: two real Agent turns, server history, New and ordinary-chat isolation.
SEQ-002: real typed controls plus production required/default/type admission;
structured End and no-model Workflow; nested pinned child and managed Code tests.
SEQ-003: approval/denial/Stop, duplicate operations, first and second waits within
one root, and Agent start/resume credentials. The pending UI is identity-owned.
SEQ-004: real cold Python process resumes managed Code A after B is saved; new B
uses B. Source-browser Host restart retains the same interaction before approval.
SEQ-005: request replay/conflict, wrong owner/token, stale UI generations, failed
save, unconfirmed response readback and transient read failures without redispatch.
Actual pass counts and outstanding cells are in the checkpoint receipt/report.

The browser harness uses genuine page controls, preload functions, Main transport
helpers, authenticated source Flask, installed Core and native SDK against a strict
loopback substitute. It uses an isolated headless Chromium profile and does not
open a visible app window. Its RPC adapter is not Electron IPC; graph seeds are
Store-prepared. Do not count this as AC-010 packaged-App acceptance, real Main
startup/vault integration, GUI-edited graph creation, Windows/Linux/macOS release
qualification, or real provider testing. Those are checkpoint B / release work.
Human-input and every applicable Hook/child cold sequence not executed remain
NOT_RUN; passing a subset does not close #486.

## Implementation supervision and process limitations

Strong parent owns boundary design, admission, durability, session controller and
integration. A bounded gpt-6-luna/high worker implemented the controlled Workflow
argument form (real controls and 11 tests) and subsequently test-only Main/preload
qualification (21 tests). Parent integrated/reviewed both; no whole-ticket handoff.
The form never writes the Workflow document, selects a profile, publishes or runs.

Cached GitNexus was used for production impacts; UNKNOWN JSX/new-symbol results
were corroborated by actual text callers. Some new symbols were checked after the
initial prototype was created; this is a process limitation, not a clean pre-edit
check. Before committing, refresh this clone's index and run full detect_changes;
partial/truncated or unseen changes are not a clean result.

Offline exception: one invocation of `.gitnexus/run.cjs` unexpectedly ran its package
runner and downloaded four dependency entries. No real model/provider API was
called, but this violates the whole-session offline requirement and is not waived.
All later graph commands invoke the installed CLI directly. Browser/runtime units
use loopback substitutes; their bounded offline conclusions do not erase this event.
