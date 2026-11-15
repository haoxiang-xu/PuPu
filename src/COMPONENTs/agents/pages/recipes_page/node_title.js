import { agentEnglishText } from "./agents_i18n";
import { palette_entry_caption } from "./node_catalog_captions";
import { node_display_title } from "./node_display_labels";
import { safe_text } from "./document_values";
import { skill_identity } from "./skill_read_config";
import { tool_settings } from "./tool_call_config";
import { pinned_reference } from "./workflow_call_config";
import { workflow_version_state } from "./workflow_versions";

/* The one name a native Skeleton node goes by (#484).
 *
 * The canvas card and the detail panel header used to each pick their own
 * fallback for a node without a label: the card fell back to what the node
 * holds (its tool, its skill, its callee, a Code node's id), the panel to the
 * type's caption. A graph saved without labels — which is every graph until
 * someone renames a node — then read "glob" on the card and "Tool call" in
 * the panel. Both now read from here.
 *
 * Order: the author's label; else what the node is pointed at; else the
 * type's caption. `named` says the title is the author's own; `code_face`
 * says it is an identifier (a tool, a skill, an id) and is drawn as one. */

function own_text(value) {
  return typeof value === "string" && value ? value : null;
}

export function derived_node_name(node) {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "tool_call": {
      const tool = tool_settings(node);
      return own_text(tool && tool.name);
    }
    case "skill_read": {
      const skill = skill_identity(node);
      return own_text(skill && skill.name);
    }
    case "workflow_call": {
      const pin = pinned_reference(node);
      if (!pin) return null;
      const state = workflow_version_state(pin.workflow_id, pin.revision_id);
      const version = state && state.status === "ready" ? state.version : null;
      return own_text(version && version.document && version.document.name) || own_text(pin.workflow_id);
    }
    case "code":
      return own_text(node.id);
    default:
      return null;
  }
}

/* Identifier-like fallbacks are set in the code typeface; a callee
   Workflow's name is ordinary text. */
const CODE_FACE_TYPES = new Set(["tool_call", "skill_read", "code"]);

export function node_title(node, t = agentEnglishText) {
  const caption = palette_entry_caption({ type: node && node.type, label: "" }, t).label || "";
  const derived = derived_node_name(node);
  const fallback = derived ? safe_text(derived) : caption;
  const named = node_display_title(node, "") !== "";
  return {
    title: node_display_title(node, fallback),
    named,
    code_face: !named && Boolean(derived) && CODE_FACE_TYPES.has(node && node.type),
  };
}
