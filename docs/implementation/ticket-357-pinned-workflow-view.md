# #357 Workflow Call: opening the pinned revision read-only

Base: accepted host candidate tree 99f40921 (frozen UI 5f5b5af2 plus the bytecode launch fix). This is a renderer-only slice: no producer, capability, route, wire or source-closure change.

## Scope

A Workflow Call with a valid pin offers "Open the pinned graph (read-only)".

The view shows exactly the pinned `{workflow_id, revision_id}`. It never reads the Workflow's draft or a latest revision, and it never publishes or writes the callee.

The whole graph is read-only:
- there is no command handler, palette, context menu, detail panel, Save, Undo or Run;
- keyboard undo and redo are ignored while the view is open.

Going back, by Escape or the breadcrumb, leaves the editor exactly as it was:
- the session (unsaved document, Code text and history) is never touched;
- the drill steps and frames are kept;
- the selected node and its panel stay mounted;
- the editor's viewport is not overwritten, because the view keeps its drawing under its own key.

Out of scope: an embedded Hook Workflow (that producer work is owned elsewhere), import-time profile rebinding, and visual or theme checks.

## Boundary

BC-357-005 is reused unchanged: the renderer → Main → host v2 version aggregate is consumed through the same bridge method `getManagedSkeletonWorkflowVersion` and the same closed `admit_version_aggregate`. The answer must name the asked workflow and revision, or it is refused (`identity_mismatch`).

`read_workflow_revision_view` is a new reader. It keeps the aggregate's admitted Code text beside the version, because a host-kept Code node in the revision is drawn from it.

The existing `read_workflow_version` and `admitted_version` are not modified: impact on the 10/27 index copy rated both CRITICAL, so neither was edited. The shared revision table is not changed.

## SEQ-357-PV-001

Identity: page navigation counter + session `open_id` + drill steps + the node's current pin.

| Step | Expected |
|---|---|
| open A | Exactly one revision read for A. |
| A answers after the node was re-pinned to B | Nothing opens; the notice says the pin changed. |
| two opens in flight | Only the last may show; an earlier answer arriving later is dropped silently. |
| read refused | A notice is shown, nothing opens, and the editor is unchanged. |
| back | The unsaved edit, panel, selection and viewport are kept. A later Save writes only the author's edit and the unchanged pin. |
| switch pin, then open | The new revision is read and shown. |
| another resource or another document version taken | The view closes. |

## AC

- AC-PV-01: opening reads only `(workflow_id, revision_id)`. There is no `get` of the callee, no publish and no save.
- AC-PV-02: the view is read-only (negative: no palette, no control center, pressing a node opens no editor).
- AC-PV-03: back preserves the unsaved edit, the open panel, the selection and the stored editor viewport. Save afterwards carries the edit and the unchanged pin.
- AC-PV-04: a late answer for a superseded pin opens nothing; of two in-flight opens, only the last may show.
- AC-PV-05: a refused read opens nothing and says why.
- AC-PV-06: a revision with host-kept Code text draws that text from its own aggregate.

All six are covered by `skeleton_resource_page_workflow_pinned_view.test.js`, which has **not been run yet**.

AC-PV-06 uses a version aggregate re-wrapped from the real G1 resource capture. A real producer capture of a published managed-source Workflow revision is NOT_RUN, as is a desktop run.
