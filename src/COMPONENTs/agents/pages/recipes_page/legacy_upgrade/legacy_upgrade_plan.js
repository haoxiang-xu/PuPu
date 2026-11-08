/* The author's side of an explicit legacy Agent upgrade (#473 CP2).
 *
 * The host owns every rule about what a legacy definition becomes: its
 * read-only inventory names what needs an author decision, its preview is the
 * exact native document that decision produces, and its apply is a
 * compare-and-set against the token the author read. This module only
 * translates between those three and a form: which requirement asks for which
 * kind of choice, at which address, and what a complete set of answers looks
 * like as the closed `choices.v1` object. It invents no default: a Kernel is
 * chosen by the author, a toolkit allowlist is carried exactly (null and []
 * are different answers), an acknowledgement is ticked by hand, and anything
 * this module does not understand is left for the host's preview to refuse,
 * whose refusal then becomes a row here. */

export const REQUEST_SCHEMA = "pupu.skeleton-legacy-upgrade.request.v1";
export const CHOICES_SCHEMA = "pupu.skeleton-legacy-upgrade.choices.v1";
export const POLICIES = Object.freeze(["preserve", "replace"]);
export const ACK_CODES = Object.freeze(["legacy_setting_ignored", "legacy_prompt_review_required"]);
export const REFERENCE_SCOPES = Object.freeze(["user:agent_recipes", "user:subagents"]);

const is_object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const is_index = (value) => Number.isSafeInteger(value) && value >= 0;
const is_segment = (value) => (typeof value === "string" && value.length > 0) || is_index(value);
export const is_path = (value) => Array.isArray(value) && value.length > 0 && value.length <= 64 && value.every(is_segment);
export const path_key = (path) => JSON.stringify(path);

/* A stored first-hop draft still carries its provenance under `legacy_*`
   config keys; the host's preview strips every one of them, so their presence
   is exactly "this Agent has not been explicitly upgraded yet". */
export function is_legacy_upgrade_candidate(document) {
  if (!is_object(document) || document.kind !== "agent" || !Array.isArray(document.nodes)) return false;
  return document.nodes.some((node) => is_object(node) && is_object(node.config)
    && Object.keys(node.config).some((key) => key.startsWith("legacy_")));
}

/* Reading a value at a document-relative address, without touching
   prototypes: a path segment is data the store accepted, and `constructor`
   is a key it accepts. */
export function read_at(document, path) {
  if (!is_path(path)) return undefined;
  let value = document;
  for (const segment of path) {
    if (Array.isArray(value)) {
      if (!is_index(segment) || segment >= value.length) return undefined;
      value = value[segment];
    } else if (is_object(value)) {
      if (typeof segment !== "string" || !Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
      value = value[segment];
    } else return undefined;
  }
  return value;
}

export function node_index_of(path) {
  return is_path(path) && path[0] === "nodes" && is_index(path[1]) ? path[1] : null;
}

/* The address a toolkit choice is keyed by: the toolkit row itself, which is
   the last integer segment of a requirement path under `toolkits`. */
function toolkit_row_address(path) {
  if (!is_path(path)) return null;
  for (let end = path.length; end >= 2; end -= 1) {
    const prefix = path.slice(0, end);
    if (is_index(prefix[prefix.length - 1]) && prefix[prefix.length - 2] === "toolkits") return prefix;
  }
  return null;
}

/* What the host's inventory asks for, grouped by the choice that answers it.
 * Everything else the inventory reports is kept as an informational row —
 * shown, never answered here, because the host either converts it on its own
 * (pool conversion, generated root pools) or refuses it at preview with an
 * exact code and path, which `slots_for_refusal` turns into a row then. */
export function slots_for_inventory(requirements) {
  const slots = [];
  const info = [];
  for (const row of Array.isArray(requirements) ? requirements : []) {
    if (!is_object(row) || typeof row.code !== "string" || !is_path(row.path)) continue;
    const entry = { code: row.code, path: row.path, message: typeof row.message === "string" ? row.message : "" };
    switch (row.code) {
      case "kernel_required": {
        const address = row.path.slice(0, -2);
        if (row.path[row.path.length - 2] === "config" && row.path[row.path.length - 1] === "kernel" && is_path(address)) {
          slots.push(kernel_slot(address, [entry]));
        } else info.push(entry);
        break;
      }
      case "tool_selection_required":
      case "toolkit_config_review_required": {
        const address = toolkit_row_address(row.path);
        if (address) slots.push(toolkit_slot(address, [entry]));
        else info.push(entry);
        break;
      }
      case "legacy_prompt_review_required":
        slots.push(ack_slot("legacy_prompt_review_required", row.path, [entry]));
        break;
      default:
        info.push(entry);
    }
  }
  return { slots: merge_slots([], slots), info };
}

function kernel_slot(address, requirements) {
  return { kind: "kernel", key: `kernel:${path_key(address)}`, address, requirements };
}
function toolkit_slot(address, requirements) {
  return { kind: "toolkit", key: `toolkit:${path_key(address)}`, address, requirements };
}
function ack_slot(code, path, requirements) {
  return { kind: "acknowledge", code, key: `ack:${code}:${path_key(path)}`, address: path, requirements };
}
function reference_slot(address, requirements) {
  return { kind: "reference", key: `reference:${path_key(address)}`, address, requirements };
}

/* Two rows about one address are one slot with both reasons. */
export function merge_slots(existing, added) {
  const by_key = new Map((existing || []).map((slot) => [slot.key, { ...slot, requirements: [...slot.requirements] }]));
  for (const slot of added || []) {
    const current = by_key.get(slot.key);
    if (!current) { by_key.set(slot.key, { ...slot, requirements: [...slot.requirements] }); continue; }
    for (const requirement of slot.requirements) {
      if (!current.requirements.some((row) => row.code === requirement.code && path_key(row.path) === path_key(requirement.path))) {
        current.requirements.push(requirement);
      }
    }
  }
  return [...by_key.values()];
}

/* What a refusal from preview or apply means for the form.
 *
 * `slots` are new rows the author can answer; `drop` is a choice category the
 * host says does not address anything (so the stale answers of that category
 * go); `blocking` is a refusal no answer here can resolve — a missing scoped
 * alias, an unsupported mixed graph, a malformed provenance — which is shown
 * with the host's exact words and leaves apply unavailable. */
export function slots_for_refusal(error) {
  const code = is_object(error) && typeof error.code === "string" ? error.code : "";
  const path = is_object(error) && is_path(error.path) ? error.path : null;
  const message = is_object(error) && typeof error.message === "string" ? error.message : "";
  const entry = { code, path: path || [], message };
  switch (code) {
    case "kernel_choice_required":
      return path ? { slots: [kernel_slot(path, [entry])], drop: null, blocking: false, entry } : blocking(entry);
    case "toolkit_choice_required":
    case "toolkit_config_review_required":
      return path ? { slots: [toolkit_slot(path, [entry])], drop: null, blocking: false, entry } : blocking(entry);
    case "legacy_prompt_review_required":
    case "legacy_setting_ignored":
      return path ? { slots: [ack_slot(code, path, [entry])], drop: null, blocking: false, entry } : blocking(entry);
    case "ambiguous_reference":
      return path ? { slots: [reference_slot(path, [entry])], drop: null, blocking: false, entry } : blocking(entry);
    case "unused_choice":
      return { slots: [], drop: path && path[0] === "choices" && typeof path[1] === "string" ? path[1] : "all", blocking: false, entry };
    default:
      return blocking(entry);
  }
}
const blocking = (entry) => ({ slots: [], drop: null, blocking: true, entry });

/* The legacy toolkit row a toolkit slot is about, read from the document the
   inventory described, so the form can prefill the identity the old row
   carried and say which of its settings the host will not carry. */
export function legacy_toolkit_row(document, address) {
  const raw = read_at(document, address);
  if (!is_object(raw)) return { id: "", has_allowlist: false, enabled_tools: null, unsupported: [] };
  const unsupported = Object.keys(raw).filter((key) => !["id", "enabled_tools", "config"].includes(key));
  if (Object.prototype.hasOwnProperty.call(raw, "config") && !(is_object(raw.config) && Object.keys(raw.config).length === 0)) unsupported.push("config");
  const has_allowlist = Object.prototype.hasOwnProperty.call(raw, "enabled_tools");
  const enabled = raw.enabled_tools;
  const valid = enabled === null || (Array.isArray(enabled) && enabled.every((name) => typeof name === "string" && name.trim().length > 0) && new Set(enabled).size === enabled.length);
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    has_allowlist,
    enabled_tools: has_allowlist && valid ? (enabled === null ? null : [...enabled]) : null,
    allowlist_valid: has_allowlist && valid,
    unsupported,
  };
}

export const complete_kernel_answer = (answer, configured) =>
  is_object(answer) && is_object(answer.kernel) && configured(answer.kernel)
  && POLICIES.includes(answer.model_policy) && POLICIES.includes(answer.prompt_policy) && answer.accept_projection === true;

const names_ok = (value) => value === null || (Array.isArray(value) && value.every((name) => typeof name === "string" && name.length > 0 && name.trim() === name) && new Set(value).size === value.length);

export function complete_answer(slot, answer, configured) {
  if (!is_object(answer)) return false;
  switch (slot.kind) {
    case "kernel": return complete_kernel_answer(answer, configured);
    case "toolkit": return typeof answer.toolkit_id === "string" && answer.toolkit_id.length > 0 && answer.toolkit_id.trim() === answer.toolkit_id
      && names_ok(answer.enabled_tools) && typeof answer.discard_unsupported === "boolean";
    case "acknowledge": return answer.acknowledged === true;
    case "reference": return typeof answer.source_scope === "string" && answer.source_scope.length > 0 && typeof answer.agent_id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(answer.agent_id);
    default: return false;
  }
}

/* The closed choice request, or the slots still waiting for an answer.
   Addresses come out of the slots, never from the answers, so an answer can
   only ever speak about the requirement it was given for. */
export function build_choices(slots, answers, configured) {
  const missing = [];
  const choices = { schema: CHOICES_SCHEMA, kernels: [], toolkits: [], references: [], acknowledged: [] };
  for (const slot of slots) {
    const answer = Object.prototype.hasOwnProperty.call(answers, slot.key) ? answers[slot.key] : undefined;
    if (!complete_answer(slot, answer, configured)) { missing.push(slot.key); continue; }
    if (slot.kind === "kernel") choices.kernels.push({ path: [...slot.address], kernel: clone(answer.kernel), model_policy: answer.model_policy, prompt_policy: answer.prompt_policy, accept_projection: true });
    else if (slot.kind === "toolkit") choices.toolkits.push({ path: [...slot.address], toolkit_id: answer.toolkit_id, enabled_tools: answer.enabled_tools === null ? null : [...answer.enabled_tools], discard_unsupported: answer.discard_unsupported });
    else if (slot.kind === "reference") choices.references.push({ path: [...slot.address], source_scope: answer.source_scope, agent_id: answer.agent_id });
    // Inventory can request local review without requiring a wire choice.
    // Completeness above still requires the author to check that review.
    else if (slot.kind === "acknowledge" && slot.send_to_host !== false) choices.acknowledged.push({ path: [...slot.address], code: slot.code });
  }
  return missing.length === 0 ? { ok: true, choices, missing } : { ok: false, choices: null, missing };
}

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/* Value equality of JSON data: object key order does not matter, array order
   and every string/number/boolean does. Used to compare the document the
   author reviewed with the one the host says it saved. */
export function json_equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => json_equal(item, b[index]));
  }
  if (is_object(a) && is_object(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && json_equal(a[key], b[key]));
  }
  return false;
}

/* A short human address for a requirement: the node it sits on and the rest
   of the path, read from the document the inventory described. */
export function describe_path(document, path) {
  const index = node_index_of(path);
  const node = index === null || !is_object(document) || !Array.isArray(document.nodes) ? null : document.nodes[index];
  const title = is_object(node)
    ? (typeof node.label === "string" && node.label.trim() ? node.label.trim() : typeof node.id === "string" ? node.id : `node ${index}`)
    : null;
  const rest = index === null ? path : path.slice(2);
  const tail = rest.filter((segment) => segment !== "config").map(String).join(" › ");
  return title ? (tail ? `${title} › ${tail}` : title) : path.map(String).join(" › ");
}
