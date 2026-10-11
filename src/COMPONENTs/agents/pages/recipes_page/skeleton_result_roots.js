/* What a node's result actually contains.
 *
 * An earlier round of this editor treated every result as free text, on the
 * stated grounds that a result's shape is known only once the node has run.
 * That is false for most node types, and the runtime says so with admission
 * checks rather than conventions — it refuses a result that is not exactly the
 * shape below:
 *
 *   agent         {message, context}            durable_execution.py:227
 *                 plus the fields merged from `config.kernel.json_schema`
 *                 by `parse_kernel_output`      durable_execution.py:231-233
 *   tool_call     {result, ok, error}           tool_runtime.py:232-235
 *   skill_read    {content, name}               durable_execution.py:252
 *                 `_skeleton_skill` is stripped before publication, so it is
 *                 not a choice here even though the raw result carries it.
 *
 * Where the set is closed, typing a root is typing into a closed set: the
 * static validator never looks at the result side, so `result: ["typo"]`
 * raises no diagnostic and fails only at run time, with `missing_value` at
 * `mappings[0].source.path`. Picking from the inventory is what closes that.
 *
 * The three that are genuinely unknowable are unknowable for different
 * reasons, and the reason is worth showing rather than a shrug:
 *
 *   code            the author's own payload; the receipt admits any object.
 *   workflow_call   the called graph's exported outputs — declared in *that*
 *                   document, which this editor does not have.
 *   start           whatever the run was called with. The generic Skeleton v1
 *                   document has no run-input schema and cannot gain one:
 *                   `input_schema` is refused in the envelope as an unknown
 *                   field and inside Start's execution as an invalid shape.
 *                   Individual callers do know — PuPu's chat entry builds
 *                   `{message, images, files}` — but that is a caller's
 *                   contract, not something this document declares, and a
 *                   graph authored here may be run from anywhere. */

const CLOSED_ROOTS = {
  agent: ["message", "context"],
  tool_call: ["result", "ok", "error"],
  skill_read: ["content", "name"],
};

const UNKNOWN_REASON = {
  code: "Code returns whatever its own source returns, so its fields are not known here.",
  workflow_call:
    "A called Workflow's result is what that Workflow exports, which is declared in its own document.",
  start:
    "A Start's result is whatever the run was called with. The document declares no shape for it, and the same graph can be called from different places.",
};

/* Fields a loaded output schema adds to the result. `validate_output_schema`
   keeps `message` and `context` reserved at the effective root, so these never
   collide with the two built-ins. */
function schema_roots(node) {
  const schema = node && node.config && node.config.kernel && node.config.kernel.json_schema;
  const properties = schema && typeof schema === "object" ? schema.properties : null;
  if (!properties || typeof properties !== "object") return [];
  return Object.keys(properties).filter((name) => typeof name === "string" && name);
}

export function result_roots_for(node) {
  const type = node && node.type;
  const closed = CLOSED_ROOTS[type];
  if (!closed) {
    return {
      known: false,
      roots: [],
      reason: UNKNOWN_REASON[type] || null,
    };
  }
  const extra = type === "agent" ? schema_roots(node) : [];
  return {
    known: true,
    roots: [...closed, ...extra.filter((name) => !closed.includes(name))],
    reason: null,
  };
}
