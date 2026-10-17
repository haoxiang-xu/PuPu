import { safe_text } from "../document_values";
import { TOOLKIT_POOL_TYPE, normalize_node_type } from "../recipe_graph";

/* Who a node is, in one table.
 *
 * The icon, gradient, title and subtitle used to be spelled out again inside
 * each panel's own markup, which is why the header scrolled away with the body
 * — it was part of the body. DetailPanel paints it from here instead, pinned
 * above a hairline, and the panels render only their contents. */

const IDENTITY = {
  start: {
    icon: "flag",
    gradient: "linear-gradient(135deg, #4cbe8b, #2f9a68)",
    title: () => "Start",
    subtitle: () => "Workflow entry",
  },
  end: {
    icon: "target",
    gradient: "linear-gradient(135deg, #f0635a, #d23f37)",
    title: () => "End",
    subtitle: () => "Workflow exit",
  },
  agent: {
    icon: "bot",
    gradient: "linear-gradient(135deg, #6478f6, #4a5bd8)",
    /* An agent node is the one kind the author names, so its own label wins.
       Through `safe_text`, because a legacy recipe's label is whatever was
       stored: a value that refuses to become text threw here, one line under
       the icon, before the panel appeared. A Skeleton node reaches this with
       `label` and `override` already absent — they are not part of a node —
       so it is drawn by its id, which is its name. */
    title: (node) => safe_text(node?.label || node?.id || "Agent"),
    subtitle: (node) =>
      safe_text(node?.override?.model || "Inherits the chat's model"),
  },
  [TOOLKIT_POOL_TYPE]: {
    icon: "tool",
    gradient: "linear-gradient(135deg, #f6a341, #ea7547)",
    title: () => "Toolkit Pool",
    subtitle: (node) => count_label(node?.toolkits, "toolkit"),
  },
  subagent_pool: {
    icon: "shapes",
    gradient: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
    title: () => "Subagent Pool",
    subtitle: (node) => count_label(node?.subagents, "subagent"),
  },
};

function count_label(list, noun) {
  const n = Array.isArray(list) ? list.length : 0;
  if (n === 0) return `No ${noun}s`;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function node_identity(node) {
  if (!node) return null;
  const entry = IDENTITY[normalize_node_type(node.type)];
  if (!entry) return null;
  return {
    icon: entry.icon,
    gradient: entry.gradient,
    title: entry.title(node),
    subtitle: entry.subtitle(node),
  };
}

export function has_node_identity(node_type) {
  return Boolean(IDENTITY[normalize_node_type(node_type)]);
}

export const IDENTIFIED_NODE_TYPES = Object.keys(IDENTITY);
