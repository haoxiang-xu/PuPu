import { node_bindings, with_node_bindings } from "./skeleton_document";

/* The Skill Read node's configuration (#352).
 *
 * Mirrors the fixed installed runtime, measured before it was written
 * (steps-352/probe/skill-read-store-01, skill-identity-01):
 *
 *   config.skill  CLOSED {source, source_id, name}, each non-empty text — the
 *                 exact identity the runtime's reader matches; a user skill's
 *                 source_id is the absolute path of its SKILL.md
 *   inputs        none: the runtime refuses any resolved input, although
 *                 preflight lets a stored input row through
 *
 * The identity is copied from the skill list the sidecar returns and is never
 * composed here; the content is read by the runtime when the run reaches the
 * node, so nothing about it is stored. */

const IDENTITY_KEYS = ["source", "source_id", "name"];
const SETTING_KEYS = ["execution", "skill"];

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const text = (value) => typeof value === "string" && value !== "";

/* Exactly the three parts, each non-empty text: what the runtime reads. A
   stored identity that is not this is refused by preflight at its own field
   and is shown and replaced, never matched (R-352-03). */
export function exact_identity(value) {
  return record(value) && Object.keys(value).length === IDENTITY_KEYS.length && IDENTITY_KEYS.every((key) => text(value[key]));
}

/* The sidecar's `pupu.skill_inventory.v1` answer, as one row per skill. A
   reply that is not exactly that is refused rather than listed in part. */
export function read_skill_inventory(payload) {
  const refuse = () => { throw new Error("The skill list could not be read."); };
  if (!record(payload) || payload.schema !== "pupu.skill_inventory.v1" || !Array.isArray(payload.skills)) return refuse();
  const seen = new Set();
  return payload.skills.map((skill) => {
    if (!record(skill) || !IDENTITY_KEYS.every((key) => text(skill[key]))) return refuse();
    const key = JSON.stringify(IDENTITY_KEYS.map((part) => skill[part]));
    if (seen.has(key)) return refuse();
    seen.add(key);
    if (own(skill, "description") && typeof skill.description !== "string") return refuse();
    return {
      identity: { source: skill.source, source_id: skill.source_id, name: skill.name },
      description: typeof skill.description === "string" ? skill.description : "",
    };
  });
}

export function skill_identity(node) {
  const config = node && node.config;
  return own(config, "skill") && record(config.skill) ? config.skill : null;
}

export function same_identity(a, b) {
  return record(a) && record(b) && IDENTITY_KEYS.every((key) => a[key] === b[key]);
}

function only_node(document, node_id) {
  if (!record(document) || !Array.isArray(document.nodes)) return null;
  const matches = document.nodes.filter((node) => record(node) && node.id === node_id);
  return matches.length === 1 && matches[0].type === "skill_read" && record(matches[0].config) ? matches[0] : null;
}

/* Writes exactly the three identity parts on exactly one Skill Read node; the
   rest of its config is kept. Anything else answers with the document. */
export function with_skill(document, node_id, identity) {
  const target = only_node(document, node_id);
  if (!target || !record(identity) || !IDENTITY_KEYS.every((key) => text(identity[key]))) return document;
  const skill = Object.fromEntries(IDENTITY_KEYS.map((key) => [key, identity[key]]));
  return {
    ...document,
    nodes: document.nodes.map((node) => (node === target ? { ...node, config: { ...node.config, skill } } : node)),
  };
}

/* The runtime refuses a Skill Read with inputs, so stored rows are shown and
   can be removed here — all at once, since none of them can be kept. */
export function without_inputs(document, node_id) {
  const target = only_node(document, node_id);
  if (!target || node_bindings(target).length === 0) return document;
  return with_node_bindings(document, node_id, []);
}

/* `rows` is the skill list when it was read, or null when it was not; an
   identity is only reported as not listed against a list that was read. */
export function skill_read_problems(node, rows) {
  const identity = skill_identity(node);
  if (!identity) return [{ code: "skill_missing", message: "Pick the skill this step reads." }];
  const problems = [];
  if (!exact_identity(identity)) {
    problems.push({ code: "skill_incomplete", message: "The stored skill is not one the runtime can identify. Pick it again." });
  } else if (Array.isArray(rows) && !rows.some((row) => same_identity(row.identity, identity))) {
    problems.push({ code: "skill_not_listed", message: `“${identity.name}” is not in the skill list now; the run would fail to read it.` });
  }
  if (node_bindings(node).length > 0) {
    problems.push({ code: "inputs_present", message: "A Skill Read takes no inputs; the runtime refuses a step that has them." });
  }
  Object.keys(node.config).filter((key) => !SETTING_KEYS.includes(key)).forEach((key) => {
    problems.push({ code: "unknown_setting", setting: key, message: `This runtime does not read the setting “${key}”.` });
  });
  return problems;
}

const SOURCE_LABELS = {
  "user-unchain": "your skills (~/.unchain)",
  "user-agents": "your skills (~/.agents)",
  skillpack: "skill pack",
};

/* The store keeps any JSON shape at skill.source and the canvas draws it
   before the author can repair it (R-352-02), so only text is ever looked up
   or shown; anything else is never coerced into a key or a label. */
export function source_label(source) {
  if (!text(source)) return "an unreadable source";
  return Object.prototype.hasOwnProperty.call(SOURCE_LABELS, source) ? SOURCE_LABELS[source] : source;
}
