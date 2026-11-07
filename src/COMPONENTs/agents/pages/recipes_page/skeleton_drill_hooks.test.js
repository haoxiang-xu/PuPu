import capture from "../../../../SERVICEs/managed_hook_source_capture.json";
import {
  drill_layout_key,
  drill_lost_reason,
  drill_step,
  embedded_document,
  embedded_path,
  embedded_step_indices,
  hook_drill_target,
  hook_entry_for,
  HOOK_MEMBER,
  with_embedded_document,
} from "./skeleton_drill";

/* A hook's own Workflow as a drill step (#357), on the real combined
 * producer's documents (managed_hook_source_capture.json). */

const copy = (value) => JSON.parse(JSON.stringify(value));
const documentOf = (name) => copy(capture.cases.find((item) => item.name === name).saved.resource.document);
const POOL = 3;
const stepFor = (document, revision = 1) => {
  const clicked = { node_id: "hooks", entry_id: "policy", entry_index: 0, taken_in: revision, member: HOOK_MEMBER };
  const found = hook_entry_for(document, clicked, revision);
  return drill_step({ node_id: "hooks", entry_id: "policy", found, revision, member: HOOK_MEMBER });
};
const sibling = (document, id) => ({ ...copy(document.nodes[POOL].config.hooks[0]), id, order: 7, workflow: { kind: "embedded", document: { ...copy(document.nodes[POOL].config.hooks[0].workflow.document), id: `${id}-wf` } } });

test("a hook step resolves to its own Workflow at the host's address", () => {
  const document = documentOf("owned-hook");
  const step = stepFor(document);
  expect(step.member).toBe(HOOK_MEMBER);
  expect(embedded_path(document, [step], 1)).toEqual(["document", "nodes", POOL, "config", "hooks", 0, "workflow", "document"]);
  expect(embedded_document(document, [step], 1)).toBe(document.nodes[POOL].config.hooks[0].workflow.document);
  expect(hook_drill_target(document.nodes[POOL].config.hooks[0]).kind).toBe("embedded");
});

test("writing the graph back changes only that hook's Workflow", () => {
  const document = documentOf("owned-hook");
  document.nodes[POOL].config.hooks.push(sibling(document, "other"));
  const step = stepFor(document);
  const child = { ...embedded_document(document, [step], 1), name: "Edited" };
  const next = with_embedded_document(document, [step], child, 1);
  expect(next.nodes[POOL].config.hooks[0].workflow.document.name).toBe("Edited");
  expect(next.nodes[POOL].config.hooks[1]).toBe(document.nodes[POOL].config.hooks[1]);
  expect({ ...next.nodes[POOL].config.hooks[0], workflow: null }).toEqual({ ...document.nodes[POOL].config.hooks[0], workflow: null });
  const others = (doc) => doc.nodes.filter((_node, index) => index !== POOL);
  others(next).forEach((node, at) => expect(node).toBe(others(document)[at]));
});

test("the step follows its hook by id through a reorder of the list, in a version written elsewhere", () => {
  const document = documentOf("owned-hook");
  document.nodes[POOL].config.hooks.push(sibling(document, "other"));
  const step = stepFor(document, 1);
  const reordered = copy(document);
  reordered.nodes[POOL].config.hooks.reverse();
  expect(embedded_step_indices(reordered, step, 2).entry_index).toBe(1);
  expect(embedded_document(reordered, [step], 2).id).toBe("owned-hook");
  expect(drill_layout_key("r", reordered, [step], 2)).toBe(drill_layout_key("r", document, [step], 1));
});

test("a removed hook, or one now pinned, closes the drill with the hook's own words", () => {
  const document = documentOf("owned-hook");
  const step = stepFor(document);
  const removed = copy(document);
  removed.nodes[POOL].config.hooks = [];
  expect(embedded_document(removed, [step], 1)).toBeNull();
  expect(drill_lost_reason(removed, [step], 1)).toBe("That hook's Workflow is no longer in this pool, so it was closed.");
  const pinned = copy(document);
  pinned.nodes[POOL].config.hooks[0].workflow = { workflow_id: "wf", revision_id: "rev-1" };
  expect(embedded_step_indices(pinned, step, 1)).toBeNull();
  expect(hook_drill_target(pinned.nodes[POOL].config.hooks[0]).kind).toBe("unreadable");
});

test("inside two embedded Agents, the hook steps reach their own sibling's Workflow", () => {
  const document = documentOf("nested");
  const childStep = (j) => ({ node_id: "children", entry_id: ["one", "two"][j], entry_index: j, ambiguous: false, graph_id: null, graph_unique: false, taken_in: 1 });
  [0, 1].forEach((j) => {
    const child = embedded_document(document, [childStep(j)], 1);
    const hook = stepFor(child);
    expect(embedded_path(document, [childStep(j), hook], 1)).toEqual(["document", "nodes", 4, "config", "subagents", j, "source", "document", "nodes", 3, "config", "hooks", 0, "workflow", "document"]);
  });
});

test("a Subagent step keeps its shape: no member key is added", () => {
  const document = documentOf("nested");
  const found = { index: 0, entry: document.nodes[4].config.subagents[0], ambiguous: false, graph_unique: true };
  expect(Object.keys(drill_step({ node_id: "children", entry_id: "one", found, revision: 1 })).sort())
    .toEqual(["ambiguous", "entry_id", "entry_index", "graph_id", "graph_unique", "node_id", "taken_in"]);
});
