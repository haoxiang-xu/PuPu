/* Caller input is an editor description, never graph data. The library does
 * not identify a caller. Subagent input names come from the CURRENT child
 * Start outputs, exactly as SkeletonAgentRuntime._child_inputs constructs
 * them; every name receives the same delegated message text. Output paths
 * describe what Start exports and do not name the caller's input fields. */
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const unknown = (hook = false) => ({
  kind: "unknown",
  fields: [],
  message: hook
    ? "This is a hook Workflow. Its caller supplies the input object; this view does not declare its fields."
    : "The caller is not specified in this library view. The calling context supplies the input object and its fields.",
});
const invalid = () => ({
  kind: "invalid",
  fields: [],
  message: "Caller fields are not determined: this Subagent needs one Start with a readable output list and unique, nonempty text names. Repair its Output Variables first.",
});

export function start_context_for_view(steps, frames, document) {
  const path = Array.isArray(steps) ? steps : [];
  const stack = Array.isArray(frames) ? frames : [];
  const last = path[path.length - 1];
  // Only the existing default step means Subagent; unknown future members do not.
  const embeddedSubagent = object(last) && !Object.prototype.hasOwnProperty.call(last, "member");
  // Every current RESOURCE frame is created by open_subagent. Embedded hooks
  // take precedence when a referenced Agent contains a hook Workflow.
  const referencedSubagent = path.length === 0 && stack[stack.length - 1]?.kind === "resource";
  if (!embeddedSubagent && !referencedSubagent) return unknown(last?.member === "hooks");
  if (!object(document) || !Array.isArray(document.nodes)) return invalid();
  const starts = document.nodes.filter((node) => object(node) && node.type === "start");
  if (starts.length !== 1) return invalid();
  const outputs = starts[0].config?.execution?.outputs;
  if (!Array.isArray(outputs)) return invalid();
  const names = new Set();
  for (const row of outputs) {
    if (!object(row) || typeof row.name !== "string" || row.name.length === 0 || names.has(row.name)) return invalid();
    names.add(row.name);
  }
  return {
    kind: "subagent",
    fields: [...names].map((name) => ({ name, type: "text" })),
    message: "When called from this Subagent Pool, each field receives the same delegated message text. These caller fields follow this Start's output names.",
  };
}
