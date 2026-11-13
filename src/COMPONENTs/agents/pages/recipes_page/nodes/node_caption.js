import { agentEnglishText } from "../agents_i18n";

/* The grey line under a canvas node's title.
 *
 * The title is the author's name for the node (its `label`), or the type's
 * default title when it has none. The line below says what the node IS — our
 * name for its type — followed by the type's own summary (the model, the
 * tool, a count…), so a renamed node still reads as an Agent or a Switch.
 *
 * Nothing is said twice: when the title already is the type's name (an
 * unnamed node) the type is left out, and a summary part equal to the title
 * (an unnamed Tool call titled by its tool) is left out too. Parts are joined
 * through one catalog entry, so a locale owns its separator. */

const TYPE_KEYS = Object.freeze(Object.assign(Object.create(null), {
  start: "agents.nodes.start",
  end: "agents.nodes.end",
  agent: "agents.nodes.agent",
  toolkit_pool: "agents.nodes.toolkit_pool",
  subagent_pool: "agents.nodes.subagent_pool",
  if_else: "agents.nodes.if_else",
  switch_case: "agents.nodes.switch_case",
  tool_call: "agents.nodes.tool_call",
  skill_read: "agents.nodes.skill_read",
  code: "agents.nodes.code.type",
  workflow_call: "agents.nodes.workflow_call",
  hooks_pool: "agents.nodes.hooks_pool",
}));

/* Our name for a node type, or "" for a type this build does not draw. */
export function node_type_label(type, t = agentEnglishText) {
  const key = typeof type === "string" ? TYPE_KEYS[type] : undefined;
  return key ? t(key) : "";
}

export function node_caption({ type, title, summary }, t = agentEnglishText) {
  const kind = node_type_label(type, t);
  const parts = (Array.isArray(summary) ? summary : [summary])
    .filter((part) => typeof part === "string" && part !== "" && part !== title);
  if (kind && kind !== title) parts.unshift(kind);
  return parts.reduce((first, second) => (first === null ? second : t("agents.nodes.caption_join", { first, second })), null) || "";
}
