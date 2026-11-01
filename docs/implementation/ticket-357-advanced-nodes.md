# #357 Code / Workflow Call / Hooks Pool panels — implementation plan

Ticket: https://github.com/haoxiang-xu/PuPu/issues/357
Workspace: `/Users/red/Desktop/GITRepo/pupu-357`, branch `claude/ticket-357-advanced-nodes` (local only).
HEAD `e24e993f`; index and working tree start at the inherited composition tree
`4117670fe54609cce507c64f8f2b0b715b83d1c5` (frozen #352 UI `d3f29c8a` + sealed #356 lifecycle/shell
patch from `6ed40b48`; see `~/.codex/artifacts/pupu-356/356-steps-integration-20261023/report.md`).
Nothing is committed, pushed or merged; each checkpoint is a tree written through a temporary index.
Frozen inputs (`4117670f`, `d3f29c8a`, the wheel `a166988a…b7ec`, the sidecar `df308db3…23382`, old
evidence, QA guards) are never edited. Evidence: `~/.codex/artifacts/pupu-357/<slice>/`.

Design authority: the design canvas rows "Code, Workflow call and Hooks Pool", "Showing the code on
the node" and "Chosen: C, with an expand button" (decided 2026-09-26), plus contract plan §3, §6, §7,
§8.12, §11. Runtime authority: the installed wheel's `unchain/skeleton/{code_runtime, workflow_runtime,
hooks_config, hooks_runtime, execution, static_io}.py` and PuPu's `skeleton_resource_store.py` /
`route_skeleton_resources.py` at the same tree. Where the ticket and the runtime disagree the panel
follows the runtime and the difference is reported (section 3); the UI invents no substitute protocol.

## 1. What runs today (measured by reading the pinned code, to be re-measured on the fixed pair)

| Node | Stored config (CLOSED) | Admission | Published result |
| --- | --- | --- | --- |
| `code` | `config.code = {source:{kind:"file", path}, environment_profile_id, timeout_ms 1…86 400 000, max_result_bytes 1…8 MiB, max_log_bytes 1…8 MiB, result_schema (JSON Schema, `type:"object"`, Draft 2020-12 valid), artifacts?[{name, attachment}]}` + `execution {inputs, outputs}` | `admit_code_config` only when `config.code` exists (a seed without it passes `_validate_all`, fails at run); store `_validate_local_profiles` resolves the profile at preflight | the handler's internal receipt `{_skeleton_code: {schema, result, error, …}}` is unwrapped at `durable_execution.py:253`; an error receipt is refused there (`fail(error.code)`), so only a schema-valid object result is ever published (R-357-02) |
| `workflow_call` | `config.workflow = {workflow_id, revision_id}` + `execution {inputs, outputs}` | resolver must return the exact revision, kind `workflow`, non-recursive, depth ≤ 32 | the child End's exported outputs; child `cancelled/failed/outcome_unknown` → parent node fails with `child_<status>` (no continue policy) |
| `hooks_pool` | `config.hooks = [{id, order 0…1 000 000, event ∈ before_tool_call/after_tool_call, tool_name: string or null (= all), workflow:{workflow_id, revision_id}, force_approval: bool}]`, non-empty | attach-only; grouped per attached `agent` by attach edges; sorted by `(order, id)` | n/a (not a flow node) |

Hook Workflow I/O (wire, not the ticket's wording): Start receives `{event, call_id, tool_name,
arguments}` (before) or `{…, raw_result, visible_result}` (after). End must return a decision object:
before — `{decision:"continue", require_approval: bool, arguments?}` or `{decision:"block", reason}`;
after — `{decision:"continue"}` or `{decision:"replace", result}`. Any other shape → the hook fails and
the dispatcher blocks the call with `hook_<code>` (fail-closed). `force_approval` ORs into the final
approval requirement.

Host endpoints that exist: `GET/POST/DELETE /skeleton_python_profiles[/<id>[/probe]]` (facade
`listSkeletonPythonProfiles`, `saveSkeletonPythonProfile`, `probeSkeletonPythonProfile`,
`deleteSkeletonPythonProfile`), `POST /skeleton_resources/<id>/publish`,
`GET /skeleton_resources/<id>/versions/<revision_id>` (facade `getSkeletonWorkflowVersion`),
`GET /skeleton_resources` (workflow rows carry `published_revisions` count only). There is no
list-versions route and no route that reads or writes a Code source file.

## 2. Slices (owner's order; each slice stops at its checkpoint for independent review)

### Slice 1 — Code (`code-01`)
Files: `recipes_page/code_config.js` (new pure module: settings read/write, limits, problems),
`detail_panel/code_section.js` (new: Runtime profile picker + probe, timeout/limits, Result schema
fields, source, error note), `nodes/code_node.js` (new: fixed-height 3-line block + `+N lines`, expand
trigger, header fallback below 0.5 zoom), `skeleton_node_catalog.js` (palette entry, icon `code`,
ports in/out), `skeleton_graph_edits.js` (ADDABLE seed `{execution:{inputs:[],outputs:[]}}`, flow
source/target types), `skeleton_canvas.js` (render + zoom/drag plumbing), `detail_panel.js` (routing),
`node_identity.js`, `skeleton_result_roots.js` (code roots = declared schema root fields, closed when
`additionalProperties:false`), `output_variables_section.js` PRODUCER_LABEL, `skeleton_resources.js`
(python profile facade reads), tests beside each. BUILTIN touch, kept minimal and mirrored in tests:
`flow_editor` needs a reactive zoom for the ≤ 0.5 fallback (optional `on_viewport_change` callback or
equivalent) and a per-port anchor for "ports level with the header"; both are additive, default-off.
Author flow to prove: add → pick runtime → set timeout → declare Result fields → bind inputs → export
outputs → connect → save → reopen; malformed drafts (non-object schema, bad limits, stored unknown
keys, unknown profile id) render and are reported, never coerced; store diagnostics land on the node.

### Slice 2 — Workflow Call (`workflow-call-01`)
`workflow_call_config.js`, `detail_panel/workflow_call_section.js` (workflow picker from the resource
list filtered to `kind:"workflow"`, pinned revision read through `getSkeletonWorkflowVersion`, locked
Input Variables from the callee Start's outputs, outputs from the callee End's outputs, "open
read-only" through a new read-only drill frame), `nodes/workflow_call_node.js`, catalog/edits/canvas/
identity/result-roots wiring. Revision selection is bounded by section 3 (G4).

### Slice 3 — Hooks Pool (`hooks-pool-01`)
`hooks_pool_config.js`, `detail_panel/hooks_pool_section.js` (list rows: order handle, event badge,
tool matcher, pinned workflow; hook page: event, tool, workflow+revision, force approval, read-only
returns contract as the wire defines it), `nodes/hooks_pool_node.js` (attach node, rows + `+N more`),
attach rules (`ATTACH_POOL_TYPES` + `hooks_pool`), palette entry (`anchor`), identity, DetailPanel.

## 3. Ticket/design vs runtime — differences found before implementation (reported, not patched in UI)

- **G1 Code source text.** The runtime stores `source:{kind:"file", path}` and resolves `path`
  under the *run's* authorized workspace root (`skeleton_production_bindings.py:398`), only at run
  time. The document holds no code text, and no route reads or writes such a file. The panel's code
  editor and the canvas's three-line preview therefore have no source of truth today. Slice 1 builds
  the block/viewer against a `code_source_text(node)` reader that returns null for file sources
  (node falls back to its header; panel shows the path and says where the code is read from) and
  records the gap for Codex. Decision for the owner: inline source in the document (contract
  change), a store-owned source file + route, or path-only.
- **G2 Code "On error".** `config.code` has no error policy, and nothing of a failed Code node is
  published: measured on the pinned wheel (independent review, `runtime-result.json`), a return that
  is not an object or does not match Result ends the run `failed` (`invalid_type` / `output_invalid`),
  and an exception or a timeout ends it `outcome_unknown` (`handler_error`); `durable_execution.py:253`
  refuses the error receipt before publication, so End is not reached and no downstream node runs.
  (The first draft of this plan read the handler's internal `{result: null, error}` receipt as a
  published shape — corrected under R-357-02.) The panel states the stop/unknown behaviour instead of
  offering Fail-the-run/Continue.
- **G3 Workflow Call "On error".** No policy field; a failed child fails the parent node
  (`child_failed`). Stated, not offered.
- **G4 Revision enumeration.** Only `published_revisions` (a count) and `GET …/versions/<id>` exist;
  revision ids are `rev-<ordinal>-<digest16>` and are not listable. The picker can offer only ids it
  learns (a publish answered in this sitting, or an id typed and verified through the version
  route). The design's "v5 was published — Compare" needs a list route.
- **G5 Locked inputs' required marker.** A callee Start declares output names, not required-ness;
  the `*` in the design is not derivable. Names only; missing-value policy per row as elsewhere.
- **G6 Hooks.** No `enabled`, no `name`, no failure policy (fail-closed is the only behaviour and
  §7 forbids a UI fail-open toggle), tool matcher is one stable `tool_name` or all (no set), the
  workflow is a pinned reference only (no embedded graph), and `force_approval` exists but is not
  in the ticket. The panel shows what is stored; "disable" is not representable (remove instead);
  the returns contract shows the wire's `continue{require_approval, arguments?}` / `block{reason}`
  and `continue` / `replace{result}`, not the ticket's `modify` / `require_approval` names.
- **G7 Workflow-graph node menu.** The native editor edits Agent documents only
  (`skeleton_graph_edits.document_issue`, page `onGraphCommand` gated on `kind === "agent"`). The
  acceptance item about a Workflow graph's menu cannot be exercised until Workflow authoring exists;
  palette entries carry `graph_kinds` so the filter is ready.
- **G8 Code node without `config.code`** passes `_validate_all` and fails only at run; the panel
  reports the missing settings itself (as Tool Call does for `config.tool`).
- **G9 FlowEditor** exposes no reactive zoom and centres ports along a side; both need small
  additive BUILTIN changes (see slice 1). `mini_ui`'s flow_editor has neither either.

## 4. Boundary contracts

Producer: this builder (`code_config.js`, `workflow_call_config.js`, `hooks_pool_config.js`).
Consumer: the pinned wheel's validators above through the real store (`save_draft`, `diagnose`,
`preflight`). Admission CLOSED. **BC-357-001** Code config wire; **BC-357-002** Workflow Call
reference wire + callee Start/End projection; **BC-357-003** Hooks Pool entry wire + attach grouping.
Evidence plan per BC: capture real store answers on the fixed pair for seed/complete/malformed
documents (`capture_*_store.py`, modelled on steps-352), freeze them as `*_capture.json`, assert the
builder's emitted shapes against them key-set exactly, negative cases for unknown field / wrong
variant / limits. **SEQ-357-001** add → configure → save → reopen → edit → save (edit token CAS)
→ diagnose; cells: first save, second save, reopen cold, conflict. Run/preflight on the fixed pair
is a `NOT_RUN` cell for a Code node until G1 gives it a source.

## 4a. Slice 1 record (code-01)

Measured on the fixed pair before writing (`code-01/out/code-store-capture.json`, frozen as
`recipes_page/code_capture.json`): 23 stored shapes all save, round-trip and diagnose clean; only
preflight refuses (`unknown_field` for `on_error`, `invalid_shape` for an inline source,
`invalid_value` for limits, `invalid_schema`, `missing_field`, `profile_missing`); a seed without
`config.code` passes preflight; an absolute source path passes preflight; a result root the schema
does not declare passes preflight. Python profiles: built-in listed `bundled`, a named venv saved
with `probe: {ok, version, implementation}`, refusals `invalid_path` / `profile_immutable` /
`missing_runtime` / `profile_referenced`.

Decisions taken (all within the owner's defaults): no value is written the author did not choose
— each control writes its own key, `code_problems` names what is missing; the first declared Result
field creates a closed object schema (the author may open it); the timeout is typed in whole
seconds and stored in ms, the byte limits as bytes; the Runtime picker lists the store's profiles,
shows a stored id the store no longer lists as "(not on this machine)", probes on request and can
name a new Python (absolute executable only; the store probes before keeping); the canvas block,
expand button and read-only viewer are built and driven by `code_source_text`, which answers "not
here" for the file source the runtime stores today (G1), so the node shows the path until a text
source exists; the viewer runs through the Tooltip engine, whose bubbles sit at `Z.TOOLTIP` (the
engine's own layer, above `Z.POPOVER`; no hand-rolled layer); a press on the node closes the viewer
and ignores the engine until the button is released; zoom is read from the editor's viewport ref on
gesture end and after fit/reset (no FlowEditor API change); ports anchor at the header through a
new additive `port.anchor` honoured by both the drawn dot and the edge endpoint.

Changed existing behaviour: `result_roots_for("code")` is now knowable from the Result schema
(the #352 test's "its own source returns" expectation updated); `FieldRow` is exported from
`output_schema_section.js` for reuse; `native_step_ports("code")` carries `anchor: 27`.

Not done in this slice (reported, not patched): a "View code" row in the node context menu (the
native menu has no per-type rows yet); any Workflow-graph menu behaviour (G7); code text (G1).

### 4b. Review corrections (code-02)

R-357-01 a late `save_python_profile` reply selects the profile only while its request's intent is
still live (form open for that request, section mounted) and writes one key against the document as
it is then; Cancel, a newer request and unmount revoke it. R-357-02 On error copy, this plan and the
module comment now say stop/unknown with nothing published. R-357-03 the Result JSON view is the
author's choice: typing keeps the box, its text and focus; "Edit as fields" / "Edit as JSON" switch
explicitly; an externally replaced document remounts the section. R-357-04 a non-list `artifacts`
is shown raw with one "Remove artifacts" action that deletes the key; unreadable items inside a real
list are shown raw and removable alone; nothing is normalized on the way in.

### 4c. G1 source editing UI (code-g1-ui-01)

Baseline: frozen Code UI `3e19bcef` + the host's cumulative G1 patch
(`host-cumulative-from-411.patch`) = tree `ceef8c6b`; host contract
`docs/implementation/managed-code-interface-v2.md`; fixed pair sidecar `98e3cdc8…`, wheel
`a166988a…`, runtime manifest `sha256:f6daf389…a28101`. No new protocol, field or file route.

Design. The editor keeps the host's own representation: a Code node written here has
`source = {kind:"file", path:"__pupu_code__/sha256/<sha>.py"}` where `<sha>` is the SHA-256 of the
text's strict UTF-8, and the text sits in the session's table keyed by that digest
(`managed_code_sources.js`). The node carries its text identity through moves, reorders,
deletion, duplication, undo and embedded graphs; which node a text belongs to is computed only when
Save is built, from the node's typed position in the document being sent. Open, Save, conflict
re-read and preflight use only the v2 methods; no v1 fallback, no empty-string substitute.

**BC-357-004** renderer ⇄ Main ⇄ host managed-Code aggregate. Producer: host
`save_managed_draft` / `get_managed_resource` (real); consumers: Main `managed_code_transport`
(host's) and, independently, the UI's `admit_resource_aggregate`. Admission CLOSED on both sides:
exact five keys, schema tags, manifest rows `{node_path, sha256}` in canonical order at typed
addresses reaching a Code node whose source is exactly that digest's path, bodies sorted/unique and
re-hashed, and no owned Code node naming host-kept text the manifest does not bind; refusal is
`managed_source_protocol_error`. The edit is exactly `{schema, document, expected_edit_token
(null on create), managed_sources}` with the complete owned set (root + embedded, never
`agent_ref`). Identity/version: the host capability is rechecked by Main before every call; the UI
treats `content_digest` as opaque.

**SEQ-357-002** keyed by resource id + sitting (`open_id`): open → type → Save (CAS) → reopen;
type during an in-flight Save; switch resource with a read/save in flight; reopen the same id with
a save in flight; conflict → keep mine / take theirs; undo after typing; drill into embedded
(parent owns) and referenced (own resource) graphs; delete/reorder nodes; cold restart of the
sidecar between Save and reopen.

AC (evidence in `code-g1-ui-01`): AC-G1-01 real replies admitted and texts byte-identical
(`managed_code_sources.test.js`, 28 captured rows); AC-G1-02 tampered replies refused (23
mutations of a real reply); AC-G1-03 Save rows equal the producer's rows for every captured
success, after reorder and after deletion; AC-G1-04 referenced Agent never walked, its own Save
sends only its rows; AC-G1-05 missing text refused before sending; AC-G1-06 late read / old
sitting / typing during Save / conflict / undo (`use_skeleton_resource_g1.test.js`); AC-G1-07 real
controls on the page: edit, three-line preview, viewer, embedded and referenced drill, delete, CRLF
read-only, switch to a workspace file, new node, conflict, old host, tampered reply
(`skeleton_resource_page_code_g1.test.js`); AC-G1-08 the page's exact Save requests stored by the
real store and reopened byte-identical through the UI consumer, with stale-token and unbound-text
refusals (`replay_g1_store.py`, 7/7); AC-G1-09 the same on the fixed sidecar through the real Main
service and preload bridge, across a cold restart (`replay_g1_binary.py`); AC-G1-10 restore-red
mutations 12/12.

Cells NOT_RUN: desktop Electron app with the swapped sidecar (the replay drives the real Main and
preload modules against the binary, not the packaged app); a Code run's outcome (saving source is
not a run — runtime behaviour is the host checkpoint's); Explorer rename/duplicate/archive of a
managed resource and the legacy-pool conversion on one (v1 write paths the host refuses for managed
rows; not wired here); portable import/export.

### 4d. Workflow Call (workflow-call-01)

Baseline: frozen G1 candidate `ea74bf3c` (clone `pupu-357-wfc`). Measured first on the fixed wheel
and the host's v2 store (`workflow-call-01/out/wfc-store-capture.json`, frozen as
`recipes_page/workflow_call_capture.json`, 86 rows): `config` is CLOSED `{execution, workflow}`,
`workflow` CLOSED `{workflow_id, revision_id}` (missing / extra / empty → `missing_field` /
`unknown_field` / `invalid_value` at preflight; `on_error` → `unknown_field`); the store saves and its
draft check passes every shape; preflight checks only that the pinned revision exists and is a
Workflow (`resource_missing` otherwise) — **not** that the call's inputs or outputs match it. The
wheel's `run_workflow` fails the child at its Start with `missing_value` when a key its Start reads
is absent and ignores an extra key; the call then fails `child_<status>` (no error policy).
Publication through v2 is idempotent for an unchanged draft; a revision reads back byte-identical
after the draft changed and was published again; revisions are counted (`published_revisions`), not
listed; a managed Workflow's revision cannot be read through v1 (`source_api_required`); a managed
resource cannot be archived through v1 either (so "archived target" could not be produced on v2).

Design. A revision is read only through `getManagedSkeletonWorkflowVersion`, admitted whole by
`admit_version_aggregate` (six closed fields, Workflow kind, own id, sources by the G1 rules) and kept
in one window-wide table (`workflow_versions.js`) because a revision is immutable; the panel, the node
and the Output Variables read the same entry. A pin is written only as `{workflow_id, revision_id}`
after the revision has been read back: either "Publish its current draft and pin it" (reads the
Workflow through v2, publishes at its token, pins the revision the host answers) or a typed id that
is read first. The section takes the place of Input Variables: one row per key the pinned Start
reads (the Tool Call argument row, reused), rows it does not read kept and removable, missing keys
and outputs rooted outside the End's exports named as problems; the Output Variables pick from the
End's exports (closed). A late publication or read writes only for the request still awaited.

**BC-357-005** renderer ⇄ Main ⇄ host Workflow revision (v2 version aggregate) and publication.
Producer: host `get_managed_workflow_version` / `publish_managed_workflow` (real); consumers: Main
(`managed_code_transport`) and the UI's `admit_version_aggregate`, both CLOSED. **BC-357-006**
caller ⇄ callee interface: the call's resolved inputs become the child's run input (Start reads
`result` path roots), the End's exports become the call's result; not checked by preflight, so the
panel checks it from the pinned revision's own document.

**SEQ-357-003** keyed by caller resource + node id + pinned (workflow_id, revision_id): choose →
publish-and-pin or typed pin (read first) → fill inputs → export → Save (CAS) → reopen (revision
re-read) → cold restart of the sidecar; cells: unchanged publication, stale publication, unknown
revision, publication answering after the author changed Workflow, graph-only host.

AC: AC-WFC-01 captured revisions/publications admitted, 8 mutations refused; AC-WFC-02 interface from
the revision, rows/extras/order, problems for every preflight-blind mismatch
(`workflow_call_config.test.js`, 30); AC-WFC-03 real controls on the page: publish-and-pin, typed pin
and its refusal, extras removal, late publication, stale publication, palette seed, v1-only host
(`skeleton_resource_page_workflow_call.test.js`, 7); AC-WFC-04 the page's exact Saves stored by the
real store, reopened through the UI consumer, v2 preflight ok, and the call's inputs run against the
pinned revision in the wheel (3/3); AC-WFC-05 the same on the fixed sidecar through the real Main and
preload, across a cold restart; AC-WFC-06 restore-red mutations 10/10.

NOT_RUN / not built: running the parent graph end to end (Codex's execution checkpoint); the
read-only drill into the called Workflow's graph (the panel lists its interface instead); Workflow
authoring (G7) and therefore any Workflow-graph menu; an archived Workflow target on v2 (not
producible); a revision list (G4, no host route).

### 4e. Hooks Pool (hooks-pool-01)

Baseline: frozen Workflow Call candidate `a0ed1551` (clone `pupu-357-hooks`). Measured first on the
fixed wheel and the host's v2 store (`hooks-pool-01/out/hooks-store-capture.json`, frozen as
`recipes_page/hooks_pool_capture.json`): the store saves every pool shape and its draft check reports
only `pool_attachment_required`; preflight refuses one problem at a time — empty pool `missing_value`,
non-list `invalid_type`, pool/entry extra keys `unknown_field`, duplicate id in a pool
`duplicate_name`, order outside 0…1 000 000 `invalid_value` / non-integer or boolean `invalid_type`,
event `unknown_variant`, tool_name empty `invalid_value` / non-string `invalid_type`, force_approval
non-boolean `invalid_type`, workflow missing/extra fields, an unpublished revision `resource_missing`.
Every hook of every pool attached to one Kernel runs by (order, id). The hook Workflow's End exports
are the decision: before `{decision, require_approval[, arguments]}` or `{decision, reason}`; after
`{decision}` or `{decision, result}`; force_approval ORs into the requirement.

**Backend gaps reported, not worked around:** (H-1) the same hook id in two pools attached to one
Kernel passes v2 preflight but the run's admission (`SkeletonHookRuntime`) refuses it
`duplicate_name` before the model is called; (H-2) a pinned hook Workflow whose End exports are not a
decision passes preflight and admission and fails only when a matching tool call happens; (H-3, G6)
no on/off, name or failure policy exists. The panel says H-1 and H-2 from the document and the pinned
revision; it does not change what is stored.

Design. The section edits each field of each entry and writes only the key a control sets; a new
entry carries only a free id. Every stored value the runtime refuses is shown as stored with a fix:
the order/id boxes hold invalid text without writing, extra keys are listed with Remove, a non-object
entry is listed with Remove, a non-list is replaced only by "Start a new list". The Workflow pin is
the accepted pin behaviour (v2 reads with identity checks, publish-and-pin or a typed id read back,
late answers revoked) as a shared `WorkflowPinControl`. The run order across attached pools, the
event's inputs and the accepted decisions are shown; the pinned End's exports are checked against
them. Hooks Pool is addable (seed `{hooks: []}`) and attachable to an Agent (`attach_top/attach_bot`).

**BC-357-007** renderer ⇄ Main ⇄ host Hooks Pool config in the v2 resource aggregate (CLOSED, mirrored
by `hooks_pool_config`) and hook Workflow revisions (BC-357-005). **SEQ-357-004** keyed by Agent +
pool + entry position: add → configure each field → pin (publish or typed) → Save (CAS) → reopen →
cold restart; cells: invalid order text held, extra key removed, non-object entry removed, non-list
replaced, late publication, scope-duplicate and decision-shape warnings, unattached pool.

AC: AC-HP-01 every captured preflight refusal named by the panel, nothing for the complete pool
(`hooks_pool_config.test.js`, 25); AC-HP-02 run order and decision shapes equal the wheel's;
AC-HP-03 real controls (`skeleton_resource_page_hooks_pool.test.js`, 8); AC-HP-04 page Saves stored,
reopened through the UI consumer, v2 preflight and the run's Hook admission pass, each pinned hook
Workflow run in the wheel and its decision applied (3/3); AC-HP-05 fixed sidecar via real Main +
preload across a cold restart; AC-HP-06 restore-red mutations 8/8.

NOT_RUN: a Kernel run with real tool calls passing through the hooks (Codex's execution checkpoint);
hook approval waits/resume; attach by dragging on the real canvas (covered by the attach command);
desktop app.

## 5. Delegation assessment

Slice 1: **not suitable** for a weaker model — the contract gaps above require judgement at every
control and two BUILTIN changes. Slices 2–3 are reassessed after slice 1's review.

## 6. Checkpoints

After each slice: receipt (`receipt.json`: candidate tree, patch SHA, file list, red→green logs,
mutation results, targeted + full-frontend results with baseline failures attributed, graph analysis,
NOT_RUN list), `candidate.patch` vs `4117670f`, tracked/untracked lists, `heavy-jobs.md`, an English
comment on #357 with the `release-start-ticket:v1` marker. Stop and wait for review.
