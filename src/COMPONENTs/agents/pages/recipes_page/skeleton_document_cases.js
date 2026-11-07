/* Skeleton documents the builder may compose, as one case set both sides can be
 * checked against.
 *
 * Verified against `unchain.skeleton.validate_skeleton_document` on 2026-10-03.
 * That run used an unpinned working tree, so it is evidence of agreement on
 * that day, not the paired contract test. */

const flow = (id, from, to) => ({
  id,
  kind: "flow",
  source_node_id: from,
  source_port_id: "out",
  target_node_id: to,
  target_port_id: "in",
});

const base = (overrides) => ({
  schema_version: 1,
  kind: "agent",
  id: "reviewer",
  name: "Reviewer",
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "a1", type: "agent", config: {} },
    { id: "end", type: "end", config: {} },
  ],
  edges: [flow("e1", "start", "a1"), flow("e2", "a1", "end")],
  ...overrides,
});

export const SKELETON_DOCUMENT_CASES = Object.freeze([
  { label: "a minimal agent graph", accepted: true, doc: base() },
  {
    label: "a description is optional",
    accepted: true,
    doc: base({ description: "reviews things" }),
  },
  {
    label: "a node carrying its IO in config",
    accepted: true,
    /* The schema layer does not look inside config, so bindings and mappings
     * ride along untouched — they are checked a layer down. */
    doc: base({
      nodes: [
        { id: "start", type: "start", config: { outputs: [{ name: "text", source: { kind: "result", path: ["text"] } }] } },
        {
          id: "a1",
          type: "agent",
          config: {
            inputs: [
              {
                name: "topic",
                value: { kind: "ref", node_id: "start", path: ["text"] },
                missing: "error",
              },
            ],
            outputs: [{ name: "answer", source: { kind: "result", path: ["message"] } }],
          },
        },
        { id: "end", type: "end", config: {} },
      ],
    }),
  },
  {
    label: "a workflow of non-LLM nodes",
    accepted: true,
    doc: base({
      kind: "workflow",
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "c1", type: "code", config: {} },
        { id: "end", type: "end", config: {} },
      ],
      edges: [flow("e1", "start", "c1"), flow("e2", "c1", "end")],
    }),
  },

  { label: "an unknown root field", accepted: false, doc: base({ owner: "me" }) },
  { label: "a schema version this build did not write", accepted: false, doc: base({ schema_version: 2 }) },
  { label: "a kind that is neither", accepted: false, doc: base({ kind: "hook" }) },
  { label: "an empty id", accepted: false, doc: base({ id: "" }) },
  {
    label: "two nodes claiming one id",
    accepted: false,
    doc: base({
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "start", type: "agent", config: {} },
        { id: "end", type: "end", config: {} },
      ],
    }),
  },
  {
    label: "a node type the runtime does not know",
    accepted: false,
    doc: base({
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "a1", type: "llm", config: {} },
        { id: "end", type: "end", config: {} },
      ],
    }),
  },
  {
    label: "an Agent node inside a Workflow",
    accepted: false,
    /* A Workflow is strictly non-LLM: the Kernel Loop and the pools are
     * forbidden outright, not merely discouraged. */
    doc: base({ kind: "workflow" }),
  },
  {
    label: "a node whose config is not an object",
    accepted: false,
    doc: base({
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "a1", type: "agent", config: null },
        { id: "end", type: "end", config: {} },
      ],
    }),
  },
  {
    label: "an edge pointing at a node that is not there",
    accepted: false,
    doc: base({ edges: [flow("e1", "start", "ghost")] }),
  },
  {
    label: "an edge kind that is neither flow nor attach",
    accepted: false,
    doc: base({ edges: [{ ...flow("e1", "start", "a1"), kind: "data" }] }),
  },
  {
    label: "two edges claiming one id",
    accepted: false,
    doc: base({ edges: [flow("e1", "start", "a1"), flow("e1", "a1", "end")] }),
  },
  {
    label: "an unknown field on a node",
    accepted: false,
    doc: base({
      nodes: [
        { id: "start", type: "start", config: {}, x: 10 },
        { id: "a1", type: "agent", config: {} },
        { id: "end", type: "end", config: {} },
      ],
    }),
  },
]);
