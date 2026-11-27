/* "Ask the agent for…": an Agent output the author describes rather than wires.
 *
 * An Ask is not a new kind of thing in the document. It is two things the
 * document already holds, kept as one:
 *
 *   - a field of the Agent's JSON Output schema (`kernel.json_schema`), with a
 *     type and a description the model is handed as part of that schema, and
 *   - an Output Variable of the same name that reads `result.<name>`.
 *
 * The runtime already sends the schema (descriptions included) to the
 * provider as structured output and merges the parsed object into the
 * Agent's result, so nothing here needs anything new from it. Every Ask field
 * is required and the schema closed, because a strict provider (OpenAI's
 * `strict: true`) refuses anything else.
 *
 * Nothing marks a pair as an Ask: the settings are a closed shape. A pair is
 * recognised by what it is — a mapping `{name: N, source: result [N]}` whose
 * N is a field of a row-shaped schema (`fields_hold_schema`). A schema the
 * rows cannot hold is the JSON editor's alone, and Ask is not offered. */

import { node_kernel, node_output_mappings, node_output_schema, with_node_output_mappings, with_node_output_schema } from "./skeleton_document";
import { make_output_mapping } from "./skeleton_io";
import { fields_hold_schema, new_field, schema_fields, schema_from_fields } from "./output_schema_fields";

/* The two names every Agent result has, whatever its schema. */
export const BUILT_IN_RESULT_ROOTS = Object.freeze(["message", "context"]);

/* The types an author picks from, in words, and the field each one writes. */
export const ASK_TYPES = Object.freeze([
  Object.freeze({ key: "text", type: "string" }),
  Object.freeze({ key: "number", type: "number" }),
  Object.freeze({ key: "whole_number", type: "integer" }),
  Object.freeze({ key: "yes_no", type: "boolean" }),
  Object.freeze({ key: "list", type: "array", items_type: "string" }),
]);

export function ask_type_key(field) {
  if (!field) return "text";
  if (field.type === "array") return "list";
  const found = ASK_TYPES.find((entry) => entry.type === field.type);
  return found ? found.key : "text";
}

const is_object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/* Whether an Agent may be asked for anything: its model says it can answer
   in a schema, and the schema it holds (if any) is one the rows can hold.
   Returns null when it can, else the reason's message key. */
export function ask_unavailable(node) {
  const kernel = node_kernel(node);
  if (!kernel) return "agents.io.ask.no_kernel";
  const capabilities = is_object(kernel.profile) ? kernel.profile.capabilities : null;
  if (!is_object(capabilities) || capabilities.json_schema !== true) return "agents.io.ask.model_cannot";
  const schema = node_output_schema(node);
  if (schema !== null && schema !== undefined && !fields_hold_schema(schema)) return "agents.io.ask.schema_is_json";
  return null;
}

function held_fields(node) {
  const schema = node_output_schema(node);
  if (schema === null || schema === undefined) return { fields: [], root: {}, closed: true };
  if (!fields_hold_schema(schema)) return null;
  const { fields, root } = schema_fields(schema);
  return { fields, root, closed: true };
}

const is_ask_mapping = (mapping, names) =>
  is_object(mapping) && is_object(mapping.source) && mapping.source.kind === "result" &&
  Array.isArray(mapping.source.path) && mapping.source.path.length === 1 &&
  mapping.source.path[0] === mapping.name && names.has(mapping.name) &&
  !BUILT_IN_RESULT_ROOTS.includes(mapping.name);

/* Which Output Variables are Asks, by mapping index, with their field. */
export function ask_rows(node) {
  if (!node || node.type !== "agent") return new Map();
  const held = held_fields(node);
  if (!held) return new Map();
  const by_name = new Map(held.fields.map((field) => [field.name, field]));
  const rows = new Map();
  node_output_mappings(node).forEach((mapping, index) => {
    if (is_ask_mapping(mapping, by_name) && ![...rows.values()].some((field) => field.name === mapping.name)) {
      rows.set(index, by_name.get(mapping.name));
    }
  });
  return rows;
}

/* Every name an Ask may not take: the built-ins, every output variable and
   every declared field, except the Ask's own. */
export function taken_ask_names(node, own_name) {
  const held = held_fields(node);
  const names = new Set(BUILT_IN_RESULT_ROOTS);
  node_output_mappings(node).forEach((mapping) => is_object(mapping) && typeof mapping.name === "string" && names.add(mapping.name));
  (held ? held.fields : []).forEach((field) => names.add(field.name));
  if (own_name !== undefined) names.delete(own_name);
  return [...names];
}

export function free_ask_name(node, base = "answer") {
  const taken = new Set(taken_ask_names(node));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

function write(document, node, fields, root, mappings) {
  /* No field left: back to a plain reply, as an Agent that never asked. */
  const schema = fields.length === 0 && !(root && root.description) ? null : schema_from_fields(fields, true, root);
  return with_node_output_mappings(with_node_output_schema(document, node.id, schema), node.id, mappings);
}

export function add_ask(document, node) {
  const held = held_fields(node);
  if (!held) return document;
  const name = free_ask_name(node);
  const field = { ...new_field(name), required: true };
  return write(document, node, [...held.fields, field], held.root,
    [...node_output_mappings(node), make_output_mapping({ name, kind: "result", path: [name] })]);
}

/* `patch` holds any of name, type (an ASK_TYPES key) and description. */
export function update_ask(document, node, index, patch) {
  const held = held_fields(node);
  const asks = ask_rows(node);
  if (!held || !asks.has(index)) return document;
  const before = asks.get(index);
  const next = { ...before, required: true };
  if (typeof patch.name === "string") next.name = patch.name;
  if (typeof patch.description === "string") next.description = patch.description;
  if (typeof patch.type === "string") {
    const entry = ASK_TYPES.find((item) => item.key === patch.type) || ASK_TYPES[0];
    next.type = entry.type;
    next.items_type = entry.items_type || "string";
    next.bounds = {};
  }
  const fields = held.fields.map((field) => (field.name === before.name ? next : field));
  const mappings = node_output_mappings(node).map((mapping, i) =>
    i === index ? make_output_mapping({ name: next.name, kind: "result", path: [next.name] }) : mapping);
  return write(document, node, fields, held.root, mappings);
}

export function remove_ask(document, node, index) {
  const held = held_fields(node);
  const asks = ask_rows(node);
  if (!held || !asks.has(index)) return document;
  const name = asks.get(index).name;
  return write(document, node, held.fields.filter((field) => field.name !== name), held.root,
    node_output_mappings(node).filter((_, i) => i !== index));
}

/* "Agent's reply": the reply text, under a free name. */
export function add_reply(document, node) {
  return with_node_output_mappings(document, node.id, [
    ...node_output_mappings(node),
    make_output_mapping({ name: free_ask_name(node, "reply"), kind: "result", path: ["message"] }),
  ]);
}
