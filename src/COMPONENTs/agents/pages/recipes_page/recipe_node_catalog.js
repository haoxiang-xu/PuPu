import { TOOLKIT_POOL_TYPE, normalize_node_type } from "./recipe_graph";

/* One description per addable node type, in one place.
 *
 * Before this existed the same set was spelled out three times — the port sets
 * in `ports_for`, the creation defaults in `add_node`, and the labels in the
 * context menu — and the node palette would have been a fourth. They are read
 * from here now, so the palette cannot offer a node that creation does not know
 * how to build. */

const WORKFLOW_PORTS = [
  { id: "in", side: "left", kind: "in" },
  { id: "out", side: "right", kind: "out" },
  { id: "attach_top", side: "top", kind: "attach" },
  { id: "attach_bot", side: "bottom", kind: "attach" },
];
const START_PORTS = [{ id: "out", side: "right", kind: "out" }];
const END_PORTS = [{ id: "in", side: "left", kind: "in" }];
const PLUGIN_PORTS = [
  { id: "attach_top", side: "top", kind: "attach" },
  { id: "attach_bot", side: "bottom", kind: "attach" },
];

/* Groups the palette renders in this order. */
export const NODE_GROUPS = ["steps", "attachments"];

export const NODE_GROUP_LABELS = {
  steps: "Steps",
  attachments: "Attachments",
};

/* Each group carries its own glyph so the palette reads at a glance: a route
 * for the things that move the flow along, a puzzle piece for the things that
 * hang off a node. */
export const NODE_GROUP_ICONS = {
  steps: "route",
  attachments: "puzzle_2",
};

/* `graph_kinds` says which kinds of graph may contain the node. A recipe has no
 * graph kind yet, so everything reads as an Agent graph today; the moment one
 * exists the palette filters without further change. */
const AGENT_ONLY = ["agent"];
/* Node types that suit both graph kinds — Skill Read, Workflow Call, the
 * branches — declare ["agent", "workflow"] when they arrive. */

const ENTRIES = [
  {
    type: "agent",
    label: "Agent",
    description: "A model loop with its tools and memory",
    group: "steps",
    icon: "bot",
    id_prefix: "agent",
    ports: WORKFLOW_PORTS,
    graph_kinds: AGENT_ONLY,
    fallback_position: { x: 400, y: 300 },
    defaults: ({ id, x, y }) => ({
      id,
      type: "agent",
      kind: "workflow",
      deletable: true,
      override: { model: "", prompt: "" },
      outputs: [{ name: "output", type: "string" }],
      x,
      y,
    }),
  },
  {
    type: TOOLKIT_POOL_TYPE,
    label: "Toolkit Pool",
    description: "The tools an agent node may call",
    group: "attachments",
    icon: "tool",
    id_prefix: "tp",
    ports: PLUGIN_PORTS,
    graph_kinds: AGENT_ONLY,
    fallback_position: { x: 400, y: 100 },
    defaults: ({ id, x, y }) => ({
      id,
      type: TOOLKIT_POOL_TYPE,
      kind: "plugin",
      deletable: true,
      toolkits: [],
      merge_with_user_selected: false,
      x,
      y,
    }),
  },
  {
    type: "subagent_pool",
    label: "Subagent Pool",
    description: "Agents this one may delegate to",
    group: "attachments",
    icon: "shapes",
    id_prefix: "sp",
    ports: PLUGIN_PORTS,
    graph_kinds: AGENT_ONLY,
    fallback_position: { x: 400, y: 500 },
    defaults: ({ id, x, y }) => ({
      id,
      type: "subagent_pool",
      kind: "plugin",
      deletable: true,
      subagents: [],
      x,
      y,
    }),
  },
];

/* Start and End are not addable — a graph has exactly one of each and they
 * arrive with it — but their ports still come from here so there is only one
 * place that knows what a node's ports are. */
const FIXED_PORTS = {
  start: START_PORTS,
  end: END_PORTS,
};

const BY_TYPE = new Map(ENTRIES.map((entry) => [entry.type, entry]));

export function catalog_entry(node_type) {
  return BY_TYPE.get(normalize_node_type(node_type)) || null;
}

export function ports_for_type(node_type) {
  const type = normalize_node_type(node_type);
  if (FIXED_PORTS[type]) return FIXED_PORTS[type];
  const entry = BY_TYPE.get(type);
  return entry ? entry.ports : [];
}

export function addable_nodes(graph_kind = "agent") {
  const kind = graph_kind || "agent";
  return ENTRIES.filter((entry) => entry.graph_kinds.includes(kind));
}

/* Types this graph kind forbids, so an empty palette can say why instead of
 * rendering an empty box. */
export function excluded_nodes(graph_kind = "agent") {
  const kind = graph_kind || "agent";
  return ENTRIES.filter((entry) => !entry.graph_kinds.includes(kind));
}

export function build_node(node_type, { id, x, y }) {
  const entry = catalog_entry(node_type);
  if (!entry) return null;
  const position = entry.fallback_position;
  return entry.defaults({
    id,
    x: Number.isFinite(x) ? Math.round(x) : position.x,
    y: Number.isFinite(y) ? Math.round(y) : position.y,
  });
}

export function next_node_id(node_type, existing_ids) {
  const entry = catalog_entry(node_type);
  const prefix = entry ? entry.id_prefix : "node";
  let i = 1;
  while (existing_ids.has(`${prefix}_${i}`)) i += 1;
  return `${prefix}_${i}`;
}

/* Substring match over the label, the type and the description, so "python" or
 * "delegate" finds something even when the label does not contain it. */
export function search_nodes(query, graph_kind = "agent") {
  const entries = addable_nodes(graph_kind);
  const q = (query || "").trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) =>
    `${entry.label} ${entry.type} ${entry.description}`.toLowerCase().includes(q),
  );
}
