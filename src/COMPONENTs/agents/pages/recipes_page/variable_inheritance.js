import { node_bindings, node_output_mappings } from "./skeleton_document";
import { make_binding, ref_expression } from "./skeleton_io";
import { is_system_context_output } from "./detail_panel/system_context_visibility";
import { ITEM_TYPES, FIELD_TYPES, new_field, same_json, schema_from_fields } from "./output_schema_fields";
import { STARTER_CODE } from "./code_config";
import { managed_path, managed_sha, sha256_text } from "./managed_code_sources";

/* Variable inheritance: a step connected after another starts out reading
 * everything that step passes on.
 *
 * The shared part is node-type-agnostic: on a USER connect (the canvas's
 * `connect` / `reconnect` commands — never a load, a paste, a duplicate or an
 * import, none of which goes through them), each flow edge that is new in the
 * edited document names a target; the target's direct flow predecessors'
 * Output Variables become input bindings with the same names, each reading
 * that predecessor's output of that name — exactly what the input picker
 * writes (`ref` to `[name]`, missing → `error`). The first predecessor to
 * offer a name keeps it. Attach edges carry no data and are never looked at.
 *
 * What a target does with them is its adapter's. An adapter answers two
 * questions about one node: is it still what inheritance would have made of
 * it (untouched), and what is it filled from these bindings. Only an
 * untouched node is filled, so nothing an author wrote is ever overwritten;
 * re-filling an untouched node from a new upstream replaces the old
 * inheritance. Disconnecting changes nothing: the inputs stay, and the
 * reference that no longer resolves is the store's dangling-reference
 * diagnostic on that row.
 *
 * Untouched is decided by comparison, never by a stored marker: the node's
 * settings are a closed shape, so there is nowhere to keep one. A node is
 * untouched when regenerating it from the inputs it holds gives back exactly
 * what it holds.
 *
 * Only Code is enabled. Its adapter mirrors the inputs: the starter code
 * returns its input unchanged, the Result declares each input with the type
 * its upstream field is known to have, and the Output Variables pass each
 * one on from the result. */

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/* The direct flow predecessors of a node, in edge order, once each. */
export function flow_predecessors(document, node_id) {
  if (!record(document) || !Array.isArray(document.edges)) return [];
  const seen = new Set();
  const order = [];
  document.edges.forEach((edge) => {
    if (!record(edge) || edge.kind !== "flow" || edge.target_node_id !== node_id) return;
    if (seen.has(edge.source_node_id)) return;
    seen.add(edge.source_node_id);
    order.push(edge.source_node_id);
  });
  return order;
}

const node_by_id = (document, id) => {
  const found = (record(document) && Array.isArray(document.nodes) ? document.nodes : []).filter((node) => record(node) && node.id === id);
  return found.length === 1 ? found[0] : null;
};

/* What a set of upstream nodes passes on, as `{node, mapping}`, the first
   to offer a name keeping it — the same list the input picker offers, minus
   the runtime's own context. */
export function upstream_outputs(document, ids) {
  const taken = new Set();
  const found = [];
  ids.forEach((id) => {
    const node = node_by_id(document, id);
    if (!node) return;
    node_output_mappings(node).forEach((mapping) => {
      if (!record(mapping) || typeof mapping.name !== "string" || !mapping.name || taken.has(mapping.name)) return;
      if (is_system_context_output(document, node, mapping)) return;
      taken.add(mapping.name);
      found.push({ node, mapping });
    });
  });
  return found;
}

export function inherited_bindings(document, ids) {
  return upstream_outputs(document, ids).map(({ node, mapping }) =>
    make_binding({ name: mapping.name, value: ref_expression(node.id, [mapping.name]), missing: "error" }));
}

/* The bindings inheritance writes for a node's direct predecessors. */
export function bindings_for(document, node_id) {
  return inherited_bindings(document, flow_predecessors(document, node_id));
}

/* Whether a node's inputs are still exactly what inheritance writes for the
   nodes they read: no input at all, or the predecessor list regenerated. */
export function inputs_are_inherited(document, node) {
  const bindings = node_bindings(node);
  if (bindings.length === 0) return true;
  const ids = [];
  for (const binding of bindings) {
    const value = record(binding) ? binding.value : null;
    if (!record(value) || value.kind !== "ref" || typeof value.node_id !== "string") return false;
    if (!ids.includes(value.node_id)) ids.push(value.node_id);
  }
  return same_json(bindings, inherited_bindings(document, ids));
}

/* ── Field types ─────────────────────────────────────────────────────── */

/* The type an upstream output is known to carry, as a field row can hold it,
   or null. Known only where the producer declares it: an Agent's `message`
   and its JSON Output fields, a Code node's Result fields, a Tool Call's
   `ok`. A Start's caller input, a tool's result, a skill and a called
   Workflow declare nothing here, and a path deeper than one step is not
   followed. */
function declared_property(schema, name) {
  if (!record(schema) || !record(schema.properties)) return null;
  return Object.prototype.hasOwnProperty.call(schema.properties, name) && record(schema.properties[name]) ? schema.properties[name] : null;
}

function holdable(property) {
  if (!record(property) || typeof property.type !== "string" || !FIELD_TYPES.includes(property.type)) return null;
  if (property.type === "array" && !(record(property.items) && ITEM_TYPES.includes(property.items.type))) return null;
  return { type: property.type, items_type: property.type === "array" ? property.items.type : "string" };
}

export function upstream_field_type(node, mapping) {
  const source = record(mapping) ? mapping.source : null;
  if (!record(source) || source.kind !== "result" || !Array.isArray(source.path) || source.path.length !== 1) return null;
  const field = source.path[0];
  if (typeof field !== "string") return null;
  const config = record(node) && record(node.config) ? node.config : {};
  if (node.type === "agent") {
    if (field === "message") return { type: "string", items_type: "string" };
    return holdable(declared_property(record(config.kernel) ? config.kernel.json_schema : null, field));
  }
  if (node.type === "code") return holdable(declared_property(record(config.code) ? config.code.result_schema : null, field));
  if (node.type === "tool_call" && field === "ok") return { type: "boolean", items_type: "string" };
  return null;
}

/* ── The Code adapter ─────────────────────────────────────────────────── */

/* The Result that mirrors these inputs: every input whose upstream type is
   known is a required field of that type; one whose type is not known is
   left undeclared and the Result is left open, so it still arrives (the
   runtime publishes keys an open schema does not name) and nothing claims a
   type nobody declared. With every type known — or no input at all — the
   Result is closed. */
export function mirrored_result_schema(document, bindings) {
  const fields = [];
  let open = false;
  bindings.forEach((binding) => {
    const value = binding.value;
    const node = record(value) ? node_by_id(document, value.node_id) : null;
    const mapping = node ? node_output_mappings(node).find((entry) => record(entry) && entry.name === binding.name) : null;
    const known = node && mapping ? upstream_field_type(node, mapping) : null;
    if (!known) {
      open = true;
      return;
    }
    fields.push({ ...new_field(binding.name), type: known.type, items_type: known.items_type, required: true });
  });
  return schema_from_fields(fields, !open, {});
}

export function mirrored_outputs(bindings) {
  return bindings.map((binding) => ({ name: binding.name, source: { kind: "result", path: [binding.name] } }));
}

const STARTER_PATH = () => managed_path(sha256_text(STARTER_CODE));

const code_adapter = Object.freeze({
  untouched(document, node) {
    const code = record(node.config) ? node.config.code : null;
    if (!record(code) || !record(code.source) || managed_sha(code.source) === null || code.source.path !== STARTER_PATH()) return false;
    if (!inputs_are_inherited(document, node)) return false;
    const bindings = node_bindings(node);
    return same_json(node_output_mappings(node), mirrored_outputs(bindings)) &&
      same_json(code.result_schema, mirrored_result_schema(document, bindings));
  },
  fill(document, node, bindings) {
    const execution = record(node.config.execution) ? node.config.execution : {};
    return {
      ...node,
      config: {
        ...node.config,
        execution: { ...execution, inputs: bindings, outputs: mirrored_outputs(bindings) },
        code: { ...node.config.code, result_schema: mirrored_result_schema(document, bindings) },
      },
    };
  },
  sources: () => ({ [sha256_text(STARTER_CODE)]: STARTER_CODE }),
});

/* Enabled adapters, by node type. The shared part above works for any type
   whose adapter can say "untouched" and "fill"; only Code is turned on. */
export const INHERITANCE_ADAPTERS = Object.freeze({ code: code_adapter });

const edge_key = (edge) => JSON.stringify([edge.id, edge.kind, edge.source_node_id, edge.source_port_id, edge.target_node_id, edge.target_port_id]);

/* After a user connect: the document as connected, with every untouched
   target of a new flow edge filled. `before` is the document the command was
   applied to — untouched is judged there, where the node's old upstream is
   still what its inputs read. Returns the document (the same object when
   nothing changed) and any Code text the filled nodes name. */
export function with_inherited_variables(before, after) {
  if (!record(before) || !record(after) || !Array.isArray(after.edges) || !Array.isArray(after.nodes)) return { document: after, sources: null };
  const old = new Set((Array.isArray(before.edges) ? before.edges : []).filter(record).map(edge_key));
  const targets = [];
  after.edges.forEach((edge) => {
    if (!record(edge) || edge.kind !== "flow" || old.has(edge_key(edge)) || targets.includes(edge.target_node_id)) return;
    targets.push(edge.target_node_id);
  });
  let document = after;
  let sources = null;
  targets.forEach((id) => {
    const node = node_by_id(document, id);
    const adapter = node && Object.prototype.hasOwnProperty.call(INHERITANCE_ADAPTERS, node.type) ? INHERITANCE_ADAPTERS[node.type] : null;
    if (!adapter || !record(node.config)) return;
    const prior = node_by_id(before, id) || node;
    if (!adapter.untouched(before, prior)) return;
    const filled = adapter.fill(document, node, bindings_for(document, id));
    if (same_json(filled, node)) return;
    document = { ...document, nodes: document.nodes.map((entry) => (entry === node ? filled : entry)) };
    sources = { ...(sources || {}), ...adapter.sources() };
  });
  return { document, sources };
}

