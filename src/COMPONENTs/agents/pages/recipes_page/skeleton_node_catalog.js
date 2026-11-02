import { addable_nodes } from "./recipe_node_catalog";
import { ADDABLE_NODE_TYPES } from "./skeleton_graph_edits";

/* What the native canvas's Add node… palette offers.
 *
 * The legacy recipe catalog describes the node types the legacy canvas can
 * build, and stays exactly as it is: a recipe cannot run a branch, so adding
 * If / Else there would offer something its runtime refuses. The native canvas
 * reuses those entries for the types both share, adds the two branch steps
 * (#351, icons per contract plan §8.12), and offers nothing the native core
 * cannot add — creation itself stays with `skeleton_graph_edits`. */

const BRANCH_ENTRIES = [
  {
    type: "if_else",
    label: "If / Else",
    description: "Take one of two paths, chosen by a condition",
    group: "steps",
    icon: "branch",
  },
  {
    type: "switch_case",
    label: "Switch / Case",
    description: "Take the path whose case matches a value",
    group: "steps",
    icon: "switch_case",
  },
];

/* The deterministic steps (#352): ordinary flow nodes that call no model.
   Icons per contract plan §8.12 (Tool Call shares Toolkit Pool's `tool`). */
const STEP_ENTRIES = [
  {
    type: "tool_call",
    label: "Tool call",
    description: "Run one tool with arguments you fix, no model",
    group: "steps",
    icon: "tool",
  },
  {
    type: "skill_read",
    label: "Skill read",
    description: "Read one skill's instructions when the run gets here",
    group: "steps",
    icon: "book_open",
  },
  /* Code (#357): one Python function in its own process. The icon is the
     plan's (`code`, §8.12); the graph kinds are the plan's §3 — a Workflow
     may run it too, once Workflow authoring exists. */
  {
    type: "code",
    label: "Code",
    description: "Run one Python function in its own process, no model",
    group: "steps",
    icon: "code",
    graph_kinds: ["agent", "workflow"],
  },
  /* Workflow Call (#357): run one pinned, published Workflow revision as a
     step. The icon is the one the Agents explorer already draws for a
     Workflow. */
  {
    type: "workflow_call",
    label: "Workflow call",
    description: "Run one published Workflow revision as a step",
    group: "steps",
    icon: "flow_chart",
    graph_kinds: ["agent", "workflow"],
  },
];

/* A step has one way in and one way out. The legacy catalog has no entry for
   these types — a recipe cannot run them — so their ports are declared here,
   for the native canvas only. */
const STEP_PORTS = Object.freeze([
  Object.freeze({ id: "in", side: "left", kind: "in" }),
  Object.freeze({ id: "out", side: "right", kind: "out" }),
]);
const STEP_TYPES = new Set(STEP_ENTRIES.map((entry) => entry.type));

/* A Code node is taller than its header once it shows code, and its in/out
   ports stay level with that header rather than centring on the node, so a
   chain of mixed heights still reads as one line (design canvas, "Showing the
   code on the node"). The distance is the header's centre: the node's top
   padding plus half its 28px glyph. The editor honours `anchor` on a port;
   the node draws its header to match. */
export const CODE_PORT_ANCHOR = 27;

export function native_step_ports(type) {
  if (!STEP_TYPES.has(type)) return null;
  return STEP_PORTS.map((port) => (type === "code" ? { ...port, anchor: CODE_PORT_ANCHOR } : { ...port }));
}

/* Hooks Pool (#357): an attach pool, like the Toolkit and Subagent Pools,
   with the same two attach ports. The icon is the plan's (`anchor`, §8.12).
   Only an Agent graph has a Kernel to attach it to. */
const POOL_ENTRIES = [
  {
    type: "hooks_pool",
    label: "Hooks Pool",
    description: "Workflows that run before or after an agent's tool calls",
    group: "attachments",
    icon: "anchor",
    graph_kinds: ["agent"],
  },
];
const POOL_PORTS = Object.freeze([
  Object.freeze({ id: "attach_top", side: "top", kind: "attach" }),
  Object.freeze({ id: "attach_bot", side: "bottom", kind: "attach" }),
]);
export function native_pool_ports(type) {
  return type === "hooks_pool" ? POOL_PORTS.map((port) => ({ ...port })) : null;
}

export const NATIVE_PALETTE_ENTRIES = Object.freeze(
  [...addable_nodes("agent"), ...BRANCH_ENTRIES, ...STEP_ENTRIES, ...POOL_ENTRIES]
    .filter((entry) => ADDABLE_NODE_TYPES.includes(entry.type))
    .map((entry) => Object.freeze({ ...entry })),
);
