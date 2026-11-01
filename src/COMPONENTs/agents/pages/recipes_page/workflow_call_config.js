import { node_bindings, with_node_bindings } from "./skeleton_document";
import { safe_text } from "./document_values";
import { cached_workflow_version, workflow_version_state } from "./workflow_versions";

/* The Workflow Call node's configuration (#357).
 *
 * Everything here mirrors the fixed installed runtime and host, measured
 * before it was written (workflow-call-01/out/wfc-store-capture.json, frozen
 * as workflow_call_capture.json):
 *
 *   config           CLOSED {execution, workflow} (`execution._validate_all`;
 *                    `on_error` → unknown_field at preflight)
 *   config.workflow  CLOSED {workflow_id, revision_id}, both non-empty
 *                    strings: one published revision, pinned. There is no
 *                    "latest": the run resolves exactly this revision
 *                    (`workflow_runtime._resolve`)
 *   inputs           the node's resolved inputs become the called Workflow's
 *                    run input — the object its Start reads. Each Start output
 *                    `{source: {kind: "result", path: [k, …]}}` reads key k;
 *                    a key that is not supplied fails the CHILD at its Start
 *                    (`missing_value`), and the call then fails
 *                    (`child_failed`). An extra key is ignored.
 *   result           the called Workflow's End exports, by their names
 *   failure          no error policy: a child that does not complete fails
 *                    this node `child_<status>` (`workflow_runtime.__call__`)
 *
 * The store saves any of these shapes and its draft check says nothing about
 * them. Preflight checks only that the pinned revision exists and is a
 * Workflow, and that the reference is well formed: inputs that do not match
 * the callee's Start, and outputs rooted at a name its End does not export,
 * all pass preflight and fail only when the run gets there. So the panel says
 * those itself, from the pinned revision's own document, and never writes a
 * value the author did not choose. */

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const SETTING_KEYS = ["execution", "workflow"];

export function workflow_reference(node) {
  const config = node && node.config;
  return own(config, "workflow") ? config.workflow : undefined;
}

/* The pin, when it is exactly the runtime's shape; null otherwise. */
export function pinned_reference(node) {
  const workflow = workflow_reference(node);
  if (!record(workflow) || Object.keys(workflow).length !== 2) return null;
  const { workflow_id, revision_id } = workflow;
  if (typeof workflow_id !== "string" || !workflow_id || typeof revision_id !== "string" || !revision_id) return null;
  return { workflow_id, revision_id };
}

/* Writes `config.workflow` of exactly one Workflow Call node; everything else
   in its config is kept as it was. */
export function with_workflow_reference(document, node_id, workflow) {
  if (!record(document) || !Array.isArray(document.nodes) || !record(workflow)) return document;
  const matches = document.nodes.filter((node) => record(node) && node.id === node_id);
  if (matches.length !== 1 || matches[0].type !== "workflow_call" || !record(matches[0].config)) return document;
  const target = matches[0];
  return {
    ...document,
    nodes: document.nodes.map((node) => (node === target ? { ...node, config: { ...node.config, workflow } } : node)),
  };
}

/* ── What the called Workflow takes and gives ──────────────────────────── */

const node_of = (document, type) =>
  (record(document) && Array.isArray(document.nodes) ? document.nodes : []).filter((node) => record(node) && node.type === type);
const outputs_of = (node) =>
  record(node.config) && record(node.config.execution) && Array.isArray(node.config.execution.outputs)
    ? node.config.execution.outputs
    : [];

/* From one published revision's document:
 *   inputs   the keys its Start reads from the run input, in Start's order,
 *            each with the Start outputs that read it;
 *   whole    true when a Start output reads the whole input (an empty path),
 *            which no key list describes;
 *   outputs  the names its End exports.
 * A document this editor cannot read answers `readable: false` and no lists,
 * never a guess. */
export function callee_interface(document) {
  const starts = node_of(document, "start");
  const ends = node_of(document, "end");
  if (starts.length !== 1 || ends.length !== 1) return { readable: false, inputs: [], whole: false, outputs: [] };
  const inputs = [];
  let whole = false;
  outputs_of(starts[0]).forEach((output) => {
    if (!record(output) || !record(output.source) || output.source.kind !== "result" || !Array.isArray(output.source.path)) return;
    const path = output.source.path;
    if (path.length === 0) {
      whole = true;
      return;
    }
    const key = path[0];
    if (typeof key !== "string" || !key) return;
    const found = inputs.find((item) => item.key === key);
    if (found) found.read_as.push(output.name);
    else inputs.push({ key, read_as: [output.name] });
  });
  const outputs = [];
  outputs_of(ends[0]).forEach((output) => {
    if (record(output) && typeof output.name === "string" && output.name && !outputs.includes(output.name)) outputs.push(output.name);
  });
  return { readable: true, inputs, whole, outputs };
}

/* Every stored row, each drawn once (R-WFC-02): for each key the callee
   reads, the FIRST row with that name; every other row apart, with its index
   and whether an earlier row already has its name — a duplicate the store
   refuses (`duplicate_name`), shown so it can be removed rather than hidden
   behind the first. Nothing is normalized on the way in. */
export function call_input_layout(shape, bindings) {
  const list = Array.isArray(bindings) ? bindings : [];
  const keys = shape && shape.readable ? shape.inputs.map((item) => item.key) : [];
  const claimed = new Set();
  const rows = keys.map((key) => {
    const index = list.findIndex((binding) => record(binding) && binding.name === key);
    if (index !== -1) claimed.add(index);
    const entry = shape.inputs.find((item) => item.key === key);
    return { name: key, read_as: entry.read_as, binding: index === -1 ? null : list[index], index };
  });
  const seen = new Set();
  const extras = [];
  list.forEach((binding, index) => {
    const name = record(binding) && typeof binding.name === "string" ? binding.name : null;
    const duplicate = name !== null && seen.has(name);
    if (name !== null) seen.add(name);
    if (!claimed.has(index)) extras.push({ binding, index, duplicate });
  });
  return { rows, extras };
}

/* `binding` null removes the row named `name`. A new row is placed in the
   callee's order among the rows already there; a name the callee does not
   read is never created — only removed (`remove_call_input`). */
export function with_call_input(document, node_id, name, binding, order) {
  const node = record(document) && Array.isArray(document.nodes)
    ? document.nodes.find((candidate) => record(candidate) && candidate.id === node_id)
    : null;
  if (!node || node.type !== "workflow_call") return document;
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

/* Removes the row at `index`, whatever it holds: the one action for a row the
   callee does not read, or one this editor cannot read at all. */
export function remove_call_input(document, node_id, index) {
  const node = record(document) && Array.isArray(document.nodes)
    ? document.nodes.find((candidate) => record(candidate) && candidate.id === node_id)
    : null;
  if (!node || node.type !== "workflow_call") return document;
  const rows = node_bindings(node);
  if (!Number.isSafeInteger(index) || index < 0 || index >= rows.length) return document;
  return with_node_bindings(document, node_id, rows.filter((_, at) => at !== index));
}

/* ── The result, for the Output Variables ─────────────────────────────── */

/* Known and closed once the pinned revision has been read: the result is
   exactly what its End exports. Until then, or with no valid pin, nothing is
   offered and the reason says why. */
export function workflow_call_result_roots(node) {
  const pin = pinned_reference(node);
  if (!pin) {
    return { known: false, roots: [], closed: false, reason: "Pin a published Workflow revision; its End's exports are what this node produces." };
  }
  const version = cached_workflow_version(pin.workflow_id, pin.revision_id);
  if (!version) {
    return { known: false, roots: [], closed: false, reason: "The pinned revision has not been read yet, so its exports are not listed." };
  }
  const shape = callee_interface(version.document);
  if (!shape.readable) {
    return { known: false, roots: [], closed: false, reason: "The pinned revision's Start and End are not a shape this editor can read." };
  }
  return { known: true, roots: shape.outputs, closed: true, reason: null };
}

/* ── What the panel says is wrong ─────────────────────────────────────── */

export function workflow_call_problems(node) {
  const problems = [];
  const config = node && node.config;
  if (record(config)) {
    Object.keys(config).filter((key) => !SETTING_KEYS.includes(key)).forEach((key) => {
      problems.push({ code: "unknown_setting", setting: key, message: `This runtime does not read the setting “${safe_text(key)}”; a stored copy is refused when the run starts.` });
    });
  }
  const workflow = workflow_reference(node);
  if (workflow === undefined) {
    problems.push({ code: "workflow_missing", message: "Choose a Workflow and pin one of its published revisions." });
    return problems;
  }
  const pin = pinned_reference(node);
  if (!pin) {
    problems.push({ code: "workflow_invalid", message: "The stored reference is not exactly {workflow_id, revision_id}, both named; the run refuses it." });
    return problems;
  }
  const state = workflow_version_state(pin.workflow_id, pin.revision_id);
  if (state && (state.status === "refused" || state.status === "unavailable")) {
    const missing = state.error && state.error.code === "resource_missing";
    problems.push({
      code: missing ? "revision_missing" : "revision_unreadable",
      message: missing
        ? `No published revision “${safe_text(pin.revision_id)}” of “${safe_text(pin.workflow_id)}” exists; the run refuses it.`
        : `The pinned revision could not be read: ${safe_text((state.error && (state.error.message || state.error.code)) || "the store refused")}.`,
    });
    return problems;
  }
  const version = state && state.status === "ready" ? state.version : null;
  if (!version) return problems;
  const shape = callee_interface(version.document);
  if (!shape.readable) return problems;
  const bindings = node_bindings(node);
  shape.inputs.forEach(({ key }) => {
    if (!bindings.some((binding) => record(binding) && binding.name === key)) {
      problems.push({ code: "input_missing", setting: key, message: `The called Workflow's Start reads “${safe_text(key)}”. Without it the call fails when the run gets here.` });
    }
  });
  const outputs = record(config) && record(config.execution) && Array.isArray(config.execution.outputs) ? config.execution.outputs : [];
  outputs.forEach((output, index) => {
    const path = record(output) && record(output.source) && output.source.kind === "result" ? output.source.path : null;
    const root = Array.isArray(path) ? path[0] : undefined;
    if (typeof root === "string" && !shape.outputs.includes(root)) {
      problems.push({ code: "output_undeclared", setting: index, message: `“${safe_text(root)}” is not something the pinned revision's End exports; that output would be missing when the run gets here.` });
    }
  });
  return problems;
}

export const WORKFLOW_CALL_FAILURE_NOTE =
  "There is no error policy to choose: if the called Workflow does not complete, this node fails with child_failed, child_cancelled or child_outcome_unknown.";
