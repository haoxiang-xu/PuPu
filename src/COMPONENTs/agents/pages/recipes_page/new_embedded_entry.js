/* global globalThis */
import { new_agent_document } from "./skeleton_graph_edits";
import { free_entry_id, free_entry_name, new_subagent_entry } from "./subagent_pool_config";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const refused = () => ({ ok: false, entry: null, problem: "Could not create this Agent. No entry was added; please try again." });

/* A graph id belongs to the whole visible resource closure, whereas an entry
   id belongs only to its pool. Walk iteratively so an unfinished deep graph
   cannot take down the editor while it is trying to add a repairable draft. */
function graph_ids(root) {
  const ids = new Set();
  const seen = new WeakSet();
  const pending = [root];
  while (pending.length) {
    const document = pending.pop();
    if (!record(document) || seen.has(document)) continue;
    seen.add(document);
    if (typeof document.id === "string") ids.add(document.id);
    for (const node of Array.isArray(document.nodes) ? document.nodes : []) {
      if (!record(node) || node.type !== "subagent_pool" || !record(node.config)) continue;
      for (const entry of Array.isArray(node.config.subagents) ? node.config.subagents : []) {
        if (record(entry) && record(entry.source) && entry.source.kind === "embedded") pending.push(entry.source.document);
      }
    }
  }
  return ids;
}

/* Only identity is generated. No parent model, prompt, schema or credential is
   inherited. This unfinished graph is edited with the ordinary Open action
   and saved as part of the resource that owns it. */
export function new_embedded_entry({ rootDocument, entries, randomBytes = (bytes) => globalThis.crypto.getRandomValues(bytes) }) {
  if (!record(rootDocument) || rootDocument.kind !== "agent" || rootDocument.schema_version !== 1 || !Array.isArray(entries)) return refused();
  const occupied = graph_ids(rootDocument);
  let graphId;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const bytes = new Uint8Array(16);
      randomBytes(bytes);
      const candidate = `embedded-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      if (!occupied.has(candidate)) { graphId = candidate; break; }
    }
  } catch (_error) { return refused(); }
  if (!graphId) return refused();
  const id = free_entry_id(entries.filter(record).map((entry) => entry.id).filter((value) => typeof value === "string"));
  const name = free_entry_name(entries.filter(record).map((entry) => entry.name).filter((value) => typeof value === "string"), "New Agent");
  const seed = new_agent_document({ id: graphId, name });
  if (!seed.ok) return refused();
  const entry = { ...new_subagent_entry({ id, name }), source: { kind: "embedded", document: seed.document } };
  return { ok: true, entry, problem: null };
}
