import { agentEnglishText } from "../agents_i18n";
import { palette_entry_caption } from "../node_catalog_captions";
import { own, safe_text } from "../document_values";
import { TOOLKIT_POOL_TYPE, normalize_node_type } from "../recipe_graph";
import { is_skeleton_node } from "../skeleton_document";
import { node_display_title } from "../node_display_labels";

/* Who a node is, in one table.
 *
 * The icon, gradient, title and subtitle used to be spelled out again inside
 * each panel's own markup, which is why the header scrolled away with the body
 * — it was part of the body. DetailPanel paints it from here instead, pinned
 * above a hairline, and the panels render only their contents. */

const IDENTITY = {
  start: {
    icon: "flag",
    gradient: "#2f9a68",
    title: () => "Start",
    subtitle: () => "Workflow entry",
  },
  end: {
    icon: "target",
    gradient: "#d23f37",
    title: () => "End",
    subtitle: () => "Workflow exit",
  },
  agent: {
    icon: "bot",
    gradient: "#4a5bd8",
    /* The legacy Agent reader. Native optional labels are validated uniformly
       in node_identity below; without one a native Agent reads "Agent". */
    title: (node) => safe_text(node?.label || node?.id || "Agent"),
    subtitle: (node) =>
      safe_text(node?.override?.model || "Inherits the chat's model"),
  },
  /* Icons and colours match the canvas nodes (nodes/*_node.js); a test
     compares the two. */
  [TOOLKIT_POOL_TYPE]: {
    icon: "toolkit_pool",
    gradient: "#ea7547",
    title: () => "Toolkit Pool",
    subtitle: (node) => count_label(node?.toolkits, "toolkit"),
  },
  subagent_pool: {
    icon: "subagent_pool",
    gradient: "#5a5dd6",
    title: () => "Subagent Pool",
    subtitle: (node) => count_label(node?.subagents, "subagent"),
  },
  /* The two branch steps (#351) exist only in native Skeleton graphs; a legacy
     recipe has no such type, so these entries never answer for one. The panel
     header replaces the subtitle with what the stored branch holds. */
  if_else: {
    icon: "branch",
    gradient: "#1d8798",
    title: () => "If / Else",
    subtitle: () => "Branch",
  },
  switch_case: {
    icon: "switch_node",
    gradient: "#1d8798",
    title: () => "Switch / Case",
    subtitle: () => "Branch",
  },
  /* The deterministic steps (#352), native only like the branches. */
  tool_call: {
    icon: "tool",
    gradient: "#ea7547",
    title: () => "Tool call",
    subtitle: () => "Run one tool, no model",
  },
  skill_read: {
    icon: "book_open",
    gradient: "#2e9a63",
    title: () => "Skill read",
    subtitle: () => "Read one skill when the run gets here",
  },
  /* Code (#357): graphite, the one step that does nothing clever (design
     canvas, "Code, Workflow call and Hooks Pool"). The panel header replaces
     the subtitle with the runtime the node runs with. */
  code: {
    icon: "code",
    gradient: "#5b6475",
    title: () => "Code",
    subtitle: () => "Python in its own process",
  },
  hooks_pool: {
    icon: "anchor",
    gradient: "#b94a74",
    title: () => "Hooks Pool",
    subtitle: () => "Workflows around this Agent's tool calls",
  },
  workflow_call: {
    icon: "workflow",
    gradient: "#4f5fd6",
    title: () => "Workflow call",
    subtitle: () => "Run one published Workflow revision",
  },
};

function count_label(list, noun) {
  const n = Array.isArray(list) ? list.length : 0;
  if (n === 0) return `No ${noun}s`;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/* Read with `own`, not with `[]`.
 *
 * A node type is whatever the draft holds, and the store stores it: measured
 * on the pair, an embedded child node with `type: "__proto__"` saves, reads
 * back verbatim and is refused at Run with `unknown_variant` at that type.
 * Read as a plain key, the table then answered with `Object.prototype` — an
 * object, so every guard testing for one passed — and the next line called
 * `entry.title(node)`, which took the whole page down the moment the node was
 * selected. Only a key this table owns names a drawing; anything else has
 * none, which is already the safe path for every other unknown type. The
 * stored type is untouched and its own diagnostic still reports it. */
function identity_for(node_type) {
  return own(IDENTITY, normalize_node_type(node_type)) || null;
}

export function node_identity(node, t = agentEnglishText) {
  if (!node) return null;
  const entry = identity_for(node.type);
  if (!entry) return null;
  const type = normalize_node_type(node.type);
  const native = is_skeleton_node(node);
  const title = type === "agent"
    ? native
      ? t("agents.nodes.agent")
      : node.label || node.id ? entry.title(node) : t("agents.nodes.agent")
    : palette_entry_caption({ type, label: entry.title(node) }, t).label;
  let subtitle = entry.subtitle(node);
  switch (type) {
    case "start": subtitle = t("agents.identity.workflow_entry"); break;
    case "end": subtitle = t("agents.identity.workflow_exit"); break;
    case "agent":
      subtitle = node?.override?.model ? safe_text(node.override.model) : t("agents.identity.inherits_chat_model");
      break;
    case TOOLKIT_POOL_TYPE: {
      const count = Array.isArray(node.toolkits) ? node.toolkits.length : 0;
      subtitle = count === 0 ? t("agents.identity.no_toolkits")
        : count === 1 ? t("agents.nodes.toolkit_count_one", { count }) : t("agents.nodes.toolkit_count_other", { count });
      break;
    }
    case "subagent_pool": {
      const count = Array.isArray(node.subagents) ? node.subagents.length : 0;
      subtitle = count === 0 ? t("agents.identity.no_subagents")
        : count === 1 ? t("agents.nodes.subagent_count_one", { count }) : t("agents.nodes.subagent_count_other", { count });
      break;
    }
    case "if_else":
    case "switch_case": subtitle = t("agents.identity.branch"); break;
    case "tool_call": subtitle = t("agents.identity.tool_step"); break;
    case "skill_read": subtitle = t("agents.identity.skill_step"); break;
    case "code": subtitle = t("agents.identity.python_process"); break;
    case "hooks_pool": subtitle = t("agents.identity.hooks_around"); break;
    case "workflow_call": subtitle = t("agents.identity.workflow_step"); break;
    default: break;
  }
  return {
    icon: entry.icon,
    gradient: entry.gradient,
    title: native ? node_display_title(node, title) : title,
    subtitle,
  };
}

export function has_node_identity(node_type) {
  return identity_for(node_type) !== null;
}

export const IDENTIFIED_NODE_TYPES = Object.keys(IDENTITY);
