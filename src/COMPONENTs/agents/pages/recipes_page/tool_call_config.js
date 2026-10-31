import { node_bindings, with_node_bindings } from "./skeleton_document";

/* The Tool Call node's configuration (#352).
 *
 * Everything here mirrors the fixed installed runtime, measured before it was
 * written (steps-352/probe/tool-call-store-01, tool-schemas-02):
 *
 *   config.tool  CLOSED {name, on_error, approval_timeout_ms}
 *                on_error ∈ stop | continue; approval_timeout_ms an integer
 *                1 … 86 400 000 (`execution.py` `_validate_all`)
 *   arguments    the node's resolved inputs, passed to the tool exactly — one
 *                input row per argument (`tool_runtime._tool_call`)
 *
 * The store's draft check says nothing about any of this, and preflight names
 * one problem at a time; an argument the tool does not declare even passes
 * preflight and fails only when the tool rejects it. So the editor states the
 * problems itself, from the tool's own schema, and never writes a value the
 * author did not choose. */

export const APPROVAL_LIMIT_MS = Object.freeze({ min: 1, max: 86400000 });
export const ON_ERROR_CHOICES = Object.freeze([
  Object.freeze({ value: "stop", label: "Fail the run" }),
  Object.freeze({ value: "continue", label: "Continue" }),
]);
const SETTING_KEYS = ["name", "on_error", "approval_timeout_ms"];

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);

export function tool_settings(node) {
  const config = node && node.config;
  return own(config, "tool") && record(config.tool) ? config.tool : null;
}

/* Writes the whole `tool` object of exactly one Tool Call node; the rest of
   its config — the execution rows, and anything this editor does not know —
   is kept as it was. Anything else answers with the document unchanged. */
export function with_tool_settings(document, node_id, tool) {
  if (!record(document) || !Array.isArray(document.nodes) || !record(tool)) return document;
  const matches = document.nodes.filter((node) => record(node) && node.id === node_id);
  if (matches.length !== 1 || matches[0].type !== "tool_call" || !record(matches[0].config)) return document;
  const target = matches[0];
  return {
    ...document,
    nodes: document.nodes.map((node) => (node === target ? { ...node, config: { ...node.config, tool } } : node)),
  };
}

/* ── The schema, as argument rows ─────────────────────────────────────── */

function type_of(property) {
  if (!record(property)) return null;
  if (typeof property.type === "string") return property.type;
  if (Array.isArray(property.type)) return property.type.filter((item) => typeof item === "string").join(" | ") || null;
  return null;
}

export function schema_arguments(parameters) {
  if (!record(parameters) || !record(parameters.properties)) {
    return { readable: false, rows: [], closed: false };
  }
  const required_list = Array.isArray(parameters.required) ? parameters.required.filter((name) => typeof name === "string") : [];
  const required = new Set(required_list);
  /* Required arguments first, in the order the schema's `required` list gives
     them — a list keeps its order across every hop — then the rest in the
     order received. An object's key order is not part of the contract: the
     sidecar's JSON answer sorts it alphabetically (tool-catalog-capture-01),
     so the runtime's own property order does not survive the wire. */
  const names = Object.keys(parameters.properties);
  const ordered = [
    ...required_list.filter((name, index) => names.includes(name) && required_list.indexOf(name) === index),
    ...names.filter((name) => !required.has(name)),
  ];
  const rows = ordered.map((name) => {
    const property = parameters.properties[name];
    return {
      name,
      required: required.has(name),
      type: type_of(property),
      description: record(property) && typeof property.description === "string" ? property.description : "",
      has_default: own(property, "default"),
      default: own(property, "default") ? property.default : undefined,
      enum: record(property) && Array.isArray(property.enum) ? property.enum : null,
    };
  });
  return { readable: true, rows, closed: parameters.additionalProperties === false };
}

/* Each property with the row bound to it, if any; rows whose name is not a
   property are returned apart, with their index, so they can be shown and
   removed — never silently dropped. */
export function argument_layout(parameters, bindings) {
  const schema = schema_arguments(parameters);
  const list = Array.isArray(bindings) ? bindings : [];
  const names = new Set(schema.rows.map((row) => row.name));
  const rows = schema.rows.map((row) => {
    const index = list.findIndex((binding) => record(binding) && binding.name === row.name);
    return { ...row, binding: index === -1 ? null : list[index], index };
  });
  const extras = list
    .map((binding, index) => ({ binding, index }))
    .filter(({ binding }) => !(record(binding) && names.has(binding.name)));
  return { readable: schema.readable, rows, extras };
}

/* ── Typed literals ───────────────────────────────────────────────────── */

const JSON_TYPES = { object: (value) => record(value), array: (value) => Array.isArray(value) };

export function literal_from_text(text, type) {
  const raw = typeof text === "string" ? text : "";
  if (type === "integer") {
    if (!/^-?\d+$/.test(raw.trim())) return { ok: false, problem: "Enter a whole number." };
    const value = Number(raw.trim());
    return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, problem: "This number is too large." };
  }
  if (type === "number") {
    const trimmed = raw.trim();
    const value = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(value)) return { ok: false, problem: "Enter a number." };
    return { ok: true, value };
  }
  if (type === "boolean") {
    if (raw === "true") return { ok: true, value: true };
    if (raw === "false") return { ok: true, value: false };
    return { ok: false, problem: "Choose true or false." };
  }
  if (own(JSON_TYPES, type)) {
    try {
      const value = JSON.parse(raw);
      return JSON_TYPES[type](value) ? { ok: true, value } : { ok: false, problem: `Enter a JSON ${type}.` };
    } catch (_error) {
      return { ok: false, problem: `Enter a JSON ${type}.` };
    }
  }
  return { ok: true, value: raw };
}

export function literal_to_text(value, type) {
  if (typeof value === "string" && (type === "string" || type === null || type === undefined)) return value;
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return "";
  }
}

/* ── What the panel says is wrong ─────────────────────────────────────── */

export function tool_call_problems(node, parameters) {
  const tool = tool_settings(node);
  if (!tool || typeof tool.name !== "string" || !tool.name) {
    return [{ code: "tool_missing", message: "Pick the tool this step runs." }];
  }
  const problems = [];
  if (!own(tool, "on_error")) {
    problems.push({ code: "on_error_missing", message: "Choose what happens when the tool fails." });
  } else if (!ON_ERROR_CHOICES.some((choice) => choice.value === tool.on_error)) {
    problems.push({ code: "on_error_invalid", message: "The stored error choice is not one this runtime knows. Choose again." });
  }
  if (!own(tool, "approval_timeout_ms")) {
    problems.push({ code: "approval_limit_missing", message: "Set how long to wait for an approval." });
  } else {
    const value = tool.approval_timeout_ms;
    if (!Number.isSafeInteger(value) || value < APPROVAL_LIMIT_MS.min || value > APPROVAL_LIMIT_MS.max) {
      problems.push({ code: "approval_limit_invalid", message: "The approval wait must be between 1 millisecond and 24 hours." });
    }
  }
  Object.keys(tool).filter((key) => !SETTING_KEYS.includes(key)).forEach((key) => {
    problems.push({ code: "unknown_setting", setting: key, message: `This runtime does not read the setting “${key}”.` });
  });

  const bindings = node_bindings(node);
  if (record(parameters)) {
    const layout = argument_layout(parameters, bindings);
    layout.rows.filter((row) => row.required && !row.binding).forEach((row) => {
      problems.push({ code: "required_argument_unset", argument: row.name, message: `“${row.name}” is required by ${tool.name}.` });
    });
    layout.extras.forEach(({ binding }) => {
      const name = record(binding) && typeof binding.name === "string" ? binding.name : "";
      problems.push({ code: "unknown_argument", argument: name, message: `${tool.name} has no argument “${name}”; the tool would refuse it.` });
    });
  }
  const seen = new Set();
  const repeated = new Set();
  bindings.forEach((binding) => {
    const name = record(binding) ? binding.name : null;
    if (typeof name !== "string") return;
    if (seen.has(name)) repeated.add(name);
    seen.add(name);
  });
  repeated.forEach((name) => {
    problems.push({ code: "duplicate_argument", argument: name, message: `“${name}” is given more than once.` });
  });
  return problems;
}

/* ── Setting one argument ─────────────────────────────────────────────── */

/* `binding` null removes the row named `name`. A new row is placed in the
   schema's order among the rows already there; a name the schema does not
   declare is never created — only removed. */
export function with_argument(document, node_id, name, binding, order) {
  const node = record(document) && Array.isArray(document.nodes)
    ? document.nodes.find((candidate) => record(candidate) && candidate.id === node_id)
    : null;
  if (!node || node.type !== "tool_call") return document;
  const rows = node_bindings(node);
  const at = rows.findIndex((row) => record(row) && row.name === name);
  if (binding === null) {
    return at === -1 ? document : with_node_bindings(document, node_id, rows.filter((_, index) => index !== at));
  }
  const names = Array.isArray(order) ? order : [];
  if (!names.includes(name) || !record(binding) || binding.name !== name) return document;
  if (at !== -1) return with_node_bindings(document, node_id, rows.map((row, index) => (index === at ? binding : row)));
  const rank = names.indexOf(name);
  const after = rows.findIndex((row) => record(row) && names.includes(row.name) && names.indexOf(row.name) > rank);
  const next = after === -1 ? [...rows, binding] : [...rows.slice(0, after), binding, ...rows.slice(after)];
  return with_node_bindings(document, node_id, next);
}

/* ── Whether this Agent can run the tool by itself ───────────────────── */

/* At run start the tool must be in the chat's selected toolkits or a Toolkit
   Pool of the graph (`SkeletonProductionBindings._admit_toolkits`). Only the
   second is known while editing. */
export function tool_availability(document, tool_name, toolkit_id) {
  const pools = (record(document) && Array.isArray(document.nodes) ? document.nodes : [])
    .filter((node) => record(node) && node.type === "toolkit_pool" && record(node.config) && Array.isArray(node.config.toolkits));
  const covered = pools.some((pool) => pool.config.toolkits.some((entry) => record(entry) && entry.id === toolkit_id
    && (entry.enabled_tools === null || (Array.isArray(entry.enabled_tools) && entry.enabled_tools.includes(tool_name)))));
  return covered ? "attached" : "chat_only";
}
