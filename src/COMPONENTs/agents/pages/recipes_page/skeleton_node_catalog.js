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

export const NATIVE_PALETTE_ENTRIES = Object.freeze(
  [...addable_nodes("agent"), ...BRANCH_ENTRIES]
    .filter((entry) => ADDABLE_NODE_TYPES.includes(entry.type))
    .map((entry) => Object.freeze({ ...entry })),
);
