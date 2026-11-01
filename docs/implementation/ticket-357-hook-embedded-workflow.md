# #357 embedded Hook Workflow — producer continuation

Status: formal producer preparation, implementation not yet qualified. Existing pinned reference remains the baseline. This is an existing scope gap from the frozen/cached §7 contract, not a new feature added to release scope. No remote scope/status changes, commits, desktop starts or real API calls.

## Evidence and authority

Contract plan §7 lines 211–213 calls for an embedded or referenced non-LLM Workflow and explicitly saving an embedded graph as a Workflow. Current hooks_config's closed source only accepts workflow_id/revision_id. The accepted b2204391 wheel's real validator rejects an embedded body with missing_field; the same capture admits existing reference and descriptive-id controls. The existing editable Hook id meets canonical stable-ID/name presentation. A new name field is not planned. Canonical §7 and runtime §6.2 exclude fail-open; that old ticket wording does not create implementation work.

Independent workspaces: Core unchain-357-hook-embedded from accepted 86f06ad8; host pupu-357-hook-embedded from accepted 99f40921. Objects and indexes are private, no alternates or shared write paths. Frozen inputs and original evidence stay read-only.

## Formal decision / delegation

Codex retains the cross-repository producer and durable-state design; unresolved snapshot/source closure work is not delegated to a weaker implementation worker. Claude can independently map the remaining #357 UI acceptance evidence without builds, tests or app starts. Source editing and Hook graph authoring follow a measured producer contract rather than a UI-invented wire shape. No UI design choice is being introduced before the backend contract exists.

## BC-HEW-001 — definition to validator/runtime (VERSIONED / CLOSED)

Producer: parent Agent resource's Hook workflow field; consumers: imported Core closed validator and Hook binding preparation. Preserve the existing exact {workflow_id, revision_id} form. Planned additive embedded form is {kind: embedded, document: <same versioned Workflow document>}, with no mixed fields or arbitrary extensions. Final variant/getter must be captured and cross-checked before UI handoff. Unknown fields/versions/kinds fail at precise paths. Embedded bodies must be valid Workflow graphs and cannot introduce Agent/Kernel or Pools. Limits and nested published-dependency resolution remain enforced. New capability/manifest negotiation must be derived from the actual imported runtime; Git tree/path are provenance only. Existing getters retain their exact legacy shapes.

AC-HEW-001: true producer → independent strict consumer; reference and embedded controls; malformed/mixed variants, wrong kind and forbidden nodes; old runtime/unknown capability fail closed. Preserve legacy fixed-reference behavior and no automatic conversion/publication.

## BC-HEW-002 — resource/source closure to saved and retained state (CLOSED)

The embedded body belongs to the parent resource, including its managed Code source and CAS token. Resolving nested published Workflow references does not publish the embedded body, create a second mutable resource, rewrite pinned references or conflate a draft with a product revision. Definition and source bytes are fixed before execution and retained independently from later library edits. Runtime child identity must bind parent execution/generation/node/call, Hook id and definition digest; do not use an array position or latest library document as authority.

AC-HEW-002: save/reopen parent with embedded Code sources; wrong/missing source binding and stale token reject; nested references preserved; no sibling or independent resource write. Capture actual v2 producer documents and exact closure ownership.

## BC-HEW-003 — retained Hook binding to child execution and continuation (VERSIONED / CLOSED)

Reuse Workflow execution, Hook input/decision validation, phase receipts and existing nested approval/cancel paths. No second model authority, no new failure policy. Retain the original after-denial semantics. Actual artifact pair (one wheel built once, reused with exact host) must establish admission, child binding and durable behavior before active rollout or UI wire handoff. A changed runtime protocol is not claimed compatible with old suspended runs without explicit evidence.

## SEQ-HEW-001 / AC-HEW-003

Parent A saves embedded body/source A → selects run A → actual tool reaches Hook → approval wait → save newer body/source B in library → resume A using A's definition/source/committed phase → fresh run B uses B. Repeat/replay must not rerun a committed phase or repeat external writes. Retry/reset bind their documented selection boundary; cancellation propagates to a waiting child and parent. Cold sidecar resume and rollback compatibility are applicable and remain NOT_RUN until measured, not N/A. Include second tool interaction and graph/subagent paths when touched. No real provider/API is permitted; offline SDK only.

## Verification and delivery boundary

Initial capture is a preimage fact, not a red unit test count. Add behavior tests before changing existing production functions. Run upstream graph impact on both repositories; UNKNOWN needs text corroboration and HIGH/CRITICAL must be reported. Use the existing cached CLI offline, no bootstrap/install or unbounded index job. Keep graph failures honest, no commit to fabricate a valid HEAD. One heavy job at a time on this 18 GiB machine. Python changes require a fresh owned sidecar for exact-pair verification; no user process restart. UI, final desktop matrix, human/live-provider acceptance and all tickets remain INCOMPLETE until separately evidenced.


## Producer decision recorded before artifact build

The additive source is exactly `{kind:"embedded", document:<Workflow>}`; legacy refs remain exactly `{workflow_id,revision_id}`. Core `EmbeddedHookWorkflow` is distinct from PublishedWorkflow. Its internal revision identity is `embedded-sha256-<execution_definition_digest>` and is never written into a draft or a workflow_versions row. The parent CAS resource owns managed text at `nodes/i/config/hooks/j/workflow/document/nodes/k`; bodies in embedded Agent resources use the same prefix composition. Disabled owned bodies retain stored text but acquire no file/profile/tool dependency. Embedded frames count in depth/cycle checks and nested published references enter the independently validated closure.

Capability: `GET /skeleton_hooks/capabilities?contract=embedded_workflow_v1` (authenticated, unique closed selector); `pupu.skeleton_hook_workflow_capabilities.v1` has exactly schema/runtime_manifest_digest/workflow_source. The imported Core getter `unchain.skeleton_hook_workflow.v1` fixes source fields and kind. Skeleton protocol 1.4 adds hook_embedded_workflow_v1. Existing enable and tool-set getters/envelopes remain unchanged. Fixed Main action and preload/API reader take no caller payload or selector. The new reader fails closed on an old host or malformed reply. A real source capture is checked again against the built pair before handoff.

Development evidence: Core 64 tests; host 237 tests plus ten additional guards (14 initial cases overlap); API 38 and Electron 16. Original REDs and invocation/fixture failures are retained. The source-mode actual Context V2/SDK/Core-read/Code run demonstrates A waiting -> library B saved -> A resumes without another Code execution -> fresh B does not ask -> a fresh A cancellation has no root End. This is not artifact-pair proof until repeated on the one installed wheel.

Cross-version suspended-run upgrade, HTTP chat execution, desktop, real provider, Memory Agent and the UI embedded editor remain NOT_RUN. No active rollout or release closure. The new pair is an exact bounded test artifact, not a signed final App. Old frozen pairs remain intact and are not silently replaced in a running user instance.


### Child-approval lineage follow-up (same producer slice)

The first host candidate a005903a / sidecar 614b3abb proved the Code/outer-approval A/B cells but its production pending reader still required a published reference. Before UI handoff, four real child-approval tests reproduced rejection at _hook_chain. Its LOW upstream impact is _descend -> pending/receipt/expiry/cancel. The fixed branch independently derives workflow id and embedded-sha256 identity from the frozen parent body, retains the exact digest and child-chain proof, and never asks a same-id published resource or current library document to stand in for it. Legacy pinned-reference equality remains explicit. Four new cases now pass (embedded body or embedded wrapper with a nested pinned child; resume or cancellation). Their real Core tools obey approval, and the parent tool remains unexecuted until the child is approved.

QA environment: the inherited Seatbelt test process cannot execute setuid ps. A run with 14 failures/10 passes was interrupted; these were truthful process-incarnation failures, not accepted tests. Under the user's earlier current-process-only ps authorization, the QA supervisor obtains real /bin/ps -o lstart= -p <its owned receiving test PID> output and the receiver checks the exact PID/argv. Only that exact subprocess query can consume the receipt. Wrong PID and wrong query remain refused inside the restricted receiver. No product/session/QA guard was edited. Existing previously blocked descendant/other-PID tests are not relabeled passed.

Keep the first artifacts and failure logs. The Core tree/wheel are unchanged; build the corrected host binary against the very same 3a79c2b8 wheel, then verify the final pair. No second Core wheel build.
