# #357 Hooks Pool: a hook's own Workflow — UI slice

Base: UI candidate dfe32949, which contains the combined producer c5c01351. Contract: hooks-embedded-producer-01 `producer-contract.json`. This slice adds no route, IPC, wire field, publication or automatic save.

## Behaviour

**Source choice.** The host is asked first (`getSkeletonHookWorkflowCapabilities`).
- An older host, or one that does not answer, gets no offer.
- A Workflow already stored on such a host is reported ("not confirmed"); it is not opened.

**Writes happen only on an explicit choice.**
- Choosing "Its own Workflow" writes `{kind: "embedded", document: <Start→End Workflow>}` in place of the pin, and Undo restores the pin.
- The seed id is `<hook id>-workflow`, never the Agent's own id.
- Choosing "A pinned Workflow" only shows the pin control. Pinning is what writes the reference.

**Editing.** "Open its Workflow" is the existing embedded drill, with a step tagged `member: "hooks"`.
- The canvas is the Workflow canvas.
- Edits go into the live session and are saved with the Agent.
- The breadcrumb names the Hooks Pool.
- Esc goes back.

**Code text.** The text uses the parent's existing v2 source ownership at its full typed address (`…config.hooks[j].workflow.document.nodes[k]`), through c5c01351's `owned_code_nodes` / `code_node_at`.

**"Save as a Workflow…".** This is an explicit copy into the library.
- It goes through the existing `saveManagedSkeletonResource`, with a `null` token, as a new draft resource under an id the author types.
- The copy's Code text travels at the copy's own addresses.
- It is not published, and the hook keeps its own copy.
- An id the library already has is refused by the store (`edit_conflict`), and nothing is replaced.

**Unchanged.** Pinned reference, on/off, ordering, tool sets and the import/rebind dialog. The pinned path of `hook_entry_problems` is untouched apart from where the shape is read from.

## Drill

`skeleton_drill` now knows two embedded containers:
- `subagent_pool/subagents/source/document`;
- `hooks_pool/hooks/workflow/document`.

A step without `member` is a Subagent step, as before. Its shape, key, path and write-back are unchanged, and the existing drill suites are green.

A hook step is identified by the same id rule (`pool_entry_index`). It follows its hook through a reordered list, and it closes, with its own words, when the hook is removed or re-pinned.

## Impact (pre-edit, copied Oct 27 index)

HIGH: `embedded_step_indices`, `embedded_document`, `drill_layout_key`, `pool_entry_index`, `drill_step`, `embedded_graph_id`. These are not waived; the Subagent paths are guarded by regression.

LOW: `embedded_path`, `with_embedded_document`, `drill_lost_reason`, `frame_for_embedded_step`, `hook_entry_problems`.

## Tests

**New:** `skeleton_resource_page_hook_embedded.test.js` (7) and `recipes_page/skeleton_drill_hooks.test.js` (6). They run on the real combined producer captures (`managed_hook_source_capture.json`), the real capability reply and the real pinned capture. They cover:
- drill, edit, Save and reopen;
- two embedded Agents with the same hook step id (sibling isolation);
- disable, order write and removal (text retained, then dropped);
- explicit seed from a pin;
- an older host;
- Save as a Workflow, including a refused id;
- hook-step identity through a reorder and a removal;
- the Subagent step shape staying unchanged.

**Results:** red on the base source: 11 failed, 2 controls passed. Green: 21 suites, 566 tests, including drill, Hooks, G1, import, Workflow authoring and Workflow Call.

## NOT_RUN

- Real Store replay of these exact Save requests on the combined pair.
- Desktop and visual checks.
- Execution of an edited own Workflow.
- Import of Hook-owned Code through this dialog combined with this slice.
- Full frontend suite, build, index rebuild, and `detect-changes` (no HEAD).
