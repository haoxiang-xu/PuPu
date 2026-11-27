import { agentEnglishText } from "./agents_i18n";
/* Caller input is an editor description, never graph data. The library does
 * not identify a caller. Subagent input names come from the CURRENT child
 * Start outputs, exactly as SkeletonAgentRuntime._child_inputs constructs
 * them; every name receives the same delegated message text. When an output
 * explicitly reads result.message, the runtime also supplies a message alias. */
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const unknown = (hook = false, t = agentEnglishText) => ({
  kind: "unknown",
  fields: [],
  message: hook
    ? t("agents.io.start_context.hook_caller")
    : t("agents.io.start_context.unspecified"),
});
const invalid = (t = agentEnglishText) => ({
  kind: "invalid",
  fields: [],
  message: t("agents.io.start_context.invalid_subagent"),
});

export function start_context_for_view(steps, frames, document, t = agentEnglishText) {
  const path = Array.isArray(steps) ? steps : [];
  const stack = Array.isArray(frames) ? frames : [];
  const last = path[path.length - 1];
  // Only the existing default step means Subagent; unknown future members do not.
  const embeddedSubagent = object(last) && !Object.prototype.hasOwnProperty.call(last, "member");
  // Every current RESOURCE frame is created by open_subagent. Embedded hooks
  // take precedence when a referenced Agent contains a hook Workflow.
  const referencedSubagent = path.length === 0 && stack[stack.length - 1]?.kind === "resource";
  if (!embeddedSubagent && !referencedSubagent) {
    return last?.member === "hooks" ? { ...unknown(true, t), caller: "hook" } : unknown(false, t);
  }
  if (!object(document) || !Array.isArray(document.nodes)) return invalid(t);
  const starts = document.nodes.filter((node) => object(node) && node.type === "start");
  if (starts.length !== 1) return invalid(t);
  const outputs = starts[0].config?.execution?.outputs;
  if (!Array.isArray(outputs)) return invalid(t);
  const names = new Set();
  for (const row of outputs) {
    if (!object(row) || typeof row.name !== "string" || row.name.length === 0 || names.has(row.name)) return invalid(t);
    names.add(row.name);
  }
  const needsMessageAlias = outputs.some((row) =>
    object(row.source)
    && row.source.kind === "result"
    && Array.isArray(row.source.path)
    && row.source.path.length > 0
    && row.source.path[0] === "message"
  ) && !names.has("message");
  if (needsMessageAlias) names.add("message");
  return {
    kind: "subagent",
    fields: [...names].map((name) => ({ name, type: "text" })),
    message: needsMessageAlias
      ? t("agents.io.start_context.subagent_message_alias")
      : t("agents.io.start_context.subagent_fields"),
  };
}
