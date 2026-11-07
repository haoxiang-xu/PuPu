# #341 — native node details, drill-in and Rename delivery

Ticket: https://github.com/haoxiang-xu/PuPu/issues/341

## Scope and workspaces

The owner requests implementation, bounded acceptance, normal merge to `dev`,
and closure of #341. Do not reopen #351/#352/#356/#357/#358 or expand their
acceptance matrices. Rename is explicitly retained here from #358.

- PuPu: `/Users/red/Desktop/GITRepo/pupu-341`, `codex/ticket-341-close`,
  base `3fdb84f17fed1fcc3fe9aa2db526f2c9586f5679`.
- Core: `/Users/red/Desktop/GITRepo/unchain-341`, `codex/ticket-341-node-label`,
  base `657d64df8493c503ac3c64e1ebe45be06af2dcb8`.
- Original repositories and prior immutable evidence are read-only.
- Product verification is offline; no real provider/API, local Main launch,
  Chromium sandbox changes or QA-guard changes. Local heavy jobs are serial.
- The owner selected existing components/styles for all Rename surfaces; no
  design alternatives are requested.

## Findings and decisions

Current native nodes are CLOSED `{id,type,config}` in both the builder mirror
and the SHA-verified deployed Core wheel `2f129616…`. `config` is not a common
extension seam: most executable node configurations are separately CLOSED.
Local layout storage contains coordinates/viewport only and cannot carry a
portable authored name. A frontend-only label or a node-ID rewrite is invalid.

Add optional **`label`** to the common node envelope. It is display metadata:
`id`, edges, references, input bindings, managed-source ownership and execution
semantics are unchanged. Absence keeps the existing type-specific title. A
present label must be a nonblank string; preserve accepted text exactly without
trimming or normalization. Use the same Python whitespace predicate on the JS
side, including the U+0085/U+FEFF distinction. Unknown fields remain refused.

Advertise `node_display_label_v1` in `skeleton_execution` minor **8**, retaining
the existing major and existing features. Reuse the existing v2 capabilities
response's actual `runtime_manifest`; no new route or inferred Git/version
capability is needed. Older runtimes remain usable for existing definitions;
Rename is unavailable unless the actual capability is established. Imported
or stored bad values remain visible as diagnostics and are never coerced into
a plausible title or silently normalized.

The native canvas menu and F2 open the existing-style name editor. Only explicit
confirmation changes the current node's label through the existing immutable
graph-command/history path. Opening, cancelling, unchanged confirmation and
stale ownership do not write or dirty the document. Rename does not save the
resource automatically. The explicit resource Save uses the existing v2 edit
token, complete managed-source aggregate and correct owner under drill-in.

## Boundary and sequence contracts

**BC-341-02 — portable node display metadata.** Producer: native graph edit and
v2 Save/export. Consumer: Core common schema, resource storage, frozen graph
definition, import and renderer projection. Common node object is CLOSED with
required `id,type,config`, optional `label`; the label is a nonblank string.
Capability transport is the existing CLOSED v2 capability envelope containing
the independently checked, actual imported runtime manifest. A missing feature,
bad type, blank label, unknown node field, wrong version or invalid manifest
never licenses a write. No legacy/v1 save fallback.

Identity is resource ID + current graph ownership address + stable node ID.
Node label never becomes a tool name, binding key, managed-source address,
execution/attempt ID or resource ID. Acceptance binds the actual PuPu candidate,
one rebuilt-and-reused Core wheel SHA and imported manifest digest. Source
revision is provenance, not compatibility admission.

**SEQ-341-02 — Rename and save.** Open/select node → invoke Rename → edit text
→ explicit confirm → one dirty/history change → explicit Save with original
token → cold read of the same label. Cancel/same value writes nothing. Undo and
redo alter only the label. Switching graphs invalidates the open editor. A stale
save retains the existing typed 409 and explicit conflict choices; no retry or
overwrite. Referenced children save their own resource; embedded children save
their owner, with other managed sources intact. A run already started/parked
retains its frozen A definition after the resource is saved as B; the next
launch reads B. Label-free historical definitions remain compatible.

### Acceptance additions for Rename

- AC-341-R1: actual Core schema accepts a valid label, preserves its exact text,
  keeps label-free definitions valid, rejects bad/blank labels and unknown keys.
- AC-341-R2: typed v2 save/read/export/import preserves labels and all IDs,
  references and owned sources; rejected writes leave storage unchanged.
- AC-341-R3: actual capability, not an environment or source-ref guess, enables
  the control. Old/missing/malformed capability cannot enable Rename.
- AC-341-R4: menu/F2, explicit confirm/cancel, no-op, undo/redo, graph ownership
  and cold reopen behave as specified using existing UI primitives.
- AC-341-R5: all native title consumers display the same valid name; malformed
  stored values do not crash or masquerade as recognized metadata.
- AC-341-R6: resource CAS and frozen A/new B definitions retain their existing
  isolation. Repeat the changed cells only, using actual deployed artifacts.

## Original acceptance mapping

The nine original ACs remain required. Prior evidence is indexed externally at
`ticket-341-start-20261106/prior-evidence-map.json`; it is a map, not a current
PASS. Strong-model checkpoint `ticket-341-close-20261106/acceptance-plan-checkpoint-1.json`
identifies these concrete remaining cells:

1. Shared shell: current light/dark at 300px and 50% needs targeted visual proof.
2. Native Start: implement the promised caller-context read-only display; do
   not substitute legacy Start tests or invent a universal input schema.
3–4. The owner explicitly aligned the old reject-on-load/save wording with the
   existing repairable-draft contract on 2026-11-07. Exact old-wheel v2 Store
   evidence: missing `missing` and invalid output kind save/read with diagnostic
   paths and fail preflight/publication; dynamic absent values fail evaluation;
   the positive control passes all stages. See `draft-contract-old-pair.json`
   and issue comment 6703472640. No change to Store behavior is required.
5–9. Reconcile current code and delivered evidence for IO, structured output,
   eligibility, legacy conversion, drill ownership/CAS and old snapshots. Add
   only missing or changed cells, not the complete #356 runtime suite.

## Impact and implementation checkpoints

Core `validate_skeleton_document` upstream impact is **HIGH**: direct callers
include legacy conversion/materialization and draft/execution diagnosis;
workflow preparation/execution/recovery are downstream. The user was warned
before edits. This does not waive risk. Core index is current at this base,
but flow-budget omissions remain lower bounds. Record impact for every other
changed existing symbol and corroborate UNKNOWN with exact searches.

Weaker-model suitability is **partial**. The resolved Core schema/manifest
slice is suitable: precise field shape, no new runtime behavior, bounded files
and observable old/new validation tests. UI implementation is suitable only
after capability plumbing, title consumers and caller-context facts are mapped.
Unresolved schema, ownership, admission and acceptance decisions stay with Root.

1. **CP1, Core producer only**: source tests red before changing validation,
   minimal common optional-label validation + protocol feature, schema/protocol
   tests green and a source diff. No Host/UI edits or build/commit until review.
2. **CP2, model/UI development**: first the mirror and atomic rename command,
   then existing UI components/capability gate/Start context with focused tests.
   Source-based producer captures are development evidence only. Do not build
   an extra local wheel: the final candidate's required CI will produce the one
   canonical wheel, retained and reused for subsequent acceptance.
3. **CP3, fixed-pair acceptance**: install that canonical wheel, replay actual
   UI-produced requests through Store/v2, then execute the changed isolated
   hosted App/state/visual cells with the same wheel and imported manifest.
4. **CP4, acceptance/delivery**: exact candidate audit, necessary deterministic
   CI and isolated hosted App cells; normal merge and readback; only #341 closes.

Worker: `gpt-6.1-sol` for the next explicitly released bounded slice; Root owns
planning/integration and `gpt-6-astra` independently reviews checkpoints and the
final candidate. No worker may authorize its own continuation. Unknowns or
scope changes stop dependent edits, not unrelated authorized work.

### CP2a — released model slice

Only `skeleton_document.js`, `skeleton_graph_commands.js`, new
`node_display_labels.js` and their direct tests are released for this step.
Keep `NODE_KEYS` as the three required keys; add the optional key separately.
The drawing copies only a valid label, while the mirror diagnoses invalid
types/blanks. Add CLOSED command `{type:"rename_node",node_id,label}` to the
existing command router: exactly one matching node, only its label changes;
same-label returns the original graph; no matching/ambiguous ID or bad command
returns the original graph with a precise problem. It may repair an invalid
target label without normalizing any other stored field. No UI/capability/history
wiring or other graph-edit behavior is released yet.

### Native Start context

Use an editor-memory-only `startContext` descriptor, never a document field or
an invented `input_schema`. A library edit with no identified caller displays
a locked whole-caller-object description and explicitly says the caller defines
the fields. It must not invent a key named `input` or assume Chat.

When opened from a Subagent Pool, derive read-only text field names from the
current child's Start output **names**, matching Host
`SkeletonAgentRuntime._child_inputs`; do not use their source paths or invent
task/context fields. Only a genuinely Chat-originated editor may show
message/images/files. A standalone Workflow has no identified caller here and
must not invent a declared input schema that its runtime document does not have.
Unknown hooks/other callers remain explicit unknowns. Invalid/duplicate names
are shown as an indeterminate/bad definition, not filtered into a plausible list.
Derive the descriptor from the current navigation: only a step without a
`member` is a Subagent; hooks and unknown members remain unknown. With no
embedded steps, a final RESOURCE frame identifies a referenced Subagent, since
all current resource drill entries are opened by `open_subagent`. No new state
or frame fields are needed. Returning or replacing ownership recomputes the
description from the graph on screen. Subagent fields recompute after editing
child outputs. Pinned Workflow canvases have no DetailPanel and this ticket
does not add a new panel surface there.
The existing shared IO section renders these rows with the builtin lock icon,
no Add/Rename/Delete and no write callback. Other node IO is unchanged.

### Completed CP1

Core commit `97bd3e30d7e4bc837604812c9da836db53cd4f8f`, tree
`6d869c81ffccd34a6b40568407f595b735dc69ce`, PR
https://github.com/haoxiang-xu/unchain/pull/77. New tests on the base: 19 failed,
1 passed; final five schema/validation/protocol files: 92 passed, no skips.
Independent strong review accepts the four-file producer slice. Refreshed raw
GitNexus detect-changes covers 4 files / 14 symbols / 3 process groups with no
partial/truncated result. The original upstream HIGH risk remains documented.

The required full CI found one retained-feature test still pinned to minor 7
and 21 features. Commit `7557015eb10148f4ecec1f3b079eeb2589b6b14b` updates its
exact version/count and adds the label feature assertion without removing its
native-observation or sorted-unique assertions; 37 focused tests pass. Full CI
on that commit: 7628 passed, 17 skipped, 5 xfailed. PR77 merged normally into
Core `dev` as `2e455628b454ce225dd8e813e0ae33a85e56450a`, tree
`3b9cec81606e00bbc76246f9e901615ae778c12e`, exactly the tested source tree.
PuPu's five release-QA source-ref defaults now pin that immutable merge.

### Completed model and Start development checks

CP2a: the six-file pure-model slice passes independent strong review;
134 focused and 83 direct-caller tests pass. The new title helper never coerces
malformed metadata, and the atomic command only changes the selected label.

CP2c: Start caller description, page/drill ownership and variable-picker titles
pass eight explicit suites / 141 tests and independent strong review. This is
development evidence only. Three obsolete baseline assertions were intentionally
updated while retaining malformed-value and identity protections. The first
test invocation also named a nonexistent regression file; that failure is kept
as an invocation error, not a product failure. Details and exact file hashes:
`~/.codex/artifacts/ticket-341-close-20261106/start-cp2c/summary.json`.
