/* What a node's result actually contains.
 *
 * An earlier round of this editor treated every result as free text, on the
 * stated grounds that a result's shape is known only once the node has run.
 * That is false for most node types, and the runtime says so with admission
 * checks rather than conventions — it refuses a result that is not exactly the
 * shape below:
 *
 *   agent         {message, context}            durable_execution.py:227
 *                 plus the root fields of `config.kernel.json_schema`, which
 *                 `parse_kernel_output` merges into the same result
 *                                               durable_execution.py:231-233
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
 * Closed is not the same as known, and an earlier round of this file collapsed
 * the two: it read a schema's direct `properties`, offered that list, and then
 * treated every other name as impossible. JSON Schema's default is the
 * opposite — without `additionalProperties: false` an output may carry fields
 * the schema never names, and the runtime publishes them. So a schema's root
 * fields are offered as choices, and whether the list is the *whole* of them
 * is answered separately by `schema_root_scope`. Only a closed list licenses
 * saying a field cannot exist; an open one licenses nothing but help.
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

import { schema_root_scope } from "./output_schema";
import { own } from "./document_values";

/* The tables below are read with a node's type, out of a draft, so they are
   read through `own`. */

const KERNEL_BUILT_INS = Object.freeze(["message", "context"]);

const CLOSED_ROOTS = {
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

const OPEN_SCHEMA_REASON =
  "This Agent's output schema does not close its own field list, so the result can carry a field it does not name. One of those can be typed below.";

const UNREADABLE_SCHEMA_REASON =
  "This Agent's output schema is not a shape this editor can read, so the fields it adds are not listed. A field name can still be typed below.";

const closed_on = (roots) => ({
  known: true,
  roots: [...roots],
  closed: true,
  reason: null,
});

/* The two built-ins plus whatever the loaded schema declares at the result's
   own root. With no schema the result is exactly the built-ins and the runtime
   refuses any other shape, so that case is genuinely closed. */
function agent_result_roots(node) {
  const kernel = node && node.config && node.config.kernel;
  const schema = kernel ? kernel.json_schema : null;
  if (schema === null || schema === undefined) return closed_on(KERNEL_BUILT_INS);

  const scope = schema_root_scope(schema);
  const extra = scope.names.filter((name) => !KERNEL_BUILT_INS.includes(name));
  return {
    known: true,
    roots: [...KERNEL_BUILT_INS, ...extra],
    closed: scope.closed,
    reason: scope.closed
      ? null
      : scope.readable
        ? OPEN_SCHEMA_REASON
        : UNREADABLE_SCHEMA_REASON,
  };
}

export function result_roots_for(node) {
  const type = node && node.type;
  if (type === "agent") return agent_result_roots(node);
  const closed = own(CLOSED_ROOTS, type);
  if (closed) return closed_on(closed);
  return {
    known: false,
    roots: [],
    closed: false,
    reason: own(UNKNOWN_REASON, type) || null,
  };
}
