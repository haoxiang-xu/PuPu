import { own } from "./document_values";
import { flow_outlets } from "./skeleton_graph_edits";
import { find_node, node_bindings, node_output_mappings } from "./skeleton_document";

/* If / Else and Switch / Case configuration — the pure half of #351.
 *
 * Shapes are the fixed runtime's (`unchain/skeleton/conditions.py`,
 * `execution.py`, `branch_admission.py`), measured on the pair before this was
 * written (native-advanced/branch-351/branch-candidate-capture-01):
 *
 *   if_else.config.execution     = {inputs, condition}
 *   switch_case.config.execution = {inputs, value, cases}
 *   condition = {kind: "all"|"any", conditions: [≥1 condition]}
 *             | {kind: "compare", operator, left, right?}
 *   operand   = {kind: "input", path} | {kind: "literal", value}
 *   case      = {id, value}   id non-empty, unique, never "default";
 *                             value a JSON scalar, unique by strict type
 *
 * Everything here returns new objects and never edits what it was handed. A
 * value this module cannot read is not rewritten into one it can: readers say
 * so, writers refuse, and the panel shows the stored value as it is.
 *
 * The backend admits several things at save that it refuses only when the
 * branch runs — a cross-type comparison, `contains` on a number, a duplicate
 * case value (refused at preflight). The problems below name those so the
 * author sees them before Run; they are warnings about the runtime's later
 * refusal, not a new admission gate. */

const is_record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has_own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const keys_are = (value, required, optional = []) =>
  is_record(value) &&
  required.every((key) => has_own(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

export const BRANCH_NODE_TYPES = Object.freeze(["if_else", "switch_case"]);
export const is_branch_type = (type) => BRANCH_NODE_TYPES.includes(type);

/* ── values ──────────────────────────────────────────────────────────── */

const MAX_DEPTH = 64;

/* JSON as the runtime's `_validate_json` admits it: finite numbers, plain
   arrays and objects, strings, booleans, null — bounded, never recursing on a
   caller's cyclic object. */
function is_json(value, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => is_json(item, depth + 1));
  if (is_record(value) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.keys(value).every((key) => is_json(value[key], depth + 1));
  }
  return false;
}

/* The JSON type of a literal, in the runtime's terms. `true` is not a number. */
export function json_type(value) {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : null;
  if (Array.isArray(value)) return "array";
  if (is_record(value)) return "object";
  return null;
}

const is_scalar = (value) => ["null", "string", "boolean", "number"].includes(json_type(value));

function is_path(value) {
  return Array.isArray(value) &&
    value.every((part) => typeof part === "string" || (Number.isInteger(part) && part >= 0));
}

/* ── which inputs this node has, and what type each can be proved to be ── */

const SCHEMA_TYPES = { string: "string", integer: "number", number: "number", boolean: "boolean", array: "array", object: "object", null: "null" };
/* A Tool Call's `error` is null when the call succeeded and `{code}` when it
   did not (tool_runtime.py `_execute`), so it has no one type to prove; its
   `result` is whatever the tool returned. Only `ok` is fixed. */
const CLOSED_RESULT_TYPES = {
  tool_call: { ok: "boolean" },
  skill_read: { content: "string", name: "string" },
};

function unique_node(document, node_id) {
  if (!is_record(document) || !Array.isArray(document.nodes)) return null;
  const found = document.nodes.filter((node) => is_record(node) && node.id === node_id);
  return found.length === 1 ? found[0] : null;
}

/* What a node's result holds at `path`, when the runtime fixes it: an Agent's
   message is text and its context an object; a JSON-schema root field has the
   type its schema declares; a Tool Call's ok and a Skill Read's fields
   are closed. A Start's result is whatever the caller sent, and anything one
   level further in is not claimed. */
function result_type(node, path) {
  if (!is_record(node) || path.length !== 1 || typeof path[0] !== "string") return null;
  const root = path[0];
  if (node.type === "agent") {
    if (root === "message") return "string";
    if (root === "context") return "object";
    const schema = is_record(node.config) && is_record(node.config.kernel) ? node.config.kernel.json_schema : null;
    const property = is_record(schema) && is_record(schema.properties) && has_own(schema.properties, root)
      ? schema.properties[root] : null;
    return is_record(property) && typeof property.type === "string" ? own(SCHEMA_TYPES, property.type) || null : null;
  }
  const closed = own(CLOSED_RESULT_TYPES, node.type);
  return closed ? own(closed, root) || null : null;
}

function expression_type(document, expression, depth) {
  if (depth > 8 || !is_record(expression)) return null;
  if (expression.kind === "literal") return json_type(expression.value);
  if (expression.kind === "first_present") {
    if (!Array.isArray(expression.values) || expression.values.length === 0) return null;
    const types = expression.values.map((value) => expression_type(document, value, depth + 1));
    return types.every((type) => type !== null && type === types[0]) ? types[0] : null;
  }
  if (expression.kind !== "ref" || !is_path(expression.path) || expression.path.length !== 1) return null;
  const upstream = unique_node(document, expression.node_id);
  const mappings = node_output_mappings(upstream).filter((mapping) => is_record(mapping) && mapping.name === expression.path[0]);
  if (mappings.length !== 1 || !is_record(mappings[0].source) || !is_path(mappings[0].source.path)) return null;
  const source = mappings[0].source;
  if (source.kind === "result") return result_type(upstream, source.path);
  if (source.kind === "input" && source.path.length === 1) {
    return input_value_type(document, upstream, source.path, depth + 1);
  }
  return null;
}

/* The type of `path` inside a node's resolved inputs, or `null` when the
   editor cannot prove it. Only a one-step path into a declared binding is
   followed; deeper reads and the caller's own Start values stay unknown. */
export function input_value_type(document, node, path, depth = 0) {
  if (!is_path(path) || path.length !== 1 || typeof path[0] !== "string") return null;
  const matches = node_bindings(node).filter((binding) => is_record(binding) && binding.name === path[0]);
  if (matches.length !== 1) return null;
  return expression_type(document, matches[0].value, depth);
}

export function input_names(node) {
  const names = [];
  node_bindings(node).forEach((binding) => {
    if (is_record(binding) && typeof binding.name === "string" && binding.name && !names.includes(binding.name)) {
      names.push(binding.name);
    }
  });
  return names;
}

/* ── operators ───────────────────────────────────────────────────────── */

const ALL = ["string", "number", "boolean", "array", "object"];
export const OPERATORS = Object.freeze([
  { value: "eq", label: "is", arity: 2, types: ALL },
  { value: "ne", label: "is not", arity: 2, types: ALL },
  { value: "gt", label: "is greater than", arity: 2, types: ["number"] },
  { value: "gte", label: "is at least", arity: 2, types: ["number"] },
  { value: "lt", label: "is less than", arity: 2, types: ["number"] },
  { value: "lte", label: "is at most", arity: 2, types: ["number"] },
  { value: "contains", label: "contains", arity: 2, types: ["string", "array"] },
  { value: "is_null", label: "is null", arity: 1, types: [...ALL, "null"] },
  { value: "is_not_null", label: "is not null", arity: 1, types: [...ALL, "null"] },
].map(Object.freeze));

const OPERATOR = new Map(OPERATORS.map((op) => [op.value, op]));
export const operator_info = (value) => (typeof value === "string" && OPERATOR.get(value)) || null;

/* Filtered only when the left side's type is proved; otherwise every operator
   is offered and the runtime checks the types when the branch runs. */
export function operators_for(type) {
  if (type === null || type === undefined) return [...OPERATORS];
  return OPERATORS.filter((op) => op.types.includes(type));
}

/* ── readability ─────────────────────────────────────────────────────── */

export function operand_is_readable(operand) {
  if (keys_are(operand, ["kind", "path"]) && operand.kind === "input") return is_path(operand.path);
  if (keys_are(operand, ["kind", "value"]) && operand.kind === "literal") return is_json(operand.value);
  return false;
}

export function condition_is_readable(condition, depth = 0) {
  if (depth > MAX_DEPTH || !is_record(condition)) return false;
  if (condition.kind === "all" || condition.kind === "any") {
    return keys_are(condition, ["kind", "conditions"]) && Array.isArray(condition.conditions) &&
      condition.conditions.every((child) => condition_is_readable(child, depth + 1));
  }
  if (condition.kind !== "compare" || !keys_are(condition, ["kind", "operator", "left"], ["right"])) return false;
  const op = operator_info(condition.operator);
  if (!op || !operand_is_readable(condition.left)) return false;
  if (op.arity === 1) return !has_own(condition, "right");
  return has_own(condition, "right") && operand_is_readable(condition.right);
}

/* Only the node itself, not its children: a group whose child cannot be read
   still shows its readable siblings. */
export function condition_node_is_readable(condition) {
  if (!is_record(condition)) return false;
  if (condition.kind === "all" || condition.kind === "any") {
    return keys_are(condition, ["kind", "conditions"]) && Array.isArray(condition.conditions);
  }
  return condition_is_readable(condition);
}

/* ── the tree, by path ───────────────────────────────────────────────── */

const is_group = (condition) => is_record(condition) && (condition.kind === "all" || condition.kind === "any") &&
  Array.isArray(condition.conditions);

export function condition_at(root, path) {
  let here = root;
  for (const index of path) {
    if (!is_group(here) || index < 0 || index >= here.conditions.length) return undefined;
    here = here.conditions[index];
  }
  return here;
}

export function with_condition_at(root, path, next) {
  if (path.length === 0) return next;
  if (!is_group(root)) return root;
  const [index, ...rest] = path;
  if (index < 0 || index >= root.conditions.length) return root;
  const child = with_condition_at(root.conditions[index], rest, next);
  if (child === root.conditions[index]) return root;
  return { ...root, conditions: root.conditions.map((old, at) => (at === index ? child : old)) };
}

/* Remove one child. A group never becomes empty this way — the runtime refuses
   an empty group — so removing a group's last child answers `null` and the
   caller removes the group itself instead. */
export function without_condition_at(root, path) {
  if (path.length === 0) return null;
  const parent_path = path.slice(0, -1);
  const parent = condition_at(root, parent_path);
  const index = path[path.length - 1];
  if (!is_group(parent) || index < 0 || index >= parent.conditions.length || parent.conditions.length <= 1) return null;
  return with_condition_at(root, parent_path, { ...parent, conditions: parent.conditions.filter((_, at) => at !== index) });
}

export function grouped_with(condition, kind, added) {
  return { kind, conditions: [condition, added] };
}

const LITERAL_FOR_TYPE = { number: 0, boolean: true, string: "" };

/* A comparison the author asked for, reading `name`. The literal matches the
   input's proved type, and is text when the type is unknown; nothing about the
   comparison is chosen beyond what is visible on the row. */
export function new_compare(document, node, name) {
  const type = input_value_type(document, node, [name]);
  return {
    kind: "compare",
    operator: "eq",
    left: { kind: "input", path: [name] },
    right: { kind: "literal", value: has_own(LITERAL_FOR_TYPE, type || "") ? LITERAL_FOR_TYPE[type] : "" },
  };
}

export function count_comparisons(condition) {
  if (is_group(condition)) return condition.conditions.reduce((sum, child) => sum + count_comparisons(child), 0);
  return is_record(condition) && condition.kind === "compare" ? 1 : 0;
}

/* ── problems the runtime will raise when the branch runs ─────────────── */

function operand_type(document, node, operand) {
  if (!is_record(operand)) return null;
  if (operand.kind === "literal") return json_type(operand.value);
  if (operand.kind === "input") return input_value_type(document, node, operand.path);
  return null;
}

const PROBLEM_TEXT = {
  unknown_input: (name) => `This node has no input named “${name}”. Add it above or pick another.`,
  type_mismatch: (a, b) => `Compares ${a} with ${b}. It saves, but the runtime refuses it when this branch runs.`,
  ordering_requires_numbers: () => "Greater/less comparisons need numbers on both sides; the runtime refuses anything else when this branch runs.",
  contains_requires_text_or_list: (a) => `“contains” works on text or a list, not on ${a}; the runtime refuses it when this branch runs.`,
  null_needs_null_operator: () => "null can only be compared with “is null” or “is not null”.",
};

const TYPE_WORD = { string: "text", number: "a number", boolean: "true/false", array: "a list", object: "an object", null: "null" };

export function compare_problems(document, node, condition) {
  if (!condition_is_readable(condition) || condition.kind !== "compare") return [];
  const problems = [];
  const names = input_names(node);
  for (const side of ["left", "right"]) {
    const operand = condition[side];
    if (operand && operand.kind === "input" && operand.path.length > 0 && typeof operand.path[0] === "string" &&
        Array.isArray(node_bindings(node)) && !names.includes(operand.path[0])) {
      problems.push({ code: "unknown_input", side, message: PROBLEM_TEXT.unknown_input(operand.path[0]) });
    }
  }
  const op = operator_info(condition.operator);
  if (op.arity === 1) return problems;
  if ([condition.left, condition.right].some((operand) => operand.kind === "literal" && operand.value === null)) {
    problems.push({ code: "null_needs_null_operator", side: "right", message: PROBLEM_TEXT.null_needs_null_operator() });
    return problems;
  }
  const left = operand_type(document, node, condition.left);
  const right = operand_type(document, node, condition.right);
  if (op.value === "eq" || op.value === "ne") {
    if (left && right && left !== right) {
      problems.push({ code: "type_mismatch", side: "right", message: PROBLEM_TEXT.type_mismatch(TYPE_WORD[left], TYPE_WORD[right]) });
    }
  } else if (op.value === "contains") {
    if (left && left !== "string" && left !== "array") {
      problems.push({ code: "contains_requires_text_or_list", side: "left", message: PROBLEM_TEXT.contains_requires_text_or_list(TYPE_WORD[left]) });
    } else if (left === "string" && right && right !== "string") {
      problems.push({ code: "type_mismatch", side: "right", message: PROBLEM_TEXT.type_mismatch("text", TYPE_WORD[right]) });
    }
  } else if ((left && left !== "number") || (right && right !== "number")) {
    problems.push({ code: "ordering_requires_numbers", side: left && left !== "number" ? "left" : "right", message: PROBLEM_TEXT.ordering_requires_numbers() });
  }
  return problems;
}

/* ── switch cases ────────────────────────────────────────────────────── */

/* Never a name some port already has, so a case outlet cannot be mistaken for
   the inlet or another outlet; `default` is reserved by the runtime itself. */
const RESERVED_CASE_IDS = new Set(["default", "in", "out", "true", "false", "attach_top", "attach_bot"]);

export function free_case_id(cases) {
  const taken = new Set((Array.isArray(cases) ? cases : [])
    .filter((entry) => is_record(entry) && typeof entry.id === "string").map((entry) => entry.id));
  for (let n = 1; ; n += 1) {
    const candidate = `case-${n}`;
    if (!taken.has(candidate) && !RESERVED_CASE_IDS.has(candidate)) return candidate;
  }
}

/* The runtime's `_case_key`: booleans, numbers, text and null are separate
   kinds, so `1`, `"1"` and `true` are three different cases while `1` and
   `1.0` are the same one. */
const case_key = (value) => `${json_type(value)}:${typeof value === "string" ? value : JSON.stringify(value)}`;

export function case_problems(cases) {
  const rows = [];
  const ids = new Set();
  const values = new Set();
  (Array.isArray(cases) ? cases : []).forEach((entry) => {
    const row = [];
    if (!is_record(entry)) {
      rows.push([{ code: "unreadable_case", message: "This case cannot be read. Remove it or replace it." }]);
      return;
    }
    if (typeof entry.id !== "string" || !entry.id) {
      row.push({ code: "missing_id", message: "This case has no id, so its outlet cannot be wired. Remove it and add a new case." });
    } else if (entry.id === "default") {
      row.push({ code: "reserved_id", message: "“default” is reserved for the Default outlet; the runtime refuses this case." });
    } else if (ids.has(entry.id)) {
      row.push({ code: "duplicate_id", message: "Another case already uses this id; the runtime refuses it." });
    } else {
      ids.add(entry.id);
    }
    if (!has_own(entry, "value")) {
      row.push({ code: "missing_value", message: "This case has no value yet." });
    } else if (!is_scalar(entry.value)) {
      row.push({ code: "not_a_scalar", message: "A case value is one piece of text, a number, true/false or null." });
    } else if (values.has(case_key(entry.value))) {
      row.push({ code: "duplicate_value", message: "Another case already matches this value; the runtime refuses the Switch before it runs." });
    } else {
      values.add(case_key(entry.value));
    }
    rows.push(row);
  });
  return rows;
}

export function case_display(entry) {
  if (!is_record(entry) || !has_own(entry, "value") || !is_scalar(entry.value)) return "(not a single value)";
  const { value } = entry;
  if (typeof value === "string") return value === "" ? "(empty text)" : `“${value}”`;
  return value === null ? "null" : String(value);
}

export function move_case(cases, from, to) {
  if (!Array.isArray(cases) || from < 0 || from >= cases.length || to < 0 || to >= cases.length || from === to) return cases;
  const next = [...cases];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function editable_branch(document, node_id) {
  if (!is_record(document) || document.kind !== "agent" || document.schema_version !== 1 ||
      !Array.isArray(document.nodes) || !Array.isArray(document.edges)) return null;
  const node = unique_node(document, node_id);
  if (!node || !is_branch_type(node.type) || !is_record(node.config) || !is_record(node.config.execution)) return null;
  return node;
}

/* Write one field of a branch's execution config, or delete it with
   `undefined`. Every other key — the inputs, an unknown key, the rest of the
   node — is carried over by reference. A node that is not exactly one branch
   with a readable execution object is not written. */
export function with_branch_execution(document, node_id, key, value) {
  const node = editable_branch(document, node_id);
  if (!node) return document;
  const execution = { ...node.config.execution };
  if (value === undefined) delete execution[key];
  else execution[key] = value;
  const next = { ...node, config: { ...node.config, execution } };
  return { ...document, nodes: document.nodes.map((entry) => (entry === node ? next : entry)) };
}

/* Removing a case removes its outlet. An edge still leaving through that
   outlet would save and pass preflight, then stop the run (measured), so the
   case and exactly its own edge go together in one edit — after the panel has
   asked. */
export function remove_case(document, node_id, case_id) {
  const node = editable_branch(document, node_id);
  const cases = node && node.type === "switch_case" ? node.config.execution.cases : null;
  if (!Array.isArray(cases)) return { document, removed_edge_ids: [] };
  const index = cases.findIndex((entry) => is_record(entry) && entry.id === case_id);
  if (index < 0) return { document, removed_edge_ids: [] };
  const written = with_branch_execution(document, node_id, "cases", cases.filter((_, at) => at !== index));
  const leaving = (edge) => is_record(edge) && edge.kind === "flow" && edge.source_node_id === node_id && edge.source_port_id === case_id;
  const removed_edge_ids = written.edges.filter(leaving).map((edge) => edge.id);
  return { document: { ...written, edges: written.edges.filter((edge) => !leaving(edge)) }, removed_edge_ids };
}

export function outlet_edges(document, node_id, port_id) {
  if (!is_record(document) || !Array.isArray(document.edges)) return [];
  return document.edges.filter((edge) => is_record(edge) && edge.kind === "flow" &&
    edge.source_node_id === node_id && edge.source_port_id === port_id);
}

/* ── canvas ports and rows ───────────────────────────────────────────── */

const IN_PORT = Object.freeze({ id: "in", side: "left", kind: "in" });
const IF_LABEL = { true: "True", false: "False" };

/* What the drawing of a branch shows: its inlet, one outlet row per declared
   outlet in order, and any outlet an existing edge still leaves through that
   is not declared any more — drawn and named, never hidden, because a hidden
   edge reads as one that does not exist. */
export function branch_ports(document, node) {
  const declared = flow_outlets(node);
  const rows = [];
  const seen = new Set(["in"]);
  const push = (port_id, label, is_declared) => {
    if (seen.has(port_id)) return;
    seen.add(port_id);
    rows.push({ port_id, label, declared: is_declared });
  };
  if (declared.ok) {
    const cases = node && node.type === "switch_case" ? node.config.execution.cases : [];
    declared.outlets.forEach((port_id) => {
      if (node.type === "if_else") push(port_id, IF_LABEL[port_id], true);
      else if (port_id === "default") push(port_id, "Default", true);
      else push(port_id, case_display(cases.find((entry) => entry.id === port_id)), true);
    });
  }
  const edges = is_record(document) && Array.isArray(document.edges) ? document.edges : [];
  edges.forEach((edge) => {
    if (is_record(edge) && edge.kind === "flow" && is_record(node) && edge.source_node_id === node.id &&
        typeof edge.source_port_id === "string" && edge.source_port_id) {
      push(edge.source_port_id, edge.source_port_id, false);
    }
  });
  return {
    ports: [IN_PORT, ...rows.map((row) => ({ id: row.port_id, side: "right", kind: "out" }))].map((port) => ({ ...port })),
    rows,
    readable: declared.ok,
  };
}

export function branch_node(document, node_id) {
  const node = find_node(document, node_id);
  return node && is_branch_type(node.type) ? node : null;
}

/* One line for the canvas and the panel header, read from the stored config
   and never claiming more than it shows. */
export function branch_summary(node) {
  const execution = is_record(node) && is_record(node.config) && is_record(node.config.execution)
    ? node.config.execution : null;
  if (!execution) return "Settings not readable";
  if (node.type === "if_else") {
    if (!has_own(execution, "condition")) return "No condition yet";
    if (!condition_is_readable(execution.condition)) return "Condition kept as stored";
    const n = count_comparisons(execution.condition);
    return `${n} comparison${n === 1 ? "" : "s"}`;
  }
  if (!has_own(execution, "value")) return "No value yet";
  const value = execution.value;
  if (!operand_is_readable(value)) return "Value kept as stored";
  if (value.kind === "literal") return "On a fixed value";
  return value.path.length ? `On ${value.path.map(String).join(".")}` : "On all inputs";
}

/* Which of `source_ids` a node can be reached without: a path from the single
   Start to `node_id` that never passes through the source means the source
   may not have run when this node reads it. Only flow edges count. With no
   single Start nothing is claimed — the set is empty, not a guess. */
export function conditional_sources(document, node_id, source_ids) {
  const result = new Set();
  if (!is_record(document) || !Array.isArray(document.nodes) || !Array.isArray(document.edges)) return result;
  const starts = document.nodes.filter((node) => is_record(node) && node.type === "start");
  if (starts.length !== 1 || typeof starts[0].id !== "string") return result;
  const next = new Map();
  document.edges.forEach((edge) => {
    if (!is_record(edge) || edge.kind !== "flow" || typeof edge.source_node_id !== "string" || typeof edge.target_node_id !== "string") return;
    if (!next.has(edge.source_node_id)) next.set(edge.source_node_id, []);
    next.get(edge.source_node_id).push(edge.target_node_id);
  });
  const reaches_avoiding = (avoid) => {
    const start = starts[0].id;
    if (start === avoid) return false;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const here = queue.shift();
      if (here === node_id) return true;
      for (const there of next.get(here) || []) {
        if (there !== avoid && !seen.has(there)) {
          seen.add(there);
          queue.push(there);
        }
      }
    }
    return false;
  };
  source_ids.forEach((id) => {
    if (id !== node_id && reaches_avoiding(id)) result.add(id);
  });
  return result;
}
