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
];

/* A step has one way in and one way out. The legacy catalog has no entry for
   these types — a recipe cannot run them — so their ports are declared here,
   for the native canvas only. */
const STEP_PORTS = Object.freeze([
  Object.freeze({ id: "in", side: "left", kind: "in" }),
  Object.freeze({ id: "out", side: "right", kind: "out" }),
]);
const STEP_TYPES = new Set(STEP_ENTRIES.map((entry) => entry.type));

export function native_step_ports(type) {
  return STEP_TYPES.has(type) ? STEP_PORTS.map((port) => ({ ...port })) : null;
}

export const NATIVE_PALETTE_ENTRIES = Object.freeze(
  [...addable_nodes("agent"), ...BRANCH_ENTRIES, ...STEP_ENTRIES]
    .filter((entry) => ADDABLE_NODE_TYPES.includes(entry.type))
    .map((entry) => Object.freeze({ ...entry })),
);
