import { safe_text } from "./document_values";
import { cached_workflow_version } from "./workflow_versions";

/* The Hooks Pool's configuration (#357).
 *
 * Everything here mirrors the fixed installed runtime and host, measured
 * before it was written (hooks-pool-01/out/hooks-store-capture.json, frozen
 * as hooks_pool_capture.json):
 *
 *   config       CLOSED {hooks}; `hooks` a NON-EMPTY list
 *                (`hooks_config.validate_hooks_pool_config`)
 *   entry        CLOSED {id, order, event, tool_name, workflow, force_approval}
 *                plus, on a runtime whose Hook contract says so, the optional
 *                `enabled` (a boolean). It is read from
 *                getSkeletonHookCapabilities(), never assumed: missing runs
 *                as before and is not written, false is stored but does not
 *                run, anything else preflight refuses
 *                (hooks_enable_order_capture.json, new fixed pair)
 *     id         non-empty text, unique in the pool — and in every pool
 *                attached to the same Kernel (the run's own admission,
 *                `SkeletonHookRuntime`; preflight does NOT check this one)
 *     order      an integer 0 … 1 000 000 (not a boolean, not a float)
 *     event      before_tool_call | after_tool_call
 *     tool_name  one tool's exact name, or null for every tool, or — only
 *                where the host's tool-set contract says the runtime reads it
 *                (getSkeletonHookToolSetCapabilities) — a non-empty list of
 *                distinct exact names, kept in its stored order. A name is
 *                blank by Python's str.strip(), not JavaScript's trim(): "\x1c"
 *                and "\x85" are blank, "\ufeff" is not
 *                (hook_tool_set_capture.json, fixed pair 447fe170)
 *     workflow   CLOSED {workflow_id, revision_id}: one published revision,
 *                pinned — or, only where the host's Hook Workflow contract
 *                says the runtime reads it (getSkeletonHookWorkflowCapabilities,
 *                producer c5c01351), CLOSED {kind: "embedded", document}: a
 *                Workflow graph this resource owns, saved with it, its Code
 *                text at its full address inside the parent
 *     force_approval  a boolean; ORed into the tool's approval requirement
 *   order of runs  every entry of every pool attached to one Kernel that is
 *                not off, sorted by (order, id) (`attached_hooks`); where the
 *                pools are attached does not matter. An off hook is not in
 *                the run and is not counted for the Kernel-wide id check, but
 *                still counts for its own pool's.
 *   attachment   a pool runs only when an attach edge joins it to an Agent;
 *                the draft check reports `pool_attachment_required` otherwise
 *
 * The store saves every shape and its draft check says nothing about an
 * entry; preflight names one problem at a time. So the panel states them all
 * itself, and never writes a value the author did not choose: a new entry
 * has only the id that addresses it, and each control writes its own key. */

export const HOOK_EVENTS = Object.freeze(["before_tool_call", "after_tool_call"]);
export const MAX_ORDER = 1000000;
export const HOOK_KEYS = Object.freeze(["id", "order", "event", "tool_name", "workflow", "force_approval"]);
export const HOOK_OPTIONAL_KEYS = Object.freeze(["enabled"]);

/* A capability is `{status: "ready", contract}` only after the host answered
   with the closed Hook contract; anything else is "not known". */
export const enable_supported = (capability) =>
  Boolean(capability && capability.status === "ready" && capability.contract &&
    Array.isArray(capability.contract.optional_fields) && capability.contract.optional_fields.includes("enabled"));

export const embedded_supported = (capability) =>
  Boolean(capability && capability.status === "ready" && capability.contract &&
    capability.contract.embedded_kind === "embedded" && capability.contract.document_kind === "workflow");

/* A hook's own Workflow, or null: the closed embedded source and nothing
   else. */
export function hook_embedded(entry) {
  const workflow = record(entry) ? entry.workflow : null;
  if (!record(workflow) || Object.keys(workflow).length !== 2 || workflow.kind !== "embedded" || !has(workflow, "document")) return null;
  return workflow.document;
}

export const tool_set_supported = (capability) =>
  Boolean(capability && capability.status === "ready" && capability.contract &&
    capability.contract.set_type === "array" && capability.contract.minimum_size === 1);

/* Python str.isspace(): what the runtime's str.strip() removes. */
const PY_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0,
  0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
/* A name the runtime accepts: a string with something left after str.strip(). */
export const tool_name_ok = (value) =>
  typeof value === "string" && Array.from(value).some((ch) => !PY_SPACE.has(ch.codePointAt(0)));

/* What a stored tool_name is: every tool, one tool, a set, or something else. */
export function tool_matcher_kind(entry) {
  if (!has(entry, "tool_name")) return null;
  const value = entry.tool_name;
  if (value === null) return "every";
  if (typeof value === "string") return "one";
  if (Array.isArray(value)) return "set";
  return "other";
}

/* A stored set's problems, in the runtime's terms (empty, a member that is not
   a name, a repeated name). */
export function tool_set_problems(list) {
  if (!Array.isArray(list)) return [];
  if (list.length === 0) return [{ code: "tool_set_empty", message: "This set of tools is empty; preflight refuses it. Pick at least one tool, or choose every tool." }];
  const problems = [];
  const seen = new Set();
  list.forEach((name, at) => {
    if (!tool_name_ok(name)) {
      problems.push({ code: "tool_set_member_invalid", message: `Tool ${at + 1} in the set is ${safe_text(JSON.stringify(name) ?? String(name))}, not a tool name; preflight refuses it.` });
    } else if (seen.has(name)) {
      problems.push({ code: "tool_set_duplicate", message: `“${safe_text(name)}” is in the set twice; preflight refuses it.` });
    } else {
      seen.add(name);
    }
  });
  return problems;
}

/* Whether the run calls this entry: everything but an explicit false. */
export const hook_runs = (entry) => !(record(entry) && entry.enabled === false);

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const text_ok = (value) => typeof value === "string" && value.trim() !== "";

export function hooks_list(node) {
  const config = node && node.config;
  return has(config, "hooks") ? config.hooks : undefined;
}

/* Writes `config.hooks` of exactly one Hooks Pool node. */
export function with_hooks(document, node_id, hooks) {
  if (!record(document) || !Array.isArray(document.nodes) || !Array.isArray(hooks)) return document;
  const matches = document.nodes.filter((node) => record(node) && node.id === node_id);
  if (matches.length !== 1 || matches[0].type !== "hooks_pool" || !record(matches[0].config)) return document;
  const target = matches[0];
  return { ...document, nodes: document.nodes.map((node) => (node === target ? { ...node, config: { ...node.config, hooks } } : node)) };
}

/* One hook turned on or off: only its `enabled`, only to a boolean. */
export function with_hook_enabled(document, node_id, index, enabled) {
  if (typeof enabled !== "boolean") return document;
  const node = record(document) && Array.isArray(document.nodes) ? document.nodes.find((item) => record(item) && item.id === node_id) : null;
  const list = node ? hooks_list(node) : undefined;
  if (!Array.isArray(list) || !Number.isSafeInteger(index) || index < 0 || index >= list.length || !record(list[index])) return document;
  return with_hook(document, node_id, index, { ...list[index], enabled });
}

/* One entry replaced by position, the rest of the list as it was. Only when
   the stored list IS a list: a non-list is shown raw and replaced only by the
   explicit "Start a new list" action. */
export function with_hook(document, node_id, index, entry) {
  const node = record(document) && Array.isArray(document.nodes) ? document.nodes.find((item) => record(item) && item.id === node_id) : null;
  const list = node ? hooks_list(node) : undefined;
  if (!Array.isArray(list) || !Number.isSafeInteger(index) || index < 0 || index >= list.length) return document;
  return with_hooks(document, node_id, list.map((item, at) => (at === index ? entry : item)));
}

export function remove_hook(document, node_id, index) {
  const node = record(document) && Array.isArray(document.nodes) ? document.nodes.find((item) => record(item) && item.id === node_id) : null;
  const list = node ? hooks_list(node) : undefined;
  if (!Array.isArray(list) || !Number.isSafeInteger(index) || index < 0 || index >= list.length) return document;
  return with_hooks(document, node_id, list.filter((_, at) => at !== index));
}

/* A new entry carries only an id nobody in the Kernel's scope uses; every
   other field is the author's to choose. */
export function free_hook_id(taken) {
  const used = new Set(taken);
  for (let n = 1; ; n += 1) {
    const id = `hook-${n}`;
    if (!used.has(id)) return id;
  }
}

/* ── Where a pool runs ─────────────────────────────────────────────────── */

const attach_edges = (document) =>
  (record(document) && Array.isArray(document.edges) ? document.edges : []).filter((edge) => record(edge) && edge.kind === "attach");
const node_by_id = (document, id) =>
  (record(document) && Array.isArray(document.nodes) ? document.nodes : []).find((node) => record(node) && node.id === id) || null;

/* The Agents this pool is attached to. */
export function attached_agents(document, pool_id) {
  const agents = [];
  attach_edges(document).forEach((edge) => {
    const other = edge.source_node_id === pool_id ? edge.target_node_id : edge.target_node_id === pool_id ? edge.source_node_id : null;
    const node = other !== null ? node_by_id(document, other) : null;
    if (node && node.type === "agent" && !agents.includes(node.id)) agents.push(node.id);
  });
  return agents;
}

/* Every hook in one Agent's scope, on or off, by (order, id): every entry of
   every attached pool with a usable id and order. Entries the run would
   refuse are left out, and said elsewhere. */
export function hook_scope_entries(document, agent_id) {
  const pools = [];
  attach_edges(document).forEach((edge) => {
    const other = edge.source_node_id === agent_id ? edge.target_node_id : edge.target_node_id === agent_id ? edge.source_node_id : null;
    const node = other !== null ? node_by_id(document, other) : null;
    if (node && node.type === "hooks_pool" && !pools.includes(node)) pools.push(node);
  });
  const entries = [];
  pools.forEach((pool) => {
    const list = hooks_list(pool);
    (Array.isArray(list) ? list : []).forEach((entry, index) => {
      if (record(entry) && typeof entry.id === "string" && Number.isSafeInteger(entry.order) && typeof entry.order !== "boolean") {
        entries.push({ pool_id: pool.id, index, id: entry.id, order: entry.order, event: entry.event, runs: hook_runs(entry) });
      }
    });
  });
  return entries.sort(by_run_key);
}

/* Ids compare as the runtime compares them: Python orders str by Unicode code
   point. JavaScript's `<` compares UTF-16 code units, which disagrees when a
   character outside the BMP meets one from U+E000–U+FFFF; locale collation
   is neither. Ids are compared as stored, never restricted or rewritten. */
export function code_point_compare(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}
const id_after = (a, b) => code_point_compare(a, b) > 0;
const id_before = (a, b) => code_point_compare(a, b) < 0;

const by_run_key = (a, b) => (a.order - b.order) || code_point_compare(a.id, b.id);

/* Every hook that runs on one Agent, in the order the run calls them. */
export function kernel_hook_order(document, agent_id) {
  return hook_scope_entries(document, agent_id).filter((item) => item.runs);
}

/* Move one hook of this pool to `position` in the Agent's scope (on and off
   hooks, by (order, id); `position` counts the scope without the hook). The
   move is made by writing real `order` values, never by reordering the stored
   list: first the moved hook's own order, if one fits between its new
   neighbours; otherwise this pool's hooks are given the orders the new
   sequence needs, keeping a stored order wherever it still fits. A hook of
   another pool is never written; when it is in the way the move is refused. */
export function move_hook(document, pool_id, agent_id, index, position) {
  const refuse = (code, message) => ({ ok: false, document, problem: { code, message } });
  const scope = hook_scope_entries(document, agent_id);
  const moving = scope.find((item) => item.pool_id === pool_id && item.index === index);
  if (!moving) return refuse("not_movable", "Give this hook an id and a whole-number order first; only then does it have a place in the run.");
  const rest = scope.filter((item) => item !== moving);
  /* A place is 0 … rest.length; anything else is not a move (a drop on the
     hook itself, for one), and nothing is written. */
  if (!Number.isSafeInteger(position) || position < 0 || position > rest.length) {
    return refuse("not_a_place", "That is not a place in the run. Nothing was changed.");
  }
  const at = position;
  const wanted = [...rest.slice(0, at), moving, ...rest.slice(at)];
  if (wanted.every((item, i) => item === scope[i])) return { ok: true, document, problem: null };
  const after = (key, prev) => !prev || key.order > prev.order || (key.order === prev.order && id_after(key.id, prev.id));
  const assign = (keep) => {
    const orders = new Map();
    let prev = null;
    for (let i = 0; i < wanted.length; i += 1) {
      const item = wanted[i];
      if (item.pool_id !== pool_id) {
        if (!after(item, prev)) return null;
        prev = item;
        continue;
      }
      const least = !prev ? 0 : id_after(item.id, prev.id) ? prev.order : prev.order + 1;
      const order = keep && item.order >= least && after(item, prev) ? item.order : least;
      if (order > MAX_ORDER) return null;
      orders.set(item.index, order);
      prev = { order, id: item.id };
    }
    return orders;
  };
  /* The moved hook alone, between its new neighbours. */
  const before = wanted[at - 1] || null;
  const next = wanted[at + 1] || null;
  const low = !before ? 0 : id_after(moving.id, before.id) ? before.order : before.order + 1;
  const high = !next ? MAX_ORDER : id_before(moving.id, next.id) ? next.order : next.order - 1;
  let orders = null;
  if (low <= high) orders = new Map([[moving.index, Math.min(Math.max(moving.order, low), high)]]);
  if (!orders) orders = assign(true) || assign(false);
  if (!orders) {
    return refuse("order_does_not_fit", "A hook from another pool on this Agent sits where this one would go, and only this pool's hooks are written here. Change that pool's order, or move this one elsewhere.");
  }
  const node = node_by_id(document, pool_id);
  const list = hooks_list(node);
  const next_list = list.map((entry, i) => (orders.has(i) && entry.order !== orders.get(i) ? { ...entry, order: orders.get(i) } : entry));
  const next_document = with_hooks(document, pool_id, next_list);
  const check = hook_scope_entries(next_document, agent_id);
  if (check.length !== wanted.length || check.some((item, i) => item.pool_id !== wanted[i].pool_id || item.index !== wanted[i].index)) {
    return refuse("order_does_not_fit", "These orders cannot put the hook there. Nothing was changed.");
  }
  return { ok: true, document: next_document, problem: null };
}

/* ── What the pinned Workflow takes and returns ────────────────────────── */

/* What the run hands the Hook Workflow's Start, per event (`hooks_runtime`). */
export const EVENT_INPUT_KEYS = Object.freeze({
  before_tool_call: Object.freeze(["event", "call_id", "tool_name", "arguments"]),
  after_tool_call: Object.freeze(["event", "call_id", "tool_name", "arguments", "raw_result", "visible_result"]),
});

/* The decision the run accepts, per event, as the End's export names (the
   End's exports ARE the decision object). */
export const DECISION_SHAPES = Object.freeze({
  before_tool_call: Object.freeze([
    Object.freeze({ label: "continue", keys: Object.freeze(["decision", "require_approval"]) }),
    Object.freeze({ label: "continue with new arguments", keys: Object.freeze(["arguments", "decision", "require_approval"]) }),
    Object.freeze({ label: "block", keys: Object.freeze(["decision", "reason"]) }),
  ]),
  after_tool_call: Object.freeze([
    Object.freeze({ label: "continue", keys: Object.freeze(["decision"]) }),
    Object.freeze({ label: "replace the result", keys: Object.freeze(["decision", "result"]) }),
  ]),
});

const outputs_of = (node) =>
  record(node) && record(node.config) && record(node.config.execution) && Array.isArray(node.config.execution.outputs) ? node.config.execution.outputs : [];
const one_of = (document, type) => {
  const list = (record(document) && Array.isArray(document.nodes) ? document.nodes : []).filter((node) => record(node) && node.type === type);
  return list.length === 1 ? list[0] : null;
};

/* From one published revision: the keys its Start reads and the names its End
   exports. */
export function hook_workflow_shape(document) {
  const start = one_of(document, "start");
  const end = one_of(document, "end");
  if (!start || !end) return { readable: false, reads: [], whole: false, exports: [] };
  const reads = [];
  let whole = false;
  outputs_of(start).forEach((output) => {
    const path = record(output) && record(output.source) && output.source.kind === "result" ? output.source.path : null;
    if (!Array.isArray(path)) return;
    if (path.length === 0) whole = true;
    else if (typeof path[0] === "string" && !reads.includes(path[0])) reads.push(path[0]);
  });
  const exports = [];
  outputs_of(end).forEach((output) => {
    if (record(output) && typeof output.name === "string" && output.name && !exports.includes(output.name)) exports.push(output.name);
  });
  return { readable: true, reads, whole, exports };
}

/* Whether the End's export names can be a decision for this event. Only the
   NAMES are known here; the values are what the Workflow computes when the
   run gets there, and a wrong value is the run's to refuse. */
export function decision_fit(event, shape) {
  const shapes = DECISION_SHAPES[event];
  if (!shapes || !shape || !shape.readable) return { known: false, matches: [] };
  const names = [...shape.exports].sort().join(",");
  return { known: true, matches: shapes.filter((item) => [...item.keys].sort().join(",") === names).map((item) => item.label) };
}

/* ── What the panel says is wrong ─────────────────────────────────────── */

/* Problems of one stored entry, in the runtime's terms, plus what preflight
   does not check: an id another pool on the same Agent uses (the run refuses
   it before the model is called), a pinned Workflow whose Start reads a key
   this event does not hand it, and End exports that cannot be this event's
   decision (the run then blocks the tool, or fails with
   hook_invalid_decision after it). */
export function hook_entry_problems(entry, { siblings = [], scope_duplicates = new Set(), capability, toolSetCapability, workflowCapability } = {}) {
  const problems = [];
  if (!record(entry)) {
    problems.push({ code: "entry_invalid", message: "This entry is not an object; the run refuses the whole pool. Remove it." });
    return problems;
  }
  const supported = enable_supported(capability);
  Object.keys(entry).filter((key) => !HOOK_KEYS.includes(key) && !HOOK_OPTIONAL_KEYS.includes(key)).forEach((key) => {
    problems.push({ code: "unknown_field", setting: key, message: `The runtime does not read “${safe_text(key)}” (a hook has no name or failure policy); the run refuses it. Remove it.` });
  });
  if (has(entry, "enabled")) {
    if (!supported) {
      problems.push({ code: "enabled_unconfirmed", setting: "enabled", message: `On/off is stored as ${safe_text(JSON.stringify(entry.enabled) ?? String(entry.enabled))}, but this runtime has not confirmed it can turn hooks on or off${capability && capability.reason ? ` (${safe_text(capability.reason)})` : ""}. Whether the run accepts it cannot be checked here.` });
    } else if (typeof entry.enabled !== "boolean") {
      problems.push({ code: "enabled_invalid", setting: "enabled", message: `On/off is stored as ${safe_text(JSON.stringify(entry.enabled) ?? String(entry.enabled))}; it must be on or off. Preflight refuses it. Choose one to replace it.` });
    }
  }
  if (!has(entry, "id") || !text_ok(entry.id)) {
    problems.push({ code: "id_invalid", message: "Name this hook: a non-empty id." });
  } else {
    if (siblings.filter((item) => record(item) && item.id === entry.id).length > 1) {
      problems.push({ code: "id_duplicate", message: `Another hook in this pool is also called “${safe_text(entry.id)}”; the run refuses both.` });
    } else if (scope_duplicates.has(entry.id)) {
      problems.push({ code: "id_scope_duplicate", message: `Another pool attached to the same Agent has a hook called “${safe_text(entry.id)}”. Preflight lets this through, but the run refuses it before the model is called.` });
    }
  }
  if (!has(entry, "order")) problems.push({ code: "order_missing", message: "Set the order: a whole number from 0 to 1,000,000; lower runs first." });
  else if (typeof entry.order !== "number" || !Number.isSafeInteger(entry.order) || entry.order < 0 || entry.order > MAX_ORDER) {
    problems.push({ code: "order_invalid", message: "The order must be a whole number from 0 to 1,000,000." });
  }
  if (!has(entry, "event")) problems.push({ code: "event_missing", message: "Choose when it runs: before or after the tool call." });
  else if (!HOOK_EVENTS.includes(entry.event)) problems.push({ code: "event_invalid", message: `“${safe_text(JSON.stringify(entry.event))}” is not an event the runtime knows.` });
  if (!has(entry, "tool_name")) problems.push({ code: "tool_missing", message: "Choose which tool calls it sees: every tool, or one by name." });
  else if (Array.isArray(entry.tool_name)) {
    if (!tool_set_supported(toolSetCapability)) {
      problems.push({ code: "tool_set_unconfirmed", message: `A set of tools is stored, but this runtime has not confirmed it reads one${toolSetCapability && toolSetCapability.reason ? ` (${safe_text(toolSetCapability.reason)})` : ""}. Whether the run accepts it cannot be checked here.` });
    } else {
      problems.push(...tool_set_problems(entry.tool_name));
    }
  } else if (entry.tool_name !== null && !tool_name_ok(entry.tool_name)) problems.push({ code: "tool_invalid", message: "The tool must be named, or every tool." });
  if (!has(entry, "force_approval")) problems.push({ code: "force_missing", message: "Say whether this hook always asks for approval." });
  else if (typeof entry.force_approval !== "boolean") problems.push({ code: "force_invalid", message: "Always ask for approval must be on or off." });
  const pin = hook_pin(entry);
  const own = record(entry.workflow) && has(entry.workflow, "kind");
  let shape = null;
  if (!has(entry, "workflow")) problems.push({ code: "workflow_missing", message: "Pin the published Workflow this hook runs." });
  else if (own) {
    const body = hook_embedded(entry);
    if (!embedded_supported(workflowCapability)) {
      problems.push({ code: "embedded_unconfirmed", message: `This hook stores a Workflow of its own, but this runtime has not confirmed it reads one${workflowCapability && workflowCapability.reason ? ` (${safe_text(workflowCapability.reason)})` : ""}. Whether the run accepts it cannot be checked here.` });
    } else if (body === null) {
      problems.push({ code: "workflow_invalid", message: "The stored Workflow is not exactly {kind: embedded, document}; the run refuses it." });
    } else if (!record(body) || body.kind !== "workflow") {
      problems.push({ code: "embedded_not_workflow", message: "This hook's own graph is not a Workflow; the run refuses it." });
    } else {
      shape = hook_workflow_shape(body);
    }
  } else if (!pin) problems.push({ code: "workflow_invalid", message: "The stored Workflow reference is not exactly {workflow_id, revision_id}, both named; the run refuses it." });
  else {
    const version = cached_workflow_version(pin.workflow_id, pin.revision_id);
    shape = version ? hook_workflow_shape(version.document) : null;
  }
  if (shape && shape.readable && HOOK_EVENTS.includes(entry.event)) {
    const given = EVENT_INPUT_KEYS[entry.event];
    const unread = shape.reads.filter((key) => !given.includes(key));
    if (unread.length) {
      problems.push({ code: "workflow_reads_missing", message: `${own ? "Its own Workflow's" : "The pinned Workflow's"} Start reads ${unread.map((key) => `“${safe_text(key)}”`).join(", ")}, which a ${entry.event.replace(/_/g, " ")} hook is not given; the hook fails when the run gets there.` });
    }
    const fit = decision_fit(entry.event, shape);
    if (fit.known && fit.matches.length === 0) {
      problems.push({ code: "decision_shape", message: `Its End exports ${shape.exports.length ? shape.exports.map((name) => `“${safe_text(name)}”`).join(", ") : "nothing"}, which is not a ${entry.event === "before_tool_call" ? "before" : "after"} decision. Preflight lets it through; when the run gets there it ${entry.event === "before_tool_call" ? "blocks the tool call" : "fails with hook_invalid_decision"}.` });
    }
  }
  return problems;
}

export function hook_pin(entry) {
  const workflow = record(entry) ? entry.workflow : null;
  if (!record(workflow) || Object.keys(workflow).length !== 2) return null;
  const { workflow_id, revision_id } = workflow;
  return text_ok(workflow_id) && text_ok(revision_id) ? { workflow_id, revision_id } : null;
}

/* The pool's own problems: its config and its list. */
export function pool_problems(node, document) {
  const problems = [];
  const config = node && node.config;
  if (record(config)) {
    Object.keys(config).filter((key) => key !== "hooks").forEach((key) => {
      problems.push({ code: "unknown_setting", setting: key, message: `This runtime does not read the pool setting “${safe_text(key)}”; the run refuses it. Remove it.` });
    });
  }
  const list = hooks_list(node);
  if (!Array.isArray(list)) problems.push({ code: "hooks_invalid", message: "The stored hooks are not a list; the run refuses the pool. Start a new list to replace it." });
  else if (list.length === 0) problems.push({ code: "hooks_empty", message: "Add a hook. A pool with none is refused when the run starts." });
  if (document && node && attached_agents(document, node.id).length === 0) {
    problems.push({ code: "not_attached", message: "Attach this pool to an Agent; a pool runs only for the Agent it is attached to." });
  }
  return problems;
}

/* Every hook id a new hook must not take: this pool's, and those of every
   pool attached to an Agent this pool is attached to (the run's admission
   scope, R-HP-02). Not the whole graph: pools on other Agents may reuse ids. */
export function scope_hook_ids(document, pool_id) {
  const ids = new Set();
  const add = (pool) => {
    const list = hooks_list(pool);
    (Array.isArray(list) ? list : []).forEach((entry) => {
      if (record(entry) && typeof entry.id === "string") ids.add(entry.id);
    });
  };
  const own = node_by_id(document, pool_id);
  if (own) add(own);
  attached_agents(document, pool_id).forEach((agent_id) => {
    attach_edges(document).forEach((edge) => {
      const other = edge.source_node_id === agent_id ? edge.target_node_id : edge.target_node_id === agent_id ? edge.source_node_id : null;
      const pool = other !== null ? node_by_id(document, other) : null;
      if (pool && pool.type === "hooks_pool") add(pool);
    });
  });
  return [...ids];
}

/* Removes one pool-level setting the runtime does not read; `hooks` and
   everything else stay as stored (R-HP-03). */
export function without_pool_setting(document, node_id, key) {
  if (key === "hooks" || !record(document) || !Array.isArray(document.nodes)) return document;
  const matches = document.nodes.filter((node) => record(node) && node.id === node_id);
  if (matches.length !== 1 || matches[0].type !== "hooks_pool" || !has(matches[0].config, key)) return document;
  const target = matches[0];
  const config = { ...target.config };
  delete config[key];
  return { ...document, nodes: document.nodes.map((node) => (node === target ? { ...node, config } : node)) };
}

/* The hook ids that appear more than once among all pools attached to one
   Agent this pool is attached to — the run's admission scope. */
export function scope_duplicate_ids(document, pool_id) {
  const duplicated = new Set();
  attached_agents(document, pool_id).forEach((agent_id) => {
    const counts = new Map();
    const seen = new Set();
    attach_edges(document).forEach((edge) => {
      const other = edge.source_node_id === agent_id ? edge.target_node_id : edge.target_node_id === agent_id ? edge.source_node_id : null;
      const pool = other !== null ? node_by_id(document, other) : null;
      if (!pool || pool.type !== "hooks_pool" || seen.has(pool.id)) return;
      seen.add(pool.id);
      const list = hooks_list(pool);
      /* Only hooks that run: the run checks ids after leaving off hooks out. */
      (Array.isArray(list) ? list : []).forEach((entry) => {
        if (record(entry) && typeof entry.id === "string" && hook_runs(entry)) counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
      });
    });
    counts.forEach((count, id) => { if (count > 1) duplicated.add(id); });
  });
  return duplicated;
}
