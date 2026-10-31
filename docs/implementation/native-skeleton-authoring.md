# Native Skeleton authoring: first bounded core slice

## Restart amendment — owner 18GB resource policy

Read /Users/red/.codex/artifacts/pupu-356/356-parallel-dispatch-20261022/RESOURCE-POLICY.md. The resumed worker has file tools only, no Bash/MCP/spawn; root serially runs every local command/test. No indexing or npm install by the worker. Root has now measured the seven proposed draft shapes using the real source store + fixed installed runtime; see native-core/restart-01/native-seed-capture.json and capture_native_seeds.py. Every case saves and roundtrips; absence of Kernel still refuses preflight. Empty diagnostics is NOT proof of run readiness. Adding a disconnected Agent/Pool, deleting the final Agent and disconnecting edges remain savable incomplete drafts with actual diagnostic codes captured.

Factory IDs are now fixed: nodes start/agent/end, edges flow-start-agent/flow-agent-end. Initial add/connection operations can receive explicit IDs for exact producer-capture comparisons; unspecified IDs use deterministic free suffixes. Keep the pure new module self-contained (no imports) so its public behavior can be independently tested with Node without frontend dependency installation. Root provides the missing-module RED before implementation; worker writes the new module and matching focused Jest tests, then stops. No existing source edits or UI wiring. The reference source graph investigation was performed on the same e24 store bytes in root's current F1 clone; no Native clone index or existing-symbol impact is falsely claimed, and no existing Native function is being edited in this checkpoint.

Owner instruction 2026-10-22: parallel Claude workers may advance the remaining Agent Builder work. This is a separately recorded authoring follow-up, not a retroactive expansion of #341 panel/drill acceptance. Related design sources are #341 and docs/implementation/agent-workflow-v020-contract-plan.md sections 2, 3, 8.13 and 11. Existing palette/context-menu choices are reused later; this first slice is nonvisual.

Workspace /Users/red/Desktop/GITRepo/pupu-341-native-graph; branch codex/ticket-341-native-graph-core; base e24e993fe9aaf70920cd94e43cfdb4fbc139e302. This integrated unmerged base is required for existing native panels/store/selection. Do not assume those changes exist on dev. Read /Users/red/.codex/artifacts/pupu-356/356-parallel-dispatch-20261022/builder-split.md and issue-341.json for the source inventory and settled design. This file controls the authorized checkpoint.

## Permitted files and interface

Only add the pure module src/COMPONENTs/agents/pages/recipes_page/skeleton_graph_edits.js, its tests, a new generated seed/operation capture, a capture test/producer script, and this plan. New evidence goes under /Users/red/.codex/artifacts/pupu-356/356-parallel-dispatch-20261022/native-core/. No existing product symbol edits in this checkpoint; if needed report before editing. In particular no canvas/page/hook/session/list/legacy catalog/DetailPanel/FlowEditor changes. No UI coupling, storage, clocks, randomness, provider lookup, credentials or calls from this module. Caller supplies resource id/name; deterministic local free IDs use Set/Map.

Freeze these internal APIs for later UI wiring:

- new_agent_document({id, name})
- add_node(document, {type, id?})
- delete_node(document, node_id)
- connect_nodes(document, {kind, source_node_id, source_port_id, target_node_id, target_port_id, id?})
- delete_edge(document, edge_id)

All return exactly {ok, document, problem}; on success problem:null, on refusal ok:false with the exact original document and problem:{code,message}. Safe reason text must not coerce unvalidated stored values. The factory can use document:null on invalid arguments. Existing unknown fields/configs are never normalized or silently stripped. Successful mutations preserve all unaffected objects/config/default/missing-policy/reference values. Reject ambiguous identities rather than picking the first/last.

## Seed and commands

New Agent is Start -> Agent -> End; resource id/name explicit. CLOSED root keys schema_version:1, kind:agent, id,name,nodes,edges; optional description is not fabricated. Node only id/type/config. Edge only id/kind/source_node_id/source_port_id/target_node_id/target_port_id. Do NOT use legacy recipe_node_catalog factories or recipe_graph normalization: their extra fields and defaults are forbidden native data.

Start config.execution.outputs:[]; Agent and End config.execution:{inputs:[],outputs:[]}; no kernel key. Two flow edges out->in. This is an intentionally unfinished draft. FIRST validate it with the actual fixed source store plus installed runtime save_draft/get_resource/diagnose; retain actual preflight refusal. Do not guess Kernel/model/endpoint/credential or global chat input names, and do not claim seed ready to run. If actual producer refuses the proposed shape, report the exact refusal before inventing a different architecture.

Initial add_node supports Agent and Subagent Pool only, the native types with existing editable business panels. Pool seed is config:{subagents:[]} and requires the same real-store proof. Start/End are created by the factory and cannot be duplicated or deleted. Do not offer Toolkit Pool until its native detail editor exists; toolkit configuration shapes may be documented but no advertised ability or toolkit UI in this slice. Workflow/branch/Code/Hooks/Tool/Skill creation is outside this first checkpoint, not claimed complete.

Delete an ordinary node and its incident edges; preserve consumers' input refs and defaults for actual diagnose to explain. Delete an edge without automatic replacement or rebinding. No wholesale graph cleanup and no embedded-subgraph deletion or ID rewrite.

Flow commands connect real flow nodes out->in, no Start in/End out, no pool flow, no cycle or multiple targets on one outlet; reject with reason and original object. Attach commands connect Agent and Subagent Pool with actual supported attach_top/attach_bot ports, in either semantically admitted direction. Verify each rule against actual schema/producer; port position is not execution order. Existing bad values must not crash rendering-independent helpers. Unknown/ambiguous command endpoints/ports/kinds/extra command keys refuse instead of guessing. Node IDs including __proto__/constructor/toString are legal; resource IDs have the separate store URL-safe rule, and __proto__ is invalid as a resource ID.

## Boundary and verification

BC-NATIVE-AUTHOR-01: pure JS command -> exact native document JSON -> source SkeletonResourceStore save/get/diagnose -> installed runtime format/preflight consumer. CLOSED document/node/edge wire; no added fields or version changes. Resource/node/edge identities distinct, incomplete draft can save, structural format cannot be widened. Use independent real producer captures, not JS mirror self-agreement.

SEQ-NATIVE-AUTHOR-01: explicit new id -> unfinished valid draft -> add Agent/Pool -> connect/remove/disconnect -> first store save (omitted expected token) -> read exact same bytes/token; subsequent stale token refusal remains store authority. UI session and auto-save are NOT_IMPLEMENTED here. Deleting a referenced node preserves its unresolved consumer binding and produces the real diagnosed error, not silent empty-string substitution.

AC-NATIVE-AUTHOR-01: factory and supported operations exact-key match real store roundtrip captures; new unfinished draft saves and refuses Run for its actual reason.
AC-NATIVE-AUTHOR-02: deterministic IDs do not collide; prototype-member node IDs work; malformed/duplicate endpoints refuse with input unchanged.
AC-NATIVE-AUTHOR-03: delete only intended node/incident edges; preserve unrelated config and unresolved refs/defaults by reference. Flow/attach direction, forbidden cycle/outlet and Start/End protections have actual positive/negative evidence.
AC-NATIVE-AUTHOR-04: no layout fields, Kernel invention, storage or shared singleton state. Source objects never mutated; rejected commands cannot destroy a bad but editable draft.

Fixed pair /Users/red/.codex/artifacts/pupu-356/embedded-diagnostics-20261017/fixed-pair, its install-venv CPython 3.12.10 with -I -B and UNCHAIN_SOURCE_PATH pinned to installed site-packages. Wheel SHA256 4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b; actual imported manifest sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101. Disposable HOME/store/workspace, no user store. Store/preflight preparation only, no provider/client/HTTP execution. Never modify the wheel, frozen H1-H5 files or QA guard.

Follow clone instructions, graph query/context before new flow investigation, impact before any existing symbol edit, warn HIGH/CRITICAL, corroborate UNKNOWN. New module callers are initially absent by design. Own dependencies in this clone; do not symlink a mutable node_modules cache into another worker's/source checkout. No commits/push/merge/issue mutations. Run focused new/related suites first; no overlapping broad builds. Red-before-green meaningful new behavior; unit and real-producer captures recorded separately. Byte-hash restore from copies, never git checkout away uncommitted work.

## Delegation / stop

Partially suitable for configured Claude: the pure core/closed shape/reference-preservation slice is bounded; UI session lifecycle, connection gesture and integration choices remain with root and next checkpoint. Keep default configured Claude model, record actual identity if reported. Write progress.md when started, then final checkpoint.md with files, exact commands/results, preserved failures, capture fingerprints, APIs, graph receipt and remaining NOT_IMPLEMENTED. STOP after this core slice. Root independently reviews it before UI wiring; no next slice or claim that the whole Builder can already create/edit graphs.

## Root checkpoint and continuation — 2026-10-22

The owner asked root to continue independently while their Claude session is unavailable. No new Claude sessions are launched. Root corrected the two implementation defects after a 9-failure Jest RED: Agent/v1-only editing and runtime-admitted same-side attachment ports. Final pure core is 61/61 Jest, 230 independent contract assertions and 4/4 admission challenges; existing envelope/IO/document suites 167/167 and resource adapter 39/39 pass. One attempted adapter regression used a nonexistent SERVICEs test path; the real co-located suite was then run, and both logs are retained. No UI/run readiness claim follows from these checks.

Clone-local incremental graph analysis ran one worker, 23.52 seconds, peak measured process-tree RSS 1821.4 MiB. It covers the new files but context/impact still cannot resolve document_issue/attach_issue (UNKNOWN). Text corroboration identifies four internal command callers and one internal attach caller, and no production importer of the new module. Whole-graph flow discovery is truncated and is not used as an absence proof.

The next bounded continuation is governed by native-skeleton-create.md. Root is the only editor in this clone. The earlier worker-only file restrictions describe the finished delegation checkpoint; they do not authorize a second worker or change the frozen H1–H5 evidence.
